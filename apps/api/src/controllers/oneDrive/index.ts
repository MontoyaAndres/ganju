import { Context } from 'hono';
import { and, eq, sql } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';

import {
  oneDriveUri,
  enqueueOnedriveDiscover,
  enqueueOnedriveFile,
  getOneDriveAccessToken,
  parseOneDriveUri
} from '../../utils';

import type { AppEnv } from '../../types';

const PROVIDER = utils.constants.OAUTH_PROVIDER_ONE_DRIVE;

const ensureSupportedMime = (
  mimeType: string | undefined,
  folder: boolean
): void => {
  if (folder) return;
  const supported = (utils.constants.MIMETYPES as readonly string[]).includes(
    mimeType || ''
  );
  if (!supported) {
    throw new Error(`Unsupported OneDrive mime type: ${mimeType ?? 'unknown'}`);
  }
};

const create = async (c: Context<AppEnv>) => {
  const body = await c.req.json();
  const currentValues = await utils.Schema.ARTIFACT_CREATE_ONE_DRIVE.parseAsync(
    {
      ...body,
      projectId: c.req.param('projectId'),
      userId: c.get('user').id,
      organizationId: c.req.param('organizationId')
    }
  );

  const dbInstance = db.create(c);

  const { folderResourceIds, fileResourceIds } = await dbInstance.transaction(
    async tx => {
      const [project] = await tx
        .select()
        .from(db.schema.project)
        .where(
          and(
            eq(db.schema.project.id, currentValues.projectId),
            eq(db.schema.project.organizationId, currentValues.organizationId)
          )
        )
        .limit(1);

      if (!project) {
        throw new Error('Project not found');
      }

      const [currentArtifactByProject] = await tx
        .select()
        .from(db.schema.artifact)
        .where(eq(db.schema.artifact.projectId, currentValues.projectId))
        .limit(1);

      if (!currentArtifactByProject) {
        throw new Error('Artifact not found for the project');
      }

      const [credential] = await tx
        .select({ id: db.schema.artifactCredential.id })
        .from(db.schema.artifactCredential)
        .where(
          and(
            eq(
              db.schema.artifactCredential.artifactId,
              currentArtifactByProject.id
            ),
            eq(db.schema.artifactCredential.provider, PROVIDER)
          )
        )
        .limit(1);

      if (!credential) {
        throw new Error(
          'Connect OneDrive for this project before importing files.'
        );
      }

      const folderIds: string[] = [];
      const fileIds: string[] = [];

      for (const item of currentValues.items) {
        const folder = item.isFolder;
        ensureSupportedMime(item.mimeType, folder);

        const uri = oneDriveUri(item.itemId, item.driveId);

        const [conflicting] = await tx
          .select({ id: db.schema.artifactResource.id })
          .from(db.schema.artifactResource)
          .where(
            and(
              eq(
                db.schema.artifactResource.artifactId,
                currentArtifactByProject.id
              ),
              eq(db.schema.artifactResource.uri, uri)
            )
          )
          .limit(1);

        if (conflicting) continue;

        const metadata: Record<string, unknown> = {
          oneDriveItemId: item.itemId,
          oneDriveDriveId: item.driveId,
          oneDriveMimeType: item.mimeType,
          isFolder: folder,
          webUrl: item.webUrl,
          lastModifiedDateTime: item.lastModifiedDateTime,
          size: item.size
        };

        const [created] = await tx
          .insert(db.schema.artifactResource)
          .values({
            title: item.name,
            uri,
            type: utils.constants.RESOURCE_TYPE_STATIC,
            sourceType: folder
              ? utils.constants.RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER
              : utils.constants.RESOURCE_SOURCE_TYPE_FILE,
            status: utils.constants.STATUS_PENDING,
            mimeType: folder
              ? utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM
              : item.mimeType ||
                utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM,
            fileName: folder ? null : item.name,
            artifactId: currentArtifactByProject.id,
            metadata
          })
          .returning({ id: db.schema.artifactResource.id });

        await tx
          .update(db.schema.artifact)
          .set({
            artifactResourceCount: sql`(${db.schema.artifact.artifactResourceCount}::int + 1)::int`
          })
          .where(eq(db.schema.artifact.id, currentArtifactByProject.id));

        if (folder) folderIds.push(created.id);
        else fileIds.push(created.id);
      }

      return { folderResourceIds: folderIds, fileResourceIds: fileIds };
    }
  );

  if (folderResourceIds.length > 0) {
    await enqueueOnedriveDiscover(c.env, folderResourceIds);
  }
  if (fileResourceIds.length > 0) {
    await enqueueOnedriveFile(c.env, fileResourceIds);
  }

  return c.json({
    folders: folderResourceIds,
    files: fileResourceIds
  });
};

const sync = async (c: Context<AppEnv>) => {
  const currentValues = await utils.Schema.ARTIFACT_SYNC_ONE_DRIVE.parseAsync({
    resourceId: c.req.param('resourceId'),
    projectId: c.req.param('projectId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId')
  });

  const dbInstance = db.create(c);

  const [project] = await dbInstance
    .select()
    .from(db.schema.project)
    .where(
      and(
        eq(db.schema.project.id, currentValues.projectId),
        eq(db.schema.project.organizationId, currentValues.organizationId)
      )
    )
    .limit(1);

  if (!project) {
    throw new Error('Project not found');
  }

  const [artifactRow] = await dbInstance
    .select()
    .from(db.schema.artifact)
    .where(eq(db.schema.artifact.projectId, currentValues.projectId))
    .limit(1);

  if (!artifactRow) {
    throw new Error('Artifact not found for the project');
  }

  const [resource] = await dbInstance
    .select()
    .from(db.schema.artifactResource)
    .where(
      and(
        eq(db.schema.artifactResource.id, currentValues.resourceId),
        eq(db.schema.artifactResource.artifactId, artifactRow.id)
      )
    )
    .limit(1);

  if (!resource) {
    throw new Error('Resource not found');
  }

  const metadata =
    resource.metadata && typeof resource.metadata === 'object'
      ? (resource.metadata as Record<string, unknown>)
      : null;
  const itemId =
    (metadata?.oneDriveItemId as string | undefined) ??
    parseOneDriveUri(resource.uri)?.itemId ??
    null;

  if (!itemId) {
    throw new Error('Resource is not linked to OneDrive');
  }

  await dbInstance
    .update(db.schema.artifactResource)
    .set({ status: utils.constants.STATUS_PENDING, syncStartedAt: new Date() })
    .where(eq(db.schema.artifactResource.id, resource.id));

  if (
    resource.sourceType ===
    utils.constants.RESOURCE_SOURCE_TYPE_ONE_DRIVE_FOLDER
  ) {
    await enqueueOnedriveDiscover(c.env, resource.id);
  } else {
    await enqueueOnedriveFile(c.env, resource.id);
  }

  return c.json({ resourceId: resource.id, status: 'queued' });
};

const token = async (c: Context<AppEnv>) => {
  const projectId = c.req.param('projectId');
  const organizationId = c.req.param('organizationId');

  if (!projectId || !organizationId) {
    throw new Error('projectId and organizationId are required');
  }

  const dbInstance = db.create(c);

  const [project] = await dbInstance
    .select()
    .from(db.schema.project)
    .where(
      and(
        eq(db.schema.project.id, projectId),
        eq(db.schema.project.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!project) {
    throw new Error('Project not found');
  }

  const [artifactRow] = await dbInstance
    .select()
    .from(db.schema.artifact)
    .where(eq(db.schema.artifact.projectId, projectId))
    .limit(1);

  if (!artifactRow) {
    throw new Error('Artifact not found for the project');
  }

  const [credential] = await dbInstance
    .select({
      id: db.schema.artifactCredential.id,
      expiresAt: db.schema.artifactCredential.expiresAt,
      scopes: db.schema.artifactCredential.scopes,
      metadata: db.schema.artifactCredential.metadata
    })
    .from(db.schema.artifactCredential)
    .where(
      and(
        eq(db.schema.artifactCredential.artifactId, artifactRow.id),
        eq(db.schema.artifactCredential.provider, PROVIDER)
      )
    )
    .limit(1);

  if (!credential) {
    throw new Error('Connect OneDrive for this project first.');
  }

  if (utils.isCredentialNeedingReauth(credential.metadata)) {
    throw new Error('OneDrive credential needs reauth for this project.');
  }

  const accessToken = await getOneDriveAccessToken(c, artifactRow.id);

  const [refreshed] = await dbInstance
    .select({
      expiresAt: db.schema.artifactCredential.expiresAt,
      scopes: db.schema.artifactCredential.scopes
    })
    .from(db.schema.artifactCredential)
    .where(eq(db.schema.artifactCredential.id, credential.id))
    .limit(1);

  return c.json({
    accessToken,
    expiresAt: refreshed?.expiresAt ?? credential.expiresAt,
    scopes: refreshed?.scopes ?? credential.scopes
  });
};

export const OneDriveController = {
  create,
  sync,
  token
};
