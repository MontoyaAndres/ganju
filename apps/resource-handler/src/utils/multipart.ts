import http from 'node:http';
import { Readable } from 'node:stream';

// Adapt a Node http.IncomingMessage into a Web Request so we can use the
// platform's native multipart/form-data parser via Request.formData(). Avoids
// pulling in a third-party multipart parser like busboy or formidable.
export const parseMultipartRequest = async (
  req: http.IncomingMessage
): Promise<FormData> => {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(', '));
  }
  const request = new Request(`http://resource-handler${req.url || '/'}`, {
    method: req.method || 'POST',
    headers,
    body: Readable.toWeb(req),
    duplex: 'half'
  } as RequestInit);
  return request.formData();
};
