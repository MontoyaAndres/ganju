# `resource-handler` — Node container

A plain Node HTTP server packaged as a [Cloudflare Container](https://developers.cloudflare.com/containers/) and reached from the Workers over a Durable Object binding (`RESOURCE_HANDLER`). Entry point: [`src/server.ts`](src/server.ts).

## Why it exists

Cloudflare Workers are capped at 128 MiB and can't run native binaries. Anything CPU- or memory-heavy lives here instead, so the Workers stay light.

## Endpoints

| Route                                                          | Purpose                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /health`                                                  | Liveness check                                                                              |
| `POST /extract`                                                | Document → text (PDF via `unpdf`, Word via `mammoth`, Excel via `xlsx`, etc.) for embedding |
| `POST /crawl/discover`                                         | Discover URLs to crawl on a site                                                            |
| `POST /crawl/page`                                             | Fetch a single page (Cheerio or Playwright renderer)                                        |
| `POST /{gmail,outlook,slack,telegram,discord,whatsapp}/send`   | Send an artifact resource as a file into a channel                                          |
| `POST /{slack,telegram,discord,whatsapp}/send-remote-resource` | Stream a proxied **remote MCP** resource as a file (bytes never transit a Worker)           |

## Layout

| Path                               | What                            |
| ---------------------------------- | ------------------------------- |
| [`src/extract.ts`](src/extract.ts) | Document text extraction        |
| [`src/crawl.ts`](src/crawl.ts)     | Crawl discovery + page fetch    |
| [`src/*Send.ts`](src)              | Per-platform file senders       |
| [`src/utils`](src/utils)           | HTTP/multipart/filename helpers |

## Build & run

Built with esbuild ([`esbuild.config.mjs`](esbuild.config.mjs)) and shipped via [`Dockerfile`](Dockerfile). Locally it's started by Wrangler (Docker required) on port `8082`; the Container class is registered in [`packages/containers`](../../packages/containers) and wired into the API Worker's `wrangler.toml`.
