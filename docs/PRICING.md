# Pricing math

Worked cost model for the three plans, in plain numbers. Companion to [CUSTOM_TOOLS.md](CUSTOM_TOOLS.md). Supersedes the pricing sketch in [TASKS.md](../TASKS.md).

## Part 1 — What things actually cost us

### Verified rates (checked August 2026)

| What | Rate |
|---|---|
| Workers Paid (`apps/api` + `apps/mcp`) | **$5/mo**, includes 10M requests + 30M CPU-ms |
| Workers for Platforms | **$25/mo**, includes **1,000 scripts** + 20M requests + 60M CPU-ms |
| Extra user script | **$0.02 per script per month** |
| Extra requests | **$0.30 per million** |
| Extra CPU | **$0.02 per million CPU-ms** |
| R2 file storage | $0.015 per GB per month |
| **Gemini 3.1 Flash-Lite** (our `DEFAULT_LLM_MODEL`) | **$0.25 per M input · $1.50 per M output** |

One Cloudflare detail worth knowing: they charge **one request** for the whole chain (dispatch worker → user worker → outbound worker). Only CPU is counted across all three. So a custom tool call is one request, not three.

### Measured from our own database (re-measured 13 Aug 2026)

Queried against `channel_message` — **2,356 assistant turns**, 26 Jun – 14 Aug. The
first pass had 137 turns; this is 17× that.

| | avg | p50 | p90 | max |
|---|---|---|---|---|
| Input tokens/turn | 1,118 | 826 | 957 | 76,094 |
| Output tokens/turn | 44 | | | |
| **Cost/turn** | **$0.00035** | | | |

**The caveat got worse, not better.** The extra volume is not more representative — it's *less*. 2,317 of the 2,356 turns come from a single 5-tool artifact, most of them generated in one sitting to push a counter past a billing threshold. That collapsed the distribution: p50 and p90 used to sit at 577 and 8,479, and now sit at 826 and 957, because almost every turn is the same shape.

So read the aggregate row as "one artifact's behaviour," not "our traffic." What the larger sample *does* buy is a much firmer per-tool-count breakdown below, since the effect it measures is structural rather than behavioural. Genuine production traffic is still unmeasured.

### Postgres — real numbers (Neon Launch, Aug 2026)

| What | Rate |
|---|---|
| Neon storage | **$0.35 per GB-month** (from the bill: `$0.09 ÷ 0.26` and `$0.94 ÷ 2.69`) |
| Neon compute | ~$0.106 per compute-hour — 29.68 hours billed at $3.15 |
| Current total | **$19 Launch base + $4.18 usage ≈ $23/mo** |

Two things this replaced: the ~$50/mo instance estimate (too high) and the ~$0.50/GB pgvector figure (far too low — see Part 2.5).

A note on the bill: **child branches held 2.69 GB against the root branch's 0.26 GB** — 10× the storage, and it's dev/preview branches rather than customer data. Pruning them is the cheapest line item available.

### Estimates still to confirm

| What | Estimate | Note |
|---|---|---|
| Containers (resource-handler) | ~$20/mo | Sleeps when idle, so usage-shaped. |
| Embedding API (ingest) | unmeasured | `gemini-embedding-001`, a **one-time** cost per GB ingested rather than recurring. At ~250M tokens per GB of text it could rival a month of storage for the same GB. Worth pricing before assuming storage is the whole story. |

## Part 2 — The five things worth knowing

**1. User scripts are basically free.**

1,000 scripts come with the $25 base, extras are 2 cents each per month:

| Customers with custom code | Script cost/month |
|---|---|
| 1,000 | $0 (included) |
| 5,000 | $80 |
| 10,000 | $180 |

**$0.02 per customer.** There is no meaningful per-artifact monthly floor, so **"unlimited projects" on Pro is safe.** Meter storage and inference instead.

**2. We're already on the cheapest sensible model.**

`DEFAULT_LLM_MODEL = 'gemini-3.1-flash-lite'` ([constants.ts:562](../packages/utils/src/constants.ts#L562)) — Google's "most cost-efficient GA model, optimized for high-volume agentic tasks." ~4× cheaper than Claude Haiku, half of Gemini 3 Flash.

The guidance is **don't upgrade it**, not "go cheaper." Moving the shared key to Gemini 3 Flash doubles every number below; to a Sonnet-class model, roughly 15×'s them.

**3. ⚠️ Tool count is the real cost driver — and this plan increases tool count.**

The most important thing the measurement turned up:

| Tools on the artifact | Turns | Avg input tokens | Cost/turn |
|---|---|---|---|
| 5 | 2,317 | 937 | ~$0.0003 |
| 6 | 3 | 4,161 | ~$0.0012 |
| **12** | **36** | **12,526** | **~$0.0036** |

**2.4× the tools produced 13× the input tokens.** Every tool's JSON schema is re-sent on every model call, and a turn makes ~3 calls.

This is the number worth trusting from the re-measure. The 5-tool row went from 100 turns to 2,317 and its average moved only 1,103 → 937; the 12-tool row barely moved at all. The ratio held — 11.9× before, 13.4× now — on 17× the data. It's a structural property of how tool schemas are serialised, not an artefact of who was chatting. Extrapolating:

| Tools | Est. input/turn | Est. cost/turn | 1,000 turns |
|---|---|---|---|
| 12 | 13k | $0.004 | $4 |
| 40 | ~40k | $0.011 | $11 |
| 80 | ~80k | $0.021 | $21 |

This is the "tool-list explosion" risk from [CUSTOM_TOOLS.md](CUSTOM_TOOLS.md#risks), now measured rather than theoretical. Custom tools invite exactly this growth. **Mitigation: cap the number of tools exposed to a channel (~40).** It bounds our cost per turn *and* improves the agent's tool selection, which degrades badly past a few dozen options anyway. MCP-client traffic doesn't need the cap — that token cost lands on the customer's own model.

**Planning number used below: $0.004/turn** — the 12-tool artifact's real cost, not the $0.00035 average, because artifacts that install custom tools will be tool-rich. The re-measure put that row at **$0.0036**, so the planning figure stands with ~10% headroom. Every worked example in Part 5 still uses $0.004.

**4. Inference still dominates compute — by ~1,700×.**

| Thing | Our cost |
|---|---|
| 1 custom tool call (100ms CPU) | $0.0000023 |
| 1,000,000 tool calls | ~$2.30 |
| 1 channel turn | ~$0.004 |
| 1,000 channel turns | ~**$4** |

Be relaxed about tool calls. Be careful about who pays for inference — and about how many tool schemas ride along on every turn.

**5. Embedded content costs several times what it looks like — originally ~13×, now ~7×.**

The billed unit is `sum(octet_length(chunk.content))` — chunk text, written by [embedding.ts](../apps/api/src/utils/embedding.ts). But storing that text also stores a `halfvec` and its HNSW index entry, and **that overhead is fixed per chunk regardless of how little text the chunk holds.**

The table below is the original 3072-dimension measurement, kept because it's what motivated the change. **The embedding is now 1536 dimensions and the current figure is ~6.9× / ~$2.41 per GB** — see the shipped note at the end of this section.

Measured on 8,960 real chunks (12.48 MB of content occupying 161 MB, with 7 dead tuples — so this is steady state, not bloat):

| | Per chunk | Share |
|---|---|---|
| Content (heap) | 1,324 B | 7% |
| **TOAST — the vector** | **11,761 B** | **62%** |
| **HNSW index** | **5,258 B** | **29%** |
| Other indexes | 88 B | <1% |
| **Total** | **~18.4 KB** for ~1.5 KB of text | **12.9×** |

The vector is 3072 × 2 = 6,144 bytes, but TOAST nearly doubles it: a chunk row exceeds the 8 KB page limit, so the vector goes external, and with content p90 at 2,165 bytes many chunk texts get TOASTed too.

**At 3072 dimensions a billed GB cost `12.9 × $0.35` ≈ $4.51/GB-month.** The original $0.50/GB rate — documented as "at cost" — was 9× under.

Both terms are attackable, since expansion ≈ `(fixed + content) ÷ content`. The first row is where we started, the second is where we are:

| Change | Expansion | Cost/GB |
|---|---|---|
| 3072 dims, 2,000-char chunks (was) | 12.9× | $4.51 |
| **1536 dims (current)** | **~6.9×** | **~$2.41** |
| 4,000-char chunks | ~6.3× | $2.20 |
| Both | ~4.0× | $1.40 |

**The 1536 option was tested, and it's better than it looks** (13 Aug, on the 8,960-chunk dev corpus, 30 real user questions from `channel_message`):

| Measurement | Result |
|---|---|
| Truncated-3072 vs API-native 1536 | **cosine 1.000000** — identical |
| HNSW index size | 47.2 MB → **23.6 MB** (exactly 50%) |
| **HNSW approximation noise** (exact@3072 vs HNSW@3072) | **73% top-10 agreement** |
| **Dimension effect** (exact@3072 vs exact@1536) | **93% top-10 agreement**, same top-1 in 24/30 |

Two conclusions, both load-bearing:

1. **Halving the vector perturbs results less than the index already does.** The HNSW index you run in production disagrees with exact search 27% of the time; dropping to 1536 disagrees only 7%. Retrieval quality is not the obstacle — a naive A/B without the exact-search control shows ~78% and looks alarming, but that figure is mostly index approximation, not dimensionality.
2. **Migration needs no re-embedding.** Because truncation is exact, existing vectors convert in place with `l2_normalize(subvector(embedding::vector, 1, 1536))` — no API calls, no cost, no re-ingest.

Projected after the change: ~10.1 KB/chunk against 1.46 KB of content ≈ **6.9× expansion, ~$2.41/GB** — close enough to the $2 price to be sustainable, and it halves the cost of the *included* GB that most customers sit inside.

One implementation note: the API returns non-normalised vectors when `outputDimensionality` is set, so the embed path must L2-normalise before storing — hence [l2Normalize](../packages/utils/src/l2Normalize.ts), called from both embed paths.

**Shipped on dev, 14 Aug** ([migration 0063](../packages/db/drizzle/0063_reflective_young_avengers.sql)). Rehearsed on a clone of the real table first: 8,960 rows converted, all unit-length, table 118.8 → 59.7 MB and HNSW index 47.1 → 23.6 MB, both exactly 50%. Raising `CHUNK_TARGET_CHARS` from 2,000 remains an independent further lever.

## Part 3 — The gap in the current model

[TASKS.md:47-54](../TASKS.md#L47-L54) gives Pro 3,000 included messages that "can run on our AI model or the org's own key."

At $0.004/turn that's **$12 of inference on a $29 plan** — with 5 GB of included storage on top, roughly half the revenue. Not fatal, but it's the one line where a customer can consume our money without limit, and it gets worse as their tool count grows.

The overage rate has the same shape: **$2 per 1,000** is right as a platform fee when the customer brings their own key (we just run the loop), but it's ~2× below cost when the turn runs on ours (~$4 per 1,000, more for tool-rich artifacts).

### The fix: split the counter, and *sell* shared-key inference

The tempting fix is "Pro must bring its own key." **Don't** — it breaks every upgrade. Free runs on our shared key and Free users *cannot* connect their own ([TASKS.md:34-38](../TASKS.md#L34-L38)), so by definition every Free→Pro converter is running on our key at the moment they convert. Requiring BYO means 100% of upgrades break the customer's working bot on the day they start paying us.

Keep it available, give it a generous buffer, price the rest to make money:

| Counter | Price | Our cost | Margin |
|---|---|---|---|
| First **1,000** messages/month on **our** model | included | ~$4 (up to ~$11 tool-rich) | buffer |
| Beyond 1,000, on **our** model | **$15 per 1,000** | ~$4–11 | 1.4–3.75× |
| Any messages on the **customer's** key | **$2 per 1,000** | ~$0 | platform fee |

A 1,000-turn buffer is ~33/day — a typical small-business bot's entire month. Most Pro customers on the shared key never see the overage, and worst case is ~$4.

**The $15 rate depends on the tool cap.** Without it, an 80-tool artifact costs ~$21 per 1,000 turns and the overage runs at a loss. With a ~40-tool channel cap, cost tops out near $11 and $15 stays profitable.

**Two more dependencies:**

- **Don't upgrade the shared model.** Keep Free's tightened turn envelope (history depth, tool-loop iterations — [TASKS.md:34-36](../TASKS.md#L34-L36)) applied to Pro's shared-key turns too.
- **Track `sharedKeyTurns` separately from `totalTurns`.** [TASKS.md:50-54](../TASKS.md#L50-L54) uses one org-total counter, which can't enforce a sub-cap. Already derivable: `channel.llm_id IS NULL` means the turn ran on our key.

## Part 4 — The three plans

### Free — $0

| | |
|---|---|
| MCP servers | 1 (1 org, 1 project) |
| Tools | 7 installed · `http-endpoint` capped at 1 · curated `mcp-proxy` only |
| Custom code | ❌ |
| Prompts / channels | 3 / 1 |
| Storage | 30 MB raw files · 5 MB embedded |
| Channel messages | **100/month, hard cap**, on our model |
| LLM | Ours only (no BYO) |
| Support | Community |

**Cost to us:** 100 × $0.004 = $0.40 + ~$0.01 storage = **~$0.41/month** fully maxed. The 7-tool cap keeps per-turn cost near the low end. Most free users use a fraction of the cap → realistically **~$0.10/month**.

### Pro — $29/month

| | |
|---|---|
| MCP servers | **Unlimited** (unlimited orgs, projects, artifacts) |
| Tools / prompts | Unlimited (channels see at most ~40 — see Part 2.3) |
| Custom code | ✅ WfP, CLI, managed connections |
| LLM | Bring your own key |
| Included storage | **1 GB** embedded content (~500,000 pages of text) |
| Included messages | 3,000/month — of which **1,000 may run on Ganju's model** |
| Included tool calls | 1,000,000/month |
| Support | 24/7 |

**Overage**

| | Price | Our cost | Margin |
|---|---|---|---|
| Embedded content | **$2/GB** | ~$2.41/GB | ~break-even — see below |
| Messages on **your** key | $2 per 1,000 | ~$0 | platform fee |
| Messages on **Ganju's** model | $15 per 1,000 | ~$4–11 | 1.4–3.75× |
| Custom tool calls | $5 per million | ~$2.30/M | ~2× |

Only tools the customer **wrote** count against that million. Calls to the shipped integrations, and to proxied MCP servers, stay bundled: they cost one screened fetch from a Worker we already pay for, so metering them would bill for something that rounds to zero and turn the tool list into a thing to ration.

**Storage is priced at roughly break-even, on purpose.** When $2/GB was set it sat well under the then-current $4.51/GB. Rather than raise the price again, the gap was closed from the cost side: halving the embedding to 1536 dimensions took the real figure to **~$2.41/GB** (Part 2.5). $2 against $2.41 is close enough to live with, the exposure is bounded by the 1 GB allowance, and raising `CHUNK_TARGET_CHARS` would tip it positive without another price change.

**If a customer maxes every included allowance:** $4.00 inference + $2.41 storage + $2.30 tool calls + $0.02 script = **$8.73**, leaving **$20.27 (70%)**. A typical BYO-key customer with a few hundred MB costs ~$2 → **93%**.

**Why $29 and not $20?** Not margin — $20 is safe. It's positioning: code hosting, a CLI, and managed OAuth put this beside Zapier Professional (~$30), n8n Starter (~€24), Pipedream (~$29). $20 anchors it as a tool; $29 anchors it as a platform.

**Add-on (unchanged):** custom slug `https://<company>.mcp.ganju.ai/` — $15/mo.

### Enterprise — from ~$500/month, contact us

Everything in Pro, plus:

- **Bring your own OAuth apps** — your company on the Google/Microsoft consent screen, no dependency on our verification status
- Dedicated dispatch namespace, raised CPU ceilings, raised tool caps
- Arbitrary MCP server URLs (not just the curated catalog)
- SSO, SLA, contract terms, dedicated support

Infrastructure costs very little here. The price is for the contract, support, and SSO.

## Part 5 — Five worked examples

### Ana — bakery owner (Free)

One Telegram bot, 12 MB of PDFs, 60 messages a month.

| | |
|---|---|
| She pays | **$0** |
| Inference (60 × $0.004) | $0.24 |
| Storage | $0.01 |
| **Costs us** | **$0.25/month** |

### Carlos — agency developer (Pro, brings his own key)

Four client MCP servers, six custom tools he wrote, 2 GB of client docs, his own OpenAI key, 1,200 messages, 40k tool calls.

| | |
|---|---|
| Base | $29.00 |
| Storage overage: 1 GB × $2 | $2.00 |
| **He pays** | **$31.00** |
| 4 scripts × $0.02 | $0.08 |
| 2 GB embedded × $2.41 | $4.82 |
| 40k tool calls | $0.10 |
| Messages (his key) | $0 |
| **Costs us** | **$4.99** |
| **We keep** | **$26.01 (84%)** |

Storage is still his whole cost base — but at 1536 dimensions it's half what it was. Under the original $0.50/GB he'd have paid a flat $29 and appeared to cost $1.18.

### Marta — restaurant group (Pro, no key of her own)

One MCP server on WhatsApp + Telegram, 1 GB of menus and policies, **1,600 messages a month all on Ganju's model.** No interest in managing an API key.

| | |
|---|---|
| Base | $29.00 |
| Shared-model overage: 600 × $15/1,000 | $9.00 |
| **She pays** | **$38.00** |
| Inference 1,600 × $0.004 | $6.40 |
| Storage 1 GB (included) × $2.41 | $2.41 |
| 30k tool calls + script | $0.09 |
| **Costs us** | **$8.90** |
| **We keep** | **$29.10 (77%)** |

She sits exactly on the included 1 GB, so she pays no storage overage while it costs us $2.41. Under 1,000 messages she'd pay a flat $29 and cost us $6.50 — **78% margin, no overage conversation.** That's the common case.

### Lucía — SaaS support team (Pro, heavy, own key)

One MCP server, three channels, 12 GB of documentation, 9,000 messages on their own Anthropic key, 800k tool calls.

| | |
|---|---|
| Base | $29.00 |
| Storage overage: 11 GB × $2 | $22.00 |
| Message overage: 6,000 × $2/1,000 | $12.00 |
| **She pays** | **$63.00** |
| Storage 12 GB × $2.41 | $28.86 |
| 800k tool calls | $1.90 |
| Script | $0.02 |
| **Costs us** | **$30.78** |
| **We keep** | **$32.22 (51%)** |

**This row is why the 1536 change was worth making.** She's the most valuable kind of customer — heavy, own key, 12 GB indexed — and on the old 3072 basis she cost $56 against $63 of revenue, netting **11%**. Halving the embedding took her to **51%** without touching the price. Had that not worked, the alternative was $5/GB, which would have meant telling heavy users their storage bill had gone up 10× from where it started.

### Nordwind GmbH — enterprise

40 MCP servers, their own Google + Microsoft OAuth apps, SSO, 80 GB embedded, 200k messages/month on their key, 20M tool calls.

| | |
|---|---|
| They pay (negotiated) | **$1,200** |
| 40 scripts | $0.80 |
| 80 GB embedded × $2.41 | $192.80 |
| 20M tool calls (CPU-heavy) | ~$45.00 |
| **Costs us** | **~$239** |
| **We keep** | **~$961 (80%)** |

At list rates 80 GB alone would bill $581, so the negotiated $1,200 is comfortable. Enterprise still has to be quoted against real storage cost rather than the original $40 figure — at this volume storage is the largest variable in the deal.

## Part 6 — Break-even

**Fixed platform cost, regardless of customer count:**

| | |
|---|---|
| Workers for Platforms | $25 |
| Workers Paid | $5 |
| Postgres (Neon Launch, real) | $23 |
| Containers (estimate) | $20 |
| R2, queues, email, misc | $10 |
| **Total** | **~$83/month** |

Workers for Platforms is the largest line, and as of 14 Aug it **is** being paid — the add-on was enabled and both dispatch namespaces created for Custom Tools Phase 2. So the ~$83 above is now the real figure rather than a forecast, where it used to be ~$58. The $25 is a flat per-account fee covering 1,000 scripts; it does not scale with customers until well past that.

The three Pro examples in Part 5 net $26.01, $29.10 and $32.22 — call it **~$29 blended**, because overage revenue rises alongside the usage that causes it:

> **3 Pro customers pay for the entire platform.**

Each additional Pro customer then carries roughly:

- **70 fully-maxed free users** ($29 ÷ $0.41), or
- **290 typical free users** ($29 ÷ $0.10)

**A realistic 1,000-user snapshot at 3% conversion:**

| | |
|---|---|
| 30 Pro × $29 | +$870 |
| 970 free × ~$0.10 | −$97 |
| 30 Pro serving cost × ~$5 | −$150 |
| Platform fixed | −$83 |
| **Net** | **+$540/month** |

Note this snapshot deliberately assumes **no overage at all** on either side: $29 flat revenue against a light customer — a few hundred MB of content (~$0.75) plus ~1,000 shared-key turns (~$4). Using Part 5's blended $15 serving cost here would be wrong, because that average includes Lucía, and a customer who costs that much is also paying $63 rather than $29.

The free tier is cheap enough to be a marketing cost, not a risk.

## Part 7 — Status

**Decided:** Pro is **$29**. Shared-key policy is **1,000 included turns on Ganju's model, then $15 per 1,000** — never BYO-required. Embedded storage is **1 GB included, $2/GB beyond** (was 5 GB / $0.50).

**Measured:** cost per turn, from our own `channel_message` rows, re-measured 13 Aug on 2,356 turns. Planning on **$0.004/turn**.

**Verified end to end (13 Aug, test mode):** shared-key turns increment `shared_message_count` in lockstep with `message_count` on a channel with `llm_id = null`; the hourly cron reports the overage to `ganju_shared_messages`; the Stripe meter total and `reported_shared_message_overage` agree exactly, which is what proves the delta logic reports each overage **once** rather than re-billing it hourly; and `ganju_channel_messages` stays empty while every turn is shared, which is what proves a shared turn bills at $15 and never also at $2. Re-runnable via [scripts/verify-shared-metering.mjs](../scripts/verify-shared-metering.mjs).

### Built

The guardrails the model depends on are now in code:

- **Channel tool cap — `CHANNEL_MAX_TOOLS = 40`** ([constants.ts](../packages/utils/src/constants.ts), enforced in [runner.ts](../apps/api/src/controllers/channel/runner.ts)). Applied to channel turns only; MCP-client traffic pays its own tokens. The RAG core (`RESOURCE_TOOL_KEYS`) is pinned so a cut can never drop `send-resource`, and every truncation logs what it dropped.
- **Split counter.** `subscription.shared_message_count` ([migration 0061](../packages/db/drizzle/0061_square_champions.sql)) counts only turns that ran on our model. `checkMessageCap` returns `sharedUsed`; the runner's shared-model gate and the billing dashboard both read it instead of the org total. Own-key traffic no longer draws down an allowance that exists to bound *our* inference bill.
- **CPU ceiling.** `[limits] cpu_ms = 30000` is now explicit on [apps/mcp](../apps/mcp/wrangler.toml), matching `apps/api`.
- **Model guard.** A comment at `DEFAULT_LLM_MODEL` stating that every number in this document derives from Flash-Lite's rate.
- **Storage repriced, then made honest.** 1 GB included (was 5) at **$2/GB** (was $0.50), and the embedding halved to 1536 dimensions so the real cost is ~$2.41/GB rather than ~$4.51. Price and cost were moved toward each other from both ends.
- **$29 and the two message rates.** `PRICING_PRO_BASE_USD = 29`, `PRICING_INCLUDED_SHARED_MESSAGES = 1_000`, `PRICING_SHARED_MESSAGE_PER_1K_USD = 15`, mirrored through the billing API, dashboard, marketing site, docs and terms.
- **Custom tool calls are metered.** `subscription.tool_call_count` counts dispatches into a customer's own code — not native or proxied tools, which cost one screened fetch — and reports overage above **1,000,000/month** to a fourth meter (`ganju_custom_tool_calls`) at **$5 per million**. Counted in apps/mcp, one statement per request, and only for a call that actually reached the isolate. The line in Part 4 that sold this had nothing behind it until now.
- **A monthly ceiling on that compute.** `toolCallHardCap` — 20,000,000 on Pro, `null` on Enterprise, 10,000 on Free for the downgraded org whose script is still published. The per-script CPU ceiling bounds one call and the rate limiter bounds a minute; this is what bounds a month. Refused at dispatch with the reason, never by dropping the tool from `tools/list`.
- **An abuse process, not just controls** — the runbook in [ABUSE.md](ABUSE.md), and the one command it leans on.
- **Shared-key turns are sold, not blocked.** The runner's old gate stopped a channel at the shared allowance; it now only trips at `PRICING_SHARED_KEY_HARD_CAP` (100,000/mo) as an abuse backstop. Between the allowance and the backstop, shared turns keep running and report to a second Stripe meter (`ganju_shared_messages`) at $15/1,000. Own-key turns keep reporting to the original meter at $2/1,000, and no turn bills to both. The metering split reproduces every worked example in Part 5.

### Stripe — done in test, pending in live

The two-rate model does nothing until Stripe has the objects behind it. **Test mode is complete**: product `Ganju Pro` carries a $29 default price plus four metered prices, backed by meters `ganju_channel_messages` ($2/1,000), `ganju_shared_messages` ($15/1,000), `ganju_embedded_storage` ($0.50/1,024 — the app reports whole MB, so 1,024 units is 1 GB) and `ganju_custom_tool_calls` ($0.005/1,000). The old $20 price is archived, and the product description states the allowance we actually grant.

**The fourth meter now exists in test mode**: `ganju_custom_tool_calls`, same shape as the rest — aggregation `sum`, value key `value`, customer key `stripe_customer_id` — with a metered price on the Pro product at **$0.005 per package of 1,000 calls**, which is $5 per million.

**A package of 1,000 rather than 1,000,000, and the reason is rounding.** Stripe rounds a partial package up, so a million-sized package bills correctly only when the overage lands on a whole million: a customer ten calls past the allowance would owe $5, and one 2.5 million past would owe $15 against the $12.50 every page of ours quotes. The other prices look coarser than this and are not — 1 MB against a 1 GB allowance is 0.1% granularity, where a million against a million-call allowance is 100%. Following the shape of that convention here would have abandoned its intent. The finer package also reads as usage on the invoice (`2,500 × $0.005`) rather than as a mystery (`3 × $5.00`).

**Serving it free is safe; it did not used to be.** Stripe rejects an event whose name matches no active meter, and that rejection used to escape `reportMeter` and abort the whole run for that organization — *after* the message and storage events had gone out and *before* the marks that record them were written. The next hourly run would then report the same messages again. Each meter now reports on its own and only the marks whose event actually landed advance, so a missing meter costs us a rate rather than costing a customer a second invoice. It also means the usage is not lost: the run after the meter exists reports every call the rejections missed, in full.

**Live mode is untouched, and nothing carries over from test.** It needs, in order:

1. Four meters — event names must match `STRIPE_METER_*` in [constants.ts](../packages/utils/src/constants.ts) exactly, aggregation `sum`, value key `value`, customer key `stripe_customer_id`. A typo means events are discarded silently.
2. Five prices on the Pro product. Use **package** pricing (`transform_quantity`), not per-unit — $0.015/message renders as a long decimal on the invoice, and $5 per million renders worse. Size the package so a partial one rounds up to something small: tool calls are `divide_by: 1000` at `unit_amount_decimal: 0.5`, not `divide_by: 1000000` at $5.
3. A webhook at `https://api.ganju.ai/billing/webhook` for `checkout.session.completed` and `customer.subscription.{created,updated,deleted}` — the four the handler switches on.
4. The six `STRIPE_PRICE_*` values plus `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as Worker secrets: `npx wrangler secret put <NAME> --env production`.

Two failure modes worth knowing, both silent. Checkout **skips any overage line whose env var is unset** — deliberate, so the base plan can launch before the meters exist, but it means an unset `STRIPE_PRICE_SHARED_MESSAGE_OVERAGE` serves shared inference for free while the cron still reports it. And the deployed Worker reads **secrets, not `.env`** — a correct local file proves nothing about what checkout actually builds.

Stripe prices are immutable: a rate change means a new price object, set as default, with the old one archived or grandfathered. Existing subscribers stay where they are until moved, and a new line item never attaches retroactively.

### Still open

1. **Re-measure once there's production traffic.** Still open, and the 13 Aug re-measure doesn't close it — 2,317 of its 2,356 turns are one artifact's synthetic traffic, so the *per-tool-count* effect is now well established while the *distribution* of real customer behaviour remains entirely unmeasured. What would actually settle it: several artifacts, several tool counts, human-paced conversations.
2. **Confirm retrieval quality on live traffic after the 1536 change.** Shipped on dev (Part 2.5) and the cost is now ~$2.41/GB, so the $2 price holds and the ~$5/GB fallback is off the table. The residual risk is narrow: the equivalence test used `RETRIEVAL_QUERY` vectors, while documents embed with `RETRIEVAL_DOCUMENT`. Matryoshka shouldn't care, but one real search against freshly-ingested content confirms it for free.
3. **The per-USER-script CPU ceiling** is not the item above — it's a limit on the WfP dispatch namespace and can't exist until Phase 2. Cloudflare's max is 30 seconds; ~5 seconds is plenty and caps the adversarial worst case.
4. **Apply migrations 0061, 0062 and 0063 to *production*** (`npm run migrate-prod`). Dev is done. Until prod has them, the deployed code writes to columns that don't exist — and 0063 changes a column type, so code and migration must ship together or inserts fail on the dimension mismatch.
5. **Repeat the Stripe setup in live mode**, per the checklist above. Test mode is now complete for all four meters; live mode still has none of them.
6. **Click through the hosted Checkout page once.** Everything either side of it is now verified: the five `STRIPE_PRICE_*` values assemble into a valid five-item session at the new rates — re-confirmed against a throwaway customer after the tool-call price was added, since a price with a mismatched interval or currency fails at the moment a customer tries to upgrade and nowhere earlier — and creating that subscription against a Free org fires the webhook, which resolves the org from metadata, maps the $29 price to PRO and writes customer, subscription, price and period end. What's still unexercised is the hosted page itself and the `checkout.session.completed` branch specifically — the test drove `customer.subscription.created` instead. Low risk, but it's the last untouched line.
7. **The marketing estimator models only the own-key rate.** A two-rate slider tested worse than one, so the calculator quotes $2/1,000 and its hint says the estimate assumes your own key. Revisit if support questions say otherwise.
8. **Backfill note:** existing subscription rows start at `shared_message_count = 0`, so any org mid-period gets its shared allowance re-granted once. Harmless while Pro is unlaunched; Free is unaffected because its hard total cap blocks first.
