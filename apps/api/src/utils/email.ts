import { Context } from 'hono';
import { utils } from '@ganju/utils';

// types
import type { AppEnv } from '../types';

interface InvitationEmailInput {
  to: string;
  scope:
    | typeof utils.constants.INVITATION_SCOPE_ORGANIZATION
    | typeof utils.constants.INVITATION_SCOPE_PROJECT;
  targetName: string;
  inviterName: string;
  token: string;
}

export const sendInvitationEmail = async (
  c: Context<AppEnv>,
  input: InvitationEmailInput
): Promise<boolean> => {
  const sendEmail = c.env.SEND_EMAIL;
  if (!sendEmail) return false;

  const webUrl = utils.getEnv(c, 'NEXT_PUBLIC_WEB_URL')!;
  const domain = utils.getEnv(c, 'NEXT_PUBLIC_DOMAIN')!;

  const scopeLabel =
    input.scope === utils.constants.INVITATION_SCOPE_PROJECT
      ? 'project'
      : 'organization';
  const acceptUrl = `${webUrl}/invitation/${input.token}`;
  const expiryDays = utils.constants.INVITATION_EXPIRY_DAYS;

  const subject = `${input.inviterName} invited you to the ${input.targetName} ${scopeLabel}`;

  const text = [
    `${input.inviterName} has invited you to join the ${scopeLabel} "${input.targetName}" on Ganju.`,
    '',
    'Sign in to accept or decline this invitation:',
    acceptUrl,
    '',
    `This invitation expires in ${expiryDays} days.`
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
                <h1 style="margin:0 0 16px;font-size:20px;">You've been invited</h1>
                <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">
                  <strong>${inviter}</strong> has invited you to join the
                  ${scopeLabel} <strong>${target}</strong> on Ganju.
                </p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.5;">
                  Sign in with this email address to accept or decline the
                  invitation.
                </p>
                <a href="${acceptUrl}" style="display:inline-block;background:#1d1b2e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">
                  View invitation
                </a>
                <p style="margin:24px 0 0;font-size:12px;color:#6b6878;">
                  This invitation expires in ${expiryDays} days. If you weren't
                  expecting it, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  try {
    await sendEmail.send({
      from: `Ganju <noreply@${domain}>`,
      to: input.to,
      subject,
      text,
      html
    });
    return true;
  } catch (error) {
    console.error('Failed to send invitation email', error);
    return false;
  }
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
  const sendEmail = c.env.SEND_EMAIL;
  if (!sendEmail) return false;

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

  try {
    await sendEmail.send({
      from: `Ganju <noreply@${domain}>`,
      to,
      replyTo: input.email,
      subject,
      text,
      html
    });
    return true;
  } catch (error) {
    console.error('Failed to send contact email', error);
    return false;
  }
};
