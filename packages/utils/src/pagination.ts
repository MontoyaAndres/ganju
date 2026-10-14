// Large tool results, in one shape: a list a tool owns is paged by a cursor the
// model passes back, and text that has to be cut says so, how much was left
// out, and where to continue when the result itself carried a cursor.
//
// Imports nothing, so node --test runs it directly.

// Keys a paged API commonly answers with. Read at the top level only: deeper
// than that, a key with one of these names is somebody's data.
const NEXT_CURSOR_KEYS = [
  'nextCursor',
  'next_cursor',
  'nextPageToken',
  'next_page_token',
  'nextPage',
  'next_page',
  'next'
];

/**
 * The cursor for the next page a JSON result names at its top level, if any.
 * Cut text can lose it, so it is read from the parsed value before cutting.
 */
export const findNextCursor = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  for (const key of NEXT_CURSOR_KEYS) {
    const found = (value as Record<string, unknown>)[key];
    if (typeof found === 'string' && found) return `${key}: ${found}`;
    if (typeof found === 'number') return `${key}: ${found}`;
  }
  return undefined;
};

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * `text` within `maxBytes` of UTF-8, or its start with a note that says it was
 * cut. A character split by the cut is dropped rather than shown broken.
 * `next` names the result's own cursor, for "call again with it".
 */
export const capText = (
  text: string,
  maxBytes: number,
  next?: string
): string => {
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength <= maxBytes) return text;

  const kept = new TextDecoder()
    .decode(bytes.slice(0, maxBytes))
    .replace(/�+$/, '');
  const continueWith = next
    ? ` The result names its next page (${next}): call again with it to continue.`
    : ' To see the rest, call again asking for less — narrower filters, a smaller page or fewer fields.';
  return `${kept}\n\n[Truncated: showing the first ${kb(maxBytes)} of ${kb(
    bytes.byteLength
  )}.${continueWith}]`;
};

// Opaque to the model, so it is passed back as given rather than edited.
const encodeCursor = (key: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(key)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const decodeCursor = (cursor: string): string | null => {
  try {
    const base64 = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, char => char.charCodeAt(0))
    );
  } catch {
    return null;
  }
};

export class InvalidCursorError extends Error {
  constructor() {
    super(
      'That cursor is not valid. Call again without a cursor to start from the first page.'
    );
    this.name = 'InvalidCursorError';
  }
}

/**
 * What `list-resources` answers, wherever it runs (the MCP worker, and the
 * channel runner, which lists proxied resources too): one page by uri, how many
 * there are in all, and the cursor for the next page when there is one.
 */
export const listResourcesPage = (
  resources: Array<{
    uri: string;
    title?: string | null;
    description?: string | null;
    mimeType?: string | null;
  }>,
  args: { cursor?: unknown; limit?: unknown },
  limits: { defaultLimit: number; maxLimit: number }
): string => {
  const { page, total, nextCursor } = paginate(resources, r => r.uri, {
    cursor: typeof args.cursor === 'string' ? args.cursor : undefined,
    limit: typeof args.limit === 'number' ? args.limit : undefined,
    ...limits
  });
  return JSON.stringify({
    resources: page.map(r => ({
      uri: r.uri,
      title: r.title || undefined,
      description: r.description || undefined,
      mimeType: r.mimeType || undefined
    })),
    total,
    ...(nextCursor ? { nextCursor } : {})
  });
};

/**
 * One page of `items`, ordered by `keyOf`, starting after the item the cursor
 * names. Keyed rather than counted, so an item added or removed between calls
 * doesn't shift the next page onto ones already seen.
 */
export const paginate = <T>(
  items: T[],
  keyOf: (item: T) => string,
  options: {
    cursor?: string;
    limit?: number;
    defaultLimit: number;
    maxLimit: number;
  }
): { page: T[]; nextCursor?: string; total: number } => {
  const limit = Math.min(
    Math.max(Math.floor(Number(options.limit) || options.defaultLimit), 1),
    options.maxLimit
  );
  const sorted = [...items].sort((a, b) => {
    const left = keyOf(a);
    const right = keyOf(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });

  let start = 0;
  if (options.cursor) {
    const after = decodeCursor(options.cursor);
    if (after === null) throw new InvalidCursorError();
    start = sorted.findIndex(item => keyOf(item) > after);
    if (start === -1) start = sorted.length;
  }

  const page = sorted.slice(start, start + limit);
  const more = start + limit < sorted.length;
  return {
    page,
    total: sorted.length,
    ...(more && page.length > 0
      ? { nextCursor: encodeCursor(keyOf(page[page.length - 1])) }
      : {})
  };
};
