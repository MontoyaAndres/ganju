import { Context } from 'hono';
import { and, eq } from 'drizzle-orm';
import { db } from '@ganju/db';
import { utils } from '@ganju/utils';

// types
import { AppEnv } from '../../types';

const { constants } = utils;

/**
 * The "stop these tools" link a usage alert carries.
 *
 * Everything else in the abuse runbook needs a shell holding the production
 * database URL. That is the wrong shape for the moment it matters: the alert
 * arrives on a phone, and until this existed the response did not.
 *
 * Deliberately the smallest capability that answers "make it stop":
 *
 * - **One action.** It disables the organization's `custom-code` installs. The
 *   tools stop registering at boot, so nothing can call them, while the code,
 *   the versions, the settings and every credential survive — and any owner can
 *   switch them back on from the Tools page without us.
 * - **Organization-wide, because that is what the alert knows.** The counter the
 *   digest reads is per organization; picking one artifact would mean guessing
 *   which one, from an email that cannot tell.
 * - **The GET never acts.** Mail clients, link scanners and chat previews fetch
 *   URLs nobody clicked. The link renders a page; the form on it POSTs. A
 *   capability that fires on preview is a capability someone else holds.
 * - **Authority is the token, and nothing else.** No session, because whoever is
 *   on call may not have one on the device in their hand — which is the entire
 *   situation this exists for.
 */

const page = (body: string, tone: 'ask' | 'done' | 'gone'): string => {
  const accent =
    tone === 'done' ? '#1f7a4d' : tone === 'gone' ? '#8a8798' : '#b4231f';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Custom tools</title>
    <style>
      body { margin:0; padding:24px; background:#faf9fc; color:#211f2e;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
             display:flex; justify-content:center; }
      main { background:#fff; border-radius:12px; padding:28px; max-width:520px; width:100%; }
      h1 { margin:0 0 12px; font-size:20px; color:${accent}; }
      p { margin:0 0 14px; font-size:14px; line-height:1.55; color:#4a4759; }
      dl { margin:0 0 20px; font-size:14px; }
      dt { color:#6b6878; font-size:12px; text-transform:uppercase; letter-spacing:.04em; margin-top:12px; }
      dd { margin:2px 0 0; }
      button { appearance:none; border:0; border-radius:8px; padding:12px 18px;
               background:#b4231f; color:#fff; font-size:15px; font-weight:600; width:100%; }
      .note { font-size:12px; color:#6b6878; }
    </style>
  </head>
  <body><main>${body}</main></body>
</html>`;
};

// Every rejection answers identically. A page that says which check failed tells
// whoever found the link what to change about it.
const refused = (c: Context<AppEnv>) =>
  c.html(
    page(
      `<h1>This link is no longer valid</h1>
       <p>It may have expired, or it was not issued by this deployment. Usage
          alerts carry a fresh one each time.</p>
       <p class="note">Nothing was changed.</p>`,
      'gone'
    ),
    410
  );

const readToken = async (c: Context<AppEnv>) => {
  const secret = utils.getEnv(c, 'JWT_SECRET');
  const token = c.req.param('token');
  if (!secret || !token) return null;
  return utils.verifyContainmentToken(token, secret);
};

// What the page states, and what the action counts. Read twice on purpose: the
// operator is told how many installs are live before acting, and the result says
// how many actually moved.
const loadInstalls = async (
  executor: ReturnType<typeof db.create>,
  organizationId: string
) => {
  const rows = await executor
    .select({
      id: db.schema.artifactTool.id,
      enabled: db.schema.artifactTool.enabled,
      slug: db.schema.artifact.slug,
      artifactId: db.schema.artifact.id
    })
    .from(db.schema.artifactTool)
    .innerJoin(
      db.schema.artifact,
      eq(db.schema.artifact.id, db.schema.artifactTool.artifactId)
    )
    .innerJoin(
      db.schema.project,
      eq(db.schema.project.id, db.schema.artifact.projectId)
    )
    .where(
      and(
        eq(db.schema.project.organizationId, organizationId),
        eq(
          db.schema.artifactTool.toolKey,
          constants.TOOL_DEFINITION_KEY_CUSTOM_CODE
        )
      )
    );
  return rows;
};

const confirm = async (c: Context<AppEnv>) => {
  const payload = await readToken(c);
  if (!payload) return refused(c);

  const dbInstance = db.create(c);
  const [organization] = await dbInstance
    .select({
      name: db.schema.organization.name,
      id: db.schema.organization.id
    })
    .from(db.schema.organization)
    .where(eq(db.schema.organization.id, payload.organizationId))
    .limit(1);

  if (!organization) return refused(c);

  const installs = await loadInstalls(dbInstance, payload.organizationId);
  const live = installs.filter(install => install.enabled);
  const [subscription] = await dbInstance
    .select({ used: db.schema.subscription.toolCallCount })
    .from(db.schema.subscription)
    .where(eq(db.schema.subscription.organizationId, payload.organizationId))
    .limit(1);

  if (live.length === 0) {
    return c.html(
      page(
        `<h1>Already stopped</h1>
         <p><strong>${organization.name}</strong> has no custom tools running —
            either they were never deployed, or someone has already turned them
            off.</p>
         <p class="note">Nothing was changed.</p>`,
        'done'
      )
    );
  }

  return c.html(
    page(
      `<h1>Stop custom tools?</h1>
       <p>This turns off every function <strong>${organization.name}</strong> has
          deployed. They stop answering immediately. Their code, versions,
          settings and credentials are all kept, and any owner can switch them
          back on from the Tools page.</p>
       <dl>
         <dt>Organization</dt><dd>${organization.name}</dd>
         <dt>Servers affected</dt><dd>${live
           .map(install => install.slug)
           .join(', ')}</dd>
         <dt>Custom tool calls this period</dt>
         <dd>${(subscription?.used ?? 0).toLocaleString('en-US')}</dd>
       </dl>
       <form method="post">
         <button type="submit">Stop them now</button>
       </form>
       <p class="note" style="margin-top:16px;">
         This does not stop the owner deploying again, and it removes nothing.
         Closing this page changes nothing.
       </p>`,
      'ask'
    )
  );
};

const apply = async (c: Context<AppEnv>) => {
  const payload = await readToken(c);
  if (!payload) return refused(c);

  const dbInstance = db.create(c);
  const installs = await loadInstalls(dbInstance, payload.organizationId);
  const live = installs.filter(install => install.enabled);

  for (const install of live) {
    await dbInstance
      .update(db.schema.artifactTool)
      .set({ enabled: false })
      .where(eq(db.schema.artifactTool.id, install.id));
  }

  // The row change is the effect; this is the trail. An action taken by a link
  // has no session behind it, so the log is the only place it is written down.
  console.warn(
    `[containment] disabled ${live.length} custom-code install(s) for organization ${payload.organizationId}`
  );

  return c.html(
    page(
      `<h1>Stopped</h1>
       <p>${live.length} server${live.length === 1 ? '' : 's'} stopped answering
          custom tool calls. Nothing was deleted.</p>
       <p>If this was a stolen credential rather than the customer's own code,
          revoking it is a separate step, and so is removing the deployed
          bundles.</p>
       <p class="note">Switch them back on from the Tools page.</p>`,
      'done'
    )
  );
};

export const ContainmentController = { confirm, apply };
