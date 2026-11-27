# WhatsApp coexistence, human handoff and shared inbox

Goal: a business keeps its current WhatsApp number on the WhatsApp Business
app (phone and WhatsApp Web) while the Ganju bot answers on the same number
through the Cloud API. When a person from the team replies, from the app, Web
or Ganju's inbox, the bot goes quiet in that chat and the conversation stays
one thread everywhere.

Today Ganju can't do this:

- A channel is connected by hand (access token, phone number id, app secret,
  verify token). Registering a number that way takes it off the app.
- The webhook only handles inbound `messages` (text, voice, button replies)
  and failed `statuses`. `smb_message_echoes`, `history`,
  `smb_app_state_sync` and `referral` are dropped.
- Pausing a channel (`channel.status`) stops the bot for every chat; there is
  no per-conversation pause.
- The Conversations tab is read-only: no replying, no assignment.

## 0. Spike on a test number (before building anything)

Validates the shortcut: onboard in coexistence through an existing provider's
Embedded Signup, then use the number from the business's own Meta app.

- [ ] A spare number active on the WhatsApp Business app (recent version, in
      use for some days, as Meta requires) and a test Business portfolio.
- [ ] Onboard it in coexistence through a provider that offers it (360dialog,
      Twilio or similar), scanning the QR from the app. Sync history.
- [ ] Create a Meta app inside the same portfolio, give a system user access
      to the WABA, generate a permanent token with
      `whatsapp_business_messaging` and `whatsapp_business_management`.
- [ ] Subscribe that app to the WABA (`POST /{waba-id}/subscribed_apps`) with
      `messages`, `smb_message_echoes`, `history`, `smb_app_state_sync`.
- [ ] Connect it to a dev Ganju channel the usual way.
- [ ] Check, and write down the answer for each:
  - [ ] the bot answers and the number still works on the app;
  - [ ] a reply typed on the phone arrives as `smb_message_echoes` to our app;
  - [ ] after re-linking WhatsApp Web (up to 4 companions; the Windows app is
        not supported), a reply from Web arrives the same way;
  - [ ] bot replies show up on the phone and on Web;
  - [ ] **after removing the provider's app from the WABA, the number stays
        in coexistence and our app keeps working.** If not, the shortcut is
        dead and the business waits for section 8.
- [ ] Record what Meta bills: bot replies, replies from our inbox (API), and
      replies from the app (expected free).

## 1. Receive the team's messages (`smb_message_echoes`)

- [ ] Parse `smb_message_echoes` in `handleWhatsappWebhook`: text, media
      caption, voice. Route by `phone_number_id` like inbound messages.
- [ ] Store each as a business-side message on the customer's conversation,
      marked as written by a person (source `app`), deduped on the wamid.
- [ ] Never run a bot turn for an echo.
- [ ] The model sees these messages in history as the business speaking, so
      after a handback it doesn't repeat questions or contradict the team.
- [ ] Show them in the dashboard conversation, labelled as the team.
- [ ] Confirm whether Meta echoes messages our own app sent through the API.
      If it does, skip them by wamid so the bot doesn't pause itself.

## 2. Per-conversation pause (the bot goes quiet when a person steps in)

- [ ] State on `channel_conversation`: who handles it (`bot` or `human`),
      since when, assigned member, and when it returns to the bot.
- [ ] Any human reply (echo from the app or Web, or a reply from the inbox)
      switches the chat to `human`. Inbound customer messages are still
      stored but no turn runs.
- [ ] Ways back to the bot:
  - [ ] a button in the inbox;
  - [ ] a short message from the team in that chat (a keyword, configurable);
  - [ ] automatically after N hours without a human message (configurable per
        channel, with a sensible default).
- [ ] A handoff tool the bot can call when it finishes the intake or the
      customer asks for a person: it switches the chat to `human`, writes a
      summary and fires the team notification (section 6).
- [ ] Debounced batches already buffered when the switch happens are dropped,
      not answered.
- [ ] Metering: human messages and handoffs are not assistant replies
      (`countAsMessage: false`).

## 3. History and contacts sync

- [ ] Handle `history` (up to 6 months of past chats shared at onboarding):
      import into conversations as past messages, without running turns or
      triggers.
- [ ] Handle `smb_app_state_sync` for contact names.
- [ ] Decide what counts against storage and retention for imported history.

## 4. Ad and source attribution (`referral`)

- [ ] Parse `referral` on inbound messages (`source_url`, `source_id`,
      `source_type`, `headline`, `ctwa_clid`, media).
- [ ] Store it on the conversation, first touch kept.
- [ ] Expose it to the bot and to functions (for example on `ctx.customer`),
      so the registry can save the source without the model copying it.
- [ ] Document the prefilled-message code pattern for site buttons and ads.

## 5. Shared inbox in the dashboard

- [ ] Conversation list with state: bot, waiting for a person, assigned to
      whom, last message, unread.
- [ ] Reply composer: sends through the Cloud API as the business. Inside
      24 hours free text; outside it, pick an approved template.
- [ ] Take, assign and release a conversation; one owner at a time so nothing
      is answered twice.
- [ ] Live updates (several members on the same chat at once).
- [ ] Messages from the app, Web and the inbox in one thread, labelled.
- [ ] A member role limited to the inbox (no settings, billing or code).
- [ ] Works on phones.
- [ ] Decide branding: what a team member sees (domain, name, emails). Today
      the dashboard and trigger emails say Ganju.

## 6. Notify the team on WhatsApp

- [ ] An on-duty roster (members or phone numbers by schedule) the handoff
      reads.
- [ ] Send the handoff summary by WhatsApp from the business number to the
      person on duty, with a utility template when outside their 24-hour
      window. Ship a ready template the owner can submit.
- [ ] Fallback when nobody is on duty or the send fails (next person, email).
- [ ] End-of-day reminder of open cases, built on schedules.

## 7. Data deletion on request

- [ ] Delete a project's data and conversations on request within 30 days,
      including the export copy that today is kept 90 days.
- [ ] Record that it was done (who, when) without keeping the content.

## 8. Become a Meta Tech Provider (our own Embedded Signup)

- [ ] Business verification for the company that owns the Meta app.
- [ ] App review for advanced access to `whatsapp_business_messaging` and
      `whatsapp_business_management`.
- [ ] Embedded Signup configuration with the WhatsApp Business app onboarding
      (coexistence) option enabled.
- [ ] "Connect WhatsApp" in Channels: runs Embedded Signup, exchanges the
      code for a token, registers the number, subscribes our app to the WABA.
- [ ] One app and one webhook for every customer: route events by
      `phone_number_id`/WABA instead of per-channel app secrets and verify
      tokens. Keep the manual connection for customers with their own app.
- [ ] Add our app to a WABA that was onboarded elsewhere (section 0) without
      onboarding it again.
- [ ] Disconnect: unsubscribe our app and leave the number on the app.

## 9. Reliability

- [ ] Alert the owner when the channel stops working (token expired, webhook
      failing, Meta errors), so the team knows to answer from the phone.
- [ ] Coexistence numbers are capped at 20 messages per second; check our
      send path respects it.
- [ ] Note in the docs what the app loses in coexistence (edit, delete for
      everyone, disappearing and view-once messages, live location,
      broadcast lists).

## Open questions

- Does Meta send `smb_message_echoes` to a second app on the same WABA, or
  only to the app that onboarded the number?
- Does removing the onboarding provider break coexistence?
- Are messages sent from our inbox billed by Meta as service messages? (They
  go through the API, so expected yes.)
- Can a business use Embedded Signup with coexistence from its own app
  without being a Tech Provider?
