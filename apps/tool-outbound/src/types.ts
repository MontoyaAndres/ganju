export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

// `artifactId` and `allowedHosts` are outbound-worker parameters, not bindings:
// the dispatcher supplies their values on each `DISPATCH.get()` and the runtime
// surfaces them here as env entries. Declared as optional strings because a
// misconfigured namespace would simply omit them, and the screen must fail
// closed on the host check rather than crash.
export type Bindings = {
  artifactId?: string;
  allowedHosts?: string;
  HTTP_ENDPOINT_RATE_LIMITER?: RateLimitBinding;
  NODE_ENV?: string;
};
