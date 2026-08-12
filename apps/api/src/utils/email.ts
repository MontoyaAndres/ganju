import { Context } from 'hono';
import { utils } from '@ganju/utils';

// types
import type { EnvSource } from '@ganju/utils';
import type { AppEnv, Bindings } from '../types';

// A Hono Context satisfies this, and so does the bare `{ env }` a cron handler
// has — which is what lets the alerting sweep send mail without a request.
export type EmailSource = EnvSource & { env: Bindings };

interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

/**
 * `Ganju <noreply@ganju.ai>` is the readable form to keep in config, but the
 * binding wants the display name and the address as separate fields.
 */
const parseAddress = (
  value: string
): { name: string; email: string } | string => {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return value.trim();
  const [, name, email] = match;
  return name ? { name, email } : email;
};

/**
 * Single exit point for transactional mail, sent through Cloudflare Email
 * Service via the `SEND_EMAIL` send binding.
 *
 * Reaching arbitrary recipients — which invitations, and the notice obligations
 * in the Privacy Policy, Terms, and DPA, all depend on — requires the sending
 * domain to be onboarded to Email Service in the dashboard (MX/SPF/DKIM/DMARC).
 * Until that's done the binding only delivers to addresses verified as Email
 * Routing destinations on the account. `wrangler dev` never sends: it logs the
 * message and writes the bodies to local files.
 */
export const deliver = async (
  c: EmailSource,
  email: OutboundEmail
): Promise<boolean> => {
  const domain = utils.getEnv(c, 'NEXT_PUBLIC_DOMAIN')!;
  const from = utils.getEnv(c, 'EMAIL_FROM') || `Ganju <noreply@${domain}>`;

  const sendEmail = c.env.SEND_EMAIL;
  if (!sendEmail) {
    console.error(
      `No email transport configured — dropped "${email.subject}" to ${email.to}. ` +
        'Add a [[send_email]] binding named SEND_EMAIL to wrangler.toml.'
    );
    return false;
  }

  try {
    await sendEmail.send({ ...email, from: parseAddress(from) });
    return true;
  } catch (error) {
    // The binding throws with a `code` (E_SENDER_NOT_VERIFIED,
    // E_RATE_LIMIT_EXCEEDED, …); most causes here are configuration, not
    // transient — an un-onboarded sending domain or an unverified recipient.
    const code = (error as { code?: string }).code;
    console.error(
      `Failed to send "${email.subject}"${code ? ` (${code})` : ''}`,
      error
    );
    return false;
  }
};

interface InvitationEmailInput {
  to: string;
  scope:
    | typeof utils.constants.INVITATION_SCOPE_ORGANIZATION
    | typeof utils.constants.INVITATION_SCOPE_PROJECT;
  targetName: string;
  inviterName: string;
  token: string;
}

/**
 * The invitation email, in each language the product speaks.
 *
 * This is the one piece of transactional copy a person outside the account ever
 * reads, and it is the link the invitation page's own language switcher exists
 * for. `apps/api` has no catalog machinery, so it lives here as a plain record
 * of functions — the same shape the dashboard's catalogs take, minus the
 * `{placeholder}` layer, which buys nothing for six strings.
 *
 * Every sentence that names the target is written once per scope rather than
 * splicing a noun: `la organización` and `el proyecto` disagree in Spanish, and
 * no amount of interpolation fixes an article.
 */
interface InvitationCopy {
  subject: (inviter: string, target: string, isProject: boolean) => string;
  /** Plain-text body, which is also what a client with images off shows. */
  intro: (inviter: string, target: string, isProject: boolean) => string;
  signInText: string;
  heading: string;
  /** The same sentence as `intro`, with `<strong>` around the two names. */
  introHtml: (inviter: string, target: string, isProject: boolean) => string;
  signInHtml: string;
  cta: string;
  expiryText: (days: number) => string;
  expiryHtml: (days: number) => string;
}

const INVITATION_COPY: Record<string, InvitationCopy> = {
  [utils.constants.LANGUAGE_EN]: {
    subject: (inviter, target, isProject) =>
      `${inviter} invited you to the ${target} ${isProject ? 'project' : 'organization'}`,
    intro: (inviter, target, isProject) =>
      `${inviter} has invited you to join the ${isProject ? 'project' : 'organization'} "${target}" on Ganju.`,
    signInText: 'Sign in to accept or decline this invitation:',
    heading: "You've been invited",
    introHtml: (inviter, target, isProject) =>
      `<strong>${inviter}</strong> has invited you to join the ${isProject ? 'project' : 'organization'} <strong>${target}</strong> on Ganju.`,
    signInHtml:
      'Sign in with this email address to accept or decline the invitation.',
    cta: 'View invitation',
    expiryText: days => `This invitation expires in ${days} days.`,
    expiryHtml: days =>
      `This invitation expires in ${days} days. If you weren't expecting it, you can safely ignore this email.`
  },
  [utils.constants.LANGUAGE_ES]: {
    subject: (inviter, target, isProject) =>
      isProject
        ? `${inviter} te invitó al proyecto ${target}`
        : `${inviter} te invitó a la organización ${target}`,
    intro: (inviter, target, isProject) =>
      isProject
        ? `${inviter} te invitó a unirte al proyecto "${target}" en Ganju.`
        : `${inviter} te invitó a unirte a la organización "${target}" en Ganju.`,
    signInText: 'Inicia sesión para aceptar o rechazar esta invitación:',
    heading: 'Tienes una invitación',
    introHtml: (inviter, target, isProject) =>
      isProject
        ? `<strong>${inviter}</strong> te invitó a unirte al proyecto <strong>${target}</strong> en Ganju.`
        : `<strong>${inviter}</strong> te invitó a unirte a la organización <strong>${target}</strong> en Ganju.`,
    signInHtml:
      'Inicia sesión con este correo para aceptar o rechazar la invitación.',
    cta: 'Ver la invitación',
    expiryText: days => `Esta invitación vence en ${days} días.`,
    expiryHtml: days =>
      `Esta invitación vence en ${days} días. Si no la esperabas, puedes ignorar este correo.`
  }
};

export const sendInvitationEmail = async (
  c: Context<AppEnv>,
  input: InvitationEmailInput
): Promise<boolean> => {
  const webUrl = utils.getEnv(c, 'NEXT_PUBLIC_WEB_URL')!;

  // The `Accept-Language` the dashboard sent, which is the **inviter's**
  // language, not the recipient's — we have no account for them yet, so there
  // is nothing else to go on. A team writing to a colleague is the common case
  // and they usually share a language; when they do not, the invitation page
  // the link opens carries its own switcher.
  const language = utils.languageFromHeader(c.req.header('accept-language'));
  const copy =
    INVITATION_COPY[language] ?? INVITATION_COPY[utils.constants.LANGUAGE_EN];

  const isProject = input.scope === utils.constants.INVITATION_SCOPE_PROJECT;
  const acceptUrl = `${webUrl}/invitation/${input.token}`;
  const expiryDays = utils.constants.INVITATION_EXPIRY_DAYS;

  const subject = copy.subject(input.inviterName, input.targetName, isProject);

  const text = [
    copy.intro(input.inviterName, input.targetName, isProject),
    '',
    copy.signInText,
    acceptUrl,
    '',
    copy.expiryText(expiryDays)
  ].join('\n');

  const inviter = utils.escapeHtml(input.inviterName);
  const target = utils.escapeHtml(input.targetName);
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1b2e;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <h1 style="margin:0 0 16px;font-size:20px;">${copy.heading}</h1>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">
                  ${copy.introHtml(inviter, target, isProject)}
                </p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.5;">
                  ${copy.signInHtml}
                </p>
                <a href="${acceptUrl}" style="display:inline-block;background:#1d1b2e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">
                  ${copy.cta}
                </a>
                <p style="margin:24px 0 0;font-size:12px;color:#6b6878;">
                  ${copy.expiryHtml(expiryDays)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return deliver(c, { to: input.to, subject, text, html });
};

interface ContactEmailInput {
  name: string;
  email: string;
  message: string;
}

export const sendContactEmail = async (
  c: Context<AppEnv>,
  input: ContactEmailInput
): Promise<boolean> => {
  const domain = utils.getEnv(c, 'NEXT_PUBLIC_DOMAIN')!;
  const to = `hello@${domain}`;

  const subject = `New contact message from ${input.name}`;

  const text = [
    `From: ${input.name}`,
    `Email: ${input.email}`,
    '',
    input.message
  ].join('\n');

  const name = utils.escapeHtml(input.name);
  const email = utils.escapeHtml(input.email);
  const message = utils.escapeHtml(input.message).replace(/\n/g, '<br />');
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1b2e;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <h1 style="margin:0 0 16px;font-size:20px;">New contact message</h1>
                <p style="margin:0 0 8px;font-size:14px;line-height:1.5;">
                  <strong>From:</strong> ${name}
                </p>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">
                  <strong>Email:</strong> <a href="mailto:${email}">${email}</a>
                </p>
                <p style="margin:0;font-size:14px;line-height:1.6;">${message}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  // Reply-To is the visitor, so hitting reply in the team inbox answers them
  // directly rather than the no-reply sender.
  return deliver(c, { to, subject, text, html, replyTo: input.email });
};
