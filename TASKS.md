- Make an introdution view like chatbase does
- implement evals in the code and for general use in mcps for users promptfoo

Plans:

Pricing model = flat base + included allowance + metered overage (hybrid SaaS, like
Supabase/Vercel). Not pure pay-as-you-go — that creates bill anxiety and unpredictable
revenue. Two paid tiers at launch; add a middle "Team" tier later if the Free→Pro jump
proves too big.

Billable units (we already meter all of this — see the schema):

- "Message" = one assistant turn on a CHANNEL bot (count channel_message where
  role = assistant). This is our costliest path: the runner runs an LLM tool-calling
  loop per turn (channel_message.tokensIn/tokensOut capture the spend).
- MCP-CLIENT traffic (Claude Desktop/Cursor/ChatGPT) is NOT billed as messages — the
  client's own model does the inference; we only execute tools + serve RAG. Meter it
  as tool calls / RAG queries, or bundle it generously.
- Storage is split by where the cost actually lives:
  - Raw file storage (R2, ~$0.015/GB) — cheap, bundle generously.
  - Embedded/RAG content (pgvector in Postgres: 3072-dim halfvec + HNSW index, the
    real recurring cost) — this is what the $0.50/GB rate is for.
- Inference is usually on the org's OWN LLM key (organizationLlm.apiKey), so the
  per-message charge is mostly a PLATFORM fee (hosting/runner/RAG), priced low. If we
  ever supply a default Ganju model, that path passes tokens through with margin.

Free:

- One organization / one project, can't invite people
- mcp.ganju.ai/<slug>
- Limits: 7 tools, 3 prompts, 1 channel
- Storage: 30 MB raw files, ≤ ~5 MB embedded/RAG content
- 100 channel messages / month (HARD CAP). Free runs on our shared platform
  model key (we pay the inference), so the cap is trial-sized and the shared-key
  turn envelope (history + tool loops) is tightened to bound cost. Anyone who
  wants more for free can self-host (Apache-2.0).
- Cannot connect its own LLM (bring-your-own-key) — that's a paid feature, so
  Free always runs on (and is capped on) our shared key.
- Community support

Pro - $20/mo base + usage (base includes an allowance):

- No limits on prompts/tools/channels
- No limits on orgs/projects/invitations
- Can connect its own LLM (bring-your-own-key); BYO-key turns run on the org's
  own inference and aren't capped on our shared model
- Included each month: ~5 GB embedded content + ~3,000 channel messages. The
  included message allowance also bounds shared-model use: those 3,000 can run on
  our AI model or the org's own key, but once they're spent a channel with no own
  key must connect one to continue (we don't flat-rate our model in the overage
  zone). Note: the counter is the org's TOTAL messages, so heavy BYO traffic also
  draws down the shared allowance — acceptable because the failure mode is
  "blocks early," which never costs us inference. If mixed BYO+shared orgs prove
  common, split it into a dedicated shared-model counter.
- Overage: $0.50/GB embedded content · $2 per 1k channel messages (small — platform
  fee on BYO key, not token resale). Add a context-size fair-use cap so a few
  RAG-heavy power users don't sink the margin.
- MCP-client tool calls: bundled (metered separately, never as "messages")
- Add-on (NOT bundled): custom slug https://<mycompany>.mcp.ganju.ai/ at $15/mo —
  covers Cloudflare ACM ($10/mo) + margin; only some users want it
- User can create custom tools (programming — Workers for Platforms)
- Support 24/7

Enterprise - Contact us:

- Same Pro benefits
- Can add a custom/existing MCP server and use Ganju as a proxy
- SSO, contract terms, dedicated support

---

## Administer everything from the CLI

The CLI covers custom tools end to end — login, link, build, deploy, test,
logs, secrets, tokens, versions, rollback — and stops there. Everything else an
organization owns is still dashboard-only: prompts, knowledge (resources),
tools that aren't custom code, channels, LLM connections, members and
invitations, projects and organizations themselves.

The gap is worth closing because the two audiences want opposite things from
the same rows. Someone wiring Ganju into a deploy pipeline wants prompts and
resources under version control and applied by a command; someone administering
a team wants to add five people without five trips through a modal. Both are
answered by the same work, and neither is answered by more UI.

What it would cover, roughly in the order the endpoints already exist:

- **Prompts** — `ganju prompt list|get|set|rm`, with a prompt's messages and
  input schema in a file so it can be reviewed in a pull request.
- **Knowledge** — `ganju resource list|add|rm|sync`, including uploading a file,
  adding a website to crawl, and reading indexing status. This is the one with
  real asynchrony in it: ingestion is queued, so `add` has to report a resource
  that is `PENDING` and give a way to wait for it.
- **Tools that aren't custom code** — `ganju tool list|enable|disable|rm`, plus
  creating and editing HTTP endpoints and connecting remote MCP servers. The
  `enabled` flag and the catalog-in-code both landed with the dashboard work,
  so the read side is already a list of keys rather than a join.
- **Channels** — list, create, rotate a webhook secret, attach an LLM.
- **Organizations, projects, members** — create, rename, invite, remove, and
  read the plan and its usage.

Three things this has to get right, all of them properties of what already
shipped rather than choices left open:

- **A thin client, never a second write path.** Every command must be a client
  of the endpoint the dashboard uses. Custom tools already work this way and it
  is what keeps one definition of what a valid write is.
- **Nothing prints a secret.** `listCredentials` strips the value from every row
  it returns, and the LLM and channel credential routes do the same. That is the
  correct surface — "read it back" is not a feature to add later. `ganju token
  create` is not an exception to this: it prints a value that did not exist
  before the command ran, and cannot print it a second time.
- **Destructive commands need a `--yes`, and a real name to confirm.** Deleting
  a project takes its artifact, its resources and its channels with it. In a
  terminal there is no dialog to slow that down, so the command has to be the
  thing that does.

Not started, and deliberately not blocking the custom-tools CLI: it is a large
surface, most of it is CRUD over endpoints that already exist, and none of it is
needed for someone to write and ship a tool.

## Work on web widget (compatible with wordpress, drupal, shopify, etc) websites.
## Mirar como se implementa SOC2 kpmg, ey, Johanson, Prescient, Sensiba

---

## Make the assistant better at using Ganju

What AI clients actually lack when they talk to an MCP server: few but relevant
chunks, answers they can cite, knowledge that is not stale, tools they pick
correctly, and a way to stop them doing something irreversible by mistake.
Seven items to do, in priority order, then the ones that can wait.

Size: **S** = days, **M** = a week or two, **L** = more.

### Priority

**1. Hybrid search, then reranking — M**

`search-resources` is the tool every client is told to call first, and it is
pure cosine distance. Vector search misses exact tokens (order ids, SKUs, error
codes, names), which are most of what support and sales bots get asked.

- Migration: a generated `tsvector` column on `artifact_resource_chunk`
  (`to_tsvector('simple', content)`, 'simple' because content is mixed
  Spanish/English) plus a GIN index. Generated, so the index job does not
  change and existing rows are filled by the migration — but adding a stored
  column rewrites the table, so run it in a quiet window.
- Query: top ~50 by vector and top ~50 by `websearch_to_tsquery`, merged with
  reciprocal rank fusion (k = 60), cut to `limit`. One function in `@ganju/db`
  shared by `apps/mcp` (`search-resources`) and `apps/tool-broker`
  (`ctx.resources.search`), which today are two copies of the same query.
- Reranking second, behind a flag, only if fusion is not enough: ~30
  candidates → reranker model → `limit`. It costs a model call per query.
- A small golden set (query → expected uri) per test project to measure it;
  this is the first real use of the promptfoo evals task above.
- Done when: an order id or error code lands in the top 3, and semantic
  queries do not get worse on the golden set.
- Status: built and tested locally, not deployed. Migration `0074` (tsvector +
  GIN, and `hnsw.iterative_scan = relaxed_order` as a database default — needs
  pgvector ≥ 0.8), `db.searchResourceChunks` (RRF, used by both callers), the
  reranker (Workers AI `bge-reranker-base`, on wherever the `AI` binding is),
  and `scripts/eval-resource-search.mjs`. The lexical side ORs the query's
  words, minus stopwords and words common in that artifact, not websearch's
  AND. On a local ES/EN test corpus with real embeddings: exact tokens in the
  top 3 went 9/12 → 12/12, semantic stayed 8/8. Still to do: golden sets for
  real projects and a baseline before deploying.

**2. Citations and metadata in results — S** (ship with 1: same query, same
response)

- Each result returns, besides `uri`/`title`/`score`/`excerpt`: `source` (the
  page URL for crawled sites, the Drive/OneDrive link), `page` or `section`,
  `updatedAt` (resource update or `lastSyncedAt`), and `chunkIndex`.
- `artifact_resource_chunk.metadata` already exists and the chunker already
  tracks pages; add the heading path for Markdown/HTML.
- The tool description tells the model to cite as "title, p. N" / the URL.
- Same fields added (optional, so nothing breaks) to `ResourceMatch` in
  `@ganju/sdk`.
- Done when: an answer from a PDF cites its page and one from a crawled site
  cites its URL.
- Status: built, not deployed. `db.searchResourceChunks` resolves the fields
  and `db.toResourceSearchResult` is the one result shape both `search-resources`
  and `ctx.resources.search` return (fields omitted, not null, when unknown).
  `page` only for PDFs and documents with real pages; `section` is the heading
  path, sheet name or slide title. The chunker records `headingPath` for
  Markdown and HTML, and the crawler now keeps headings as `#` lines — so
  existing crawled sites and Markdown files get sections only once re-indexed.
  Checked on the dev corpus: PDF hits return `page`, crawled pages and Drive
  files return `source`. Native tools now register with the handler's
  description (written for the model) instead of the catalog's one-line card
  caption, which is what carries the citation guidance to clients. That raises
  the tool-description cost of every turn: all 62 native tools went from ~790
  to ~6,300 tokens, Gmail alone from ~215 to ~1,700 and Outlook similar, which
  lands on the shared-key Free envelope; trimming those two is the follow-up.
  Channel footers take `page` from the search result, and query chunk metadata
  only for results from an MCP worker that predates it.
  Verified on dev (2026-09-24) through a Telegram bot on claude-opus-5: a
  Markdown answer cited "Refunds → Gift orders", a crawled page cited its URL
  and section, a PDF answer cited pages. Two fixes after that run, not yet
  re-verified on dev: the description now says to cite the `page` field (the
  PDF viewer's number), not a page printed in the excerpt — the model had cited
  mml-book's printed pages, 6 off from the footer link; and the channel footer
  keeps only sources the answer names (title, file name or URL, and the pages
  it cites), falling back to the top 3 hits when it names none, instead of
  listing every search hit (replayed on the three turns: 9 → 1, 6 → 1, 10 → 8).

**3. Automatic sync — M**

Drive, OneDrive and crawl imports record `lastSyncedAt`, but nothing re-syncs
on its own: the API's crons only run error alerts and overage metering.

- A `runResourceSync` job on the existing hourly cron picks sources whose last
  sync is older than their interval and enqueues the discover jobs that already
  exist (`gdriveDiscover`, `onedriveDiscover`, `crawlDiscover`).
- Only reindex what changed: Drive/OneDrive by modified time or etag, crawled
  pages by `ETag` / `Last-Modified` or a content hash. Remove what disappeared
  at the source. Embedding cost is then only for changed content.
- A per-source interval (off / daily / weekly), with Free limited to the
  slowest one. "Last synced" and "Sync now" on the Resources page.
- Done when: editing a Drive document shows up in search within its interval
  with no manual step.

**4. Human confirmation for sensitive tools — M**

- MCP tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`,
  `openWorldHint`) on every built-in tool: read-only for search/list/read,
  destructive for sends and deletes, open-world for web. No tool sets them
  today.
- Custom tools declare them too: an `annotations` field in `ganju.json`, the
  manifest schema and the dashboard dialog, passed through at registration.
- Channels, where the confirmation can actually be enforced, since
  `channel/runner.ts` runs the loop itself: a per-tool "requires confirmation"
  setting (on by default for destructive built-ins). When the model calls such
  a tool, the runner stores the pending call on the conversation, asks
  "I'm about to send this email to X — confirm?", and runs it only on yes.
  Buttons on Telegram, Slack and Discord where they are supported.
- MCP clients: the annotations are hints the client decides on. Use
  elicitation for confirmation where the client supports it.
- Done when: `gmail-send` from a Telegram bot asks before sending.

**5. Tool linter — S**

- One rule set in `@ganju/utils`, used by `ganju build` (warnings, `--strict`
  to fail), by the API when a version is created (warnings in the response),
  and by the dashboard's New function dialog.
- Rules: missing or very short description; description that never says when
  to use the tool; a write tool that does not ask the model to confirm; input
  properties without a description; two tools whose names or descriptions
  overlap (the main cause of the model picking the wrong one); too many enabled
  tools (every one costs tokens on every call).
- Later: an "improve this description" suggestion from a model in the
  dashboard.

**6. Observability for tools — M**

The data is already there: `mcp_request` stores tool name, input, output,
latency, error and session for every call, and channel turns are stored.

- On Home: a per-tool table (calls, error rate, p95 latency, last used), the
  most common errors, and "unused in 30 days" with a one-click disable (the
  per-tool switches already exist).
- Confusion signals: calls rejected by the input schema, the same tool retried
  back to back, an error followed by a different tool.
- Session replay: one timeline per MCP session or channel conversation, with
  messages and tool calls, inputs and outputs. Admin-only, under the existing
  retention, because it holds user data.
- Done when: an owner can find a failing tool and open the exact call that
  failed.

**7. Label untrusted content (prompt injection) — S**

Proxied MCP tool descriptions are already marked as untrusted; do the same for
content.

- Wrap what comes from outside — `read-resource`, `search-resources` excerpts,
  Gmail/Outlook reads, web extracts, proxied MCP results — in clear delimiters
  (`<untrusted_content source="…">`), and say in the server instructions and
  the channel system prompt that such content is data, never instructions.
- At index time, flag documents with instruction-like text ("ignore previous
  instructions", "send this to…") as a warning on the Resources page. Flag,
  do not block, and never market it as protection.
- Works together with 4: a destructive tool call made after reading untrusted
  content always asks.

Suggested order: 1 + 2 together (one migration and one query), then 3, then 4
+ 7 (both in the channel runner), then 5 + 6.

### Nice to have

- **Templates by sector** — support, sales, e-commerce: preset prompts, a tool
  selection and sample resources. Little engineering, good for onboarding; goes
  with the Chatbase-style introduction view.
- **Cross-model testing** — run the same scripted task with Claude, GPT and
  Gemini against a project's tools and report which tool each one picked.
  Strong differentiator but expensive; build it on the evals work and after the
  linter.
- **Pagination for large outputs** — a cursor on `list-resources`, and one
  consistent "truncated, call again with cursor X" shape for custom-code, HTTP
  endpoint and proxied results (they already truncate).
- **Per-user limits on channels** — calls or messages per participant per day,
  for abuse and cost on public bots. Only per-tool limits exist today.
- **Custom code calling built-in tools** — `ctx.tools.call('gmail-send', …)`,
  the small version of workflows.

### Maybe

- **Persistent memory** — Claude and ChatGPT already have their own; mainly
  useful for channel bots. The team-notes example shows the pattern with
  resources today.
- **Visual multi-step workflows** — Functions already chain steps in code; a
  builder means competing with n8n and Zapier.
- **Long-running async tasks** — MCP support is still experimental and few
  tools need it yet.
- **Automatic summaries of large outputs** — costs a model call and hides data
  from the model; pagination solves most of the same problem.
