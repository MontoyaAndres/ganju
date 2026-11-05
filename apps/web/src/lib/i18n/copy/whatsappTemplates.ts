import type { Catalog } from '../core';

/**
 * A WhatsApp channel's message templates: the list synced from Meta, the
 * account and token they need, and the form that sends one for review.
 *
 * Names in Meta's dashboards (Business Settings → System users, WhatsApp
 * Manager) stay in English, as in the channels catalog: that is how Meta
 * shows them.
 */
const en = {
  tabTemplates: 'Message templates',
  intro:
    "WhatsApp only lets a business message a customer freely within 24 hours of the customer's last message. After that, only a template Meta approved reaches them. Meta bills template messages to your WhatsApp Business account at its own rates; Ganju doesn't charge for them.",
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
  newTemplate: 'New template',
  loadFailed: "Couldn't read the templates.",
  empty:
    'No templates yet. Create one, and use it from a trigger or a function once Meta approves it.',
  syncedAt: 'Synced with Meta {when}',
  edit: 'Edit',
  delete: 'Delete',
  deleteTitle: 'Delete template',
  deleteText:
    'This deletes {name} ({language}) in Meta. Triggers and functions that send it will fail. Meta doesn’t let you reuse the name for 30 days.',
  toastDeleted: 'Template deleted',
  toastDeleteFailed: "Couldn't delete the template",
  metaReason: "Meta's reason: {reason}",

  notSendable: "Ganju can't send it",
  notSendableHint:
    'It has a media header, a header variable or a button that takes a value, and Ganju only fills the message’s variables. Edit it in WhatsApp Manager, or make a version without them.',
  statusApproved: 'Approved',
  statusPending: 'In review',
  statusRejected: 'Rejected',
  statusPaused: 'Paused',
  statusDisabled: 'Disabled',
  statusInAppeal: 'In appeal',
  categoryUtility: 'Utility',
  categoryMarketing: 'Marketing',
  categoryUtilityRecommended: 'Utility (recommended)',

  // What the channel still needs.
  noAccountTitle: 'Which WhatsApp Business account is this number in?',
  wrongAccountTitle: "That isn't this number's WhatsApp Business account",
  noAccountText:
    "Templates belong to the WhatsApp Business account (WABA), not to the number, and Meta didn't tell Ganju which one this token can manage. Paste its id below.",
  permissionTitle: "This channel's token can't manage templates",
  permissionTextBefore: 'Templates need the ',
  permissionTextAfter:
    ' permission. Tokens made only to send messages lack it. To add it:',
  permissionStep1:
    'In Meta Business Settings → Users → System users, open the system user this channel uses.',
  permissionStep2Before: 'Click Generate new token for your app, and tick ',
  permissionStep2After: ' as well as whatsapp_business_messaging.',
  permissionStep3:
    'Paste the new token below. It is stored encrypted and never shown again; the old one stops being used.',
  tokenTitle: "This channel's token expired or was revoked",
  tokenText:
    'Generate a new System User token in Meta Business Settings, with whatsapp_business_messaging and whatsapp_business_management, and paste it below.',
  metaTitle: "Meta didn't return the templates",
  newToken: 'New access token',
  newTokenHelp: 'Stored encrypted, never shown again.',
  businessAccountId: 'WhatsApp Business account ID',
  businessAccountIdHelp:
    "WhatsApp Manager → Account tools → Business account settings, or the app's WhatsApp → API Setup page (WhatsApp Business Account ID).",
  save: 'Save',
  saving: 'Saving…',
  accountSaveFailed: "Couldn't save",
  toastAccountSaved: 'Connected to the business account',

  // The form.
  newTitle: 'New message template',
  editTitle: 'Edit {name}',
  reviewNote:
    'Meta reviews every template, in minutes or up to a day, and may reject it or move it from Utility to Marketing if it reads as promotional. Wording that stays Utility: “Your order #{{1}} is ready for pickup”.',
  name: 'Name',
  nameHelp: 'Lowercase letters, digits and underscores, such as order_ready.',
  nameInvalid: 'Only lowercase letters, digits and underscores.',
  language: 'Language',
  category: 'Category',
  categoryUtilityHelp:
    'For updates the customer expects: orders, bookings, payments. Cheaper than Marketing.',
  categoryMarketingHelp:
    'For offers and promotions. Costs more, and customers can opt out of it.',
  header: 'Header',
  optionalMax: 'Optional, up to {max} characters, no variables.',
  body: 'Message',
  bodyPlaceholder: 'Hi {{1}}, your order #{{2}} is ready for pickup.',
  bodyHelp: 'Add variables below for what changes in each message.',
  variables: 'Variables',
  variablesHelp:
    'A variable is what changes in each message, like a name or an order number. A trigger fills it from the row.',
  variableLabel: 'What it is',
  variableLabelPlaceholder: 'customer name',
  variableExample: 'Example for Meta',
  addVariable: 'Insert',
  footer: 'Footer',
  quickReplies: 'Quick replies',
  quickReply: 'Reply {n}',
  removeQuickReply: 'Remove reply',
  addQuickReply: 'Add a quick reply',
  costNote:
    'Meta bills each template message to your WhatsApp Business account; Marketing costs more than Utility.',
  preview: 'Preview',
  previewEmpty: 'Your message shows here.',
  submitNew: 'Send for review',
  submitEdit: 'Save and send for review',
  submitting: 'Sending…',
  saveFailed: "Meta didn't accept the template.",
  toastCreated: 'Sent to Meta for review',
  toastUpdated: 'Changes sent to Meta for review',

  // Meta's common rejections, checked before sending.
  issue_name_format:
    'The name takes lowercase letters, digits and underscores only.',
  issue_name_long: 'The name is at most {max} characters.',
  issue_language: "The language isn't one Meta supports.",
  issue_category: 'Pick Utility or Marketing.',
  issue_body_empty: 'The message is empty.',
  issue_body_long: 'The message is at most {max} characters.',
  issue_header_long: 'The header is at most {max} characters.',
  issue_header_variables: "The header can't have variables.",
  issue_header_lines: 'The header is one line.',
  issue_footer_long: 'The footer is at most {max} characters.',
  issue_footer_variables: "The footer can't have variables.",
  issue_button_empty: 'A quick reply is empty.',
  issue_button_long: 'A quick reply is at most {max} characters.',
  issue_button_variables: "A quick reply can't have variables.",
  issue_buttons_many: 'At most {max} quick replies.',
  issue_buttons_repeated: 'Two quick replies say the same thing.',
  issue_variables_many: 'At most {max} variables.',
  issue_variables_order:
    'Variables go {{1}}, {{2}}, … in the order they first appear, with no gaps.',
  issue_variable_at_start:
    'Meta rejects a message that starts with a variable; put words before it.',
  issue_variable_at_end:
    'Meta rejects a message that ends with a variable; put words after it.',
  issue_variables_adjacent:
    'Meta rejects two variables side by side; put words between them.',
  issue_variables_dense:
    'Too many variables for so little text; add words or remove variables.',
  issue_example_missing: '{{{n}}} needs an example value for Meta.'
};

type WhatsappTemplatesCopy = typeof en;

export const WHATSAPP_TEMPLATES: Catalog<WhatsappTemplatesCopy> = {
  en,
  es: {
    tabTemplates: 'Plantillas de mensaje',
    intro:
      'WhatsApp solo deja escribirle libremente a un cliente dentro de las 24 horas siguientes a su último mensaje. Después, solo le llega una plantilla aprobada por Meta. Meta cobra los mensajes de plantilla a tu cuenta de WhatsApp Business, con sus propias tarifas; Ganju no los cobra.',
    refresh: 'Actualizar',
    refreshing: 'Actualizando…',
    newTemplate: 'Nueva plantilla',
    loadFailed: 'No pudimos leer las plantillas.',
    empty:
      'Todavía no hay plantillas. Crea una y úsala desde un disparador o una función cuando Meta la apruebe.',
    syncedAt: 'Sincronizado con Meta {when}',
    edit: 'Editar',
    delete: 'Eliminar',
    deleteTitle: 'Eliminar plantilla',
    deleteText:
      'Esto elimina {name} ({language}) en Meta. Los disparadores y funciones que la envían van a fallar. Meta no deja volver a usar el nombre durante 30 días.',
    toastDeleted: 'Plantilla eliminada',
    toastDeleteFailed: 'No pudimos eliminar la plantilla',
    metaReason: 'Motivo de Meta: {reason}',

    notSendable: 'Ganju no puede enviarla',
    notSendableHint:
      'Tiene un encabezado con imagen o archivo, una variable en el encabezado o un botón que lleva un valor, y Ganju solo llena las variables del mensaje. Edítala en WhatsApp Manager, o crea una versión sin ellos.',
    statusApproved: 'Aprobada',
    statusPending: 'En revisión',
    statusRejected: 'Rechazada',
    statusPaused: 'Pausada',
    statusDisabled: 'Desactivada',
    statusInAppeal: 'En apelación',
    categoryUtility: 'Utilidad',
    categoryMarketing: 'Marketing',
    categoryUtilityRecommended: 'Utilidad (recomendada)',

    noAccountTitle: '¿En qué cuenta de WhatsApp Business está este número?',
    wrongAccountTitle:
      'Esa no es la cuenta de WhatsApp Business de este número',
    noAccountText:
      'Las plantillas pertenecen a la cuenta de WhatsApp Business (WABA), no al número, y Meta no le dijo a Ganju cuál puede administrar este token. Pega su id abajo.',
    permissionTitle: 'El token de este canal no puede administrar plantillas',
    permissionTextBefore: 'Las plantillas necesitan el permiso ',
    permissionTextAfter:
      '. Los tokens creados solo para enviar mensajes no lo tienen. Para agregarlo:',
    permissionStep1:
      'En Meta Business Settings → Users → System users, abre el usuario del sistema que usa este canal.',
    permissionStep2Before:
      'Haz clic en Generate new token para tu app y marca ',
    permissionStep2After: ' además de whatsapp_business_messaging.',
    permissionStep3:
      'Pega el token nuevo abajo. Se guarda cifrado y no se vuelve a mostrar; el anterior deja de usarse.',
    tokenTitle: 'El token de este canal venció o fue revocado',
    tokenText:
      'Genera un token nuevo de System User en Meta Business Settings, con whatsapp_business_messaging y whatsapp_business_management, y pégalo abajo.',
    metaTitle: 'Meta no devolvió las plantillas',
    newToken: 'Nuevo token de acceso',
    newTokenHelp: 'Se guarda cifrado y no se vuelve a mostrar.',
    businessAccountId: 'ID de la cuenta de WhatsApp Business',
    businessAccountIdHelp:
      'WhatsApp Manager → Account tools → Business account settings, o la página WhatsApp → API Setup de la app (WhatsApp Business Account ID).',
    save: 'Guardar',
    saving: 'Guardando…',
    accountSaveFailed: 'No pudimos guardar',
    toastAccountSaved: 'Conectado a la cuenta de WhatsApp Business',

    newTitle: 'Nueva plantilla de mensaje',
    editTitle: 'Editar {name}',
    reviewNote:
      'Meta revisa cada plantilla, en minutos o hasta un día, y puede rechazarla o pasarla de Utilidad a Marketing si suena promocional. Un texto que sigue siendo de Utilidad: «Tu pedido #{{1}} está listo para recoger».',
    name: 'Nombre',
    nameHelp: 'Minúsculas, números y guiones bajos, como pedido_listo.',
    nameInvalid: 'Solo minúsculas, números y guiones bajos.',
    language: 'Idioma',
    category: 'Categoría',
    categoryUtilityHelp:
      'Para avisos que el cliente espera: pedidos, reservas, pagos. Más barata que Marketing.',
    categoryMarketingHelp:
      'Para ofertas y promociones. Cuesta más, y los clientes pueden darse de baja.',
    header: 'Encabezado',
    optionalMax: 'Opcional, hasta {max} caracteres, sin variables.',
    body: 'Mensaje',
    bodyPlaceholder: 'Hola {{1}}, tu pedido #{{2}} está listo para recoger.',
    bodyHelp: 'Agrega abajo variables para lo que cambia en cada mensaje.',
    variables: 'Variables',
    variablesHelp:
      'Una variable es lo que cambia en cada mensaje, como un nombre o un número de pedido. Un disparador la llena con la fila.',
    variableLabel: 'Qué es',
    variableLabelPlaceholder: 'nombre del cliente',
    variableExample: 'Ejemplo para Meta',
    addVariable: 'Insertar',
    footer: 'Pie',
    quickReplies: 'Respuestas rápidas',
    quickReply: 'Respuesta {n}',
    removeQuickReply: 'Quitar respuesta',
    addQuickReply: 'Agregar una respuesta rápida',
    costNote:
      'Meta cobra cada mensaje de plantilla a tu cuenta de WhatsApp Business; Marketing cuesta más que Utilidad.',
    preview: 'Vista previa',
    previewEmpty: 'Tu mensaje se ve aquí.',
    submitNew: 'Enviar a revisión',
    submitEdit: 'Guardar y enviar a revisión',
    submitting: 'Enviando…',
    saveFailed: 'Meta no aceptó la plantilla.',
    toastCreated: 'Enviada a Meta para revisión',
    toastUpdated: 'Cambios enviados a Meta para revisión',

    issue_name_format:
      'El nombre solo admite minúsculas, números y guiones bajos.',
    issue_name_long: 'El nombre tiene como máximo {max} caracteres.',
    issue_language: 'Meta no admite ese idioma.',
    issue_category: 'Elige Utilidad o Marketing.',
    issue_body_empty: 'El mensaje está vacío.',
    issue_body_long: 'El mensaje tiene como máximo {max} caracteres.',
    issue_header_long: 'El encabezado tiene como máximo {max} caracteres.',
    issue_header_variables: 'El encabezado no puede tener variables.',
    issue_header_lines: 'El encabezado es de una sola línea.',
    issue_footer_long: 'El pie tiene como máximo {max} caracteres.',
    issue_footer_variables: 'El pie no puede tener variables.',
    issue_button_empty: 'Hay una respuesta rápida vacía.',
    issue_button_long:
      'Una respuesta rápida tiene como máximo {max} caracteres.',
    issue_button_variables: 'Una respuesta rápida no puede tener variables.',
    issue_buttons_many: 'Como máximo {max} respuestas rápidas.',
    issue_buttons_repeated: 'Dos respuestas rápidas dicen lo mismo.',
    issue_variables_many: 'Como máximo {max} variables.',
    issue_variables_order:
      'Las variables van {{1}}, {{2}}, … en el orden en que aparecen, sin saltos.',
    issue_variable_at_start:
      'Meta rechaza un mensaje que empieza con una variable; pon palabras antes.',
    issue_variable_at_end:
      'Meta rechaza un mensaje que termina con una variable; pon palabras después.',
    issue_variables_adjacent:
      'Meta rechaza dos variables seguidas; pon palabras entre ellas.',
    issue_variables_dense:
      'Demasiadas variables para tan poco texto; agrega palabras o quita variables.',
    issue_example_missing: '{{{n}}} necesita un valor de ejemplo para Meta.'
  }
};
