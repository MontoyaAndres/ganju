import Anthropic from '@anthropic-ai/sdk';

export const BUILDER_MODEL = 'claude-opus-5-5';

// List prices per million tokens. A 1-hour cache write costs 2x input, a
// 5-minute one 1.25x; a cache read is a flat $0.20.
const PRICE = { input: 4, output: 20, cacheRead: 0.2, write5m: 5, write1h: 8 };

export interface StepUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: number;
}

interface ApiUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: {
    ephemeral_1h_input_tokens?: number | null;
    ephemeral_5m_input_tokens?: number | null;
  } | null;
}

export const usageOf = (usage: ApiUsage): StepUsage => {
  const write1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const write5m =
    usage.cache_creation?.ephemeral_5m_input_tokens ??
    (usage.cache_creation_input_tokens ?? 0) - write1h;
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  return {
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: write1h + write5m,
    // Dollars per million tokens times tokens is micro-dollars.
    costMicros: Math.round(
      input * PRICE.input +
        output * PRICE.output +
        cacheRead * PRICE.cacheRead +
        write5m * PRICE.write5m +
        write1h * PRICE.write1h
    )
  };
};

// A credit is $0.01 of model cost.
export const creditsOf = (costMicros: number) =>
  Math.round(costMicros / 1000) / 10;

export interface ContentBlock {
  type: string;
  [key: string]: unknown;
}

export interface BuilderMessageParam {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

export interface StepResult {
  content: ContentBlock[];
  stopReason: string | null;
  usage: StepUsage;
}

/**
 * One model step. The system prompt is cached for an hour (it and the tools
 * are the stable prefix); the conversation is cached automatically from its
 * end.
 */
export const step = async (input: {
  apiKey: string;
  system: string;
  tools: unknown[];
  messages: BuilderMessageParam[];
  effort: 'high' | 'medium';
  onText?: (delta: string) => void;
}): Promise<StepResult> => {
  const client = new Anthropic({ apiKey: input.apiKey, maxRetries: 4 });
  const params = {
    model: BUILDER_MODEL,
    max_tokens: 64000,
    system: [
      {
        type: 'text',
        text: input.system,
        cache_control: { type: 'ephemeral', ttl: '1h' }
      }
    ],
    tools: input.tools,
    messages: input.messages,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: input.effort },
    cache_control: { type: 'ephemeral' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default'
  };
  const stream = client.beta.messages.stream(
    params as unknown as Parameters<typeof client.beta.messages.stream>[0]
  );
  if (input.onText) stream.on('text', input.onText);
  const message = await stream.finalMessage();
  return {
    content: message.content as unknown as ContentBlock[],
    stopReason: message.stop_reason ?? null,
    usage: usageOf(message.usage as ApiUsage)
  };
};
