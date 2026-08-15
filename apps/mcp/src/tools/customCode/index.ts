import { CustomCodeToolConfig, utils } from '@ganju/utils';
import type {
  AbortSignal as WorkersAbortSignal,
  DispatchNamespace
} from '@cloudflare/workers-types';

import { ToolDefinition } from '../types';

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const text = (value: string): ToolResult => ({
  content: [{ type: 'text', text: value }]
});

/**
 * Validate one `artifact_tool.config` of definition `custom-code`. Returns null
 * (so the boot loop skips the row) when the shape is malformed. All validation
 * lives in the shared zod schema; this adapts safeParse to a nullable result.
 */
export const parseCustomCodeConfig = (
  raw: unknown
): CustomCodeToolConfig | null => {
  const result = utils.Schema.CUSTOM_CODE_CONFIG.safeParse(raw);
  return result.success ? result.data : null;
};

/**
 * One tool entry from a published version's manifest — the contract half of the
 * version, read from Postgres at boot so `tools/list` never touches the
 * dispatcher.
 */
export interface CustomCodeToolEntry {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

/**
 * Read a version's `tools` column into a usable list, dropping any entry that
 * doesn't satisfy the manifest schema.
 *
 * Skip-and-log rather than throw, matching how proxied tools are handled: the
 * column was validated on the way in, so a bad entry means a hand-edited row or
 * a schema change we didn't migrate — neither of which should take out
 * `tools/list` for the whole artifact.
 */
export const parseCustomCodeTools = (raw: unknown): CustomCodeToolEntry[] => {
  if (!Array.isArray(raw)) return [];
  const parsed: CustomCodeToolEntry[] = [];
  for (const entry of raw) {
    const result = utils.Schema.CUSTOM_CODE_TOOL.safeParse(entry);
    if (!result.success) {
      console.error(
        'Skipping a custom-code tool entry that no longer parses',
        result.error.issues[0]?.message
      );
      continue;
    }
    parsed.push(result.data as CustomCodeToolEntry);
  }
  return parsed;
};

const capBytes = (body: ArrayBuffer, maxBytes: number): string => {
  const truncated = body.byteLength > maxBytes;
  const slice = truncated ? body.slice(0, maxBytes) : body;
  const decoded = new TextDecoder().decode(slice);
  return truncated ? `${decoded}\n…[truncated]` : decoded;
};

/**
 * Run one tool from an artifact's deployed script.
 *
 * The dispatch is by script NAME — `artifact_<id>` — which is why a rename of
 * the user's slug can't break it and why one script serves every tool the
 * artifact declares. The outbound parameters travel with the `.get()` so the
 * outbound worker can screen whatever the script fetches; they are read from the
 * stored config, never from anything the script says.
 *
 * Failures come back as `Error: …` text rather than thrown, per the tool
 * convention — the model gets something actionable instead of a protocol error.
 */
export const executeCustomCodeCall = async (
  dispatcher: DispatchNamespace | undefined,
  config: CustomCodeToolConfig,
  input: {
    artifactId: string;
    toolName: string;
    args: Record<string, unknown>;
  }
): Promise<{ result: ToolResult; logs: string[] }> => {
  if (!dispatcher) {
    return {
      result: text(
        'Error: custom tools are not available on this deployment (no dispatch namespace is bound).'
      ),
      logs: []
    };
  }

  const scriptName = utils.customCodeScriptName(input.artifactId);

  let script;
  try {
    script = dispatcher.get(
      scriptName,
      {},
      {
        outbound: {
          [utils.constants.CUSTOM_CODE_OUTBOUND_PARAM_ARTIFACT_ID]:
            input.artifactId,
          [utils.constants.CUSTOM_CODE_OUTBOUND_PARAM_ALLOWED_HOSTS]:
            JSON.stringify(config.allowedHosts || [])
        }
      }
    );
  } catch {
    // `.get()` throws when no script exists under that name — the state after a
    // version was published and the script later removed out of band.
    return {
      result: text(
        `Error: "${input.toolName}" is not deployed. Publish the tool's code again from the Tools page.`
      ),
      logs: []
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  let response;
  try {
    response = await script.fetch(
      `${utils.constants.CUSTOM_CODE_INVOKE_ORIGIN}${utils.constants.CUSTOM_CODE_INVOKE_PATH}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tool: input.toolName, input: input.args }),
        // One AbortSignal at runtime, two incompatible declarations: the global
        // AbortController is typed against the DOM lib while a dispatched
        // Fetcher takes the Workers one.
        signal: controller.signal as unknown as WorkersAbortSignal
      }
    );
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        result: text(
          `Error: "${input.toolName}" timed out after ${config.timeoutMs}ms.`
        ),
        logs: []
      };
    }
    return {
      result: text(
        `Error: "${input.toolName}" could not be run — ${
          error instanceof Error ? error.message : String(error)
        }`
      ),
      logs: []
    };
  }
  clearTimeout(timer);

  const raw = capBytes(
    await response.arrayBuffer(),
    utils.constants.CUSTOM_CODE_MAX_RESPONSE_BYTES
  );

  if (!response.ok) {
    // A non-2xx here is the platform refusing to run the script (exceeded CPU,
    // threw during startup), not a handled failure — the SDK reports those as a
    // 200 with an `error` field.
    return {
      result: text(
        `Error: "${input.toolName}" failed — HTTP ${response.status}`
      ),
      logs: []
    };
  }

  let parsed;
  try {
    parsed = utils.Schema.CUSTOM_CODE_INVOKE_RESPONSE.safeParse(
      JSON.parse(raw)
    );
  } catch {
    return {
      result: text(
        `Error: "${input.toolName}" returned a response that is not valid JSON.`
      ),
      logs: []
    };
  }

  if (!parsed.success) {
    return {
      result: text(
        `Error: "${input.toolName}" returned an unexpected response shape.`
      ),
      logs: []
    };
  }

  const logs = parsed.data.logs.map(entry =>
    entry.level === 'log' ? entry.message : `[${entry.level}] ${entry.message}`
  );

  if (parsed.data.error) {
    return {
      result: { ...text(`Error: ${parsed.data.error}`), isError: true },
      logs
    };
  }

  const output = parsed.data.output;

  // structuredContent is only meaningful for an object — MCP defines it as a
  // JSON object matching outputSchema. A scalar or array return still reaches
  // the model, as text.
  const structured =
    output && typeof output === 'object' && !Array.isArray(output)
      ? (output as Record<string, unknown>)
      : undefined;

  return {
    result: {
      content: [
        {
          type: 'text',
          text:
            typeof output === 'string'
              ? output
              : JSON.stringify(output ?? null, null, 2)
        }
      ],
      ...(structured ? { structuredContent: structured } : {})
    },
    logs
  };
};

// `custom-code` is never dispatched through the registry: the MCP controller
// registers one derived tool per entry in the active version's manifest at boot
// and handles the call there. This entry exists so toolRegistry.get('custom-code')
// resolves (the boot loop expects every definition key to be present), but a
// direct call is a misconfiguration.
export const customCode: ToolDefinition = {
  title: 'Custom Code',
  description:
    'Internal: parent definition for user-authored tools running on Workers for Platforms. Each tool the published version declares registers as its own named tool.',
  schema: { type: 'object', properties: {} },
  handler: async () =>
    text(
      'Error: custom-code is a parent definition and is not directly callable.'
    )
};
