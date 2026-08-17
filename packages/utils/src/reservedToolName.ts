import { constants } from './constants';

const RESERVED = new Set(constants.RESERVED_TOOL_NAMES);

/**
 * Is this MCP tool name reserved by the platform?
 *
 * Called on the WRITE path only — when a user names an `http-endpoint` tool or
 * uploads a `custom-code` manifest. Deliberately NOT applied when reading a
 * stored row back at boot: tightening this list must never stop an already
 * installed tool from registering, which would be a silent failure the owner
 * could only diagnose from logs. A legacy name that is reserved today keeps
 * working; it simply loses the name to the native tool, because apps/mcp
 * registers natives first.
 *
 * See RESERVED_TOOL_NAME_PREFIXES in constants.ts for why this reserves whole
 * namespaces rather than the enumerated set of shipped keys.
 */
export const isReservedToolName = (name: string): boolean => {
  const lower = name.toLowerCase();
  return (
    RESERVED.has(lower) ||
    constants.RESERVED_TOOL_NAME_PREFIXES.some(prefix =>
      lower.startsWith(prefix)
    )
  );
};
