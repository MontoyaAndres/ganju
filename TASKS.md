- Subscription module on app (Stripe)
- https://www.chatbase.co/
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
- Limits: 5 tools, 5 prompts, 2 channels
- Storage: 500 MB raw files, ≤ ~50 MB embedded/RAG content
- 2,000 channel messages / month (HARD CAP — well below Pro's 10k allowance so
  messages are a real upgrade reason, and channel bots are our costliest path)
- Community support

Pro - $20/mo base + usage (base includes an allowance):

- No limits on prompts/tools/channels
- No limits on orgs/projects/invitations
- Included each month: ~5 GB embedded content + ~10,000 channel messages
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
