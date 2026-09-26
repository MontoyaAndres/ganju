import type { Bindings } from '../types';
import type {
  IndexJob,
  CrawlDiscoverJob,
  GdriveDiscoverJob,
  GdriveFileJob,
  OnedriveDiscoverJob,
  OnedriveFileJob
} from '../queue';

export const enqueueIndex = async (
  env: Bindings,
  resourceIds: string | string[]
): Promise<void> => {
  const ids = Array.isArray(resourceIds) ? resourceIds : [resourceIds];
  if (ids.length === 0) return;
  if (!env.INDEX_QUEUE) return;

  if (ids.length === 1) {
    await env.INDEX_QUEUE.send({ resourceId: ids[0] } satisfies IndexJob);
    return;
  }

  await env.INDEX_QUEUE.sendBatch(
    ids.map(id => ({ body: { resourceId: id } satisfies IndexJob }))
  );
};

export const enqueueCrawlDiscover = async (
  env: Bindings,
  resourceId: string
): Promise<void> => {
  if (!env.CRAWL_DISCOVER_QUEUE) return;
  await env.CRAWL_DISCOVER_QUEUE.send({
    resourceId
  } satisfies CrawlDiscoverJob);
};

export const enqueueGdriveDiscover = async (
  env: Bindings,
  resourceIds: string | string[]
): Promise<void> => {
  const ids = Array.isArray(resourceIds) ? resourceIds : [resourceIds];
  if (ids.length === 0) return;
  if (!env.GDRIVE_DISCOVER_QUEUE) return;

  if (ids.length === 1) {
    await env.GDRIVE_DISCOVER_QUEUE.send({
      resourceId: ids[0]
    } satisfies GdriveDiscoverJob);
    return;
  }

  await env.GDRIVE_DISCOVER_QUEUE.sendBatch(
    ids.map(id => ({
      body: { resourceId: id } satisfies GdriveDiscoverJob
    }))
  );
};

export const enqueueGdriveFile = async (
  env: Bindings,
  resourceIds: string | string[],
  options: { onlyIfChanged?: boolean } = {}
): Promise<void> => {
  const ids = Array.isArray(resourceIds) ? resourceIds : [resourceIds];
  if (ids.length === 0) return;
  if (!env.GDRIVE_FILE_QUEUE) return;

  const body = (resourceId: string): GdriveFileJob =>
    options.onlyIfChanged ? { resourceId, onlyIfChanged: true } : { resourceId };

  if (ids.length === 1) {
    await env.GDRIVE_FILE_QUEUE.send(body(ids[0]));
    return;
  }

  await env.GDRIVE_FILE_QUEUE.sendBatch(ids.map(id => ({ body: body(id) })));
};

export const enqueueOnedriveDiscover = async (
  env: Bindings,
  resourceIds: string | string[]
): Promise<void> => {
  const ids = Array.isArray(resourceIds) ? resourceIds : [resourceIds];
  if (ids.length === 0) return;
  if (!env.ONEDRIVE_DISCOVER_QUEUE) return;

  if (ids.length === 1) {
    await env.ONEDRIVE_DISCOVER_QUEUE.send({
      resourceId: ids[0]
    } satisfies OnedriveDiscoverJob);
    return;
  }

  await env.ONEDRIVE_DISCOVER_QUEUE.sendBatch(
    ids.map(id => ({
      body: { resourceId: id } satisfies OnedriveDiscoverJob
    }))
  );
};

export const enqueueOnedriveFile = async (
  env: Bindings,
  resourceIds: string | string[],
  options: { onlyIfChanged?: boolean } = {}
): Promise<void> => {
  const ids = Array.isArray(resourceIds) ? resourceIds : [resourceIds];
  if (ids.length === 0) return;
  if (!env.ONEDRIVE_FILE_QUEUE) return;

  const body = (resourceId: string): OnedriveFileJob =>
    options.onlyIfChanged ? { resourceId, onlyIfChanged: true } : { resourceId };

  if (ids.length === 1) {
    await env.ONEDRIVE_FILE_QUEUE.send(body(ids[0]));
    return;
  }

  await env.ONEDRIVE_FILE_QUEUE.sendBatch(ids.map(id => ({ body: body(id) })));
};
