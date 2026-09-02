import { constants } from './constants';

// Turning one artifact_resource into the three things a multipart `attachment`
// field needs — bytes, a mime type, and a filename — is the same branch in every
// path that delivers a file: the native gmail, outlook and slack handlers, and
// the custom-code broker's sendFile. A resource is either an object in R2
// (fileKey) or inline text (content), and the filename fallbacks differ between
// the two.
//
// Size caps deliberately stay at the call sites. Each destination has its own
// (Gmail caps the combined raw size, Outlook caps per file AND combined, Slack
// caps per file), and folding them in here would mean a helper that has to know
// which vendor it is serving.

export interface AttachmentResource {
  uri: string;
  fileKey?: string | null;
  content?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  title?: string | null;
}

export interface ResolvedAttachment {
  bytes: ArrayBuffer;
  mimeType: string;
  filename: string;
}

export type ResolveAttachmentResult =
  | { ok: true; attachment: ResolvedAttachment }
  | { ok: false; error: string };

/**
 * Resolve one resource's attachment bytes.
 *
 * `readObject` rather than an R2 bucket so this stays free of a workers-types
 * dependency — @ganju/utils is bundled into every uploaded user script, and the
 * callers each already hold their own bucket binding.
 *
 * `verb` only shapes the error text: Slack "uploads" a file where the two mail
 * providers "attach" one, and the message is read by a model deciding what to do
 * next.
 */
export const resolveAttachment = async (
  resource: AttachmentResource,
  readObject: (key: string) => Promise<ArrayBuffer | null>,
  verb: 'attach' | 'upload' = 'attach'
): Promise<ResolveAttachmentResult> => {
  if (resource.fileKey) {
    const bytes = await readObject(resource.fileKey);
    if (!bytes) {
      return {
        ok: false,
        error: `Resource bytes missing in storage for ${resource.uri} (fileKey: ${resource.fileKey})`
      };
    }
    return {
      ok: true,
      attachment: {
        bytes,
        mimeType:
          resource.mimeType || constants.MIMETYPE_APPLICATION_OCTET_STREAM,
        filename:
          resource.fileName ||
          resource.title ||
          resource.uri.split('/').pop() ||
          'attachment'
      }
    };
  }

  if (resource.content !== null && resource.content !== undefined) {
    const encoded = new TextEncoder().encode(resource.content);
    // Sliced to its own buffer: TextEncoder may hand back a view into a larger
    // allocation, and a Blob built from the whole buffer would carry the slack.
    const bytes = encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength
    ) as ArrayBuffer;
    const base = resource.fileName || resource.title || 'attachment';
    return {
      ok: true,
      attachment: {
        bytes,
        mimeType: resource.mimeType || 'text/plain',
        // Inline resources are text with no extension of their own, and a file
        // named "Q3 Report" arrives unopenable on most clients.
        filename: /\.[a-z0-9]+$/i.test(base) ? base : `${base}.txt`
      }
    };
  }

  return {
    ok: false,
    error: `Resource ${resource.uri} has no inline content and no file in storage; cannot ${verb}.`
  };
};
