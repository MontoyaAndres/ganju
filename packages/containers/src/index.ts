import { Container, getContainer } from '@cloudflare/containers';
import { utils } from '@anju/utils';

export interface ResourceHandlerCallerEnv {
  RESOURCE_HANDLER: DurableObjectNamespace<ResourceHandler>;
}

export interface ResourceHandlerEnv extends ResourceHandlerCallerEnv {
  RESOURCE_HANDLER_PORT: string;
  DATABASE_URL?: string;
  NODE_ENV?: string;
}

export class ResourceHandler extends Container<ResourceHandlerEnv> {
  defaultPort: number;
  sleepAfter = utils.constants.RESOURCE_HANDLER_SLEEP_AFTER;
  envVars: Record<string, string>;

  constructor(ctx: DurableObjectState<{}>, env: ResourceHandlerEnv) {
    super(ctx, env);
    const port = Number(utils.getEnv({ env }, 'RESOURCE_HANDLER_PORT'));
    this.defaultPort = port;
    this.envVars = {
      PORT: String(port),
      DATABASE_URL: utils.getEnv({ env }, 'DATABASE_URL') || '',
      NODE_ENV: utils.getEnv({ env }, 'NODE_ENV') || ''
    };
  }
}

export const getResourceHandler = (env: ResourceHandlerCallerEnv) =>
  getContainer(env.RESOURCE_HANDLER);
