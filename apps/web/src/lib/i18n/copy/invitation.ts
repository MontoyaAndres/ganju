import type { Catalog } from '../core';

/**
 * `/invitation/[token]` — the page a teammate lands on from an invite email.
 *
 * Several sentences here are split around an element the view renders itself —
 * the workspace name, the invited address in `<strong>`. JSX cannot be spliced
 * into a translated string, so those become a `Before`/`After` pair, and both
 * languages have to keep the same two slots in the same order.
 */
const en = {
  eyebrow: 'Invitation',
  scopeOrganization: 'organization',
  scopeProject: 'project',
  /** Stands in for the workspace name when the API returned none. */
  fallbackTarget: 'a workspace',
  /** Stands in for the inviter's name when the API returned none. */
  fallbackInviter: 'A teammate',

  acceptedTitle: "You're in",
  acceptedText:
    'The invitation has been accepted. You now have access to this workspace.',
  goToDashboard: 'Go to dashboard',

  declinedTitle: 'Invitation declined',
  declinedText: "You've declined this invitation. No access was granted.",
  goToGanju: 'Go to Ganju',

  notFoundTitle: 'Invitation not found',
  notFoundText:
    'This invitation link is invalid. Ask whoever invited you to send a new one.',

  unavailableTitle: 'Invitation unavailable',
  unavailableText:
    'This invitation to {target} has already been used or was revoked.',

  expiredTitle: 'Invitation expired',
  expiredText:
    'This invitation to {target} has expired. Ask whoever invited you to send a new one.',

  invitedTitle: "You've been invited",
  /** `{inviter}` and `{target}` — the second is rendered as its own element. */
  invitedTextBefore: '{inviter} invited you to join ',
  invitedTextAfter: ' on Ganju.',

  accept: 'Accept invitation',
  accepting: 'Accepting...',
  decline: 'Decline',
  declining: 'Declining...',
  /**
   * One key per scope rather than a `{scope}` slot: Spanish needs the article
   * to agree with the noun (`a esta organización` / `a este proyecto`), and a
   * gendered article cannot be derived from the noun at runtime.
   */
  acceptNoteOrganization: 'Accepting adds {email} to this organization.',
  acceptNoteProject: 'Accepting adds {email} to this project.',

  wrongAccountBefore: 'This invitation was sent to ',
  wrongAccountBetween: ', but you are signed in as ',
  wrongAccountAfter: '. Sign in with the invited address to accept it.',

  signInBefore: 'Sign in or create an account with ',
  signInAfter: ' to accept this invitation.',
  signInAction: 'Sign in to accept',

  toastAccepted: 'Invitation accepted',
  toastFailed: 'Failed to respond to invitation'
};

type InvitationCopy = typeof en;

export const INVITATION: Catalog<InvitationCopy> = {
  en,
  es: {
    eyebrow: 'Invitación',
    scopeOrganization: 'organización',
    scopeProject: 'proyecto',
    fallbackTarget: 'un espacio de trabajo',
    fallbackInviter: 'Alguien de tu equipo',

    acceptedTitle: 'Ya estás dentro',
    acceptedText:
      'Aceptaste la invitación. Ya tienes acceso a este espacio de trabajo.',
    goToDashboard: 'Ir al panel',

    declinedTitle: 'Invitación rechazada',
    declinedText: 'Rechazaste esta invitación. No se te dio ningún acceso.',
    goToGanju: 'Ir a Ganju',

    notFoundTitle: 'No encontramos la invitación',
    notFoundText:
      'Este enlace de invitación no es válido. Pídele a quien te invitó que te envíe uno nuevo.',

    unavailableTitle: 'Invitación no disponible',
    unavailableText: 'Esta invitación a {target} ya se usó o fue revocada.',

    expiredTitle: 'Invitación vencida',
    expiredText:
      'Esta invitación a {target} ya venció. Pídele a quien te invitó que te envíe una nueva.',

    invitedTitle: 'Te invitaron',
    invitedTextBefore: '{inviter} te invitó a unirte a ',
    invitedTextAfter: ' en Ganju.',

    accept: 'Aceptar invitación',
    accepting: 'Aceptando...',
    decline: 'Rechazar',
    declining: 'Rechazando...',
    acceptNoteOrganization:
      'Al aceptar, agregamos {email} a esta organización.',
    acceptNoteProject: 'Al aceptar, agregamos {email} a este proyecto.',

    wrongAccountBefore: 'Esta invitación se envió a ',
    wrongAccountBetween: ', pero iniciaste sesión como ',
    wrongAccountAfter: '. Inicia sesión con el correo invitado para aceptarla.',

    signInBefore: 'Inicia sesión o crea una cuenta con ',
    signInAfter: ' para aceptar esta invitación.',
    signInAction: 'Iniciar sesión para aceptar',

    toastAccepted: 'Invitación aceptada',
    toastFailed: 'No pudimos responder a la invitación'
  }
};
