import { Schema } from './schema';

export interface DataAttachment {
  table: string;
  column: string;
  index: boolean;
}

// The Data upload a knowledge item came from, read from its metadata, or
// null for any other item.
export const dataAttachmentOf = (metadata: unknown): DataAttachment | null => {
  if (!metadata || typeof metadata !== 'object') return null;
  const parsed = Schema.DATA_ATTACHMENT_METADATA.safeParse(
    (metadata as { dataAttachment?: unknown }).dataAttachment
  );
  return parsed.success ? parsed.data : null;
};

// Uploads from Data are stored, not indexed, unless their column asks.
export const skipsIndexing = (metadata: unknown): boolean => {
  const attachment = dataAttachmentOf(metadata);
  return attachment !== null && !attachment.index;
};
