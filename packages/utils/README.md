# `@ganju/utils`

The shared kernel imported by every app and package. Framework-agnostic TypeScript with no runtime dependency on a specific app.

## What's in here

| Area              | Files                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Constants**     | [`constants.ts`](src/constants.ts) — mime types, provider URLs, platform message/file caps, LLM catalog, chunking config, status/role enums                      |
| **Crypto & auth** | [`crypto.ts`](src/crypto.ts), [`oauth.ts`](src/oauth.ts) — credential encryption, OAuth token refresh                                                            |
| **Security**      | [`ssrf.ts`](src/ssrf.ts) — block private/loopback/link-local hosts on untrusted egress                                                                           |
| **RAG**           | [`chunking.ts`](src/chunking.ts), [`embeddable.ts`](src/embeddable.ts), [`extractedDocument.ts`](src/extractedDocument.ts)                                       |
| **Channels**      | `*Send.ts` (slack/telegram/discord/whatsapp/gmail/outlook), [`channelNotifier.ts`](src/channelNotifier.ts)                                                       |
| **MCP/proxy**     | [`mcpProxy.ts`](src/mcpProxy.ts), [`jsonSchemaToZodShape.ts`](src/jsonSchemaToZodShape.ts), [`schema.ts`](src/schema.ts)                                         |
| **HTTP/util**     | [`fetcher.ts`](src/fetcher.ts), [`retry.ts`](src/retry.ts), [`parseHttpError.ts`](src/parseHttpError.ts), [`slug.ts`](src/slug.ts), [`getEnv.ts`](src/getEnv.ts) |

## Conventions

- **This is where constants live.** Don't hard-code mime types, provider URLs, size caps, or model names anywhere else — add them to [`constants.ts`](src/constants.ts) and import.
- "Enum" string columns in [`@ganju/db`](../db) are validated against the arrays exported here.
- Validation schemas use [Zod](https://zod.dev) ([`schema.ts`](src/schema.ts)).
