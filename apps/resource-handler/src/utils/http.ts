import http from 'node:http';

export const sendJson = (
  res: http.ServerResponse,
  status: number,
  body: unknown
): void => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

export const readBody = (req: http.IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(chunk as Buffer));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

export const parseJsonBody = async <T>(
  req: http.IncomingMessage
): Promise<T> => {
  const buffer = await readBody(req);
  return JSON.parse(buffer.toString('utf8') || '{}') as T;
};
