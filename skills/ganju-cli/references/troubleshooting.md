# Troubleshooting

Errors are listed by where they appear. Messages are quoted as the CLI or
platform prints them.

## Setup and auth

| Message | Cause | Fix |
| --- | --- | --- |
| `No ganju.json found in this directory or any above it` | Wrong folder | `cd` into the project, or `ganju init` |
| `… is not linked to a project` | No `organizationId`/`projectId` | `ganju link --organization … --project …` |
| `Not logged in to <url>` | No stored login for that API URL | The user runs `ganju login`. Logins are per API URL, so check `GANJU_API_URL` / `apiUrl` |
| `Your session has expired` | Browser login token expired | The user runs `ganju login` again |
| `GANJU_API_TOKEN was not accepted` | Token revoked, expired, or for another project | Mint a new one with `ganju token create` from a browser login |
| `Cannot ask "…" — this is not an interactive terminal` | A prompt with no TTY | Pass the flag, e.g. `link --organization/--project` |
| `No organization named "X"` / `No project named "X"` | Name mismatch | The hint lists the available names. Retry with one of them |
| `GANJU_API_TOKEN is set, and a token cannot … tokens` | Token management with a token | Unset it and use a browser login |
| A plan or upgrade error on `deploy`/`test` | Functions need Pro | The organization owner upgrades. It's not a code problem |

## Build

| Message | Cause | Fix |
| --- | --- | --- |
| `<file>:<line>:<col> — …` | esbuild syntax or resolve error | Fix that line. For a missing package, `npm install` it |
| `Every tool needs an "entry", or none of them do — missing on …` | Mixed router styles | Add `entry` to the named tools, or remove all of them and use `main` |
| `… declares no tools` | Empty `tools` | Add at least one |
| `The entry for "X" does not exist: …` | Wrong `entry` path | Paths are relative to `ganju.json` |
| `The bundle is X, over the 3 MB limit` | Heavy dependency | Drop it, or fetch data at call time instead of embedding it |
| A package fails at run time with `node:`/`fs`/`Buffer` | Node-only dependency | Use a Worker-compatible package, or `fetch` / `crypto.subtle` / `TextEncoder` |

## Deploy (manifest and config validation)

| Message | Fix |
| --- | --- |
| `Invalid tool name — reserved by the platform` | Rename. Avoid `gmail-`, `outlook-`, `slack-`, `calendar-`, `calcom-`, `web-` and the built-in names |
| `Tool name may only contain letters, digits, underscore or hyphen` | Rename |
| `Tool names must be unique within a version` | Rename the duplicate |
| `Invalid connection — no managed provider by that name` | Use one of: `google-gmail`, `google-calendar`, `google-drive`, `microsoft-outlook`, `microsoft-onedrive`, `slack`, `slack-user` |
| An `outputSchema` type error | The top level of `output` must be `"type": "object"` |
| `The bundle does not export …` / `This script does not export a tool named "X"` | With a hand-written `main` router, its keys must equal `tools[].name` |

A deploy that fails partway leaves a **draft** version. That's expected and
harmless. The next deploy creates a fresh one.

## Test and live calls

| Symptom | Cause | Fix |
| --- | --- | --- |
| `the input does not match the tool's own input schema` + paths | Test input is wrong, or the schema is stricter than intended | Fix the `--input`, or relax the schema |
| `the output does not match the declared output schema` | Returned `null`, a wrong type, or a non-object | Omit absent fields; match the declared types |
| Response 403 `Blocked by Ganju: "host" is not in this tool's allowed hosts` | Host missing from `allowedHosts` | Add it and redeploy. `fetch` doesn't throw here; check `response.ok` |
| `Blocked by Ganju: … private, loopback or link-local address` | Calling localhost or an internal IP | Not possible; expose a public endpoint |
| `Blocked by Ganju: this artifact has exceeded its outbound request limit` | Over 60 outbound requests a minute | Fewer requests per call, caching, or batching |
| `"X" is not one of this tool's declared connections` | Missing from `connections` | Add it and redeploy |
| `"X" is not connected on this artifact` | Account not connected | The user connects it on the project's Tools page |
| `The "X" connection needs to be re-authorized` | Consent revoked or scopes changed | The user re-links it on the Tools page |
| `No secret named "X" is stored for this tool` | Secret missing or misspelled | `ganju secret list`; names are case-sensitive |
| `Resource not found: <uri>` | Wrong uri, or deleted | `ctx.resources.list()` to see real uris |
| `A resource with this uri already exists on this artifact and was not created by a tool…` | `create` aimed at an uploaded or crawled resource's uri | Use your own uri prefix, e.g. `resource://my-tool/…` |
| `This resource was not created by a tool, so it cannot be deleted from one…` | `delete` under `resourceAccess: "own"` | Leave it alone, or set `"all"` if the tool really should manage uploads |
| `This resource has children… Pass { children: true } to confirm.` | Deleting a crawled site or imported folder | Pass `{ children: true }` if you mean all of it |
| The call times out | Slow upstream, or too much sequential work | Parallelise, reduce work, or raise `timeoutMs` (max 30000) |
| `This tool is running without its Ganju bindings` | Handler run outside Ganju with a real `ctx` | Use `ganju test`, or pass a fake `ctx` in unit tests |

## Finding out what happened

```bash
ganju logs --tool <name> --limit 50     # recent real calls: latency, error, ctx.log lines
ganju logs --json                       # the same, for parsing
ganju versions                          # which version is live; versions with errors are flagged
ganju test <name> --version active --input '…'   # reproduce against the live code
ganju rollback <n>                      # put a known-good version back
```
