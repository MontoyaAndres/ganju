import type {
  Fetcher,
  Hyperdrive,
  Queue,
  R2Bucket,
  SendEmail
} from '@cloudflare/workers-types';
import type { ResourceHandler } from '@ganju/containers';

import type { Auth } from './utils';
import type { DiscordGatewayDO } from './durable-objects/discordGateway';
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
};

export type Bindings = {
  HYPERDRIVE: Hyperdrive;
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
  API: Fetcher;
  SEND_EMAIL?: SendEmail;
  MCP: Fetcher;
  MCP_INTERNAL_SECRET?: string;
  BOT_OAUTH_CLIENT_ID?: string;
  BOT_OAUTH_CLIENT_SECRET?: string;
  DATABASE_URL?: string;
  NODE_ENV?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PRO?: string;
  STRIPE_PRICE_ENTERPRISE?: string;
  STRIPE_PRICE_MESSAGE_OVERAGE?: string;
  STRIPE_PRICE_EMBEDDED_OVERAGE?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
