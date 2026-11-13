---
title: Channels
description: Deliver your assistant to real people on the apps they already use (Telegram, WhatsApp, Slack, and Discord), tune how it answers, and watch every conversation.
order: 5
updated: 2026-11-13
---

**Channels** are how you put your assistant in front of other people. Everything
you've built ([prompts](/docs/prompts/), [resources](/docs/resources/),
[tools](/docs/tools/) and [data](/docs/data/)) comes along automatically; you
just choose where people reach it. Connect a **messaging app** so clients and
teammates chat with your AI where they already are, or connect any
[MCP client](/docs/mcp/) for a power-user workflow.

## Why use channels

- **Meet people where they are.** No new app to install: your assistant lives in
  Telegram, WhatsApp, Slack, or Discord.
- **One assistant, delivered everywhere.** Every channel serves the same prompts,
  resources, tools and bot instructions, so answers stay consistent across apps.
- **Bring your own model.** Each channel can run on the system default or a
  language model you configure in [Settings](/docs/settings/).
- **Stay in control of cost.** Wait for people to finish typing before
  answering, and cap how many replies one customer gets a day.
- **Watch it work.** Every conversation is kept in the dashboard, with what the
  bot looked up and did for each answer.

## What's available

Ganju supports four messaging platforms. Each has its own page with step-by-step
instructions for creating the credentials it needs:

| Platform | What you need | Where it answers |
| --- | --- | --- |
| **[Telegram](/docs/channels/telegram/)** | A bot token from @BotFather | Private chats; in groups when mentioned or replied to |
| **[WhatsApp](/docs/channels/whatsapp/)** | A Meta app with the WhatsApp Business Cloud API | One-to-one chats with your number |
| **[Slack](/docs/channels/slack/)** | A Slack app: bot token and signing secret | Direct messages; in channels when @mentioned |
| **[Discord](/docs/channels/discord/)** | A Discord application: bot token, application ID and public key | Direct messages; in servers when @mentioned |

## Connect a channel

Open **Channels** in the project's sidebar and select **Add channel**. The
**Connect channel** panel asks for:

1. **Platform**: Telegram, Slack, WhatsApp or Discord.
2. **Language model**: leave **System default**, or pick one of your
   organization's models (see [below](#choose-the-language-model)).
3. The platform's credentials. The panel shows what each field is and, for
   Slack, Discord and WhatsApp, the scopes, intents or webhook fields the app
   needs.

![The Connect channel panel: Telegram, Slack, WhatsApp and Discord, the Language model and the Bot token field](/images/channels-connect-panel.webp)

Select **Connect**. Ganju checks the credentials with the platform before saving
them (a wrong token is refused right away) and stores them encrypted. Then:

- **Telegram** is ready at once: Ganju registers the webhook and the command menu
  for you.
- **Slack**, **Discord** and **WhatsApp** need one more step: the channel's
  **Overview** shows a URL to paste back into that platform (the **Request URL**,
  **Interactions Endpoint URL** or **Callback URL**) with a copy button. Each
  platform page covers the exact steps.

A bot, Slack app, Discord application or WhatsApp number can be connected to only
one channel at a time.

## The Channels page

Each connected channel is a card with its bot name, the platform's icon, its
status (**Active** or **Disabled**) and a running count of conversations and
messages. Select a card to open it. The panel has an **Overview** and a
**Conversations** tab, and for WhatsApp a **Message templates** tab.

![The Channels page with Telegram, Slack, Discord and WhatsApp channels, Bot instructions and Add channel](/images/channels-page.webp)

## Channel settings

The **Overview** tab holds everything about one channel:

- **Status**: **Receiving messages** on, or **Paused**. While paused, the
  platform still sends messages to Ganju, but they're dropped until you turn it
  back on.
- **Language model**: change the model this channel uses.
- **Reply timing**: people often send one thought across several messages.
  Waiting for a pause lets the bot answer them all in one reply. Choose **Answer
  every message**, or wait **2**, **5** (recommended, the default), **10** or
  **30 seconds**. The bot never waits more than a minute from the first message,
  and a slash command is always answered right away.
- **Replies per customer**: how many replies one customer gets in 24 hours:
  **20**, **50** (recommended, the default), **100**, **200** or **No limit**.
  Past it, the customer is told once, and the bot stays quiet until the day frees
  up, so spam and all-day chats stop costing you messages and model time.
- **Customer memory**: turn on **Remember customers** and the bot keeps what
  each customer tells it about themselves (name, address, allergies, important
  dates) and uses it next time ("same address as always?"). It's off by default,
  works in private chats only, and customers can ask the bot to forget. You can
  clear it from a conversation.
- **Activity**: the channel's conversation and message counts.
- **Danger zone**: **Remove channel** disconnects it and deletes its
  conversation history. This can't be undone.

![A Telegram channel's Overview: the bot, Receiving messages, Language model, Reply timing and Replies per customer](/images/channel-overview.webp)

## Choose the language model

Every channel runs on a language model. By default that's the **System
default**, run by Ganju. On **Pro** and **Enterprise** you can bring your own:
your own provider and API key, added once in [Settings](/docs/settings/) and
picked per channel, when you connect it or later from its Overview. Until you
add one, the dropdown only offers the system default.

## Tell your bot how to answer

**Bot instructions**, a button at the top of the Channels page, say how your bot
answers on every channel of the project and in the assistant's
[Try it as a customer](/docs/assistant/#try-it-as-a-customer) panel: its
language, length and tone, or what it should always or never say. Write them as
short rules, one per line, and select **Save**:

```
Answer in two sentences at most.
Always answer in Spanish.
Call customers by their first name.
```

![The Bot instructions dialog with example instructions and the 2,000-character counter](/images/channels-bot-instructions.webp)

- They take up to **2,000 characters** (the counter under the box shows how many
  you've used) and work on any model, including the system default.
- On a model with its own system prompt, they're added after it.
- Ganju's own rules come first, so the instructions can't turn off, for example,
  the bot asking a customer before it changes something.
- Keep facts like prices and hours in [Resources](/docs/resources/) instead.

The project [assistant](/docs/assistant/) can also write them for you ("answer
more briefly", "always offer delivery"): it proposes the new text and you approve
it. The dialog reads them again every time you open it, so you always see the
latest version.

## What people can do in a chat

- **Just write.** The bot answers from your resources, uses your tools and
  data, and can send stored files as attachments. In group chats and channels it
  answers only when it's mentioned (or, on Telegram, replied to); in private
  chats it answers everything.
- **Run a prompt.** Each [prompt](/docs/prompts/) is a slash command; the text
  after it fills the prompt's first variable.
- **Send a voice note.** The bot transcribes it and answers as if it were typed.
  Notes longer than five minutes get a reply saying so instead.
- **Confirm sensitive actions.** Before a tool changes something, the bot asks,
  with **Yes / No** buttons where the app has them, and only the person asked
  can answer.
- **Link their account.** `/link` is reserved: it gives the person a code to
  connect their chat account to their Ganju account. For safety it works only
  in a private chat (on Slack and Discord the reply is visible only to them).

With [citations](/docs/resources/#cite-your-sources) on, answers list the
resources they used.

## Watch the conversations

Open a channel's **Conversations** tab to see every chat, each with its title
(the person's name for a private chat, the group or channel name otherwise), a
**Private**, **Group** or **Channel** tag, how many messages it has and when the
last one arrived.
Select one to read the thread:

- every message, with who sent it and when;
- under each answer, the tokens and time it took, and each **Tool**,
  **Resource** or **Prompt** the bot used; select one to see its input, output
  or error, with a link to open it in Tools, Resources or Prompts;
- the files the bot sent as attachments, and the **Sources** it cited (with the
  page number for PDFs);
- tags like **Voice note** or **Daily limit reached**;
- with customer memory on, what the bot **remembers about this customer**, with
  a **Forget** button.

![A conversation thread in the dashboard: the user's /start command and the assistant's answer listing the project's resources, tools and prompts](/images/channel-messages.webp)

For numbers across all channels (conversations, messages, tools), see
[Analytics](/docs/analytics/).

## Connect any MCP client

Messaging apps aren't the only way in. Under the hood your project is a **Model
Context Protocol (MCP) server**, so any MCP-compatible client (**Claude**,
**ChatGPT** or **Cursor**) can connect to the very same assistant, with all your
prompts, resources and tools. Channels are for the people you serve; MCP clients
are for wiring your AI into your own tools and workflows. Both point at one
project. See [MCP clients](/docs/mcp/).

## From the CLI

The [`ganju` CLI](/docs/tools/cli/) lists your WhatsApp message templates and
their status with Meta:

```bash
ganju channel templates
ganju channel templates --json
```

Channels themselves are connected and configured in the dashboard.

## Plan limits

- **Free**: one channel per project, and 100 bot messages a month across the
  organization, on the system default model.
- **Pro** and **Enterprise**: unlimited channels, messages metered past what the
  plan includes, and your own models.

See [Settings](/docs/settings/) for plans and usage.

## Troubleshooting

- **The bot never answers.** Check the channel is **Active** with **Receiving
  messages** on, then the platform-specific step: Slack's Request URL and bot
  events, Discord's Message Content intent, WhatsApp's Callback URL and
  `messages` field. On Slack, **Socket Mode** must be **off**. With it on, Slack
  sends events over its socket instead of to Ganju's Request URL.
- **It answers in DMs but not in a group.** Mention the bot (`@yourbot`). It
  ignores group chatter that isn't addressed to it.
- **It answers late.** That's **Reply timing** waiting for a pause. Pick a shorter
  wait, or **Answer every message**.
- **A customer stopped getting answers.** They probably hit **Replies per
  customer**; the conversation shows **Daily limit reached**. Raise the limit or
  wait for the day to free up.
- **"…is already connected to project…".** That bot, app or number is
  connected to another project's channel. Remove that channel first, or use a
  different bot.
- **Free plan: can't add a channel.** Free allows one channel per project.

Next: manage models, members, and billing in [Settings](/docs/settings/).
