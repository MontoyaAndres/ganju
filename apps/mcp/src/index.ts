import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { utils as dbUtils } from '@anju/db';
import { utils } from '@anju/utils';

import { MCPController } from './controllers';

// types
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

app
  .use(
    '*',
    cors({
      origin: ['*'],
      allowHeaders: [
        'Content-Type',
        'User-Agent',
        'Authorization',
        'Accept',
        'Mcp-Session-Id'
      ],
      allowMethods: ['GET', 'POST']
    })
  )
  .onError(async (error, c) => {
    const { status, body } = await dbUtils.handleError(c, error, {
      service: utils.constants.SERVICE_NAME_MCP
    });
    return c.json(body, status);
  })

  // MCP controller
  .post('/', MCPController.business)
  .get('/health', MCPController.health);

export default app;
