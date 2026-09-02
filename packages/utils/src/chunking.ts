import { constants } from './constants';

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

export const chunkText = (
  text: string,
  options?: { targetChars?: number; overlapChars?: number }
): string[] => {
  const target = options?.targetChars ?? constants.CHUNK_TARGET_CHARS;
  const overlap = options?.overlapChars ?? constants.CHUNK_OVERLAP_CHARS;

  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= target) return [trimmed];

  const rawChunks = splitRecursive(trimmed, target);
  const withOverlap: string[] = [];
  for (let i = 0; i < rawChunks.length; i++) {
    const prev = i > 0 ? rawChunks[i - 1].slice(-overlap) : '';
    withOverlap.push((prev ? prev + '\n' : '') + rawChunks[i]);
  }
  return withOverlap.filter(c => c.trim().length > 0);
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

export interface ChunkMetadata extends ExtractedDocumentMetadata {
  chunkIndexInPage: number;
  chunksInPage: number;
}

export interface PreparedChunk {
  content: string;
  metadata: ChunkMetadata | null;
}

export const prepareChunks = (
  header: string,
  documents: ExtractedDocument[] | null,
  fallbackContent: string | null,
  options?: { targetChars?: number; overlapChars?: number }
): PreparedChunk[] => {
  if (documents && documents.length > 0) {
    const out: PreparedChunk[] = [];
    documents.forEach((doc, docIndex) => {
      const body = (doc.pageContent || '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .trim();
      if (!body) return;
      const text = docIndex === 0 && header ? `${header}\n\n${body}` : body;
      const pieces = chunkText(text, options);
      pieces.forEach((piece, pieceIndex) => {
        out.push({
          content: piece,
          metadata: {
            ...doc.metadata,
            chunkIndexInPage: pieceIndex,
            chunksInPage: pieces.length
          }
        });
      });
    });
    return out;
  }

  const body = (fallbackContent || '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .trim();
  const fullText = [header, body].filter(Boolean).join('\n\n');
  return chunkText(fullText, options).map(content => ({
    content,
    metadata: null
  }));
};
