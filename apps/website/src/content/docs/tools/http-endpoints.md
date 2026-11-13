---
title: HTTP Endpoints
description: Point your bot at an API you already run — describe one request and it becomes a named tool, with no code and no deploy.
order: 38
updated: 2026-11-13
---

**HTTP Endpoints** turn an API you already run into a tool. You describe one
request (method, URL, headers, arguments) and it becomes a named tool the
model can call. No code, no bundle, no deploy step.

This is the middle rung between the catalog and
[functions](/docs/tools/functions/): more flexible than an integration we ship,
and far less work than code. It's also the custom tool available on **every
plan**, including Free.

You can fill in the form yourself, or ask the [Assistant](/docs/assistant/):
it can add and change an HTTP endpoint as part of a change set you apply.

## The tab

![The HTTP Endpoints tab, empty, with the New endpoint button](/images/new-http-function.webp)

Each endpoint you add becomes its own tool, listed here with a switch, an edit
button and a remove button. **Off keeps the endpoint and everything configured
on it** (the row shows **Off · settings kept**); **Remove deletes it with its
settings**. Use the switch when you want the tool to go quiet, and remove it
when you're done with it. On Free, the tab shows how many of your 3 endpoints
you've used.

## Add an endpoint

**New endpoint** opens **Add HTTP endpoint**. **Form** guides you field by
field; **JSON** lets you write the whole configuration at once (to use a saved
secret or a connected account there, set `auth.credentialId` to its id).

![The Add HTTP endpoint dialog with method, URL, headers, inputs, authentication and advanced options expanded](/images/new-http-function-advanced-options.webp)

### Name and description

- **Tool name**: what the model calls, e.g. `lookup-order`. Letters, digits,
  `_` or `-`.
- **Description**: tell the model **when** to call this tool. It's how the
  model decides.

### The request

- **Method** (`GET`, `POST`, `PUT`, `PATCH` or `DELETE`) and **URL**. Use
  `{{arg}}` anywhere in the URL to drop in an input.
- **What it does**: whether the call only reads or changes something. The
  default, **Decide from the method — GET reads, anything else is sensitive**,
  fits most APIs. Pick **Only reads — looks things up, changes nothing** for a
  `POST` that just searches, **Changes things that can be undone**, or
  **Sends, deletes, charges or can't be undone**. When the organization turns
  on [Confirm sensitive actions](/docs/settings/#confirm-sensitive-actions), a
  channel bot asks before calling a sensitive endpoint.
- **Headers** and **Query parameters**: fixed values, or `{{arg}}`
  placeholders filled in at call time.
- **Body**, for `POST`, `PUT` and `PATCH`: a **Format** (**None**, **JSON**,
  **Form (urlencoded)** or **Text**) and a **Body template** built from the
  same placeholders. A JSON template must parse once the arguments are filled
  in, e.g. `{"id":"{{orderId}}"}`.
- **Inputs (model arguments)**: what the model provides when it calls the
  tool. Each one has a name, a **Type** (**String**, **Number** or
  **Boolean**), whether it's **Required**, and a **Description**, which is how
  the model knows what to put there.

### Authentication

Pick an **Auth type**:

| Auth type | What is sent |
| --- | --- |
| **None** | Nothing. |
| **Bearer token** | The stored token as an `Authorization: Bearer` header. |
| **Basic (user:pass)** | The stored `username:password` as basic auth. |
| **API key** | The stored key, in a **Header** or a **Query param** with the **Parameter name** you choose. |
| **Connected account** | An account you connected from the [catalog](/docs/tools/catalog/). Its access token is refreshed and sent as a Bearer header on every call. |

A key is stored encrypted, applied just before the request leaves, and never
shown back to you or sent to the model. You can **Add new secret** with a
**Label** to recognize it, or **Use an existing secret** you saved before.

### Advanced options

- **Response type**: **Auto-detect**, or force **JSON** or **Text**.
- **JSON path**: extract a sub-tree, e.g. `data.items`, so the model gets the
  part it needs rather than the whole envelope.
- **Output schema — optional**: declare one and a JSON response comes back to
  MCP clients as **structured output** instead of text. The response must then
  be a JSON object, or the call is reported as an error.
- **Success statuses**: comma-separated, e.g. `200, 201`. Defaults to any 2xx.
- **Timeout (ms)**: default 10,000, at most 30,000.
- **Allowed hosts**: a comma-separated allowlist. Private and loopback hosts
  are always blocked, whatever this says.

**Add endpoint** saves it.

## How a call runs

When the model decides to use the tool, Ganju fills your placeholders with its
arguments, applies the stored credential, and makes the request from our
infrastructure. The response, narrowed by your JSON path and shaped by your
output schema, goes back to the model to finish its reply.

Every request is screened, so an endpoint can never be pointed at an internal
address, and each endpoint is limited to 60 calls a minute so a chatty model
can't hammer your service. Failures come back marked as errors rather than as
text that happens to start with "Error", which is what lets the model tell
"the call failed" from "the answer is no".

## When to use which

| | Reach for |
| --- | --- |
| The vendor is in our catalog | **[Catalog](/docs/tools/catalog/)**: connect once, done |
| The vendor publishes a remote MCP server | **Catalog**: connect the server and get its whole maintained toolset |
| One request against your own API | **HTTP Endpoints** |
| Several steps, logic, your database, or a key combined with a computation | **[Functions](/docs/tools/functions/)**, written by the [Assistant](/docs/assistant/) |

## Limits

Free allows **3 endpoints** per project. Pro and Enterprise have no endpoint
limit; every endpoint that is on still counts toward the project's
[tools](/docs/tools/#turning-tools-on-and-off). HTTP endpoint calls aren't
metered as tool calls: only calls into [your own code](/docs/tools/functions/)
are.
