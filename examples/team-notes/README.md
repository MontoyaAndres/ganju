# team-notes

A shared notebook your assistant can write to and search. Say *"note that we
moved the release to Thursday"* in Slack, then ask *"when is the release?"* in
Claude a week later.

| Tool | What it does |
| --- | --- |
| `save-note` | Saves a Markdown note. The same title replaces it |
| `list-notes` | Every note's title |
| `read-note` | One note in full |
| `find-notes` | Semantic search across notes |
| `delete-note` | Removes one note |

## What it shows

All five `ctx.resources` methods, one per tool:

| Tool | Method |
| --- | --- |
| `save-note` | `ctx.resources.create({ ..., index: true })` |
| `list-notes` | `ctx.resources.list()` |
| `read-note` | `ctx.resources.read(uri)` |
| `find-notes` | `ctx.resources.search(query)` |
| `delete-note` | `ctx.resources.delete(uri)` |

- **A stable uri per note.** Notes live at `resource://notes/<slug-of-title>`,
  so saving again replaces rather than duplicates, and one prefix keeps notes
  apart from everything else in the project.
- **`index: true`.** What a tool writes isn't searchable unless it asks. Here it
  does, so `find-notes` and the assistant's own knowledge search both find the
  notes. Indexing takes a few seconds, and counts toward your plan's storage.
- **`resourceAccess: "own"`.** `delete-note` can only remove what a tool
  wrote, never a file someone uploaded.

No external hosts are called. `allowedHosts` is left empty, which means *any
public host*, not *none*. Add a host there if you extend the tool to fetch
something.

## Run it

```bash
ganju link
ganju test save-note --input '{"title":"Release checklist","body":"1. Tag\n2. Build\n3. Deploy","tags":["release"]}'
ganju test list-notes
ganju test find-notes --input '{"query":"how do we ship"}'
ganju deploy
```

Test runs write real notes to the project. Remove them with `delete-note`.

## Files

```
ganju.json          five tools, resourceAccess: "own"
src/saveNote.ts     save-note
src/listNotes.ts    list-notes
src/readNote.ts     read-note
src/findNotes.ts    find-notes
src/deleteNote.ts   delete-note
src/lib/notes.ts    title → uri, and telling notes apart from other resources
```
