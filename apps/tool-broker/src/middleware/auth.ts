import { Context, Next } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

// types
import type { AppEnv } from '../types';

/**
 * Authenticate one call from a deployed user script.
 *
 * A service binding carries no caller identity, so the only thing that names the
 * caller is its `GANJU_TOOL_TOKEN` — minted at publish time, injected as a secret
 * binding, and signed with this deployment's CUSTOM_CODE_TOKEN_SECRET. Three
 * things have to hold before any capability is served:
 *
 *  1. the signature verifies (the script is one we deployed);
 *  2. the artifact still has a custom-code tool installed;
 *  3. the token's version is still that tool's ACTIVE version.
 *
 * (3) is what makes "rotated on every publish" true. A superseded script would
 * otherwise keep a working credential for as long as its isolate lived, and a
 * rollback would leave the version it rolled away from still able to read the
 * artifact's connections.
 *
 * A PREVIEW token — minted for a dashboard test run — swaps (3) for "the version
 * belongs to this tool", because a test exists precisely to run a version that
 * is not active. What replaces the rotation is an expiry on the token itself,
 * checked during verification.
 *
 * Every failure is the same 401 with no detail: a script that guesses at tokens
 * must not be able to tell a bad signature from a stale version.
 */
const verify = async (c: Context<AppEnv>, next: Next) => {
  const secret = utils.getEnv(c, utils.constants.CUSTOM_CODE_TOKEN_SECRET_ENV);
  if (!secret) {
    // Deployment error, not a caller error — the broker cannot verify anything
    // without its signing key, and silently 401ing would send every user
    // debugging their own script.
    console.error(
      `${utils.constants.CUSTOM_CODE_TOKEN_SECRET_ENV} is not configured; the tool broker cannot verify callers`
    );
    return c.json({ error: 'Broker is not configured' }, 500);
  }

  const header = c.req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload = await utils.verifyCustomCodeToken(token, secret);
  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const dbInstance = db.create(c);
  const [row] = await dbInstance
    .select({ artifactTool: db.schema.artifactTool })
    .from(db.schema.artifactTool)
    .where(
      and(
        eq(db.schema.artifactTool.artifactId, payload.artifactId),
        eq(
          db.schema.artifactTool.toolKey,
          utils.constants.TOOL_DEFINITION_KEY_CUSTOM_CODE
        )
      )
    )
    .limit(1);

  if (!row) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const parsed = utils.Schema.CUSTOM_CODE_CONFIG.safeParse(
    row.artifactTool.config ?? {}
  );
  if (!parsed.success) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  if (payload.preview) {
    // A test run, deployed to `artifact_<id>_preview` from the dashboard. It is
    // by definition NOT the active version, so (3) cannot apply — what stands in
    // for it is that the version is one of THIS tool's, plus the expiry the
    // token carries and verify already enforced.
    //
    // The capability is the same as a live token's on purpose: the person who
    // asked for the test is an authenticated member of the org who could publish
    // this exact code instead, and a test that couldn't reach the artifact's own
    // connections and resources would only be a test of code nobody writes.
    const [version] = await dbInstance
      .select({ id: db.schema.artifactToolVersion.id })
      .from(db.schema.artifactToolVersion)
      .where(
        and(
          eq(db.schema.artifactToolVersion.id, payload.versionId),
          eq(db.schema.artifactToolVersion.artifactToolId, row.artifactTool.id)
        )
      )
      .limit(1);

    if (!version) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  } else if (parsed.data.activeVersionId !== payload.versionId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('tool', {
    artifactId: payload.artifactId,
    artifactToolId: row.artifactTool.id,
    versionId: payload.versionId,
    config: parsed.data
  });

  await next();
};

export const ToolAuthMiddleware = { verify };
