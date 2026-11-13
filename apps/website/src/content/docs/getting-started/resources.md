---
title: Resources
description: Add the files and knowledge your AI can search, from cloud drives, a website crawl, or direct uploads.
order: 5
updated: 2026-11-13
---

**Resources** are the documents and knowledge your assistant can search, so it
answers from your content instead of guessing. Add them from Google Drive,
OneDrive, a website crawl, or by uploading files directly. Each one gets a URI
and, once processed, is marked **Ready**.

> **Want the full picture?** This is the quick version. The complete
> **[Resources](/docs/resources/)** guide covers Google Drive and OneDrive
> imports, website crawls, uploads, citations, and sync.

## Where resources come from

Open **Knowledge** in the rail; it opens on the **Resources** tab. Everything is
grouped by source: **Google Drive**, **OneDrive**, **Websites**, **My folder**
(your own uploads), and **Data attachments** (files uploaded from a row on the
[Data](/docs/data/) page). The buttons at the top add to each: **Add from Google
Drive**, **Add from OneDrive**, **Add website**, and (inside a folder) **Add
files**.

![Knowledge, Resources tab: Google Drive, OneDrive, Websites and My folder, each with its Add button](/images/knowledge-resources.webp)

## Import from Google Drive or OneDrive

Choose **Add from Google Drive**. The first time, you connect your Google
account; then the picker opens. Browse **My Drive**, **Shared with me**,
**Shared drives**, or **Starred**, tick the files or folders you want, and select
**Add selected**.

![The Import from Google Drive picker with tabs for My Drive, Shared with me, Shared drives, and Starred](/images/resource-google-drive.webp)

**OneDrive** works the same way: browse **My files**, **Shared with me**,
**Recent**, or **Drives**, then add your selection.

![The Import from OneDrive picker with tabs for My files, Shared with me, Recent, and Drives](/images/resource-onedrive.webp)

## Upload a file

Open **My folder** and select **Add files**. In the **New Resource** panel:

1. Give it a **Title**. Its **URI** is generated from the title (like
   `resource://mathematics-book`); edit it if you like.
2. Pick a **Type**: **Static** (fixed content) or **Template** (dynamic, with
   variables).
3. Under **Content source**, choose **File** and attach one, or **Text** and
   paste it.

![The New Resource panel with a title, auto-generated URI, type, and an uploaded PDF](/images/resource-math-book.webp)

Once it's processed the resource shows **Ready**, with its type, size, and URI.
Turn on **Cite this resource in replies** to have your assistant reference it as
a source in answers that use it.

![A resource's details: Ready, source, type, size, URI and the "Cite this resource in replies" switch](/images/resource-details.webp)

## Crawl a website

Select **Add website**, enter a starting **URL** (same-origin links are
followed), an optional **Title** and **Description**, and set **Max pages** and
**Max depth**. Then select **Start crawl**.

![The Add Website panel with URL, title, description, and max pages and depth fields](/images/resource-webpage.webp)

When the crawl finishes, the site's pages are indexed and searchable, shown
**Ready** just like any other resource.

## Keep sources up to date

Drive, OneDrive, and website sources can be refreshed. Open the source and
select **Sync now**. Only new or changed content is re-indexed, and what was
removed at the source is removed here too. On **Pro** and **Enterprise** you can
also turn on **Sync automatically** and choose **Daily** or **Weekly**; on Free,
sync by hand.

## Limits

| | Free | Pro / Enterprise |
| --- | --- | --- |
| Searchable (embedded) content | 5 MB | 1 GB included, then $2/GB on Pro |
| File storage | 30 MB | Unlimited |
| Automatic sync | None | Daily or weekly |

Next: let it take action with [tools](/docs/getting-started/tools/).
