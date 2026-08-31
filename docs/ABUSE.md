# Abuse response

We run other people's code. That is the product, and it is also the one part of
the platform where a customer can spend our money on purpose. This is the process
for when someone does — written before it happens, because the thing that makes an
abuse response bad is inventing it at 2am.

Scope is custom tools ([CUSTOM_TOOLS.md](CUSTOM_TOOLS.md)) and the egress they
get. Spam sent through a connected mailbox and prompt-injected channel bots are
real too, and most of this applies to them; the containment steps at the end are
specific to code.

## What already stops most of it, without anyone waking up

Every one of these is enforced by the platform, not by a policy, and each bounds
a different dimension. They are listed in the order an abusive call meets them:

| Control | Bounds | Where |
|---|---|---|
| Per-script CPU ceiling, 5s | one call | `limits.cpu_ms` in the upload metadata ([customCodeDeploy.ts](../apps/api/src/utils/customCodeDeploy.ts)) |
| `timeoutMs`, default 10s, cap 30s | how long anyone waits | the tool's config, raced in [withDeadline](../packages/utils/src/deadline.ts) |
| Rate limit, 60 calls/60s | calls per minute, per installed tool | `HTTP_ENDPOINT_RATE_LIMITER`, via [allowProxyToolCall](../apps/mcp/src/utils/rateLimit.ts) |
| `toolCallHardCap` | calls per month, per organization | [plan.ts](../packages/db/src/lib/plan.ts), refused at dispatch |
| `isBlockedHost` | private, loopback and link-local egress | [apps/tool-outbound](../apps/tool-outbound) |
| `allowedHosts` | which public hosts a script may reach | same worker, per artifact |
| No `nodejs_compat`, no filesystem, no raw DB | what a script can touch at all | the Workers runtime the upload declares |
| Broker token scoped to one artifact | whose connections and resources it sees | [customCodeToken.ts](../packages/utils/src/customCodeToken.ts) |
| `canUseCustomCode` | who can deploy at all | the plan gate, on every write path that produces a running script |

Multiply the first three together and a single artifact's worst case is about
2.6 million calls a month at roughly $6 of compute. The monthly cap is what stops
an organization from having many artifacts do that at once.

**The controls that matter are the ones outside the isolate.** Anything inside a
user's script is user-editable and therefore not a control — that is why egress
screening lives in the outbound worker and not in the SDK.

## How we find out

In rough order of how early they fire:

1. **The tool-call counter.** `subscription.tool_call_count` is a per-period total
   per organization, and it is the cheapest question to ask:

   ```sql
   select o.name, s.plan, s.tool_call_count
   from subscription s join organization o on o.id = s.organization_id
   where s.tool_call_count > 100000
   order by s.tool_call_count desc;
   ```

   A legitimate Pro artifact rarely passes a few hundred thousand a month. Past
   the included million, look; past a few million, look now.
2. **The error digest.** The 15-minute alert cron emails new 5xx signatures from
   `error_log` to `ALERT_EMAIL`. Abuse usually shows up here first as a spike of
   the *same* failure — a script hammering something that keeps refusing it.
3. **`mcp_request`.** One row per call with the tool name, latency, error and the
   `ctx.log` output, joined to the artifact through `mcp_session`. This is where
   "what is it actually doing" gets answered, and it is subject to a 90-day
   retention window, so copy anything you will need later.
4. **Cloudflare.** `wrangler tail --env <env>` on the outbound worker shows
   refused hosts in real time; the dashboard shows namespace CPU. The outbound
   worker is the only place that sees where a script is trying to go.
5. **Stripe.** An overage that arrives faster than the customer's traffic
   explains. Slower than the rest of this list, but it catches the case where
   nothing is failing and nothing is being refused — the bill is the only symptom
   of a script that works perfectly and shouldn't exist.
6. **Someone tells us.** A destination host complaining that traffic is coming
   from our IPs, or a Cloudflare abuse notice. Treat this as the highest-priority
   signal: by the time it reaches us, it has already reached someone else.

## Triage — three questions, in this order

**1. Is it aimed outward?** A script hitting one external host hard, scanning
address space, relaying mail, or proxying traffic is the only case that harms
someone other than us and the customer. Skip to containment. Everything else can
afford ten minutes of reading.

**2. Is it deliberate?** A tool that calls itself in a loop, a cron that fires
every second, and a genuine mining attempt are three very different
conversations, and `mcp_request` usually tells them apart in a minute: look at
the tool name, the arguments, and whether the calls come from one MCP session or
many. A mistake repeats one call shape; an attack varies.

**3. Whose is it?** A stolen access token, a compromised MCP client, or an
organization behaving as itself. `mcp_session` carries the client name, user
agent and IP, and `access_token.last_used_at` says whether a machine credential
is involved. If it is a stolen credential, containment is revocation and the
customer is a victim, not a subject — say so when you contact them.

## Containment ladder

Least to most disruptive. Go as far down as the answer to question 1 requires,
and no further: every step below the first breaks something a customer built.

1. **Narrow it.** `config.allowedHosts` to the one host they legitimately need,
   or `config.allowedTools` to the subset that isn't the problem. Both are edits
   to the tool's config, take effect on the next call with no redeploy, and leave
   everything else working.
2. **Suspend the artifact's custom tools.**

   ```bash
   node scripts/suspend-custom-code.mjs <artifact-slug> --confirm
   ```

   Run it without `--confirm` first — it prints the owner, the plan, the calls
   this period, and every deployed script, which is most of what you need for the
   record. This sets `artifact_tool.enabled = false`: the tools stop registering
   at boot, so nothing can call them, and the code, versions and settings survive.
   Reversible with `--restore`.
3. **Remove the bundles from the namespace.**

   ```bash
   node scripts/suspend-custom-code.mjs <artifact-slug> --confirm --delete-scripts
   ```

   For code that is actively doing damage and should be off the platform this
   minute. Not reversible by flag — the owner republishes, or an operator rolls
   a version forward, which re-uploads it.
4. **Revoke credentials.** Delete the `artifact_credential` rows for the
   connections it was using, and any `access_token` rows for the project. Both
   land on the next request: authentication is a lookup, not a cached lease. Do
   this first, not last, when the answer to question 3 was "stolen".
5. **Downgrade or suspend the organization.** Setting the subscription to a
   non-entitled status drops it to Free limits, which among other things drops
   the monthly tool-call ceiling to 10,000 and blocks publishing. This is the
   only step that stops the owner from simply deploying again, and it is an
   account decision — it stops their *whole* product, not one tool.

**Suspending is not a stop on redeploying.** Steps 2 and 3 answer "make it stop
now". If the owner is the problem rather than their code, step 5 is the one that
holds.

## Then

- **Tell the customer, the same day.** What you saw, what you did, what they need
  to do to get it back. A suspension nobody explained reads as an outage and
  costs more support time than the abuse did. If a credential was stolen, say
  which one and that it has been revoked.
- **If personal data was exposed**, the DPA commits us to notifying affected
  customers within 72 hours of becoming aware. The clock starts at "becoming
  aware", which is usually the moment you opened `mcp_request`, not the moment
  you finished reading it.
- **Write it down** — artifact, organization, what the signal was, what the code
  did, what was done, when it was restored. Three of these will teach us more
  about which control is missing than any amount of reasoning about it now.
- **Ask what would have caught it earlier.** Every abuse case is evidence about
  the gaps below.

## Known gaps

Named because a runbook that implies more coverage than exists is worse than none:

- **Nothing alerts on the tool-call counter.** The number is there and the query
  above is one line, but no cron watches it, so today the counter is a thing you
  look at rather than a thing that pages you. The hard cap is what makes that
  survivable — it bounds the month whether or not anyone is watching.
- **Test runs are not metered.** `ganju test` and the dashboard's test panel
  deploy a preview script and call it, which is real compute, and it is counted
  nowhere. It is bounded by a human clicking and by the same CPU ceiling, and
  billing someone for testing their own tool before they ship it is a bad trade —
  but it is an unmetered path, and a determined loop could drive it.
- **There is no dashboard kill switch for an operator.** Everything above runs
  from a shell with the database URL in `.env`. Fine for now; the wrong shape the
  first time someone has to do it from a phone.
- **The rate limit is per installed tool, not per organization.** An org with
  fifty artifacts gets fifty budgets. The monthly cap is what bounds the total.
