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
  prompts: 'Prompts',
  resources: 'Resources',
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
  noAccessAction: 'Go to organization settings'
};

type LayoutCopy = typeof en;

export const LAYOUT: Catalog<LayoutCopy> = {
  en,
  es: {
    organizations: 'Organizaciones',
    home: 'Inicio',
    prompts: 'Prompts',
    resources: 'Recursos',
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
    noAccessAction: 'Ir a los ajustes de la organización'
  }
};
