---
title: Channels
description: Offer your AI to clients and teams on the apps they already use — Telegram, WhatsApp, Slack, and Discord — and tell it how to answer.
order: 7
updated: 2026-11-13
---

**Channels** are how you deliver your assistant to other people — clients, your
team, or individuals. Connect **Telegram**, **WhatsApp**, **Slack**, or
**Discord** and they chat with it on the app they already use. Everything you set
up — knowledge, data, and tools — comes along automatically.

> **Want the full picture?** This is the quick version. The complete
> **[Channels](/docs/channels/)** guide has step-by-step setup for
> [Telegram](/docs/channels/telegram/), [WhatsApp](/docs/channels/whatsapp/),
> [Slack](/docs/channels/slack/), and [Discord](/docs/channels/discord/).

## Tell the bot how to answer

At the top of **Channels**, **Bot instructions** sets how your bot answers on
every channel (and in the Assistant's **Try it** chat): its language, length and
tone, or what it should always or never say. Up to 2,000 characters. Select
**Save**.

```text
Answer in two sentences at most.
Always answer in Spanish.
Call customers by their first name.
```

Facts like prices and opening hours don't go here — put them in
[Resources](/docs/getting-started/resources/) so the bot can look them up.

![The Bot instructions dialog with example instructions and the 2,000-character counter](/images/channels-bot-instructions.webp)

## Add a channel

Open **Channels** and select **Add channel**. In the **Connect channel** panel,
pick a **Platform**, choose the **Language model** (or leave **System
default**), and fill in that platform's credentials. For Telegram that's just a
**Bot token** — Ganju registers the webhook for you.

![The Connect channel panel with Telegram, Slack, WhatsApp, and Discord options and a bot token field](/images/new-channel.webp)

What each platform asks for:

| Platform | Credentials |
| --- | --- |
| Telegram | Bot token |
| Slack | Bot token, Signing secret |
| Discord | Bot token, Application ID, Public key |
| WhatsApp | Access token, Phone number ID, Verify token, App secret |

Slack, Discord, and WhatsApp then give you a URL to paste back into the
platform (**Request URL**, **Interactions Endpoint URL**, or **Callback URL**) —
the per-platform pages walk through it.

## Create a Telegram bot

For Telegram, the token comes from Telegram's own **@BotFather**. Message it,
send `/newbot`, choose a name and a username ending in `bot`, and copy the token
it gives back. Keep it secret — anyone with it can control your bot.

![The BotFather chat in Telegram walking through /newbot to create a bot and get its token](/images/new-channel-telegram.webp)

## Connect it

Paste the token into the **Bot token** field and select **Connect**.

![The Connect channel panel with a Telegram bot token entered, ready to connect](/images/telegram-token.webp)

The channel shows **Active**. Its **Overview** tab holds its settings:

- **Status** — **Receiving messages**, or **Paused** to drop incoming messages
  without disconnecting.
- **Language model** — switch the model this channel uses. Your own models come
  from [Settings → Models](/docs/settings/#models--bring-your-own).
- **Reply timing** — wait for a pause so several short messages get one answer:
  **Answer every message**, or wait 2, 5 (recommended), 10, or 30 seconds.
- **Replies per customer** — how many replies one customer gets in 24 hours, or
  **No limit**.
- **Customer memory** — **Remember customers**: the bot keeps what each customer
  tells it about themselves (private chats only) and uses it next time.
- **Activity**, with conversation and message counts, and **Remove channel** in
  the **Danger zone**.

![A Telegram channel's Overview: the bot, Receiving messages, Language model, Reply timing and Replies per customer](/images/channel-overview.webp)

## Chat with your assistant

Now anyone can message your bot. Run the `/start` prompt and it introduces
itself with the resources and tools you set up earlier.

![The Telegram bot answering /start with a project overview of its resources and tools](/images/telegram-message.webp)

Ask it to do something real — here, "send me the math book and tell me what it's
about" — and it uses your **tools** and **resources** to answer and deliver the
file.

![The Telegram bot sending the mathematics PDF and describing what the book covers](/images/message-ask-book.webp)

## Monitor conversations

Back in the dashboard, each channel's **Conversations** tab shows every
exchange — the messages, the tools and resources each reply used, and the
**Sources** an answer cited — so you can see exactly how people are using your
assistant.

![A channel's Conversations tab listing a private chat with its message count](/images/channel-conversations.webp)

## Limits and billing

| | Free | Pro / Enterprise |
| --- | --- | --- |
| Channels per project | 1 | Unlimited |
| Assistant replies a month | 100, then it pauses | 3,000 included, then billed |

Only your bot's **replies** count — messages people send it are free. See
[Settings → Billing & plan](/docs/settings/#billing--plan).

Next: manage it over time in [settings](/docs/getting-started/settings/).
