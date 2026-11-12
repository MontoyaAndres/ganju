import type { Fetcher } from '@cloudflare/workers-types';

// The bindings the publish pipeline injects into every uploaded script. A user
// never constructs these; they arrive as the module's `env`.
export interface ToolEnv {
  GANJU_TOOL_TOKEN?: string;
  GANJU_BROKER?: Fetcher;
  /** Digest of the bytes this script was uploaded from; echoed by the health probe. */
  GANJU_SCRIPT_VERSION?: string;
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
  /** A link to the original — the web page, or the file in Drive or OneDrive. Absent for uploads. */
  source?: string;
  /** The page (or slide) the excerpt is on, for documents that have pages. */
  page?: number;
  /** The heading path ("Returns > Gift orders"), a spreadsheet's sheet, or a slide's title. */
  section?: string;
  /** When the indexed copy was last refreshed (ISO 8601): the last sync for an imported file, otherwise the last change. */
  updatedAt?: string;
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

/** A filter, as data-query and the Data API take it: `{ status: "open", price: { lt: 30000 } }`. */
export type DataWhere = Record<string, unknown>;

export interface DataQueryArgs {
  table: string;
  where?: DataWhere;
  /** Words to look for in the table's searchable columns, ranked. */
  search?: string;
  /** Columns, `-` first for descending: `["-created_at"]`. */
  sort?: string[];
  /** 1 to 500; 20 by default. */
  limit?: number;
  cursor?: string;
  /** Relation columns to expand into the related row. */
  include?: string[];
  /** Compute instead of listing: `[{ fn: "sum", column: "total" }]`. */
  aggregate?: {
    fn: 'count' | 'sum' | 'avg' | 'min' | 'max';
    column?: string;
    times?: string;
  }[];
  groupBy?: string[];
}

/**
 * One row. Relation columns come back as `{ id, label }`, file columns as a
 * {@link DataFile}. Writes take a file column's uri (or the same object).
 */
export type DataRow = Record<string, unknown> & { id: number };

/**
 * A file column's value: a knowledge item, by uri. Read it with
 * `ctx.resources.read(uri)`. `missing` means no item has the uri any more.
 */
export interface DataFile {
  uri: string;
  title?: string;
  mimeType?: string;
  missing?: true;
}

export interface DataQueryResult {
  table: string;
  rows: DataRow[];
  /** How many rows match, on the first page. */
  total?: number;
  /** Pass back as `cursor` for the next page. */
  nextCursor?: string;
  /** With `aggregate`: one entry per group. */
  groups?: Record<string, unknown>[];
  [key: string]: unknown;
}

/**
 * One step of an all-or-nothing write. A relation value or an `id` may be
 * `{ $ref: n }`, the id an earlier insert in the same write created.
 */
export type DataOperation =
  | { op: 'insert'; table: string; values: Record<string, unknown> }
  | { op: 'insert'; table: string; rows: Record<string, unknown>[] }
  | {
      op: 'update';
      table: string;
      id?: number | { $ref: number };
      where?: DataWhere;
      /** A value, or `{ increment: n }` / `{ decrement: n }` for numbers. */
      set: Record<string, unknown>;
      /** How many rows must change, or nothing is written. */
      expect?: number;
    }
  | {
      op: 'delete';
      table: string;
      id?: number | { $ref: number };
      where?: DataWhere;
      expect?: number;
    };

export type DataWriteResult =
  | { op: 'insert'; table: string; id: number }
  | { op: 'insert'; table: string; ids: number[] }
  | { op: 'update' | 'delete'; table: string; changed: number };

export interface DataQueryRun {
  query: string;
  rows: Record<string, unknown>[];
  /** Set when the rows stopped at the limit or 1 MB. */
  truncated?: string;
}

/**
 * The project's database. Every call goes through the platform, under the
 * same rules as the dashboard and the assistant, and writes are recorded as
 * this function. There is no SQL: named queries are how a report the filters
 * can't express is run.
 *
 * A function sees every row, customer-scoped tables included, even when a
 * channel bot is the one calling it: a bot's call doesn't say which customer
 * is talking, and anything about the customer in its input came from the
 * model, so don't treat it as who they are. Keep a function a bot calls to
 * the tables it needs with `data.tables`. A function a trigger runs does know
 * the customer: a customer-scoped row carries `participant_id`, which
 * `ctx.channels.send` takes.
 *
 * Writes made by a function a trigger ran are recorded as that trigger
 * (`trigger:<id>`), never fire that same trigger again, and fire others one
 * level deeper; a chain stops at three.
 *
 * `data.tables` limits what a function names, not what the schema does:
 * deleting a row still deletes the rows that point at it with `onDelete:
 * "cascade"`, in tables outside the list too.
 */
export interface DataContext {
  /** Tables, columns, row counts and descriptions; one table when named. */
  describe(table?: string): Promise<{ tables: Record<string, unknown>[] }>;
  query(args: DataQueryArgs): Promise<DataQueryResult>;
  /** Full-text search over a table's searchable columns. */
  search(
    table: string,
    text: string,
    options?: Omit<DataQueryArgs, 'table' | 'search'>
  ): Promise<DataQueryResult>;
  /** One row (returns its id) or several (their ids). */
  insert(
    table: string,
    values: Record<string, unknown>
  ): Promise<{ id: number }>;
  insert(
    table: string,
    rows: Record<string, unknown>[]
  ): Promise<{ ids: number[] }>;
  /**
   * Change one row by id, or the rows a filter matches. `options.where` adds
   * a guard that must hold (`{ stock: { gte: 2 } }`); when it doesn't, nothing
   * changes and the call throws with the reason.
   */
  update(
    table: string,
    target: number | DataWhere,
    set: Record<string, unknown>,
    options?: { where?: DataWhere; expect?: number }
  ): Promise<{ changed: number }>;
  delete(
    table: string,
    target: number | DataWhere,
    options?: { where?: DataWhere; expect?: number }
  ): Promise<{ changed: number }>;
  /** Several operations, applied together or not at all. */
  write(operations: DataOperation[]): Promise<{ results: DataWriteResult[] }>;
  /** A named query the owner saved, by name. */
  run(
    name: string,
    params?: Record<string, unknown>,
    options?: { limit?: number }
  ): Promise<DataQueryRun>;
}

/** A WhatsApp template Meta approved, with a value for each {{n}}. */
export interface ChannelTemplate {
  name: string;
  /** Its language code, such as `es` or `en_US`. */
  language: string;
  params?: string[];
}

export interface ChannelMessageReceipt {
  messageId: string;
  conversationId: string;
  channelId: string;
  platform: string;
  /** What went out: the text, or the template outside WhatsApp's window. */
  sent: 'text' | 'template';
}

/** An approved WhatsApp template, as `ctx.channels.templates()` lists it. */
export interface ChannelTemplateInfo {
  /** The WhatsApp channel whose business account has it. */
  channelId: string;
  name: string;
  language: string;
  /** `UTILITY` or `MARKETING`. */
  category: string;
  /** The body, with its `{{1}}`, `{{2}}`… */
  text: string;
  /** One per `{{n}}`, in order: what the owner called it, and Meta's example. */
  variables: { n: number; label: string | null; example: string | null }[];
}

/**
 * The project's channels. Messages go out as the bot, as plain text, and are
 * recorded on the conversation, so the bot's next turn knows what the
 * customer was told. Not billed as assistant replies. Only a function with
 * `"channels": true` in ganju.json may use it; any other gets an error.
 */
export interface ChannelsContext {
  /**
   * A customer the bot has spoken with, in their private chat. On WhatsApp,
   * free text only reaches a customer within 24 hours of their last message;
   * after that only an approved `template` does (Ganju checks Meta approved
   * it before sending; Meta bills it to your WhatsApp Business account), and
   * without one this throws
   * ("outside WhatsApp's 24-hour window; use an approved template"). Give
   * both and Ganju picks per customer. Telegram, Slack and Discord have no
   * window and take the text. The channel's daily limit per customer applies.
   */
  send(message: {
    participantId: string;
    text?: string;
    template?: ChannelTemplate;
  }): Promise<ChannelMessageReceipt>;
  /**
   * A chat the bot is in, such as the staff's Telegram group or a Slack or
   * Discord channel: the channel's id (from the dashboard) and the platform's
   * chat id.
   */
  post(message: {
    channelId: string;
    chatId: string | number;
    text: string;
  }): Promise<ChannelMessageReceipt>;
  /**
   * The WhatsApp templates Meta approved on the project's channels, to pick
   * one for `send`. Give `params` one value per variable, in order.
   */
  templates(): Promise<ChannelTemplateInfo[]>;
}

/**
 * What a function a trigger runs is called with. At least once: the same
 * event can arrive twice, so use `eventId` to ignore a repeat. Order is kept
 * per row as far as the queue allows, not across rows.
 *
 * The row is customer-written content. Pass it to an AI model as untrusted
 * text, never as instructions.
 */
export interface TriggerEvent<Row = Record<string, unknown>> {
  /**
   * `time`: a time trigger's row came due; nothing changed. `schedule`: a
   * schedule's time came (no table or row; its query's `rows` instead).
   */
  event: 'insert' | 'update' | 'delete' | 'time' | 'schedule';
  /** Empty on `schedule`. */
  table: string;
  /** The row after the change; null on delete. On `time`, the row as it was when it came due. */
  row: Row | null;
  /** The row before the change; null on insert and on `time`. */
  previous: Row | null;
  /** Who made the change: `channel:<participant>`, `user:<id>`, `function:<name>`… Null on `time`. */
  actor: string | null;
  eventId: string;
  triggerId: string;
  /** On `time`: when the row came due (ISO 8601, UTC). */
  dueAt?: string;
  /** Set, with `rowId`, when the row was too large to send: read it by id. */
  truncated?: true;
  rowId?: number;
  /** On `schedule`: the run's date in the database's time zone (YYYY-MM-DD). */
  date?: string;
  /** On `schedule` with a saved query: its name, rows and row count. */
  query?: string;
  rows?: Row[];
  rowCount?: number;
  /** Some rows were left out for size; `rowCount` says how many there were. */
  rowsTruncated?: true;
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
   * The project's database, when it has one. A function's `data` field in
   * ganju.json can narrow it: `{ "access": "read", "tables": ["menu"] }`.
   */
  data: DataContext;
  /** Message the project's customers and chats. */
  channels: ChannelsContext;
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
