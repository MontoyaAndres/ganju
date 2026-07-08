---
title: Channels
description: Offer your AI to clients and teams on the apps they already use — Telegram, Slack, WhatsApp, and Discord.
order: 7
updated: 2026-07-06
---

**Channels** are how you deliver your assistant to other people — clients, your
team, or individuals. Connect **Telegram**, **Slack**, **WhatsApp**, or
**Discord** and they chat with it on the app they already use. Everything you set
up — prompts, resources, and tools — comes along automatically.

> **Want the full picture?** This is the quick version. The complete
> **[Channels](/docs/channels)** guide has step-by-step setup for Telegram,
> WhatsApp, Slack, and Discord, plus connecting [MCP clients](/docs/mcp).

## Add a channel

Open **Channels** and select **Add channel**. Pick a **platform**, choose the
language model (or leave **System default**), and paste a **bot token** — Ganju
registers the webhook for you.

![The Connect channel panel with Telegram, Slack, WhatsApp, and Discord options and a bot token field](/images/new-channel.webp)

## Create a Telegram bot

For Telegram, the token comes from Telegram's own **@BotFather**. Message it, send
`/newbot`, choose a name and a username ending in `bot`, and copy the token it
gives back. Keep it secret — anyone with it can control your bot.

![The BotFather chat in Telegram walking through /newbot to create a bot and get its token](/images/new-channel-telegram.webp)

## Connect it

Paste the token into the **Bot token** field and select **Connect**.

![The Connect channel panel with a Telegram bot token entered, ready to connect](/images/telegram-token.webp)

The channel goes **Active**. From its **Overview** you can toggle **Receiving
messages**, switch the model, watch activity, or remove the channel.

![The connected Telegram channel marked Active, with its status, model, and activity panel](/images/channel-done.webp)

## Chat with your assistant

Now anyone can message your bot. Run the `/start` prompt and it introduces itself
with the resources and tools you set up earlier.

![The Telegram bot answering /start with a project overview of its resources and tools](/images/telegram-message.webp)

Ask it to do something real — here, "send me the math book and tell me what it's
about" — and it uses your **tools** and **resources** to answer and deliver the
file.

![The Telegram bot sending the mathematics PDF and describing what the book covers](/images/message-ask-book.webp)

## Monitor conversations

Back in the dashboard, each channel's **Conversations** tab shows every exchange —
so you can see exactly how people are using your assistant.

![The dashboard Conversations view showing the /start exchange for a Telegram DM](/images/channel-messages.webp)

The channel card keeps a running count of conversations and messages, and each
reply shows the resources it sent as attachments.

![The Channels page showing conversation and message counts alongside the delivered PDF attachment](/images/channe-show-messages.webp)

Next: manage it over time in [settings](/docs/getting-started/settings).
