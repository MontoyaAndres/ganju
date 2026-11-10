import { utils } from '@ganju/utils';

import type { StreamEvent } from './types';

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
  error: string;
}

/** One call to the API. Never throws: a refusal comes back as `ok: false`. */
export const request = async <T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT'; body?: unknown } = {}
): Promise<ApiResult<T>> => {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(typeof document !== 'undefined' && document.documentElement.lang
          ? { 'Accept-Language': document.documentElement.lang }
          : {})
      },
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {})
    });
    const data: { error?: unknown } = await response.json().catch(() => ({}));
    if (!response.ok || utils.isApiError(data)) {
      const error = (data as { error?: unknown } | null)?.error;
      return {
        ok: false,
        status: response.status,
        data: undefined as T,
        error: typeof error === 'string' ? error : ''
      };
    }
    return { ok: true, status: response.status, data: data as T, error: '' };
  } catch {
    return { ok: false, status: 0, data: undefined as T, error: '' };
  }
};

const parseFrames = (text: string) =>
  text
    .split('\n\n')
    .map(frame => {
      const id = frame.match(/^id: (\d+)$/m)?.[1];
      const data = frame.match(/^data: (.*)$/m)?.[1];
      if (!data) return null;
      try {
        return { id: Number(id), event: JSON.parse(data) as StreamEvent };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { id: number; event: StreamEvent } => !!entry);

/**
 * A turn's events until `done`, picking up after the last one seen when the
 * connection drops. Resolves when the turn is over or `signal` aborts.
 */
export const streamTurn = async (
  path: string,
  turnId: string,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal
) => {
  let after = -1;
  for (let attempt = 0; attempt < 30 && !signal.aborted; attempt++) {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}${path}/stream?turn=${turnId}&after=${after}`,
        { credentials: 'include', signal }
      );
      if (!response.ok || !response.body) throw new Error('stream');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const cut = buffer.lastIndexOf('\n\n');
        if (cut === -1) continue;
        for (const entry of parseFrames(buffer.slice(0, cut + 2))) {
          if (entry.id <= after && entry.event.type !== 'done') continue;
          after = Math.max(after, entry.id);
          onEvent(entry.event);
          if (entry.event.type === 'done') return;
        }
        buffer = buffer.slice(cut + 2);
      }
    } catch {
      if (signal.aborted) return;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
};
