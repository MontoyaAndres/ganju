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
- User can create custom tools (programming — sandbox via vm/isolate, TBD)
- Support 24/7

Enterprise - Contact us:

- Same Pro benefits
- Can add a custom/existing MCP server and use Ganju as a proxy
- SSO, contract terms, dedicated support

---

## Administer everything from the CLI

The CLI covers custom tools end to end — login, link, build, deploy, test,
logs, secrets, versions, rollback — and stops there. Everything else an
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
  correct surface — "read it back" is not a feature to add later.
- **Destructive commands need a `--yes`, and a real name to confirm.** Deleting
  a project takes its artifact, its resources and its channels with it. In a
  terminal there is no dialog to slow that down, so the command has to be the
  thing that does.

Not started, and deliberately not blocking the custom-tools CLI: it is a large
surface, most of it is CRUD over endpoints that already exist, and none of it is
needed for someone to write and ship a tool.

---

## A durable identity for CI

`GANJU_API_TOKEN` lets a machine with no browser run the CLI, and it is the only
way to do that today. It takes an OAuth access token, which
`accessTokenExpiresIn` sets to **one hour** — and the CLI deliberately never
refreshes an env token, because it has nowhere to write the new one. So a value
pasted into GitHub Actions secrets stops working within the hour. It is fine for
a job someone kicks off now; it is not a service account, and a scheduled deploy
built on it fails on its second run.

There is no long-lived machine credential in the system at all. The
authorization server does implement `client_credentials`, so the grant exists —
but those tokens carry no `sub`, and `UserMiddleware.verify` resolves a caller by
introspecting for exactly that claim, so one would 401 on every control-plane
route. The grant being there is not the same as the path working.

Two shapes would close it, and they are genuinely different:

- **A personal access token.** A long-lived, revocable credential minted from the
  dashboard, scoped to one organization, that resolves to the user who made it.
  Fits the middleware as it stands, since it still answers "which user is this".
  The cost is a new credential type to store, list, revoke and audit — and one
  more thing that grants access to an account if it leaks.
- **Teach the middleware to accept a client-credentials token.** Mint a client
  per organization rather than per user, and resolve a caller to the *org* rather
  than to a person. Truer to what CI is — a deploy pipeline is not a colleague —
  but it means the membership checks, which are all "is this user an admin of
  this project", need a second answer for a caller who is not a user at all. That
  is the larger change, and the one worth doing if machine access ever needs to
  be more than a convenience.

Three things either shape has to get right:

- **Revocation has to be real and obvious.** A credential that outlives a laptop,
  a contractor or a leaked log is only safe if killing it is one click and takes
  effect immediately.
- **It must be visible.** Who minted it, when it was last used, and against what.
  A token nobody can see is a token nobody revokes.
- **`ganju` must not need a new code path.** `GANJU_API_TOKEN` already bypasses
  the store and sends a bearer token; whatever is minted should be usable there
  unchanged, so CI and a laptop stay one client.

Not started. Until it exists, CI deploys work only by minting a fresh token
inside the hour, which is worth saying out loud in the docs rather than letting
someone discover it on their second scheduled run.
