import { JsonSchema } from '@ganju/utils';
import { db, Database } from '@ganju/db';
import { InferSelectModel } from 'drizzle-orm';
import { R2Bucket } from '@cloudflare/workers-types';

import type { Bindings } from '../types';

type ArtifactResource = InferSelectModel<typeof db.schema.artifactResource>;

export interface ToolCredential {
  provider: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string | null;
  needsReauth?: boolean;
  id?: string;
  metadata?: unknown;
}

export interface PromptInventoryArgument {
  name: string;
  description?: string;
  required: boolean;
}

export interface PromptInventoryItem {
  // The MCP prompt name as registered on the server — the artifact_prompt id for
  // user-authored prompts, or `<prefix>__<remote>` for proxied ones. This is what
  // an MCP client passes to prompts/get.
  name: string;
  title: string;
  description?: string;
  // Where the prompt comes from: a user-authored artifact prompt, or a proxied
  // prompt surfaced from a connected mcp-proxy server.
  source: 'artifact' | 'mcp-proxy';
  // The chat slash command that invokes this prompt (e.g. `/summarize`), the same
  // one `resolveSlashPrompt` matches on every channel. Null when the title has no
  // slug-able characters, so it can't be invoked by command. Text typed after the
  // command fills the first argument below.
  command: string | null;
  arguments: PromptInventoryArgument[];
}

export interface ToolContext {
  config: Record<string, unknown>;
  credentials: ToolCredential[];
  resources: ArtifactResource[];
  prompts: PromptInventoryItem[];
  channelPlatform: string | null;
  bucket: R2Bucket;
  env: Bindings;
  db: Database;
  artifactId: string;
  embedQuery: (text: string) => Promise<number[] | null>;
}

export interface ToolDefinition {
  title: string;
  description: string;
  schema: JsonSchema;
  outputSchema?: JsonSchema;
  configSchema?: JsonSchema;
  handler: (
    args: Record<string, unknown>,
    context: ToolContext
  ) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}
