---
title: Resources
description: Give your AI knowledge to search — import from Google Drive or OneDrive, upload files or paste text, crawl a website, keep it all in sync, and cite your sources.
order: 3
updated: 2026-11-13
---

**Resources** are the documents and knowledge your assistant can search, so it
answers from your own content instead of guessing. Add them from Google Drive,
OneDrive, a website crawl, or by uploading files and pasting text. Each resource
gets a URI (like `resource://price-list`) and, once processed, is marked
**Ready** and becomes searchable by your bot on every channel and by any MCP
client.

## Why add resources

- **Grounded, accurate answers.** Your AI replies from your actual documents, not
  from general training — fewer made-up answers, more citations you can trust.
- **One knowledge base, every channel.** Add a file once and it's searchable from
  every linked channel and MCP client at the same time.
- **Bring what you already have.** Pull straight from Google Drive or OneDrive,
  upload files, or crawl a whole website — no reformatting or copy-paste.
- **Always current.** Sync a drive or a website and only what changed is indexed
  again; on Pro it happens on its own, daily or weekly.
- **Show your sources.** With citations on, the bot lists the exact resource
  behind each answer, with a link to the page or file.

## Where resources live

Open **Knowledge** in the project's sidebar. It has two tabs: **Resources** and
[Prompts](/docs/prompts/). The Resources tab has two views, switched at the top
right:

- **Sources** groups everything by where it came from, one card per source with
  its count and an add button: **Google Drive**, **OneDrive**, **Websites**,
  **My folder** (your uploads and pasted text) and, once there are some, **Data
  attachments** (files uploaded from a row on the [Data](/docs/data/) page).
- **All resources** lists every resource in one place.

Inside a source, or in All resources, a **Search** box filters by title, URI or
description, and **Back** returns to the cards.

![Knowledge, Resources tab, Sources view: Google Drive, OneDrive, Websites and My folder](/images/knowledge-resources.webp)

## Upload a file or paste text

Open **My folder** and select **Add files**. The **New Resource** panel asks for:

- **Title** — a readable name (3 to 200 characters). Picking a file fills it
  with the file's name.
- **URI** — generated from the title (like `resource://price-list`); edit it if
  you like. Each URI must be unique in the project.
- **Type** — **Static — Fixed content** for a normal document, or **Template —
  Dynamic with variables** for content with placeholders like `{userId}` that an
  MCP client fills in.
- **Description** — what the resource is about (up to 1,000 characters). It's
  indexed too, so a good description helps the bot find it.
- **Content source** — **File** to upload one, or **Text** to paste or write
  content directly, with its **MIME Type** (plain text, CSV, HTML, JSON, YAML,
  code and other text formats) and **Encoding**.
- **Advanced options** — the MCP annotations clients can read: **Audience**,
  **Priority (0 to 1)** and **Icons**.

![The New Resource panel: Title, URI, Type, Description, File or Text, and Advanced options](/images/resource-new-file.webp)

Select **Create**. The resource shows **Indexing** while Ganju reads it, then
**Ready** (or **Failed**, if the file couldn't be read).

### File types and sizes

One file can be up to **500 MB**. What Ganju **reads and makes searchable**:

| Kind | Formats |
| --- | --- |
| Documents | PDF, Word (`.doc`, `.docx`), PowerPoint (`.pptx`) |
| Spreadsheets | Excel (`.xls`, `.xlsx`), CSV |
| Google files | Docs, Sheets and Slides (from Google Drive) |
| Text and code | plain text, Markdown, HTML, JSON, XML, YAML, TOML, SQL, GraphQL, JavaScript, TypeScript, Python, Ruby, Perl, PHP, shell |

You can also store images (PNG, JPEG, GIF, WebP, SVG) and other
files. They keep their title, description and URI — which are searchable — and
the bot can send them as attachments, but their contents aren't read into the
index.

When indexing finds passages written to an AI rather than to a person ("ignore
your instructions and…"), the resource gets a warning: **Contains text that reads
like instructions to an AI**. Bots treat documents as information, never as
orders, and after reading such a passage a sensitive action asks first. Review
the document if you didn't expect that text.

## Import from Google Drive or OneDrive

Open the **Google Drive** card and choose **Add from Google Drive**. The first
time, Ganju asks you to connect your Google account. A picker opens with **My
Drive**, **Shared with me**, **Shared drives** and **Starred**; search across a
tab, tick files or whole folders, and select **Add selected** — Ganju imports and
indexes them. Picking a folder brings in what's inside it, and keeps it in sync.

Google Docs, Sheets and Slides are converted to Word, Excel and PowerPoint as
they're imported, so they're read like any other document.

**OneDrive** works the same way: **Add from OneDrive**, connect your Microsoft
account, then browse **My files**, **Shared with me**, **Recent** or **Drives**
and add your selection.

## Crawl a website

Open the **Websites** card and select **Add website**. The **Add Website** panel
asks for:

- **URL** — the starting page, `http` or `https`. Ganju follows links on the
  same site (same origin) only. Addresses on private networks are refused.
- **Title** and **Description** — a name for the site and what's on it.
- **Max pages** — 1 to 1,000 pages (100 by default).
- **Max depth** — how many clicks away from the starting page to go, 0 to 10
  (3 by default; 0 crawls only the starting page).

![The Add Website panel: URL, Title, Description, Max pages and Max depth](/images/resource-add-website.webp)

Select **Start crawl**. Ganju fetches each page, renders pages built with
JavaScript in a real browser when plain HTML has no text, and indexes each page
as its own resource. Open the website to browse every page it found, with its
title, URL and date.

![A crawled website opened: its pages with URL and date, plus Sync and the sync settings](/images/resource-website-pages.webp)

## Keep sources in sync

Google Drive, OneDrive and website sources can be synced again. Select **Sync**
in the source's toolbar, or **Sync now** in a resource's **Sync** section. Only
new or changed content is indexed again, and what was removed at the source is
removed here too. The section shows when it **Last synced**.

The sync settings button next to **Sync** sets **Sync automatically** and **How
often**: **Daily** or **Weekly**. Automatic sync is a **Pro** and
**Enterprise** feature; on Free you can still sync any source by hand.

## Resource details

Select any resource to open it. You'll see its status (**Ready**, **Indexing**
or **Failed**), **Source** (File, Website, Google Drive, OneDrive or Tool for
ones your [functions](/docs/tools/functions/) create), **Type**, **MIME Type**,
**Size**, **Encoding**, **File name**, **URI** and **Description**, the content
or an **Open file** button, and its metadata. From the top of the panel you can
edit or delete it. Deleting a folder deletes everything inside it; if rows on
the Data page link the file, Ganju tells you what happens to those links first.

![A resource's details: Ready, source, type, size, URI and the "Cite this resource in replies" switch](/images/resource-details.webp)

## Cite your sources

Each resource has a **Sources** switch, on by default: **Cite this resource in
replies**. When the bot uses it to answer, it lists the resource under the reply
as a numbered source:

- a **file** links to its download, with the page number for PDFs (`p. 12`);
- a **website page** links to the page itself, labeled with the site's domain.

On Telegram and Discord the sources come as buttons under the message; on Slack and
WhatsApp
as a short **Sources** list of links. Turn the switch off
(**Hidden from citations**) and the bot still uses the resource, but never shows
it as a source — useful for internal notes.

![A Telegram chat where the bot answers a question from a crawled website and cites the site as the source](/images/resource-chat.webp)

In the channel's [Conversations](/docs/channels/#watch-the-conversations), each
answer shows the sources it cited, with their page numbers.

## How the bot uses resources

Once a resource is **Ready**, your bot searches it on its own when a question
calls for it, on every channel and in the assistant's **Try it as a customer**
panel. It can also send a stored file to the person as an attachment ("send me
the menu"). MCP clients get the same search, plus every resource by its URI.

Code can use them too: a [function](/docs/tools/functions/) reads, lists,
searches and creates resources with `ctx.resources`.

## Let the assistant manage them

The project [assistant](/docs/assistant/) can list your knowledge, search it the
way the bot would, add a note (a text resource), edit a note, add a website to
crawl and remove a resource — each as a change you approve. To add a file, it
asks you to upload it.

## Plan limits

| | Free | Pro and Enterprise |
| --- | --- | --- |
| One file | 500 MB | 500 MB |
| Stored files (per organization) | 30 MB | No limit |
| Indexed content (per organization) | 5 MB | No limit |
| Automatic sync | — | Daily or weekly |

Indexed content is the text Ganju extracted and made searchable, which is
usually far smaller than the files. When an organization on Free is full, new
resources are refused until you remove some or upgrade. See
[Settings](/docs/settings/) for plans.

## Troubleshooting

- **"Unsupported mime type".** The browser reported a file type Ganju doesn't
  store. Save it as one of the formats above (PDF is the safest).
- **A resource shows Failed.** The file couldn't be read — a damaged or
  password-protected file, for example. Export it again and upload the new copy
  (edit the resource and replace the file).
- **A website crawl found few pages.** Raise **Max depth** or **Max pages**,
  and check that the links stay on the same domain as the starting URL
  (`www.example.com` and `example.com` are different origins).
- **"Resource URI must be unique".** Another resource uses that URI or URL.
  Change the URI, or open the existing website instead of adding it again.
- **"Connect Google Drive to import files".** The Google or Microsoft session
  expired. Select **Add from Google Drive** (or OneDrive) again to reconnect.

Next: let your AI take action with [tools](/docs/tools/).
