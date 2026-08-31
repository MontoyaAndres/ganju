# Ganju Pricing

Start free, scale when you're ready — or run it yourself for free under Apache-2.0.

## Free — $0/mo

Perfect for personal projects and trying things out.

- 1 workspace, no teammates
- Up to 7 tools, 3 prompts, 1 channel
- 30 MB files · ~5 MB searchable (embedded) content
- 100 channel messages / mo on our shared AI model
- Your own connection link
- Community support

## Pro — $29/mo + usage

For teams and growing products. A flat base that includes an allowance; you pay
only for what you use beyond it.

- Unlimited projects, teammates, tools & prompts
- Connect your own AI model (bring-your-own-key)
- Includes 3,000 channel messages/mo — up to 1,000 of them on our AI model — + 1 GB searchable content each month
- Past that: $2 per 1,000 messages on your own AI key, $15 per 1,000 on ours · $2 per extra GB
- MCP-client tool calls (Claude, Cursor, ChatGPT) are bundled — not billed as messages
- Includes 1,000,000 calls/mo to tools you write in code, then $5 per million
- Custom domain add-on ($15/mo) · build your own custom tools
- 24/7 support

Three things are metered, because they're the only things that cost us money:
channel-bot assistant replies (each runs an LLM tool-calling loop), embedded
RAG content (stored as vectors in Postgres), and calls to tools you wrote in code
(which run on our compute). Raw file storage is free, and so are calls to the
integrations we ship.

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
