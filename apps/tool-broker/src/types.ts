import type { Hyperdrive, Queue, R2Bucket } from '@cloudflare/workers-types';
import type { ResourceHandler } from '@ganju/containers';
import type { CustomCodeToolConfig } from '@ganju/utils';

export type Variables = {
  // Set by ToolAuthMiddleware once the bearer token verifies. Every route reads
  // the artifact from here and never from the request body — a user script is
  // free to lie about which artifact it is, so nothing it sends may name one.
  tool: {
    artifactId: string;
    // The artifact_tool row id, used as the rate-limit key so a custom-code
    // script shares one budget with the rest of its artifact's proxied calls.
    artifactToolId: string;
    versionId: string;
    config: CustomCodeToolConfig;
  };
};

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type Bindings = {
  HYPERDRIVE: Hyperdrive;
  STORAGE_BUCKET: R2Bucket;
  INDEX_QUEUE?: Queue<{ resourceId: string }>;
  RESOURCE_HANDLER: DurableObjectNamespace<ResourceHandler>;
  HTTP_ENDPOINT_RATE_LIMITER?: RateLimitBinding;
  DATABASE_URL?: string;
  NODE_ENV?: string;
  CRYPTO_SECRET?: string;
  CUSTOM_CODE_TOKEN_SECRET?: string;
  EMBEDDING_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
