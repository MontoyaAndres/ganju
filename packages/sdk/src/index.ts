import * as constants from '@ganju/utils/sdkConstants';

import { createContext } from './context';
import type { ToolContext, ToolEnv, ToolHandler } from './types';

/**
 * Identity function that types one tool handler.
 *
 * It exists for inference, not behaviour: written as a bare `async (input, ctx)
 * => …` a handler's parameters are implicitly `any`, and the point of the SDK is
 * that `ctx` autocompletes.
 */
export const defineTool = <Input = Record<string, unknown>, Output = unknown>(
  handler: ToolHandler<Input, Output>
): ToolHandler<Input, Output> => handler;

/**
 * Compose named tools into the module's default export.
 *
 * One script serves every tool an artifact declares, so the dispatcher sends the
 * tool name in the body and this routes on it. The keys here MUST match the
 * names in the version's manifest — publish refuses a bundle whose exports and
 * manifest disagree, which is what the health probe below is for.
 *
 *   export default createHandler({
 *     'lookup-order': defineTool(async (input, ctx) => { … })
 *   });
 */
export const createHandler = (
  tools: Record<string, ToolHandler<never, unknown>>
) => ({
  async fetch(request: Request, env: ToolEnv): Promise<Response> {
    if (request.method !== 'POST') {
      return json({ error: 'This endpoint only accepts POST' }, 405);
    }

    let body: { tool?: unknown; input?: unknown };
    try {
      body = (await request.json()) as { tool?: unknown; input?: unknown };
    } catch {
      return json({ error: 'The request body is not valid JSON' });
    }

    const name = typeof body.tool === 'string' ? body.tool : '';

    // Answered before any user code runs and without touching the broker: the
    // publish pipeline calls it against a freshly uploaded script to check that
    // what the bundle exports matches what the manifest declares.
    //
    // `version` is what the edition answering says it is — the digest of the
    // bytes it was uploaded from. Uploading a script and dispatching to the same
    // name immediately afterwards can still reach the previous edition, and
    // comparing tool names cannot notice that when a deploy renames nothing — so
    // the marker travels with the script and publish waits for its own.
    if (name === constants.CUSTOM_CODE_HEALTH_TOOL) {
      return json({
        output: {
          tools: Object.keys(tools),
          version: env[constants.CUSTOM_CODE_BINDING_VERSION] ?? null
        },
        logs: []
      });
    }

    const handler = tools[name];
    if (!handler) {
      return json({
        error: `This script does not export a tool named "${name}".`
      });
    }

    const { ctx, logs } = createContext(env);
    const input =
      body.input && typeof body.input === 'object'
        ? (body.input as Record<string, unknown>)
        : {};

    try {
      const output = await handler(input as never, ctx);
      return json({ output, logs });
    } catch (error) {
      // A thrown handler is a HANDLED failure as far as the platform is
      // concerned, so it comes back as a 200 with an `error` field. A non-2xx
      // from a dispatched script means something else entirely — the runtime
      // refused to run it — and the dispatcher reports the two differently.
      return json({
        error: error instanceof Error ? error.message : String(error),
        logs
      });
    }
  }
});

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

export type { ToolContext, ToolEnv, ToolHandler };
export type {
  Connection,
  CreateResourceOptions,
  CreatedResource,
  DeletedResource,
  DeleteResourceOptions,
  ResourceContent,
  ResourceMatch,
  ResourceSummary,
  SendFileOptions,
  SendFileTarget,
  SendFileGmail,
  SendFileOutlook,
  SendFileSlack,
  SendFileReceipt
} from './types';
