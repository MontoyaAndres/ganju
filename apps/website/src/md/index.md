# Ganju — Connect your AI to your files, tools & apps

Ganju lets AI assistants like Claude, ChatGPT, and Gemini — and your bots on
Telegram, Slack, WhatsApp, and Discord — safely use your own documents, tools,
and apps. Your AI answers with your information and gets real work done. Set it
up in minutes, no coding required. Open source under Apache-2.0.

## What it does

- **No setup, no servers** — create a connection and it's live instantly; Ganju hosts and runs everything.
- **Answers from your content** — upload files, add a website, or connect Google Drive / OneDrive; your AI searches all of it.
- **Tools your AI can use** — email, calendar, web search, Slack, or your own apps and services, no coding needed.
- **Bring it to your chat apps** — turn the same setup into a bot on Telegram, Slack, WhatsApp, or Discord.
- **Built for teams** — projects, teammates, and role-based access from day one.
- **See everything it does** — every question, action, and message is recorded.
- **Add your own tools** — need something we don't have? Describe it, fill in what it does, and press Deploy; we run it.

## How it works

1. **Create your workspace** — sign up and start a project.
2. **Add your content & tools** — upload documents, connect a drive or website, switch on tools.
3. **Connect your AI** — link Claude, OpenAI, or Gemini in a couple of clicks.
4. **Share it with your team** — add it as a bot across chat apps.

## Functions — add your own tools

A **function** is a small tool you add to your assistant: look something up in
your own system, work something out, start a job somewhere else. You describe
it, fill in what it does, and press Deploy — we run it, with no server to manage
and nothing to install. A Pro feature; on Free, `http-endpoint` points at your
own app with no code at all.

1. **Describe it** — give the tool a name and say when your assistant should
   reach for it. The starting code is written for you.
2. **Fill in what it does** — the editor suggests what's available as you type
   and underlines mistakes where they are.
3. **Try it privately** — press Run with an example and see what comes back.
   Nobody else can call it, and your live assistant carries on unchanged.
4. **Deploy, or undo** — one button makes it live everywhere your assistant
   works, and every version is kept, so going back is a click.

A whole tool, start to finish — it reads a saved key, asks a shop's own system
about an order, says so plainly when there is no such order, and hands back a
tidy answer for the assistant to use:

```js
import { createHandler, defineTool } from './ganju-sdk.js';

export default createHandler({
  'lookup-order': defineTool(async (input, ctx) => {
    const key = await ctx.secret('SHOP_API_KEY');

    const res = await fetch(
      `https://api.mystore.com/v1/orders/${input.orderId}`,
      { headers: { authorization: `Bearer ${key}` } }
    );

    if (res.status === 404) {
      return { found: false, message: `No order ${input.orderId}.` };
    }
    if (!res.ok) throw new Error(`The shop answered ${res.status}`);

    const order = await res.json();
    ctx.log('looked up', order.id, order.status);

    return {
      found: true,
      status: order.status,
      placedOn: order.created_at,
      eta: order.shipping?.estimated_delivery ?? null,
      tracking: order.shipping?.tracking_url ?? null
    };
  })
});
```

Your tool doesn't have to do it all itself. It is handed the hard and risky
parts, so the part you write stays small:

- **Act as your connected accounts** — `ctx.connection()` sends from the Gmail or
  Slack account you already connected. Passwords and tokens stay server-side.
- **Use a key you saved once** — `ctx.secret()` reads an API key you pasted into
  Settings. Encrypted, and never shown back.
- **Search your own documents** — `ctx.resources.search / read / list`, over the
  same files your assistant answers from.
- **Save something back** — `ctx.resources.create()` writes a report or a note
  onto the project.
- **Send a real attachment** — `ctx.sendFile()` emails or posts a file of up to
  40MB without it passing through your tool.
- **Call any site or API** — `fetch()`, with internal addresses always blocked
  and an optional list of the hosts you allow.

Write it in the browser, or from a terminal if your tools belong in a
repository:

```bash
npm install -g @ganju/cli
ganju init my-tools && cd my-tools
ganju login && ganju link
ganju deploy
```

Fair use, in plain numbers: 5 seconds per run plus the timeout you choose, 60
calls a minute per tool, and 1,000,000 calls a month included on Pro — only the
tools you wrote count. Docs: https://ganju.ai/docs/tools/functions and
https://ganju.ai/docs/tools/cli

## Integrations

Gmail, Outlook, Slack, Google Calendar, Cal.com, Web Search, Google Drive,
OneDrive, Notion, GitHub — plus `http-endpoint` (connect your own app) and
`mcp-proxy` (plug in other ready-made services). No code required.

## Links

- App: https://app.ganju.ai
- Docs: https://ganju.ai/docs
- Pricing: https://ganju.ai/pricing
- Source: https://github.com/MontoyaAndres/ganju
