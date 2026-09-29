import OpenAI from 'openai';
import { utils } from '@ganju/utils';
import type {
  LlmAdapter,
  LlmAdapterInput,
  LlmCompletion,
  LlmMessage,
  LlmStopReason,
  LlmToolCall
} from './types';

const toOpenAiMessages = (
  systemPrompt: string | null | undefined,
  messages: LlmMessage[]
): OpenAI.Chat.ChatCompletionMessageParam[] => {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    result.push({
      role: utils.constants.ROLE_MESSAGE_SYSTEM,
      content: systemPrompt
    });
  }

  for (const msg of messages) {
    if (
      msg.role === utils.constants.ROLE_MESSAGE_ASSISTANT &&
      msg.toolCalls?.length
    ) {
      result.push({
        role: utils.constants.ROLE_MESSAGE_ASSISTANT,
        content: msg.content || null,
        tool_calls: msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments)
          }
        }))
      });
      continue;
    }

    if (msg.role === utils.constants.ROLE_MESSAGE_TOOL) {
      result.push({
        role: utils.constants.ROLE_MESSAGE_TOOL,
        content: msg.content,
        tool_call_id: msg.toolCallId || ''
      });
      continue;
    }

    if (msg.role === utils.constants.ROLE_MESSAGE_ASSISTANT) {
      result.push({
        role: utils.constants.ROLE_MESSAGE_ASSISTANT,
        content: msg.content
      });
      continue;
    }

    if (msg.role === utils.constants.ROLE_MESSAGE_SYSTEM) {
      result.push({
        role: utils.constants.ROLE_MESSAGE_SYSTEM,
        content: msg.content
      });
      continue;
    }

    result.push({
      role: utils.constants.ROLE_MESSAGE_USER,
      content: msg.content
    });
  }

  return result;
};

const mapFinishReason = (reason: string | null | undefined): LlmStopReason => {
  if (reason === 'tool_calls') return 'tool_use';
  if (reason === 'length') return 'max_tokens';
  return 'end_turn';
};

export const openAiAdapter: LlmAdapter = {
  complete: async (input: LlmAdapterInput): Promise<LlmCompletion> => {
    const client = new OpenAI({
      apiKey: input.apiKey,
      baseURL: input.baseUrl || undefined
    });

    const tools: OpenAI.Chat.ChatCompletionTool[] | undefined =
      input.tools.length > 0
        ? input.tools.map(tool => ({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema as Record<string, unknown>
            }
          }))
        : undefined;

    const response = await client.chat.completions.create({
      model: input.model,
      messages: toOpenAiMessages(input.systemPrompt, input.messages),
      ...(tools ? { tools } : {}),
      ...(tools && input.toolChoice === 'none'
        ? { tool_choice: 'none' as const }
        : {}),
      ...(input.config || {})
    });

    const choice = response.choices[0];
    const message = choice?.message;

    const toolCalls: LlmToolCall[] = [];
    if (message?.tool_calls) {
      for (const tc of message.tool_calls) {
        if (tc.type !== 'function') continue;
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments
            ? JSON.parse(tc.function.arguments)
            : {}
        });
      }
    }

    return {
      assistant: {
        content: message?.content || '',
        toolCalls
      },
      usage: {
        tokensIn: response.usage?.prompt_tokens,
        tokensOut: response.usage?.completion_tokens
      },
      stopReason: mapFinishReason(choice?.finish_reason)
    };
  }
};
