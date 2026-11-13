---
title: Discord
description: "Connect a Discord application: reset the bot token, enable the message intents, invite the bot, paste the token, application ID and public key, then set the interactions endpoint for slash commands."
order: 54
updated: 2026-11-13
---

**Discord** connects through an application you create in the Discord Developer
Portal. You'll grab three values (the **bot token**, **Application ID** and
**Public key**), enable the message intents, and invite the bot. Free-form
messages reach Ganju over Discord's Gateway automatically; slash commands use the
**Interactions Endpoint URL** you set at the end.

## 1. Create an application and bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   and select **New Application**. Name it and accept the terms.
2. On **General Information**, copy the **Application ID** and the **Public key**.
3. Open the **Bot** tab and select **Reset Token**, then copy the **bot token**
   (treat it like a password; Discord shows it only once).

## 2. Enable intents and invite the bot

1. Under **Bot → Privileged Gateway Intents**, enable **Message Content Intent**
   and **Server Members Intent**. Without Message Content, the bot can only read
   DMs or messages where it's @mentioned.
2. Under **OAuth2 → URL Generator**, tick the **`bot`** and
   **`applications.commands`** scopes, then the **Send Messages**, **Read
   Message History** and **Attach Files** permissions. Open the generated URL
   and add the bot to your server.

## 3. Connect it in Ganju

In **Channels → Add channel**, pick **Discord**, choose a **Language model**,
and fill in:

![The Connect channel panel with Discord selected: Bot token, Application ID, Public key and the required intents](/images/new-channel-discord.webp)

- **Bot token**: from the **Bot** tab (Reset Token).
- **Application ID**: from **General Information**; used to register slash
  commands.
- **Public key**: from **General Information**; used to verify incoming
  interactions.

Select **Connect**. Ganju checks the token with Discord, registers the slash
commands and opens the Gateway connection right away, so the bot can already
reply to DMs and mentions.

## 4. Set the interactions endpoint

Native slash commands arrive separately. The channel's **Overview** shows
**Discord setup** with an **Interactions Endpoint URL** and a copy button. Paste
it into your application's **General Information → Interactions Endpoint URL**
and save. Discord verifies it against your public key on the spot.

## Slash commands

Ganju registers one slash command per [prompt](/docs/prompts/), named like the
command on the prompt's card, each with an optional **`text`** option that fills
the prompt's first variable. It also registers **`/link`**, which replies with an
account-linking code only you can see. The set is updated whenever you add,
rename or remove a prompt. Discord allows up to 100 commands; names are cut to
32 characters.

The answer to a slash command arrives in the same conversation once it's ready.

## How the bot behaves in Discord

- **Direct messages**: it answers every message.
- **Servers**: it answers only when **@mentioned**.
- **Voice messages** are transcribed and answered like text.
- **Sources**: with [citations](/docs/resources/#cite-your-sources) on, sources
  come as link buttons under the answer.
- **Files**: the bot can attach stored resources, up to 25 MB each (Discord's
  limit for bots on servers without boosts).
- **Confirmations**: before a tool changes something, the bot asks with Yes / No
  buttons that only the person asked can use.

Long answers are split into several messages (Discord allows 2,000 characters per
message).

## Troubleshooting

- **The bot is online but ignores messages in a server.** @mention it. If it
  still doesn't answer, check **Message Content Intent** is on.
- **No slash commands show up.** Re-invite the bot with the
  `applications.commands` scope, and set the Interactions Endpoint URL. Discord
  can take a few minutes to show new commands.
- **"Interactions endpoint URL could not be verified".** Check the **Public key**
  you pasted in Ganju is the one on **General Information**, and the channel is
  **Active**.
- **"Connect" fails right away.** The token is wrong or was reset. Reset it again
  and paste the new one.

Sources: [Discord Bots & Companion Apps (Discord docs)](https://docs.discord.com/developers/bots/overview),
[Application setup (discord.js)](https://discordjs.guide/legacy/preparations/app-setup)
