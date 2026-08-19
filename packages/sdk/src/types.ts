import type { Fetcher } from '@cloudflare/workers-types';

// The bindings the publish pipeline injects into every uploaded script. A user
// never constructs these; they arrive as the module's `env`.
export interface ToolEnv {
  GANJU_TOOL_TOKEN?: string;
  GANJU_BROKER?: Fetcher;
  [key: string]: unknown;
}

export interface Connection {
  provider: string;
  accessToken: string;
  expiresAt: string | null;
}

export interface ResourceMatch {
  uri: string;
  title: string;
  description?: string;
  mimeType: string | null;
  chunkIndex: number;
  score: number;
  excerpt: string;
}

export interface ResourceSummary {
  uri: string;
  title: string;
  description?: string;
  mimeType: string | null;
}

export interface ResourceContent {
  uri: string;
  mimeType: string | null;
  text: string;
}

// The destinations sendFile can deliver to. Each one is a send path the platform
// already owns end to end, which is why the list is these three rather than
// every provider a connection exists for.
export type SendFileTarget = 'gmail' | 'outlook' | 'slack';

export interface SendFileGmail {
  to: 'gmail';
  /** Resource URIs, as returned by ctx.resources.list() or .search(). */
  uris: string[];
  message: {
    /** Recipient address. Gmail's own field — the destination is `to` above. */
    to: string;
    subject?: string;
    body?: string;
    cc?: string;
    bcc?: string;
    contentType?: 'text/html' | 'text/plain';
    /** Attach onto an existing thread rather than starting a new one. */
    threadId?: string;
  };
}

export interface SendFileOutlook {
  to: 'outlook';
  uris: string[];
  message: {
    to: string;
    subject?: string;
    body?: string;
    cc?: string;
    bcc?: string;
    /** Graph's vocabulary, not a MIME type. */
    contentType?: 'html' | 'text';
  };
}

export interface SendFileSlack {
  to: 'slack';
  /**
   * Exactly one URI. Slack's upload flow moves a single file per call — call
   * sendFile again for the next one.
   */
  uris: [string];
  message: {
    /** Channel ID (C…/G…/D…) or name (#general). IDs resolve faster. */
    channel: string;
    title?: string;
    initialComment?: string;
    /** Upload into an existing thread. */
    threadTs?: string;
  };
}

export type SendFileOptions = SendFileGmail | SendFileOutlook | SendFileSlack;

/**
 * What the destination returned. Which fields are populated depends on where the
 * file went: Gmail sets `threadId`, Outlook sets `conversationId`, and Slack
 * sets `channel`, `ts` and `permalink`.
 */
export interface SendFileReceipt {
  id: string;
  threadId?: string;
  conversationId?: string;
  channel?: string;
  ts?: string;
  permalink?: string;
}

export interface ToolContext {
  /**
   * A short-lived access token for one of the artifact's managed connections.
   * Throws when the provider isn't declared in the tool's `connections`, isn't
   * connected, or needs re-authorization — all three are things the tool author
   * fixes in the dashboard, so the message says which.
   */
  connection(provider: string): Promise<Connection>;
  /**
   * A per-tool secret by the label it was stored under.
   */
  secret(name: string): Promise<string>;
  resources: {
    search(query: string, limit?: number): Promise<ResourceMatch[]>;
    read(uri: string): Promise<ResourceContent>;
    list(): Promise<ResourceSummary[]>;
  };
  /**
   * Deliver resources as files without pulling their bytes through this isolate.
   *
   * This is the one capability a script cannot build for itself: it is capped at
   * 128MiB and has no storage binding, so the bytes travel from storage to the
   * destination entirely on the host side. That is what lets a tool send a 40MB
   * attachment it could never have held.
   *
   * The destination must be one of the tool's declared `connections` — sending
   * as an account is the same privilege as reading its token.
   */
  sendFile(options: SendFileOptions): Promise<SendFileReceipt>;
  /**
   * Buffered in the isolate and returned with the result, where it is recorded
   * against the tool call. Costs no network round trip, so logging freely is
   * fine — but only the first 50 lines survive.
   */
  log(...values: unknown[]): void;
}

export type ToolHandler<Input = Record<string, unknown>, Output = unknown> = (
  input: Input,
  ctx: ToolContext
) => Promise<Output> | Output;

export interface LogEntry {
  level: 'log' | 'warn' | 'error';
  message: string;
}
