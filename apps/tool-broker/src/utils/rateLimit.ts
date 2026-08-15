import type { Bindings } from '../types';

// Per-artifact_tool budget for broker calls, sharing the limiter apps/mcp uses
// for proxied tool calls (60 req / 60s). Deliberately the same key space: a
// single tool call that fans out into fifty connection lookups is the same kind
// of runaway as a model calling one endpoint fifty times, and the artifact
// should not get a second budget just because the loop is inside user code.
//
// Returns true (allow) when the binding is absent (local dev) or errors, so a
// limiter hiccup never breaks a legitimate tool call.
export const allowBrokerCall = async (
  env: Bindings,
  artifactToolId: string
): Promise<boolean> => {
  const limiter = env.HTTP_ENDPOINT_RATE_LIMITER;
  if (!limiter) return true;
  try {
    const { success } = await limiter.limit({ key: artifactToolId });
    return success;
  } catch {
    return true;
  }
};
