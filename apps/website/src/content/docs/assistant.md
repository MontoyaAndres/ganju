---
title: Assistant
description: Describe what your bot should know or do in your own words — the assistant builds it with you, tests it, and changes nothing until you press Apply.
order: 1.5
updated: 2026-11-12
---

The **Assistant** tab is where you build your bot by talking about it. Tell it
what you want — "tell customers if a pizza is sold out", "take orders and email
them to me", "book appointments in my Google Calendar" — and it plans the work
with you, builds it, tries it, and hands you one card to apply. You never see
code, and nothing your customers see changes until you press **Apply**.

The assistant is part of the **Pro** and **Enterprise** plans. It answers in the language you write
in, Spanish or English.

## What it can change

- **Actions** — small programs your bot runs, like checking stock or saving a
  booking. The assistant writes and tests them for you.
- **[Data](/docs/data/)** — your project's tables, columns and rows, saved
  queries, [triggers](/docs/data/triggers/) such as "email me each new
  order", and [schedules](/docs/data/triggers/#schedules) such as "every night
  at 9, email me today's orders".
- **Knowledge** — notes and websites your bot searches, on the
  [Resources](/docs/resources/) page. Files come from you: when it needs one, it
  asks you to upload it.
- **[Prompts](/docs/prompts/)** and **[tools](/docs/tools/)**, including the
  catalog's Gmail, Outlook, Google Calendar and Slack through accounts you
  connect with one click.
- **[Bot instructions](/docs/channels/#tell-your-bot-how-to-answer)** — how
  your bot answers: "answer in two sentences", "always in Spanish".

What it **can't** change: channels, the bot's model, members, billing, API
tokens, and organization or project settings. Ask it for
one of those and it tells you where to change it yourself.

It never sees your passwords, keys or account sign-ins. When it needs one, it
shows a card where you paste the key or connect the account, and the value goes
straight to your project.

## How a request goes

1. **It plans first.** For anything new, it says back what it understood, asks
   about the gaps in one message ("When the stock is 0, should the bot say it's
   sold out or offer something else?"), and estimates the credits it will use.
2. **It builds and tries.** You see each step as it works ("Writing an action",
   "Trying it"). Actions that send an email or save a row do it for real while
   testing, so it says so first and points tests at you or at rows clearly marked
   as tests.
3. **You get one card.** Everything your bot or customers would see is
   collected into a **Ready to apply** card: what changes, in plain words, and
   what your bot can do once it's on — only read information, or change and send
   things, which it asks your customer about first.
4. **You press Apply.** From that moment your bot uses it. The assistant then
   tests whatever needed the change to be live before saying it works.

### Undo

An applied card has an **Undo** button that puts your project back the way it
was. Most changes come back step by step. A few are bigger, and the card warns
you before you apply them:

- Dropping a table or column, deleting rows, or changing a column's type is
  undone by putting the **whole database** back to just before it — anything
  saved after it is lost.
- A removed file's contents don't come back.
- A removed tool comes back without its key or sign-in, which you add again.

### Deleting

Deleting anything — a table, a column, rows, a note, a file, a prompt, a tool —
takes two steps. The assistant first asks you, naming exactly what would go and
what is lost with it, and stages it only after your yes. The card then asks you
to **type its name** before **Apply** works.

## Try it as a customer

The **Try it** panel beside the chat talks to your real bot, with everything
that is turned on — the same bot your channels answer with. Use it after
applying a card to ask what a customer would ask. **Start over** clears it.

## Credits

The assistant is billed in credits; one credit is $0.01 of AI cost. A new action
with its table usually takes 25 to 50 credits, a change to an action 10 to 50,
and new knowledge or a small fix under 15. Each reply shows what it used, and
each chat its total.

Pro and Enterprise include **1,000 credits a month**. Past that, extra credits are $2 per 100,
up to a monthly limit an admin sets in **Settings → Billing & plan** (2,000
extra by default; 0 stops at the included credits). The top of the Assistant tab
shows the month so far.

Messages in **Try it as a customer** use credits too when your bot runs on our
AI model. Nothing else does.

### Your own Anthropic key

If your organization added an Anthropic model in **Settings → Models**, an admin
can switch **Pay with** at the top of the Assistant tab from Ganju credits to
that model. The assistant then runs on your key and uses no credits; only the
customer test chat still does.

## When an action stops working

For actions built in the dashboard, the Assistant tab shows a **Something
stopped working** banner when an action fails often — at least 5 failed calls,
and 30% of its calls, over the last day or since it was last changed — or when
an account it uses needs signing in again. **Fix it with the assistant** writes
the first message for you: it reads what went wrong, tells you why in plain
words, and proposes a fix as usual. An account that needs signing in again is
fixed by reconnecting it, not by changing anything.

The project's owner and the organization's admins also get an email, at most
once a day per project, and about the same problem again only after a week.
Turn it off in **Settings → Billing & plan**.

## Projects a developer deploys

When a project's actions were uploaded by a developer with the
[CLI](/docs/tools/cli/), the assistant doesn't replace their code. It reads it,
and answers a code change with **A change for your developer**: a patch to copy
or download and send them. They apply it and upload again.

If the developer manages your tables from code, the card says so: their next
upload puts table and column changes back, so pass those on to them too.

## Chats

Start a **New chat** for each new thing you build; past chats are in the list.
One chat answers at a time in each project.

- After **30 days**, a message keeps what you and the assistant said, but what
  its tools returned and its working notes are removed, since they can hold your
  customers' data. An old chat still continues: the assistant picks up from what
  was said and checks your project again.
- A chat is deleted **90 days after its last message**.
- **Delete chat** in the chat's header deletes it now. What it changed in your
  project stays, but its changes can't be undone anymore.

## Next

- **[Data](/docs/data/)** — the tables and triggers the assistant builds on.
- **[Functions](/docs/tools/functions/)** — what an action is underneath, if
  you're curious or work with a developer.
- **[Settings](/docs/settings/)** — your own models, the extra-credit limit and
  the alert email.
