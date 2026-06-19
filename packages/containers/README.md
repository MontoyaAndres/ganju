# `@ganju/containers`

The [Cloudflare Container](https://developers.cloudflare.com/containers/) class wrapper for the resource-handler.

[`src/index.ts`](src/index.ts) exports:

- **`ResourceHandler`** — a `Container` subclass that runs the [`apps/resource-handler`](../../apps/resource-handler) Node server (port + DB env wired from the Worker env, `sleepAfter` from `@ganju/utils` constants).
- **`getResourceHandler(env)`** — helper to obtain the container instance from a caller Worker.

The Worker apps bind this as a Durable Object (`RESOURCE_HANDLER`) and declare the container image in their `wrangler.toml` (see [`apps/api/wrangler.toml`](../../apps/api/wrangler.toml)). Background on why it exists: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
</content>
