import { constants } from './constants';
import { decodeEntities } from './sanitize';

import type {
  ExtractedDocument,
  ExtractedDocumentMetadata
} from './extractedDocument';

export type Separator = (typeof constants.CHUNK_SEPARATORS)[number];

const trySplit = (text: string, sep: string | RegExp): string[] | null => {
  if (typeof sep === 'string') {
    return text.includes(sep) ? text.split(sep) : null;
  }
  return sep.test(text) ? text.split(sep) : null;
};

export const splitRecursive = (
  text: string,
  target: number,
  separators: readonly Separator[] = constants.CHUNK_SEPARATORS
): string[] => {
  if (text.length <= target) return [text];

  for (const { split, join } of separators) {
    const parts = trySplit(text, split);
    if (!parts) continue;
    const chunks: string[] = [];
    let current = '';
    for (const part of parts) {
      const piece = current ? current + join + part : part;
      if (piece.length > target && current) {
        chunks.push(current);
        current = part;
      } else {
        current = piece;
      }
    }
    if (current) chunks.push(current);
    return chunks.flatMap(chunk =>
      chunk.length > target
        ? splitRecursive(chunk, target, separators)
        : [chunk]
    );
  }

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += target) {
    chunks.push(text.slice(i, i + target));
  }
  return chunks;
};

// Each piece keeps its `raw` text — the slice of the input it covers, without
// the overlap borrowed from the piece before — so a caller can walk the input
// in order without reading any of it twice.
const chunkPieces = (
  text: string,
  options?: { targetChars?: number; overlapChars?: number }
): Array<{ raw: string; content: string }> => {
  const target = options?.targetChars ?? constants.CHUNK_TARGET_CHARS;
  const overlap = options?.overlapChars ?? constants.CHUNK_OVERLAP_CHARS;

  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= target) return [{ raw: trimmed, content: trimmed }];

  const rawChunks = splitRecursive(trimmed, target);
  const pieces: Array<{ raw: string; content: string }> = [];
  for (let i = 0; i < rawChunks.length; i++) {
    const prev = i > 0 ? rawChunks[i - 1].slice(-overlap) : '';
    pieces.push({
      raw: rawChunks[i],
      content: (prev ? prev + '\n' : '') + rawChunks[i]
    });
  }
  return pieces.filter(p => p.content.trim().length > 0);
};

export const chunkText = (
  text: string,
  options?: { targetChars?: number; overlapChars?: number }
): string[] => chunkPieces(text, options).map(p => p.content);

export type HeadingSyntax = 'markdown' | 'html';

interface HeadingEvent {
  offset: number;
  level: number;
  text: string;
}

const MARKDOWN_HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const MARKDOWN_FENCE = /^ {0,3}(```|~~~)/;
const HTML_HEADING = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;
const MAX_HEADING_CHARS = 120;

const MARKDOWN_FILE_NAME = /\.(md|markdown|mdx)$/i;

/**
 * Which heading syntax a document is written in, or null when it has none we
 * can trust. Plain text is left out on purpose: a line that happens to start
 * with "# " there is as likely a comment or a list as a title.
 */
export const headingSyntaxFor = (input: {
  mimeType?: string | null;
  fileName?: string | null;
  isWebPage?: boolean;
}): HeadingSyntax | null => {
  // Crawled pages are flattened to text with their headings written back as
  // Markdown lines, whatever the page's own content type was.
  if (input.isWebPage) return 'markdown';
  if (input.mimeType === constants.MIMETYPE_TEXT_MARKDOWN) return 'markdown';
  if (input.mimeType === constants.MIMETYPE_TEXT_HTML) return 'html';
  if (input.fileName && MARKDOWN_FILE_NAME.test(input.fileName)) {
    return 'markdown';
  }
  return null;
};

const cleanHeading = (text: string): string =>
  text.replace(/\s+/g, ' ').trim().slice(0, MAX_HEADING_CHARS);

const scanMarkdownHeadings = (
  text: string,
  state: { inFence: boolean }
): HeadingEvent[] => {
  const events: HeadingEvent[] = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    // A `#` inside a fenced block is a shell comment or a preprocessor line,
    // not a title — and a fence can open in one chunk and close in the next.
    if (MARKDOWN_FENCE.test(line)) {
      state.inFence = !state.inFence;
    } else if (!state.inFence) {
      const match = MARKDOWN_HEADING.exec(line);
      const heading = match ? cleanHeading(match[2]) : '';
      if (match && heading) {
        events.push({ offset, level: match[1].length, text: heading });
      }
    }
    offset += line.length + 1;
  }
  return events;
};

const scanHtmlHeadings = (text: string): HeadingEvent[] =>
  [...text.matchAll(HTML_HEADING)]
    .map(match => ({
      offset: match.index ?? 0,
      level: Number(match[1]),
      text: cleanHeading(decodeEntities(match[2].replace(/<[^>]*>/g, ' ')))
    }))
    .filter(event => event.text);

/**
 * Follows the heading hierarchy across a document's chunks, fed in order.
 * Returns, for each chunk, the path of headings it sits under — the section a
 * reader would be pointed to. A chunk that opens with a heading belongs to that
 * heading; one that starts mid-section belongs to the section it continues,
 * even when a later heading begins inside it.
 */
const createHeadingTracker = (syntax: HeadingSyntax) => {
  let stack: Array<{ level: number; text: string }> = [];
  const fence = { inFence: false };
  const apply = (event: HeadingEvent) => {
    stack = stack.filter(h => h.level < event.level);
    stack.push({ level: event.level, text: event.text });
  };

  return (raw: string): string[] => {
    const events =
      syntax === 'markdown'
        ? scanMarkdownHeadings(raw, fence)
        : scanHtmlHeadings(raw);
    const [first, ...rest] = events;
    // Before a document's first heading there is no section to continue — only
    // the metadata header, or the markup around an HTML body — so a chunk that
    // holds the first heading belongs to it wherever in the chunk it falls.
    const opensWithHeading =
      first !== undefined &&
      (stack.length === 0 || raw.slice(0, first.offset).trim() === '');
    if (opensWithHeading) apply(first);
    const path = stack.map(h => h.text);
    for (const event of opensWithHeading ? rest : events) apply(event);
    return path;
  };
};

export const buildHeader = (input: {
  title?: string | null;
  description?: string | null;
  uri?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
}): string =>
  [
    input.title ? `Title: ${input.title}` : null,
    input.description ? `Description: ${input.description}` : null,
    input.uri ? `URI: ${input.uri}` : null,
    input.mimeType ? `MimeType: ${input.mimeType}` : null,
    input.fileName ? `FileName: ${input.fileName}` : null
  ]
    .filter(Boolean)
    .join('\n');

// Loose on purpose: a chunk of inline text has no extracted document behind it,
// so only `headingPath` can be known about it.
export interface ChunkMetadata extends Partial<ExtractedDocumentMetadata> {
  chunkIndexInPage?: number;
  chunksInPage?: number;
  // The headings this chunk sits under, outermost first. Present only for
  // Markdown and HTML, and only when the chunk is under at least one heading.
  headingPath?: string[];
}

export interface PreparedChunk {
  content: string;
  metadata: ChunkMetadata | null;
}

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

export const prepareChunks = (
  header: string,
  documents: ExtractedDocument[] | null,
  fallbackContent: string | null,
  options?: {
    targetChars?: number;
    overlapChars?: number;
    // The resource's own type and file name, which decide the heading syntax
    // for inline content and for documents that don't carry their own.
    mimeType?: string | null;
    fileName?: string | null;
  }
): PreparedChunk[] => {
  if (documents && documents.length > 0) {
    const out: PreparedChunk[] = [];
    documents.forEach((doc, docIndex) => {
      const body = (doc.pageContent || '').replace(CONTROL_CHARS, '').trim();
      if (!body) return;
      const text = docIndex === 0 && header ? `${header}\n\n${body}` : body;
      const syntax = headingSyntaxFor({
        mimeType: doc.metadata?.source?.mimeType ?? options?.mimeType,
        fileName: doc.metadata?.source?.fileName ?? options?.fileName,
        isWebPage: !!doc.metadata?.web
      });
      const headingPathOf = syntax ? createHeadingTracker(syntax) : null;
      const pieces = chunkPieces(text, options);
      pieces.forEach((piece, pieceIndex) => {
        const headingPath = headingPathOf?.(piece.raw) ?? [];
        out.push({
          content: piece.content,
          metadata: {
            ...doc.metadata,
            chunkIndexInPage: pieceIndex,
            chunksInPage: pieces.length,
            ...(headingPath.length > 0 ? { headingPath } : {})
          }
        });
      });
    });
    return out;
  }

  const body = (fallbackContent || '').replace(CONTROL_CHARS, '').trim();
  const fullText = [header, body].filter(Boolean).join('\n\n');
  const syntax = headingSyntaxFor({
    mimeType: options?.mimeType,
    fileName: options?.fileName
  });
  const headingPathOf = syntax ? createHeadingTracker(syntax) : null;
  return chunkPieces(fullText, options).map(piece => {
    const headingPath = headingPathOf?.(piece.raw) ?? [];
    return {
      content: piece.content,
      metadata: headingPath.length > 0 ? { headingPath } : null
    };
  });
};
