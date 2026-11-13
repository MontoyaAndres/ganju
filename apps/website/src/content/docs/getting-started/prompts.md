---
title: Prompts
description: Create reusable prompt templates that become slash commands in your chat channels.
order: 4
updated: 2026-11-13
minutes: 3
outcome: "A `/start` command people can run in any channel."
---

**Prompts** are reusable message templates your project exposes. In any linked
chat channel, each prompt becomes a **slash command** people can run by name, so
a common request becomes a one-word shortcut. MCP clients like Claude see them
too. Use `{{variables}}` in a message for values that get filled in when it
runs.

> **Want the full picture?** This is the quick version. The complete
> **[Prompts](/docs/prompts/)** guide covers multi-turn templates, typed
> variables, and editing messages as JSON.

## Create a prompt

1. Open **Knowledge** in the rail, then the **Prompts** tab.
2. Select **New prompt**. The **New Prompt** panel opens.

![The New Prompt panel: Title, Description, Messages with the Visual/JSON switch and Add message](/images/new-prompt-panel.webp)

## Fill it in

1. **Title**: a short name. Ganju turns it into the slash command shown just
   below it (**Slash command:**). Here, `start` becomes `/start`.
2. **Description**: what the prompt does. People and AI clients see it.
3. **Messages**: write one or more messages, switching each between **User**
   and **Assistant**. **Add message** adds another turn. Prefer raw JSON? Switch
   **Visual / JSON** at any time.
4. **Variables**: any `{{name}}` you type is detected automatically. Set each
   one's **Type**, a **Description**, and whether it's **Required** or
   **Optional**.

## Use it

Select **Create**. The prompt appears as a card with its slash command,
description, and messages, ready to run from any linked channel as `/start`.
Open a card to edit it, or delete it from there.

![A saved prompt card showing its title, /start command and description](/images/knowledge-prompts-tab.webp)

## Limits

| | Free | Pro / Enterprise |
| --- | --- | --- |
| Prompts per project | 3 | Unlimited |
