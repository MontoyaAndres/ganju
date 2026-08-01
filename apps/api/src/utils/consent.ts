import { Context } from 'hono';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@ganju/db';
import type { DbExecutor } from '@ganju/db';
import { utils } from '@ganju/utils';

// types
import type { AppEnv } from '../types';

const { constants } = utils;

export interface ConsentActor {
  ipAddress: string | null;
  userAgent: string | null;
  locale: string | null;
}

/**
 * Read the requester's fingerprint for the consent record. Cloudflare sets
 * `CF-Connecting-IP` on every edge request; the others are best-effort.
 */
export const consentActorFromRequest = (c: Context<AppEnv>): ConsentActor => ({
  ipAddress:
    c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? null,
  userAgent: c.req.header('user-agent') ?? null,
  locale: c.req.header('accept-language')?.split(',')[0] ?? null
});

/**
 * Record that a user accepted the current Terms and Privacy Policy.
 *
 * Idempotent per (user, document, version): re-running it after a page reload
 * or a repeated sign-in keeps the FIRST acceptance timestamp, which is the one
 * that matters as evidence. A version bump produces new rows and leaves the old
 * ones intact.
 */
export const recordConsent = async (
  executor: DbExecutor,
  userId: string,
  source: string,
  actor: ConsentActor
): Promise<void> => {
  await executor
    .insert(db.schema.userConsent)
    .values(
      constants.CONSENT_DOCUMENTS.map(document => ({
        userId,
        document,
        version: constants.CONSENT_CURRENT_VERSION,
        source,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        locale: actor.locale
      }))
    )
    .onConflictDoNothing({
      target: [
        db.schema.userConsent.userId,
        db.schema.userConsent.document,
        db.schema.userConsent.version
      ]
    });
};

export interface ConsentStatus {
  version: string;
  // False when a document has been revised since this user last accepted — the
  // dashboard uses it to prompt for re-acceptance.
  upToDate: boolean;
  accepted: {
    document: string;
    version: string;
    acceptedAt: Date;
  }[];
}

/** What this user has accepted, and whether it covers the current version. */
export const getConsentStatus = async (
  executor: DbExecutor,
  userId: string
): Promise<ConsentStatus> => {
  const rows = await executor
    .select({
      document: db.schema.userConsent.document,
      version: db.schema.userConsent.version,
      acceptedAt: db.schema.userConsent.createdAt
    })
    .from(db.schema.userConsent)
    .where(eq(db.schema.userConsent.userId, userId));

  const current = rows.filter(
    row => row.version === constants.CONSENT_CURRENT_VERSION
  );

  return {
    version: constants.CONSENT_CURRENT_VERSION,
    upToDate: constants.CONSENT_DOCUMENTS.every(document =>
      current.some(row => row.document === document)
    ),
    accepted: rows
  };
};

/** Every acceptance on record, for the data export. */
export const listConsents = async (
  executor: DbExecutor,
  userId: string
): Promise<
  {
    document: string;
    version: string;
    source: string;
    ipAddress: string | null;
    userAgent: string | null;
    locale: string | null;
    acceptedAt: Date;
  }[]
> =>
  executor
    .select({
      document: db.schema.userConsent.document,
      version: db.schema.userConsent.version,
      source: db.schema.userConsent.source,
      ipAddress: db.schema.userConsent.ipAddress,
      userAgent: db.schema.userConsent.userAgent,
      locale: db.schema.userConsent.locale,
      acceptedAt: db.schema.userConsent.createdAt
    })
    .from(db.schema.userConsent)
    .where(
      and(
        eq(db.schema.userConsent.userId, userId),
        inArray(
          db.schema.userConsent.document,
          constants.CONSENT_DOCUMENTS as unknown as string[]
        )
      )
    );
