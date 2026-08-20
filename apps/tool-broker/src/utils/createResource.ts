import { Context } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

// types
import type { Database, DbExecutor } from '@ganju/db';
import type { CustomCodeCreateResource } from '@ganju/utils';
import type { AppEnv } from '../types';

// How far this tool's resource writes reach, from its stored config. Passed in
// rather than read here: it is the caller's job to take it from the row the
// broker authenticated, never from anything the script sent.
export type ResourceAccess = 'own' | 'all';

export interface CreatedResource {
  uri: string;
  title: string;
  description?: string;
  mimeType: string | null;
  size: number;
  // False when an earlier resource at the same uri was replaced. A script
  // re-running a daily report wants to know which happened.
  created: boolean;
  // Whether it was queued for the search corpus. Not "is it searchable yet" —
  // indexing is asynchronous, and the row reads PENDING until it lands.
  indexed: boolean;
}

export type CreateResourceResult =
  | { ok: true; resource: CreatedResource; indexResourceId: string | null }
  | { ok: false; status: 400 | 404 | 409; error: string };

export interface DeletedResource {
  uri: string;
  // False when there was nothing at that uri. Delete is idempotent — see below.
  deleted: boolean;
  // How many rows went, the named one plus any descendants.
  count: number;
}

export type DeleteResourceResult =
  | { ok: true; resource: DeletedResource }
  | { ok: false; status: 409; error: string };

/**
 * The organization a script's artifact belongs to.
 *
 * The broker authenticates an ARTIFACT — that is all its token carries — but the
 * storage quotas are organization-wide, so every write costs one join to find
 * out whose budget is being spent.
 */
const resolveOrganization = async (
  dbInstance: Database,
  artifactId: string
): Promise<{ organizationId: string; projectId: string } | null> => {
  const [row] = await dbInstance
    .select({
      organizationId: db.schema.project.organizationId,
      projectId: db.schema.project.id
    })
    .from(db.schema.artifact)
    .innerJoin(
      db.schema.project,
      eq(db.schema.project.id, db.schema.artifact.projectId)
    )
    .where(eq(db.schema.artifact.id, artifactId))
    .limit(1);

  return row ?? null;
};

/**
 * May this tool touch these rows?
 *
 * `own` is the floor: every row at the uri has to carry the custom-code marker.
 * Checked across ALL of them rather than the addressable one, because a crawl
 * seed shares its page's uri and neither belongs to the script. `all` is granted
 * in the tool's config, so this returns true and the artifact scope is the only
 * remaining boundary.
 */
const mayTouch = (
  rows: Array<{ sourceType: string }>,
  access: ResourceAccess
): boolean =>
  access === utils.constants.CUSTOM_CODE_RESOURCE_ACCESS_ALL ||
  rows.every(
    row => row.sourceType === utils.constants.RESOURCE_SOURCE_TYPE_CUSTOM_CODE
  );

/**
 * Drop these resources' chunks and report the embedded bytes freed.
 *
 * `artifactResourceEmbeddedSize` is a denormalised total and the figure the
 * plan's storage quota reads, so anything that removes chunks owes it an
 * update. Two callers need this: deleting a resource that was indexed, and
 * replacing an indexed one with a version that is not — where leaving the old
 * chunks behind would keep answering searches with content the row no longer
 * holds.
 */
const dropChunks = async (
  tx: DbExecutor,
  resourceIds: string[]
): Promise<number> => {
  if (resourceIds.length === 0) return 0;

  const [{ freedBytes }] = await tx
    .select({
      freedBytes: sql<number>`coalesce(sum(octet_length(${db.schema.artifactResourceChunk.content})), 0)::bigint`
    })
    .from(db.schema.artifactResourceChunk)
    .where(inArray(db.schema.artifactResourceChunk.resourceId, resourceIds));

  await tx
    .delete(db.schema.artifactResourceChunk)
    .where(inArray(db.schema.artifactResourceChunk.resourceId, resourceIds));

  return Number(freedBytes) || 0;
};

/**
 * Write a resource on behalf of a running script.
 *
 * This is the one place in the platform where untrusted code adds a row to
 * artifact_resource, so three rules hold it in:
 *
 *  1. **Provenance.** Every row written here carries the custom-code source
 *     type, and a uri already held by a row WITHOUT it is refused rather than
 *     replaced. That is what stops a tool from overwriting a document its owner
 *     uploaded — checked against every row at that uri, not just the addressable
 *     one, because a crawl seed shares its page's uri and neither belongs to the
 *     script.
 *  2. **Quota.** A script's bytes are the organization's bytes. The delta is
 *     what's charged, so a report that replaces last week's costs nothing.
 *  3. **Not indexed.** The row is written COMPLETED and never enqueued, so
 *     script output stays out of the RAG corpus the channel runner answers from.
 *     It is listable and sendable; it is not searchable.
 */
export const createResource = async (
  c: Context<AppEnv>,
  dbInstance: Database,
  input: {
    artifactId: string;
    request: CustomCodeCreateResource;
    access: ResourceAccess;
    // Absent on a deployment with no queue binding, which is what makes
    // `index: true` a refusal rather than a silent no-op.
    canIndex: boolean;
  }
): Promise<CreateResourceResult> => {
  const { request } = input;

  const owner = await resolveOrganization(dbInstance, input.artifactId);
  if (!owner) {
    return { ok: false, status: 404, error: 'Artifact not found' };
  }

  const uri = request.uri || utils.resourceUriFromTitle(request.title);

  // Deliberately unfiltered by isExposedResource: the question here is "does
  // anything already own this uri", and a seed row owns it just as much as the
  // page beneath it does.
  const existingRows = await dbInstance
    .select()
    .from(db.schema.artifactResource)
    .where(
      and(
        eq(db.schema.artifactResource.artifactId, input.artifactId),
        eq(db.schema.artifactResource.uri, uri)
      )
    );

  if (!mayTouch(existingRows, input.access)) {
    return {
      ok: false,
      status: 409,
      error: utils.constants.CUSTOM_CODE_RESOURCE_NOT_OWNED_MESSAGE
    };
  }

  // Newest wins if a duplicate ever appears — there is no unique constraint on
  // (artifactId, uri), and the crawler creates same-uri pairs deliberately.
  const existing = existingRows.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )[0];

  const isText = request.content !== undefined;
  const bytes = isText
    ? new TextEncoder().encode(request.content)
    : utils.base64ToBytes(request.bytes!);
  const size = bytes.byteLength;

  if (request.index && !input.canIndex) {
    return {
      ok: false,
      status: 400,
      error: 'Search indexing is not available on this deployment.'
    };
  }

  // The delta, not the total: replacing a 2MB report with another 2MB report
  // spends nothing, and charging the full size would make a daily job fail on
  // its own history.
  await db.plan.assertRawStorageQuota(
    dbInstance,
    owner.organizationId,
    size - (existing?.size ?? 0)
  );

  const mimeType =
    request.mimeType ||
    (isText
      ? utils.constants.MIMETYPE_TEXT
      : utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM);

  // Inline text always chunks; a stored file only does if the extractor can
  // read it. Without this the job runs, produces nothing, and leaves a resource
  // that looks indexed and never matches a search.
  if (request.index && !isText && !utils.isEmbeddableMimeType(mimeType)) {
    return {
      ok: false,
      status: 400,
      error: utils.constants.CUSTOM_CODE_RESOURCE_NOT_EMBEDDABLE_MESSAGE
    };
  }

  // The embedded-content ceiling is a separate budget from raw storage, and the
  // expensive one. Only indexing spends it, so only indexing is gated on it.
  // Approximate by design: this resource's embedded size isn't known until the
  // job runs, so this is a "you're full" gate rather than a byte-exact one.
  if (request.index) {
    await db.plan.assertEmbeddedStorageQuota(dbInstance, owner.organizationId);
  }

  const fileName = request.fileName || null;

  let fileKey: string | null = null;
  const bucket = c.env.STORAGE_BUCKET;

  if (!isText) {
    if (!bucket) {
      return {
        ok: false,
        status: 404,
        error: 'File storage is not available on this deployment'
      };
    }
    // Same key layout the dashboard's upload writes, so one bucket prefix holds
    // an artifact's files however they got there. formatFilename appends a
    // timestamp, which is what keeps a replacement from writing over the object
    // a request already in flight is reading.
    fileKey = `organizations/${owner.organizationId}/projects/${owner.projectId}/resources/${input.artifactId}/${utils.formatFilename(
      fileName || request.title
    )}`;
    await bucket.put(fileKey, bytes, {
      httpMetadata: { contentType: mimeType }
    });
  }

  const values = {
    title: request.title,
    uri,
    type: utils.constants.RESOURCE_TYPE_STATIC,
    sourceType: utils.constants.RESOURCE_SOURCE_TYPE_CUSTOM_CODE,
    // An unindexed resource is finished the moment it is written — nothing is
    // coming for it, and PENDING would leave it looking stuck forever. One
    // queued for indexing is genuinely pending until the job flips it.
    status: request.index
      ? utils.constants.STATUS_PENDING
      : utils.constants.STATUS_COMPLETED,
    description: request.description ?? null,
    mimeType,
    content: isText ? request.content! : null,
    size,
    fileKey,
    fileName
  };

  const previousFileKey = existing?.fileKey ?? null;

  // The lookup above and the write below are deliberately not one transaction:
  // the R2 put sits between them, and a transaction held open across it would
  // pin a Hyperdrive connection for the length of an upload. Two concurrent
  // creates naming the same new uri can therefore both insert — the newest-wins
  // read above is what keeps that from being a lasting inconsistency, and it is
  // the same exposure the dashboard's own create path carries.
  let resourceId: string;

  if (existing) {
    resourceId = existing.id;
    await dbInstance.transaction(async tx => {
      await tx
        .update(db.schema.artifactResource)
        .set(values)
        .where(eq(db.schema.artifactResource.id, existing.id));

      // Replacing an indexed resource with an unindexed one has to take the old
      // chunks with it. Left behind, they keep answering searches with content
      // this row no longer holds — the worst kind of stale, because nothing
      // about the resource looks wrong. When the replacement IS indexed the job
      // handles it instead: it drops and rebuilds the chunks itself, and applies
      // the net size change in one place rather than two.
      if (!request.index) {
        const freed = await dropChunks(tx, [existing.id]);
        if (freed > 0) {
          await tx
            .update(db.schema.artifact)
            .set({
              artifactResourceEmbeddedSize: sql`greatest(${db.schema.artifact.artifactResourceEmbeddedSize}::bigint - ${freed}, 0)`
            })
            .where(eq(db.schema.artifact.id, input.artifactId));
        }
      }
    });
  } else {
    resourceId = await dbInstance.transaction(async tx => {
      const [inserted] = await tx
        .insert(db.schema.artifactResource)
        .values({ ...values, artifactId: input.artifactId })
        .returning({ id: db.schema.artifactResource.id });
      await tx
        .update(db.schema.artifact)
        .set({
          artifactResourceCount: sql`(${db.schema.artifact.artifactResourceCount}::int + 1)::int`
        })
        .where(eq(db.schema.artifact.id, input.artifactId));
      return inserted.id;
    });
  }

  // Only after the row stopped pointing at it. Deleting first would leave a
  // window where the resource is listed and its bytes are gone, and a failed
  // update would make that permanent.
  if (previousFileKey && previousFileKey !== fileKey && bucket) {
    await bucket.delete(previousFileKey).catch(() => {
      // An orphaned object costs storage we don't bill for; failing the call
      // over it would cost the user a report that was written correctly.
    });
  }

  return {
    ok: true,
    resource: {
      uri,
      title: values.title,
      description: values.description || undefined,
      mimeType,
      size,
      created: !existing,
      indexed: request.index
    },
    // Handed back rather than enqueued here: the queue binding lives on the
    // request env, and this function already takes enough of the context.
    indexResourceId: request.index ? resourceId : null
  };
};

/**
 * Remove a resource, and optionally everything beneath it.
 *
 * How far this reaches is the tool's declared `resourceAccess`, not the
 * script's request: `own` — the default — refuses anything a script did not
 * write, while `all` is a capability the artifact's owner granted at publish
 * time so a tool can prune a stale crawl or retire an imported folder.
 *
 * **Children are opt-in.** The FK cascades whether or not the caller asked, so a
 * plain delete on a parent would quietly take a 400-page crawl with it AND leave
 * the artifact's counters describing rows that no longer exist. Naming a parent
 * without `children: true` is refused instead.
 *
 * **Idempotent.** A uri with nothing behind it answers `deleted: false` rather
 * than 404. Deleting is the one call a script makes to reach a state rather than
 * to cause an effect ("make sure last week's report is gone"), and a cleanup
 * loop that throws on its second run is a cleanup loop nobody writes twice. A
 * uri the tool may not touch is still an error — that is a script doing the
 * wrong thing, not a script arriving somewhere it already was.
 */
export const deleteResource = async (
  c: Context<AppEnv>,
  dbInstance: Database,
  input: {
    artifactId: string;
    uri: string;
    children: boolean;
    access: ResourceAccess;
  }
): Promise<DeleteResourceResult> => {
  const roots = await dbInstance
    .select()
    .from(db.schema.artifactResource)
    .where(
      and(
        eq(db.schema.artifactResource.artifactId, input.artifactId),
        eq(db.schema.artifactResource.uri, input.uri)
      )
    );

  if (roots.length === 0) {
    return { ok: true, resource: { uri: input.uri, deleted: false, count: 0 } };
  }

  if (!mayTouch(roots, input.access)) {
    return {
      ok: false,
      status: 409,
      error: utils.constants.CUSTOM_CODE_RESOURCE_NOT_DELETABLE_MESSAGE
    };
  }

  // Breadth-first, the same walk the dashboard's own removal makes. It exists
  // for two reasons even when `children` is false: to know whether refusing is
  // necessary, and — once cascading — to collect the storage keys the FK cascade
  // would otherwise orphan, since Postgres knows nothing about R2.
  const rows = [...roots];
  const seen = new Set(roots.map(row => row.id));
  let frontier = [...seen];

  while (frontier.length > 0) {
    const children = await dbInstance
      .select()
      .from(db.schema.artifactResource)
      .where(inArray(db.schema.artifactResource.parentResourceId, frontier));

    const next: string[] = [];
    for (const child of children) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      next.push(child.id);
      rows.push(child);
    }
    frontier = next;
  }

  const descendants = rows.length - roots.length;

  if (descendants > 0 && !input.children) {
    return {
      ok: false,
      status: 409,
      error: utils.constants.CUSTOM_CODE_RESOURCE_HAS_CHILDREN_MESSAGE
    };
  }

  // Checked against the whole tree, not just the roots. Under `own` this can
  // only ever pass on a childless resource, which is the point — a script must
  // not reach a crawled page by naming something above it.
  if (!mayTouch(rows, input.access)) {
    return {
      ok: false,
      status: 409,
      error: utils.constants.CUSTOM_CODE_RESOURCE_NOT_DELETABLE_MESSAGE
    };
  }

  const ids = rows.map(row => row.id);
  const fileKeys = rows
    .map(row => row.fileKey)
    .filter((key): key is string => !!key);
  const parentIds = roots
    .map(row => row.parentResourceId)
    .filter((id): id is string => !!id && !seen.has(id));

  await dbInstance.transaction(async tx => {
    // Before the rows go: once they are gone the chunks have cascaded and there
    // is nothing left to measure. Under `own` this is always zero — script
    // output is never indexed unless it asked to be — but under `all` a pruned
    // crawl can free a great deal, and the embedded total is the figure the
    // storage quota reads.
    const freedBytes = await dropChunks(tx, ids);

    await tx
      .delete(db.schema.artifactResource)
      .where(inArray(db.schema.artifactResource.id, ids));

    await tx
      .update(db.schema.artifact)
      .set({
        // greatest() rather than a bare subtraction on both: these are
        // denormalised totals, and a delete must never be the thing that drives
        // one negative and makes every later quota read nonsense.
        artifactResourceCount: sql`greatest(${db.schema.artifact.artifactResourceCount}::int - ${ids.length}, 0)::int`,
        artifactResourceEmbeddedSize: sql`greatest(${db.schema.artifact.artifactResourceEmbeddedSize}::bigint - ${freedBytes}, 0)`
      })
      .where(eq(db.schema.artifact.id, input.artifactId));

    // A surviving parent's child count has to come down with them — only for
    // parents outside the deleted set, since the rest are going anyway.
    for (const parentId of parentIds) {
      await tx
        .update(db.schema.artifactResource)
        .set({
          childResourceCount: sql`greatest(${db.schema.artifactResource.childResourceCount}::int - 1, 0)`
        })
        .where(eq(db.schema.artifactResource.id, parentId));
    }
  });

  // After the rows are gone, and best-effort for the same reason as in create:
  // an orphaned object costs storage nobody is billed for, while a failure here
  // would report a delete that did in fact happen as an error.
  const bucket = c.env.STORAGE_BUCKET;
  if (bucket) {
    for (const key of fileKeys) {
      await bucket.delete(key).catch(() => {});
    }
  }

  return {
    ok: true,
    resource: { uri: input.uri, deleted: true, count: ids.length }
  };
};
