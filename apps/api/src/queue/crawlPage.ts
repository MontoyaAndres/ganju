import type { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';
import { db } from '@ganju/db';
import { utils, ExtractedDocument } from '@ganju/utils';
import { eq, and, ne, sql } from 'drizzle-orm';
import { getResourceHandler } from '@ganju/containers';

import { reindexResourceChunks } from '../utils';
import { markResourceFailed, reportQueueError } from './shared';

import type { Bindings } from '../types';

export interface PageJob {
  resourceId: string;
  parentResourceId?: string;
}

interface CrawlPageResponse {
  url: string;
  title?: string;
  description?: string;
  mimeType: string;
  encoding: string;
  size: number;
  renderer: 'cheerio' | 'playwright';
  text: string;
  seo: Record<string, unknown>;
  documents: ExtractedDocument[];
}

const processPage = async (env: Bindings, job: PageJob): Promise<void> => {
  const source = { env };
  const dbInstance = db.create(source);

  const [resource] = await dbInstance
    .select()
    .from(db.schema.artifactResource)
    .where(eq(db.schema.artifactResource.id, job.resourceId))
    .limit(1);

  if (!resource) {
    console.warn(
      `[${utils.constants.SERVICE_NAME_API}] crawlPage: resource ${job.resourceId} not found`
    );
    return;
  }

  const handler = getResourceHandler(env);
  const response = await handler.fetch('http://resource-handler/crawl/page', {
    method: 'POST',
    headers: { 'content-type': utils.constants.MIMETYPE_APPLICATION_JSON },
    body: JSON.stringify({ url: resource.uri })
  });

  // The site answered 404/410: the page is gone, so is our copy. Any other
  // failure throws below and leaves the indexed copy as it was.
  if (response.status === 410) {
    await response.body?.cancel();
    await removeGonePage(env, resource);
    await maybeCompleteParent(env, resource.parentResourceId);
    return;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `resource-handler /crawl/page failed (${response.status}) for ${job.resourceId}: ${detail}`
    );
  }

  const payload: CrawlPageResponse = await response.json();

  // A sync re-crawls every page of the site; only one whose text changed is
  // worth new embeddings. The hash is of the extracted text, not the HTML, so
  // a rotating ad or a new nonce in the markup doesn't count as a change.
  // `indexedHash` is the text the page's chunks were built from — the sync
  // that put the page back to PENDING kept it — and the older pairing of
  // `contentHash` with COMPLETED covers a page no sync has reset yet.
  const previousMetadata = resource.metadata as Record<string, unknown> | null;
  const contentHash = await utils.sha256Hex(payload.text);
  if (
    previousMetadata?.indexedHash === contentHash ||
    (previousMetadata?.contentHash === contentHash &&
      resource.status === utils.constants.STATUS_COMPLETED)
  ) {
    if (resource.status !== utils.constants.STATUS_COMPLETED) {
      await dbInstance
        .update(db.schema.artifactResource)
        .set({ status: utils.constants.STATUS_COMPLETED })
        .where(eq(db.schema.artifactResource.id, resource.id));
    }
    await maybeCompleteParent(
      env,
      job.parentResourceId || resource.parentResourceId
    );
    return;
  }

  // From here the chunks are rebuilt, and a rebuild cut short leaves them
  // half old, half new: drop `indexedHash` until it finishes, so a failure
  // can't pass the page off as indexed.
  const { indexedHash: _previousIndexedHash, ...keptMetadata } =
    previousMetadata ?? {};
  await dbInstance
    .update(db.schema.artifactResource)
    .set({
      content: payload.text,
      title: payload.title || resource.title,
      description: payload.description ?? resource.description,
      mimeType: utils.constants.MIMETYPE_TEXT,
      encoding: payload.encoding || utils.constants.ENCODING_UTF8,
      size: payload.size,
      metadata: {
        ...keptMetadata,
        seo: payload.seo,
        renderer: payload.renderer,
        contentHash
      }
    })
    .where(eq(db.schema.artifactResource.id, resource.id));

  await reindexResourceChunks(source, {
    id: resource.id,
    artifactId: resource.artifactId,
    title: payload.title || resource.title,
    description: payload.description ?? resource.description,
    uri: payload.url,
    mimeType: utils.constants.MIMETYPE_TEXT,
    fileName: null,
    content: payload.text,
    documents: payload.documents
  });

  // Merged in SQL: the reindex writes its own metadata keys.
  await dbInstance
    .update(db.schema.artifactResource)
    .set({
      status: utils.constants.STATUS_COMPLETED,
      metadata: sql`(coalesce(${db.schema.artifactResource.metadata}::jsonb, '{}'::jsonb) || jsonb_build_object('indexedHash', ${contentHash}::text))::json`
    })
    .where(eq(db.schema.artifactResource.id, resource.id));

  await maybeCompleteParent(
    env,
    job.parentResourceId || resource.parentResourceId
  );
};

// Remove a page the site no longer serves, and take it off the counts its
// parent and the artifact keep. Chunks go with it (they cascade).
const removeGonePage = async (
  env: Bindings,
  resource: { id: string; artifactId: string; parentResourceId: string | null }
): Promise<void> => {
  // Only a page under a site. The seed is the crawl's starting point and is
  // never fetched by this job.
  if (!resource.parentResourceId) return;
  const parentResourceId = resource.parentResourceId;
  const dbInstance = db.create({ env });
  await dbInstance.transaction(async tx => {
    const deleted = await tx
      .delete(db.schema.artifactResource)
      .where(eq(db.schema.artifactResource.id, resource.id))
      .returning({ id: db.schema.artifactResource.id });
    if (deleted.length === 0) return;

    await tx
      .update(db.schema.artifact)
      .set({
        artifactResourceCount: sql`GREATEST(${db.schema.artifact.artifactResourceCount}::int - 1, 0)`
      })
      .where(eq(db.schema.artifact.id, resource.artifactId));

    await tx
      .update(db.schema.artifactResource)
      .set({
        childResourceCount: sql`GREATEST(${db.schema.artifactResource.childResourceCount}::int - 1, 0)`
      })
      .where(eq(db.schema.artifactResource.id, parentResourceId));
  });
};

const maybeCompleteParent = async (
  env: Bindings,
  parentResourceId: string | null | undefined
): Promise<void> => {
  if (!parentResourceId) return;
  const dbInstance = db.create({ env });

  const pending = await dbInstance
    .select({ id: db.schema.artifactResource.id })
    .from(db.schema.artifactResource)
    .where(
      and(
        eq(db.schema.artifactResource.parentResourceId, parentResourceId),
        ne(db.schema.artifactResource.status, utils.constants.STATUS_COMPLETED),
        ne(db.schema.artifactResource.status, utils.constants.STATUS_FAILED)
      )
    )
    .limit(1);

  if (pending.length === 0) {
    await dbInstance
      .update(db.schema.artifactResource)
      .set({ status: utils.constants.STATUS_COMPLETED })
      .where(eq(db.schema.artifactResource.id, parentResourceId));
  }
};

export const handleCrawlPageBatch = async (
  batch: MessageBatch<PageJob>,
  env: Bindings,
  _ctx: ExecutionContext
): Promise<void> => {
  await utils.processQueueBatch(batch, {
    process: async job => processPage(env, job),
    onError: async (error, job, queueName, { final }) => {
      await reportQueueError(env, '/crawl/page', error, {
        resourceId: job.resourceId,
        queue: queueName
      });
      // A retry may still succeed; until the last one the page stays PENDING
      // and its site keeps waiting for it.
      if (!final) return;
      // A page that held an indexed copy goes back to COMPLETED with it; one
      // that never had one is FAILED.
      await markResourceFailed(env, job.resourceId);
      // Either way it counts as finished for its site. Without this, a site
      // whose last page failed would stay PENDING for good: only a page that
      // succeeds checks whether its siblings are done.
      await maybeCompleteParent(env, job.parentResourceId).catch(
        () => undefined
      );
    }
  });
};
