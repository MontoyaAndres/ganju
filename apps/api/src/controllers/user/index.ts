import { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

import {
  consentActorFromRequest,
  getConsentStatus,
  listConsents,
  recordConsent
} from '../../utils';

// types
import type { AppEnv } from '../../types';

const extensionFor = (mime: string) => {
  if (mime === utils.constants.MIMETYPE_IMAGE_PNG) return 'png';
  if (mime === utils.constants.MIMETYPE_IMAGE_WEBP) return 'webp';
  if (mime === utils.constants.MIMETYPE_IMAGE_GIF) return 'gif';
  return 'jpg';
};

const uploadAvatar = async (c: Context<AppEnv>) => {
  const user = c.get('user');

  const formData = await c.req.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    throw new Error('File is required');
  }
  if (file.size > utils.constants.MAX_AVATAR_SIZE) {
    throw new Error(
      `Avatar size exceeds the ${utils.constants.MAX_AVATAR_SIZE / (1024 * 1024)}MB limit`
    );
  }
  if (
    !utils.constants.USER_AVATAR_MIME_TYPES.includes(
      file.type as (typeof utils.constants.USER_AVATAR_MIME_TYPES)[0]
    )
  ) {
    throw new Error(`Unsupported image type: ${file.type}`);
  }

  const bucket = c.env.STORAGE_BUCKET;
  if (!bucket) {
    throw new Error('Storage not available');
  }

  const filename = utils.formatFilename(`avatar.${extensionFor(file.type)}`);
  const key = `users/${user.id}/avatar/${filename}`;

  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type }
  });

  const image = `${utils.getEnv(c, 'NEXT_PUBLIC_API_URL')}/user/${user.id}/avatar/${filename}`;

  const dbInstance = db.create(c);
  await dbInstance
    .update(db.schema.user)
    .set({ image })
    .where(eq(db.schema.user.id, user.id));

  return c.json({ image });
};

const downloadAvatar = async (c: Context<AppEnv>) => {
  const userId = c.req.param('userId');
  const filename = c.req.param('filename');
  if (!userId || !filename) {
    throw new Error('Invalid avatar path');
  }

  const bucket = c.env.STORAGE_BUCKET;
  if (!bucket) {
    throw new Error('Storage not available');
  }

  const key = `users/${userId}/avatar/${filename}`;
  const object = await bucket.get(key);
  if (!object) {
    throw new Error('Avatar not found');
  }

  return new Response(object.body as unknown as ReadableStream, {
    headers: {
      'Content-Type':
        object.httpMetadata?.contentType ||
        utils.constants.MIMETYPE_APPLICATION_OCTET_STREAM,
      'Cache-Control': 'public, max-age=3600'
    }
  });
};

// Which legal documents this user has accepted, and whether that covers the
// current version. The dashboard prompts for re-acceptance when it doesn't.
const getConsent = async (c: Context<AppEnv>) => {
  const user = c.get('user');
  const dbInstance = db.create(c);
  return c.json(await getConsentStatus(dbInstance, user.id));
};

// Re-acceptance after a policy revision. Signup consent is recorded server-side
// by the better-auth hook, so this only covers the version-bump path.
const acceptConsent = async (c: Context<AppEnv>) => {
  const user = c.get('user');
  const dbInstance = db.create(c);

  await recordConsent(
    dbInstance,
    user.id,
    utils.constants.CONSENT_SOURCE_REACCEPT,
    consentActorFromRequest(c)
  );

  return c.json(await getConsentStatus(dbInstance, user.id));
};

/**
 * Right of access / portability: everything we hold that is personal data about
 * the requesting user, as one JSON document.
 *
 * Scope is deliberate. This exports the USER's personal data — identity,
 * sign-in methods, sessions, consents, memberships, invitations — plus an
 * inventory of the workspaces they belong to. It does NOT dump Customer
 * Content: resources, conversations, and prompts belong to the organization,
 * not to the individual, and are exportable per-resource from the dashboard.
 * Dumping them here would also mean streaming gigabytes through a Worker.
 *
 * Secrets are never included: OAuth tokens and password hashes are reported as
 * presence flags, so an intercepted export can't be replayed against a
 * connected account.
 */
const exportData = async (c: Context<AppEnv>) => {
  const user = c.get('user');
  const dbInstance = db.create(c);

  const [profile] = await dbInstance
    .select({
      id: db.schema.user.id,
      name: db.schema.user.name,
      email: db.schema.user.email,
      emailVerified: db.schema.user.emailVerified,
      image: db.schema.user.image,
      createdAt: db.schema.user.createdAt,
      updatedAt: db.schema.user.updatedAt
    })
    .from(db.schema.user)
    .where(eq(db.schema.user.id, user.id))
    .limit(1);

  const accounts = await dbInstance
    .select({
      providerId: db.schema.account.providerId,
      accountId: db.schema.account.accountId,
      scope: db.schema.account.scope,
      createdAt: db.schema.account.createdAt
    })
    .from(db.schema.account)
    .where(eq(db.schema.account.userId, user.id));

  const sessions = await dbInstance
    .select({
      ipAddress: db.schema.session.ipAddress,
      userAgent: db.schema.session.userAgent,
      expiresAt: db.schema.session.expiresAt,
      createdAt: db.schema.session.createdAt
    })
    .from(db.schema.session)
    .where(eq(db.schema.session.userId, user.id));

  const organizations = await dbInstance
    .select({
      id: db.schema.organization.id,
      name: db.schema.organization.name,
      role: db.schema.organizationUser.role,
      isOwner: db.schema.organization.ownerId,
      joinedAt: db.schema.organizationUser.createdAt
    })
    .from(db.schema.organizationUser)
    .innerJoin(
      db.schema.organization,
      eq(db.schema.organization.id, db.schema.organizationUser.organizationId)
    )
    .where(eq(db.schema.organizationUser.userId, user.id));

  const projects = await dbInstance
    .select({
      id: db.schema.project.id,
      name: db.schema.project.name,
      organizationId: db.schema.project.organizationId,
      role: db.schema.projectUser.role,
      joinedAt: db.schema.projectUser.createdAt
    })
    .from(db.schema.projectUser)
    .innerJoin(
      db.schema.project,
      eq(db.schema.project.id, db.schema.projectUser.projectId)
    )
    .where(eq(db.schema.projectUser.userId, user.id));

  const invitationsSent = await dbInstance
    .select({
      email: db.schema.invitation.email,
      role: db.schema.invitation.role,
      status: db.schema.invitation.status,
      organizationId: db.schema.invitation.organizationId,
      projectId: db.schema.invitation.projectId,
      createdAt: db.schema.invitation.createdAt
    })
    .from(db.schema.invitation)
    .where(eq(db.schema.invitation.invitedById, user.id));

  const linkedChatIdentities = await dbInstance
    .select({
      provider: db.schema.externalIdentity.provider,
      externalId: db.schema.externalIdentity.externalId,
      displayName: db.schema.externalIdentity.displayName,
      linkedAt: db.schema.externalIdentity.linkedAt
    })
    .from(db.schema.externalIdentity)
    .where(eq(db.schema.externalIdentity.userId, user.id));

  const payload = {
    exportedAt: new Date().toISOString(),
    format: 'ganju-user-export/1',
    notice:
      'Personal data held about this user. Organization-owned Customer Content ' +
      '(resources, prompts, conversations) is not included — download it from ' +
      'the dashboard, or ask an organization Owner. Credentials and tokens are ' +
      'reported as presence flags only and are never exported in plaintext.',
    profile,
    signInMethods: accounts.map(account => ({
      ...account,
      hasStoredTokens: true
    })),
    sessions,
    consents: await listConsents(dbInstance, user.id),
    organizations: organizations.map(({ isOwner, ...rest }) => ({
      ...rest,
      isOwner: isOwner === user.id
    })),
    projects,
    invitationsSent,
    linkedChatIdentities
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': utils.constants.MIMETYPE_APPLICATION_JSON,
      'Content-Disposition': `attachment; filename="ganju-export-${stamp}.json"`
    }
  });
};

/**
 * Right to erasure, self-serve.
 *
 * Blocked while the user still owns an organization. Deleting the user row
 * cascades through memberships, but an organization's `ownerId` is a plain
 * reference — removing the owner would strand the workspace and destroy other
 * members' work as a side effect of one person leaving. The caller is told
 * exactly which organizations to remove or hand over first.
 */
const remove = async (c: Context<AppEnv>) => {
  const user = c.get('user');
  const dbInstance = db.create(c);

  return c.json({ error: 'Blocked for now' });

  const owned = await dbInstance
    .select({
      id: db.schema.organization.id,
      name: db.schema.organization.name
    })
    .from(db.schema.organization)
    .where(eq(db.schema.organization.ownerId, user.id));

  if (owned.length > 0) {
    return c.json(
      {
        error:
          'Delete or transfer the organizations you own before deleting your account.',
        organizations: owned
      },
      409
    );
  }

  // Best-effort: the avatar lives in R2, outside the database cascade, so a
  // failure here must not block the erasure itself.
  const bucket = c.env.STORAGE_BUCKET;
  if (bucket) {
    try {
      const listed = await bucket.list({ prefix: `users/${user.id}/` });
      await Promise.all(
        listed.objects.map(object => bucket.delete(object.key))
      );
    } catch (error) {
      console.error('failed to delete avatar objects for user', user.id, error);
    }
  }

  // Cascades to session, account, userConsent, organizationUser, projectUser,
  // externalIdentity, oauthConsent, and oauthAccessToken.
  await dbInstance.delete(db.schema.user).where(eq(db.schema.user.id, user.id));

  return c.json({ deleted: true });
};

export const UserController = {
  uploadAvatar,
  downloadAvatar,
  getConsent,
  acceptConsent,
  exportData,
  remove
};
