---
title: MCP clients
description: Copy your project's MCP URL and connect it to any MCP client — Claude, ChatGPT, Cursor, or VS Code — so your AI works right inside the tools you already use.
order: 7
updated: 2026-11-13
---

Every Ganju project is a **Model Context Protocol (MCP) server**. That means any
MCP-compatible client — **Claude**, **ChatGPT**, **Cursor**, **VS Code**, and
more — can connect to it and get your project's [prompts](/docs/prompts/),
[resources](/docs/resources/), [tools](/docs/tools/), and [data](/docs/data/).
Where [channels](/docs/channels/) deliver your assistant to other people, MCP
clients wire it into your own workflow.

## Copy your MCP URL

Each project has its own **MCP URL**, shown at the top right of the project
**Home**. Click it (**Click to copy**) to copy it — that single link is
everything a client needs. It looks like:

```
https://mcp.ganju.ai/your-project-slug
```

![The project Home with the MCP URL box, its copy and edit buttons at the top right](/images/project-home.webp)

## Change the URL

Select the pencil next to the MCP URL to open **Edit MCP URL**. Change the
**Slug** — the last part of the address — and the **Preview** updates the full
**MCP URL** and a ready-to-paste **Client config**, the JSON block most MCP
clients accept. Select **Save** to apply it.

![The Edit MCP URL dialog: the slug, the full MCP URL and the client config JSON](/images/home-mcp-edit.webp)

```json
{
  "mcpServers": {
    "my-company": {
      "url": "https://mcp.ganju.ai/my-company"
    }
  }
}
```

A slug is 3 to 63 lowercase letters, digits, or hyphens, starting and ending
with a letter or digit. Some slugs are reserved, and each one can only be used
by one project. New projects get a unique generated slug; you can set your own
on any plan.

> Changing the slug changes the address. Clients connected to the old URL stop
> reaching the project — reconnect them with the new one.

## Add it to your client

The steps differ slightly per client, so follow each one's own documentation —
in every case you're pasting the **MCP URL** (or the client-config JSON):

- **Claude** — Settings → **Connectors** → **Add custom connector**, then paste
  your MCP URL. See
  [Claude's custom-connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
- **Claude Code** — add it from a terminal:

  ```bash
  claude mcp add --transport http my-company https://mcp.ganju.ai/my-company
  ```

- **ChatGPT** — enable **Developer mode**, then Settings → **Connectors** →
  **Advanced**, and add your server URL. See
  [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt).
- **Cursor** — Settings → **Tools & MCP** → **New MCP Server**, or drop the JSON
  in `.cursor/mcp.json`. See [Cursor's MCP docs](https://cursor.com/docs/mcp).
- **VS Code** — Command Palette → **MCP: Add Server**, or edit
  `.vscode/mcp.json`. See
  [Add MCP servers in VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers).

## Sign in from the client

The first time a client connects, it opens a Ganju sign-in in your browser. Sign
in with your Ganju account and approve the connection. From then on, the client
acts as you:

- **Only project members can connect.** An account that isn't a member of the
  project is refused, even if it's in the organization. Add people under
  [Settings → Projects → Members](/docs/settings/#projects).
- The client sees the project's prompts, resources, and the tools that are
  turned on. With [Data](/docs/data/), a signed-in person works on every table,
  and an organization member also gets the database's admin tools.
- Removing someone from the project stops their client on its next request.

Once connected, ask the client to use your tools or search your resources — it
routes through your Ganju project securely.

## Approving actions

Two safeguards apply to tools that send, change, or delete something:

- **Confirm sensitive actions** (an organization setting, off by default): the
  first call comes back *not run yet*, the assistant asks you in its chat, and
  runs it on a second call. See
  [Settings → Confirm sensitive actions](/docs/settings/#confirm-sensitive-actions).
- **After outside content** (always on): once the session has read outside
  content — an email, a web page, another server's answer — that content could
  have been written to steer the assistant. A sensitive action then needs your
  own yes, outside the chat. The assistant gives you a link to a dashboard page,
  **An assistant wants to take an action**, showing the action and **With these
  details**. Select **Approve** or **Deny**, then tell the assistant. An approval
  runs once, with exactly those details, and requests expire 10 minutes after
  the assistant makes them. Only the person signed in to that client's
  connection can answer.

Read-only tools — searching, listing, reading — run straight away in both
cases.

## Watching and billing

**Home** charts all activity across channels and MCP clients together (a client
like `claude-code` shows up right next to your Telegram channel), and
[Tool health](/docs/analytics/#tool-health) lists every call a client made.

An MCP client runs its own model, so its conversations aren't **assistant
replies** — they don't use your reply allowance. Calls to
[functions](/docs/tools/functions/) you wrote do count as **custom tool calls**,
the same as from a channel. See
[Settings → Billing & plan](/docs/settings/#billing--plan).

## Troubleshooting

- **"You do not have access".** The account you signed in with isn't a member of
  this project. Sign in with another account, or ask a project member to add
  you.
- **The client can't connect after I changed the slug.** It's still using the
  old URL. Remove the server from the client and add the new one.
- **A tool is missing in the client.** It's turned off on the **Tools** page, or
  the client cached an older tool list — reconnect or restart the client.
- **An action says it needs approval and there's no link.** The connection has
  no signed-in user (for example, a machine token), so there's nobody to
  approve; such calls don't run after outside content.
