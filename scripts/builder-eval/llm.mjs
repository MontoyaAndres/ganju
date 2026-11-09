// Calling Claude for the builder eval: one streamed request per step, with
// cost counted from each response's usage the way builder credits will be.
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = 'claude-opus-5-5';

// List prices per million tokens. A 1-hour cache write costs 2x input, a
// 5-minute one 1.25x; a cache read is a flat $0.20.
const PRICE = { input: 4, output: 20, cacheRead: 0.2, write5m: 5, write1h: 8 };

export const emptyUsage = () => ({
  calls: 0,
  input: 0,
  output: 0,
  cacheRead: 0,
  write5m: 0,
  write1h: 0,
  usd: 0
});

export const addUsage = (total, usage) => {
  const write1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const write5m =
    usage.cache_creation?.ephemeral_5m_input_tokens ??
    (usage.cache_creation_input_tokens ?? 0) - write1h;
  const step = {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    write5m,
    write1h
  };
  const usd =
    (step.input * PRICE.input +
      step.output * PRICE.output +
      step.cacheRead * PRICE.cacheRead +
      step.write5m * PRICE.write5m +
      step.write1h * PRICE.write1h) /
    1e6;
  total.calls += 1;
  for (const k of Object.keys(step)) total[k] += step[k];
  total.usd += usd;
  return usd;
};

export const mergeUsage = (a, b) => {
  const out = emptyUsage();
  for (const k of Object.keys(out)) out[k] = (a[k] ?? 0) + (b[k] ?? 0);
  return out;
};

// 1 credit = $0.01 of model cost at list price.
export const credits = usd => Math.round(usd * 100 * 10) / 10;

let client;
const anthropic = () => (client ??= new Anthropic({ maxRetries: 4 }));

/**
 * One model step. `system` is cached for an hour (it and the tools are the
 * stable prefix); the conversation is cached automatically from its end.
 */
export const step = async ({
  system,
  tools,
  messages,
  effort = 'high',
  maxTokens = 64000,
  usage
}) => {
  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    system: [
      {
        type: 'text',
        text: system,
        cache_control: { type: 'ephemeral', ttl: '1h' }
      }
    ],
    ...(tools?.length ? { tools } : {}),
    messages,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort },
    cache_control: { type: 'ephemeral' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default'
  };
  const stream = anthropic().beta.messages.stream(params);
  const message = await stream.finalMessage();
  const usd = usage ? addUsage(usage, message.usage) : 0;
  return { message, usd };
};

export const textOf = message =>
  message.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();

/** A small structured answer (owner replies, judge verdicts). */
export const ask = async ({
  system,
  prompt,
  schema,
  effort = 'low',
  usage
}) => {
  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort, format: { type: 'json_schema', schema } }
  });
  if (usage) addUsage(usage, response.usage);
  const text = response.content.find(b => b.type === 'text')?.text ?? '{}';
  return JSON.parse(text);
};
