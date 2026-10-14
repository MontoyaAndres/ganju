import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { and, eq, gt, isNotNull, isNull, lt } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

// When an organization confirms sensitive actions, a channel bot asks in its
// own chat. An MCP client (Claude Desktop, Claude Code, Cursor) runs a chat the
// server can't see, so a sensitive call there is held in one of two ways.
//
// Ordinarily, the model is asked to do the asking: a sensitive call without a
// confirmation doesn't run and returns a token instead, with the instruction
// to ask the user and, on yes, call again with the token. The token is signed
// over this artifact, the tool and the exact arguments, so the second call can
// only run the call the first one described — and it is spent on use, so one
// token runs once. This is not a human check: the token goes back to the
// model, and nothing here can tell whether a person said yes or the model
// simply called again. It is defence in depth for a model nobody is steering —
// no sensitive action in one step, the second call pinned to the first one's
// arguments, and the client's own approval prompt (which sees these tools as
// destructive) given two chances to stop it.
//
// Once the session has read outside content (an email, a web page, another
// server's answer), the model may be steered by it, so its say-so is worth
// nothing. Then the yes comes from the person, outside the chat: the first
// call records a pending approval for the signed-in user and returns a link to
// a dashboard page where they approve or deny it. The call runs only when
// retried with that approval's id, after they approved, by the same user, on
// the same artifact, for the same tool and the same arguments, before it
// expires — and once. A connection with no signed-in user has nobody to ask,
// so there such a call doesn't run at all. (MCP elicitation would let the
// client ask instead, but this server is rebuilt on every request and answers
// in plain JSON, so a question sent mid-call has nowhere to arrive.)
//
// The second mode applies whether or not the organization confirms sensitive
// actions; the first only where it does.

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
  // The organization confirms sensitive actions: every sensitive call asks,
  // by token when the session hasn't read outside content.
  confirmAll: boolean;
  // Whether this session has read outside content, which may have been
  // written to steer the model into this very call. Handed the call's
  // JSON-RPC id, so a batch can be read in order.
  readUntrusted: (requestId: string | number | undefined) => Promise<boolean>;
  // The signed-in user who approves calls made after outside content, and
  // the dashboard's origin, where they do. Without either, nobody can.
  userId?: string;
  webUrl?: string;
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

type ApprovalCheck =
  | { ok: true }
  | {
      ok: false;
      reason: 'pending' | 'denied' | 'mismatch' | 'expired' | 'spent';
    };

// Approvals the signed-in user gives on the dashboard, for calls made after
// the session read outside content. Rows past their time are swept as new
// ones are written, a day late so a late retry still gets a reason.
const createApprovals = (
  options: ConfirmationOptions & { userId: string; webUrl: string }
) => {
  const table = db.schema.toolApproval;
  const hashOf = (args: Record<string, unknown>) =>
    utils.sha256Hex(utils.stableJson(args));

  const url = (id: string) =>
    utils.toolApprovalUrl(
      options.webUrl,
      utils.constants.TOOL_APPROVAL_PATH,
      id
    );

  const request = async (
    toolName: string,
    toolTitle: string,
    args: Record<string, unknown>
  ): Promise<string> => {
    const id = crypto.randomUUID();
    await options.db.insert(table).values({
      id,
      artifactId: options.artifactId,
      userId: options.userId,
      toolName,
      toolTitle,
      arguments: args,
      argumentsHash: await hashOf(args),
      expiresAt: new Date(
        Date.now() + utils.constants.MCP_TOOL_CONFIRMATION_TTL_MS
      )
    });
    await options.db
      .delete(table)
      .where(lt(table.expiresAt, new Date(Date.now() - SPENT_RETENTION_MS)))
      .catch(() => undefined);
    return id;
  };

  const check = async (
    id: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ApprovalCheck> => {
    const argumentsHash = await hashOf(args);
    const now = new Date();
    // Spending is the claim, and every condition is part of it: of two calls
    // racing with one approval, only the one whose update lands runs.
    const claimed = await options.db
      .update(table)
      .set({ usedAt: now })
      .where(
        and(
          eq(table.id, id),
          eq(table.artifactId, options.artifactId),
          eq(table.userId, options.userId),
          eq(table.toolName, toolName),
          eq(table.argumentsHash, argumentsHash),
          isNotNull(table.approvedAt),
          isNull(table.deniedAt),
          isNull(table.usedAt),
          gt(table.expiresAt, now)
        )
      )
      .returning({ id: table.id });
    if (claimed.length > 0) return { ok: true };

    // Not runnable; read it back only to say why.
    const [row] = await options.db
      .select()
      .from(table)
      .where(
        and(
          eq(table.id, id),
          eq(table.artifactId, options.artifactId),
          eq(table.userId, options.userId)
        )
      )
      .limit(1);
    if (
      !row ||
      row.toolName !== toolName ||
      row.argumentsHash !== argumentsHash
    ) {
      return { ok: false, reason: 'mismatch' };
    }
    const status = utils.toolApprovalStatus(row, now.getTime());
    return {
      ok: false,
      reason:
        status === 'used'
          ? 'spent'
          : status === 'approved'
            ? // Approved after the claim above was tried: the next retry runs.
              'pending'
            : status
    };
  };

  return { url, request, check };
};

const APPROVAL_REASONS: Record<'mismatch' | 'expired' | 'spent', string> = {
  mismatch:
    "That approval isn't for this action with these arguments, so nothing was run. ",
  expired: 'That approval has expired, so nothing was run. ',
  spent: 'That approval was already used, so nothing was run. '
};

const UNTRUSTED_APPROVAL_REASON =
  'This conversation has read content from outside (an email, a web page, ' +
  "another server's answer), so a sensitive action needs the user's own " +
  'approval, given outside this chat. ';

const awaitingApproval = (
  name: string,
  title: string,
  args: Record<string, unknown>,
  id: string,
  url: string,
  reason: string
): ToolResult =>
  text(
    [
      `${reason}Not run yet.`,
      '',
      'Show the user this link, exactly as it is, and ask them to open it, ' +
        'check the action and approve or deny it there:',
      '',
      url,
      '',
      utils.formatConfirmationSummary([{ name, arguments: args }], () => title),
      '',
      `Once they say they approved it, call ${name} again with exactly these arguments plus "${ARG}": "${id}". ` +
        "If they denied it, don't call it. Saying yes here in the chat " +
        "doesn't approve it; only the page does. The link expires in 10 minutes."
    ].join('\n')
  );

const NO_APPROVER =
  'This conversation has read content from outside (an email, a web page, ' +
  "another server's answer), so a sensitive action needs the user's own " +
  'approval — and this connection has no signed-in user to give it. ' +
  'Nothing was run. Tell the user this action has to be done another way.';

const DENIED =
  'The user denied this action on the approval page, so nothing was run. ' +
  "Don't call it again unless they ask for it anew.";

const REASONS: Record<Exclude<TokenCheck, { ok: true }>['reason'], string> = {
  mismatch:
    "That confirmation doesn't match these arguments, so nothing was run. ",
  expired: 'That confirmation has expired, so nothing was run. ',
  spent: 'That confirmation was already used, so nothing was run. '
};

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
 * confirmed second call: approved by the user on the dashboard once the
 * session has read outside content, else by token where the organization
 * confirms sensitive actions. Call it right after the server is created,
 * before any tool is registered; tools that only read are registered
 * untouched.
 */
export const confirmSensitiveTools = (
  mcpServer: McpServer,
  options: ConfirmationOptions
): void => {
  const signer = createSigner(options);
  const { userId, webUrl } = options;
  const approvals =
    userId && webUrl ? createApprovals({ ...options, userId, webUrl }) : null;
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
        description: options.confirmAll
          ? utils.constants.MCP_TOOL_CONFIRMATION_ARG_DESCRIPTION
          : utils.constants.MCP_TOOL_CONFIRMATION_ARG_DESCRIPTION_CONDITIONAL
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
        // A tool registered without inputs is called with `extra` alone.
        const run = () => (hadInput ? cb(args, extra) : cb(extra));
        const given =
          typeof confirmation === 'string' ? confirmation.trim() : '';
        const title = config.title || name;
        const requestId = (extra as { requestId?: string | number } | null)
          ?.requestId;

        // After outside content only the person's own approval counts — a
        // token the model was handed is refused here, whatever it says.
        if (await options.readUntrusted(requestId)) {
          if (!approvals) return text(NO_APPROVER);
          let reason = UNTRUSTED_APPROVAL_REASON;
          if (given) {
            const verdict = await approvals.check(given, name, args);
            if (verdict.ok) return run();
            if (verdict.reason === 'denied') return text(DENIED);
            if (verdict.reason === 'pending') {
              return awaitingApproval(
                name,
                title,
                args,
                given,
                approvals.url(given),
                "The user hasn't approved this yet. "
              );
            }
            reason = APPROVAL_REASONS[verdict.reason];
          }
          const id = await approvals.request(name, title, args);
          return awaitingApproval(
            name,
            title,
            args,
            id,
            approvals.url(id),
            reason
          );
        }

        if (!options.confirmAll) return run();
        let reason = '';
        if (given) {
          const verdict = await signer.check(given, name, args);
          if (verdict.ok) return run();
          reason = REASONS[verdict.reason];
        }
        return notRunYet(
          name,
          title,
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
