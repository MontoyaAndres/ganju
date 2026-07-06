---
title: Resources
description: Add the files and knowledge your AI can search — from cloud drives, a website crawl, or direct uploads.
order: 5
updated: 2026-07-06
---

**Resources** are the documents and knowledge your assistant can search, so it
answers from your content instead of guessing. Add them from Google Drive,
OneDrive, a website crawl, or by uploading files directly — each one gets a URI
and, once processed, is marked **Ready**.

## Where resources come from

The **Resources** page groups everything by source: **Google Drive**, **OneDrive**,
**Websites**, and folders you fill with your own uploads.

![The Resources page showing Google Drive, OneDrive, Websites, and My folder sources](/images/new-resource.webp)

## Import from Google Drive or OneDrive

Choose **Add from Google Drive** to open the picker. Browse **My Drive**, **Shared
with me**, **Shared drives**, or **Starred**, tick the files you want, and select
**Add selected**.

![The Import from Google Drive picker with tabs for My Drive, Shared with me, Shared drives, and Starred](/images/resource-google-drive.webp)

**OneDrive** works the same way — browse **My files**, **Shared with me**,
**Recent**, or **Drives**, then add your selection.

![The Import from OneDrive picker with tabs for My files, Shared with me, Recent, and Drives](/images/resource-onedrive.webp)

## Upload a file

Inside a folder, select **Add files**. Give the resource a **title** — its URI is
generated for you (like `resource://mathematics-book`) and can be edited — pick a
**type**, and attach a file or paste text.

![The New Resource panel with a title, auto-generated URI, type, and an uploaded PDF](/images/resource-math-book.webp)

Once it's processed the resource shows **Ready**, along with its type, size, and
URI. Turn on **Cite this resource in replies** to have your assistant reference it
as a source in answers that use it.

![The saved mathematics-book resource marked Ready, with its metadata and the Cite in replies toggle](/images/resource-math-book-done.webp)

## Crawl a website

Select **Add website**, enter a starting **URL** (same-origin links are followed),
and set **Max pages** and **Max depth**. Then select **Start crawl**.

![The Add Website panel with URL, title, description, and max pages and depth fields](/images/resource-webpage.webp)

When the crawl finishes, the site's pages are indexed and searchable — shown
**Ready** just like any other resource.

![The crawled website resource marked Ready, with its source, URI, and description](/images/resource-website-done.webp)

Next: let it take action with [tools](/docs/getting-started/tools).
