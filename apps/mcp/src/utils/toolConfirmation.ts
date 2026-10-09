import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { lt } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

// When an organization confirms sensitive actions, a channel bot asks in its
// own chat. An MCP client (Claude Desktop, Claude Code, Cursor) runs a chat the
// server can't see, so there the model does the asking: a sensitive call
// without a confirmation doesn't run and returns a token instead; the model
// asks the user yes or no, and on yes calls again with the token. The token is
// signed over this artifact, the tool and the exact arguments, so the second
// call can only run what the user was asked about — and it is spent on use,
// so one yes runs once.
//
// The server never sees the user's words, only the second call: this relies on
// the model asking. It still means no sensitive action happens in one step.
//
// Where the organization doesn't confirm, the same flow still applies to a
// session that has read outside content: from then on, a sensitive call asks.

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

// registerTool's own types are generic over the zod shape; the wrapper only
// passes configs and callbacks through, so it works on this looser view.
type ToolConfig = {
  title?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
  [key: string]: unknown;
};
type ToolCallback = (...args: unknown[]) => unknown;
type RegisterTool = (
  name: string,
  config: ToolConfig,
  cb: ToolCallback
) => unknown;

interface ConfirmationOptions {
  artifactId: string;
  // A server secret; the signing key is derived from it, never used as is.
  secret: string;
  db: ReturnType<typeof db.create>;
  // Whether a call without a confirmation has to ask. Left out, every one
  // does: the organization confirms sensitive actions. Given, only those it
  // answers true for — a session that has read outside content, which may
  // have been written to steer the model into this very call. Handed the
  // call's JSON-RPC id, so a batch can be read in order.
  mustAsk?: (requestId: string | number | undefined) => Promise<boolean>;
  // Called before a flagged result goes back, so the next request already
  // sees the session as having read outside content. Every tool's result is
  // checked, sensitive or not.
  onUntrustedResult?: () => Promise<void>;
}

const TOKEN_VERSION = 'v1';
const ARG = utils.constants.MCP_TOOL_CONFIRMATION_ARG;
// Spent tokens only matter until they expire; a day is ample margin.
const SPENT_RETENTION_MS = 24 * 60 * 60 * 1000;

const text = (value: string): ToolResult => ({
  content: [{ type: 'text', text: value }]
});

type TokenCheck =
  | { ok: true; id: string }
  | { ok: false; reason: 'mismatch' | 'expired' | 'spent' };

const createSigner = (options: ConfirmationOptions) => {
  let key: Promise<string> | null = null;
  const signingKey = () =>
    (key ??= utils.hmacSha256Hex(
      options.secret,
      'ganju:mcp-tool-confirmation'
    ));

  const payload = (
    toolName: string,
    expiresAt: number,
    id: string,
    args: Record<string, unknown>
  ) =>
    [
      TOKEN_VERSION,
      options.artifactId,
      toolName,
      expiresAt,
      id,
      utils.stableJson(args)
    ].join('\n');

  const mint = async (
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> => {
    const id = crypto.randomUUID();
    const expiresAt = Date.now() + utils.constants.MCP_TOOL_CONFIRMATION_TTL_MS;
    const signature = await utils.hmacSha256Hex(
      await signingKey(),
      payload(toolName, expiresAt, id, args)
    );
    return `${TOKEN_VERSION}.${expiresAt}.${id}.${signature}`;
  };

  const check = async (
    token: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<TokenCheck> => {
    const [version, expiresRaw, id, signature] = token.trim().split('.');
    const expiresAt = Number(expiresRaw);
    if (
      version !== TOKEN_VERSION ||
      !id ||
      !signature ||
      !Number.isFinite(expiresAt)
    ) {
      return { ok: false, reason: 'mismatch' };
    }
    // A forged token and a real one for other arguments look the same from
    // here, and both get the same answer: ask about these arguments.
    const expected = await utils.hmacSha256Hex(
      await signingKey(),
      payload(toolName, expiresAt, id, args)
    );
    if (!utils.timingSafeEqual(expected, signature)) {
      return { ok: false, reason: 'mismatch' };
    }
    if (Date.now() > expiresAt) return { ok: false, reason: 'expired' };

    // Spending is the claim: of two calls racing with one token, only the one
    // whose insert lands runs.
    const spent = await options.db
      .insert(db.schema.toolConfirmationUse)
      .values({ id, toolName, artifactId: options.artifactId })
      .onConflictDoNothing()
      .returning({ id: db.schema.toolConfirmationUse.id });
    if (spent.length === 0) return { ok: false, reason: 'spent' };

    await options.db
      .delete(db.schema.toolConfirmationUse)
      .where(
        lt(
          db.schema.toolConfirmationUse.createdAt,
          new Date(Date.now() - SPENT_RETENTION_MS)
        )
      )
      .catch(() => undefined);
    return { ok: true, id };
  };

  return { mint, check };
};

const REASONS: Record<Exclude<TokenCheck, { ok: true }>['reason'], string> = {
  mismatch:
    "That confirmation doesn't match these arguments, so nothing was run. ",
  expired: 'That confirmation has expired, so nothing was run. ',
  spent: 'That confirmation was already used, so nothing was run. '
};

const UNTRUSTED_REASON =
  'This conversation has read content from outside (an email, a web page, ' +
  "another server's answer), so sensitive actions are confirmed first. ";

const notRunYet = (
  name: string,
  title: string,
  args: Record<string, unknown>,
  token: string,
  reason: string
): ToolResult =>
  text(
    [
      `${reason}Not run yet: this action needs the user's yes first.`,
      '',
      'Tell the user what it will do and ask them to answer yes or no:',
      '',
      utils.formatConfirmationSummary([{ name, arguments: args }], () => title),
      '',
      `If they say yes, call ${name} again with exactly these arguments plus "${ARG}": "${token}". ` +
        "If they say no, don't call it. Don't call it again without asking " +
        'them first. The confirmation expires in 10 minutes.'
    ].join('\n')
  );

/**
 * Make every sensitive tool registered on this server from here on wait for a
 * confirmed second call — always, or only when `mustAsk` says so. Call it
 * right after the server is created, before any tool is registered; tools
 * that only read are registered untouched.
 */
export const confirmSensitiveTools = (
  mcpServer: McpServer,
  options: ConfirmationOptions
): void => {
  const signer = createSigner(options);
  const register = mcpServer.registerTool.bind(
    mcpServer
  ) as unknown as RegisterTool;
  // The extra argument every sensitive tool accepts, built the same way as
  // the tools' own fields.
  const confirmationField = utils.jsonSchemaToZodShape({
    type: 'object',
    properties: {
      [ARG]: {
        type: 'string',
        description: options.mustAsk
          ? utils.constants.MCP_TOOL_CONFIRMATION_ARG_DESCRIPTION_CONDITIONAL
          : utils.constants.MCP_TOOL_CONFIRMATION_ARG_DESCRIPTION
      }
    }
  })[ARG];

  const marking = (cb: ToolCallback): ToolCallback =>
    options.onUntrustedResult
      ? async (...args: unknown[]) => {
          const result = await cb(...args);
          if (utils.isUntrustedToolResult(result)) {
            await options.onUntrustedResult?.();
          }
          return result;
        }
      : cb;

  const wrapped: RegisterTool = (name, config, original) => {
    const cb = marking(original);
    if (!utils.isSensitiveTool(config.annotations)) {
      return register(name, config, cb);
    }
    const hadInput = config.inputSchema !== undefined;
    return register(
      name,
      {
        ...config,
        inputSchema: { ...(config.inputSchema ?? {}), [ARG]: confirmationField }
      },
      async (input: unknown, extra: unknown) => {
        const { [ARG]: confirmation, ...args } = (input ?? {}) as Record<
          string,
          unknown
        >;
        let reason = '';
        if (typeof confirmation === 'string' && confirmation.trim()) {
          const verdict = await signer.check(confirmation, name, args);
          if (verdict.ok) {
            // A tool registered without inputs is called with `extra` alone.
            return hadInput ? cb(args, extra) : cb(extra);
          }
          reason = REASONS[verdict.reason];
        } else if (options.mustAsk) {
          const requestId = (extra as { requestId?: string | number } | null)
            ?.requestId;
          if (!(await options.mustAsk(requestId))) {
            return hadInput ? cb(args, extra) : cb(extra);
          }
          reason = UNTRUSTED_REASON;
        }
        return notRunYet(
          name,
          config.title || name,
          args,
          await signer.mint(name, args),
          reason
        );
      }
    );
  };

  (mcpServer as unknown as { registerTool: RegisterTool }).registerTool =
    wrapped;
};
