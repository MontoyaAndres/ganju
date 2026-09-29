export interface LlmToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: LlmToolCall[];
  toolCallId?: string;
}

export interface LlmUsage {
  tokensIn?: number;
  tokensOut?: number;
}

export type LlmStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'error';

export interface LlmCompletion {
  assistant: {
    content: string;
    toolCalls: LlmToolCall[];
  };
  usage: LlmUsage;
  stopReason: LlmStopReason;
}

export interface LlmAdapterInput {
  model: string;
  baseUrl?: string | null;
  apiKey: string;
  systemPrompt?: string | null;
  messages: LlmMessage[];
  tools: LlmToolDefinition[];
  // `none` keeps the tools declared (a history holding tool calls needs them)
  // but lets the model only answer in text. Omitted means the model decides.
  toolChoice?: 'none';
  config?: Record<string, unknown> | null;
}

export interface LlmAdapter {
  complete: (input: LlmAdapterInput) => Promise<LlmCompletion>;
}
