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

export interface SendFileOptions {
  uri: string;
  to: string;
  [key: string]: unknown;
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
   * Deliver a resource as a file without pulling its bytes through this isolate.
   * Not available yet: the broker answers 501 until the file-delivery phase
   * lands. Use the native gmail, outlook or slack tools until then.
   */
  sendFile(options: SendFileOptions): Promise<unknown>;
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
