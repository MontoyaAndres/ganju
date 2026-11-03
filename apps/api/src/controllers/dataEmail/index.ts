import { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '@ganju/db';

// types
import { AppEnv } from '../../types';

/**
 * The links Ganju emails an address an email trigger names, outside the
 * organization: confirm, and unsubscribe. Each GET only renders, since mail
 * clients and link scanners fetch links nobody clicked; the form on it POSTs.
 * Unsubscribe's POST is also the one-click List-Unsubscribe target. The
 * recipient's language isn't known, so each page says it in English and
 * Spanish.
 */

const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const page = (body: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Ganju emails</title>
    <style>
      body { margin:0; padding:24px; background:#faf9fc; color:#211f2e;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
             display:flex; justify-content:center; }
      main { background:#fff; border-radius:12px; padding:28px; max-width:520px; width:100%; }
      h1 { margin:0 0 12px; font-size:20px; }
      p { margin:0 0 14px; font-size:14px; line-height:1.55; color:#4a4759; }
      p[lang="es"] { color:#6b6878; }
      button { appearance:none; border:0; border-radius:8px; padding:12px 18px;
               background:#211f2e; color:#fff; font-size:15px; font-weight:600; width:100%; }
      .note { font-size:12px; color:#6b6878; }
    </style>
  </head>
  <body><main>${body}</main></body>
</html>`;

const recipientOf = async (c: Context<AppEnv>) => {
  const token = c.req.param('token');
  if (!token) return null;
  const [row] = await db
    .create(c)
    .select({
      id: db.schema.dataEmailRecipient.id,
      email: db.schema.dataEmailRecipient.email,
      confirmedAt: db.schema.dataEmailRecipient.confirmedAt,
      unsubscribedAt: db.schema.dataEmailRecipient.unsubscribedAt,
      organization: db.schema.organization.name
    })
    .from(db.schema.dataEmailRecipient)
    .innerJoin(
      db.schema.organization,
      eq(db.schema.organization.id, db.schema.dataEmailRecipient.organizationId)
    )
    .where(eq(db.schema.dataEmailRecipient.token, token))
    .limit(1);
  return row ?? null;
};

type Recipient = NonNullable<Awaited<ReturnType<typeof recipientOf>>>;

const gone = (c: Context<AppEnv>) =>
  c.html(
    page(
      `<h1>This link is no longer valid</h1>
       <p lang="es">Este enlace ya no es válido.</p>
       <p class="note">Nothing was changed. / No se cambió nada.</p>`
    ),
    410
  );

const confirmedPage = (c: Context<AppEnv>, recipient: Recipient) => {
  const email = escape(recipient.email);
  const organization = escape(recipient.organization);
  return c.html(
    page(
      `<h1>Confirmed</h1>
       <p><strong>${email}</strong> now gets the emails
          <strong>${organization}</strong>'s projects send when their data
          changes. Each one has a link to stop them.</p>
       <p lang="es"><strong>${email}</strong> ahora recibe los correos que
          envían los proyectos de <strong>${organization}</strong> cuando
          cambian sus datos. Cada uno trae un enlace para dejar de recibirlos.</p>
       <form method="post" action="../unsubscribe/${escape(c.req.param('token') ?? '')}">
         <button type="submit">Stop them / Dejar de recibirlos</button>
       </form>`
    )
  );
};

const stoppedPage = (c: Context<AppEnv>, recipient: Recipient) =>
  c.html(
    page(
      `<h1>Unsubscribed</h1>
       <p><strong>${escape(recipient.email)}</strong> no longer gets emails
          from <strong>${escape(recipient.organization)}</strong>'s projects.</p>
       <p lang="es"><strong>${escape(recipient.email)}</strong> ya no recibe
          correos de los proyectos de
          <strong>${escape(recipient.organization)}</strong>.</p>`
    )
  );

const showConfirm = async (c: Context<AppEnv>) => {
  const recipient = await recipientOf(c);
  if (!recipient) return gone(c);
  if (recipient.unsubscribedAt) return stoppedPage(c, recipient);
  if (recipient.confirmedAt) return confirmedPage(c, recipient);
  const email = escape(recipient.email);
  const organization = escape(recipient.organization);
  return c.html(
    page(
      `<h1>Get emails from ${organization}?</h1>
       <p>A project of <strong>${organization}</strong> on Ganju wants to email
          <strong>${email}</strong> when its data changes, such as a new
          order.</p>
       <p lang="es">Un proyecto de <strong>${organization}</strong> en Ganju
          quiere enviarle correos a <strong>${email}</strong> cuando cambien
          sus datos, como un pedido nuevo.</p>
       <form method="post">
         <button type="submit">Yes, send them / Sí, enviarlos</button>
       </form>
       <p class="note" style="margin-top:16px;">
         If you didn't expect this, close this page: nothing is sent.
         / Si no lo esperabas, cierra esta página: no se envía nada.
       </p>`
    )
  );
};

const confirm = async (c: Context<AppEnv>) => {
  const recipient = await recipientOf(c);
  if (!recipient) return gone(c);
  if (recipient.unsubscribedAt) return stoppedPage(c, recipient);
  if (!recipient.confirmedAt) {
    await db
      .create(c)
      .update(db.schema.dataEmailRecipient)
      .set({ confirmedAt: new Date() })
      .where(eq(db.schema.dataEmailRecipient.id, recipient.id));
  }
  return confirmedPage(c, recipient);
};

const showUnsubscribe = async (c: Context<AppEnv>) => {
  const recipient = await recipientOf(c);
  if (!recipient) return gone(c);
  if (recipient.unsubscribedAt) return stoppedPage(c, recipient);
  const organization = escape(recipient.organization);
  return c.html(
    page(
      `<h1>Stop these emails?</h1>
       <p><strong>${escape(recipient.email)}</strong> stops getting the emails
          <strong>${organization}</strong>'s projects send.</p>
       <p lang="es"><strong>${escape(recipient.email)}</strong> deja de recibir
          los correos de los proyectos de <strong>${organization}</strong>.</p>
       <form method="post">
         <button type="submit">Unsubscribe / Darme de baja</button>
       </form>`
    )
  );
};

// Also what a mail client's one-click unsubscribe POSTs.
const unsubscribe = async (c: Context<AppEnv>) => {
  const recipient = await recipientOf(c);
  if (!recipient) return gone(c);
  if (!recipient.unsubscribedAt) {
    await db
      .create(c)
      .update(db.schema.dataEmailRecipient)
      .set({ unsubscribedAt: new Date() })
      .where(eq(db.schema.dataEmailRecipient.id, recipient.id));
  }
  return stoppedPage(c, recipient);
};

export const DataEmailController = {
  showConfirm,
  confirm,
  showUnsubscribe,
  unsubscribe
};
