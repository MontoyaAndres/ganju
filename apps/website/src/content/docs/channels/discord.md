---
title: Discord
description: Connect a Discord application — reset the bot token, enable the message intents, paste the token, application ID, and public key, then set the interactions endpoint.
order: 54
updated: 2026-07-07
---

**Discord** connects through an application you create in the Discord Developer
Portal. You'll grab three values — the **bot token**, **Application ID**, and
**Public key** — enable the message intents, and invite the bot. Free-form
messages reach Ganju over Discord's Gateway automatically; slash commands use the
**Interactions Endpoint URL** you set at the end.

## 1. Create an application and bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   and select **New Application**. Name it and accept the terms.
2. On **General Information**, copy the **Application ID** and the **Public key**.
3. Open the **Bot** tab and select **Reset Token**, then copy the **bot token**
   (treat it like a password).

## 2. Enable intents and invite the bot

1. Under **Bot → Privileged Gateway Intents**, enable **Message Content Intent**
   and **Server Members Intent**. Without Message Content, the bot can only read
   DMs or messages where it's @mentioned.
2. Invite the bot to your server with the **`bot`** and **`applications.commands`**
   scopes, and the **Send Messages**, **Read Message History**, and **Attach
   Files** permissions.

## 3. Connect it in Ganju

In **Channels → Add channel**, pick **Discord**, choose a language model, and fill
in:

![The Connect channel panel with Discord selected, showing Bot token, Application ID, and Public key fields](/images/new-channel-discord.webp)

- **Bot token** — from the **Bot** tab (Reset Token).
- **Application ID** — from **General Information**; used to register slash
  commands.
- **Public key** — from **General Information**; used to verify incoming
  interactions.

Select **Connect**. Ganju opens the Gateway connection right away, so the bot can
already reply to messages.

## 4. Set the interactions endpoint

To enable native slash commands, Ganju gives you an **Interactions Endpoint URL**
after connecting. Paste it into your application's **General Information →
Interactions Endpoint URL** and save — Discord verifies it against your public key.

Sources: [Discord Bots & Companion Apps (Discord docs)](https://docs.discord.com/developers/bots/overview),
[Application setup (discord.js)](https://discordjs.guide/legacy/preparations/app-setup)
