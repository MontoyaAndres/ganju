---
title: WhatsApp
description: Connect the WhatsApp Business (Meta) Cloud API — create a permanent System User token, grab your phone number ID, and point the webhook at Ganju.
order: 52
updated: 2026-07-07
---

**WhatsApp** runs on Meta's **WhatsApp Business Cloud API**. Setup has a few more
steps than the other channels because it happens in the Meta dashboard, but it's
a one-time job. You'll create a Meta app, generate a **permanent** access token,
copy your **Phone number ID**, then paste Ganju's **Callback URL** back into Meta.

## 1. Create a Meta app with WhatsApp

1. In the [Meta for Developers](https://developers.facebook.com/) dashboard, create
   an app (type **Business**) and add the **WhatsApp** product.
2. Under **WhatsApp → API Setup**, note your **Phone number ID** (a numeric string
   — *not* the phone number itself) and your WhatsApp Business Account ID.

## 2. Generate a permanent access token

The temporary token on the API Setup page expires in 24 hours — create a permanent
one instead:

1. Open **Business Settings → System users** and add a **System user**.
2. Assign your app to it and generate a token with the
   **`whatsapp_business_messaging`** (and `whatsapp_business_management`)
   permission.
3. Set it to **never expire** and copy it. This is your **Access token**.

## 3. Connect it in Ganju

In **Channels → Add channel**, pick **WhatsApp**, choose a language model, and fill
in the fields:

![The Connect channel panel with WhatsApp selected, showing Access token, Phone number ID, and Verify token fields](/images/new-channel-whatsapp.webp)

- **Access token** — the permanent System User token from step 2.
- **Phone number ID** — from **WhatsApp → API Setup** (the ID, not the display
  number).
- **Verify token** — any value you choose; you'll enter the same string in Meta.
- **App secret** — from **App → Settings → Basic**, used to verify incoming
  webhooks.

Select **Connect**. Ganju then shows you a **Callback URL**.

## 4. Point the Meta webhook at Ganju

1. In the Meta dashboard, go to **WhatsApp → Configuration → Webhooks**.
2. Paste Ganju's **Callback URL** and the **Verify token** you chose above, and
   verify.
3. Subscribe the webhook to the **`messages`** field.

Once verified, messages sent to your WhatsApp number reach your assistant.

Sources: [WhatsApp Cloud API — Get Started (Meta)](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started),
[Creating a permanent WhatsApp access token](https://noem.ai/help/creating-a-permanent-access-token-for-whatsapp-business-api)
