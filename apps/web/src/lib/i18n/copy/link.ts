import type { Catalog } from '../core';

/**
 * `/link` — where someone pastes the code their bot handed them on Telegram,
 * Slack, WhatsApp or Discord to attach that chat account to their Ganju login.
 *
 * The `error*` keys are keyed by the API's own error codes
 * (`invalid_or_expired_code`, …), which is what lets the response stay English
 * on the wire while the reader sees their own language. `errorGeneric` covers
 * both an unrecognised code and a network failure.
 */
const en = {
  title: 'Link your account',
  subtitle:
    'Enter the code your bot gave you to connect it to your Ganju account.',
  codeLabel: 'Link code',
  codePlaceholder: 'e.g. G7K9P2QMX4WJ',
  submit: 'Link account',
  submitting: 'Linking...',

  errorEmpty: 'Enter the code from your bot',
  errorGeneric: 'Could not link your account. Please try again.',
  error_invalid_or_expired_code:
    'That code is invalid or has expired. Ask your bot for a new one.',
  error_expired_code: 'That code has expired. Ask your bot for a new one.',
  error_already_linked_to_other_user:
    'This account is already linked to a different Ganju user.',

  successTitle: 'Account linked',
  /** `{provider}` is a platform name — Telegram, Slack — and stays as it is. */
  successText:
    'Your {provider} account{name} is now connected to Ganju. You can head back to your bot.',
  /** Spliced into `{name}` above when the platform told us a display name. */
  successName: ' ({name})'
};

type LinkCopy = typeof en;

export const LINK: Catalog<LinkCopy> = {
  en,
  es: {
    title: 'Vincula tu cuenta',
    subtitle:
      'Escribe el código que te dio tu bot para conectarlo con tu cuenta de Ganju.',
    codeLabel: 'Código de vinculación',
    codePlaceholder: 'ej. G7K9P2QMX4WJ',
    submit: 'Vincular cuenta',
    submitting: 'Vinculando...',

    errorEmpty: 'Escribe el código que te dio tu bot',
    errorGeneric: 'No pudimos vincular tu cuenta. Inténtalo de nuevo.',
    error_invalid_or_expired_code:
      'Ese código no es válido o ya venció. Pídele uno nuevo a tu bot.',
    error_expired_code: 'Ese código ya venció. Pídele uno nuevo a tu bot.',
    error_already_linked_to_other_user:
      'Esta cuenta ya está vinculada a otro usuario de Ganju.',

    successTitle: 'Cuenta vinculada',
    successText:
      'Tu cuenta de {provider}{name} ya está conectada a Ganju. Puedes volver a tu bot.',
    successName: ' ({name})'
  }
};
