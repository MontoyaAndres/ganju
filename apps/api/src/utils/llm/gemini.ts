import { FunctionCallingConfigMode, GoogleGenAI } from '@google/genai';
import { utils } from '@ganju/utils';
import type {
  LlmAdapter,
  LlmAdapterInput,
  LlmCompletion,
  LlmMessage,
  LlmStopReason,
  LlmToolCall
} from './types';

interface GeminiPart {
  text?: string;
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args: Record<string, unknown> };
  functionResponse?: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

const toGeminiContents = (messages: LlmMessage[]): GeminiContent[] => {
  const toolCallNameById = new Map<string, string>();
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.role === utils.constants.ROLE_MESSAGE_SYSTEM) continue;

    if (msg.role === utils.constants.ROLE_MESSAGE_ASSISTANT) {
      const parts: GeminiPart[] = [];
      if (msg.content) parts.push({ text: msg.content });
      if (msg.toolCalls?.length) {
        for (const tc of msg.toolCalls) {
          toolCallNameById.set(tc.id, tc.name);
          const thoughtSignature =
            typeof tc.metadata?.thoughtSignature === 'string'
              ? (tc.metadata.thoughtSignature as string)
              : undefined;
          parts.push({
            functionCall: { id: tc.id, name: tc.name, args: tc.arguments },
            ...(thoughtSignature ? { thoughtSignature } : {})
          });
        }
      }
      if (parts.length === 0) continue;
      contents.push({ role: 'model', parts });
      continue;
    }

    if (msg.role === utils.constants.ROLE_MESSAGE_TOOL) {
      const id = msg.toolCallId || '';
      const name = toolCallNameById.get(id) || 'tool';
      let parsed: unknown = msg.content;
      try {
        parsed = JSON.parse(msg.content);
      } catch {
        // keep as string
      }
      const response: Record<string, unknown> =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : { result: msg.content };

      const last = contents[contents.length - 1];
      const part: GeminiPart = { functionResponse: { id, name, response } };
      if (last && last.role === 'user') {
        last.parts.push(part);
      } else {
        contents.push({ role: 'user', parts: [part] });
      }
      continue;
    }

    contents.push({ role: 'user', parts: [{ text: msg.content }] });
  }

  return contents;
};

const mapStopReason = (reason: string | null | undefined): LlmStopReason => {
  if (reason === 'MAX_TOKENS') return 'max_tokens';
  return 'end_turn';
};

export const geminiAdapter: LlmAdapter = {
  complete: async (input: LlmAdapterInput): Promise<LlmCompletion> => {
    const ai = new GoogleGenAI({ apiKey: input.apiKey });

    const tools =
      input.tools.length > 0
        ? [
            {
              functionDeclarations: input.tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                parametersJsonSchema: tool.inputSchema
              }))
            }
          ]
        : undefined;

    const response = await ai.models.generateContent({
      model: input.model,
      contents: toGeminiContents(input.messages),
      config: {
        ...(input.systemPrompt
          ? { systemInstruction: input.systemPrompt }
          : {}),
        ...(tools ? { tools } : {}),
        ...(tools && input.toolChoice === 'none'
          ? {
              toolConfig: {
                functionCallingConfig: { mode: FunctionCallingConfigMode.NONE }
              }
            }
          : {}),
        ...(input.config || {})
      }
    });

    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    let text = '';
    const toolCalls: LlmToolCall[] = [];
    let toolCallIndex = 0;

    for (const part of parts) {
      if (typeof part.text === 'string') text += part.text;
      if (part.functionCall) {
        const fc = part.functionCall;
        const thoughtSignature =
          typeof (part as { thoughtSignature?: string }).thoughtSignature ===
          'string'
            ? (part as { thoughtSignature?: string }).thoughtSignature
            : undefined;
        toolCalls.push({
          id: fc.id || `gemini-${Date.now()}-${toolCallIndex++}`,
          name: fc.name || '',
          arguments: (fc.args as Record<string, unknown>) || {},
          ...(thoughtSignature ? { metadata: { thoughtSignature } } : {})
        });
      }
    }

    const usage = response.usageMetadata;

    return {
      assistant: { content: text, toolCalls },
      usage: {
        tokensIn: usage?.promptTokenCount,
        tokensOut: usage?.candidatesTokenCount
      },
      stopReason:
        toolCalls.length > 0
          ? 'tool_use'
          : mapStopReason(candidate?.finishReason)
    };
  }
};
