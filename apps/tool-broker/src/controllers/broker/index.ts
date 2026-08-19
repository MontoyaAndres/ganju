import { Context } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

import {
  resolveConnection,
  resolveSecret,
  generateEmbedding,
  sendFile as deliverFile
} from '../../utils';

// types
import type { Database } from '@ganju/db';
import type { ResolvedConnection } from '../../utils';
import type { AppEnv } from '../../types';

/**
 * Resolve one of the artifact's managed connections for the calling script, or
 * return the response explaining why it can't be.
 *
 * Two gates, in this order: the provider must be listed in the tool's
 * `config.connections`, and the artifact must actually hold that credential.
 * The allow-list is checked first so a script cannot use this to probe which
 * providers an artifact has connected — an unlisted provider and a listed one
 * that isn't connected must be indistinguishable from inside the isolate.
 *
 * Shared by `connection` and `sendFile`: a send spends the artifact's credential
 * just as directly as reading its token does, so it passes the same gates. A
 * script barred from the Gmail token must not be able to send mail as that
 * account by naming a different capability.
 */
const requireConnection = async (
  c: Context<AppEnv>,
  dbInstance: Database,
  provider: string
): Promise<
  | { ok: true; connection: ResolvedConnection }
  | { ok: false; response: Response }
> => {
  const tool = c.get('tool');
  const allowed = tool.config.connections || [];

  if (!allowed.includes(provider)) {
    return {
      ok: false,
      response: c.json(
        {
          error: `"${provider}" is not one of this tool's declared connections. Add it to the tool's connections and publish a new version.`
        },
        403
      )
    };
  }

  const resolved = await resolveConnection(
    c,
    dbInstance,
    tool.artifactId,
    provider
  );

  if (!resolved) {
    return {
      ok: false,
      response: c.json(
        {
          error: `"${provider}" is not connected on this artifact. Connect it on the Tools page.`
        },
        404
      )
    };
  }

  if (resolved.needsReauth) {
    return {
      ok: false,
      response: c.json(
        {
          error: `The "${provider}" connection needs to be re-authorized. Open the Tools page and re-link it.`
        },
        409
      )
    };
  }

  return { ok: true, connection: resolved };
};

/**
 * Mint a short-lived access token for one of the artifact's managed connections.
 */
const connection = async (c: Context<AppEnv>) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = utils.Schema.CUSTOM_CODE_BROKER_CONNECTION.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'A provider is required' }, 400);
  }

  const resolved = await requireConnection(
    c,
    db.create(c),
    parsed.data.provider
  );
  if (!resolved.ok) return resolved.response;

  // Only the access token crosses this line. The refresh token and the client
  // secret stay in the broker by construction — see resolveConnection.
  return c.json({
    provider: resolved.connection.provider,
    accessToken: resolved.connection.accessToken,
    expiresAt: resolved.connection.expiresAt
      ? resolved.connection.expiresAt.toISOString()
      : null
  });
};

/**
 * Read one per-tool secret by label (`ctx.secret('stripe-key')`).
 *
 * No allow-list here, unlike connections: these rows belong to this artifact's
 * custom-code tool and to nothing else, so the artifact scope IS the boundary.
 */
const secret = async (c: Context<AppEnv>) => {
  const tool = c.get('tool');
  const body = await c.req.json().catch(() => ({}));
  const parsed = utils.Schema.CUSTOM_CODE_BROKER_SECRET.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'A secret name is required' }, 400);
  }

  const value = await resolveSecret(
    c,
    db.create(c),
    tool.artifactId,
    parsed.data.name
  );

  if (value === null) {
    return c.json(
      {
        error: `No secret named "${parsed.data.name}" is stored for this tool. Add it on the Tools page.`
      },
      404
    );
  }

  return c.json({ value });
};

/**
 * Semantic search over the artifact's indexed resources — the same query the
 * native search-resources tool runs, exposed to user code so a custom tool can
 * ground itself in the customer's own documents without reimplementing RAG.
 */
const searchResources = async (c: Context<AppEnv>) => {
  const tool = c.get('tool');
  const body = await c.req.json().catch(() => ({}));
  const parsed =
    utils.Schema.CUSTOM_CODE_BROKER_RESOURCE_SEARCH.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'A query is required' }, 400);
  }

  const embedding = await generateEmbedding(c, parsed.data.query);
  if (!embedding) {
    return c.json({ error: 'The embedding service is not configured' }, 503);
  }

  const literal = `[${embedding.join(',')}]`;
  const distanceExpr = sql<number>`${db.schema.artifactResourceChunk.embedding} <=> ${literal}::halfvec`;

  const rows = await db
    .create(c)
    .select({
      chunkIndex: db.schema.artifactResourceChunk.chunkIndex,
      content: db.schema.artifactResourceChunk.content,
      uri: db.schema.artifactResource.uri,
      title: db.schema.artifactResource.title,
      description: db.schema.artifactResource.description,
      mimeType: db.schema.artifactResource.mimeType,
      distance: distanceExpr
    })
    .from(db.schema.artifactResourceChunk)
    .innerJoin(
      db.schema.artifactResource,
      eq(
        db.schema.artifactResource.id,
        db.schema.artifactResourceChunk.resourceId
      )
    )
    .where(eq(db.schema.artifactResourceChunk.artifactId, tool.artifactId))
    .orderBy(distanceExpr)
    .limit(parsed.data.limit);

  return c.json({
    results: rows.map(row => ({
      uri: row.uri,
      title: row.title,
      description: row.description || undefined,
      mimeType: row.mimeType,
      chunkIndex: row.chunkIndex,
      score: Number((1 - Number(row.distance)).toFixed(4)),
      excerpt: row.content
    }))
  });
};

/**
 * List the artifact's resources. Metadata only — reading content is a separate
 * call, so a script that just wants to find a URI doesn't pull every document
 * through a 128MiB isolate.
 */
const listResources = async (c: Context<AppEnv>) => {
  const tool = c.get('tool');

  const rows = await db
    .create(c)
    .select({
      uri: db.schema.artifactResource.uri,
      title: db.schema.artifactResource.title,
      description: db.schema.artifactResource.description,
      mimeType: db.schema.artifactResource.mimeType
    })
    .from(db.schema.artifactResource)
    .where(eq(db.schema.artifactResource.artifactId, tool.artifactId));

  return c.json({
    resources: rows.map(row => ({
      uri: row.uri,
      title: row.title,
      description: row.description || undefined,
      mimeType: row.mimeType
    }))
  });
};

/**
 * Read one resource's content by URI.
 *
 * Binary resources are refused rather than base64-encoded: the isolate is capped
 * at 128MiB, and a script that wants to *deliver* a file should use sendFile,
 * where the bytes never enter user code at all.
 */
const readResource = async (c: Context<AppEnv>) => {
  const tool = c.get('tool');
  const body = await c.req.json().catch(() => ({}));
  const parsed = utils.Schema.CUSTOM_CODE_BROKER_RESOURCE_READ.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'A resource uri is required' }, 400);
  }

  const [resource] = await db
    .create(c)
    .select()
    .from(db.schema.artifactResource)
    .where(
      and(
        eq(db.schema.artifactResource.artifactId, tool.artifactId),
        eq(db.schema.artifactResource.uri, parsed.data.uri)
      )
    )
    .limit(1);

  if (!resource) {
    return c.json({ error: `Resource not found: ${parsed.data.uri}` }, 404);
  }

  if (resource.content) {
    return c.json({
      uri: resource.uri,
      mimeType: resource.mimeType,
      text: resource.content
    });
  }

  const bucket = c.env.STORAGE_BUCKET;
  if (!resource.fileKey || !bucket) {
    return c.json({ uri: resource.uri, mimeType: resource.mimeType, text: '' });
  }

  const isText = utils.constants.TEXT_MIME_TYPES.includes(
    resource.mimeType as (typeof utils.constants.TEXT_MIME_TYPES)[0]
  );
  if (!isText) {
    return c.json(
      {
        error: `"${resource.title}" is binary (${resource.mimeType}); use sendFile to deliver it rather than reading it into the tool.`
      },
      415
    );
  }

  const object = await bucket.get(resource.fileKey);
  if (!object) {
    return c.json({ error: `Resource file not found in storage` }, 404);
  }

  return c.json({
    uri: resource.uri,
    mimeType: resource.mimeType,
    text: await object.text()
  });
};

/**
 * Deliver one or more of the artifact's resources as files, to a destination the
 * artifact has connected.
 *
 * The one host capability a user script genuinely cannot reproduce: it is capped
 * at 128MiB, holds no R2 binding, and has no path to the resource-handler
 * container. Here the bytes go R2 → broker → container and never enter the
 * isolate that asked for them, so a script can deliver a 40MB attachment it
 * could not have held.
 *
 * The destination is named by `to` and resolves to a managed connection, which
 * passes the same allow-list gate ctx.connection() does.
 */
const sendFile = async (c: Context<AppEnv>) => {
  const tool = c.get('tool');
  const body = await c.req.json().catch(() => ({}));
  const parsed = utils.Schema.CUSTOM_CODE_SEND_FILE.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error:
          parsed.error.issues[0]?.message ||
          `sendFile needs a destination (${utils.constants.CUSTOM_CODE_SEND_FILE_TARGETS.join(', ')}), the resource uris to send, and a message.`
      },
      400
    );
  }

  const dbInstance = db.create(c);
  const provider =
    utils.constants.CUSTOM_CODE_SEND_FILE_PROVIDERS[parsed.data.to];

  const resolved = await requireConnection(c, dbInstance, provider);
  if (!resolved.ok) return resolved.response;

  const sent = await deliverFile(c, dbInstance, {
    artifactId: tool.artifactId,
    accessToken: resolved.connection.accessToken,
    request: parsed.data
  });

  if (!sent.ok) {
    return c.json({ error: sent.error }, sent.status);
  }

  return c.json({ result: sent.result });
};

export const BrokerController = {
  connection,
  secret,
  searchResources,
  listResources,
  readResource,
  sendFile
};
