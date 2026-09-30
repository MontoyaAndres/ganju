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
  - Embedded/RAG content (pgvector in Postgres: 1536-dim halfvec + HNSW index, the
    real recurring cost — on dev the index is ~90% of the chunk table's 142 MB)
    — this is what the $0.50/GB rate is for.
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
## Work on a view where i can chat and build the functions and this agent uses the cli to deploy them
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
- Status: done on dev (2026-09-24), production pending. Migration `0074`
  (tsvector + GIN, and `hnsw.iterative_scan = relaxed_order` as a database
  default so the `artifact_id` filter doesn't starve HNSW of candidates) is
  applied on dev, which runs pgvector 0.8.1. `db.searchResourceChunks` (RRF) is
  the one search behind both callers. The lexical side ORs the query's words,
  minus stopwords and words common in that artifact, rather than websearch's
  AND. The reranker (Workers AI `bge-reranker-base`) is on by default wherever
  the `AI` binding exists — no flag — and falls back to the fused order if it
  fails. On a local ES/EN corpus with real embeddings: exact tokens in the top
  3 went 9/12 → 12/12, semantic stayed 8/8.
- Before production: check prod runs pgvector ≥ 0.8 (the migration fails
  otherwise), run `0074` in a quiet window (it rewrites the chunk table), and
  write golden sets for real projects with `scripts/eval-resource-search.mjs`
  to take a baseline first. Re-checked 2026-09-25: dev has pgvector 0.8.1,
  `content_tsv` + its GIN index and the `iterative_scan` default in place.
  Prod runs the same pgvector version as dev (0.8.1), so `0074` will apply;
  what's left is the quiet window and the golden-set baseline.

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
- Status: done on dev (2026-09-24), production pending. Ships with 1.
  - Fields: `db.toResourceSearchResult` is the one result shape for
    `search-resources` and `ctx.resources.search`; unknown fields are left out,
    never null. `page` only for PDFs and documents with real pages; `section`
    is the heading path, sheet name or slide title. The chunker records
    `headingPath` for Markdown and HTML, and the crawler keeps headings as `#`
    lines, so existing crawled sites and Markdown files get sections only once
    re-indexed (3 does that on its own).
  - Tool guidance: native tools now register with the handler's description
    (written for the model) instead of the catalog's one-line caption, so the
    citation rules and "REQUIRED FIRST CALL" reach clients. Built-in tool
    descriptions total ~4,200 tokens (from ~790) after trimming Gmail and
    Outlook to ~640 and ~620.
  - Channel footers: keep only the sources the answer names (title, file name,
    or a URL where it ends — citing /docs/api no longer keeps /docs), only the
    pages it cites, and nothing when it names none, so a greeting has no
    footer. Replayed on three turns: 9 → 1, 6 → 1, 10 → 8 lines. `page` comes
    from the search result; chunk metadata is queried only for results from an
    older MCP worker.
  - Verified on dev through a Telegram bot on claude-opus-5: a PDF answer
    cited "mml-book.pdf, p. 125" … "pp. 125–135", matching the footer links
    (the description says to cite the `page` field, not a page printed in the
    text); a crawled page cited its URL.
  - `section` is NOT verified. On 2026-09-25 none of dev's 9,521 chunks had a
    `headingPath`: nothing has been indexed there since 2026-09-10, and dev
    holds no Markdown or HTML resources. The section-looking citations in that
    run ("Refunds → Gift orders", a crawled page's section) were the model
    reading headings out of the excerpt text. To verify: re-crawl a site on
    dev or upload a `.md` file, then check `headingPath` on its chunks.
  - Known edge: a home page titled with just the brand ("Acme") stays in the
    footer whenever the answer names the brand or the site's URL. One extra
    line; leave it unless it shows up.
- Search latency, measured on dev: warm `search-resources` calls take 1.5–1.7 s
  — 0.5–0.9 s rerank, 0.2–0.35 s embedding, SQL and boot as below; the first
  call took 9 s (reranker cold start 6 s, connection 2 s). Rerank depth stays
  at 30: over 12 queries, 44 of 120 results came from fused positions 16–30,
  including the reranker's best catches.
- `mcp.boot`, read 2026-09-25 (21 requests on three dev artifacts): there is no
  0.6 s of server assembly. That figure was the invocation's wallTime minus
  the search, and wallTime also counts the usage writes run in `waitUntil`
  after the response (0.25–0.45 s). What a client waits on is `loadMs`, the
  artifact query: 76–150 ms with 3 resources, 184–389 ms with 1,198 — it
  grows with the resource count. Registering tools is cheap: 13–116 ms of CPU
  for the whole request. `registerMs` was dropped from the log line — a
  Worker's clock doesn't move during CPU work, so it read 0 — and
  `versionsMs` (the custom-code versions query) replaces it.
- SQL is 0.1–0.2 s only on small artifacts with a warm connection. On the
  7,027-chunk dev artifact the worker logged 0.6–0.8 s. In the database the
  query runs in 50–90 ms; the lexical side, common-word counting included, is
  ~7 ms. The rest is the first query on a fresh connection, which grows with
  the artifact: 286 / 328 / 500–670 ms cold against 80 / 120 / 130 ms warm.
  Reading the resource metadata of crawled pages (their SEO snapshot, parsed
  whole from a `json` column) cost another 20–40 ms per search and is now
  skipped. Next, if search latency matters: a smaller artifact query at boot,
  then connection warmth on the SQL side.

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
- Websites start further behind than Drive and OneDrive. A crawl is queued
  only when the resource is created — there is no sync route for it — and
  re-running `crawlDiscover` only inserts URLs it hasn't seen: a changed page
  is never re-crawled and a removed one is never deleted. None of dev's 1,393
  website resources has a `lastSyncedAt`. Drive already has what's needed
  (`hasFileChanged` on version / modifiedTime / md5, and deletion).
- Done when: editing a Drive document shows up in search within its interval
  with no manual step.
- Status: built 2026-09-26, on dev. Decisions: every source defaults to
  weekly; automatic sync is Pro/Enterprise only (daily or weekly), Free keeps
  "Sync now"; a website page is deleted only when the site answers 404/410.
  - Migration `0075`: `artifact_resource.sync_interval` (default `weekly`) and
    `sync_started_at`. Adding a column with a constant default doesn't rewrite
    the table.
  - `runResourceSync` on the hourly cron starts up to 50 due roots per run,
    oldest first, skipping ones already PENDING. A root with no sync yet
    counts from its creation, so existing sources spread over their first
    interval. Plans come from `PLAN_LIMITS.autoSyncIntervals`.
  - Drive/OneDrive single files: a scheduled sync checks version / modified
    time / checksum (cTag / eTag for OneDrive) and skips the download when
    nothing moved. Folders already did this.
  - Websites: discovery re-queues every known page plus new ones; the page job
    skips re-embedding when the SHA-256 of the extracted text is unchanged, and
    deletes the page when the container reports 404/410 (new 410 from
    `/crawl/page`; any other failure keeps the indexed copy).
  - `PUT …/resource/:id/sync-interval` (plan-checked against the project's own
    organization) and `POST …/resource/:id/sync` (every plan, 5-minute
    cooldown). Dashboard: inside a website or an imported folder, the
    toolbar's Sync button plus a settings button whose popover shows "Last
    synced", an automatic-sync switch and the frequency (locked on Free with
    an upgrade link); a Drive/OneDrive file imported on its own has the same
    controls in its side panel.
  - Deployed to dev 2026-09-26, UI checked there. Fixed on the way: a native
    Google Doc/Sheet/Slides failed to import ("too many bytes through a
    FixedLengthStream") because the job sized the export by Drive's `size`,
    which for those is the native file's 1,024-byte quota.
  - To deploy to prod: run `0075` first, then `ganju-api`, the
    resource-handler container, and the web app.

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
- Status: done 2026-09-28, on dev and production. Decisions: one switch per
  organization (Settings → Organization, "Confirm sensitive actions", off by
  default) instead of a per-tool setting; the answer is a reply — typed, or a
  Yes/No button where the platform allows one without new setup.
  - Annotations: every catalog tool declares `annotations` (required, so a new
    tool can't skip it) and native tools register with them. `destructiveHint`
    is on anything that reaches another person or can't be undone: email
    send/reply/forward/send-draft, trash and draft deletes, Slack posts and
    uploads, calendar create/update/delete, Cal.com book/cancel. Drafts, labels
    and moves are plain writes. HTTP endpoints: the owner can say what one
    does ("What it does" in the endpoint dialog, stored as `effect`: `read`,
    `write` or `sensitive`); left unset, GET/HEAD are read-only and any other
    method destructive — so a POST that only searches can be marked as a read
    instead of being confirmed every time.
  - Runner: with the switch on, a call to a tool the server lists as
    destructive isn't run; the model gets a "not run yet, ask the user" result,
    and the turn ends with one more model step with tools off
    (`toolChoice: 'none'`) that writes the question in the user's language.
    Stopping there keeps the model from "correcting" the held call with a
    second one that a yes would also run. Under the question the runner
    appends the held calls itself — tool title and each argument, one line,
    cut at 200 characters, in a code span — because a yes runs the stored
    calls, not the model's description of them, which a prompt injection
    could bend.
  - The exact calls are stored on
    `channel_conversation.pending_tool_confirmation`, one open question per
    participant (keyed by participant id), so in a group one person's
    question never replaces another's; expired entries are swept when a new
    one is written. The same participant's next message claims theirs (by id,
    so a re-sent batch can't run it twice): a plain yes within 30 minutes runs
    those calls with the stored arguments and the model reports the result;
    anything else — "no", "yes but change X", a slash command — drops it. The
    assistant row records `toolConfirmation.requested` and how the previous
    question ended: `confirmed`, `declined` or `expired`.
  - Migration `0076`: `organization.require_tool_confirmation` (default false)
    and `channel_conversation.pending_tool_confirmation`. Column adds only.
  - Which tools are confirmed follows the MCP defaults: anything not marked
    `readOnlyHint: true` or `destructiveHint: false`. Custom code declares
    `annotations` per tool in `ganju.json` (or "What it does" in the
    dashboard's function dialog); mcp-proxy passes through the remote's own
    annotations, recorded at discovery. Unannotated custom and proxied tools
    are confirmed. Proxy installs discovered before annotations were recorded
    get them re-read when an organization turns the switch on (in the
    background, annotations only; an unreachable server stays as it was).
  - Buttons: Telegram private chats get a reply keyboard (a tap sends
    "✅ Yes" as a normal message, so no webhook change — inline buttons would
    need `callback_query`, and re-registering an existing bot's webhook means
    rotating a secret stored only as a hash). Discord gets Yes/No components,
    answered on the interactions endpoint; the ids carry the participant, so
    only the person asked can tap, and a tap on a question already answered
    or expired says so and takes the buttons off. WhatsApp gets reply buttons
    when the question fits the 1,024-character interactive body, labelled in
    Spanish or Portuguese by the number's calling code (WhatsApp reports no
    locale). Slack stays typed:
    buttons there need Interactivity enabled in each owner's Slack app.
    Telegram groups stay typed (a keyboard tap isn't addressed to the bot).
  - Gemini: a confirmed call is replayed into a new turn, where Gemini 3
    requires a thought signature; it carries the documented sentinel
    `skip_thought_signature_validator`. Google calls it a last resort that can
    cost some quality on that step. Test once with a Gemini model.
  - MCP clients: not built — planned as 4b (the model asks yes/no in the
    client's chat; a signed token ties the second call to the first).
  - Tested on dev 2026-09-28 over WhatsApp (org "test", Gemini 3.1 Flash
    Lite), with signed webhooks: a calendar create was held with the summary
    under the question; a tap addressed to another number was ignored; "no,
    mejor a las 4pm" recorded `declined` and asked again; a Yes tap ran the
    stored call (`confirmed`, so the Gemini thought-signature sentinel
    works); a delete was held and ran on a typed "sí"; the unannotated
    custom-code tool was held; a yes after 31 minutes recorded `expired` and
    ran nothing; a No tap recorded `declined`. Found: the question step said
    the held action was done ("He eliminado…", and an invented npm report)
    despite the tool result. Fixed after the test — that step's system prompt
    now says the named actions have not been done, and the summary's heading
    carries ⏳. Re-run after deploying: the delete and the npm report now ask
    without claiming anything. Telegram checked by hand (gpt-5.4-mini): a
    create held, "si" ran it. Discord checked by hand in a guild channel
    (Claude): held with one summary block, "yes" ran the stored call. The
    other-person tap is untested (the channel has one participant).
  - Found on Discord, fixed: Claude asked "¿Le doy?" on its
    own without calling the tool, then the runner asked again once it did —
    two questions for one action. With confirmation on, the system prompt now
    tells the model to ask for missing details but not to confirm itself.
    The same note asks it to call every action a request needs in one step:
    "add a Meet" (delete + re-create) took three questions — Claude's own,
    the delete, then the create, since the turn stops at the first held call.
    After the fix, each action on Discord got a single question and missing
    details (a title) were asked for before calling; one question for
    several actions is not yet seen in a chat.
  - Seen on Discord, unrelated: the first confirmed run failed with Google's
    "invalid authentication credentials" and the retry a minute later
    worked — a calendar token refresh issue worth a look.
  - Found on the re-run, fixed and verified on dev: the model copied the
    summary block from earlier questions in its history, so a question showed
    two (the copy without ⏳) — and a copied block needn't match any stored
    call. The summary now also goes on `toolConfirmation.summary`, and
    history hands the model its question without it. Rows from before keep
    theirs. Verified in a fresh conversation: a second question, with the
    first one in history, carried a single block.
  - Custom-code tools that declare no annotations are all confirmed, lookups
    included (dev's `dragonball-character`, `pokemon-info`). Correct by the
    MCP defaults, but the owner has to mark reads as "Only reads" in the
    function dialog, or add `annotations` in `ganju.json`.
  - Unrelated, seen in that test: the model writes calendar times as UTC
    (`16:00Z`) while saying "4 p.m. Colombia", so the event lands at 11:00
    Bogotá; `timeZone` doesn't shift a timestamp that carries an offset. The
    confirmation summary is what made it visible. Fixed after (on dev and
    production 2026-09-28): `calendar-create-event` / `calendar-update-event` take start
    and end as local wall-clock time in the event's zone, no `Z` or offset
    (one that carries them is still honoured as that instant); an end from
    `durationMinutes` is computed in the same form as the start — the
    "time range is empty" errors were a local start against an end computed
    as UTC; local times are normalized to seconds and impossible dates
    rejected; both tools echo the booked start/end in the event's zone. The
    runner's "pass absolute ISO 8601 timestamps" hint (what pushed models to
    `Z`) now says to follow each tool's parameters, a named time being in
    the user's zone. Cal.com and list/free-busy keep offset timestamps.
    Verified on dev over WhatsApp with the Gemini model that used to send
    `Z`: "el 7 de octubre a las 3pm hora Colombia, 30 minutos" went out as
    `2026-10-07T15:00:00` + `durationMinutes: 30`, and the tool answered
    "When: Wed 2026-10-07 15:00 (America/Bogota) → 15:30"; the test event
    was then deleted.
  - Not checked by hand: another person's tap on Discord being refused, and
    `gmail-send` itself (the test artifact had calendar tools, which take the
    same path). A CLI release is needed for `annotations` in `ganju.json`.
  - Follow-ups: the calendar token refresh failure (its own task);
    confirmation for MCP clients is 4b, done.

**4b. Confirmation for MCP clients — S, done**

Channels confirm in the runner, which reads the user's reply. An MCP client
(Claude Desktop, Claude Code, Cursor) runs its own chat, so the question has
to come from the model there: a yes or no in the chat, then the action.

- With the org's "Confirm sensitive actions" on, a sensitive tool (the
  runner's rule: `readOnlyHint !== true && destructiveHint !== false`)
  called without a confirmation doesn't run. It returns: not run yet — tell
  the user exactly what this will do and ask yes or no; on yes, call again
  with the same arguments and `confirmation: "<token>"`; on no, don't.
- The model asks in the chat; on yes it calls again with the token. The
  server runs the call only if the token matches this tool with these exact
  arguments and hasn't expired (~10 minutes).
- Token: an HMAC over tool name, canonical arguments (sorted keys) and
  expiry, with a server secret — no sessions, no Durable Object. Used tokens
  are recorded (small table, unique id) so one yes can't run twice.
- Every sensitive tool's input schema gets an optional `confirmation`
  string; it's stripped before the handler sees the arguments. Done in one
  wrapper around `registerTool` (tools are registered in four places:
  native, http-endpoint, custom-code, mcp-proxy).
- Skipped for the channel runner (`channelTrust`), which confirms itself.
- Limit: the server never sees the user's words, only a second call — it
  relies on the model asking, which a prompt injection could skip. It still
  stops a sensitive action from happening in one step.
- Decided: applies to every MCP client when the switch is on, even ones that
  also ask before tool calls themselves (they may ask twice). No separate
  setting. Elicitation (the server asking through the client's own UI) was
  looked at and dropped: it needs session state the stateless MCP worker
  doesn't have.
- Done when: with the switch on, `calendar-create-event` from Claude Code
  first comes back "not run yet", the model asks, and it runs only after a
  yes; the same call with an altered argument or a reused token is refused.
- Status: done 2026-09-28, on dev and production.
  - `apps/mcp/src/utils/toolConfirmation.ts`: `confirmSensitiveTools`
    replaces the server's `registerTool` right after it's created (only when
    the org's switch is on and the request isn't `channelTrust`), so every
    tool registered after it passes one check. Read-only tools register
    untouched. A sensitive tool gains an optional `confirmation` argument;
    without a good one it returns "not run yet", the summary the channels
    show, and a token; with one it strips it and runs the tool.
  - Token `v1.<expiresAt>.<id>.<hmac>`: HMAC-SHA256 over version, artifact,
    tool, expiry, id and the arguments as sorted-key JSON, keyed by a key
    derived from `CRYPTO_SECRET` (no new secret). 10-minute expiry
    (`MCP_TOOL_CONFIRMATION_TTL_MS`). A forged token, a real one for other
    arguments and a tampered expiry all read as "doesn't match".
  - Migration `0077`: `tool_confirmation_use` (id = the token's id, tool,
    artifact, created_at). The insert is the claim — of two racing calls
    with one token only one runs; rows older than a day are swept on write.
  - The runner and the MCP worker share `utils.isSensitiveTool` and
    `utils.stableJson`. Settings text for the switch mentions MCP clients.
  - Tested with the SDK's in-memory client against a real `McpServer`: a
    read-only tool ran directly; a sensitive one came back "not run yet"
    with a token; the token ran it (argument order didn't matter); the same
    token again, a changed argument, a forged token and a tampered expiry
    were refused; the tool ran once.
  - Verified on dev with Claude Code as the MCP client (OAuth to the Shipday
    artifact, switch on for the test): the first `calendar-create-event`
    came back "not run yet" with the summary and a token; after the user's
    yes, the call with the token went through to the tool (the client's
    cached schema, from before the deploy, didn't block the new argument)
    and its id landed in `tool_confirmation_use`; the same token again was
    "already used"; a fresh token with a changed start time "doesn't
    match". Shipday's Google Calendar credential is flagged for re-auth
    since August, so the tool itself answered with that and no event was
    made.
  - Deployed to production 2026-09-28 (`0077`, `ganju-mcp`, `ganju-api`, web).
  - Example and docs (2026-09-30): `examples/order-desk` — `order-lookup`
    (read-only), `order-add-note` (`destructiveHint: false`), `order-refund`
    (`destructiveHint: true`), no setup, state in `ctx.resources`. The switch
    is documented under Settings → Organization → "Confirm sensitive
    actions" (EN/ES) and on the examples page. Every other example now
    declares annotations; the three whose descriptions said "confirm with the
    person first" (`github-create-issue`, `delete-note`, `email-hn-digest`)
    lost that line, since the platform asks and the model would ask twice.
    The `ganju-cli` agent skill says the same. All six examples pass
    `ganju build --strict`; order-desk's tools ran on dev with `ganju test`.

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
- Status: done on dev (2026-09-30), production pending: `ganju-api` and web.
  `@ganju/utils` 0.0.13 and `@ganju/cli` 0.0.8 are on npm; against a
  production API without the linter, `deploy` just prints no warnings
  (`warnings` is optional). Warnings only, everywhere.
  - Rules: `utils.lintTools` in `@ganju/utils` (`toolLint.ts`, imports
    nothing, published as `@ganju/utils/toolLint` so the CLI bundles it like
    `cliConstants`). `missing-description`; `short-description` (< 40
    chars); `no-usage-guidance` (no "use / call / when / cuando / usa…"
    wording, EN/ES/PT); `missing-annotations`, which replaces "a write tool
    that does not ask the model to confirm" — since 4 the platform confirms,
    so what hurts now is a tool that declares no hints and gets confirmed on
    every call, lookups included; `undescribed-input` (nested properties and
    array items too); `overlapping-tools` (same name tokens —
    `lookupOrder` / `order_lookup` — or ≥ 60% shared description words,
    each word weighted by how rare it is among the server's tools, so
    descriptions written from one template are told apart by what differs;
    one finding per tool listing every look-alike, so it grows with the
    tool count rather than its square);
    `too-many-tools` (> 25 enabled on the server).
  - CLI: `ganju build` prints them before bundling, `--strict` exits 1.
    `ganju deploy` prints the API's findings after creating the draft. The
    `ganju init` template now passes (`annotations`, a described `orderId`).
  - API: `POST …/custom-code/version` returns `warnings` beside the version,
    linted against the artifact's other enabled tools (natives by catalog
    key, http endpoints, proxied tools under their prefixed names) — that is
    where overlap outside the script and the tool count come from.
  - Dashboard: the function dialog lints what it holds as you type, against
    the script's other functions; after a save or deploy the API's warnings
    show in a dismissible banner above the function list. EN/ES copy.
  - Checked: `ganju build` and `--strict` on a scaffolded project (the old
    template warned twice; the new one is clean); the API function against
    dev's custom-code artifact flags `pokemon-info` and
    `dragonball-character` for missing annotations and
    `npm-package-versions` for no usage guidance and an undescribed
    `package`. The dashboard dialog and banner are typechecked, not tried in
    a browser.
  - To ship: a `@ganju/utils` and `@ganju/cli` release (the CLI bundles the
    new subpath), then `ganju-api` and web. No migration.
  - Tested 2026-09-30 from npm (`@ganju/cli@0.0.7`, `@ganju/utils@0.0.12`):
    a fresh `ganju init` passes `--strict`; a project built to break the
    rules got all six file-level warnings; `--strict` exits 1. That test
    found two faults in `overlapping-tools`, fixed after the release and not
    yet published: twenty probe tools sharing a sentence template ("Use when
    someone asks about X") were all flagged as look-alikes — now weighted by
    word rarity — and twenty real duplicates printed 190 pair lines — now
    one line per tool (`alike: string[]` replaces `other`). Needs
    `@ganju/utils` 0.0.13, `@ganju/cli` 0.0.8, `ganju-api` and web again.
  - Checked on dev 2026-09-30 with `ganju deploy --draft` (published CLI)
    against org `01a04ec8…` / project `01a0f40d…` (artifact `43fe9dfc…`, 5
    natives), 21 probe tools with template-worded descriptions and one named
    `resourcesSearch`: the draft saved as v1 (nothing published) and the API
    returned `too-many-tools` (26) and `resourcesSearch` ~
    `search-resources` — plus 74 probe-vs-probe look-alikes from the
    published rule. The fixed rule, run locally on that stored draft against
    the same artifact, returns just the two real ones. The v1 draft is still
    in that project's versions. Dashboard dialog and banner not yet seen in a
    browser.
  - Published `@ganju/utils` 0.0.13 and `@ganju/cli` 0.0.8 with the fix,
    checked from npm: the fresh template and the 21 template-worded probes
    pass `--strict`; five duplicates give four grouped lines.
  - `ganju-api` and web redeployed on dev; the same probe project
    (`ganju deploy --draft`, CLI 0.0.8) came back with exactly its two real
    warnings — `resourcesSearch` ~ `search-resources` and 26 tools — and
    saved v2 as a draft; no version is active on that project.
  - Dashboard checked on dev (headless Chromium, the owner's session, `/es`):
    the function dialog warned as the description was typed — "Busca
    documentos" → too short; a description without "when" → no usage
    guidance; "Úsala cuando…" → none — and saving a draft showed the banner
    with `resources_search` ~ `search-resources` (a native, which only the
    API sees), dismissible. Found: the dialog's warnings rendered below both
    schema editors, out of view while typing — moved under "What it does",
    deployed and re-checked on dev: the warning sits above the input schema,
    in view as the description is typed. Drafts v1–v4 on that project are test leftovers (v4
    has no source: the browser closed mid-upload) — delete them.
  - Found on the way, not linter work: "Start a new script" does nothing when
    the latest version is a CLI bundle and none is live — `startFresh` clears
    `openVersionId`, and the effect that picks the active-or-latest version
    immediately reopens the read-only bundle. Fixed in `FunctionsPanel.tsx`: a
    `startedFresh` flag the effect respects, cleared whenever a stored
    version is opened (selector, save, rollback). Reproduced on dev before
    the fix; after deploying, the same check passed: a blank editable script,
    "New function" enabled and opening its dialog, v3 still reachable from
    the selector. That check also showed the selector blank on the new
    script — its "New script · unsaved" entry had the value '', which a select
    renders as nothing, and was never reachable before this fix. Given its own
    value (`new-script`); deployed and checked on dev — the selector reads
    "New script · unsaved".
  - Tightened after review (2026-09-30, not yet released or deployed):
    `overlapping-tools` compares names without a proxy prefix, so
    `search_repositories` is flagged next to `github__search_repositories`
    (it wasn't: the prefix broke the name match and the proxied description
    was too short to compare); `no-usage-guidance` no longer counts "uses",
    "using" or a bare "call(s)" — "uses the Stripe API" and "makes an API
    call" say how a tool works, not when to use it — while "call this / call
    it" still counts. The API lints after the version's transaction commits,
    and a linter error returns no warnings instead of failing the write. All
    six examples, the `ganju init` template and the 21 template-worded probes
    still pass. `ganju-api` and web deployed to dev and checked there with
    `ganju deploy --draft` (local CLI build) on the probe project: the API
    flagged "uses the Stripe API…" and "makes an API call…" and not "Call
    this to…", still flagged `resourcesSearch` ~ `search-resources`, and
    saved v11 as a draft. Proxy prefix checked against a real GitHub
    mcp-proxy install (48 tools, prefix `github`) on org `019f1e2c-c660…` /
    project `019f1e2c-c81d…`: `search_repositories` ~
    `github__search_repositories` and `listIssues` ~ `github__list_issues`,
    `order-lookup` not flagged, and `too-many-tools` counted 63 (3 + 12
    natives + 48). Linter failure forced on dev with a temporary throw
    (deployed, then removed and dev redeployed clean): the version saved
    (v23), the response carried no warnings, and the log had "Tool linter
    failed; returning the version without it". Drafts v22–v24 there are test
    leftovers. Deployed to production 2026-09-30 (`ganju-api`, web) and
    `@ganju/utils` 0.0.14 and `@ganju/cli` 0.0.9 published; checked from
    npm: `ganju build` on the probe project gives the four new findings
    (two `no-usage-guidance`, the prefixed look-alike) and `--strict` exits
    1. Drafts v1–v11 on that project are test leftovers.

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

- Bug: when adding an mcp tool (github or notion) the switch look wrong for showing the tools in the mcp and then i allow all tools, it over pass the limit we define, it is not validated
- **Pagination for large outputs** — a cursor on `list-resources`, and one
  consistent "truncated, call again with cursor X" shape for custom-code, HTTP
  endpoint and proxied results (they already truncate).
- **Per-user limits on channels** — calls or messages per participant per day,
  for abuse and cost on public bots. Only per-tool limits exist today.
- **Persistent memory** — Claude and ChatGPT already have their own; mainly
  useful for channel bots. The team-notes example shows the pattern with
  resources today.
