// Wire protocol shared between the MCP worker (which builds the request) and
// the resource-handler container (which talks to Microsoft Graph).
//
// The worker sends a multipart/form-data POST with one `metadata` field (JSON
// matching OutlookSendRequest) and zero-or-more `attachment` fields. The
// container decides per-attachment whether to inline it in the Graph message
// JSON (≤3MB) or upload it via createUploadSession with chunked PUTs.

export type OutlookOperation =
  | 'send-email'
  | 'reply-email'
  | 'forward-email'
  | 'create-draft'
  | 'update-draft';

export interface OutlookSendRequest {
  accessToken: string;
  operation: OutlookOperation;
  body: string;
  // Graph terms: 'html' or 'text'. Defaults to 'html' on the container side.
  contentType?: 'html' | 'text';

  // send-email / forward-email / create-draft / update-draft
  to?: string;
  subject?: string;
  cc?: string;
  bcc?: string;

  // reply-email / forward-email need the source message
  messageId?: string;
  // reply-email
  replyAll?: boolean;

  // update-draft target
  draftId?: string;
}

export interface OutlookSendResponse {
  // Resulting message ID for send / reply / forward. Draft ID for
  // create-draft / update-draft. Empty string when Graph returns 202 with
  // no body (sendMail without saveToSentItems).
  id: string;
  conversationId?: string;
}
