---
title: Agent skill
description: Install the ganju-cli skill so Claude Code and other coding agents can write, test, deploy and debug your Ganju functions with the CLI, and know which steps to leave to you.
order: 39
updated: 2026-09-18
---

The **ganju-cli skill** teaches an AI coding agent, such as Claude Code, how to
build [Functions](/docs/tools/functions/) with the [`ganju` CLI](/docs/tools/cli/).
With it installed you can say *"add a tool that looks up an order in our
Shopify store"* and the agent writes the `ganju.json` entry and the handler,
builds it, tests it, and tells you exactly what's left for you to do.

A skill is a folder of instructions the agent loads only when it's relevant,
so it costs nothing in conversations that aren't about Ganju. It follows the
open [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)
format.

## Install it

**For yourself, in every project (Claude Code):**

```bash
git clone --depth 1 https://github.com/MontoyaAndres/ganju.git /tmp/ganju
mkdir -p ~/.claude/skills
cp -r /tmp/ganju/skills/ganju-cli ~/.claude/skills/
```

**For your team, in one repository:** copy the folder to
`.claude/skills/ganju-cli` inside the repository that holds your tools and
commit it. Everyone who opens that repository with Claude Code gets it.

**In the Claude apps:** zip the `ganju-cli` folder and upload it as a custom
skill in Claude's settings.

To update, copy the folder again. The skill is plain Markdown, so you can read
exactly what it tells the agent in
[`skills/ganju-cli`](https://github.com/MontoyaAndres/ganju/tree/main/skills/ganju-cli).

## When it's used

The agent loads the skill on its own when the conversation is about Ganju
tools, for example:

- the folder has a `ganju.json`, or the code imports `@ganju/sdk`;
- you mention a `ganju` command: `deploy`, `test`, `logs`, `secret`, …;
- you ask to add a tool to your Ganju assistant, bot or MCP server;
- you ask why a Ganju tool call failed.

## What it teaches

| Area | What the agent learns |
| --- | --- |
| **The workflow** | `init` → `link` → `build` → `test` → `deploy` → `logs`, and when each one is safe to run |
| **`ganju.json`** | Tool declarations, the supported JSON Schema subset, reserved names, `connections`, `allowedHosts`, `timeoutMs`, `resourceAccess` |
| **Handlers** | `defineTool`, the Worker runtime (no Node APIs), and error messages the model can act on |
| **`ctx`** | `secret`, `connection`, `resources`, `sendFile` and `log`: signatures, limits and gotchas |
| **Debugging** | Reading `ganju test` and `ganju logs`, testing the live version, rolling back |
| **CI** | Project-scoped tokens and a GitHub Actions deploy step |
| **Troubleshooting** | The common error messages, what causes each, and the fix |

It also points the agent at the [examples](/docs/tools/examples/), so a new
tool often starts as a copy of the closest one.

## What it leaves to you

Some steps need a person, and the skill tells the agent which ones instead of
letting it guess:

- **Signing in.** `ganju login` opens your browser, so the agent asks you to
  run it. In Claude Code, type `! ganju login` in the prompt.
- **Secret values.** The agent writes the `ctx.secret('NAME')` call and hands
  you the `ganju secret set` command. You type the value, which never goes
  through the conversation or your shell history.
- **Connecting accounts.** Gmail, Google Calendar, Slack and the rest are
  connected on your project's **Tools** page.
- **Access tokens for CI.** `ganju token create` needs your browser login.
- **Deploying to a project people use.** `ganju deploy` changes what every
  client sees, and replaces the project's whole set of custom tools with the
  ones in the folder. So the agent checks `ganju versions` for anything live
  it would drop, and confirms with you first. `ganju test` is real too:
  a tool that sends email sends one. The agent says so, and aims it at a safe
  target, before running it.

## Try it

After installing, open Claude Code in an empty folder and ask:

> Make me a Ganju tool that converts prices between currencies using the
> Frankfurter API, and get it ready to deploy.

The agent scaffolds the project, declares `api.frankfurter.dev` in
`allowedHosts`, writes a handler with schemas the platform accepts, and runs
`ganju build` to check it. It then tells you to run `ganju login`, and gives
you the `link`, `test` and `deploy` commands to finish.

## Next

- **[`ganju` CLI](/docs/tools/cli/)**: every command the skill uses.
- **[Examples](/docs/tools/examples/)**: five projects the agent can start
  from.
- **[Functions](/docs/tools/functions/)**: the same work in the dashboard.
