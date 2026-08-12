import type { Catalog } from '../core';

/**
 * `/organization` — the list of workspaces, the invitations waiting for you,
 * and the first-run form that creates your first one.
 *
 * The plan labels (`Free`, `Pro`, `Enterprise`) are product names and stay as
 * they are in both languages, the way the pricing page writes them.
 */
const en = {
  // First run: no organizations, nothing to accept.
  onboardingTitle: 'Create Your Organization',
  onboardingSubtitle: 'Set up your workspace to start building with AI',

  // The list.
  title: 'Organizations',
  subtitle: 'You are a member of the following organizations:',
  newOrganization: 'New organization',
  emptyText:
    'You are not part of any organization yet. Accept an invitation above, or create your own.',
  emptyAction: 'Create organization',

  // Invitations addressed to you.
  invitationsTitle: 'Your invitations',
  invitationsSubtitle: "You've been invited to the following workspaces.",
  invitationProject: 'Project',
  invitationOrganization: 'Organization',
  /** `{name}` — who sent it, or the fallback below. */
  invitedBy: 'Invited by {name}',
  fallbackInviter: 'a teammate',
  fallbackTarget: 'a workspace',
  accept: 'Accept',
  decline: 'Decline',
  working: 'Working...',

  // Organization card.
  badgeOwner: 'Owner',
  badgeProjectAccess: 'Project access',
  infoProjects: 'Projects: {count}',
  infoMembers: 'Members: {count}',
  infoCreated: 'Created {date}',
  invite: 'Invite',
  settings: 'Settings',
  /** Shown to someone on a project but not on the organization itself. */
  basicNote_one:
    'You have access to {count} project in this organization. Ask an admin to invite you for full access.',
  basicNote_other:
    'You have access to {count} projects in this organization. Ask an admin to invite you for full access.',

  // Create form and modal — the two say the same thing at different lengths.
  sectionOrganization: 'Organization',
  sectionOrganizationHelp:
    'An organization is your workspace where you manage teams and projects.',
  sectionOrganizationHelpShort:
    'This is your workspace name. You can change it later.',
  sectionProject: 'Project',
  sectionProjectHelp: 'A project contains your AI agents and configurations.',
  sectionProjectHelpShort: 'Every organization starts with one project.',
  name: 'Name',
  namePlaceholder: 'Enter organization name',
  projectName: 'Project name',
  projectNamePlaceholder: 'Enter your project name',
  projectDescription: 'Project description',
  projectDescriptionPlaceholder: 'Describe your project',
  description: 'Description',
  submit: 'Create Organization',
  modalTitle: 'Create a new organization',

  // Invite modal.
  /** `{name}` — the organization being invited to. */
  inviteTitle: 'Invite to {name}',
  inviteEmail: 'Email',
  inviteEmailPlaceholder: 'teammate@company.com',
  inviteHint:
    "They'll receive an email and can accept the invitation once signed in with this address.",
  inviteSubmit: 'Send invitation',
  inviteSending: 'Sending...',
  inviteInvalidEmail: 'Enter a valid email address',

  // Feedback.
  toastInvitationAccepted: 'Invitation accepted',
  toastInvitationDeclined: 'Invitation declined',
  toastRespondFailed: 'Failed to respond to invitation',
  /** `{email}` — who it went to. */
  toastInviteSent: 'Invitation sent to {email}',
  toastInviteFailed: 'Failed to send invitation'
};

type OrganizationCopy = typeof en;

export const ORGANIZATION: Catalog<OrganizationCopy> = {
  en,
  es: {
    onboardingTitle: 'Crea tu organización',
    onboardingSubtitle:
      'Configura tu espacio de trabajo para empezar a construir con IA',

    title: 'Organizaciones',
    subtitle: 'Eres miembro de estas organizaciones:',
    newOrganization: 'Nueva organización',
    emptyText:
      'Todavía no perteneces a ninguna organización. Acepta una invitación arriba o crea la tuya.',
    emptyAction: 'Crear organización',

    invitationsTitle: 'Tus invitaciones',
    invitationsSubtitle: 'Te invitaron a estos espacios de trabajo.',
    invitationProject: 'Proyecto',
    invitationOrganization: 'Organización',
    invitedBy: 'Te invitó {name}',
    fallbackInviter: 'alguien de tu equipo',
    fallbackTarget: 'un espacio de trabajo',
    accept: 'Aceptar',
    decline: 'Rechazar',
    working: 'Procesando...',

    badgeOwner: 'Propietario',
    badgeProjectAccess: 'Acceso al proyecto',
    infoProjects: 'Proyectos: {count}',
    infoMembers: 'Miembros: {count}',
    infoCreated: 'Creada el {date}',
    invite: 'Invitar',
    settings: 'Ajustes',
    basicNote_one:
      'Tienes acceso a {count} proyecto de esta organización. Pídele a un administrador que te invite para tener acceso completo.',
    basicNote_other:
      'Tienes acceso a {count} proyectos de esta organización. Pídele a un administrador que te invite para tener acceso completo.',

    sectionOrganization: 'Organización',
    sectionOrganizationHelp:
      'Una organización es tu espacio de trabajo, donde gestionas equipos y proyectos.',
    sectionOrganizationHelpShort:
      'Este es el nombre de tu espacio de trabajo. Puedes cambiarlo después.',
    sectionProject: 'Proyecto',
    sectionProjectHelp:
      'Un proyecto contiene tus agentes de IA y su configuración.',
    sectionProjectHelpShort: 'Cada organización empieza con un proyecto.',
    name: 'Nombre',
    namePlaceholder: 'Escribe el nombre de la organización',
    projectName: 'Nombre del proyecto',
    projectNamePlaceholder: 'Escribe el nombre de tu proyecto',
    projectDescription: 'Descripción del proyecto',
    projectDescriptionPlaceholder: 'Describe tu proyecto',
    description: 'Descripción',
    submit: 'Crear organización',
    modalTitle: 'Crear una organización',

    inviteTitle: 'Invitar a {name}',
    inviteEmail: 'Correo electrónico',
    inviteEmailPlaceholder: 'companero@empresa.com',
    inviteHint:
      'Recibirá un correo y podrá aceptar la invitación cuando inicie sesión con esa dirección.',
    inviteSubmit: 'Enviar invitación',
    inviteSending: 'Enviando...',
    inviteInvalidEmail: 'Escribe un correo electrónico válido',

    toastInvitationAccepted: 'Invitación aceptada',
    toastInvitationDeclined: 'Invitación rechazada',
    toastRespondFailed: 'No pudimos responder a la invitación',
    toastInviteSent: 'Invitación enviada a {email}',
    toastInviteFailed: 'No pudimos enviar la invitación'
  }
};
