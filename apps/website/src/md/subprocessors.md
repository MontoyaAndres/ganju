# Subprocessors

**Last updated: August 1, 2026**

A subprocessor is a company we use to deliver the hosted Ganju service that may
handle personal data on our behalf. This page is the authoritative list. It's part of
our [Privacy Policy](/privacy) and our [Data Processing Agreement](/dpa).

**If you self-host Ganju, none of this applies to you** — you choose your own
providers, and the only ones you inherit are the ones you configure yourself.

## How we change this list

Before a new subprocessor starts handling Customer Content, we will:

1. Update this page and the date at the top of it.
2. Email the Owner of every organization on a paid plan **at least 30 days before**
   the change takes effect.
3. Give you a way to object. If you have a reasonable, documented data-protection
   objection we can't resolve, you may terminate your subscription for the affected
   service and we'll refund the unused portion of your current period.

Emergency replacements — a provider that fails or is terminated for cause — may
happen faster. We'll tell you as soon as we can and explain why.

To get these notices, email **hello@ganju.ai** and ask to be added to the
subprocessor notification list. We'll also post changes to the same page you're
reading now.

## Infrastructure

These handle data for every customer. You cannot opt out of them and use the hosted
service.

| Subprocessor | Purpose | Data it handles | Location |
| --- | --- | --- | --- |
| **Cloudflare, Inc.** | Application hosting, CDN, object storage (R2), queues, containers, transactional email routing | All traffic; uploaded files; queued jobs; outbound email | United States / global edge |
| **Neon, Inc.** (on AWS) | Managed Postgres with `pgvector` — our system of record | Accounts, workspaces, Customer Content, text chunks and embeddings, conversations, audit and error logs | AWS `us-east-1`, United States |
| **Google LLC** (Gemini API) | Generating embeddings for every resource and search query | Resource text and search queries | United States / global |
| **Stripe, Inc.** | Subscription billing and payment processing | Name, email, billing address, payment method, usage counts | United States / global |

**Google appears in this tier deliberately.** Embeddings run on our key for every
customer on every plan, so resource text reaches Google whether or not you've
configured anything. See
[AI models, embeddings, and your content](/privacy#ai-models-embeddings-and-your-content).

## Conditional — only if you enable them

These handle data only for organizations that switch on the matching feature. If you
never connect them, they never see anything of yours.

| Subprocessor | Triggered by | Data it handles |
| --- | --- | --- |
| **Google LLC** (shared model) | Running channel replies on Ganju's shared model — the default, and the only option on Free | Conversation history, system prompt, tool definitions and results, retrieved chunks |
| **Anthropic, PBC** | Adding an Anthropic model key | The same turn content, on your own account |
| **OpenAI, L.L.C.** | Adding an OpenAI or OpenAI-compatible model key | The same turn content, on your own account |
| **Tavily** | Installing the web-search or web-extract tools | Your search queries and target URLs |
| **Telegram**, **Slack**, **Meta (WhatsApp)**, **Discord** | Connecting a channel on that platform | Messages to and from your bot, participant identifiers |
| **Google**, **Microsoft**, **Slack**, **Cal.com** | Connecting an account so tools can act on it | Whatever each tool request sends and returns |
| Any **remote MCP server** you connect via `mcp-proxy` | Installing that server | Whatever your tools send it |
| Any **HTTP endpoint** you configure via `http-endpoint` | Installing that tool | Whatever your tools send it |

The last two rows are destinations **you** choose. We can't vet them, we don't
control them, and they are not covered by our commitments — they're listed so the
picture is complete.

## Identity providers

| Subprocessor | Purpose | Data it handles |
| --- | --- | --- |
| **Google LLC** | Social sign-in | Your name, email, profile image |
| **GitHub, Inc.** | Social sign-in | Your name, email, profile image |

## Questions

Write to **hello@ganju.ai** or call **+57 312 4678519**.

Ganju S.A.S. · Bogotá, D.C., Colombia
