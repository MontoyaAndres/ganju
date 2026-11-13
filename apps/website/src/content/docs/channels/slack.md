---
title: Slack
description: Connect a Slack app — add the bot scopes, install it to your workspace, paste the bot token and signing secret, then set the Request URL for events and slash commands.
order: 53
updated: 2026-11-13
---

**Slack** connects through a Slack app you create once. You'll add a few bot
scopes, install the app to grab its **Bot User OAuth Token** and **Signing
secret**, paste both into Ganju, then set Ganju's **Request URL** as the app's
event endpoint (and for any slash commands).

## 1. Create a Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and select **Create New
   App → From scratch**. Name it and pick your workspace.
2. Leave **Socket Mode** (under **Settings**) **off**. Ganju receives events over
   HTTP at its Request URL; with Socket Mode on, Slack never sends them there.

## 2. Add bot token scopes

Under **OAuth & Permissions → Bot Token Scopes**, add the **required** scopes:

- `app_mentions:read` — see messages that @mention the bot
- `im:history` — read direct messages to the bot
- `chat:write` — post replies
- `files:write` — send files as attachments
- `files:read` — download voice clips to transcribe them

Optionally add the **recommended** scopes so the bot shows names instead of raw
IDs: `users:read`, `channels:read`, `groups:read`.

An app installed before you added a scope needs to be **reinstalled** for it to
take effect. Until `files:read` is there, voice clips get a reply asking the
person to type instead.

## 3. Install and copy credentials

1. Still under **OAuth & Permissions**, select **Install to Workspace** and
   approve. Copy the **Bot User OAuth Token** (starts with `xoxb-`).
2. Under **Basic Information → App Credentials**, copy the **Signing secret**.
3. Open **App Home** and, under **Show Tabs**, enable the **Messages tab** and
   allow users to send messages from it, so people can DM the bot.

## 4. Connect it in Ganju

In **Channels → Add channel**, pick **Slack**, choose a **Language model**, and
paste the **Bot token** and **Signing secret**. The panel lists the required and
recommended scopes and the bot events to subscribe to. Select **Connect**.

![The Connect channel panel with Slack selected: Bot token, Signing secret and the required bot scopes](/images/new-channel-slack.webp)

Ganju checks the bot token with Slack and shows the workspace and bot name on
the channel. The signing secret is checked when Slack sends its first event.

## 5. Set the Request URL

After connecting, the channel's **Overview** shows **Slack setup** with a
**Request URL** and a copy button. Back in your Slack app:

1. Go to **Event Subscriptions** and toggle **Enable Events** on.
2. Paste Ganju's Request URL — Slack verifies it instantly.
3. Under **Subscribe to bot events**, add **`app_mention`** and **`message.im`**,
   then **Save Changes**. Reinstall the app if Slack asks you to.

Now DM the bot, or invite it to a channel (`/invite @yourbot`) and @mention it,
and it replies.

## 6. Add slash commands (optional)

Slack only accepts slash commands you've created in the app, so a
[prompt](/docs/prompts/) becomes a Slack command once you add it there:

1. In your Slack app, open **Slash Commands → Create New Command**.
2. **Command**: the prompt's command as shown on its card, like
   `/summarize_article`.
3. **Request URL**: the same Request URL from step 5.
4. Add a short description and save; reinstall the app if Slack asks.

The text after the command fills the prompt's first variable, and the answer is
posted in the conversation where the command was used. You can also add
`/link`, which replies with an account-linking code only you can see.

## How the bot behaves in Slack

- **Direct messages**: it answers every message.
- **Channels**: it answers only when **@mentioned**, and replies in a thread
  under that message, continuing the thread if there is one.
- **Voice clips** are transcribed and answered like text (needs `files:read`).
- **Sources**: with [citations](/docs/resources/#cite-your-sources) on, a short
  list of source links follows the answer.
- **Files**: the bot can upload stored resources as attachments.
- **Confirmations**: before a tool changes something, the bot asks; reply yes or
  no.

## Troubleshooting

- **The Request URL won't verify.** Make sure you pasted the URL from this
  channel's Overview exactly, and that the channel is **Active**.
- **Events never arrive.** Check **Socket Mode** is off, **Enable Events** is
  on, and both `app_mention` and `message.im` are subscribed.
- **"Sending messages to this app has been turned off".** Enable the
  **Messages tab** in **App Home**.
- **The bot ignores a channel.** Invite it to the channel and @mention it.
- **It shows user IDs instead of names.** Add the recommended scopes and
  reinstall the app.
- **"/command is not a valid command".** Create the slash command in the Slack
  app (step 6).

Sources: [Creating an app from app settings (Slack)](https://docs.slack.dev/app-management/quickstart-app-settings/),
[Installing with OAuth (Slack)](https://docs.slack.dev/authentication/installing-with-oauth/)
