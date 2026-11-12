# Handoff: the assistant's next three tasks

Context for an AI agent continuing work on Ganju's project assistant (the
"builder"). Written 2026-11-11. Read this first, then `TASKS.md` (the
section "Builder: an assistant that builds the project with the owner", and
"Project data on SQLite Durable Objects" for task B).

**Update 2026-11-12:** the owner took every recommendation below. C, D and
E are built (uncommitted, not on dev yet); see `TASKS.md` → "Next: bot
instructions, schedules, small follow-ups". Left: A (as a shareable doc)
and B.

## Where things stand

- Ganju: each project is an MCP server with prompts, knowledge, tools,
  channels (Telegram/WhatsApp/Slack/Discord bots) and a SQLite database per
  project ("Data"). Monorepo: `apps/api` (Hono Worker), `apps/mcp`,
  `apps/data` (the `ProjectDatabase` Durable Object), `apps/web` (Next.js
  dashboard), `apps/website` (Astro docs), `packages/{utils,db,cli,sdk}`.
  Architecture in `docs/ARCHITECTURE.md`, tables in `docs/DATA_MODEL.md`.
- The assistant (the dashboard's Assistant tab): phases 0–7 and the
  verification-and-docs work are done, on dev and production, open to every
  Pro and Enterprise organization. Code: `apps/api/src/controllers/builder/`
  (`prompt.ts` the system prompt, `tools.ts`, `changeSets.ts`, `llm.ts`,
  `health.ts`, `retention.ts`, `tryIt.ts`), the Durable Object
  `apps/api/src/durable-objects/builderConversation.ts`, the tab
  `apps/web/src/components/views/assistant/`. Owner docs:
  `apps/website/src/content/docs/assistant.md` (and `docs-es/`).
- Model: `claude-opus-5-5`, high effort, on our `ANTHROPIC_API_KEY`, billed as
  credits ($0.01 of model cost each; 1,000 included; $2 per 100 after).
- Eval: `node scripts/eval-builder.mjs --server` against dev, ten golden
  requests × 3 runs (`scripts/golden/builder-requests.json`), baseline
  `scripts/golden/builder-phase7-server.json`: 29/30, 22.9 credits a run.
  Costs real money (~$7 a full run).
- Dev test org for the assistant: **`qa-timecap`** (id `01a1b287-…`); the
  org named `test` (project `nemo`) is older and holds a CLI project.
  Production checks run on the owner's org **"Girardot - demos"**
  (Enterprise), project "test" — never the production org literally named
  "test", which belongs to someone else.

## How the owner wants you to work (standing rules)

- Never stage, commit or push unless asked. A PR is a new `feat/` branch off
  `develop`; never commit onto `develop`. Leave work uncommitted and report.
- Ask before any production read or write, and before deploying. The owner
  deploys and runs migrations; you generate migrations (drizzle) but never
  run them.
- Never delete data unless the owner says so.
- Code comments: short, only a non-obvious why. No references to docs,
  phases or section names in code.
- Prettier only on files that were Prettier-clean at HEAD. i18n strings in
  both `en` and `es`. Rebuild `packages/utils` and `packages/db` after
  editing them.
- Don't put the owner's email or personal details anywhere external. Never
  enter credentials or log in on their behalf.
- Product writing (UI, docs, prompts) is plain and owner-facing: owners are
  restaurant/shop/clinic owners who don't write code. The UI never says
  draft, deploy, version, schema, SQL, API.
- Before building, ask the owner the design questions below that are theirs
  to decide (with a recommendation), then record the decisions in
  `TASKS.md` under the task, in the style of the existing phases ("Decided
  (date): …", "Built: …", "Checked on dev: …").

---

## A. Owner sessions (verification)

Goal from `TASKS.md` → "Verification and docs": **4 of 5 non-technical
owners finish a real request without help.** This is the last open item of
the assistant besides an Anthropic-usage comparison that is deferred (no
admin access to the Anthropic Console).

The owner recruits the people; you can't. What you can prepare:

1. **A session guide** (Spanish first; most owners are in Colombia):
   - who: real small-business owners (restaurant, shop, clinic, salon), no
     coding background, on a Pro or Enterprise org (or a trial org the owner
     upgrades by hand with `scripts/set-org-plan.mjs`);
   - setup: their own project with a channel or at least the "Try it as a
     customer" panel; a few real items (menu, prices, hours);
   - task: they pick one real thing they want their bot to do, in their own
     words (examples to offer only if stuck: answer from the menu, tell if
     open now, take an order and email it, book in Google Calendar);
   - rule for the observer: no help unless they're stuck for 3 minutes or
     ask to stop; note every point of confusion verbatim;
   - "finished" means: the change applied and the bot answering correctly in
     Try it, judged by the owner of the business;
   - after: three questions (what was confusing, would you use it again,
     what did you expect it to do that it didn't).
2. **A results template** to fill per session: business, request, finished
   yes/no, minutes, credits (from the chat header), where they got stuck,
   quotes, bugs.
3. **What to measure from the database afterwards** (dev or production, ask
   before production reads): per chat, `builder_message` steps, credits
   (`cost_micros / 10000`), owner turns, change sets applied/undone
   (`builder_change_set.status`), time from first message to Apply.
4. Turn findings into prompt or UI fixes, re-run the eval after any prompt
   change, and record the outcome in `TASKS.md`.

Deliverable now: the guide and template as an artifact or doc the owner can
hand to whoever runs the sessions (ask the owner which), plus the SQL for
step 3. Nothing to build in code unless the sessions find problems.

---

## B. Daily and weekly schedules in Data

**Why:** owners ask for "every night send me today's orders", "every Monday
remind me…". Today Data's triggers fire on a row's insert/update/delete or
at a time relative to a row's date column, never on a clock. The assistant
has to decline (prompt rule in `prompt.ts`, "# Data": *"There is no daily or
weekly schedule…"*), and the eval case `nightly-orders` is scored on that
honest decline.

**What exists to build on** (time triggers, `TASKS.md` "7c. Time-based
triggers", done 2026-11-06):
- `packages/utils/src/dataTriggers.ts`: `DATA_TRIGGER_EVENTS` =
  insert/update/delete/time; the `time` shape `after: { column, minutes }`;
  scan constants (`DATA_TIME_SCAN_MS` 5 min, `DATA_MAX_TIME_TRIGGERS` 10,
  `DATA_TIME_EVENTS_PER_DAY` 2,000); `scanTimeTriggers`;
  `DATA_TRIGGER_ACTIONS` = function, webhook, chat, email, customer.
- `apps/data/src/projectDatabase.ts`: the object's alarm runs the time scan
  every 5 minutes while an enabled time trigger exists, before draining
  `_ganju_outbox`; events then go through the existing queue, runs, retries
  and "turned off after failures".
- Object-internal tables: `_ganju_triggers` (with `schedule`, `scan_state`),
  `_ganju_trigger_fired`, `_ganju_meta` (`time_events_day`). Internal
  migrations live in `INTERNAL_MIGRATIONS`; no Postgres migration was needed
  for 7c.
- The database has a time zone (a `date` counts from midnight in it).
- Everywhere triggers appear (all must learn a new kind): the dashboard's
  Triggers tab (`apps/web`, Data views), `ganju.json` + `ganju deploy` and
  `ganju data triggers` (`packages/cli`), SDK `TriggerEvent` types
  (`packages/sdk`), the Data API OpenAPI description, the docs pages
  `apps/website/src/content/docs/data/triggers.md` (en/es), the assistant's
  `data` tool (`apps/api/src/controllers/builder/dataItems.ts` and
  `tools.ts`), probes `scripts/probe-data-triggers.mjs`, example
  `examples/data-orders`.

**Design questions for the owner** (recommendation in brackets):
1. Shape: a new event `on: "schedule"` with `{ every: "day" | "week",
   at: "21:00", days?: ["mon", …] }` in the database's time zone [yes; no
   free cron syntax for owners].
2. What a scheduled event carries, since no row changed: nothing but the time
   (the action reads what it needs), or the result of a saved query [the
   saved query's rows, capped, so "email me today's orders" needs no code].
3. Which actions: email to members (with the query result as a table),
   function (gets the event and reads data itself), webhook, chat message to
   the owner's channel [email + function + webhook first; chat later].
4. Limits: how many schedules per database (5?), minimum frequency (daily is
   the minimum; no hourly) [yes].
5. Missed runs (object down, deploy): run once late if within N hours, or
   skip [run once if within 6 hours, never more than one catch-up].
6. Plan: Pro/Enterprise only, like Data [yes].

**Then:**
- Build it in utils (validation, types), apps/data (the alarm books the next
  scheduled time, not only the 5-minute scan), web, CLI, SDK, docs, the
  assistant's `data` tool and its prompt (remove the "no schedule" rule,
  teach it the new event; keep "prefer a trigger's email over Gmail through
  an action").
- Remove the prompt's workaround rules, don't just add the new event. In
  `prompt.ts` under "# Data", the lines saying there is no daily or weekly
  schedule and offering per-row emails, a per-row time trigger or a saved
  query instead must go once schedules ship (and the matching sentence in
  "# Rules" if any), or the assistant keeps offering workarounds for
  something it can now build. Keep "build only what the owner picks".
- Update the eval rubric for `nightly-orders` in
  `scripts/golden/builder-requests.json` from "declines honestly" to
  "builds a nightly schedule that emails the day's orders", re-run that case
  (`--case nightly-orders --repeat 3`) and the full eval, and save a new
  baseline if it holds.
- Checks on dev in `qa-timecap`: a schedule a few minutes ahead fires once,
  not again after the object restarts, honours the time zone, a turned-off
  schedule doesn't fire; the assistant builds one from "every night at 9 send
  me today's orders".
- Size: M (1–2 weeks).

---

## C. Bot instructions per project (needs an owner decision first)

**Why:** "answer shorter", "always answer in Spanish", "be more formal" are
likely the most common owner requests, and the assistant can't do them. A
channel bot's instructions come only from an organization's own model row
(`organization_llm.system_prompt`, Settings → Models). On the free shared
model they are fixed (`DEFAULT_LLM_SYSTEM_PROMPT` in
`packages/utils/src/constants.ts`) and nobody can edit them. The assistant's
prompt says so ("What you cannot change: … the bot's model or its
instructions").

**Where the prompt is built:** `apps/api/src/controllers/channel/runner.ts`
around line 1279: `systemPrompt = [contextParts…, memory note,
llmRow.systemPrompt]`, where `llmRow` is the channel's model or, on the shared
tier, a synthetic row with `DEFAULT_LLM_SYSTEM_PROMPT` (around line 100).

**Decision for the owner** (ask before building):
1. Do we want a per-project instructions field at all? [yes]
2. Scope: per project (all its channels) [yes], or per channel.
3. On an own model that already has a `system_prompt`: append the project's
   instructions after it [yes], or replace it.
4. Who edits it: the owner in project settings and the assistant through a
   change set (undoable like a prompt) [both].
5. Limits: a length cap (e.g. 2,000 characters) so it can't blow up every
   turn's input on the shared model, whose cost we pay [yes]. Guard against
   instructions that try to override safety notes: ours stay first and win.

**Then:** a Postgres column (e.g. `project.bot_instructions`, migration
generated, not run), read in the runner and appended after Ganju's own notes,
a field in project settings (en/es), a change-set item area/op in
`changeSets.ts`/`projectItems.ts` with before-state for Undo, the assistant's
prompt rule updated ("What you cannot change" loses "instructions"; how to
phrase good instructions), docs (assistant page, settings page), and an eval
case (the existing `shorter-replies` case currently scores a correct pointer
to Settings → Models; change its rubric to expect the instructions change).
Size: S/M.

---

## Small follow-ups

**D. A new chat appears in the chat list right away.** Seen on dev
2026-11-11: while a new chat's first reply was running, the "Chats
anteriores" list still showed only the older chats; the new one appeared
after the turn finished. In `apps/web/src/components/views/assistant/index.tsx`
the list (`loadConversations`) is reloaded only when a turn ends (in
`follow`) and on load. Reload it (or insert the new chat locally with a
"New chat" title) right after `send()` creates the conversation, before the
message is posted. Mind the recent send changes in the same function (the
`outgoing` message shown at once, scoped to its chat by `from`/`to`). Size: S.

**E. The assistant sees when the live action version was published.** When
checking a broken action (phase 5), the assistant said it couldn't tell
whether the failures came before or after the latest change. The project
overview it reads (`project` tool → `overview` → `versionsSummary` in
`apps/api/src/controllers/builder/tools.ts`) lists each version's id,
number, status, tools and error, but no dates. Add when each listed version
was created and when the live one was published (from the version rows
`customCodeActions.listVersions` returns, or `artifact_tool_version`), as
UTC timestamps, and say in the prompt's failing-action rule to compare log
times with it. Health (`builder/health.ts`) already counts failures since the
last publish, so reuse that notion. Size: S.

## Suggested order

1. Ask the owner the questions for B and C in one message (with the
   recommendations above).
2. Prepare A's guide and template while waiting; the owner needs lead time to
   recruit people.
3. D and E are small and independent: do them first or in between.
4. Build B, then C (or C first if the owner picks it: it's smaller).
