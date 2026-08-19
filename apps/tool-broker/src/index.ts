import { Hono } from 'hono';
import { utils as dbUtils } from '@ganju/db';
import { utils } from '@ganju/utils';

import { BrokerController } from './controllers';
import { ToolAuthMiddleware } from './middleware';
import { allowBrokerCall } from './utils';

// types
import type { AppEnv } from './types';

// The host capabilities a custom-code script gets: managed OAuth connections,
// per-tool secrets, the artifact's resources, and file delivery.
//
// This is a separate worker rather than routes on apps/api for one reason —
// every deployed user script holds a service binding to it, and a binding to the
// API would put the whole API surface one fetch away from user code. The broker
// exposes exactly these routes and nothing else.
//
// There is no CORS layer here on purpose: the only caller is a service binding
// from inside the dispatch namespace, never a browser.
const app = new Hono<AppEnv>();

app
  .onError(async (error, c) => {
    const { status, body } = await dbUtils.handleError(c, error, {
      service: utils.constants.SERVICE_NAME_TOOL_BROKER
    });
    return c.json(body, status);
  })

  .get('/health', c => c.json({ status: 'ok' }))

  // Everything below is a capability, so all of it is behind the token gate and
  // the shared per-artifact rate limit. The limit is applied after auth so an
  // unauthenticated caller can't spend an artifact's budget.
  .use('/*', ToolAuthMiddleware.verify)
  .use('/*', async (c, next) => {
    const tool = c.get('tool');
    const allowed = await allowBrokerCall(c.env, tool.artifactToolId);
    if (!allowed) {
      return c.json(
        { error: 'Rate limit exceeded for this artifact. Slow down.' },
        429
      );
    }
    await next();
  })

  .post(
    utils.constants.CUSTOM_CODE_BROKER_PATH_CONNECTION,
    BrokerController.connection
  )
  .post(utils.constants.CUSTOM_CODE_BROKER_PATH_SECRET, BrokerController.secret)
  .post(
    utils.constants.CUSTOM_CODE_BROKER_PATH_RESOURCES_SEARCH,
    BrokerController.searchResources
  )
  .post(
    utils.constants.CUSTOM_CODE_BROKER_PATH_RESOURCES_READ,
    BrokerController.readResource
  )
  .post(
    utils.constants.CUSTOM_CODE_BROKER_PATH_RESOURCES_LIST,
    BrokerController.listResources
  )
  .post(
    utils.constants.CUSTOM_CODE_BROKER_PATH_SEND_FILE,
    BrokerController.sendFile
  );

export default app;
