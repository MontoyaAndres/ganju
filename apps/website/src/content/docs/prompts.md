---
title: Prompts
description: Build reusable, multi-turn prompt templates with typed variables — each becomes a slash command in your linked chat channels and a prompt in any MCP client.
order: 2
updated: 2026-11-13
---

**Prompts** are reusable message templates your project exposes through its MCP
server. In any linked chat channel, each prompt becomes a **slash command** people
can run by name, so a common request turns into a one-word shortcut. A prompt can
be a single message or a full multi-turn exchange, and any `{{variable}}` you use
is filled in when the prompt runs.

## Why use prompts

- **Turn repeat work into one command.** Capture a request you send again and
  again once, then run it as `/command` — no re-typing, no forgetting the details.
- **Consistent results every time.** Everyone triggers the exact same wording and
  structure, so your AI answers the same way no matter who asks.
- **Share expertise with your whole team.** A well-crafted prompt written once is
  instantly available to every teammate in the channel — no prompt-engineering
  skill required to use it.
- **Guide the model with typed inputs.** Each variable has a type, a description
  and a required flag, so MCP clients know exactly what to ask for.
- **Steer the conversation.** Multi-turn User/Assistant templates set the tone and
  give the model examples to follow, producing sharper, more predictable replies.
- **Edit without redeploying.** Update a prompt in the dashboard and the new
  version is live in every linked channel and MCP client right away.

## Where prompts live

Prompts sit next to your resources. Open **Knowledge** in the project's sidebar
and pick the **Prompts** tab (the **Resources** tab is the other one). The page
lists every prompt as a card with its title, its slash command, its description
and the date it last changed. Until you create one, it shows **No prompts yet**
with a **New prompt** button.

![Knowledge, Prompts tab: a prompt card with its /start command and the New prompt button](/images/knowledge-prompts-tab.webp)

## Create a prompt

Select **New prompt**. The **New Prompt** panel opens on the right with
**Title**, **Description** and **Messages**.

![The New Prompt panel: Title, Description, Messages with the Visual/JSON switch and Add message](/images/new-prompt-panel.webp)

## Name it and write a message

Give the prompt a **Title**. Ganju turns it into the slash command shown right
under it, as **Slash command:** — lowercase, with every run of spaces or symbols
replaced by `_`. "Summarize Article" becomes `/summarize_article`; "test"
becomes `/test`. Two prompts in a project can't share the same command: Ganju
refuses the second one with "A prompt with this command name already exists".

Add a short **Description** so teammates know what it does — Telegram and
Discord also show it next to the command in their menus — then write your first
message.

Drop `{{variables}}` anywhere you want a value supplied at run time. In this
example the user message is `hi user {{name}} your age is {{age}}`, so `name` and
`age` become inputs. A variable name uses letters, digits and underscores.

![The New Prompt panel with the title "test", slash command /test, a description, and a user message containing {{name}} and {{age}}](/images/new-prompt-1.webp)

## Configure the variables

Ganju **auto-detects** every `{{variable}}` in your messages and lists them under
**Variables**. Each new one starts as a required String. For each one you can:

- set the **Type** — **String**, **Number** or **Boolean**;
- add a **Description** to tell whoever runs the prompt what to put there;
- tick or untick **Required**.

Here `{{name}}` is a required String ("user's name") and `{{age}}` a required
Number ("user's age").

![The Variables section listing {{name}} as a required String and {{age}} as a required Number, each with a type and description](/images/new-prompt-2.webp)

Every `{{variable}}` in a message must be listed in Variables; Ganju won't save a
prompt that uses one it doesn't know. When the prompt runs, a variable with no
value is left empty in the text.

## Add more messages

Real prompts are often a conversation, not a single line. Select **Add message**
to append another turn, and switch each message between **User** and **Assistant**
to shape the exchange. This second message is an Assistant turn,
`this is a new {{message}}`.

![The Messages section with two messages: a User message and an Assistant message containing {{message}}](/images/new-prompt-3.webp)

New variables you introduce are picked up automatically — `{{message}}` now
appears alongside `{{name}}` and `{{age}}` in the Variables list, ready to type
and describe.

![The Variables section now showing {{name}}, {{age}}, and {{message}}, each configurable](/images/new-prompt-4.webp)

A prompt needs at least one message. If the last message is an Assistant turn
(a canned greeting, say), the channel bot still adds the person's own text after
it, so the model always has something to answer.

## Edit as JSON

Prefer to work with raw structure? Switch **Visual / JSON** at any time to edit
the messages as an array of `{ role, content }` objects, where `role` is `user`
or `assistant`. It's the fastest way to paste in a template you already have,
and it stays in sync with the visual editor.

![The Messages editor in JSON mode showing an array of role/content objects](/images/new-prompt-5.webp)

```json
[
  { "role": "user", "content": "Summarize this article in three bullets: {{article}}" },
  { "role": "assistant", "content": "Sure — here are the key points:" }
]
```

## Save, edit and delete

Select **Create** and the prompt is saved as a card. Select a card to see its
description and messages; from there you can edit it (the panel becomes **Edit
Prompt**) or delete it. Deleting asks you to confirm and can't be undone.

Every change reaches your channels on its own: Ganju refreshes the command menu
of your Telegram and Discord bots whenever a prompt is added, renamed or
removed.

## Run a prompt from a channel

In a linked channel, type the command, then any text you want to pass:

```
/summarize_article https://example.com/news/launch
```

- The text after the command goes into the prompt's **first variable**. Other
  variables stay empty, so put the one people will type first.
- The prompt's messages, with the variable filled in, replace what the person
  typed, and the bot answers them as usual — with your resources, tools and
  [bot instructions](/docs/channels/#tell-your-bot-how-to-answer).
- A command answers right away, without waiting for a pause in the conversation.
- If no prompt has that name, or the prompt can't be built (for example a
  required variable got no value), the message is answered like any other.

How people find the commands depends on the app:

| Channel | How a prompt shows up |
| --- | --- |
| [Telegram](/docs/channels/telegram/) | In the bot's **/** command menu, with the description. In groups, `/command@yourbot` works too. |
| [Discord](/docs/channels/discord/) | As a native slash command with one optional `text` option. Needs the Interactions Endpoint URL. |
| [Slack](/docs/channels/slack/) | Create a Slack slash command with the same name pointing at Ganju's Request URL. |
| [WhatsApp](/docs/channels/whatsapp/) | No menu: people type `/command` at the start of a message. |

Telegram and Discord list at most 100 commands, and a command name there is cut
to 32 characters and must start with a letter. The name `link` is reserved for
the `/link` command and is never used for a prompt.

Prompts that come from an MCP server you added in [Tools](/docs/tools/) are
commands too, named after their title.

## Use prompts from an MCP client

Your project is also an MCP server, so every prompt is available in
[MCP clients](/docs/mcp/) like Claude, ChatGPT or Cursor under its command name,
with its variables as arguments (descriptions and required flags included). The
client asks for the values and inserts the result into the chat.

## Let the assistant write them

The project [assistant](/docs/assistant/) can list, create, edit and remove
prompts for you — describe the command you want ("a /menu command that lists
today's specials") and it proposes the prompt for you to approve.

## Plan limits

The **Free** plan holds up to **3 prompts** per project. **Pro** and
**Enterprise** have no limit. See [Settings](/docs/settings/) for plans.

## Troubleshooting

- **"A prompt with this command name already exists".** Another prompt's title
  gives the same command (case and punctuation don't count). Change the title.
- **The command doesn't show in Telegram's menu.** Titles that don't start with a
  letter are left out of the menu, and Telegram can take a moment to refresh it.
  Typing the command still works.
- **Discord shows no slash commands.** Set the Interactions Endpoint URL and
  invite the bot with the `applications.commands` scope — see
  [Discord](/docs/channels/discord/).
- **Slack says the command isn't valid.** Slack only accepts slash commands
  you've created in the Slack app — see [Slack](/docs/channels/slack/).

Next: give your prompts something to work with — add
[resources](/docs/resources/).
