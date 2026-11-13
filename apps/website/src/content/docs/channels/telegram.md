---
title: Telegram
description: Connect a Telegram bot in a minute — create it with @BotFather, paste the token, and Ganju registers the webhook and the command menu for you.
order: 51
updated: 2026-11-13
---

**Telegram** is the quickest channel to set up. You create a bot with Telegram's
own **@BotFather**, copy the token it gives you, and paste it into Ganju — that's
it. Ganju registers the webhook and turns your prompts into the bot's command
menu automatically.

## 1. Create a bot with BotFather

1. Open Telegram and search for **@BotFather** (the verified account with the blue
   checkmark).
2. Start a chat and send **`/newbot`**.
3. Enter a **display name** for your bot (anything you like).
4. Enter a **username** — it must be unique and end in `bot` (e.g. `acme_support_bot`).
5. BotFather replies with your **bot token** — a long string like
   `123456789:AA...`. Copy it.

Treat the token like a password. Optionally, while you're in BotFather, give the
bot a description and a profile picture with `/setdescription` and
`/setuserpic`.

## 2. Connect it in Ganju

In your project, open **Channels → Add channel**, pick **Telegram**, choose a
**Language model** (or leave **System default**), paste the token into **Bot
token**, and select **Connect**.

![The Connect channel panel with Telegram selected and a single Bot token field](/images/new-channel-telegram-1.webp)

Ganju checks the token with Telegram, then:

- registers the bot's **webhook**, so there's no callback URL for you to set;
- registers your [prompts](/docs/prompts/) as the bot's **command menu**, and
  refreshes it whenever you add, rename or remove a prompt.

The channel goes **Active** immediately, with the bot's name and `@username` on
its card.

Ganju now receives the bot's messages through that webhook, so the same token
can't also run on another server or bot platform at the same time — the last
one to set a webhook wins.

## 3. Chat with it

Open your bot in Telegram (via the `t.me/<username>` link BotFather gave you) and
send a message. It replies using your resources, tools and
[bot instructions](/docs/channels/#tell-your-bot-how-to-answer).

- **Private chats**: the bot answers every message.
- **Groups**: add the bot to the group. It answers only when it's
  **@mentioned**, when someone **replies** to one of its messages, or when a
  command is addressed to it (`/command@yourbot`). Other group chatter is
  ignored.
- **Commands**: type **/** to see your prompts in the menu, with their
  descriptions. The text after a command fills the prompt's first variable.
  Telegram shows up to 100 commands.
- **Voice notes** and audio files are transcribed and answered like text; a
  caption counts as text sent with the note.
- **Sources**: with [citations](/docs/resources/#cite-your-sources) on, the
  answer comes with one button per source under it.
- **Files**: the bot can send stored resources (a PDF menu, a price list) as
  attachments.
- **Confirmations**: before a tool changes something, the bot asks with Yes / No
  buttons.

Long answers are split into several messages.

## Change or revoke the token

If the token leaks, revoke it in BotFather via **`/mybots` → your bot → API
Token → Revoke current token**. The old token stops working at once, and so does
the channel. To use the new token, remove the channel and connect it again —
removing a channel deletes its conversation history.

## Troubleshooting

- **"Connect" fails right away.** The token is wrong or was revoked. Copy it
  again from BotFather (`/mybots` → your bot → API Token).
- **The bot doesn't answer in a group.** Mention it (`@yourbot`) or reply to one
  of its messages. Check also that BotFather lets it join groups
  (`/mybots` → your bot → Bot Settings → Allow Groups).
- **The bot stopped answering after you used the token elsewhere.** Another
  service replaced the webhook. Remove the channel and connect it again.
- **A prompt is missing from the menu.** Commands must start with a letter, and
  the menu can take a moment to refresh. Typing the command still works.

Sources: [From BotFather to 'Hello World' (Telegram)](https://core.telegram.org/bots/tutorial),
[Telegram Bot API](https://core.telegram.org/bots/api)
