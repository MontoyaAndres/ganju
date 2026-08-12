import type { Catalog } from '../core';

/**
 * `/organization/[id]/settings` and the two managers it embeds — billing and
 * members. One catalog for the three, because they share a page and a register:
 * `settings-section-title` says the same kind of thing in all of them.
 *
 * Plan names (`Free`, `Pro`, `Enterprise`) and Stripe's subscription status are
 * product vocabulary and stay as they are. So do the prices, which arrive from
 * the API already formatted in dollars.
 */
const en = {
  // Left-hand nav. Each also titles its own section.
  navOrganization: 'Organization',
  navBilling: 'Billing & plan',
  navMembers: 'Members',
  navProjects: 'Projects',
  navModels: 'Models',
  navAccount: 'Your data',
  navDanger: 'Danger zone',

  // Organization.
  organizationSubtitle:
    'Update your organization details and review the projects it owns.',
  metaCreated: 'Created',
  metaProjects: 'Projects',
  metaMembers: 'Members',
  organizationName: 'Organization name',
  saveChanges: 'Save changes',
  nameRequired: 'Name is required',
  toastOrganizationUpdated: 'Organization updated',
  toastOrganizationUpdateFailed: 'Failed to update organization',
  toastOrganizationRemoved: 'Organization removed',
  toastOrganizationRemoveFailed: 'Failed to remove organization',

  // Billing.
  billingSubtitle:
    "Your organization's plan, current usage, and subscription. Upgrade to Pro to lift the Free limits.",
  billingUnavailable: 'Billing is unavailable right now.',
  /** `{plan}` — Free, Pro or Enterprise. */
  planHeading: '{plan} plan',
  /** `{messages}` included/month and `{price}` in dollars. */
  upgradePitch:
    'Upgrade to Pro for unlimited tools, prompts, channels and team members, plus {messages} included messages/month — ${price}/mo.',
  planEnds: 'Your plan ends on {date}.',
  planEndsFallback: 'the period end',
  planRenews: 'Renews on {date}.',
  planActive: 'Your subscription is active.',
  upgradeAction: 'Upgrade to Pro',
  manageBilling: 'Manage billing',
  opening: 'Opening…',
  usageMessages: 'Assistant replies this month',
  usageEmbedded: 'Embedded content (RAG)',
  usageStorage: 'File storage',
  usageProjects: 'Projects',
  usageUnlimited: 'Unlimited',
  usageIncluded: 'included',
  /** `{amount}` over the allowance, `{rate}` the per-unit price. */
  usageOverage: '{amount} over · billed at {rate}',
  /**
   * Split around the "connect your own model" link, which scrolls the page
   * rather than navigating — so it has to be an element, not part of a string.
   */
  sharedCapOverBefore:
    "You've used your {count} included messages this month. ",
  sharedCapLink: 'connect your own model',
  sharedCapOverMiddle: 'Channels without their own model are paused — ',
  sharedCapOverAfter:
    ' to keep them running. Channels on their own key are unaffected.',
  sharedCapUnderBefore:
    'Up to {count}/mo run on our shared AI model; past that, ',
  sharedCapUnderAfter:
    " to keep default channels running. Only your assistant's replies count — incoming user messages are free.",
  messagesHintFree:
    "Only your assistant's replies count here. Incoming messages from users are free and don't use your allowance.",
  toastCheckoutSuccess: 'Subscription active — welcome to Pro!',
  toastCheckoutCancelled: 'Checkout cancelled.',
  toastBillingFailed: 'Could not open billing. Try again.',

  // Members (both scopes — organization and project).
  membersSubtitle:
    'People with access to this organization. Invite teammates by email — they accept the invitation in-app.',
  /** One key per scope: the article has to agree with the noun in Spanish. */
  membersDeniedOrganization:
    'You are not a member of this organization. Only basic information is available — ask an existing member to invite you.',
  membersDeniedProject:
    'You are not a member of this project. Only basic information is available — ask an existing member to invite you.',
  membersHeading: 'Members',
  memberYou: 'You',
  memberOwner: 'Owner',
  removeMember: 'Remove member',
  inviteLabel: 'Invite a teammate by email',
  invitePlaceholder: 'teammate@company.com',
  inviteAction: 'Invite',
  inviteSending: 'Sending...',
  inviteInvalidEmail: 'Enter a valid email address',
  pendingInvitations: 'Pending invitations',
  pendingBadge: 'Pending',
  /** `{name}` who sent it, `{date}` when. */
  invitedByOn: 'Invited by {name} · {date}',
  fallbackInviter: 'a teammate',
  revokeInvitation: 'Revoke invitation',
  confirmRemoveMemberTitle: 'Remove member',
  confirmRemoveMemberOrganization:
    'Remove {name} from this organization? They will lose access immediately.',
  confirmRemoveMemberProject:
    'Remove {name} from this project? They will lose access immediately.',
  confirmRemove: 'Remove',
  confirmRevokeTitle: 'Revoke invitation',
  confirmRevokeText:
    'Revoke the invitation for {email}? They will no longer be able to accept it.',
  confirmRevoke: 'Revoke',
  toastInviteSent: 'Invitation sent to {email}',
  toastInviteFailed: 'Failed to send invitation',
  toastMemberRemoved: 'Member removed',
  toastMemberRemoveFailed: 'Failed to remove member',
  toastInvitationRevoked: 'Invitation revoked',
  toastRevokeFailed: 'Failed to revoke invitation',

  // Projects.
  projectsSubtitle:
    'Projects under this organization. Open a project, or manage who can access it.',
  projectsEmpty: 'No projects yet.',
  projectMembers: 'Members',
  projectHideMembers: 'Hide members',
  projectOpen: 'Open →',

  // Models.
  modelsSubtitle:
    'The language models available to this organization. Channels can pick any of these, or fall back to the system default.',
  modelsConfigured: 'Configured models',
  modelsConfiguredHelp:
    'Add a model with its API key once and reuse it across any channel in the organization.',
  modelsAdd: 'Add model',
  modelsGated:
    'Connecting your own AI model is a Pro feature. Your channels run on the shared platform model — upgrade to Pro to add a custom model.',
  modelsEmpty:
    'No models configured yet. Add one to give your channels something to talk with.',
  modelCustomUrl: '· custom URL',
  modelEdit: 'Edit',
  modelRemove: 'Remove',
  modelFormEdit: 'Edit model',
  modelFormNew: 'New model',
  modelName: 'Display name',
  modelNamePlaceholder: 'e.g. Production Gemini',
  modelPick: 'Model',
  modelApiKey: 'API key',
  modelApiKeyKeep: 'API key (leave blank to keep)',
  modelBaseUrl: 'Base URL (optional)',
  modelSystemPrompt: 'System prompt (optional)',
  modelCreate: 'Create model',
  modelPickError: 'Pick a model',
  modelUnknown: 'Unknown model',
  modelApiKeyRequired: 'API key is required',
  toastModelAdded: 'Model added',
  toastModelUpdated: 'Model updated',
  toastModelSaveFailed: 'Failed to save model',
  toastModelRemoved: 'Model removed',
  toastModelRemoveFailed: 'Failed to remove model',
  confirmRemoveModelTitle: 'Remove model',
  confirmRemoveModelText:
    'Remove "{name}"? Channels using it must be re-pointed first.',
  confirmRemoveModelFallback: 'this model',

  // Your data.
  accountSubtitle:
    "Your personal data and the legal documents you've accepted. These apply to your account, not to this organization.",
  exportTitle: 'Export your data',
  exportHelp:
    'Download everything we hold about you as JSON — profile, sign-in methods, sessions, memberships, invitations you sent, and your acceptance record. Organization content (resources, prompts, conversations) belongs to the organization and is downloaded from its own pages.',
  exportAction: 'Download my data',
  exportPreparing: 'Preparing…',
  toastExportStarted: 'Your data is downloading',
  toastExportFailed: 'Could not export your data',
  consentTitle: 'Terms and privacy',
  consentAcceptedOn:
    'You accepted the current Terms and Privacy Policy on {date}.',
  consentPending:
    'Please review and accept the current Terms of Service and Privacy Policy.',
  consentReadTerms: 'Read the Terms',
  consentReadPrivacy: 'Read the Privacy Policy',
  consentAccept: 'I accept',
  consentSaving: 'Saving…',
  /** Per-language, the way the sign-in screen links them. */
  termsUrl: 'https://ganju.ai/terms',
  privacyUrl: 'https://ganju.ai/privacy',
  toastConsentRecorded: 'Thanks — your acceptance is on record',
  toastConsentFailed: 'Could not record your acceptance',

  // Danger zone.
  dangerSubtitle:
    'Permanent, irreversible actions. Export anything you want to keep first.',
  dangerOrgTitle: 'Remove organization',
  dangerOrgHelp:
    'Permanently delete this organization and everything inside it.',
  dangerIrreversible: 'This action cannot be undone.',
  dangerOrgWarning:
    ' Removing the organization will permanently delete every project, channel, conversation, message, resource, tool and language model it owns. Make sure you really want to do this.',
  dangerOrgAction: 'Remove organization',
  confirmRemoveOrgTitle: 'Remove organization?',
  confirmRemoveOrgText:
    'This will permanently delete "{name}" along with every project, channel, conversation, resource and model inside it. This cannot be undone.',
  confirmRemoveOrgFallback: 'this organization',
  confirmRemoveOrgAction: 'Yes, remove permanently',
  dangerAccountTitle: 'Delete your account',
  dangerAccountHelp: 'Permanently delete your Ganju account.',
  /** Split around `<em>own</em>` and the bold section name it points at. */
  dangerAccountWarningBefore:
    ' Your profile, sign-in methods, sessions, linked chat identities and acceptance record are deleted, and you are removed from every organization and project. Organizations you ',
  dangerAccountWarningOwn: 'own',
  dangerAccountWarningMiddle:
    ' must be deleted or transferred first. Export your data from ',
  dangerAccountWarningAfter: ' before you do this.',
  dangerAccountAction: 'Delete my account',
  confirmDeleteAccountTitle: 'Delete your account?',
  confirmDeleteAccountText:
    'This permanently deletes your profile, sign-in methods, sessions and acceptance record, and removes you from every organization and project. It cannot be undone.',
  confirmDeleteAccountAction: 'Yes, delete my account',
  /** `{names}` — the organizations blocking the deletion, comma-separated. */
  toastOwnedOrganizations:
    'Delete or transfer these organizations first: {names}',
  toastAccountDeleteFailed: 'Could not delete your account',

  // No access at all.
  noAccessTitle: 'No access',
  noAccessSubtitle:
    "You don't have access to this organization or any of its projects.",
  noAccessHint: 'Ask an admin to invite you to get access.',
  noAccessBack: 'Back to organizations'
};

type SettingsCopy = typeof en;

export const SETTINGS: Catalog<SettingsCopy> = {
  en,
  es: {
    navOrganization: 'Organización',
    navBilling: 'Plan y facturación',
    navMembers: 'Miembros',
    navProjects: 'Proyectos',
    navModels: 'Modelos',
    navAccount: 'Tus datos',
    navDanger: 'Zona de riesgo',

    organizationSubtitle:
      'Actualiza los datos de tu organización y revisa los proyectos que tiene.',
    metaCreated: 'Creada',
    metaProjects: 'Proyectos',
    metaMembers: 'Miembros',
    organizationName: 'Nombre de la organización',
    saveChanges: 'Guardar cambios',
    nameRequired: 'El nombre es obligatorio',
    toastOrganizationUpdated: 'Organización actualizada',
    toastOrganizationUpdateFailed: 'No pudimos actualizar la organización',
    toastOrganizationRemoved: 'Organización eliminada',
    toastOrganizationRemoveFailed: 'No pudimos eliminar la organización',

    billingSubtitle:
      'El plan de tu organización, su consumo actual y su suscripción. Pasa a Pro para levantar los límites del plan Gratis.',
    billingUnavailable: 'La facturación no está disponible en este momento.',
    planHeading: 'Plan {plan}',
    upgradePitch:
      'Pasa a Pro para tener herramientas, prompts, canales y miembros ilimitados, más {messages} mensajes incluidos al mes — {price} USD/mes.',
    planEnds: 'Tu plan termina el {date}.',
    planEndsFallback: 'el fin del periodo',
    planRenews: 'Se renueva el {date}.',
    planActive: 'Tu suscripción está activa.',
    upgradeAction: 'Pasar a Pro',
    manageBilling: 'Gestionar la facturación',
    opening: 'Abriendo…',
    usageMessages: 'Respuestas del asistente este mes',
    usageEmbedded: 'Contenido indexado (RAG)',
    usageStorage: 'Almacenamiento de archivos',
    usageProjects: 'Proyectos',
    usageUnlimited: 'Ilimitado',
    usageIncluded: 'incluidos',
    usageOverage: '{amount} de más · se cobra a {rate}',
    sharedCapOverBefore:
      'Ya usaste tus {count} mensajes incluidos de este mes. ',
    sharedCapLink: 'conecta tu propio modelo',
    sharedCapOverMiddle: 'Los canales sin modelo propio están pausados — ',
    sharedCapOverAfter:
      ' para que sigan funcionando. Los canales con su propia clave no se ven afectados.',
    sharedCapUnderBefore:
      'Hasta {count} al mes funcionan con nuestro modelo de IA compartido; después de eso, ',
    sharedCapUnderAfter:
      ' para que los canales por defecto sigan funcionando. Solo cuentan las respuestas de tu asistente — los mensajes que entran son gratis.',
    messagesHintFree:
      'Aquí solo cuentan las respuestas de tu asistente. Los mensajes que te envían son gratis y no consumen tu cupo.',
    toastCheckoutSuccess: 'Suscripción activa — ¡bienvenido a Pro!',
    toastCheckoutCancelled: 'Cancelaste el pago.',
    toastBillingFailed: 'No pudimos abrir la facturación. Inténtalo de nuevo.',

    membersSubtitle:
      'Las personas con acceso a esta organización. Invita a tu equipo por correo — aceptan la invitación dentro de la app.',
    membersDeniedOrganization:
      'No eres miembro de esta organización. Solo hay información básica disponible — pídele a un miembro que te invite.',
    membersDeniedProject:
      'No eres miembro de este proyecto. Solo hay información básica disponible — pídele a un miembro que te invite.',
    membersHeading: 'Miembros',
    memberYou: 'Tú',
    memberOwner: 'Propietario',
    removeMember: 'Quitar miembro',
    inviteLabel: 'Invita a alguien de tu equipo por correo',
    invitePlaceholder: 'companero@empresa.com',
    inviteAction: 'Invitar',
    inviteSending: 'Enviando...',
    inviteInvalidEmail: 'Escribe un correo electrónico válido',
    pendingInvitations: 'Invitaciones pendientes',
    pendingBadge: 'Pendiente',
    invitedByOn: 'Invitó {name} · {date}',
    fallbackInviter: 'alguien de tu equipo',
    revokeInvitation: 'Revocar la invitación',
    confirmRemoveMemberTitle: 'Quitar miembro',
    confirmRemoveMemberOrganization:
      '¿Quitar a {name} de esta organización? Perderá el acceso de inmediato.',
    confirmRemoveMemberProject:
      '¿Quitar a {name} de este proyecto? Perderá el acceso de inmediato.',
    confirmRemove: 'Quitar',
    confirmRevokeTitle: 'Revocar la invitación',
    confirmRevokeText:
      '¿Revocar la invitación de {email}? Ya no podrá aceptarla.',
    confirmRevoke: 'Revocar',
    toastInviteSent: 'Invitación enviada a {email}',
    toastInviteFailed: 'No pudimos enviar la invitación',
    toastMemberRemoved: 'Miembro eliminado',
    toastMemberRemoveFailed: 'No pudimos quitar al miembro',
    toastInvitationRevoked: 'Invitación revocada',
    toastRevokeFailed: 'No pudimos revocar la invitación',

    projectsSubtitle:
      'Los proyectos de esta organización. Abre uno o gestiona quién puede entrar.',
    projectsEmpty: 'Todavía no hay proyectos.',
    projectMembers: 'Miembros',
    projectHideMembers: 'Ocultar miembros',
    projectOpen: 'Abrir →',

    modelsSubtitle:
      'Los modelos de lenguaje disponibles para esta organización. Cada canal puede elegir uno o usar el modelo por defecto.',
    modelsConfigured: 'Modelos configurados',
    modelsConfiguredHelp:
      'Agrega un modelo con su clave de API una sola vez y reutilízalo en cualquier canal de la organización.',
    modelsAdd: 'Agregar modelo',
    modelsGated:
      'Conectar tu propio modelo de IA es una función de Pro. Tus canales funcionan con el modelo compartido de la plataforma — pasa a Pro para agregar uno propio.',
    modelsEmpty:
      'Todavía no hay modelos configurados. Agrega uno para que tus canales tengan con qué responder.',
    modelCustomUrl: '· URL personalizada',
    modelEdit: 'Editar',
    modelRemove: 'Quitar',
    modelFormEdit: 'Editar modelo',
    modelFormNew: 'Nuevo modelo',
    modelName: 'Nombre visible',
    modelNamePlaceholder: 'ej. Gemini de producción',
    modelPick: 'Modelo',
    modelApiKey: 'Clave de API',
    modelApiKeyKeep: 'Clave de API (déjala vacía para conservarla)',
    modelBaseUrl: 'URL base (opcional)',
    modelSystemPrompt: 'Prompt de sistema (opcional)',
    modelCreate: 'Crear modelo',
    modelPickError: 'Elige un modelo',
    modelUnknown: 'Modelo desconocido',
    modelApiKeyRequired: 'La clave de API es obligatoria',
    toastModelAdded: 'Modelo agregado',
    toastModelUpdated: 'Modelo actualizado',
    toastModelSaveFailed: 'No pudimos guardar el modelo',
    toastModelRemoved: 'Modelo eliminado',
    toastModelRemoveFailed: 'No pudimos eliminar el modelo',
    confirmRemoveModelTitle: 'Quitar modelo',
    confirmRemoveModelText:
      '¿Quitar «{name}»? Primero hay que reasignar los canales que lo usan.',
    confirmRemoveModelFallback: 'este modelo',

    accountSubtitle:
      'Tus datos personales y los documentos legales que aceptaste. Aplican a tu cuenta, no a esta organización.',
    exportTitle: 'Exporta tus datos',
    exportHelp:
      'Descarga en JSON todo lo que tenemos sobre ti — perfil, métodos de inicio de sesión, sesiones, membresías, invitaciones que enviaste y tu registro de aceptación. El contenido de la organización (recursos, prompts, conversaciones) le pertenece a la organización y se descarga desde sus propias páginas.',
    exportAction: 'Descargar mis datos',
    exportPreparing: 'Preparando…',
    toastExportStarted: 'Tus datos se están descargando',
    toastExportFailed: 'No pudimos exportar tus datos',
    consentTitle: 'Términos y privacidad',
    consentAcceptedOn:
      'Aceptaste los Términos y la Política de Privacidad vigentes el {date}.',
    consentPending:
      'Revisa y acepta los Términos de Servicio y la Política de Privacidad vigentes.',
    consentReadTerms: 'Leer los Términos',
    consentReadPrivacy: 'Leer la Política de Privacidad',
    consentAccept: 'Acepto',
    consentSaving: 'Guardando…',
    termsUrl: 'https://ganju.ai/es/terminos',
    privacyUrl: 'https://ganju.ai/es/privacidad',
    toastConsentRecorded: 'Gracias — tu aceptación quedó registrada',
    toastConsentFailed: 'No pudimos registrar tu aceptación',

    dangerSubtitle:
      'Acciones permanentes e irreversibles. Exporta antes lo que quieras conservar.',
    dangerOrgTitle: 'Eliminar la organización',
    dangerOrgHelp:
      'Elimina para siempre esta organización y todo lo que contiene.',
    dangerIrreversible: 'Esta acción no se puede deshacer.',
    dangerOrgWarning:
      ' Al eliminar la organización se borran para siempre todos sus proyectos, canales, conversaciones, mensajes, recursos, herramientas y modelos de lenguaje. Asegúrate de que es lo que quieres.',
    dangerOrgAction: 'Eliminar la organización',
    confirmRemoveOrgTitle: '¿Eliminar la organización?',
    confirmRemoveOrgText:
      'Esto elimina para siempre «{name}» junto con todos sus proyectos, canales, conversaciones, recursos y modelos. No se puede deshacer.',
    confirmRemoveOrgFallback: 'esta organización',
    confirmRemoveOrgAction: 'Sí, eliminar para siempre',
    dangerAccountTitle: 'Eliminar tu cuenta',
    dangerAccountHelp: 'Elimina para siempre tu cuenta de Ganju.',
    dangerAccountWarningBefore:
      ' Se borran tu perfil, tus métodos de inicio de sesión, tus sesiones, tus identidades de chat vinculadas y tu registro de aceptación, y sales de todas las organizaciones y proyectos. Las organizaciones que ',
    dangerAccountWarningOwn: 'te pertenecen',
    dangerAccountWarningMiddle:
      ' hay que eliminarlas o transferirlas primero. Exporta tus datos desde ',
    dangerAccountWarningAfter: ' antes de hacerlo.',
    dangerAccountAction: 'Eliminar mi cuenta',
    confirmDeleteAccountTitle: '¿Eliminar tu cuenta?',
    confirmDeleteAccountText:
      'Esto elimina para siempre tu perfil, tus métodos de inicio de sesión, tus sesiones y tu registro de aceptación, y te saca de todas las organizaciones y proyectos. No se puede deshacer.',
    confirmDeleteAccountAction: 'Sí, eliminar mi cuenta',
    toastOwnedOrganizations:
      'Primero elimina o transfiere estas organizaciones: {names}',
    toastAccountDeleteFailed: 'No pudimos eliminar tu cuenta',

    noAccessTitle: 'Sin acceso',
    noAccessSubtitle:
      'No tienes acceso a esta organización ni a ninguno de sus proyectos.',
    noAccessHint: 'Pídele a un administrador que te invite para tener acceso.',
    noAccessBack: 'Volver a las organizaciones'
  }
};
