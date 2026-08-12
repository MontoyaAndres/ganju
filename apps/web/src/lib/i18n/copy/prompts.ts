import type { Catalog } from '../core';

/**
 * The prompts view — templates the MCP server exposes, each also reachable as a
 * slash command in a linked chat channel.
 *
 * `User` / `Assistant` are the MCP roles and `JSON` is a format name; both stay
 * as they are, since they name things that appear verbatim in the payload. The
 * variable types (`string`, `number`, `boolean`) are JSON Schema keywords for
 * the same reason.
 */
const en = {
  title: 'Prompts',
  subtitle:
    'Reusable prompt templates with variables this MCP server can expose. In linked chat channels each prompt becomes a slash command (shown on every card).',
  newPrompt: 'New prompt',
  emptyTitle: 'No prompts yet',
  emptyText: 'Create a prompt template to expose through this MCP server.',
  commandTooltip: 'Slash command in linked chat channels',

  panelNew: 'New Prompt',
  panelEdit: 'Edit Prompt',

  titleLabel: 'Title',
  titlePlaceholder: 'e.g. Summarize Article',
  titleHelp: 'A short name to identify this prompt',
  slashCommand: 'Slash command:',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Describe what this prompt does',

  messages: 'Messages',
  modeVisual: 'Visual',
  modeJson: 'JSON',
  roleUser: 'User',
  roleAssistant: 'Assistant',
  /** `{{variable}}` is the template syntax and is not translated. */
  userPlaceholder:
    'Write the user message... Use {{variable}} for dynamic values',
  assistantPlaceholder: 'Write the assistant response...',
  addMessage: 'Add message',
  messagesJson: 'Messages (JSON)',
  messagesJsonHelp: 'Array of {role, content} objects',
  errorInvalidJson: 'Invalid JSON format',
  errorNoMessages: 'At least one message is required',

  variables: 'Variables',
  variablesHint:
    'Auto-detected from {{variables}} in your messages. Customize type and requirements below.',
  variableRequired: 'Required',
  variableOptional: 'Optional',
  variableType: 'Type',
  variableDescription: 'Description',
  variableDescriptionPlaceholder: 'What is this variable for?',

  viewDescription: 'Description',
  viewMessages: 'Messages',

  confirmDeleteTitle: 'Delete prompt',
  confirmDeleteText:
    'Are you sure you want to delete "{title}"? This action cannot be undone.',
  confirmDelete: 'Delete',

  toastCreated: 'Prompt created',
  toastCreateFailed: 'Failed to create prompt',
  toastUpdated: 'Prompt updated',
  toastUpdateFailed: 'Failed to update prompt',
  toastDeleted: 'Prompt deleted',
  toastDeleteFailed: 'Failed to delete prompt'
};

type PromptsCopy = typeof en;

export const PROMPTS: Catalog<PromptsCopy> = {
  en,
  es: {
    title: 'Prompts',
    subtitle:
      'Plantillas de prompts reutilizables, con variables, que este servidor MCP puede exponer. En los canales de chat vinculados cada prompt se convierte en un comando (aparece en cada tarjeta).',
    newPrompt: 'Nuevo prompt',
    emptyTitle: 'Todavía no hay prompts',
    emptyText:
      'Crea una plantilla de prompt para exponerla a través de este servidor MCP.',
    commandTooltip: 'Comando en los canales de chat vinculados',

    panelNew: 'Nuevo prompt',
    panelEdit: 'Editar prompt',

    titleLabel: 'Título',
    titlePlaceholder: 'ej. Resumir artículo',
    titleHelp: 'Un nombre corto para identificar este prompt',
    slashCommand: 'Comando:',
    descriptionLabel: 'Descripción',
    descriptionPlaceholder: 'Describe qué hace este prompt',

    messages: 'Mensajes',
    modeVisual: 'Visual',
    modeJson: 'JSON',
    roleUser: 'User',
    roleAssistant: 'Assistant',
    userPlaceholder:
      'Escribe el mensaje del usuario... Usa {{variable}} para los valores dinámicos',
    assistantPlaceholder: 'Escribe la respuesta del asistente...',
    addMessage: 'Agregar mensaje',
    messagesJson: 'Mensajes (JSON)',
    messagesJsonHelp: 'Un arreglo de objetos {role, content}',
    errorInvalidJson: 'El formato JSON no es válido',
    errorNoMessages: 'Se necesita al menos un mensaje',

    variables: 'Variables',
    variablesHint:
      'Las detectamos automáticamente a partir de {{variables}} en tus mensajes. Ajusta abajo su tipo y si son obligatorias.',
    variableRequired: 'Obligatoria',
    variableOptional: 'Opcional',
    variableType: 'Tipo',
    variableDescription: 'Descripción',
    variableDescriptionPlaceholder: '¿Para qué sirve esta variable?',

    viewDescription: 'Descripción',
    viewMessages: 'Mensajes',

    confirmDeleteTitle: 'Eliminar prompt',
    confirmDeleteText:
      '¿Seguro que quieres eliminar «{title}»? Esta acción no se puede deshacer.',
    confirmDelete: 'Eliminar',

    toastCreated: 'Prompt creado',
    toastCreateFailed: 'No pudimos crear el prompt',
    toastUpdated: 'Prompt actualizado',
    toastUpdateFailed: 'No pudimos actualizar el prompt',
    toastDeleted: 'Prompt eliminado',
    toastDeleteFailed: 'No pudimos eliminar el prompt'
  }
};
