---
title: Examples
description: Five ready-to-deploy function projects — weather, GitHub issues, team notes, calendar free time and an emailed news digest — each showing one host capability you can copy into your own tools.
order: 38
updated: 2026-09-18
---

Five small projects you can deploy with the [CLI](/docs/tools/cli/) as they
are, then change into your own tools. Each is a `ganju.json` and a few short
TypeScript files, and each adds one host capability to what the one before it
used. Read them in order and you'll have seen all of `ctx`.

They live in the [`examples/`](https://github.com/MontoyaAndres/ganju/tree/main/examples)
folder of the Ganju repository.

| Example | Tools | Shows you | Setup |
| --- | --- | --- | --- |
| [Weather](#weather) | `current-weather`, `weather-forecast` | `fetch` and allowed hosts | None |
| [GitHub issues](#github-issues) | `github-list-issues`, `github-create-issue` | `ctx.secret` | A GitHub token |
| [Team notes](#team-notes) | `save-note`, `list-notes`, `read-note`, `find-notes`, `delete-note` | `ctx.resources` | None |
| [Calendar free time](#calendar-free-time) | `find-free-time` | `ctx.connection` | Google Calendar connected |
| [News digest](#news-digest) | `hn-top-stories`, `email-hn-digest` | `ctx.resources.create` + `ctx.sendFile` | Gmail connected |

## Before you start

You need Node 20 or newer, and a project on **Pro**, where
[Functions](/docs/tools/functions/) are available.

```bash
npm install -g @ganju/cli
ganju login

git clone https://github.com/MontoyaAndres/ganju.git
cd ganju/examples/weather
ganju link       # choose the organization and project to deploy to
```

Every example works the same way from here: `ganju test` to run a tool once
without publishing it, `ganju deploy` to make it live, and `ganju logs` to see
the calls your assistant makes.

`ganju link` fills in `organizationId`, `projectId` and `artifact` in
`ganju.json`. The copies in the repository leave them out so they work for
anyone. Run `npm install` in an example if you want `ctx` to autocomplete in
your editor. The build doesn't need it.

Each example is laid out the same way:

```
ganju.json         the tools, their schemas, and what the code may reach
src/<tool>.ts      one file per tool, default-exporting defineTool(...)
src/lib/*.ts       helpers the tools share
```

## Weather

Current conditions and a forecast for any city, from
[Open-Meteo](https://open-meteo.com). No account and no key, so it's the one
to deploy first.

```bash
ganju test current-weather --input '{"city":"Bogotá"}'
ganju test weather-forecast --input '{"city":"Lisbon","days":5}'
ganju deploy
```

Then ask your assistant *"Do I need an umbrella in Lisbon this week?"*

**The tool is ordinary `fetch`.** The only Ganju code is `defineTool` and
`ctx.log`:

```ts
// src/currentWeather.ts
export default defineTool<{ city: string }>(async (input, ctx) => {
  const place = await findPlace(input.city.trim());
  ctx.log(`${input.city} → ${place.name}`);

  const { current } = await fetchForecast(place, 1);

  return {
    place: place.name,
    ...(place.country ? { country: place.country } : {}),
    conditions: describe(current.weather_code),
    temperatureC: current.temperature_2m
    // …
  };
});
```

**What to notice**

- **`allowedHosts` is what lets `fetch` out.** Every request leaves through the
  platform, which checks the host first. One entry, `open-meteo.com`, covers
  both `api.open-meteo.com` and `geocoding-api.open-meteo.com`, because an
  entry allows its subdomains too.
- **The schema limits the input before your code runs.** `days` is declared
  with `"minimum": 1, "maximum": 7`, so a request for 30 days is refused
  and never reaches the handler.
- **Leave missing fields out rather than setting them to `null`.** An output
  schema has no nullable type, so a `null` in a `string` field fails the whole
  call. `country` is left out when the geocoder doesn't have one.

## GitHub issues

List and open issues in your repositories, so an assistant can check whether a
bug is already reported before filing it.

Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)
with **Issues: Read and write** on only the repositories you want reachable, and
store it as a secret:

```bash
read -s GANJU_SECRET_VALUE && export GANJU_SECRET_VALUE
ganju secret set GITHUB_TOKEN
unset GANJU_SECRET_VALUE

ganju test github-list-issues --input '{"repo":"your-org/your-repo","limit":5}'
ganju deploy
```

**The token is read at call time, never stored with the code:**

```ts
// src/lib/github.ts
const token = await ctx.secret('GITHUB_TOKEN');

const response = await fetch(`https://api.github.com${path}`, {
  headers: {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'ganju-example-github-issues'
  }
});
```

**What to notice**

- **Secrets stay out of the repository.** The token isn't in the code, in
  `ganju.json` or in the bundle. Rotating it is one `ganju secret set` and
  takes effect on the next call, without a redeploy.
- **The schema can check more than types.** `repo` has a `pattern` for
  `owner/name`, `state` is an `enum` of `open`, `closed` and `all`, and `labels`
  is an `array` of strings.
- **Error messages should say what to do next.** A 401 tells the model the
  token needs resetting, and a 404 says the repository is wrong or out of the
  token's reach. The model can pass that on instead of guessing.
- **Write tools should ask first.** `github-create-issue`'s description tells
  the model to confirm the title and repository, and to search for duplicates,
  before calling it.

`ganju test` uses the real secret, so testing `github-create-issue` opens a real
issue. Use a scratch repository.

## Team notes

A notebook your assistant can write to and search. Say *"note that the
release moved to Thursday"* in Slack, then ask *"when's the release?"* from
Claude a week later.

```bash
ganju test save-note --input '{"title":"Release checklist","body":"1. Tag\n2. Build\n3. Deploy"}'
ganju test find-notes --input '{"query":"how do we ship"}'
ganju deploy
```

It uses all five `ctx.resources` methods, one per tool:

| Tool | Method |
| --- | --- |
| `save-note` | `ctx.resources.create({ …, index: true })` |
| `list-notes` | `ctx.resources.list()` |
| `read-note` | `ctx.resources.read(uri)` |
| `find-notes` | `ctx.resources.search(query)` |
| `delete-note` | `ctx.resources.delete(uri)` |

```ts
// src/saveNote.ts
const saved = await ctx.resources.create({
  title,
  uri: noteUri(title), // resource://notes/release-checklist
  content: markdown,
  mimeType: 'text/markdown',
  index: true
});

return { uri: saved.uri, created: saved.created, indexed: saved.indexed };
```

**What to notice**

- **A stable uri makes saving idempotent.** Each note lives at
  `resource://notes/<slug-of-title>`, so saving under an existing title replaces
  the note, and `created: false` says so. The shared prefix is also how
  `list-notes` and `find-notes` pick notes out from uploads and crawled pages.
- **`index: true` is a deliberate choice.** What a tool writes isn't searchable
  unless it asks to be. Here it does, so the notes show up in `find-notes` and
  in the assistant's own [knowledge search](/docs/resources/). Indexing takes
  a few seconds and counts toward your plan's storage.
- **Search returns passages, not documents.** One note can match more than
  once, so `find-notes` keeps the best-scoring passage per note.
- **`resourceAccess: "own"` limits what can be deleted.** `delete-note` can
  only remove what a tool wrote, never a file someone uploaded, whatever uri
  it's given.

This one calls no outside hosts. Its `allowedHosts` is empty, and **empty
means any public host**, not none. If you extend it to fetch something, list
that host.

## Calendar free time

Finds the open slots on a day of your Google Calendar that fit a meeting,
within working hours. It can answer *"When am I free Tuesday for an hour?"*
or suggest times to someone.

Connect **Google Calendar** on the project's **Tools** page, then:

```bash
ganju test find-free-time --input '{"date":"2026-09-21","durationMinutes":60}'
ganju deploy
```

```json
{
  "date": "2026-09-21",
  "timeZone": "America/Bogota",
  "busy": [{ "start": "10:00", "end": "11:30" }, { "start": "13:00", "end": "14:15" }],
  "free": [
    { "start": "09:00", "end": "10:00", "minutes": 60 },
    { "start": "11:30", "end": "13:00", "minutes": 90 },
    { "start": "14:15", "end": "17:00", "minutes": 165 }
  ]
}
```

**The connection is one line:**

```ts
// src/lib/google.ts
const { accessToken } = await ctx.connection('google-calendar');

const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
  headers: { authorization: `Bearer ${accessToken}` }
});
```

**What to notice**

- **The platform handles OAuth.** `ctx.connection` returns a short-lived
  access token and refreshes it as needed. The refresh token never reaches
  your code.
- **`connections` works like a permission.** `ganju.json` declares
  `"connections": ["google-calendar"]`. Without it the call is refused, even
  with the account connected, so a script can't reach accounts it didn't
  declare.
- **Ask for as little as the task needs.** The tool uses Google's free/busy
  endpoint, which returns times only. No event titles or attendees reach the
  conversation.
- **Time zones work without a library.** `src/lib/time.ts` uses `Intl` to turn
  "9:00 in the calendar's time zone" into an exact time, correct on the days
  the clocks change.

## News digest

The Hacker News front page, in the chat or emailed to someone with the list
attached as a Markdown file.

Connect **Gmail** on the project's **Tools** page, then:

```bash
ganju test hn-top-stories --input '{"limit":5}'
ganju test email-hn-digest --input '{"to":"you@example.com","limit":5}'
ganju deploy
```

The second test sends a real email, so send it to yourself.

**Make the file first, then send it:**

```ts
// src/emailDigest.ts
const saved = await ctx.resources.create({
  title: `Hacker News digest — ${date}`,
  uri: `resource://news-digest/${date}`,
  fileName: `hacker-news-${date}.md`,
  mimeType: 'text/markdown',
  content: toMarkdown(stories, date)
});

await ctx.sendFile({
  to: 'gmail',
  uris: [saved.uri],
  message: { to: input.to, subject: `Hacker News digest — ${date}`, body }
});
```

**What to notice**

- **`sendFile` takes uris, never bytes.** The platform reads the file from
  storage and attaches it, so the same call can send a 40MB PDF your code
  could never hold. Swap `to: 'gmail'` for `'outlook'` or `'slack'` to deliver
  somewhere else.
- **Sending needs a declared connection too.** Sending as an account takes the
  same permission as holding its token, so `google-gmail` is in
  `connections`.
- **One uri per day keeps storage from piling up.** Running the tool twice in a
  day replaces the morning's file.
- **Keep the number of requests bounded.** Each story is its own request, made
  in parallel. `limit` stops at 15 because every `fetch` counts toward the
  project's outbound request budget.

## Make it yours

The quickest way to write a new tool is to copy the example closest to it:

1. **Copy the folder** and run `ganju link` in it.
2. **Rename the tool** in `ganju.json`. The router is generated from the
   manifest, so the name only lives there.
3. **Rewrite the description.** It's how the model decides when to call the
   tool, so say *when* to use it, not only what it does.
4. **List exactly the hosts and connections you need.** Anything else is
   refused when the tool runs.
5. **`ganju test` until it passes, then `ganju deploy`.** If a deploy goes
   wrong, `ganju rollback` puts the previous version back.

## Next

- **[The `ganju` CLI](/docs/tools/cli/)**: every command these examples use,
  and deploying from CI.
- **[Functions](/docs/tools/functions/)**: the full `ctx` reference, settings
  and limits.
