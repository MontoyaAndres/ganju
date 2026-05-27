import http from 'node:http';
import { utils } from '@anju/utils';
import { utils as dbUtils } from '@anju/db';

import { extractDocuments } from './extract.js';
import { handleGmailSend } from './gmailSend.js';
import { handleOutlookSend } from './outlookSend.js';
import { handleSlackSend } from './slackSend.js';
import { handleTelegramSend } from './telegramSend.js';
import { crawlDiscover, crawlPage } from './crawl.js';
import { utils as serverUtils } from './utils/index.js';

const handleExtract = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  const mimeType = (req.headers['x-mime-type'] || '').toString();
  const fileName = req.headers['x-file-name']
    ? decodeURIComponent(req.headers['x-file-name'].toString())
    : undefined;

  if (!mimeType) {
    serverUtils.sendJson(res, 400, { error: 'missing x-mime-type header' });
    return;
  }
  if (!utils.isEmbeddableMimeType(mimeType)) {
    serverUtils.sendJson(res, 200, { documents: null });
    return;
  }

  const body = await serverUtils.readBody(req);
  const documents = await extractDocuments(body, mimeType, fileName);
  serverUtils.sendJson(res, 200, { documents });
};

const handleCrawlDiscover = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  const body = await serverUtils.parseJsonBody<{
    url?: string;
    maxPages?: number;
    maxDepth?: number;
  }>(req);
  if (!body.url) {
    serverUtils.sendJson(res, 400, { error: 'missing url' });
    return;
  }
  const result = await crawlDiscover({
    url: body.url,
    maxPages: Math.min(
      body.maxPages ?? utils.constants.CRAWL_DEFAULT_MAX_PAGES,
      utils.constants.CRAWL_MAX_PAGES_LIMIT
    ),
    maxDepth: Math.min(
      body.maxDepth ?? utils.constants.CRAWL_DEFAULT_MAX_DEPTH,
      utils.constants.CRAWL_MAX_DEPTH_LIMIT
    )
  });
  serverUtils.sendJson(res, 200, result);
};

const handleCrawlPage = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> => {
  const body = await serverUtils.parseJsonBody<{
    url?: string;
    renderer?: 'cheerio' | 'playwright';
  }>(req);
  if (!body.url) {
    serverUtils.sendJson(res, 400, { error: 'missing url' });
    return;
  }
  const result = await crawlPage(body.url, body.renderer);
  if (!result) {
    serverUtils.sendJson(res, 422, { error: 'failed to extract page' });
    return;
  }
  serverUtils.sendJson(res, 200, result);
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      res.end('ok');
      return;
    }

    if (req.method === 'POST' && req.url === '/extract') {
      await handleExtract(req, res);
      return;
    }

    if (req.method === 'POST' && req.url === '/crawl/discover') {
      await handleCrawlDiscover(req, res);
      return;
    }

    if (req.method === 'POST' && req.url === '/crawl/page') {
      await handleCrawlPage(req, res);
      return;
    }

    if (req.method === 'POST' && req.url === '/gmail/send') {
      await handleGmailSend(req, res);
      return;
    }

    if (req.method === 'POST' && req.url === '/outlook/send') {
      await handleOutlookSend(req, res);
      return;
    }

    if (req.method === 'POST' && req.url === '/slack/send') {
      await handleSlackSend(req, res);
      return;
    }

    if (req.method === 'POST' && req.url === '/telegram/send') {
      await handleTelegramSend(req, res);
      return;
    }

    res.writeHead(404);
    res.end();
  } catch (error) {
    const { refId, status, body } = await dbUtils.handleError(
      {
        env: {
          HYPERDRIVE: { connectionString: process.env.DATABASE_URL || '' }
        },
        request: {
          method: req.method || null,
          path: req.url || null,
          userAgent: req.headers['user-agent']?.toString() || null,
          ipAddress:
            req.headers['cf-connecting-ip']?.toString() ||
            req.headers['x-forwarded-for']?.toString() ||
            req.socket.remoteAddress ||
            null
        }
      },
      error,
      { service: utils.constants.SERVICE_NAME_RESOURCE_HANDLER }
    );
    if (!res.headersSent) {
      serverUtils.sendJson(res, status, { id: refId, ...body });
    } else {
      res.end();
    }
  }
});

server.listen(process.env.PORT || 8082);
