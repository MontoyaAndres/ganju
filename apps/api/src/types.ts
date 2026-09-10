import type {
  DispatchNamespace,
  Fetcher,
  Hyperdrive,
  Queue,
  R2Bucket,
  SendEmail
} from '@cloudflare/workers-types';
import type { ResourceHandler } from '@ganju/containers';

import type { Auth } from './utils';
import type { DiscordGatewayDO } from './durable-objects/discordGateway';
import type { MessageBufferDO } from './durable-objects/messageBuffer';
import type {
  IndexJob,
  CrawlDiscoverJob,
  PageJob,
  GdriveDiscoverJob,
  GdriveFileJob,
  OnedriveDiscoverJob,
  OnedriveFileJob
} from './queue';

export type Variables = {
  user: Auth['$Infer']['Session']['user'];
  session: Auth['$Infer']['Session']['session'];
  apiToken: { id: string; projectId: string; organizationId: string };
};

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type Bindings = {
  HYPERDRIVE: Hyperdrive;
  CONTACT_RATE_LIMITER?: RateLimiter;
  AUTH_RATE_LIMITER?: RateLimiter;
  WEBHOOK_RATE_LIMITER?: RateLimiter;
  API_RATE_LIMITER?: RateLimiter;
  STORAGE_BUCKET: R2Bucket;
  INDEX_QUEUE: Queue<IndexJob>;
  CRAWL_DISCOVER_QUEUE: Queue<CrawlDiscoverJob>;
  CRAWL_PAGE_QUEUE: Queue<PageJob>;
  GDRIVE_DISCOVER_QUEUE: Queue<GdriveDiscoverJob>;
  GDRIVE_FILE_QUEUE: Queue<GdriveFileJob>;
  ONEDRIVE_DISCOVER_QUEUE: Queue<OnedriveDiscoverJob>;
  ONEDRIVE_FILE_QUEUE: Queue<OnedriveFileJob>;
  RESOURCE_HANDLER: DurableObjectNamespace<ResourceHandler>;
  RESOURCE_HANDLER_PORT: string;
  DISCORD_GATEWAY: DurableObjectNamespace<DiscordGatewayDO>;
  MESSAGE_BUFFER: DurableObjectNamespace<MessageBufferDO>;
  API: Fetcher;
  SEND_EMAIL?: SendEmail;
  MCP: Fetcher;
  DISPATCH?: DispatchNamespace;
  MCP_INTERNAL_SECRET?: string;
  BOT_OAUTH_CLIENT_ID?: string;
  BOT_OAUTH_CLIENT_SECRET?: string;
  DATABASE_URL?: string;
  NODE_ENV?: string;
  POLAR_ACCESS_TOKEN?: string;
  POLAR_WEBHOOK_SECRET?: string;
  POLAR_PRODUCT_PRO?: string;
  POLAR_PRODUCT_ENTERPRISE?: string;
  POLAR_SERVER?: string;
  EMAIL_FROM?: string;
  ALERT_EMAIL?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
