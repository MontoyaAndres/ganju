import { Context } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { utils } from '@ganju/utils';
import { db } from '@ganju/db';

// types
import { AppEnv } from '../../types';

/**
 * Personal access tokens — the durable credential CI authenticates with.
 *
 * These live under the project rather than under the organization, because that
 * is what a token is scoped to and it is also what authorizes managing one: the
 * request middleware admits a project route on project membership, so the person
 * minting a credential for a project is someone who can already act on it. An
 * organization-level route would have needed its own check for exactly that, or
 * would have let an org admin mint a credential for a project they cannot open.
 *
 * One rule here is not obvious from the three handlers: a request authenticated
 * *by* one of these tokens cannot reach any of them. A credential able to mint
 * credentials outlives its own revocation — kill the leaked one and whatever it
 * made in the meantime is still live, under a name whoever is cleaning up has no
 * reason to distrust. Minting stays something a person does while signed in,
 * which is also the only context in which the value can be handed to somebody.
 */
const refuseTokenAuth = (c: Context<AppEnv>) =>
  c.get('apiToken')
    ? c.json(
        {
          error:
            'An access token cannot manage access tokens — sign in to mint or revoke one'
        },
        403
      )
    : null;

/**
 * Everything about a token except the one thing nobody can have.
 *
 * There is no field omitted here that exists somewhere else: `token_hash` is a
 * SHA-256, so the value is not recoverable from the row by us either. The list
 * says as much out loud, because the obvious next question when looking at it is
 * what a token is set to.
 */
const describe = (row: {
  id: string;
  name: string;
  hint: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  projectId: string;
  userId: string | null;
  createdBy?: { id: string; name: string; email: string } | null;
}) => ({
  id: row.id,
  name: row.name,
  hint: row.hint,
  expiresAt: row.expiresAt,
  lastUsedAt: row.lastUsedAt,
  createdAt: row.createdAt,
  projectId: row.projectId,
  createdByUserId: row.userId,
  // Null when the account that minted it is gone. The token is kept — a deploy
  // credential that vanishes leaves a pipeline failing with nothing to explain
  // it — but it no longer authenticates, and this is what says so in the list.
  createdBy: row.createdBy ?? null,
  orphaned: !row.userId
});

/**
 * The project the route names, checked against the organization it names too.
 *
 * Both ids come from the URL and only one of them has been verified — the
 * middleware authorized the caller against the project alone, since project and
 * organization memberships are independent. Without this, a token minted through
 * one organization's URL could carry another organization's id on its row, and
 * every listing keyed by that id would be wrong.
 */
const resolveProject = async (
  dbInstance: ReturnType<typeof db.create>,
  projectId: string,
  organizationId: string
) => {
  const [row] = await dbInstance
    .select({ id: db.schema.project.id })
    .from(db.schema.project)
    .where(
      and(
        eq(db.schema.project.id, projectId),
        eq(db.schema.project.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!row) throw new Error('Project not found');
  return row;
};

const list = async (c: Context<AppEnv>) => {
  const refused = refuseTokenAuth(c);
  if (refused) return refused;

  const currentValues = await utils.Schema.ACCESS_TOKEN_LIST.parseAsync({
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId'),
    projectId: c.req.param('projectId')
  });

  const dbInstance = db.create(c);
  await resolveProject(
    dbInstance,
    currentValues.projectId,
    currentValues.organizationId
  );

  // Every token on the project, not only the caller's. Revoking is an action on
  // a shared resource — a deploy pipeline broken by a credential nobody else can
  // see is the failure this list exists to prevent.
  const rows = await dbInstance
    .select({
      id: db.schema.accessToken.id,
      name: db.schema.accessToken.name,
      hint: db.schema.accessToken.hint,
      expiresAt: db.schema.accessToken.expiresAt,
      lastUsedAt: db.schema.accessToken.lastUsedAt,
      createdAt: db.schema.accessToken.createdAt,
      projectId: db.schema.accessToken.projectId,
      userId: db.schema.accessToken.userId,
      createdBy: {
        id: db.schema.user.id,
        name: db.schema.user.name,
        email: db.schema.user.email
      }
    })
    .from(db.schema.accessToken)
    // Left, because a token outlives the account that minted it and the row
    // whose owner is gone is the one most worth showing.
    .leftJoin(
      db.schema.user,
      eq(db.schema.user.id, db.schema.accessToken.userId)
    )
    .where(eq(db.schema.accessToken.projectId, currentValues.projectId))
    .orderBy(desc(db.schema.accessToken.createdAt));

  return c.json(rows.map(describe));
};

const create = async (c: Context<AppEnv>) => {
  const refused = refuseTokenAuth(c);
  if (refused) return refused;

  const body = await c.req.json();
  const currentValues = await utils.Schema.ACCESS_TOKEN_CREATE.parseAsync({
    ...body,
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId'),
    projectId: c.req.param('projectId')
  });

  const dbInstance = db.create(c);
  await resolveProject(
    dbInstance,
    currentValues.projectId,
    currentValues.organizationId
  );

  const existing = await dbInstance
    .select({ id: db.schema.accessToken.id })
    .from(db.schema.accessToken)
    .where(eq(db.schema.accessToken.projectId, currentValues.projectId));

  if (existing.length >= utils.constants.ACCESS_TOKEN_MAX_PER_PROJECT) {
    // Worded to carry a keyword `handleError` maps to 400; a message it does not
    // recognise becomes an opaque 500.
    throw new Error(
      `Creating another token exceeds the limit of ${utils.constants.ACCESS_TOKEN_MAX_PER_PROJECT} access tokens for this project. Revoke one first.`
    );
  }

  const minted = await utils.mintAccessToken();

  // The duration is turned into a date here rather than trusted from the client,
  // so a wrong clock somewhere else cannot mint a token that outlives what was
  // asked for.
  const expiresAt =
    typeof currentValues.expiresInDays === 'number'
      ? new Date(Date.now() + currentValues.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const [created] = await dbInstance
    .insert(db.schema.accessToken)
    .values({
      name: currentValues.name,
      tokenHash: minted.tokenHash,
      hint: minted.hint,
      expiresAt,
      projectId: currentValues.projectId,
      organizationId: currentValues.organizationId,
      userId: currentValues.userId
    })
    .returning();

  // The only response that carries the value, and the only moment it exists
  // anywhere but in the caller's hands.
  return c.json({ ...describe(created), token: minted.token });
};

const remove = async (c: Context<AppEnv>) => {
  const refused = refuseTokenAuth(c);
  if (refused) return refused;

  const currentValues = await utils.Schema.ACCESS_TOKEN_REMOVE.parseAsync({
    tokenId: c.req.param('tokenId'),
    userId: c.get('user').id,
    organizationId: c.req.param('organizationId'),
    projectId: c.req.param('projectId')
  });

  const dbInstance = db.create(c);

  // Deleting the row is the whole of revocation: authentication is a lookup by
  // hash, so the credential stops working on the next request rather than at the
  // end of some cached lifetime. That is the property that makes revoking worth
  // offering — a token whose death takes an hour to land is not revoked, it is
  // deprecated.
  //
  // Scoped by project as well as by id, so a token belonging to a sibling
  // project cannot be reached by naming it through this one's URL.
  const [removed] = await dbInstance
    .delete(db.schema.accessToken)
    .where(
      and(
        eq(db.schema.accessToken.id, currentValues.tokenId),
        eq(db.schema.accessToken.projectId, currentValues.projectId)
      )
    )
    .returning();

  if (!removed) throw new Error('Access token not found');

  return c.json({ id: removed.id });
};

export const AccessTokenController = {
  list,
  create,
  remove
};
