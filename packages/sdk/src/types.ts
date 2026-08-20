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

/**
 * What to write with `ctx.resources.create`. Exactly one of `content` or `bytes`
 * — a resource holding both would have two answers to "what is in it".
 */
export interface CreateResourceOptions {
  title: string;
  /**
   * Text written inline on the resource. Capped at 1MB — it becomes a column on
   * a row every resource listing reads.
   */
  content?: string;
  /**
   * File bytes, up to 10MB. Accepts binary directly; the SDK base64-encodes it
   * for the wire.
   *
   * Note the asymmetry with sendFile: these bytes DO pass through this isolate,
   * because the script is the thing holding them. sendFile's promise that bytes
   * never enter user code applies to delivering a resource, not to making one.
   */
  bytes?: ArrayBuffer | Uint8Array | string;
  /** Must be a type the platform accepts; defaults by payload kind. */
  mimeType?: string;
  description?: string;
  /**
   * Reuse a uri to replace a resource an earlier run created — which is how a
   * daily report updates in place instead of accumulating. Defaults to one
   * derived from the title. A uri held by a resource a script did NOT create is
   * refused, never overwritten.
   */
  uri?: string;
  /** Names the stored file and the attachment it arrives as. Bytes only. */
  fileName?: string;
  /**
   * Put this resource in the artifact's search corpus, so `search()` and the
   * assistant's own retrieval can find it.
   *
   * Off by default, deliberately: indexed content is what the assistant answers
   * other people's questions from, and that should be a decision rather than a
   * side effect of writing a file. Indexing is asynchronous — the resource is
   * readable immediately and searchable shortly after.
   *
   * A file whose type no extractor can read is refused rather than queued, since
   * it would otherwise index to nothing and look like it had worked.
   */
  index?: boolean;
}

export interface CreatedResource {
  uri: string;
  title: string;
  description?: string;
  mimeType: string | null;
  size: number;
  /** False when this replaced an earlier resource at the same uri. */
  created: boolean;
  /** Whether it was queued for the corpus — not whether it is searchable yet. */
  indexed: boolean;
}

export interface DeleteResourceOptions {
  /**
   * Also remove everything beneath this resource — a crawled site's pages, an
   * imported folder's files.
   *
   * Opt-in rather than implied: they are removed either way once the parent
   * goes, so this is the difference between deleting one page and deleting four
   * hundred. Naming a resource that has children without passing this is an
   * error, not a silent cascade.
   */
  children?: boolean;
}

export interface DeletedResource {
  uri: string;
  /** False when there was nothing at that uri — deleting is idempotent. */
  deleted: boolean;
  /** How many resources went: the named one plus any descendants. */
  count: number;
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
    /**
     * Write a resource on the artifact — the file a tool produced, rather than
     * one it found.
     *
     * What it is NOT: indexed. Script output stays out of the corpus the
     * assistant answers from, so a created resource is listable and sendable but
     * never surfaces in `search()`. That keeps a tool from writing into the
     * knowledge base its own artifact answers questions with.
     *
     * How far it reaches is the tool's declared resource access: by default a
     * uri belonging to an uploaded or crawled resource is refused, and a tool
     * granted `all` may replace those too.
     */
    create(options: CreateResourceOptions): Promise<CreatedResource>;
    /**
     * Remove a resource this tool created — so a script producing per-run output
     * can clean up after itself instead of accumulating rows forever.
     *
     * Idempotent: a uri with nothing behind it resolves with `deleted: false`
     * rather than throwing, because this is a call made to reach a state
     * ("make sure last week's report is gone") rather than to cause an effect.
     *
     * How far it reaches is the tool's declared resource access. The default
     * confines it to what a script wrote; a tool granted `all` in its config can
     * also remove uploaded and crawled resources, which is what pruning a stale
     * crawl needs. That is granted at publish time and cannot be widened here.
     */
    delete(
      uri: string,
      options?: DeleteResourceOptions
    ): Promise<DeletedResource>;
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
