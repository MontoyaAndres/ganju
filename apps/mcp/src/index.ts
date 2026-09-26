import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { utils as dbUtils } from '@ganju/db';
import { utils } from '@ganju/utils';

import { MCPController, WellKnownController } from './controllers';
import { AuthMiddleware } from './middleware';

// types
import type { AppEnv } from './types';

const app = new Hono<AppEnv>();

app
  .use(
    '*',
    cors({
      origin: '*',
      allowHeaders: [
        'Content-Type',
        'User-Agent',
        'Authorization',
        'Accept',
        'mcp-protocol-version',
        utils.constants.MCP_SESSION_HEADER,
        utils.constants.MCP_INTERNAL_HEADER,
        utils.constants.MCP_CHANNEL_ID_HEADER,
        utils.constants.MCP_CHANNEL_PLATFORM_HEADER
      ],
      exposeHeaders: ['WWW-Authenticate', utils.constants.MCP_SESSION_HEADER],
      allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS']
    })
  )
  .onError(async (error, c) => {
    // The MCP transport turns away a request it can't serve — an unsupported
    // protocol version, a second initialize, a bad session — with a finished
    // JSON-RPC response that says why. Clients read it to negotiate or fall
    // back, so it goes out as it is; recording it would log every such probe
    // as a server error and replace the reason with a generic one.
    if (error instanceof HTTPException && error.status < 500) {
      return error.getResponse();
    }
    const { status, body } = await dbUtils.handleError(c, error, {
      service: utils.constants.SERVICE_NAME_MCP
    });
    return c.json(body, status);
  })

  // OAuth 2.0 Protected Resource Metadata (RFC 9728) — lets MCP clients
  // discover the authorization server after a 401. Public, no auth gate.
  .get(
    '/.well-known/oauth-protected-resource',
    WellKnownController.protectedResourceMetadata
  )
  .get(
    '/.well-known/oauth-protected-resource/:slug',
    WellKnownController.protectedResourceMetadata
  )

  // MCP controller — auth gate runs only on artifact-bearing routes
  .post('/', AuthMiddleware.verify, MCPController.business)
  .post('/:slug', AuthMiddleware.verify, MCPController.business)
  .get('/health', MCPController.health);

export default app;
