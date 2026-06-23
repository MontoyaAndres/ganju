# Ganju Pricing

Start free, scale when you're ready — or run it yourself for free under Apache-2.0.

## Free — $0/mo

Perfect for personal projects and trying things out.

- 1 workspace, no teammates
- Up to 5 tools, 5 prompts, 2 channels
- 500 MB files · ~50 MB searchable (embedded) content
- 2,000 channel messages / mo
- Your own connection link
- Community support

## Pro — $20/mo + usage

For teams and growing products. A flat base that includes an allowance; you pay
only for what you use beyond it.

- Unlimited projects, teammates, tools & prompts
- Includes 10,000 channel messages + 5 GB searchable content each month
- Overage: $2 per 1,000 extra messages · $0.50 per extra GB
- MCP-client tool calls (Claude, Cursor, ChatGPT) are bundled — not billed as messages
- Custom domain add-on ($15/mo) · build your own custom tools
- 24/7 support

Only two things are metered, because they're the only things that cost us money:
channel-bot assistant replies (each runs an LLM tool-calling loop) and embedded
RAG content (stored as vectors in Postgres). Raw file storage is free.

## Enterprise — Custom

For larger organizations with advanced needs.

- Everything in Pro
- Proxy your own / existing MCP server through Ganju
- Custom web address & tools
- SSO & contract terms
- Dedicated support with guaranteed response times

## Self-host

Ganju is open source (Apache-2.0). Run it on your own Cloudflare account for free.
Source: https://github.com/MontoyaAndres/ganju
