---
title: Assistant
description: Describe what your bot should know or do in your own words — the assistant builds it with you, tests it, and changes nothing until you press Apply.
order: 1.5
updated: 2026-11-13
---

The **Assistant** tab is where you build your bot by talking about it. Tell it
what you want ("tell customers if a pizza is sold out", "take orders and email
them to me", "book appointments in my Google Calendar") and it plans the work
with you, builds it, tries it, and hands you one card to apply. You never see
code, and nothing your customers see changes until you press **Apply**.

The assistant is part of the **Pro** and **Enterprise** plans; on Free the tab
shows **Build your bot by describing it** with **Upgrade**. It answers in the
language you write in, Spanish or English.

![The Assistant tab: the owner asks for new opening hours and the assistant answers with its plan, four questions and a credit estimate](/images/assistant-chat.webp)

## Start a chat

Write what your bot should do in the box at the bottom (**Enter** sends,
**Shift + Enter** adds a line), or pick one of the suggestions on an empty
chat: **Tell customers if we are open right now**, **Answer questions from my
menu**, **Take orders and email them to me**, **Book appointments in my Google
Calendar**.

![A new chat in the Assistant tab: "What should your bot do?" with four suggestions, the past chats list and the month's credits](/images/assistant-empty.webp)

## What it can change

- **Actions**: small programs your bot runs, like checking stock or saving a
  booking. The assistant writes and tests them for you, and can put them back
  the way they were on an earlier day. Under the hood they are
  [functions](/docs/tools/functions/), which the **Tools** page shows
  read-only.
- **[Data](/docs/data/)**: your project's tables, columns and rows, saved
  queries, [triggers](/docs/data/triggers/) such as "email me each new
  order", [schedules](/docs/data/schedules/) such as "every night
  at 9, email me today's orders", and the database's time zone, which
  schedules run in.
- **Knowledge**: notes and websites your bot searches, under **Knowledge →
  [Resources](/docs/resources/)**. Files come from you: when it needs one, it
  asks you to upload it.
- **[Prompts](/docs/prompts/)** and **[tools](/docs/tools/)**: the catalog's
  Gmail, Outlook, Google Calendar and Slack through accounts you connect with
  one click, other catalog tools, and
  [HTTP endpoints](/docs/tools/http-endpoints/).
- **[Bot instructions](/docs/channels/#tell-your-bot-how-to-answer)**: how
  your bot answers, like "answer in two sentences" or "always in Spanish".

What it **can't** change: channels, the bot's model, members, billing, API
tokens, and organization or project settings. Ask it for one of those and it
tells you where to change it yourself.

It can also **answer questions about the [CLI](/docs/tools/cli/)**, the
command line your developer uses: how to install it, deploy, test, set up CI
or manage the database. It reads the CLI docs first and answers with the
commands and a link.

## How a request goes

1. **It plans first.** For anything new, it says back what it understood, asks
   about the gaps in one message ("When the stock is 0, should the bot say it's
   sold out or offer something else?"), and estimates the credits it will use.
2. **It builds and tries.** You see each step as it works ("Looking at your
   project", "Writing an action", "Trying it"). Actions that send an email or
   save a row do it for real while testing, so it says so first and points
   tests at you or at rows clearly marked as tests. Before a scheduled email
   goes live, it sends you a sample so you can read it.
3. **You get one card.** Everything your bot or customers would see is
   collected into a **Ready to apply** card. See [The card](#the-card).
4. **You press Apply.** From that moment your bot uses it. The assistant then
   tests whatever needed the change to be live, and tells you what it found,
   before saying it works.

Nothing is half-applied: until you press **Apply**, what the assistant built is
only a draft. If it proposes a new card before you applied the last one, the
old card shows **Replaced by a newer change**.

## The card

![A "Ready to apply" card: a summary, the list of changes, the "Once applied, your bot can:" box and the Apply button](/images/assistant-change-card.webp)

A **Ready to apply** card lists, in plain words, every change it holds, and
under **Once applied, your bot can:** what your bot is able to do with it:

- **Only reads information**, or **Changes or sends things (it asks your
  customer first)**;
- **Read your tables** or **Read and change your tables**, naming them;
- **Reach** the outside websites an action calls;
- **Use your accounts**, such as Gmail or Google Calendar.

A card that holds something that can't fully come back says **This can't be
undone** or **Some of this can't be undone**, and marks each line that
**Deletes**.

After **Apply**, the card shows **Applied** and an **Undo** button.

### Undo

**Undo** puts your project back the way it was before the card. Most changes
come back step by step. A few are bigger, and the card warns you before you
apply them:

- Dropping a table or column, deleting rows, or changing a column's type is
  undone by putting the **whole database** back to just before it: anything
  saved after it is lost. Undo asks again before doing it (**Undo anyway**).
- A removed file's contents don't come back.
- A removed tool comes back without its key or sign-in, which you add again.
- A webhook trigger that comes back gets a new signing secret.

### Deleting

Deleting anything (a table, a column, rows, a note, a file, a prompt, a tool)
takes two steps. The assistant first asks you, naming exactly what would go
and what is lost with it, and stages it only after your yes. The card then asks
you to **type its name** before **Apply** works. When you'd rather turn
something off than delete it, it suggests that instead.

## Cards that need you

Some things only you can do. The assistant shows a card and stops until you're
done; your next message tells it how it went. **I'd rather not** on any of them
asks it for another way.

- **Connect your account**: **Connect Gmail** (or Google Calendar, Outlook,
  Slack…) signs you in to that account for the project.
- **A key the assistant needs**: it explains where to find the key, step by
  step. Paste it under **Paste the key here** and **Save it**. The value goes
  straight to your project; the assistant never sees it.
- **A file the assistant needs**: **Add it in Resources** takes you to upload
  it, then **Done, I added it**.

It never asks for your passwords, and never sees a key or a sign-in.

## Go back to an earlier version

Ask "put the actions back the way they were yesterday" or "undo what you
changed this morning" and the assistant finds the version of your actions that
was live then. It tells you what comes back and which actions added since
would go, and stages it as a card you apply like any other. If a developer
uploads your actions, it tells you their next upload will replace it.

For anything else on a card, **Undo** on that card is the way back.

## Time zone and schedules

The database has a time zone, and schedules ("every night at 9") and "today"
run in it. Before a first schedule, or when a schedule fires at the wrong hour,
the assistant checks the time zone, asks where your business is if it doesn't
know, and stages the change on the card. A schedule runs at most once a day,
every day or on the weekdays you choose, and a project can have up to five.
More in [Schedules](/docs/data/schedules/).

## Try it as a customer

**Try it** in the chat's header opens **Try it as a customer**, a panel that
talks to your real bot with everything that is turned on: the same bot your
channels answer with. Use it after applying a card to ask what a customer would
ask. **Start over** clears it.

![The "Try it as a customer" panel open beside the chat, with a customer question and the bot's answer](/images/assistant-try-it.webp)

## Credits

The assistant is billed in credits; one credit is $0.01 of AI cost. A new action
with its tables usually takes 30 to 60 credits for the whole job, and up to
about 90 when it also emails, checks your hours or handles payments; a change to
an action 10 to 50, and new knowledge or a small fix under 15. Each reply shows
what it used, and each chat its total.

Pro and Enterprise include **1,000 credits a month**. Past that, extra credits
are $2 per 100, up to a monthly limit an admin sets in **Settings → Billing &
plan** (2,000 extra by default; 0 stops at the included credits). The chats
list shows the month so far; when the credits run out, it says so.

Messages in **Try it as a customer** use credits too when your bot runs on our
AI model. Nothing else does.

### Your own Anthropic key

If your organization added an Anthropic model in **Settings → Models**, an admin
can switch **Pay with**, beside the month's credits, from **Ganju credits** to
that model. The assistant then runs on your key and uses no credits; only the
customer test chat still does.

## When an action stops working

For actions the assistant built, the Assistant tab shows a **Something stopped
working** banner when an action fails often (at least 5 failed calls, and 30%
of its calls, over the last day or since it was last changed) or when an
account it uses needs signing in again. **Fix it with the assistant** writes
the first message for you: it reads what went wrong, tells you why in plain
words, and proposes a fix as usual. An account that needs signing in again is
fixed by reconnecting it, not by changing anything.

The project's owner and the organization's admins also get an email, at most
once a day per project, and about the same problem again only after a week.
Turn it off in **Settings → Billing & plan**.

## Projects a developer deploys

When a project's actions were uploaded by a developer with the
[CLI](/docs/tools/cli/), the assistant doesn't replace their code. It reads it,
and answers a code change with **A change for your developer**: the changed
files, to **Copy** or **Download** and send them. They apply it and upload
again.

If the developer manages your tables from code, the card says so: their next
upload puts table and column changes back, so pass those on to them too.

When the assistant changed the actions since the developer's last upload, the
CLI warns the developer before their next deploy replaces them.

## Chats

Start a **New chat** for each new thing you build; past chats are in the list.
One chat answers at a time in each project, and sending many messages in a
minute asks you to wait a moment. If the assistant stops after many steps
without finishing, tell it to continue.

- After **30 days**, a message keeps what you and the assistant said, but what
  its tools returned and its working notes are removed, since they can hold your
  customers' data. An old chat still continues: the assistant picks up from what
  was said and checks your project again.
- A chat is deleted **90 days after its last message**.
- **Delete chat** in the chat's header deletes it now. What it changed in your
  project stays, but its changes can't be undone from there anymore.

## Next

- **[Data](/docs/data/)**: the tables and triggers the assistant builds on.
- **[Functions](/docs/tools/functions/)**: what an action is underneath, if
  you're curious or work with a developer.
- **[Settings](/docs/settings/)**: your own models, the extra-credit limit and
  the alert email.
