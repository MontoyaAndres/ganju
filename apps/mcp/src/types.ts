import type {
  DispatchNamespace,
  Fetcher,
  Hyperdrive,
  KVNamespace,
  R2Bucket
} from '@cloudflare/workers-types';
import type { ResourceHandler } from '@ganju/containers';

export type Variables = {
  authContext: {
    kind: 'jwt' | 'internal';
    userId?: string;
    artifactSlug?: string;
    scopes?: string[];
    isBotToken?: boolean;
  };
};

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type Bindings = {
  HYPERDRIVE: Hyperdrive;
  STORAGE_BUCKET: R2Bucket;
  JWKS_CACHE: KVNamespace;
  RESOURCE_HANDLER: DurableObjectNamespace<ResourceHandler>;
  API: Fetcher;
  DISPATCH?: DispatchNamespace;
  HTTP_ENDPOINT_RATE_LIMITER?: RateLimitBinding;
  DATABASE_URL?: string;
  NODE_ENV?: string;
  NEXT_PUBLIC_API_URL?: string;
  MCP_INTERNAL_SECRET?: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
