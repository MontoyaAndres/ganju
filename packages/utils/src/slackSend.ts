// Wire protocol shared between the MCP worker (which builds the request) and
// the resource-handler container (which talks to the Slack Web API).
//
// post-message: simple chat.postMessage. No attachments. Worker could call
// Slack directly, but we route through the container to keep one auth/error
// path for the slack provider and so future block-kit composition can grow
// without bloating the worker bundle.
//
// upload-file: Slack's new external-upload flow is three round trips
// (files.getUploadURLExternal → PUT bytes → files.completeUploadExternal).
// The bytes ride in as a multipart `attachment` field; the container
// streams them out to Slack's signed URL.

export type SlackOperation = 'post-message' | 'upload-file';

export interface SlackSendRequest {
  accessToken: string;
  operation: SlackOperation;

  // chat.postMessage / files.completeUploadExternal share these
  channel: string;            // channel ID (C…/G…/D…) or name (#general)
  threadTs?: string;          // reply in-thread when set

  // post-message
  text?: string;              // required for post-message
  mrkdwn?: boolean;           // defaults to true on Slack's side
  blocks?: unknown[];         // optional Block Kit payload

  // upload-file
  title?: string;             // shown in the Slack file viewer
  initialComment?: string;    // message body posted alongside the file
}

// Wire protocol for sending a PROXIED (remote MCP) resource as a Slack file.
// Mirrors TelegramSendRemoteResourceRequest: the worker sends only the remote
// connection details + resolved auth header as JSON, and the resource-handler
// container does the remote read + decode + Slack external-upload itself — so a
// large file's bytes never transit the 128 MiB worker.
export interface SlackSendRemoteResourceRequest {
  slack: {
    accessToken: string;
    channel: string;
    threadTs?: string;
    title?: string;
    initialComment?: string;
  };
  remote: {
    url: string;
    transport: string;
    // Single header injected on the remote MCP connection (e.g. Authorization).
    authHeader?: { name: string; value: string } | null;
    uri: string;
    timeoutMs: number;
  };
}

export interface SlackSendResponse {
  // chat.postMessage returns ts; files.completeUploadExternal returns the
  // file id. Empty string when Slack returns ok:true with no id (shouldn't
  // happen, but defensively typed).
  id: string;
  channel?: string;           // resolved channel id
  ts?: string;                // message timestamp (post-message only)
  permalink?: string;         // file permalink (upload-file only)
}
