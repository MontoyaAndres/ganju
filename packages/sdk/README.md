# `@ganju/sdk`

The typed `ctx` a Ganju custom tool is written against.

```bash
npm install --save-dev @ganju/sdk
```

A custom tool is a Cloudflare Worker you write, deployed to Ganju with
[`@ganju/cli`](https://www.npmjs.com/package/@ganju/cli) and registered as MCP
tools on your project. This package is what makes `ctx` autocomplete while you
write one.

```js
import { defineTool } from '@ganju/sdk';

export default defineTool(async (input, ctx) => {
  const { accessToken } = await ctx.connection('google-gmail');
  const res = await fetch(`https://api.acme.com/orders/${input.orderId}`);
  ctx.log('looked up ' + input.orderId);
  return { status: (await res.json()).status };
});
```

## Mostly a dev dependency

`ganju build` marks this package **external** and rewrites the import to
`./ganju-sdk.js` — the sibling module Ganju attaches beside your script on every
deploy. So the runtime code your tool executes is the one the platform ships,
and what you install here is the types and the shape.

That is deliberate rather than incidental: the SDK is typed sugar over host
bindings, and a copy frozen into a customer's bundle is a copy that stops
matching the broker it talks to. **The security lives in the bindings, not in
this package** — a library that performed the token exchange itself would expose
the client secret to user code.

## What `ctx` gives you

| Member | Contract |
| --- | --- |
| `ctx.connection(provider)` | `{ accessToken, provider, expiresAt }`. Short-lived. **Never** a refresh token or client secret. Throws unless the provider is in the tool's declared `connections`. |
| `ctx.secret(name)` | A value set with `ganju secret set`, resolved per call — so it is live from the next call with no deploy after it. |
| `ctx.resources.search / read / list` | The same retrieval the native RAG tools use. Binary resources are refused rather than base64'd — that is what `sendFile` is for. |
| `ctx.resources.create(opts)` | Write a resource: inline text or file bytes. Not indexed unless `index: true`, so tool output stays out of the search corpus by default. |
| `ctx.resources.delete(uri, opts)` | Remove one, and with `children: true` everything beneath it. Idempotent — a uri with nothing behind it answers `deleted: false`. |
| `ctx.sendFile(opts)` | Mail or post a file to `gmail`, `outlook` or `slack` without the bytes passing through your isolate. The destination must be in your declared `connections`. |
| `ctx.log(...)` | Buffered in the isolate and returned with the result, so a log call costs no round trip. Read them with `ganju logs`. Capped at 50 lines. |
| `fetch` | Global, screened against your declared `allowedHosts` and against private/loopback ranges. |

Not available: `require`, `process`, `fs`, raw database access, or anything
belonging to another project. User scripts get the plain Workers runtime with no
`nodejs_compat`.

## Two ways to export

One script serves every tool your project declares, so the deployed module's
default export routes on the tool name. Give each tool an `entry` in
`ganju.json` and the CLI generates that router for you — the export above is all
you write. Or write the map yourself:

```js
import { createHandler, defineTool } from '@ganju/sdk';

export default createHandler({
  'lookup-order': defineTool(async (input, ctx) => ({ status: 'shipped' }))
});
```

The keys must match the tool names in `ganju.json`. Publishing verifies that
against what the bundle actually exports, so `lookup-order` versus `lookupOrder`
fails at deploy rather than on the first customer call.

## License

Apache-2.0.
