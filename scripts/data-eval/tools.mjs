// The data tools as the model sees them: the real definitions from
// packages/utils (dataTools.ts), the ones the MCP server registers, built for
// the eval's database and session. Iterating on a description means changing
// it there, and this eval measures what ships.
import { callerFor, dataToolDefinitions } from './compiler.mjs';

export const toolDefinitions = (state, actor) =>
  dataToolDefinitions(state.schema, callerFor(state, actor)).map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));
