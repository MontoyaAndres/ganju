# WhatsApp coexistence, human handoff and shared inbox

Goal: a business keeps its current WhatsApp number on the WhatsApp Business
app (phone and WhatsApp Web) while the Ganju bot answers on the same number
through the Cloud API. When a person from the team replies, from the app, Web
or Ganju's inbox, the bot goes quiet in that chat and the conversation stays
one thread everywhere. Every chat ends up as a record the business owns, with
the ad or button it came from, and that record flows out to whoever analyzes
it.

## Where we are

- A channel is connected by hand (access token, phone number id, app secret,
  verify token). Registering a number that way takes it off the app.
- The webhook only handles inbound `messages` (text, voice, button replies)
  and failed `statuses`. `smb_message_echoes`, `history`,
  `smb_app_state_sync` and `referral` are dropped.
- Pausing a channel (`channel.status`) stops the bot for every chat; there is
  no per-conversation pause.
- The Conversations tab is read-only: no replying, no assignment.
- Already there: voice notes, debounced bursts, Data tables with CSV export,
  triggers, schedules, `ctx.channels.send` with templates, `ctx.customer`
  signed per private chat, members without per-seat cost.

## Plan

The order follows what blocks a launch on a real number. Each stage ends with
a check on a test number; nothing touches a customer's number before stage 3
passes.

| Stage | What | Sections | Done when |
| --- | --- | --- | --- |
| 1 | Prove the path | 0 | We know whether the shortcut works, or we wait for stage 6. |
| 2 | Same number, team replies, bot goes quiet | 1, 2, 3 | Phone and Web replies land in Ganju and pause the bot in that chat; handback works. |
| 3 | What the business needs on day one | 4, 6, 7, 10, 13 | Source on every record, WhatsApp alerts to the person on duty, team reports by message, Sheets and webhook out, eval passing. |
| 4 | Launch on the real number | 11 | The acceptance test passes with the team. |
| 5 | Inbox and the rest | 5, 8, 9, 14 | Inbox in use by the team; deletion on request; channel alerts; disconnect and branding settled. |
| 6 | Our own onboarding | 12 | New customers connect in coexistence from Ganju, no provider involved. |
| 7 | Next stage | 15 | Closed services reach Google Ads; follow-ups and reviews running. |
| Later | Optional | 16 | Decided when Meta's pricing or data access changes. |

Stage 6 starts in parallel with stage 1: Meta's review runs on its own clock,
and if the shortcut fails it becomes the critical path.

Rules for every stage:

- Test on the dev channel with a spare number first; record the result next
  to each check in this file.
- Each change ships with its docs (en/es) and, where the Assistant can set it
  up, the Assistant's prompt and eval.
- Nothing about one customer goes in this repo: names, prices and contract
  terms live outside it.

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
        dead and customers wait for section 12;
  - [ ] with Meta's own business agent switched on in the app, whether it
        and our bot both answer the same chat (and how to keep it off);
  - [ ] a personal WhatsApp number moved to the Business app keeps its chats.
- [ ] Record what Meta bills: bot replies, replies from our inbox (API),
      replies from the app (expected free), templates to the team.

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
- [ ] Bot instructions can say when to hand off (asked for a price, asked
      for a person, intake finished), and the Assistant knows how to set it.
- [ ] Metering: human messages and handoffs are not assistant replies
      (`countAsMessage: false`).

## 3. History and contacts sync

- [ ] Handle `history` (up to 6 months of past chats shared at onboarding):
      import into conversations as past messages, without running turns or
      triggers.
- [ ] Handle `smb_app_state_sync` for contact names.
- [ ] Decide what counts against storage and retention for imported history.

## 4. Ad and source attribution

- [ ] Parse `referral` on inbound messages (`source_url`, `source_id`,
      `source_type`, `headline`, `ctwa_clid`, media).
- [ ] Store it on the conversation, first touch kept.
- [ ] Expose it to the bot and to functions (for example on `ctx.customer`),
      so the registry can save the source without the model copying it.
- [ ] Prefilled-message codes (site buttons, Google Ads): read a code like
      `[G-123]` from the first message into the same source field, without
      relying on the model.
- [ ] Docs: how to build wa.me links with a code per button and per ad.

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
- [ ] Metering: inbox replies are not assistant replies; Meta bills them as
      service messages (they go through the API).
- [ ] Branding: what a team member sees (domain, name, emails). Today the
      dashboard and trigger emails say Ganju; decide whether the inbox can
      run under the reseller's or the business's name.

## 6. Notify the team on WhatsApp

- [ ] An on-duty roster (members or phone numbers by schedule) the handoff
      reads.
- [ ] Send the handoff summary by WhatsApp from the business number to the
      person on duty, with a utility template when outside their 24-hour
      window. Ship a ready template the owner can submit.
- [ ] Fallback when nobody is on duty or the send fails (next person, email).
- [ ] End-of-day reminder of open cases, built on schedules.

## 7. Team members talk to the bot

- [ ] Mark phone numbers as team (a list per channel), so the bot treats
      them as staff, not customers, in their private chat.
- [ ] Expose it to functions (`ctx.customer` says the sender is team), so a
      function can close a case or log a phone call from one line without
      keeping its own allowlist.
- [ ] Team chats with the bot don't create customer records.

## 8. Data deletion on request

- [ ] Delete a project's data and conversations on request within 30 days,
      including the export copy that today is kept 90 days.
- [ ] Record that it was done (who, when) without keeping the content.

## 9. Reliability

- [ ] Alert the owner when the channel stops working (token expired, webhook
      failing, Meta errors), so the team knows to answer from the phone.
- [ ] Coexistence numbers are capped at 20 messages per second; check our
      send path respects it.
- [ ] Docs: what the app loses in coexistence (edit, delete for everyone,
      disappearing and view-once messages, live location, broadcast lists).

## 10. Data out

- [ ] Google Sheets: keep a sheet in sync with a table (rows added and
      updated), without the owner writing a function.
- [ ] Outgoing webhook on insert and update of a table, signed, with
      retries, configurable from the dashboard.
- [ ] Read-only access for an outside analyst: a token or member role that
      reads Data and nothing else.
- [ ] A reusable template: the customer record table, its triggers, the team
      report function and the Sheets sync, installable in a new project in
      one step.

## 11. First launch on a real number

- [ ] Confirm the number is on the WhatsApp Business app (move it from
      personal first if needed).
- [ ] Meta's agent switched off in the app.
- [ ] Payment method on the business's WhatsApp account (Meta stops service
      messages without one).
- [ ] Own Gemini key on the organization, so replies don't run on our model.
- [ ] Onboard in coexistence (section 0 path or section 12), re-link Web.
- [ ] Bot instructions, intake questions, handoff rules, record table,
      team list, on-duty roster, templates approved.
- [ ] Acceptance test with the team: site button with code, price request,
      reply from phone and Web, voice note, handback, team report of a closed
      service and a call, record visible in Sheets and received by webhook.

## 12. Become a Meta Tech Provider (our own Embedded Signup)

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

## 13. Bot behaviour eval

- [ ] Eval cases for a WhatsApp intake bot: never gives prices or arrival
      times (10 different attempts) and hands off instead; asks the intake
      questions and understands answers given out of order or all at once;
      introduces itself as the business's assistant; after a handback,
      doesn't repeat questions or contradict what the team said.
- [ ] Voice notes and bursts of 4 messages answered once, on the dev number.
- [ ] Baseline saved in `scripts/golden/`, compared with `--repeat 3`.

## 14. Disconnect and branding

- [ ] Disconnect for a number onboarded through the shortcut (section 0):
      unsubscribe our app, remove its access to the WABA, number stays on
      the app; export offered before the channel goes.
- [ ] Emails a customer's team receives (trigger emails, alerts, invites):
      decide whether they can go out under the reseller's or the business's
      name instead of Ganju's.

## 15. Next stage (not needed for the first launch)

- [ ] Google Ads offline conversions: send closed services with the
      customer's phone hashed (enhanced conversions for leads), from a
      schedule, through a scheduled sheet upload or the Google Ads API
      (needs an approved developer token). The record keeps what's needed:
      phone, closed date, amount, source.
- [ ] Follow-ups and review requests after a closed service, with approved
      templates and schedules; opt-out respected.

## 16. Optional: listen alongside Meta's own agent

If Meta's business agent becomes cheaper per reply than our bot, Ganju can
step back to the record and the data out while Meta's agent answers.

- [ ] Receive the conversations Meta's agent handles (standby webhooks) and
      build the same record from them.
- [ ] Hand off from Meta's agent to the team and to our inbox.
- [ ] Compare cost per reply against our bot on the same volume.

## Open questions

- Does Meta send `smb_message_echoes` to a second app on the same WABA, or
  only to the app that onboarded the number?
- Does removing the onboarding provider break coexistence?
- Can a business use Embedded Signup with coexistence from its own app
  without being a Tech Provider?
- Does Meta's free tier of 1,000 service messages per number still apply
  after 2026-10-01? Plan costs without it until a bill says otherwise.
- Meta's per-message rate for Mexico in the MXN rate card (service messages
  cost the same as utility).
