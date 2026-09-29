import Anthropic from '@anthropic-ai/sdk';
import { utils } from '@ganju/utils';
import type {
  LlmAdapter,
  LlmAdapterInput,
  LlmCompletion,
  LlmMessage,
  LlmStopReason,
  LlmToolCall
} from './types';

const toAnthropicMessages = (
  messages: LlmMessage[]
): Anthropic.MessageParam[] => {
  const result: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === utils.constants.ROLE_MESSAGE_SYSTEM) continue;

    if (msg.role === utils.constants.ROLE_MESSAGE_ASSISTANT) {
      const content: Anthropic.ContentBlockParam[] = [];
      if (msg.content) content.push({ type: 'text', text: msg.content });
      if (msg.toolCalls?.length) {
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments
          });
        }
      }
      result.push({ role: utils.constants.ROLE_MESSAGE_ASSISTANT, content });
      continue;
    }

    if (msg.role === utils.constants.ROLE_MESSAGE_TOOL) {
      const block: Anthropic.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: msg.toolCallId || '',
        content: msg.content
      };
      const last = result[result.length - 1];
      if (
        last &&
        last.role === utils.constants.ROLE_MESSAGE_USER &&
        Array.isArray(last.content)
      ) {
        last.content.push(block);
      } else {
        result.push({
          role: utils.constants.ROLE_MESSAGE_USER,
          content: [block]
        });
      }
      continue;
    }

    result.push({
      role: utils.constants.ROLE_MESSAGE_USER,
      content: [{ type: 'text', text: msg.content }]
    });
  }

  return result;
};

const mapStopReason = (reason: string | null | undefined): LlmStopReason => {
  if (reason === 'tool_use') return 'tool_use';
  if (reason === 'max_tokens') return 'max_tokens';
  return 'end_turn';
};

export const anthropicAdapter: LlmAdapter = {
  complete: async (input: LlmAdapterInput): Promise<LlmCompletion> => {
    const client = new Anthropic({
      apiKey: input.apiKey,
      baseURL: input.baseUrl || undefined
    });

    const config = (input.config || {}) as Record<string, unknown>;
    const maxTokens =
      typeof config.max_tokens === 'number'
        ? config.max_tokens
        : utils.constants.DEFAULT_MAX_TOKENS;
    const { max_tokens: _max, ...restConfig } = config;

    const tools: Anthropic.ToolUnion[] | undefined =
      input.tools.length > 0
        ? input.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema as Anthropic.Tool.InputSchema
          }))
        : undefined;

    const response = await client.messages.create({
      model: input.model,
      max_tokens: maxTokens,
      messages: toAnthropicMessages(input.messages),
      ...(input.systemPrompt ? { system: input.systemPrompt } : {}),
      ...(tools ? { tools } : {}),
      ...(tools && input.toolChoice === 'none'
        ? { tool_choice: { type: 'none' as const } }
        : {}),
      ...restConfig
    });

    let text = '';
    const toolCalls: LlmToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: (block.input as Record<string, unknown>) || {}
        });
      }
    }

    return {
      assistant: { content: text, toolCalls },
      usage: {
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens
      },
      stopReason: mapStopReason(response.stop_reason)
    };
  }
};
