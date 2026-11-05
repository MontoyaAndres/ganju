import { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import { DataError } from '@ganju/utils/data';

import {
  resolveConnection,
  resolveSecret,
  createResource as writeResource,
  deleteResource as removeResource,
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
 * Hybrid search over the artifact's indexed resources — the same search the
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

  const rows = await db.searchResourceChunks(db.create(c), {
    artifactId: tool.artifactId,
    query: parsed.data.query,
    embedding,
    limit: parsed.data.limit,
    rerank: utils.createResourceReranker(c)
  });

  return c.json({
    results: rows.map(db.toResourceSearchResult)
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
      mimeType: db.schema.artifactResource.mimeType,
      sourceType: db.schema.artifactResource.sourceType,
      parentResourceId: db.schema.artifactResource.parentResourceId
    })
    .from(db.schema.artifactResource)
    .where(eq(db.schema.artifactResource.artifactId, tool.artifactId));

  return c.json({
    resources: rows.filter(utils.isExposedResource).map(row => ({
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

  // No .limit(1): a website seed and the page indexed beneath it share a uri,
  // and taking whichever row came back first is how the same uri answered with
  // text on one surface and "no content" on another. Filter, then take one.
  const matches = await db
    .create(c)
    .select()
    .from(db.schema.artifactResource)
    .where(
      and(
        eq(db.schema.artifactResource.artifactId, tool.artifactId),
        eq(db.schema.artifactResource.uri, parsed.data.uri)
      )
    );

  const resource = matches.find(row => utils.isExposedResource(row));

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
 * Write a resource on the artifact from inside a running script.
 *
 * The counterpart to sendFile, and the reason it is worth having: sendFile takes
 * URIs and never bytes, so without this a tool could only deliver a file that
 * already existed. "Build the report, then email it" is the flow a tool author
 * reaches for first, and it needs a way to produce the report.
 *
 * No connection allow-list here — this writes to the artifact's own resources,
 * which the artifact scope already bounds. What it is gated on instead is the
 * tool's declared `resourceAccess`: `own` (the default) confines it to what a
 * script wrote, `all` lets it replace anything on the artifact.
 *
 * `index: true` puts the result in the search corpus. Off by default, because
 * content the assistant answers other people's questions from should be a
 * decision rather than a side effect of writing a file.
 */
const createResource = async (c: Context<AppEnv>) => {
  const tool = c.get('tool');
  const body = await c.req.json().catch(() => ({}));
  const parsed =
    utils.Schema.CUSTOM_CODE_BROKER_RESOURCE_CREATE.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error:
          parsed.error.issues[0]?.message ||
          'A title and either content or bytes are required'
      },
      400
    );
  }

  const written = await writeResource(c, db.create(c), {
    artifactId: tool.artifactId,
    request: parsed.data,
    // From the authenticated tool row, never from the request — a script that
    // could name its own access level would not have one.
    access: tool.config.resourceAccess,
    canIndex: !!c.env.INDEX_QUEUE
  });

  if (!written.ok) {
    return c.json({ error: written.error }, written.status);
  }

  // After the row is committed, so the job can never arrive before the resource
  // it names exists. Failing to enqueue leaves a PENDING row rather than losing
  // the content, which the owner can re-index from the dashboard.
  if (written.indexResourceId && c.env.INDEX_QUEUE) {
    await c.env.INDEX_QUEUE.send({ resourceId: written.indexResourceId });
  }

  return c.json({ resource: written.resource });
};

/**
 * Remove a resource a script created.
 *
 * Gated on the same declared access the write path uses, and idempotent: a uri
 * with nothing behind it answers `deleted: false` rather than an error, so a
 * cleanup that runs twice does not fail the second time. Removing a resource's
 * children is opt-in — see deleteResource for why it cannot be implied.
 */
const deleteResource = async (c: Context<AppEnv>) => {
  const tool = c.get('tool');
  const body = await c.req.json().catch(() => ({}));
  const parsed =
    utils.Schema.CUSTOM_CODE_BROKER_RESOURCE_DELETE.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'A resource uri is required' }, 400);
  }

  const removed = await removeResource(c, db.create(c), {
    artifactId: tool.artifactId,
    uri: parsed.data.uri,
    children: parsed.data.children,
    access: tool.config.resourceAccess
  });

  if (!removed.ok) {
    return c.json({ error: removed.error }, removed.status);
  }

  return c.json({ resource: removed.resource });
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

// The manifest entry of the function a call token names, in that version.
const functionEntry = async (
  executor: ReturnType<typeof db.create>,
  versionId: string,
  name: string
) => {
  const [version] = await executor
    .select({ tools: db.schema.artifactToolVersion.tools })
    .from(db.schema.artifactToolVersion)
    .where(eq(db.schema.artifactToolVersion.id, versionId))
    .limit(1);
  const entry = (Array.isArray(version?.tools) ? version.tools : [])
    .map(raw => utils.Schema.CUSTOM_CODE_TOOL.safeParse(raw))
    .find(result => result.success && result.data.name === name);
  return entry?.success ? entry.data : null;
};

/**
 * One ctx.data call: describe, query, write or run a named query on the
 * project's own database.
 *
 * The token decides the project, so a function only ever reaches its own
 * project's database, through the same object methods the Data API calls.
 * Which function is calling comes from the call token the dispatcher signed
 * for this run, never from the script: one script serves every function, and
 * a read-only one could otherwise say it was another. Writes are recorded as
 * `function:<name>`, and its manifest's `data` narrows what it may do:
 * `access: "read"` refuses writes, and `tables` hides every other table from
 * it in the engine, through relations and filters too.
 */
const data = async (c: Context<AppEnv>) => {
  const tool = c.get('tool');
  const body = await c.req.json().catch(() => ({}));
  const parsed = utils.Schema.CUSTOM_CODE_BROKER_DATA.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'ctx.data needs the call token, an operation and its arguments.'
      },
      400
    );
  }
  const { call, op, args } = parsed.data;
  const secret = utils.getEnv(c, utils.constants.CUSTOM_CODE_TOKEN_SECRET_ENV);
  const signed = secret
    ? await utils.verifyCustomCodeCallToken(call, secret)
    : null;
  if (
    !signed ||
    signed.artifactId !== tool.artifactId ||
    signed.versionId !== tool.versionId
  ) {
    return c.json(
      {
        error:
          'ctx.data works only inside a function call Ganju started, while it runs.',
        code: 'forbidden'
      },
      403
    );
  }
  const name = signed.tool;
  const dbInstance = db.create(c);

  const entry = await functionEntry(dbInstance, tool.versionId, name);
  if (!entry) {
    return c.json({ error: `"${name}" is not a function of this tool.` }, 403);
  }
  const narrowing = entry.data;

  const opened = await db.data.openArtifactDatabase(
    dbInstance,
    c.env.PROJECT_DATABASE,
    tool.artifactId
  );
  if (!opened) {
    return c.json(
      {
        error:
          "This project doesn't have a database. Create one on the Data page."
      },
      404
    );
  }
  // A run a trigger started writes as that trigger, so the trigger never
  // matches its own run's writes and a chain of them can be stopped.
  const caller = db.data.dataCaller(opened, {
    actor: signed.trigger ? `trigger:${signed.trigger.id}` : `function:${name}`,
    ...(signed.trigger ? { triggerDepth: signed.trigger.depth } : {}),
    ...(narrowing?.tables ? { tables: narrowing.tables } : {})
  });
  const tally = db.data.createDataUsageTally();

  try {
    let value: unknown;
    if (op === 'write') {
      if (narrowing?.access === 'read') {
        return c.json(
          {
            error: `${name} may only read the database (its "data.access" is "read").`,
            code: 'forbidden'
          },
          403
        );
      }
      // Functions are often written by a model: a made-up uri is refused.
      await db.data.assertFileUrisExist(
        dbInstance,
        tool.artifactId,
        () =>
          db.data.callData('schemaRead', () => opened.stub.schemaRead(), tally, {
            retryRead: true
          }),
        (args as { operations?: unknown } | undefined)?.operations
      );
      value = await db.data.callData(
        'write',
        () => opened.stub.write(caller, args),
        tally
      );
    } else if (op === 'query') {
      value = await db.data.callData(
        'query',
        () => opened.stub.query(caller, args),
        tally,
        {
          retryRead: true
        }
      );
    } else if (op === 'run') {
      value = await db.data.callData(
        'runQuery',
        () => opened.stub.runQuery(caller, args as { name: string }),
        tally,
        { retryRead: true }
      );
    } else {
      value = await db.data.callData(
        'describe',
        () => opened.stub.describe(caller, args),
        tally,
        {
          retryRead: true
        }
      );
    }
    // File columns come back with their item's title and type.
    if (op !== 'describe') {
      value = await db.data.resolveFileValues(dbInstance, tool.artifactId, value);
    }
    return c.json({ result: value });
  } catch (error) {
    if (error instanceof DataError) {
      return c.json(
        {
          error: error.message,
          code: error.code,
          ...(error.details ? { details: error.details } : {})
        },
        error.status
      );
    }
    throw error;
  } finally {
    c.executionCtx.waitUntil(
      db.data
        .recordDataUsage(
          dbInstance,
          opened.row.organizationId,
          opened.row.id,
          tally
        )
        .catch(error => console.error('data-usage-record-failed', error))
    );
  }
};

const NOT_IN_A_RUN =
  'ctx.channels works only inside a function call Ganju started, while it runs.';

// The function a ctx.channels call comes from, named by its call token as
// for ctx.data.
const channelCaller = async (c: Context<AppEnv>, call: string) => {
  const tool = c.get('tool');
  const secret = utils.getEnv(c, utils.constants.CUSTOM_CODE_TOKEN_SECRET_ENV);
  const signed = secret
    ? await utils.verifyCustomCodeCallToken(call, secret)
    : null;
  if (
    !signed ||
    signed.artifactId !== tool.artifactId ||
    signed.versionId !== tool.versionId
  ) {
    return { error: c.json({ error: NOT_IN_A_RUN, code: 'forbidden' }, 403) };
  }
  // Only a function that asked for it in its manifest.
  const entry = await functionEntry(db.create(c), tool.versionId, signed.tool);
  if (entry?.channels !== true) {
    return {
      error: c.json(
        {
          error: `${signed.tool} can't use ctx.channels: turn on "channels" for it, in ganju.json or on the Tools page, and deploy again.`,
          code: 'forbidden'
        },
        403
      )
    };
  }
  return { signed };
};

const channelError = (c: Context<AppEnv>, error: unknown) => {
  if (error instanceof db.channels.ChannelSendError) {
    return c.json({ error: error.message }, error.status);
  }
  throw error;
};

/**
 * ctx.channels.send: a message to a customer the bot has spoken with, on the
 * channel they wrote from. The participant must be on one of this project's
 * channels; the channel's tokens never reach the script. Recorded on their
 * conversation, so the bot's next turn knows they were told.
 */
const channelsSend = async (c: Context<AppEnv>) => {
  const parsed = utils.Schema.CUSTOM_CODE_BROKER_CHANNELS_SEND.safeParse(
    await c.req.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return c.json(
      {
        error:
          'ctx.channels.send needs a participantId and text, a template, or both.'
      },
      400
    );
  }
  const caller = await channelCaller(c, parsed.data.call);
  if (caller.error) return caller.error;
  const { signed } = caller;
  try {
    const result = await db.channels.sendToParticipant(db.create(c), {
      artifactId: signed.artifactId,
      encryptionKey: utils.getCredentialEncryptionKey(c),
      participantId: parsed.data.participantId,
      text: parsed.data.text ?? null,
      template: parsed.data.template ?? null,
      source: { kind: 'function', name: signed.tool }
    });
    return c.json({ result });
  } catch (error) {
    return channelError(c, error);
  }
};

// ctx.channels.post: a message to a chat the bot is in, such as the staff
// group, on one of this project's channels.
const channelsPost = async (c: Context<AppEnv>) => {
  const parsed = utils.Schema.CUSTOM_CODE_BROKER_CHANNELS_POST.safeParse(
    await c.req.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return c.json(
      { error: 'ctx.channels.post needs a channelId, a chatId and text.' },
      400
    );
  }
  const caller = await channelCaller(c, parsed.data.call);
  if (caller.error) return caller.error;
  const { signed } = caller;
  try {
    const result = await db.channels.postToChat(db.create(c), {
      artifactId: signed.artifactId,
      encryptionKey: utils.getCredentialEncryptionKey(c),
      channelId: parsed.data.channelId,
      chatId: String(parsed.data.chatId),
      text: parsed.data.text,
      source: { kind: 'function', name: signed.tool }
    });
    return c.json({ result });
  } catch (error) {
    return channelError(c, error);
  }
};

// ctx.channels.templates: the approved WhatsApp templates of this project's
// channels, so a function can choose one to send.
const channelsTemplates = async (c: Context<AppEnv>) => {
  const parsed = utils.Schema.CUSTOM_CODE_BROKER_CHANNELS_TEMPLATES.safeParse(
    await c.req.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return c.json({ error: NOT_IN_A_RUN, code: 'forbidden' }, 403);
  }
  const caller = await channelCaller(c, parsed.data.call);
  if (caller.error) return caller.error;
  const result = await db.channels.listApprovedTemplates(
    db.create(c),
    caller.signed.artifactId
  );
  return c.json({ result });
};

export const BrokerController = {
  connection,
  secret,
  searchResources,
  listResources,
  readResource,
  createResource,
  deleteResource,
  sendFile,
  data,
  channelsSend,
  channelsPost,
  channelsTemplates
};
