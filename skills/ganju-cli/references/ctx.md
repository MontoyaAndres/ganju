# `ctx` and the runtime

A handler is `defineTool<Input>(async (input, ctx) => output)` from
`@ganju/sdk`. `defineTool` only types the handler; the generic types `input`.
`@ganju/sdk` isn't bundled. The deploy attaches it next to the script, so its
version always matches the platform.

## Runtime

- **Cloudflare Workers, without Node compatibility.** Available: `fetch`,
  `Request`/`Response`, `URL`, `crypto.subtle`, `crypto.randomUUID`,
  `TextEncoder`/`TextDecoder`, `Intl`, `atob`/`btoa`, `setTimeout`. Not
  available: `fs`, `process`, `Buffer`, `node:*` modules, `require`, `eval`.
- **Limits per call:** 5 s of CPU, `timeoutMs` of wall clock (default 10 s,
  max 30 s), 128 MiB memory, 3 MB bundle.
- **Rate limits:** 60 calls per minute per tool, and a shared budget of 60
  outbound requests per minute per project. Keep fan-out small; `Promise.all`
  over 100 URLs will hit it.
- **Egress:** every `fetch` goes through the platform. A host not in
  `allowedHosts` comes back as an ordinary **403 response**, not an exception,
  with body `{"error":"Blocked by Ganju: … is not in this tool's allowed hosts…"}`.
  Check `response.ok`. Private, loopback and link-local addresses are always
  blocked.
- **Errors:** a thrown `Error` becomes the tool's error result, and its message
  is what the model sees. Make it actionable.

## `ctx.log(...values)`

Buffered and returned with the result. Costs no network round trip. Only the
first 50 lines per call are kept. Non-strings are JSON-encoded. Shown by
`ganju test` and `ganju logs`.

## `ctx.secret(name): Promise<string>`

Reads a value stored with `ganju secret set NAME`. Throws
`No secret named "NAME" is stored for this tool…` if it's missing. It's
resolved on every call, so rotating needs no redeploy. Don't log it or return
it.

## `ctx.connection(provider): Promise<{ provider, accessToken, expiresAt }>`

A short-lived OAuth access token for an account connected on the project's
Tools page. The platform refreshes it, and the refresh token never reaches the
code. Call the provider's API directly with `authorization: Bearer <token>`,
and add the API host to `allowedHosts` (e.g. `www.googleapis.com`,
`graph.microsoft.com`, `slack.com`).

Throws, in this order:
- `"X" is not one of this tool's declared connections…`: add it to
  `connections` and redeploy.
- `"X" is not connected on this artifact. Connect it on the Tools page.`: the
  user has to connect it in the dashboard.
- `The "X" connection needs to be re-authorized…`: the user re-links it in the
  dashboard.

## `ctx.resources`

Resources are the project's knowledge: uploaded files, crawled sites, and what
tools write.

```ts
search(query: string, limit?: number): Promise<Array<{
  uri; title; description?; mimeType; chunkIndex; score; excerpt
}>>
```
Semantic search over **indexed** resources. `limit` defaults to 5, max 20.
Returns passages, so one resource can appear several times; dedupe by `uri`
if you want documents.

```ts
list(): Promise<Array<{ uri; title; description?; mimeType }>>
```
Metadata for every resource on the project. Filter by a uri prefix to find your
own.

```ts
read(uri: string): Promise<{ uri; mimeType; text }>
```
Text content. Throws `Resource not found: <uri>` if it's missing. A binary file
(PDF, image) is refused with a message pointing at `sendFile`; code can't read
binary resources.

```ts
create({
  title,                 // required, ≤ 200 chars
  content?, bytes?,      // exactly one: text ≤ 1 MB, or binary ≤ 10 MB (ArrayBuffer | Uint8Array | base64 string)
  uri?,                  // default derived from title; reuse a uri to replace a resource the tool wrote earlier
  mimeType?,             // e.g. text/markdown, text/csv, application/json, application/pdf, image/png
  description?,
  fileName?,             // the attachment name when sent, e.g. "report-2026-09-18.md"
  index?                 // true = searchable by search() and the assistant; default false
}): Promise<{ uri; title; mimeType; size; created /* false = replaced */; indexed }>
```
- **Use a stable `uri`**, like `resource://reports/<date>`, so re-runs replace
  instead of piling up.
- **A uri held by an uploaded or crawled resource is refused** unless
  `resourceAccess` is `"all"`.
- **`index: true` is a deliberate choice.** It puts the content where the
  assistant answers from, and uses embedded-storage quota. Indexing is async:
  the resource is readable at once and searchable seconds later.

```ts
delete(uri: string, { children?: boolean }): Promise<{ uri; deleted; count }>
```
Idempotent: a missing uri gives `deleted: false`, not an error. Limited by
`resourceAccess`. A resource with children, such as a crawled site's pages,
needs `{ children: true }`.

## `ctx.sendFile(options): Promise<{ id; threadId?; conversationId?; channel?; ts?; permalink? }>`

Sends existing resources as real attachments. It takes **uris, never bytes**:
the platform streams the file from storage, so it can send files far larger than
the Worker could hold. To send something the tool generated, `create` it first,
then send its uri.

```ts
await ctx.sendFile({
  to: 'gmail',                       // needs "google-gmail" in connections
  uris: [saved.uri],                 // up to 10
  message: { to: 'a@b.com', subject: '…', body: '…', contentType: 'text/plain', cc?, bcc?, threadId? }
});

await ctx.sendFile({
  to: 'outlook',                     // needs "microsoft-outlook"
  uris: [uri],
  message: { to: 'a@b.com', subject: '…', body: '…', contentType: 'text' /* or 'html' */ }
});

await ctx.sendFile({
  to: 'slack',                       // needs "slack"
  uris: [uri],                       // exactly one
  message: { channel: 'C0123…' /* or '#general' */, title?, initialComment?, threadTs? }
});
```

Size limits: Gmail about 18 MB combined raw. Outlook and Slack have their own
per-file caps.

## Local unit tests

Outside Ganju, `ctx` doesn't exist; a real one throws *"This tool is running
without its Ganju bindings"*. To unit-test a handler, import its default export
and call it with a hand-made `ctx`:

```ts
const ctx = { log: console.log, secret: async () => 'test', resources: { … } } as any;
console.log(await handler({ city: 'Lisbon' }, ctx));
```

`ganju test` stays the real check, because it runs with the real bindings,
egress rules and schemas.
