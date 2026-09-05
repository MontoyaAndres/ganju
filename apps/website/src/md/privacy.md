# Privacy Policy

**Last updated: September 5, 2026 · Effective: September 5, 2026**

This policy explains what Ganju collects when you use the hosted service at
`ganju.ai`, `app.ganju.ai`, `api.ganju.ai`, and `mcp.ganju.ai`, why we collect it,
who else touches it, and what you can do about it.

Ganju is also open source under Apache-2.0. **If you self-host Ganju on your own
infrastructure, this policy does not apply to you** — you run the servers, you hold
the data, and we never see it. Everything below is about the hosted service we run.

> Esta política también está disponible en
> [español](/es/privacidad). Para los titulares en Colombia, **prevalece la versión en
> español**.

- [Who we are and what role we play](#who-we-are-and-what-role-we-play)
- [What we collect](#what-we-collect)
- [How we use it](#how-we-use-it)
- [AI models, embeddings, and your content](#ai-models-embeddings-and-your-content)
- [Connected accounts and tools](#connected-accounts-and-tools)
- [Google user data](#google-user-data)
- [Chat channels and their end users](#chat-channels-and-their-end-users)
- [Who we share data with](#who-we-share-data-with)
- [Cookies and tracking](#cookies-and-tracking)
- [Security](#security)
- [How long we keep data](#how-long-we-keep-data)
- [Where your data lives](#where-your-data-lives)
- [Your rights and choices](#your-rights-and-choices)
- [Children](#children)
- [Changes to this policy](#changes-to-this-policy)
- [Contact us](#contact-us)

## Who we are and what role we play

The hosted Ganju service is operated by **Ganju S.A.S.**, a *sociedad por acciones
simplificada* incorporated under the laws of Colombia, with its registered address in
**Bogotá, D.C., Colombia** ("Ganju", "we", "us"). You can reach us at
**hello@ganju.ai**.

Ganju S.A.S. is the *responsable del tratamiento* of the personal data described
below, in the sense of Colombia's Ley 1581 de 2012 and Decreto 1074 de 2015. If you
are in the European Economic Area or the United Kingdom, the equivalent term is
"controller".

We play two different roles, and the distinction matters:

- **We are the controller** of your *account* data — who you are, which organizations
  you belong to, how you sign in, what you pay, and the operational logs we keep to
  run and secure the service.
- **We are a processor** of your *Customer Content* — the files, websites, prompts,
  tool configurations, credentials, and chat conversations you put into a project.
  We handle that content on your instruction, to deliver the features you switched
  on. Your organization decides what goes in, who can see it, and when it's deleted.

If you're chatting with a bot that someone else built on Ganju, that person's
organization is the controller of your conversation — see
[Chat channels and their end users](#chat-channels-and-their-end-users).

## What we collect

### Account and identity

| Data | Where it comes from |
| --- | --- |
| Name, email address, profile image, email-verified flag | Google or GitHub sign-in, or the profile you set |
| Password hash (only if you sign in with a password) | You |
| Sign-in provider account IDs, access/refresh tokens, and granted scopes for the identity provider | Google / GitHub |
| Session records: session token, expiry, **IP address**, user agent | Automatically, on each sign-in |
| Avatar image files | You, stored in Cloudflare R2 |

### Workspace and membership

Organization and project names and descriptions, member lists and roles
(Owner / Admin), counts of what each workspace holds, and invitations — including
the **email address of each person you invite**, who invited them, the invitation
token, and whether it was accepted, declined, or expired.

### Billing and usage

Plan and subscription status, current billing period, cancellation flags, and your
Stripe customer and subscription identifiers. We meter three things per organization:
**assistant replies** on chat channels, **embedded (searchable) content in
megabytes**, and **calls to tools you wrote in code**, plus the overage already
reported to Stripe.

**We never see or store your card details.** Payment methods are collected and held
by Stripe; we only receive identifiers and subscription status back.

### Customer Content

Everything you put into a project so your assistant can use it:

- **Resources** — uploaded files (stored in Cloudflare R2), pasted or templated text,
  crawled website pages, and files synced from Google Drive or OneDrive folders. We
  store the file bytes, the extracted text, the title, URI, MIME type, size, and any
  crawl or sync configuration.
- **Text chunks and embeddings** — embeddable resources are split into chunks; each
  chunk's text and its 3,072-dimension vector are stored in Postgres with `pgvector`
  so search works.
- **Prompts** — titles, descriptions, message templates, and input schemas.
- **Tools** — which tools an assistant has installed and their configuration,
  including the URLs, headers, and parameter definitions of any HTTP endpoint or
  remote MCP server you connect.

### Credentials and secrets

OAuth access and refresh tokens for the accounts you connect (Gmail, Google Drive,
Google Calendar, Outlook, OneDrive, Slack), API keys you paste in (Cal.com, Tavily,
your own AI-model provider keys), chat-platform bot tokens, and per-channel webhook
secrets.

**All of these are encrypted before they're written to the database** (XChaCha20-Poly1305),
never returned to the browser in plaintext, and never written to logs. See
[Security](#security).

### MCP traffic

When an MCP client (Claude, ChatGPT, Cursor, and so on) connects to one of your
assistants, we record:

- **Session** — the client's reported name and version, user agent, **IP address**,
  the authentication kind used, request count, and the signed-in user behind it if
  there is one.
- **Request** — the protocol method, the tool name, resource URI, or prompt invoked,
  **the arguments sent and the result returned**, latency, and any error message.

### Chat-channel traffic

For every Telegram, Slack, WhatsApp, or Discord channel you connect:

- Conversations (the external chat ID, a title, whether it's a DM, group, or channel)
- **Message content in both directions**, the role of each message, token counts,
  response latency, and platform metadata
- Participants — the platform user ID and display name of everyone who talks to the
  bot, and a link to a Ganju account if that person chose to link one
- A per-reply breakdown of which tools, prompts, and resources the turn used

### Operational logs

A unified execution audit — who ran which tool, prompt, or resource, from which
source, and when — and an error log capturing the service, HTTP method and path,
query string, error name, message and stack trace, user agent, **IP address**, and
the user, organization, or project the request belonged to.

### Contact form

If you write to us through the contact form on `ganju.ai`, we receive your name or
company, email address, and message, and email it to our team inbox. We don't store
it in the product database.

## How we use it

We use the data above to:

- **Run the service** — authenticate you, serve your dashboard, boot an MCP server
  from your artifact's configuration, execute tools, retrieve resources, and run
  chat-bot replies.
- **Make your content searchable** — chunk and embed resources so retrieval works.
- **Show you what happened** — the Activity chart, usage counters, and recent-activity
  feed on each project's Home page are built from the audit records above.
- **Bill you correctly** — count assistant replies and embedded storage against your
  plan's allowance, enforce Free-plan caps, and report overage to Stripe.
- **Keep things safe** — detect abuse, debug failures, screen outbound requests, and
  investigate security incidents.
- **Talk to you** — transactional email such as invitations, plus replies to support
  requests.

We do **not** sell your personal information, we do **not** share it for
cross-context behavioural advertising, we run **no** advertising or analytics
trackers, and we do **not** use your Customer Content to train AI models.

## AI models, embeddings, and your content

This is the part worth reading twice, because it's where your content leaves our
infrastructure.

### Embeddings — always Google

Every embeddable resource you add is sent to **Google's Gemini API**
(`gemini-embedding-001`) using **Ganju's own API key**, so it can be turned into
vectors. Search queries are embedded the same way. This happens on every plan,
including Free, and there is currently no way to opt out while using the hosted
service and keeping search. If that's not acceptable for a given document, don't
upload it — or self-host.

### Chat-channel replies

When someone messages one of your bots, we run a tool-calling loop against a
language model. What gets sent to that model is: your system prompt, the recent
conversation history (up to 20 turns, or 10 when running on our shared model), the
definitions of the tools that assistant has installed, the results those tools
return, and any resource chunks retrieved to answer the question.

Which model receives it depends on your setup:

- **Ganju's shared model** — the default, and the only option on Free. This is
  currently a **Google Gemini** model, called with our key.
- **Your own model** — on paid plans you can add a key for Anthropic, OpenAI, Google,
  or any OpenAI-compatible endpoint. Those requests go to that provider under your
  own account and their terms.

### MCP clients

When Claude, ChatGPT, Cursor, or another MCP client talks to your assistant, **the
inference happens in that client's model, not ours**. We execute the tools and serve
the retrieved content; the client's provider handles the conversation. Their privacy
policy governs that side.

We do not use your content to train our own models, and we don't grant model
providers the right to train on it. Each provider's own terms govern what they do —
if that matters to you, bring your own key and pick a provider whose terms you've
read.

## Connected accounts and tools

When you connect an account, you grant Ganju an access token scoped to what the
tools need:

| Connection | What the token can do |
| --- | --- |
| **Gmail** | Read, send, compose, modify messages, and manage labels |
| **Google Drive** | Read files and metadata |
| **Google Calendar** | Read calendars and create, update, and delete events |
| **Outlook** | Read and write mail, send mail, read your basic profile |
| **OneDrive** | Read files |
| **Slack** | Post messages, list channels, look up users, upload files, and — with a user token — search messages |
| **Cal.com**, **Tavily** | Whatever the API key you supply permits |

We store the token, its expiry, its scopes, and light metadata — **not a mirror of
your mailbox or drive**. Content is fetched at the moment a tool runs and returned to
the caller; what persists afterwards is the audit record described above, plus any
files you deliberately synced in as resources.

Tools take **real actions** on those accounts — sending email, creating and deleting
calendar events, posting to Slack. You decide which tools an assistant has and who
can reach it.

Two tool types reach systems we don't control: **`http-endpoint`** calls your own
HTTP API, and **`mcp-proxy`** connects a remote MCP server (Notion, GitHub, and
similar). Requests to both are screened against private and loopback address ranges,
but once data leaves for a destination you configured, that destination's operator
handles it. You can disconnect any account from the dashboard at any time, and
revoke access at the provider as well.

## Google user data

Ganju's Gmail, Google Drive, and Google Calendar tools call Google Workspace APIs, and
"Sign in with Google" calls Google's identity APIs. Everything in this policy applies
to that data; this section says specifically what we ask Google for, why, and what
happens to it afterwards.

Nothing here is granted when you sign up. **You connect each Google account yourself,
one at a time, from the dashboard**, and only when you want the matching tools to
work. You can disconnect it at any time — see [Revoking access and deleting
it](#revoking-access-and-deleting-it).

### What we request, and why

**Signing in with Google** uses `openid`, `email`, and `profile`. We read your name,
email address, and profile picture to create your Ganju account and sign you in.
Nothing more.

**Gmail** — requested only when you connect a Gmail account for the Gmail tools:

| Scope | Why the tools need it |
| --- | --- |
| `gmail.readonly` | List, search, and read messages and threads, so your assistant can answer questions about your mail and read a conversation before replying to it |
| `gmail.send` | Send the messages and replies you or your assistant compose |
| `gmail.compose` | Create and update drafts, so a reply can be written for you to review before it goes out |
| `gmail.modify` | Mark messages read or unread, archive them, and apply labels when you ask |
| `gmail.labels` | List and manage labels, so mail can be filed where you want it |

**Google Drive** — `drive.readonly` and `drive.metadata.readonly`. We list your
folders and files so you can pick which to sync into a project, and read the contents
of the ones you picked so your assistant can answer from them. **We never request
write access to Drive.**

**Google Calendar** — `calendar.readonly` and `calendar.events`. We read your
calendars and events so your assistant can answer scheduling questions, and create,
update, and delete the events you ask it to.

### How we use it

Google user data is used for one thing: **providing the features you turned on**. A
tool runs when you, a teammate, or a connected AI assistant acting on your behalf
invokes it — never on a schedule of our own, and never speculatively.

We do **not** use Google user data for advertising of any kind. We do **not** sell it.
We do **not** use it to build profiles, to power features for other customers, or for
any purpose you did not enable.

### What we store, and for how long

- **The OAuth tokens themselves** — access token, refresh token, expiry, and granted
  scopes — encrypted with XChaCha20-Poly1305 before they reach the database, never
  returned to a browser in plaintext, never written to logs.
- **Message, file, and event content is fetched at the moment a tool runs and passed
  straight to the caller.** We do not mirror your mailbox, your Drive, or your
  calendar into our database.
- **The exception you choose**: Drive files you deliberately sync into a project are
  stored as project resources — the file bytes in Cloudflare R2, the extracted text
  and its embedding vectors in our database — because that is the feature you asked
  for. Deleting the resource deletes all of it.
- **Audit records** of tool runs, which include the arguments sent and the result
  returned, so you can see what your assistant did. These are deleted automatically
  after **90 days**.

### Who it goes to

Google user data reaches a third party in only two situations, both of which you
control:

- **The AI model that answers your question.** When a tool returns Gmail, Drive, or
  Calendar content mid-conversation, that content goes to the model running the
  conversation so it can be used in the answer — Google's Gemini API under our key on
  the shared model, the provider whose key you configured if you brought your own, or,
  for MCP clients, the provider behind Claude, ChatGPT, or Cursor. Text you sync from
  Drive as a resource is also sent to Google's Gemini API to be embedded for search.
- **A destination you configured yourself**, if you built an `http-endpoint` or
  `mcp-proxy` tool that sends it there.

**We do not use Google user data — and we do not permit our providers to use it — to
develop, improve, or train generalized AI or machine-learning models.** Model
providers receive it for inference only, to produce the response you asked for.

No human at Ganju reads your Google user data. The narrow exceptions are the ones
Google's policy allows: with your explicit consent (for example, when you ask us to
debug something), where it is necessary for security purposes such as investigating
abuse or a vulnerability, or where we are legally required to.

### Limited Use

**Ganju's use and transfer to any other app of information received from Google APIs
will adhere to the [Google API Services User Data
Policy](https://developers.google.com/terms/api-services-user-data-policy), including
the Limited Use requirements.**

### Revoking access and deleting it

- **In Ganju**: disconnect the account from the dashboard. The stored tokens are
  deleted with it.
- **At Google**: revoke Ganju's access at
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- **Synced Drive resources** are removed by deleting the resource, the project, or the
  organization — each deletion cascades to the stored file, its extracted text, and
  its embeddings.
- Deleting your Ganju account removes the connections and everything under them. See
  [How long we keep data](#how-long-we-keep-data).

## Chat channels and their end users

If you build a Telegram, Slack, WhatsApp, or Discord bot on Ganju, **people will talk
to it, and we will store what they say** — message content, their platform user ID
and display name, and the metadata listed above — on behalf of your organization.

If you operate a channel, that makes you the controller of those conversations. You
are responsible for telling your users that an AI assistant is handling the
conversation, for having a lawful basis to process what they send, and for honouring
their requests. Your organization's admins can read those conversations in the
dashboard.

If you're an end user who talked to a Ganju-powered bot and want your data removed,
contact the organization that runs the bot. If you can't identify them, write to
**hello@ganju.ai** and we'll pass the request on to the operator.

## Who we share data with

We don't sell data. We share it only with the providers that make the service work.
The table below is the summary; the always-current list, with each provider's role
and location, lives on the [subprocessors page](/subprocessors), where we also commit
to telling you before a new one starts handling your content.

| Provider | What they process | Why |
| --- | --- | --- |
| **Cloudflare** | All traffic; uploaded files (R2); queued jobs; container workloads; transactional email routing | Hosting and delivery of the entire platform |
| **Neon** (Postgres on AWS, `us-east-1`) | The primary database: accounts, workspaces, content, chunks, embeddings, logs | Our system of record |
| **Google** (Gemini API) | Resource text and search queries; chat content when running on the shared model | Embeddings and the default shared model |
| **Anthropic**, **OpenAI**, or an OpenAI-compatible endpoint | Chat content | Only when you configure your own model |
| **Stripe** | Name, email, billing details, payment method, usage counts | Payments and subscription management |
| **Tavily** | Your search queries and target URLs | Only if you install the web-search tools |
| **Telegram**, **Slack**, **Meta (WhatsApp)**, **Discord** | Messages to and from your bot | Only for the channels you connect |
| **Google**, **Microsoft**, **Slack**, **Cal.com** | Requests your tools make | Only for the accounts you connect |
| **GitHub**, **Google** | Your identity at sign-in | Social login |
| Any **remote MCP server** or **HTTP endpoint** you configure | Whatever your tools send | You chose the destination |

We may also disclose data when we're legally required to, to enforce our
[Terms](/terms), or to protect the rights and safety of users and the public. If
Ganju is ever involved in a merger, acquisition, or asset sale, data may transfer as
part of it — you'll be told before it becomes subject to a different policy.

## Cookies and tracking

**The marketing site (`ganju.ai`) sets no cookies and runs no analytics, advertising,
or third-party tracking of any kind.** Fonts are served from our own origin, not a
CDN. There's nothing to consent to because there's nothing tracking you.

The **application** (`app.ganju.ai` and `api.ganju.ai`) sets cookies that are strictly
necessary to sign you in:

- A **session cookie** issued at sign-in, scoped across `ganju.ai` subdomains so the
  dashboard and API share your session, marked `Secure` in production, and cleared
  when you sign out or when it expires.
- Short-lived cookies used during OAuth sign-in and consent flows.

We do not use cookies for profiling, retargeting, or measurement.

## Security

- **In transit** — everything runs over TLS on Cloudflare's network.
- **At rest** — OAuth tokens, API keys, bot credentials, and webhook secrets are
  encrypted with XChaCha20-Poly1305 before being stored. Decryption happens only in
  the moment of use, just before the outbound call.
- **Never exposed** — secrets are never returned to the dashboard in plaintext and
  never written to logs or error traces.
- **Isolation** — every query is scoped to the organization and project you're a
  member of; MCP servers are addressed per artifact.
- **Verified webhooks** — chat-platform callbacks are checked against a per-channel
  secret before anything is processed.
- **Screened egress** — the crawler, `http-endpoint`, and `mcp-proxy` screen target
  hosts against private and loopback ranges.

No system is perfectly secure. We don't currently hold a SOC 2, ISO 27001, or
equivalent certification, and we'd rather say so than imply otherwise. If you find a
vulnerability, email **hello@ganju.ai** — we'd genuinely like to hear from you.

## How long we keep data

We keep data for as long as your account and organizations exist, with these
automatic limits:

| Data | Retention |
| --- | --- |
| Detailed MCP request logs (tool arguments and results) | **90 days** |
| Error logs | **90 days** |
| Channel message history | **365 days** |
| Execution audit records | **365 days** |
| Expired sessions | Purged after **30 days** |

Everything else — accounts, organizations, resources, chunks, credentials, and
configuration — is kept until you delete it.

- **Deleting a resource, prompt, tool, credential, or channel** removes it and its
  dependents (chunks, embeddings, conversations, messages) from the database.
- **Deleting an organization** cascades: every project, artifact, resource, chunk,
  channel, conversation, message, credential, model configuration, invitation, and
  audit record under it goes with it. This is irreversible.
- **Uploaded files** in R2 are removed with the resource that references them.
- **Billing records** are retained by us and by Stripe for as long as tax and
  accounting law requires, even after you leave.
- **Backups** roll off on our provider's schedule, so deleted data can persist in
  backups for a short window after deletion.

Want everything gone? Export it from **Settings → Your data**, then delete your
organizations and your account from **Settings → Danger zone**. Organizations you own
have to go first, because deleting one destroys other members' work as well.

## Where your data lives

Our primary database runs on Neon in **AWS `us-east-1` (United States)**. Files sit
in Cloudflare R2 and requests are served from Cloudflare's global edge network, so
traffic is processed in the region closest to whoever made the request. Our model,
payment, and platform providers operate globally.

We are established in Colombia but store and process data in the United States and at
Cloudflare's global edge, so **your data is transferred internationally**, whichever
country you're in.

- **Colombia.** Under Ley 1581 de 2012, by accepting this policy you authorize the
  international transfer of your data to the providers listed above for the purposes
  described here. We rely on that authorization together with the contractual
  safeguards in each provider's data processing terms.
- **EEA, UK, Switzerland.** Transfers rely on the Standard Contractual Clauses and
  equivalent safeguards in our providers' data processing terms.

Our [Data Processing Agreement](/dpa) applies automatically to every customer — you
don't need to sign anything to get it. If you need it countersigned on paper, write to
**hello@ganju.ai**.

## Your rights and choices

Depending on where you live, you may have the right to access, correct, export,
delete, or restrict the processing of your personal data, to object to certain
processing, and to withdraw consent. You also have the right to complain to your
local data protection authority.

Most of this you can do yourself, right now, without asking us:

- **Export your data** — **Settings → Your data → Download my data** returns a JSON
  file with your profile, sign-in methods, sessions, memberships, invitations you
  sent, linked chat identities, and your acceptance record. Secrets are reported as
  presence flags, never in plaintext. Organization-owned content is downloaded from
  the pages that own it, because it belongs to the organization rather than to you.
- **Delete your account** — **Settings → Danger zone → Delete my account**.
  Organizations you own must be deleted or transferred first.
- **Edit, disconnect, or delete** a profile, a connected account, a resource, or a
  channel, from the page it lives on.

For anything the product can't do, email **hello@ganju.ai**. We'll respond within 30
days, or sooner where the law requires it.

**Colombia (Ley 1581 de 2012):** you have the right to know, update, and rectify your
data; to request proof of the authorization you gave; to be told how it has been
used; to file a complaint with the Superintendencia de Industria y Comercio (SIC) for
breaches of the law; to have data deleted when processing is not lawful; and to
access it free of charge. Send a *consulta* or *reclamo* to **hello@ganju.ai** — we
answer consultas within **10 business days** and reclamos within **15 business days**,
extendable as the statute allows, and we'll tell you if we need the extension. You
may revoke your authorization at any time, subject to any legal or contractual duty
that requires us to keep processing. **The SIC will normally only take a complaint
after you have raised it with us first.**

**California residents:** we do not sell personal information and do not share it for
cross-context behavioural advertising, as those terms are defined by the CCPA/CPRA.
You have the right to know, delete, correct, and to be free from discrimination for
exercising those rights.

We will not discriminate against you for exercising any of these rights.

## Children

Ganju is not directed at children, and **you must be at least 18** — the age of legal
capacity in Colombia — to hold an account. Colombian law (Ley 1581 de 2012, art. 7)
gives the data of minors special protection, and we don't knowingly collect it. If
you believe a minor has given us personal data, email **hello@ganju.ai** and we'll
delete it.

If you operate a chat channel that minors can reach, meeting that standard for your
End Users is your responsibility, not ours.

## Changes to this policy

We'll update this page when the product changes what it does with data. The
"Last updated" date at the top always reflects the current version. For material
changes — a new category of data, a new subprocessor handling your content, a new
purpose — we'll notify account owners by email before the change takes effect.
Continuing to use Ganju after that means you accept the updated policy.

## Contact us

Questions, requests, or complaints about privacy:

- **Email** — hello@ganju.ai
- **Phone** — +57 312 4678519
- **Post** — Ganju S.A.S., Bogotá, D.C., Colombia
- **Form** — [ganju.ai/contact](/contact)
