import { sanitizeMailHeader, formatMailHeader } from './mailHeaders';

export interface MimeAttachment {
  filename: string;
  mimeType: string;
  base64: string;
}

export interface MimeMessageInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  inReplyTo?: string;
  references?: string;
  contentType?: 'text/html' | 'text/plain';
  attachments?: MimeAttachment[];
}

export const sanitizeFilename = (name: string): string => {
  const cleaned = name.replace(/[\r\n"]/g, '').trim();
  return cleaned || 'attachment';
};

export const formatFilenameHeader = (name: string): string => {
  const safe = sanitizeFilename(name);
  if (/^[\x20-\x7E]+$/.test(safe)) {
    return `filename="${safe.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return `filename*=UTF-8''${encodeURIComponent(safe)}`;
};

export const chunkBase64 = (b64: string): string =>
  b64.replace(/(.{76})/g, '$1\r\n');

export const buildMimeMessage = (input: MimeMessageInput): string => {
  const headers: string[] = [];
  headers.push(`To: ${formatMailHeader(input.to)}`);
  if (input.cc) headers.push(`Cc: ${formatMailHeader(input.cc)}`);
  if (input.bcc) headers.push(`Bcc: ${formatMailHeader(input.bcc)}`);
  headers.push(`Subject: ${formatMailHeader(input.subject)}`);
  if (input.inReplyTo)
    headers.push(`In-Reply-To: ${sanitizeMailHeader(input.inReplyTo)}`);
  if (input.references)
    headers.push(`References: ${sanitizeMailHeader(input.references)}`);
  headers.push('MIME-Version: 1.0');

  const bodyContentType = input.contentType || 'text/html';

  if (!input.attachments || input.attachments.length === 0) {
    headers.push(`Content-Type: ${bodyContentType}; charset=utf-8`);
    return `${headers.join('\r\n')}\r\n\r\n${input.body}`;
  }

  const boundary = `_ganju_${crypto.randomUUID().replace(/-/g, '')}`;
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

  const parts: string[] = [headers.join('\r\n'), ''];
  parts.push(`--${boundary}`);
  parts.push(`Content-Type: ${bodyContentType}; charset=utf-8`);
  parts.push('Content-Transfer-Encoding: 7bit');
  parts.push('');
  parts.push(input.body);

  for (const att of input.attachments) {
    const safeName = sanitizeFilename(att.filename);
    parts.push(`--${boundary}`);
    parts.push(
      `Content-Type: ${att.mimeType}; name="${safeName.replace(/"/g, '\\"')}"`
    );
    parts.push('Content-Transfer-Encoding: base64');
    parts.push(
      `Content-Disposition: attachment; ${formatFilenameHeader(att.filename)}`
    );
    parts.push('');
    parts.push(chunkBase64(att.base64));
  }

  parts.push(`--${boundary}--`);
  return parts.join('\r\n');
};
