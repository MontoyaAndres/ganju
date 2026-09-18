# Examples

Five small Ganju projects you can deploy as they are, then change into your
own. Each one is a `ganju.json` plus a few short TypeScript files, and each
adds one host capability to what the one before it used.

| Example | Tools | Shows you | Setup |
| --- | --- | --- | --- |
| [weather](weather/) | `current-weather`, `weather-forecast` | `fetch` and `allowedHosts` | None |
| [github-issues](github-issues/) | `github-list-issues`, `github-create-issue` | `ctx.secret` | A GitHub token |
| [team-notes](team-notes/) | `save-note`, `list-notes`, `read-note`, `find-notes`, `delete-note` | `ctx.resources` | None |
| [calendar-free-time](calendar-free-time/) | `find-free-time` | `ctx.connection` | Google Calendar connected |
| [news-digest](news-digest/) | `hn-top-stories`, `email-hn-digest` | `ctx.resources.create` + `ctx.sendFile` | Gmail connected |

## Running one

Every example runs the same way. You need Node 20+ and a Ganju project on the
Pro plan.

```bash
npm install -g @ganju/cli
ganju login

cd examples/weather
ganju link          # pick the organization and project to deploy to
ganju test current-weather --input '{"city":"Bogotá"}'
ganju deploy
```

`ganju link` writes `organizationId`, `projectId` and `artifact` into
`ganju.json`. The copies here leave them out so they work for anyone.

Once it's deployed, ask any MCP client or channel connected to the project
something like *"What's the weather in Lisbon this weekend?"*, then run
`ganju logs` to see the call.

For editor autocompletion on `ctx`, run `npm install` inside the example first.
The build doesn't need it, because `@ganju/sdk` is attached on deploy rather
than bundled.

## How an example is laid out

```
ganju.json         the tools, their schemas, and what the code may reach
src/<tool>.ts      one file per tool, default-exporting defineTool(...)
src/lib/*.ts       helpers the tools share
```

Every tool names an `entry`, so the CLI generates the router from `ganju.json`.
The tool name is written in exactly one place.

Full docs: <https://ganju.ai/docs/tools/examples/>
