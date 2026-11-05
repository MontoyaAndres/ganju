---
title: WhatsApp
description: Connect the WhatsApp Business (Meta) Cloud API — create a permanent System User token, grab your phone number ID, and point the webhook at Ganju.
order: 52
updated: 2026-11-03
---

**WhatsApp** runs on Meta's **WhatsApp Business Cloud API**. Setup has a few more
steps than the other channels because it happens in the Meta dashboard, but it's
a one-time job. You'll create a Meta app, generate a **permanent** access token,
copy your **Phone number ID**, then paste Ganju's **Callback URL** back into Meta.

## 1. Create a Meta app with WhatsApp

1. In the [Meta for Developers](https://developers.facebook.com/) dashboard, create
   an app (type **Business**) and add the **WhatsApp** product.
2. Note your **Phone number ID** (a numeric string — *not* the phone number
   itself) and your **WhatsApp Business Account ID**. For your real number,
   both are under **WhatsApp → Production setup → Register your WhatsApp phone
   number**, where Meta labels the account "Messaging Account ID". The **API
   Setup** (or **Try it**) page shows Meta's free test number and its own test
   account: use those IDs only to try things with the test number.

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
3. Subscribe the webhook to the **`messages`** field, and to
   **`message_template_status_update`** if you'll use message templates.

Once verified, messages sent to your WhatsApp number reach your assistant.

Meta only forwards a number's messages once your app is **subscribed to its
WhatsApp Business account**. Ganju does that for you when you connect the
channel, and when you save a new token or account id in its **Message
templates** tab. If Meta's
webhook **Test** button works but real messages never arrive, the subscription
is missing. That happens when Meta couldn't tell Ganju which business account
the token belongs to. Fill in the account's id in the **Message templates**
tab, or subscribe the app yourself with the same token:

```bash
curl -X POST "https://graph.facebook.com/v25.0/<WABA_ID>/subscribed_apps" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

## 5. Message templates

WhatsApp only lets a business write freely to a customer within **24 hours of
the customer's last message**. After that, only a **message template** Meta
approved reaches them. Your assistant never needs one, since it always answers
a message. Triggers and functions that message a customer later do — "your
order is ready" the next morning.

Open the channel and the **Message templates** tab. There you can:

- **See your templates** with Meta's status: approved, in review, rejected
  (with Meta's reason), paused or disabled. **Refresh** reads them from Meta
  again.
- **Create one**: a name (lowercase and underscores, like `order_ready`), a
  language, a category, an optional header, the message, an optional footer
  and up to ten quick replies. Variables are inserted with a label ("customer
  name", "order number") and become `{{1}}`, `{{2}}`; Meta asks for an example
  value for each. A preview shows it as a WhatsApp message, and the rules Meta
  rejects most for are checked before it is sent: a variable at the very start
  or end, two variables side by side, too many variables for the text.
- **Edit or delete** one. Meta reviews an edit again and limits how often an
  approved template can be edited; when it refuses, its message is shown as
  is.

**Templates need two things from Meta:**

- **The WhatsApp Business account.** Templates belong to the account, not to
  the number. Ganju asks Meta which one your token manages, so usually there's
  nothing to do; when Meta can't tell, the tab asks for the **WhatsApp Business
  Account ID** (the app's **WhatsApp → Production setup → Register your
  WhatsApp phone number**, labelled "Messaging Account ID", or WhatsApp Manager
  → Account tools → Business account settings). Ganju checks it with Meta before
  saving it: an account that doesn't have the channel's number is refused, so
  you can't save the test number's account for a real number by mistake.
- **The `whatsapp_business_management` permission** on the token, besides
  `whatsapp_business_messaging`. A token made only to send messages lacks it;
  the tab says so and explains how to generate a new one in **Business
  Settings → System users**. Paste it there: like the first one, it's stored
  encrypted and never shown again.

**Review and category.** Meta reviews each template in minutes to a day. It
may reject one, or move it from **Utility** to **Marketing** if it reads as
promotional. Keep Utility for updates the customer expects: "Your order
#{{1}} is ready for pickup". Without the `message_template_status_update`
webhook field, Ganju still checks templates in review every hour, and the
others once a day.

**Cost.** Meta bills template messages to your WhatsApp Business account at
its own rates, and Marketing costs more than Utility. Ganju doesn't charge for
them.

**What Ganju can send.** Ganju fills the variables of the message itself. A
template made in WhatsApp Manager with an image, video or document header, a
variable in the header, or a button that takes a value (a link with a
variable, a code) is listed as **Ganju can't send it**, and is left out of
triggers and `ctx.channels.templates()`. Static links, phone buttons and quick
replies are fine.

**When Ganju can't read your templates** (a token without
`whatsapp_business_management`), it still sends the template you name: Meta
checks it, and a run fails with Meta's own error when it isn't approved.

**Paused or disabled.** Meta pauses a template when customers block or report
its messages, and disables one that stays paused. Sends that use it fail with
that reason, and your organization's admins get an email when a template a
trigger or function uses is paused or disabled.

Templates are used from the [message the row's customer](/docs/data/triggers/)
trigger action and from [`ctx.channels.send`](/docs/data/functions/).
`ganju channel templates` lists them, with their status, from the CLI.

Sources: [WhatsApp Cloud API — Get Started (Meta)](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started),
[Creating a permanent WhatsApp access token](https://noem.ai/help/creating-a-permanent-access-token-for-whatsapp-business-api)
