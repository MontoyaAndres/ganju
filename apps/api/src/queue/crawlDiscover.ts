import type { ExecutionContext, MessageBatch } from '@cloudflare/workers-types';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';
import { eq, and, inArray, ne, sql } from 'drizzle-orm';
import { getResourceHandler } from '@ganju/containers';

import { markResourceFailed, reportQueueError } from './shared';

import type { Bindings } from '../types';
import type { PageJob } from './crawlPage';

export interface CrawlDiscoverJob {
  resourceId: string;
}

interface DiscoveredPage {
  url: string;
  title?: string;
  depth: number;
}

const discoverOne = async (
  env: Bindings,
  resourceId: string
): Promise<void> => {
  const dbInstance = db.create({ env });

  const [resource] = await dbInstance
    .select()
    .from(db.schema.artifactResource)
    .where(eq(db.schema.artifactResource.id, resourceId))
    .limit(1);

  if (!resource) {
    console.warn(
      `[${utils.constants.SERVICE_NAME_API}] crawlDiscover: resource ${resourceId} not found`
    );
    return;
  }

  if (resource.sourceType !== utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE) {
    console.warn(
      `[${utils.constants.SERVICE_NAME_API}] crawlDiscover: resource ${resourceId} is not a ${utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE}; skipping`
    );
    return;
  }

  const config = (resource.crawlConfig || {}) as {
    maxPages?: number;
    maxDepth?: number;
  };
  const maxPages = config.maxPages ?? utils.constants.CRAWL_DEFAULT_MAX_PAGES;
  const maxDepth = config.maxDepth ?? utils.constants.CRAWL_DEFAULT_MAX_DEPTH;

  const handler = getResourceHandler(env);
  const response = await handler.fetch(
    'http://resource-handler/crawl/discover',
    {
      method: 'POST',
      headers: { 'content-type': utils.constants.MIMETYPE_APPLICATION_JSON },
      body: JSON.stringify({ url: resource.uri, maxPages, maxDepth })
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `resource-handler /crawl/discover failed (${response.status}) for ${resourceId}: ${detail}`
    );
  }

  const payload: {
    pages: DiscoveredPage[];
    seed: Record<string, unknown> | null;
  } = await response.json();
  const pages = payload.pages || [];
  const seed = payload.seed || null;

  const mergedParentMetadata = {
    ...(resource.metadata as Record<string, unknown> | null),
    ...(seed ? { seo: seed } : {}),
    lastSyncedAt: new Date().toISOString()
  };

  // The pages this site already has. A first crawl has none; a sync re-crawls
  // every one of them, including any this discovery didn't reach — that is how
  // an edited page gets re-indexed and a deleted one gets noticed (the page job
  // re-embeds only when the text changed, and removes a page that answers
  // 404/410). A page is never removed for being missing from discovery alone:
  // maxPages and link changes make that an unreliable signal.
  const knownPages = await dbInstance
    .select({ id: db.schema.artifactResource.id })
    .from(db.schema.artifactResource)
    .where(eq(db.schema.artifactResource.parentResourceId, resource.id));

  const candidateUris = Array.from(new Set(pages.map(p => p.url)));
  const existingRows =
    candidateUris.length > 0
      ? await dbInstance
          .select({ uri: db.schema.artifactResource.uri })
          .from(db.schema.artifactResource)
          .where(
            and(
              eq(db.schema.artifactResource.artifactId, resource.artifactId),
              inArray(db.schema.artifactResource.uri, candidateUris),
              ne(db.schema.artifactResource.id, resource.id)
            )
          )
      : [];
  const existingUriSet = new Set(existingRows.map(r => r.uri));
  const seenUris = new Set<string>();
  const newPages = pages.filter(p => {
    if (existingUriSet.has(p.url)) return false;
    if (seenUris.has(p.url)) return false;
    seenUris.add(p.url);
    return true;
  });

  // Cloudflare Queues caps sendBatch at 100 messages / 256 KB per call, so
  // pages are sent in chunks to avoid "Payload Too Large" on large crawls.
  const enqueuePages = async (ids: string[]): Promise<void> => {
    if (!env.CRAWL_PAGE_QUEUE || ids.length === 0) return;
    const messages = ids.map(id => ({
      body: { resourceId: id, parentResourceId: resource.id } satisfies PageJob
    }));
    const batchSize = utils.constants.CRAWL_PAGE_QUEUE_BATCH_SIZE;
    for (let i = 0; i < messages.length; i += batchSize) {
      await env.CRAWL_PAGE_QUEUE.sendBatch(messages.slice(i, i + batchSize));
    }
  };

  if (newPages.length === 0) {
    await dbInstance
      .update(db.schema.artifactResource)
      .set({
        status: utils.constants.STATUS_COMPLETED,
        metadata: mergedParentMetadata
      })
      .where(eq(db.schema.artifactResource.id, resourceId));
    await enqueuePages(knownPages.map(p => p.id));
    return;
  }

  const inserted = await dbInstance.transaction(async tx => {
    const rows = await tx
      .insert(db.schema.artifactResource)
      .values(
        newPages.map(page => ({
          title: page.title || page.url,
          uri: page.url,
          type: utils.constants.RESOURCE_TYPE_STATIC,
          sourceType: utils.constants.RESOURCE_SOURCE_TYPE_WEBSITE,
          status: utils.constants.STATUS_PENDING,
          mimeType: utils.constants.MIMETYPE_TEXT,
          encoding: utils.constants.ENCODING_UTF8,
          artifactId: resource.artifactId,
          parentResourceId: resource.id,
          metadata: { depth: page.depth }
        }))
      )
      .returning({ id: db.schema.artifactResource.id });

    await tx
      .update(db.schema.artifact)
      .set({
        artifactResourceCount: sql`(${db.schema.artifact.artifactResourceCount}::int + ${newPages.length})::int`
      })
      .where(eq(db.schema.artifact.id, resource.artifactId));

    await tx
      .update(db.schema.artifactResource)
      .set({
        childResourceCount: knownPages.length + newPages.length,
        status: utils.constants.STATUS_PENDING,
        metadata: mergedParentMetadata
      })
      .where(eq(db.schema.artifactResource.id, resourceId));

    return rows;
  });

  await enqueuePages([
    ...inserted.map(({ id }) => id),
    ...knownPages.map(p => p.id)
  ]);
};

export const handleCrawlDiscoverBatch = async (
  batch: MessageBatch<CrawlDiscoverJob>,
  env: Bindings,
  _ctx: ExecutionContext
): Promise<void> => {
  await utils.processQueueBatch(batch, {
    process: async ({ resourceId }) => discoverOne(env, resourceId),
    onError: async (error, { resourceId }, queueName) => {
      await reportQueueError(env, '/crawl/discover', error, {
        resourceId,
        queue: queueName
      });
      await markResourceFailed(env, resourceId);
    }
  });
};
