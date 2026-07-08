---
title: Slack
description: Connect a Slack app — add the required bot scopes, install to your workspace, paste the bot token and signing secret, then set the Request URL.
order: 53
updated: 2026-07-07
---

**Slack** connects through a Slack app you create once. You'll add a few bot
scopes, install the app to grab its **Bot User OAuth Token** and **Signing
secret**, paste both into Ganju, then set Ganju's **Request URL** as the app's
event endpoint.

## 1. Create a Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and select **Create New
   App → From scratch**. Name it and pick your workspace.

## 2. Add bot token scopes

Under **OAuth & Permissions → Bot Token Scopes**, add the **required** scopes:

- `app_mentions:read`
- `im:history`
- `chat:write`
- `files:write`

Optionally add the **recommended** scopes so the bot shows names instead of raw
IDs: `users:read`, `channels:read`, `groups:read`.

## 3. Install and copy credentials

1. Still under **OAuth & Permissions**, select **Install to Workspace** and
   approve. Copy the **Bot User OAuth Token** (starts with `xoxb-`).
2. Under **Basic Information → App Credentials**, copy the **Signing secret**.
3. Open **App Home** and enable the **Messages tab** so users can DM the bot.

## 4. Connect it in Ganju

In **Channels → Add channel**, pick **Slack**, choose a language model, and paste
the **Bot token** and **Signing secret**, then select **Connect**.

![The Connect channel panel with Slack selected, showing Bot token and Signing secret fields and the required bot token scopes](/images/new-channel-slack.webp)

## 5. Set the Request URL

After connecting, Ganju gives you a **Request URL**. Back in your Slack app:

1. Go to **Event Subscriptions** and toggle **Enable Events** on.
2. Paste Ganju's Request URL — Slack verifies it instantly.
3. Under **Subscribe to bot events**, add **`app_mention`** and **`message.im`**,
   then save.

The same Request URL also works for any **Slash Commands** you add later. Once
events are subscribed, @mention the bot in a channel or DM it and it replies.

Sources: [Creating an app from app settings (Slack)](https://docs.slack.dev/app-management/quickstart-app-settings/),
[Installing with OAuth (Slack)](https://docs.slack.dev/authentication/installing-with-oauth/)
