import type { Catalog } from '../core';

/**
 * The home layout: the rail, the mobile menu, the account menu, the
 * organization switcher, and the two modals that hang off them — plus the
 * "you're not on this project" screen the layout swaps in for the page.
 *
 * These are the first Spanish words a signed-in visitor sees, which is why this
 * view leads Phase 2.
 */
const en = {
  // Navigation — the same labels serve the desktop rail and the mobile drawer.
  organizations: 'Organizations',
  home: 'Home',
  assistant: 'Assistant',
  knowledge: 'Knowledge',
  data: 'Data',
  tools: 'Tools',
  channels: 'Channels',
  account: 'Account',
  settings: 'Settings',
  documentation: 'Documentation',
  logout: 'Logout',

  // Labels read out to screen readers, never shown.
  ariaCloseMenu: 'Close menu',
  ariaOpenMenu: 'Open menu',
  ariaOpenSwitcher: 'Open organization switcher',
  ariaAccountMenu: 'Account menu',
  ariaCloseSwitcher: 'Close switcher',

  // Organization switcher.
  switcherTitle: 'Organizations & Projects',
  switcherProjects: 'Projects',
  switcherNoOrganizations: 'No organizations yet',
  switcherNoProjects: 'No projects yet',
  switcherNoProjectsInOrg: 'No projects in this organization',
  switcherSelectOrganization: 'Select an organization',
  switcherManage: 'Manage organizations',
  switcherNewProject: 'New project',
  members_one: '{count} member',
  members_other: '{count} members',

  // New-project modal.
  projectModalTitle: 'Create a new project',
  projectModalOrganization: 'In {name}',
  projectNameTooShort: 'Give the project a name of at least 3 characters.',
  projectName: 'Name',
  projectNamePlaceholder: 'Enter project name',
  projectDescription: 'Description',
  projectDescriptionPlaceholder: 'Describe your project',

  // Account modal.
  profileUploadImage: 'Upload image',
  profileUploading: 'Uploading...',
  profileName: 'Name',
  profileNamePlaceholder: 'Your name',
  profileLinkedAccounts: 'Linked accounts',
  profileLinked: 'Linked',
  profileLink: 'Link',
  profileUnlink: 'Unlink',
  profileWorking: 'Working...',
  profileKeepOneAccount: 'You must keep at least one linked account',

  // Feedback. `{provider}` is a brand name — Google, GitHub — so it stays as
  // it is in both languages.
  toastAvatarUpdated: 'Avatar updated',
  toastAvatarFailed: 'Failed to upload avatar',
  toastLinkFailed: 'Failed to link {provider}',
  toastUnlinkFailed: 'Failed to unlink {provider}',
  toastUnlinked: 'Unlinked {provider}',
  toastNameRequired: 'Name is required',
  toastProfileFailed: 'Failed to update profile',
  toastProfileUpdated: 'Profile updated',

  // Shown in place of the page when an org member opens a project they are not
  // a member of.
  noAccessTitle: "You don't have access to this project",
  noAccessText:
    "You're a member of this organization, but not of this project. A project admin can invite you from the project's members in the organization settings.",
  noAccessAction: 'Go to organization settings',

  // The plan banner above every page of an organization.
  /** `{left}` is planBannerDayLeft or planBannerDaysLeft. */
  planBannerTrial: 'Pro trial: {left}.',
  planBannerDayLeft: '1 day left',
  planBannerDaysLeft: '{n} days left',
  planBannerTrialAction: 'See billing',
  planBannerNoPlan:
    'This organization has no plan: its bots, MCP server and Assistant are off.',
  planBannerNoPlanAction: 'Start Pro',
  planBannerFreeEnds:
    'The Free plan ends on {date}. After that, bots of organizations without a plan stop answering; nothing you built is deleted.',
  planBannerFreeEndsAction: 'Start your free trial',

  // Instead of the page while the organization has no plan.
  /** `{days}` of trial. */
  planGateTrialTitle: 'Start your {days}-day free trial',
  /** `{days}` of trial, `{price}` in dollars. */
  planGateTrialText:
    'This organization needs a plan before you can use it. Try Pro free for {days} days: we ask for a card and charge ${price}/mo plus usage when the trial ends, unless you cancel before.',
  planGateTrialAction: 'Start free trial',
  planGateProTitle: 'Start Pro',
  planGateProText:
    'This organization needs a plan before you can use it. You already used your free trial, so Pro starts paid: ${price}/mo plus usage.',
  planGateProAction: 'Start Pro',
  planGateSettings: 'Organization settings'
};

type LayoutCopy = typeof en;

export const LAYOUT: Catalog<LayoutCopy> = {
  en,
  es: {
    organizations: 'Organizaciones',
    home: 'Inicio',
    assistant: 'Asistente',
    knowledge: 'Conocimiento',
    data: 'Datos',
    tools: 'Acciones',
    channels: 'Canales',
    account: 'Cuenta',
    settings: 'Ajustes',
    documentation: 'Documentación',
    logout: 'Cerrar sesión',

    ariaCloseMenu: 'Cerrar el menú',
    ariaOpenMenu: 'Abrir el menú',
    ariaOpenSwitcher: 'Abrir el selector de organizaciones',
    ariaAccountMenu: 'Menú de cuenta',
    ariaCloseSwitcher: 'Cerrar el selector',

    switcherTitle: 'Organizaciones y proyectos',
    switcherProjects: 'Proyectos',
    switcherNoOrganizations: 'Todavía no tienes organizaciones',
    switcherNoProjects: 'Todavía no hay proyectos',
    switcherNoProjectsInOrg: 'Esta organización no tiene proyectos',
    switcherSelectOrganization: 'Elige una organización',
    switcherManage: 'Gestionar organizaciones',
    switcherNewProject: 'Nuevo proyecto',
    members_one: '{count} miembro',
    members_other: '{count} miembros',

    projectModalTitle: 'Crear un proyecto',
    projectModalOrganization: 'En {name}',
    projectNameTooShort: 'Dale al proyecto un nombre de al menos 3 caracteres.',
    projectName: 'Nombre',
    projectNamePlaceholder: 'Escribe el nombre del proyecto',
    projectDescription: 'Descripción',
    projectDescriptionPlaceholder: 'Describe tu proyecto',

    profileUploadImage: 'Subir imagen',
    profileUploading: 'Subiendo...',
    profileName: 'Nombre',
    profileNamePlaceholder: 'Tu nombre',
    profileLinkedAccounts: 'Cuentas vinculadas',
    profileLinked: 'Vinculada',
    profileLink: 'Vincular',
    profileUnlink: 'Desvincular',
    profileWorking: 'Procesando...',
    profileKeepOneAccount: 'Debes mantener al menos una cuenta vinculada',

    toastAvatarUpdated: 'Foto actualizada',
    toastAvatarFailed: 'No pudimos subir la imagen',
    toastLinkFailed: 'No pudimos vincular {provider}',
    toastUnlinkFailed: 'No pudimos desvincular {provider}',
    toastUnlinked: 'Cuenta de {provider} desvinculada',
    toastNameRequired: 'El nombre es obligatorio',
    toastProfileFailed: 'No pudimos actualizar tu perfil',
    toastProfileUpdated: 'Perfil actualizado',

    noAccessTitle: 'No tienes acceso a este proyecto',
    noAccessText:
      'Eres miembro de esta organización, pero no de este proyecto. Un administrador del proyecto puede invitarte desde los miembros del proyecto, en los ajustes de la organización.',
    noAccessAction: 'Ir a los ajustes de la organización',

    planBannerTrial: 'Prueba de Pro: {left}.',
    planBannerDayLeft: 'queda 1 día',
    planBannerDaysLeft: 'quedan {n} días',
    planBannerTrialAction: 'Ver facturación',
    planBannerNoPlan:
      'Esta organización no tiene plan: sus bots, su servidor MCP y el Asistente están apagados.',
    planBannerNoPlanAction: 'Empezar Pro',
    planBannerFreeEnds:
      'El plan Free termina el {date}. Después, los bots de las organizaciones sin plan dejan de responder; nada de lo que construiste se borra.',
    planBannerFreeEndsAction: 'Empezar tu prueba gratis',

    planGateTrialTitle: 'Empieza tu prueba gratis de {days} días',
    planGateTrialText:
      'Esta organización necesita un plan para poder usarla. Prueba Pro gratis por {days} días: pedimos una tarjeta y cobramos {price} USD/mes más el consumo al terminar la prueba, a menos que canceles antes.',
    planGateTrialAction: 'Empezar prueba gratis',
    planGateProTitle: 'Empezar Pro',
    planGateProText:
      'Esta organización necesita un plan para poder usarla. Ya usaste tu prueba gratis, así que Pro empieza pagado: {price} USD/mes más el consumo.',
    planGateProAction: 'Empezar Pro',
    planGateSettings: 'Ajustes de la organización'
  }
};
