# `ganju.json` reference

The CLI finds `ganju.json` by walking up from the working directory, so any
command works from a subfolder.

## Top-level fields

| Field | Written by | Meaning |
| --- | --- | --- |
| `organizationId`, `projectId` | `ganju link` | Where the project deploys. Not secret; commit them so CI can deploy |
| `artifact` | `ganju link` | The project's server slug. Shown in messages, never used to resolve the target |
| `apiUrl` | you, optional | Another Ganju deployment. `GANJU_API_URL` overrides it. Default `https://api.ganju.ai` |
| `main` | you, optional | The router file when tools have no `entry`. Default `src/index.ts` |
| `connections` | you | OAuth providers the code may use via `ctx.connection` / `ctx.sendFile` (list below) |
| `allowedHosts` | you | Hosts `fetch` may reach. An entry covers its subdomains. **Empty = any public host** |
| `timeoutMs` | you, optional | Wall-clock budget per call. Default 10000, max 30000 |
| `resourceAccess` | you, optional | `"own"` (default): `ctx.resources.create/delete` only touch what a tool wrote. `"all"`: can also replace and delete uploaded and crawled resources |
| `tools` | you | Up to 50 tool declarations |

`connections`, `allowedHosts`, `timeoutMs` and `resourceAccess` are the same
four settings as the dashboard's Function **Settings** dialog. Both write the
same row. They are sent with every deploy, and the CLI only sends the keys
present in the file.

### Valid `connections`

`google-gmail`, `google-calendar`, `google-drive`, `microsoft-outlook`,
`microsoft-onedrive`, `slack`, `slack-user`.

Any other value fails the deploy with *"Invalid connection — no managed
provider by that name"*. Declaring one the user hasn't connected yet is
allowed; the call fails at run time with a message saying to connect it.
`ctx.sendFile` destinations map to `google-gmail` (`gmail`),
`microsoft-outlook` (`outlook`) and `slack` (`slack`).

## A tool

```json
{
  "name": "lookup-order",
  "title": "Look up order",
  "description": "Find an order by its id. Use when the customer gives an order number.",
  "entry": "src/lookupOrder.ts",
  "input": { "type": "object", "properties": { "orderId": { "type": "string" } }, "required": ["orderId"] },
  "output": { "type": "object", "properties": { "status": { "type": "string" } } }
}
```

| Field | Notes |
| --- | --- |
| `name` | `^[a-zA-Z0-9_-]+$`, max 64 characters, unique. This is the MCP tool name. Reserved: prefixes `gmail-`, `outlook-`, `slack-`, `calendar-`, `calcom-`, `web-`; names `greeting`, `list-resources`, `search-resources`, `read-resource`, `send-resource` |
| `title` | Human label shown in clients |
| `description` | What the model reads to decide whether to call it. Say when to use it. For side effects, tell it to confirm first |
| `entry` | Module whose default export is the handler. Either every tool has one or none do |
| `input` | JSON Schema for the arguments, sent as `inputSchema`. Defaults to an empty object schema |
| `output` | Optional JSON Schema for the result, sent as `outputSchema`. When present, the result must match or the call fails, and clients get structured output |

## The schema subset

Each property has exactly one `type`: `string`, `number`, `boolean`, `object`
or `array`.

| Keyword | Applies to |
| --- | --- |
| `description` | any, and worth writing for every input property, since the model reads it |
| `enum` | `string` |
| `pattern` | `string` (a JS regex; escape backslashes in JSON: `"^\\d{4}$"`) |
| `minLength`, `maxLength` | `string` |
| `minimum`, `maximum` | `number` |
| `items` | `array`, e.g. `{ "type": "string" }` or `{ "type": "object" }` |
| `required` | top level, a list of property names |

Consequences:

- **There's no `integer` type.** Use `number` and `Math.round` in the handler
  if a fractional value would break something.
- **There's no nullable type.** Omit a missing field; don't return `null`.
- **`object` properties aren't validated deeper** (they're any record), so
  nested structure is your code's responsibility.
- **The top level of `output` must be `"type": "object"`.** A tool that wants to
  return a list returns `{ "items": [...] }`.

## Router without `entry`

For a project written as one router file:

```json
{ "main": "src/index.ts", "tools": [{ "name": "lookup-order", "input": { … } }] }
```

```ts
// src/index.ts
import { createHandler, defineTool } from '@ganju/sdk';

export default createHandler({
  'lookup-order': defineTool(async (input, ctx) => ({ status: 'shipped' }))
});
```

The keys must match `tools[].name` exactly. Publishing checks the bundle's
exports against the manifest and refuses a mismatch.
