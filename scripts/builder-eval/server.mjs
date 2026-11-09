// Drives the builder through the API's routes, the way the dashboard will:
// send the owner's message, stream the turn, then read what was saved.
import { API_URL, token } from './api.mjs';

const parseEvents = text =>
  text
    .split('\n\n')
    .map(frame => {
      const id = frame.match(/^id: (\d+)$/m)?.[1];
      const data = frame.match(/^data: (.*)$/m)?.[1];
      return data ? { id: Number(id), event: JSON.parse(data) } : null;
    })
    .filter(Boolean);

// The turn's events until `done`, reconnecting from the last id if the
// stream drops.
export const streamTurn = async (p, conversationId, turnId, onEvent) => {
  const events = [];
  let after = -1;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const response = await fetch(
        `${API_URL}${p.base}/builder/conversation/${conversationId}/stream?turn=${turnId}&after=${after}`,
        { headers: { authorization: `Bearer ${await token()}` } }
      );
      if (!response.ok) {
        throw new Error(`stream ${response.status}: ${await response.text()}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const cut = buffer.lastIndexOf('\n\n');
        if (cut === -1) continue;
        for (const entry of parseEvents(buffer.slice(0, cut + 2))) {
          after = Math.max(after, entry.id);
          events.push(entry.event);
          onEvent?.(entry.event);
          if (entry.event.type === 'done') return events;
        }
        buffer = buffer.slice(cut + 2);
      }
    } catch (error) {
      onEvent?.({ type: 'reconnect', message: error.message });
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  return events;
};

export const textOfBlocks = blocks =>
  (blocks ?? [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();

// Totals in the shape the eval's summary already uses.
export const usageOfConversation = messages => {
  const assistant = messages.filter(m => m.role === 'assistant');
  return {
    calls: assistant.length,
    input: assistant.reduce((a, m) => a + m.inputTokens, 0),
    output: assistant.reduce((a, m) => a + m.outputTokens, 0),
    cacheRead: assistant.reduce((a, m) => a + m.cacheReadTokens, 0),
    write5m: 0,
    write1h: assistant.reduce((a, m) => a + m.cacheWriteTokens, 0),
    usd: assistant.reduce((a, m) => a + m.credits, 0) / 100
  };
};

// Tool calls of a set of messages, with each one's result.
export const toolCallsOf = messages => {
  const results = new Map(
    messages
      .filter(m => m.role === 'user')
      .flatMap(m => m.content)
      .filter(block => block.type === 'tool_result')
      .map(block => [block.tool_use_id, block])
  );
  return messages
    .filter(m => m.role === 'assistant')
    .flatMap(m => m.content)
    .filter(block => block.type === 'tool_use')
    .map(block => ({
      name: block.name,
      input: block.input,
      result: results.get(block.id)?.content ?? null,
      isError: !!results.get(block.id)?.is_error
    }));
};
