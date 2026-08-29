import { utils } from '@ganju/utils';
import { db } from '@ganju/db';
import { eq } from 'drizzle-orm';

import type { ToolContext, ToolCredential } from './types';

/**
 * The time zone a calendar or booking call should operate in.
 *
 * Three sources, in the order a person would expect them to win:
 *
 *   1. `args.timeZone` — the model was told a zone in this conversation, or the
 *      caller passed one explicitly. Most specific, so it wins.
 *   2. `config.defaultTimeZone` — the artifact owner picked one in the
 *      dashboard. A deliberate act, so it beats anything we inferred.
 *   3. The zone the user configured with the vendor, cached on the credential.
 *
 * Only the third is new, and it is the one that fires: (2) is written only when
 * someone opens the dropdown and changes it, which almost nobody does, so the
 * old chain fell through to a hardcoded default on nearly every install.
 *
 * Returns undefined when we genuinely do not know, which each caller answers
 * differently — Google can fall back to the calendar's own zone, a booking
 * cannot.
 */
export const resolveEffectiveTimeZone = (
  args: Record<string, unknown>,
  context: ToolContext
): string | undefined => {
  const fromArgs = args.timeZone;
  if (typeof fromArgs === 'string' && fromArgs.trim()) return fromArgs.trim();

  const fromConfig = context.config?.defaultTimeZone;
  if (typeof fromConfig === 'string' && fromConfig.trim()) {
    return fromConfig.trim();
  }

  return (
    utils.readCredentialTimeZone(context.credentials[0]?.metadata) ?? undefined
  );
};

/**
 * Re-read the vendor's zone when the cached one has aged out, and write it back.
 *
 * Runs on the tool-call path on purpose. The alternative — refreshing only when
 * the owner opens the dashboard — leaves an artifact whose owner moved cities
 * booking in the old zone indefinitely, and the owner has no reason to visit a
 * page about a thing they believe is working. Once a day, one small GET, against
 * a vendor this call is about to talk to anyway.
 *
 * Everything here is best-effort. A vendor that is slow, down, or newly
 * unauthorized must not fail the tool call: the caller keeps whatever the cache
 * held, which is the same position it would have been in without this.
 *
 * Returns the zone now believed current, so a caller can use a value that only
 * arrived this instant rather than waiting a call to benefit from it.
 */
export const refreshVendorTimeZoneIfStale = async (
  context: ToolContext,
  credential: ToolCredential | undefined,
  fetchTimeZone: (secret: string) => Promise<string | null>
): Promise<string | null> => {
  if (!credential?.id) return null;
  if (!utils.credentialTimeZoneIsStale(credential.metadata)) {
    return utils.readCredentialTimeZone(credential.metadata);
  }

  try {
    const fetched = await fetchTimeZone(credential.accessToken);
    const nextMetadata = utils.writeCredentialTimeZone(
      credential.metadata,
      fetched
    );
    await context.db
      .update(db.schema.artifactCredential)
      .set({ metadata: nextMetadata })
      .where(eq(db.schema.artifactCredential.id, credential.id));
    // Keep the in-memory copy in step: several tools can run against one boot,
    // and re-fetching per call would defeat the cache we just wrote.
    credential.metadata = nextMetadata;
    return fetched;
  } catch {
    return utils.readCredentialTimeZone(credential.metadata);
  }
};
