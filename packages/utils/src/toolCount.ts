// How many tools an install puts in front of a model, which is what the tool
// limit counts. Imports nothing, so node --test runs it directly.

// The same values as constants.TOOL_DEFINITION_KEY_MCP_PROXY and
// TOOL_DEFINITION_KEY_CUSTOM_CODE, written out rather than imported, since
// this file imports nothing.
const MCP_PROXY_TOOL_KEY = 'mcp-proxy';
const CUSTOM_CODE_TOOL_KEY = 'custom-code';

// The tools an allow-list keeps out of `names`. An empty or absent list keeps
// all of them, as the MCP boot loop reads it.
const allowedCount = (names: string[], config: unknown): number => {
  const allowedTools = (config as { allowedTools?: unknown } | null)
    ?.allowedTools;
  if (!Array.isArray(allowedTools) || allowedTools.length === 0) {
    return names.length;
  }
  const allowed = new Set(allowedTools);
  return names.filter(name => allowed.has(name)).length;
};

/**
 * An mcp-proxy row exposes each discovered remote tool its allow-list keeps,
 * so a single GitHub install can be dozens of tools. A custom-code row exposes
 * the functions of its published version the allow-list keeps — pass their
 * names as `customCodeFunctions`; without them the row counts as one. Every
 * other row is one tool.
 */
export const countInstallTools = (
  install: {
    toolKey: string;
    config: unknown;
    metadata: unknown;
  },
  customCodeFunctions?: string[]
): number => {
  if (install.toolKey === CUSTOM_CODE_TOOL_KEY) {
    return customCodeFunctions
      ? allowedCount(customCodeFunctions, install.config)
      : 1;
  }
  if (install.toolKey !== MCP_PROXY_TOOL_KEY) return 1;

  const discovered = (
    install.metadata as { discovery?: { tools?: unknown } } | null
  )?.discovery?.tools;
  if (!Array.isArray(discovered)) return 0;

  const names = discovered
    .map(tool => (tool as { name?: unknown } | null)?.name)
    .filter((name): name is string => typeof name === 'string');
  return allowedCount(names, install.config);
};
