# Models

How an artifact's channel turns reach a language model: the two tiers of key, the adapter layer they run through, and how a customer points Ganju at a service we've never heard of. For what those turns cost and how they're billed, see [PRICING.md](PRICING.md).

## Where inference happens — and where it doesn't

**The MCP Worker never calls a model.** [`apps/mcp`](../apps/mcp) assembles tools, resources and prompts and serves them over MCP; the client on the other end pays for its own inference on its own model. That's the whole point of the artifact — an MCP server is a capability surface, not an agent.

Inference happens in exactly one place: the **channel runner** ([`apps/api/src/controllers/channel/runner.ts`](../apps/api/src/controllers/channel/runner.ts)). When a message arrives from WhatsApp, Telegram, Slack or Discord, the runner connects to our own MCP Worker *as a client* over a service binding, lists the artifact's tools, and drives a tool-calling loop:

```
resolveChannelLlm  → which key and model this channel uses
getLlmAdapter      → the provider implementation
adapter.complete   → one model call
  stopReason === 'tool_use' → execute the calls against the MCP client → repeat
```

The loop is bounded by `MAX_TOOL_LOOPS` and the number of tools by `CHANNEL_MAX_TOOLS`, both in [`constants.ts`](../packages/utils/src/constants.ts). Those bounds are cost controls as much as quality ones — tool schemas are re-sent on every call in the loop.

**Embeddings are a separate path.** Retrieval runs on `EMBEDDING_MODEL` through Google regardless of what a channel is configured with; an org that brings its own Anthropic key still has its resources embedded by us. Nothing in this document changes that.

## Two tiers of key

| | Shared platform model | Organization's own model |
|---|---|---|
| Selected by | `channel.llm_id IS NULL` | `channel.llm_id` → an `organization_llm` row |
| Key | `EMBEDDING_API_KEY` (ours) | the org's, encrypted at rest |
| Model | `DEFAULT_LLM_PROVIDER` / `DEFAULT_LLM_MODEL` | whatever the row says |
| History replayed | `SHARED_KEY_HISTORY_LIMIT` | `CHANNEL_HISTORY_LIMIT` |
| Tool loops | `SHARED_KEY_MAX_TOOL_LOOPS` | `MAX_TOOL_LOOPS` |
| Who pays | we do | they do |

The tightened envelope on the shared tier is deliberate: input tokens and number of model calls are the two dominant cost drivers, and those are the two knobs that bound them.

> **`DEFAULT_LLM_MODEL` is a pricing constant, not a config value.** Every plan rate is derived from its per-token price. Changing it is a pricing change and the plan economics have to be redone alongside it — the comment above the constant says so, and [PRICING.md](PRICING.md) shows the arithmetic.

## The adapter layer

Every provider implements one interface — [`apps/api/src/utils/llm/types.ts`](../apps/api/src/utils/llm/types.ts):

```ts
interface LlmAdapter {
  complete: (input: LlmAdapterInput) => Promise<LlmCompletion>;
}
```

`LlmMessage`, `LlmToolCall`, `LlmUsage` and `LlmStopReason` are the neutral vocabulary in between. Each adapter translates to and from its provider's wire format, and the runner never learns which one it's talking to. There are three implementations:

| Provider constant | Adapter | Notes |
|---|---|---|
| `google` | [`gemini.ts`](../apps/api/src/utils/llm/gemini.ts) | round-trips `thoughtSignature` so thinking survives a tool loop |
| `anthropic` | [`anthropic.ts`](../apps/api/src/utils/llm/anthropic.ts) | folds tool results into a user turn; `max_tokens` comes from `config` |
| `openai` | [`openai.ts`](../apps/api/src/utils/llm/openai.ts) | |
| `openai-compatible` | [`openai.ts`](../apps/api/src/utils/llm/openai.ts) | same adapter, customer-supplied `baseUrl` |

`config` on the row is passed through to the provider call untouched, so provider-specific parameters (`temperature`, routing preferences, anything the endpoint accepts) can be set without a code change.

Adapters are **non-streaming** by design. A channel reply is delivered as one platform message, so there is nothing to stream to.

## Adding a model to the picker

[`LLM_CATALOG`](../packages/utils/src/constants.ts) is the list the dashboard's dropdown renders: a `provider`, a `model` id sent verbatim to the provider, and a `label` shown to the customer. Adding an entry is a one-line change, but it is a hand-maintained list, so:

- **The `model` string must be exactly what the provider's API expects.** A typo here is invisible until a customer picks the row and the turn fails against a live channel. Don't type it from memory — every provider SDK in `node_modules` ships a union of the ids it knows (`ChatModel` in `openai`, `Model_2` in `@google/genai`, `Model` in `@anthropic-ai/sdk`), and checking against those is the difference between a verified id and a plausible one. Anthropic ids are all-dashes: `claude-sonnet-4-6`, never `claude-sonnet-4.6`.
- **An id missing from the pinned SDK's union is not necessarily wrong.** Each union ends in `(string & {})` and the model string is sent verbatim, so a model released after the pinned SDK still works. Check the current SDK on npm before concluding an id is bad.
- **Prefer GA ids over `-preview` ones.** A preview is retired on the provider's schedule, not ours, and this is a list customers pick from.
- **The `label` must describe the `model` on the same row.** These drift apart easily, and a mislabeled row means a customer chooses one tier and is billed for another.
- **Removing a row is not free.** `organization_llm` stores `provider` and `model` on the row and the catalog is only a label lookup, so a customer already on a removed model keeps working but sees `provider / model` instead of a label. Check what rows exist before pruning:

  ```sql
  SELECT provider, model, count(*) FROM organization_llm GROUP BY 1, 2;
  ```

## Custom and OpenAI-compatible services

The catalog can't keep up with every model, and it shouldn't try. The picker's last option is **Custom (OpenAI-compatible)**: the customer supplies a model id and a base URL, and the row is stored with provider `openai-compatible` and served by the OpenAI adapter.

That one option covers every service speaking the OpenAI chat-completions protocol — aggregators, inference providers, gateways, and self-hosted servers — with no per-vendor code:

| Service | Base URL | Model id |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-opus-5` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Together | `https://api.together.xyz/v1` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| Azure OpenAI | the deployment's endpoint | the deployment name |

Three things constrain it. The rules live in [`llmBaseUrl.ts`](../packages/utils/src/llmBaseUrl.ts) rather than in the schema, because two write paths apply them and neither sees the whole row alone:

1. **A base URL is required.** Without one the OpenAI SDK falls back to `api.openai.com` and the customer's key goes somewhere it doesn't belong.
2. **`https://` only.** The API key travels in a request header.
3. **Public hosts only.** The URL is an outbound fetch target chosen by a customer, so it goes through the same `isBlockedHost` screening as every other caller-supplied URL — no loopback, private or link-local addresses. The Workers runtime can't resolve DNS, so this screens literal hosts and IPs; it is not a defense against DNS rebinding.

Create validates a complete payload, so the schema checks it. An update is a partial — the provider can arrive in the request while the base URL only exists on the stored row — so the controller runs `llmBaseUrlIssue` against the row the update *would produce*. Switching a row to `openai-compatible` without sending a URL, and clearing the URL of a row already on it, each pass their own half of the check and are caught only there.

Both rejection messages are constants in [`constants.ts`](../packages/utils/src/constants.ts), for the two reasons every hand-written validation message in this codebase is: `localizeZodIssue` keys its Spanish translations on the exact English text, and `matchStatus` reads the message to pick a status — the update path throws a plain `Error` rather than a `ZodError`, and a message carrying none of its keywords would answer 500 where it means 400.

### What a custom row gives up

The adapter is a lowest-common-denominator one, so anything provider-specific is lost:

- **Gemini's `thoughtSignature` round-trip.** A gateway that normalizes reasoning into its own field will not preserve it, and thinking context is dropped between tool loops. Route Google through the `google` provider, not through a proxy.
- **Reliable tool calling.** A channel turn can put dozens of tool schemas in front of the model across several loops. Models vary widely here, and a model that emits malformed arguments degrades quietly inside the loop rather than failing loudly. Anything offered as a preset should be verified against a tool-heavy artifact first.
- **A single point of failure.** Every org behind one gateway fails together, where direct providers fail independently.

### Why the shared tier stays direct

An aggregator takes a margin on inference. On the shared tier we pay the bill, and we already have a direct rate — routing it through a third party marks up every Free turn for nothing. A gateway is a *bring-your-own-key* feature: the customer chooses the tradeoff and pays for it.

It is also another processor handling customer prompts, which is a consideration for compliance work independent of the cost.

## Related

- [PRICING.md](PRICING.md) — what a turn costs, the split counter, and metering
- [DATA_MODEL.md](DATA_MODEL.md) — the `organization_llm` and `channel` tables
- [ARCHITECTURE.md](ARCHITECTURE.md) — where the runner sits among the apps
