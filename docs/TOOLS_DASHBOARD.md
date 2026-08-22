# Tools dashboard rework

State of the Tools page rebuild and the platform changes underneath it. Companion to [CUSTOM_TOOLS.md](CUSTOM_TOOLS.md), which remains the plan of record for the runtime; this covers the dashboard work and the four platform changes it required.

**Everything described here is uncommitted.** `HEAD` is at `669136a`; the work sits in the working tree, unstaged.

---

## Why the page changed

The old page had two tabs, **Installed** and **Catalog**, and one way to add a tool: find its card, toggle it on. That shape stopped fitting once a tool could be something the user *writes* rather than something we ship.

Three problems it had:

- **"Installed" is a database fact, not a user concept.** Nobody wants to see a list of rows; they want to know what their agent can do right now. Two tabs meant a tool's state was in one place and the tool itself in another.
- **Turning a tool off deleted it.** Tolerable when config was a field or two. Destructive the moment a "tool" is a function someone wrote — turning it off to debug a bloated tool list must not delete the code.
- **Nowhere to put code.** A code editor, a version list, and a deploy button have no home in a grid of integration cards.

The new shape is three tabs in a fixed order — **Functions · HTTP Endpoints · Catalog** — matching the three things a user can put on their server: code they wrote, endpoints they pointed at, integrations we ship.

---

## What shipped

### 1. The tool catalog is code, not rows

`tool_group` and `tool_definition` held static reference data that only meant something paired with a handler in [registry.ts](../apps/mcp/src/tools/registry.ts). A row whose key had no handler did not error — the boot loop skipped it and the tool quietly vanished from the customer's server. The rows were seeded per environment by hand, so a definition could exist on dev and not production, which is exactly what had happened to `custom-code`.

Every consumer of the `artifact_tool → tool_definition` join did one thing with it: resolve the id back into `tool_definition.key`. So the join became the key.

- [toolCatalog.ts](../packages/utils/src/toolCatalog.ts) — 12 groups, 62 tools, generated from precisely the rows [migration 0065](../packages/db/drizzle/0065_tool_catalog_to_code.sql) drops.
- `toolRegistry` is now `Record<ToolKey, ToolDefinition>`. A catalog entry with no handler, or a handler no entry offers, is a **build failure**. Verified in both directions.
- `artifact_tool.tool_definition_id` → `tool_key text not null`.
- `describeCatalogTool()` attaches the entry server-side, so API responses keep their shape and no client carries its own copy of the catalog.
- `scripts/seed-custom-code.mjs` is gone, and with it the "not seeded on this deployment" error.

**`mcp_server_catalog` deliberately stayed in Postgres.** Its rows point at a *remote* server whose tools, resources and prompts are discovered at configure time. Nothing in our code implements them, so there is no pair to keep in step and no build-time guarantee to win.

Read paths are lenient by design: a stored key the current catalog no longer offers still parses, and the boot loop skips what it cannot resolve rather than failing the artifact. Writes validate against `isToolKey`.

### 2. Disabling a tool no longer destroys it

[Migration 0066](../packages/db/drizzle/0066_artifact_tool_enabled.sql) adds `artifact_tool.enabled`, defaulting true so every existing install is untouched.

- The boot loop drops disabled rows before the ordering sort — they don't register, don't claim their name against another install, and don't cost the model a schema every turn.
- `PATCH …/artifact/tool/:toolId/enabled` — deliberately its own route. `updateTool` re-validates config and re-runs remote discovery for mcp-proxy; nobody should pay a network round trip to flip a switch, or have the toggle fail because a remote server is down. Idempotent, because two tabs on one page is the ordinary way you ask for a state something is already in.
- `loadProxiedPrompts` skips disabled servers.

**`artifactToolCount` now counts enabled tools, not rows.** "7 tools on Free" should mean seven tools your server exposes. It follows that *enabling* re-checks the quota — that's the one place a user can cross the cap without creating anything (disable three, enable four), and it has to be caught there, since at boot the only available answer would be silently dropping a tool the dashboard shows as on.

**Both actions are on every row, because they are different actions.** Off keeps the row and everything configured on it; Remove deletes both. A first pass shipped only one of them per surface — catalog rows had a switch and no way to delete, remote MCP servers had Disconnect and no way to go quiet — which left each surface missing the safer half of the pair. Now:

| Surface | Off | Remove |
|---|---|---|
| Catalog tool row | switch | trash, only once a row exists |
| HTTP endpoint | switch | trash |
| Remote MCP server | switch in its dialog | Disconnect, as before |

Two supporting details. A disabled row carries an **`Off · settings kept`** chip, because on a switch alone "off" and "never installed" look identical and one of them is holding a configuration somebody chose. And the delete confirmation now says what delete does that off doesn't — it takes the settings with it — since anyone opening it to shorten their tool list wants the other control.

### 3. Custom code is a paid feature, with a server-side gate

| Plan | `canUseCustomCode` | `maxHttpEndpointsPerArtifact` | tools |
|---|---|---|---|
| FREE | ✗ | 3 | 7 |
| PRO | ✓ | unlimited | unlimited |
| ENTERPRISE | ✓ | unlimited | unlimited |

`assertCustomCodeAllowed` and `assertHttpEndpointQuota` in [plan.ts](../apps/api/src/utils/plan.ts), enforced from every write path that can produce a running script — `createTool`, `resolveCustomCodeTool` (create version, upload bundle), the test run, and publish/rollback — so the CLI can't route around the dashboard.

Publish and rollback needed their own call. They resolve the tool read-only, since neither installs anything, so they were the two endpoints that deploy code without asking the plan — and they are the ones that most literally deploy it. A downgraded org keeps its row, its versions and their bundles, so a gate everywhere else and not there is no gate at all.

The custom-code check sits *before* the existing-row shortcut in [customCode.ts](../apps/api/src/controllers/artifact/customCode.ts): an org that installed on Pro and then downgraded still holds the row, and the question every write asks is whether it may deploy code **now**.

The two caps count different things on purpose. The tool quota counts enabled tools, so disabling frees a slot. The endpoint cap counts *rows*, because disabling leaves the definition behind — if that freed a slot, the cap would be unbounded by toggling.

### 4. Three tabs, one list, a visible budget

**Fixed order on every plan.** Only which tab opens first changes — Free lands on Catalog, paid on Functions — pinned after the first resolve so the page never moves mid-task. A tab order that changes on upgrade day makes every screenshot and support answer plan-dependent for no gain.

**Functions is locked, not hidden, on Free**: dimmed tab, Pro badge, and the real editor rendered as an inert preview. Seeing what you'd get converts; an empty locked door doesn't.

**Catalog is now one list.** The 178-line Installed accordion is gone. Filters — All / On / Off / Needs connection — replace the tab split, answered by both native groups and remote MCP servers. Per-tool configuration moved onto the group-detail rows, which is the one thing the accordion uniquely offered.

**A tool budget meter** sits above the controls, counting *exposed* tools against `CHANNEL_MAX_TOOLS`:

```
14 of 40 tools exposed
Each one is re-sent to the model on every turn.
```

Not a row count — a `custom-code` row contributes one per manifest entry and an `mcp-proxy` row one per allowed remote tool, so the three kinds count differently to reach the number a client actually sees. The measurement that justifies it: an artifact with 5 tools averages ~1.1k input tokens/turn; one with 12 averages ~13k. The number belongs next to the switches that spend it.

### 5. The editor, with no compiler anywhere

The decision that shapes everything else: **the SDK ships as a second ES module beside every uploaded script**, rather than being bundled into it.

[`build-worker-module.mjs`](../packages/sdk/scripts/build-worker-module.mjs) bundles the SDK once at build time into a self-contained module; [customCodeDeploy.ts](../apps/api/src/utils/customCodeDeploy.ts) attaches it to every upload. Dashboard code does `import { createHandler } from './ganju-sdk.js'` and deploys **exactly as typed** — no build step between the text box and the running Worker, which is also what lets stored source round-trip without a second copy that could drift.

Attached unconditionally, CLI uploads included: a bundle that inlined the SDK never imports it, and one unused module costs less than a branch that has to know which kind it's holding.

**The module is 10.2KB.** It was 71.7KB until `@ganju/utils/constants` — one large object literal a bundler cannot tree-shake — was split. [sdkConstants.ts](../packages/utils/src/sdkConstants.ts) holds the 14 values the SDK reads at runtime and imports nothing; `constants.ts` imports them back, so there is still one definition of each. The rule for that file is written at its top.

**`sourceKind`** ([migration 0067](../packages/db/drizzle/0067_version_source_kind.sql)) records whether stored bytes are readable. `'editor'` means a person typed them; `'bundle'` means the CLI compiled them — deployable but minified, so the editor shows it read-only rather than inviting someone to overwrite a real build with the contents of a text box. Defaults to `'bundle'`, which is what every pre-editor version genuinely is.

- `GET …/custom-code/version/:versionId/source` → `{ source, sourceKind, editable, tools }`. Returns `editable: false` rather than 403 for a CLI bundle: seeing what's deployed is legitimate, and "here it is, read-only" beats an error that reads like the version is missing.
- `PUT …/version/:versionId/bundle?kind=editor` — the CLI sends nothing and keeps getting `bundle`.

### 6. The Functions tab

[FunctionsPanel.tsx](../apps/web/src/components/views/tools/FunctionsPanel.tsx) holds it: declare a function, edit it, read what is deployed, deploy, and go back.

**The editor is Monaco**, the one VS Code is built on — because people are meant to actually write code here, and a lighter editor reads as a toy the moment someone reaches for a shortcut it doesn't have. [MonacoSurface.tsx](../apps/web/src/components/views/tools/MonacoSurface.tsx) is the instance; [CodeEditor.tsx](../apps/web/src/components/views/tools/CodeEditor.tsx) is the chrome around it.

It is loaded through `next/dynamic` with `ssr: false` — it builds a live DOM view on mount, and a Worker has nothing to give it — and **served from this origin**, not a CDN. [copy-monaco.mjs](../apps/web/scripts/copy-monaco.mjs) copies `monaco-editor/min/vs` into `public/monaco/vs`, from `build` and from `dev`; the directory is generated and gitignored. The default would put the editor on jsdelivr's uptime and need a CSP hole for scripts and workers. It is not bundled either: Monaco's ESM entry imports global CSS, which the pages router refuses from `node_modules`, and its language services are web workers every bundler wires up differently. The AMD loader sidesteps both. 10.6MB of assets — 101 files, minus the CSS and HTML workers and the non-English translations nothing here requests — and **the app's own JS grows by 9KB gz in a chunk absent from the tools page's initial bundle**, so Monaco is fetched only when the Functions tab renders.

**`ctx` autocompletes, from the SDK's real declarations.** [build-editor-types.mjs](../packages/sdk/scripts/build-editor-types.mjs) flattens the compiled `.d.ts` files into one 10KB module exported as `@ganju/sdk/editorTypes`, registered as an extra lib at the two paths Node-style resolution tries for `./ganju-sdk.js`. Generated rather than hand-written beside the SDK: a second copy of that surface drifts the first time a method is added, and the doc comments make the trip, so hovering `ctx.sendFile` in the browser shows the same paragraph as hovering it in a local editor.

**The language is JavaScript, and that is a constraint rather than a preference.** The file is deployed byte for byte with no build step, so type annotations would reach the runtime as syntax errors — which is exactly how Monaco reports them. Checking still runs, against the SDK's types and whatever JSDoc the author writes.

**What the runtime refuses, the editor refuses.** The `lib` is `esnext` + `dom` and deliberately not `@types/node`, so `process`, `require` and `Buffer` are unknown here because they are unknown there. `dom` is what supplies honest types for `fetch`, `Request`, `Response`, `URL` and `crypto` — a Worker has those — and it drags in `window` and `localStorage`, which it does not. So a marker pass flags those, plus `eval`/`new Function` (blocked by the runtime) and any import that isn't `./ganju-sdk.js` (nothing resolves modules at runtime), each with the reason and the way around it. This is a courtesy, not a control — the real enforcement is the outbound worker, the CPU ceiling and the broker token, exactly as [CUSTOM_TOOLS.md](CUSTOM_TOOLS.md) has it — but a refusal at the keystroke beats one at deploy time and much beats one at call time.

**Two editor affordances are turned off**: link detection, because a URL in pasted code becoming a click out of the dashboard is a phishing surface for nothing gained; and drop-into-editor, because nothing useful comes of dropping a file into a Worker script and the wrong one silently replaces the buffer.

**And the editor says what it is not.** A notice above it: no terminal, no `npm install`, this file is deployed exactly as written — to use a package, bundle it locally and upload with the CLI, and everything in `ctx` is there without installing anything. Better said once, in place, than discovered by typing a command into a buffer with nowhere to put it.

**Draft and deploy are separate buttons**, because saving and exposing are separate acts. Save draft creates a version and stores the source, and not one MCP client sees it; Deploy publishes. Deploying an untouched draft publishes *that* version rather than minting a second one identical to it. ⌘S saves a draft — the keystroke everyone's hands already make.

**Version metadata is on the page, not implied by it.** A version is the unit of both code and contract — the tool names a client sees come from that row, not from the running script — so the panel states which one is open, its status, its function count, whether its source came from the editor or the CLI, and when it was created and published.

**History is a picker, not a list.** Every version is an option in one dropdown — `v3 · live`, `v2 · published`, `v1 · draft · failed` — and choosing one opens its code, because the panel already fetches the source for whatever version is open. A list of rows was a second place to read the same facts the metadata grid states, and it put a Deploy button beside every draft when only one of them can be the thing you are looking at. What survives is state-dependent and singular: Deploy publishes what is open (or mints a version from the editor when it has been touched), and a published version that is not the live one offers Roll back instead — a different endpoint, and a different thing to have happened.

**The editor appears once there is a function.** With an empty manifest the panel stops at its empty state, since the handler stub is generated from the declaration: an editor offered before then holds a file whose keys nothing would match, next to a Save draft and a Deploy that are both already disabled for the same reason.

**Every JSON field is an editor, not a textarea.** Input schema, output schema, sample input, the endpoint's body template and its whole-config JSON mode — all of them are Monaco with the JSON language service ([JsonEditor.tsx](../apps/web/src/components/views/tools/JsonEditor.tsx)), so a missing quote is underlined where it is instead of surfacing as "not valid JSON" after clicking Save. The two schema fields validate against a JSON Schema describing the schema subset the server accepts, so `"type": "date"` is refused at the keystroke rather than by a 400; the sample-input field validates against the function's own input schema and completes the arguments it declares. The body template is the exception that proves the rule — highlighting, no validation, because `{{orderId}}` where a number goes is legal there and only has to parse once the arguments are filled in.

Sharing the Monaco instance is what makes this cheap: the JSON surface is a second small module beside the JavaScript one, both configured through the same loader, so a JSON field costs nothing once the tab has loaded the editor. It did cost one fix — `copy-monaco.mjs` was skipping `json.worker` along with the CSS and HTML ones, and a missing language-service worker fails invisibly: the editor still renders, and simply never reports anything.

**A function row expands to its schemas** — the input the model may pass, the output it gets back — and edits in place. Renaming through that modal renames the handler key in the source too: the manifest and the code are checked against each other by the health probe, so a rename in one place only is a deploy that fails on a name the author thought they had changed. Removing a function drops it from the manifest and leaves the handler in the code, because an export the manifest doesn't declare is harmless and deleting someone's code from under them is not.

**A script is a set of files, and the explorer is what says so.** [FileExplorer.tsx](../apps/web/src/components/views/tools/FileExplorer.tsx) renders the tree beside the editor: every file in the project, the folders they sit in, and `ganju-sdk.js` dimmed at the bottom because it is attached to every deploy and is part of the honest answer to "what is in my script". New file and New folder create beside whatever is selected; `index.js` cannot be deleted, since it is the module the dispatcher calls.

The storage moved to match. `sourceKind: 'editor'` bytes are now a JSON envelope of `{ path: source }` ([customCodeProject.ts](../packages/utils/src/customCodeProject.ts)), and the deploy uploads **one module per file** — which the upload API has always accepted, since that is how the SDK travels. `'bundle'` bytes are untouched: a CLI bundle *is* one module, and wrapping it would mean the stored bytes are no longer the thing that runs. The two are told apart by a marker in the envelope rather than by whether the bytes parse as JSON, because guessing is not a thing to do with someone's deploy.

Folders are not stored, because there is nothing to store: a folder is a prefix shared by paths, so an empty one lives in the session and is gone on reload. The alternative — writing a placeholder file to hold a prefix — puts a module in the customer's Worker that nobody wrote.

Paths are validated where they are written rather than at deploy time: `.js` only, no `..`, no leading slash, not `ganju-sdk.js`, no two files differing only in case, 25 files at most. Each of those is a deploy that would otherwise fail in the runtime, hours after the edit that caused it.

**Proven against the real namespace, because the whole thing rests on it:** a four-module script uploaded, `index.js` imported `./lib/greet.js`, and `lib/greet.js` imported `./nested/constants.js` — driven through the deployed dispatcher over MCP, with the result coming back through all three.

**The new-function modal writes the manifest entry and the handler stub from one click**, for the same reason: `lookup-order` vs `lookupOrder` would deploy and then fail every call. Generating both together is what keeps them from ever disagreeing.

The handler is written as a named function above the export, typed with JSDoc, and the map only names it:

```js
/** @type {import('./ganju-sdk.js').ToolHandler<{ orderId: string; includeItems?: boolean }>} */
const lookupOrder = async (input, ctx) => {
  ctx.log('lookup-order called');
  return { ok: true };
};

export default createHandler({
  'lookup-order': defineTool(lookupOrder)
});
```

The `@type` line is not decoration, it is the only way to keep `ctx` typed here. `defineTool` infers the parameters of a function passed straight to it, and these are declared above the map and passed by name — so without it `input` and `ctx` land as `any`, which costs the completion that is most of the reason to use the SDK. A TypeScript annotation is not available: the file is deployed exactly as written, so `(input: Input, ctx: ToolContext)` would reach the runtime as a syntax error. JSDoc is JavaScript.

The input type is generated from the tool's own declared schema — `input.orderId` completes, and a property nobody declared does not — and it is rewritten when the schema changes, on the same anchor and under the same rule as the rename below: if the author edited that line, it is theirs.

Handlers inlined into the object literal read fine at one tool and badly at ten — the map turns into the whole file, and nothing can be moved or found without counting braces. Named above, the map stays a table of contents. It costs one thing: the kebab-case name and the identifier are two spellings of the same tool, so a rename has to move both. It does — the key always, and the identifier when the entry still reads the way this file wrote it, since anything else is the author's own arrangement.

### 7. Testing a function without publishing it

Until this, the only way to find out whether a function worked was to put it in front of every MCP client and call it from one. `POST …/custom-code/version/:versionId/test` takes a tool name and a sample input and answers with the output, the `ctx.log` lines, the error, and how long it took.

**It runs the real thing.** The version deploys to `artifact_<id>_preview` — [a script name nothing dispatches to](../packages/utils/src/customCodeToken.ts) — is called once, and is deleted afterwards. Real connections, real resources, real egress rules, and the live version keeps serving clients throughout. A test that stubbed `ctx` would only ever test code nobody writes.

**Its broker token is a preview token.** A live token's lifetime is the active-version check, which cannot apply to a version that is deliberately not active — so [the token](../packages/utils/src/customCodeToken.ts) carries `preview` and an expiry instead, and [the broker](../apps/tool-broker/src/middleware/auth.ts) swaps check (3) for "this version belongs to this tool". The capability is the same as a live token's on purpose: whoever asked for the test could publish the same code instead, and the ten-minute expiry is what a failed cleanup runs into.

**The deadline is a race, not an AbortSignal.** Passing `signal` to a Fetcher from a dispatch namespace works only when the binding lives in the same process: a local `wrangler dev` proxies the namespace to the account, and the proxy answers `AbortSignal serialization is not enabled` — so every test run and every custom tool call failed locally while the deployed Worker was fine. [`withDeadline`](../packages/utils/src/deadline.ts) races the fetch instead, at both call sites. What it gives up is stopping the isolate early, which was never this timeout's job: the per-script `limits.cpu_ms` ceiling bounds the compute, and this bounds how long a person watches a spinner.

**Schemas are checked on both sides of the run.** An input the tool's own schema refuses never reaches a deploy — an MCP client would have refused it the same way, so running it would answer a question nobody asked. An output that doesn't match a declared `outputSchema` gets its own block, because the boot loop turns exactly that into a failed call, and it is most of the reason to declare an output schema at all. [`validateAgainstJsonSchema`](../packages/utils/src/jsonSchemaToZodShape.ts) is the same compiler the MCP boot loop registers tools with, pointed at a value.

### 8. Turning off one function, without a redeploy

A `custom-code` row exposes one tool per manifest entry, and until now only the whole row toggled. `config.allowedTools` is the enabled subset — **the same field name and the same convention `mcp-proxy` already uses**, absent or empty meaning all of them, read by the same boot loop a few lines apart.

It lives on the row's config rather than in the version because it answers a different question. The manifest is what the code *can* do and moves only by deploying; this is what the server currently offers. Turning a tool off to shorten a bloated tool list must not require a redeploy, or leave the author's manifest disagreeing with their own file.

Two consequences worth stating. Names that no longer appear in the active manifest are never matched, so a version that drops a tool leaves nothing to clean up. And the last enabled tool cannot be turned off — an empty list means "all", so "none" is unrepresentable, which is the same reason `mcp-proxy` refuses to save a server with zero tools enabled.

The budget meter counts the exposed subset, not the manifest, since that is the number a client actually sees. Fixed in passing: it read an empty `mcp-proxy` allow-list as zero tools where the boot loop reads it as all of them.


### 9. A pinned formatter

The repo had a `.prettierrc` and no prettier, so `npx prettier` pulled whatever was newest and formatting was whatever each contributor's editor happened to load.

`prettier` is now a root devDependency **pinned exactly** — `3.6.2`, not `^3.6.2`, since a caret would reintroduce the problem on the next minor. The version was chosen by measurement rather than by recency: checked against the 339 committed `.ts`/`.tsx` files, 3.3.3 and 3.4.2 disagree with 37 of them, 3.6.2 with 36, and 3.9.6 with 43 — the newest reflows every emotion template literal, putting `${` on its own line throughout `packages/ui`. 3.6.2 is the recent version that fights the existing code least.

`npm run format` and `npm run format:check` at the root, plus a `.prettierignore` for generated output — `dist`, `.next`, the drizzle snapshots, `next-env.d.ts`, and Monaco's copied runtime.

**Markdown is ignored, deliberately.** These docs are hand-formatted prose with a house style — `*emphasis*`, unpadded tables — and prettier's markdown rules would rewrite all 34 of them to say the same thing differently. The formatter is here for code.

**61 files still differ**, all of them predating this branch. `npm run format` fixes them in one command, and that is left as its own commit rather than folded in here.

### 10. `outputSchema` for `http-endpoint`

The last asymmetry between the two user-authored tool shapes: `custom-code` has carried one since the manifest existed, so the shared creation flow had a field that vanished on one tab.

Optional, and absent on every endpoint that predates it. Declaring one turns a JSON response into MCP `structuredContent` — a client that asked for structure gets an object instead of a wall of text — and leaves the text behaviour untouched when it is absent. `structuredContent` is attached **only** when a schema was declared: handing every existing install a second representation of its response is not an upgrade.

Three details worth knowing:

- **The boot loop applies the same guard `custom-code` does.** A tool that declares an `outputSchema` must return `structuredContent` or be marked `isError`, or the MCP SDK refuses to serialize its own result — turning a response that didn't match into a protocol failure for the whole call. Most often it means the endpoint answered with text, or an array, where the schema promised an object.
- **Failures are now marked `isError`.** They used to come back as ordinary text beginning with `Error:`. Marking them is what the other two proxied definitions already do, and it is what makes the guard above workable: without it every HTTP failure would trip it and be reported as the wrong problem. This is the one behaviour change here that existing installs will see — a client that renders error results distinctly will start doing so.
- **An output schema must describe an object**, on the write path only, because `structuredContent` is an object and a schema of any other type compiles to an empty shape that can never be satisfied. Applied to `custom-code` manifests too, so the two shapes agree on what a valid schema is. The read shapes stay permissive, exactly as with the reserved-name rule.

The modal asks for it as raw JSON rather than through the arg builder the input schema uses: an output schema describes someone else's response, nested in ways a two-column builder cannot express — and it is a JSON field on the Functions tab, so both tool shapes now ask the same way, in the same editor.


---

## Verification

Every step was checked against the dev database with a throwaway fixture, removed afterwards.

| What | Checks |
|---|---|
| Catalog migration | 9 — all 33 rows backfilled, no nulls, FK and column gone, both tables dropped, `mcp_server_catalog` intact, all 12 stored keys resolve |
| Registry guarantee | 2 — catalog-without-handler and handler-without-catalog both fail `tsc` |
| `enabled` flag | 11 — config survives a toggle, disable frees a quota slot, boot sees only enabled, delete of a disabled row doesn't double-decrement, counter never negative |
| SDK sibling module | 7 — no bare imports, links against editor source, health probe, tool call, `ctx.log`, `source_kind` default |
| Deploy chain | 10 — draft created, manifest verbatim, upload marks editor-authored, boot registers the function |
| Test panel + `allowedTools` | 36 — [verify-custom-code-testing.mjs](../scripts/verify-custom-code-testing.mjs), all passing, first run |
| `outputSchema` on http-endpoint | 26 — [verify-http-endpoint-output.mjs](../scripts/verify-http-endpoint-output.mjs), all passing |
| The whole dashboard API, on the deployed stack | 69 — [probe-tools-dashboard.mjs](../scripts/probe-tools-dashboard.mjs) |

The testing run drives the **real broker middleware** against a scaffolded tool with three versions rather than restating its checks: a live token for the active version is accepted, one for a version that is not active is refused, a preview token for a draft of that tool is accepted, and preview tokens naming another tool's version, a version that does not exist, or an expired one are all refused — with every rejection the same opaque 401. Plus the token itself (expiry honoured, a payload edited to claim `preview` no longer verifying), the schema validator the panel reports violations from, and the `allowedTools` filtering rule restated so a change to either side fails here rather than quietly changing which tools an MCP server offers.

The http-endpoint run drives the **real executor** against a stubbed `fetch`: a JSON object becomes `structuredContent` and an array or a text body does not; `jsonPath` applies before the structure is taken; an endpoint that declares nothing still gets none; every failure path is marked `isError`; and the boot loop's guard is restated so that a change to either side fails here rather than in front of a customer. Plus both halves of the object rule — the read shape accepting a non-object schema, the write path refusing it with a message that maps to a 400 and translates in `es`.

**Publishing is verified now**, on the deployed development stack, by [probe-tools-dashboard.mjs](../scripts/probe-tools-dashboard.mjs). It signs a session cookie with `JWT_SECRET`, scaffolds a throwaway PRO org, and drives the dashboard's own routes: the catalog answering from code, an endpoint's output schema reaching an MCP client as `structuredContent` while an array response against the same schema comes back `isError`, the `enabled` flag keeping config and freeing a quota slot, a draft created and its source read back byte for byte, a test run against a schema-refused input and a good one, publish deploying to the dispatch namespace and the boot loop registering what it wrote, `allowedTools` narrowing the list with no redeploy, rollback restoring the older manifest, and the plan gate on a downgraded org. Then it removes the rows and the script.

Two things it found that no local run could. The plan gate was missing on publish and rollback — every other write path answered 402 on FREE while those two deployed code (fixed above). And a `GET` on an absent dispatch script answers `200` with `result.script: null` rather than 404, so an assertion on the status alone reports every deleted script as still deployed — which is why the probe reads the field.

**Not verified: the Functions tab and the off/remove controls in a browser.** They typecheck, build, and the editor is confirmed absent from the tools page's initial chunk — none of which is the same as having loaded Monaco from `/monaco/vs` and clicked Deploy. Completion against the SDK types and the marker pass are the two pieces most worth checking first, since both depend on how Monaco resolves `./ganju-sdk.js`. The API surface underneath them (`PATCH …/enabled`, `DELETE …/tool/:id`, the version routes) is the surface already checked above.

---

## What's next

### Immediate

- [x] **Deploy this branch to development, then exercise publish and test end to end** — deployed 22 Aug, and exercised by [probe-tools-dashboard.mjs](../scripts/probe-tools-dashboard.mjs) (see Verification). The plan gate on publish and rollback landed as a result.
- [ ] **Name the CLI in the editor's notice once it exists.** The notice now describes the path — bundle it locally, upload the bundle — without naming a command, because `ganju deploy` (Phase 7 in [CUSTOM_TOOLS.md](CUSTOM_TOOLS.md)) is not shipped. When it is, that sentence becomes one command.

### Worth doing before this ships widely

- [ ] **Give the row's config a surface.** The Functions tab writes the manifest and the source, and nothing else — `createVersion` posts `{ manifest }` alone, and no view writes `connections`, `allowedHosts`, `timeoutMs` or `resourceAccess`, or creates a `custom-code` credential. So `ctx.connection`, `ctx.sendFile` and `ctx.secret` cannot be used by anyone working in the dashboard, while Monaco completes all three from the SDK's real declarations and the runtime refusal reads *"add it to the tool's connections and publish a new version"* — of a place that does not exist. The CLI would be the other door and is Phase 7, so today `ctx.resources` and `fetch` are the whole usable surface. Everything underneath is built and verified; what is missing is the form.
- [ ] **Format the 61-file backlog.** `npm run format` does it in one command; it is left out of this branch on purpose, because a whitespace sweep across 61 files would bury a review of everything else. Worth its own commit.

### Still open from the original plan

Templates, the CLI, and removing the calendar/Cal.com native tools are unchanged — see [CUSTOM_TOOLS.md](CUSTOM_TOOLS.md).

---

## Operational state

**Migrations.** Dev is migrated through **0067** — verified: `artifact_tool` has `tool_key` and `enabled`, and `tool_definition` / `tool_group` are gone. Production has none of them, and they must land with the deploy: the API writes `tool_key` and reads `enabled` from the first request.

```
npm run migrate-prod --workspace=@ganju/db
```

**New dependencies.** `prettier` is pinned at the root (see above). `apps/api` now depends on `@ganju/sdk` for the prebuilt worker module; `apps/web` now does too, for the editor's type declarations. `apps/web` also gains `@monaco-editor/react` (a dependency) and `monaco-editor` (a devDependency — nothing imports it at runtime, the build copies its files). `package.json` and `package-lock.json` changed for both.

**A build step, and a gitignored directory.** `apps/web`'s `build` and `dev` scripts run `scripts/copy-monaco.mjs` first, filling `apps/web/public/monaco/` — 10.6MB of static assets that ship with the deployment and are never committed. Two call sites rather than a `pre*` hook per command: `opennextjs-cloudflare build` runs the app's own `build` script, so `cf-build` and both deploys pick it up through that, and only `next dev` needs the second mention. A build that skips dev dependencies has no `monaco-editor` to copy from.

**The runtime's manual setup is done on development** — checked against Cloudflare, not against memory:

| | |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID`, `CUSTOM_CODE_CF_API_TOKEN` | set on `ganju-api-development` |
| `CUSTOM_CODE_TOKEN_SECRET` | set on `ganju-api-development` and `ganju-tool-broker-development` |
| `ganju-tool-broker-development`, `ganju-tool-outbound-development` | deployed |
| `ganju-tools-development` dispatch namespace | exists |

Secrets cannot be read back, so "both hold the same `CUSTOM_CODE_TOKEN_SECRET`" is the one line above that only a real publish proves.

**What is actually blocking a publish is a deploy, not a secret.** Every deployed development Worker predates this branch — api 15 Aug, mcp 14 Aug — while the development database is already migrated through 0067. The old code joins `tool_definition`, which 0065 dropped, so **the deployed development API and MCP are broken against their own database right now** and stay that way until this work is deployed. Nothing here caused it: applying the migrations to a running deployment is what makes them a pair that has to move together, which is why they must land in the same deploy.

Deploying this branch to development is also what puts the test panel and preview tokens on the broker — both are new here, so a test run against the currently-deployed broker would 401 the moment a script touched `ctx`.
