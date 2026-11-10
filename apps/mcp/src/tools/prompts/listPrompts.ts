import { utils } from '@ganju/utils';

import { ToolDefinition } from '../types';

// Frame how a prompt is invoked on the surface the request is coming from. Every
// chat channel (Telegram/Slack/Discord) resolves a prompt the same way — the
// `/command` shown per prompt, with text after it filling the first argument —
// while a direct MCP client uses the prompts/get protocol by `name`.
const howToInvoke = (channelPlatform: string | null): string =>
  channelPlatform
    ? `You are connected through ${channelPlatform === utils.constants.CHANNEL_PLATFORM_TEST ? 'the owner\'s test chat' : channelPlatform}. Invoke a prompt by sending its \`command\` (e.g. \`/summarize\`) as a chat message. Any text typed after the command fills the prompt's first argument; a prompt with a null command can't be triggered from chat.`
    : `This is a direct MCP client. Invoke a prompt through the prompts/get protocol using its \`name\` (most clients surface them in a prompt/command picker). The \`command\` field shows how the same prompt is invoked from a chat channel (Telegram/Slack/Discord).`;

export const listPrompts: ToolDefinition = {
  title: 'List Prompts',
  description:
    'List every prompt/command this MCP server exposes — the ones created in Ganju (source "artifact") and the ones from connected mcp-proxy servers (source "mcp-proxy") — together with how to run them on the current surface. Returns JSON: {surface, howToInvoke, prompts:[{name, title, description, source, command, arguments}]}. `command` is the chat slash command (e.g. `/summarize`, null if not chat-invocable); `arguments` is [{name, description, required}], and text after the command fills the first one. Use this to tell the user which commands exist and exactly how to trigger them.',
  schema: {
    type: 'object',
    properties: {}
  },
  handler: async (_args, context) => {
    const result = {
      surface: context.channelPlatform || 'mcp-client',
      howToInvoke: howToInvoke(context.channelPlatform),
      prompts: context.prompts.map(p => ({
        name: p.name,
        title: p.title,
        description: p.description || undefined,
        source: p.source,
        command: p.command,
        arguments: p.arguments
      }))
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result) }]
    };
  }
};
