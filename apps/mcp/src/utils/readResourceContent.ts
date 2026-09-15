import { db, type Database } from '@ganju/db';
import { utils } from '@ganju/utils';
import { and, eq, InferSelectModel } from 'drizzle-orm';
import { R2Bucket } from '@cloudflare/workers-types';

type ArtifactResource = InferSelectModel<typeof db.schema.artifactResource>;

// The columns boot leaves behind. Every MCP request loads the artifact's whole
// resource list, and on a crawled site these three are nearly all of it: 1,198
// pages measured at 22.7MB with them and 647KB without, re-sent on `initialize`
// and `tools/list` as much as on a read, into a Worker capped at 128MB. What
// registration and listing need is the rest.
export const BOOT_RESOURCE_COLUMNS = {
  content: false,
  metadata: false,
  crawlConfig: false
} as const;

export type BootResource = Omit<
  ArtifactResource,
  keyof typeof BOOT_RESOURCE_COLUMNS
>;

/**
 * Load the inline content boot skipped, for the one resource about to be read.
 *
 * Scoped to the artifact as well as the id: the resource came from that
 * artifact's own list, so this changes nothing today, and it keeps a stray id
 * from ever reaching across tenants.
 */
export const withResourceContent = async <T extends BootResource>(
  dbInstance: Database,
  resource: T
): Promise<T & { content: string | null }> => {
  const [row] = await dbInstance
    .select({ content: db.schema.artifactResource.content })
    .from(db.schema.artifactResource)
    .where(
      and(
        eq(db.schema.artifactResource.id, resource.id),
        eq(db.schema.artifactResource.artifactId, resource.artifactId)
      )
    )
    .limit(1);
  return { ...resource, content: row?.content ?? null };
};

export const readResourceContent = async (
  resource: Pick<ArtifactResource, 'content' | 'fileKey' | 'mimeType'>,
  uri: URL,
  bucket: R2Bucket
) => {
  if (resource.content) {
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: resource.mimeType,
          text: resource.content
        }
      ]
    };
  }

  if (resource.fileKey && bucket) {
    const object = await bucket.get(resource.fileKey);

    if (!object) {
      throw new Error(
        `Resource file not found in storage: ${resource.fileKey}`
      );
    }

    if (
      utils.constants.TEXT_MIME_TYPES.includes(
        resource.mimeType as (typeof utils.constants.TEXT_MIME_TYPES)[0]
      )
    ) {
      const text = await object.text();

      return {
        contents: [{ uri: uri.href, mimeType: resource.mimeType, text }]
      };
    }

    const arrayBuffer = await object.arrayBuffer();
    const blob = Buffer.from(arrayBuffer).toString('base64');

    return {
      contents: [{ uri: uri.href, mimeType: resource.mimeType, blob }]
    };
  }

  return {
    contents: [
      {
        uri: uri.href,
        mimeType: resource.mimeType,
        text: resource.content || ''
      }
    ]
  };
};
