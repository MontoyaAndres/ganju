import type { Catalog } from '../core';

/**
 * `/tool-approval/[approvalId]` — where someone approves or denies one action
 * an AI assistant connected to their MCP server asked to take, after it had
 * read outside content. The link comes from the assistant's own chat, so the
 * page says plainly what will happen and leaves the decision to the reader.
 *
 * `toolLine` is split around the tool's name, which the view renders as code.
 */
const en = {
  eyebrow: 'Approval',
  /** Stands in for the server name when the API returned none. */
  fallbackProject: 'your MCP server',

  pendingTitle: 'An assistant wants to take an action',
  pendingText:
    'Your AI assistant asked to run this on {project}. It read outside content earlier in the conversation — an email, a web page, another server — which could have been written to steer it, so this needs your own yes.',
  toolLineBefore: 'Action: ',
  toolLineAfter: '',
  argumentsHeading: 'With these details',
  noArguments: 'No details.',
  expiresNote: 'Requests expire 10 minutes after the assistant makes them.',
  checkNote:
    'Only approve it if you asked for this, and the details are what you expect. If anything looks off, deny it — nothing runs until you approve.',
  approve: 'Approve',
  approving: 'Approving...',
  deny: 'Deny',
  denying: 'Denying...',

  approvedTitle: 'Approved',
  approvedText:
    'Go back to your assistant and tell it you approved. It will run the action once, with exactly these details.',
  deniedTitle: 'Denied',
  deniedText: 'Nothing was run. You can tell your assistant you denied it.',
  usedTitle: 'Already done',
  usedText: 'This approval was already used. It can only run once.',
  expiredTitle: 'Request expired',
  expiredText:
    'This request is no longer open. If you still want the action, ask your assistant again and approve the new request.',

  notFoundTitle: 'Request not found',
  notFoundText:
    "This link is invalid, or it was made for a different account. Approvals can only be given by the person signed in to the assistant's connection.",
  signInTitle: 'Sign in to answer',
  signInText:
    'Sign in with the account your assistant is connected as, then open this link again.',
  signInAction: 'Sign in',
  goToDashboard: 'Go to dashboard',

  toastFailed: 'Failed to answer this request'
};

type ToolApprovalCopy = typeof en;

export const TOOL_APPROVAL: Catalog<ToolApprovalCopy> = {
  en,
  es: {
    eyebrow: 'Aprobación',
    fallbackProject: 'tu servidor MCP',

    pendingTitle: 'Un asistente quiere hacer una acción',
    pendingText:
      'Tu asistente de IA pidió ejecutar esto en {project}. Antes en la conversación leyó contenido externo — un correo, una página web, otro servidor — que pudo estar escrito para manipularlo, así que necesita tu propio sí.',
    toolLineBefore: 'Acción: ',
    toolLineAfter: '',
    argumentsHeading: 'Con estos datos',
    noArguments: 'Sin datos.',
    expiresNote:
      'Las solicitudes vencen 10 minutos después de que el asistente las hace.',
    checkNote:
      'Apruébala solo si tú la pediste y los datos son los que esperas. Si algo no cuadra, recházala: nada se ejecuta hasta que la apruebes.',
    approve: 'Aprobar',
    approving: 'Aprobando...',
    deny: 'Rechazar',
    denying: 'Rechazando...',

    approvedTitle: 'Aprobada',
    approvedText:
      'Vuelve a tu asistente y dile que la aprobaste. Ejecutará la acción una sola vez, exactamente con estos datos.',
    deniedTitle: 'Rechazada',
    deniedText:
      'No se ejecutó nada. Puedes decirle a tu asistente que la rechazaste.',
    usedTitle: 'Ya se hizo',
    usedText: 'Esta aprobación ya se usó. Solo puede ejecutarse una vez.',
    expiredTitle: 'Solicitud vencida',
    expiredText:
      'Esta solicitud ya no está abierta. Si aún quieres la acción, pídesela de nuevo a tu asistente y aprueba la nueva solicitud.',

    notFoundTitle: 'No encontramos la solicitud',
    notFoundText:
      'Este enlace no es válido, o se hizo para otra cuenta. Solo puede aprobarla la persona con la que el asistente está conectado.',
    signInTitle: 'Inicia sesión para responder',
    signInText:
      'Inicia sesión con la cuenta con la que está conectado tu asistente y vuelve a abrir este enlace.',
    signInAction: 'Iniciar sesión',
    goToDashboard: 'Ir al panel',

    toastFailed: 'No pudimos responder a esta solicitud'
  }
};
