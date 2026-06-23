import { Context } from 'hono';
import { utils } from '@ganju/utils';

import { sendContactEmail } from '../../utils';

// types
import { AppEnv } from '../../types';

const create = async (c: Context<AppEnv>) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request body.' }, 400);
  }

  const parsed = utils.Schema.CONTACT_MESSAGE.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message ?? 'Please check the form.' },
      400
    );
  }

  const { name, email, message, company_url: honeypot } = parsed.data;

  if (honeypot && honeypot.trim() !== '') {
    return c.json({ ok: true });
  }

  const sent = await sendContactEmail(c, { name, email, message });
  if (!sent) {
    return c.json(
      { error: 'We could not send your message right now. Please try again.' },
      502
    );
  }

  return c.json({ ok: true });
};

export const ContactController = { create };
