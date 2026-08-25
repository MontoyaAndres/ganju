import type { Lang } from '../core';

/**
 * Spanish for the catalog this platform ships: the 12 integration groups, the
 * 62 tools inside them, and the per-tool settings the calendar tools carry.
 *
 * **This is an override map, not a catalog.** Every other module under `copy/`
 * declares English and translates it, because the English is the dashboard's
 * own. Here it is not: group and tool names arrive in the `/catalog/tools`
 * payload, from [toolCatalog.ts](../../../../../../packages/utils/src/toolCatalog.ts),
 * and the per-tool fields come from `CALENDAR_TOOL_FIELDS`. Restating them here
 * would be a second copy of ~150 strings that drifts the first time a tool is
 * added — and it would drift silently, because nothing checks two lists of
 * prose against each other.
 *
 * So the English stays where it is and this holds only the Spanish, keyed by
 * what the payload carries. What follows from that, and is the point:
 *
 * - A tool added to the platform renders **in English** here until someone
 *   translates it. Not as a raw key, and not as a build failure in a package
 *   that has no idea this file exists.
 * - A key that no longer exists in the catalog is dead weight and nothing more.
 *
 * Keys are `group.<groupKey>.title|description`, `tool.<toolKey>.title|description`,
 * and `field.<toolKey>.<configKey>.label|help` — group and tool keys collide
 * (`greeting`, `custom-code`, `http-endpoint`, `mcp-proxy` are each both), which
 * is why they are namespaced rather than bare.
 *
 * Product names are not translated: Gmail, Outlook, Slack, Google Calendar,
 * Cal.com and Google Meet read the same in both languages, and so do the
 * protocol nouns (MCP, HTTP, JSON, URL, API).
 */
const es: Record<string, string> = {
  'group.gmail.title': 'Gmail',
  'group.gmail.description': 'Envía, lee, busca y gestiona correos',
  'tool.gmail-batch-modify-labels.title': 'Modificar etiquetas en lote',
  'tool.gmail-batch-modify-labels.description':
    'Agrega o quita etiquetas en varios correos a la vez (archivar, marcar como leído, etc.).',
  'tool.gmail-create-draft.title': 'Crear borrador',
  'tool.gmail-create-draft.description':
    'Guarda un borrador nuevo en Gmail sin enviarlo todavía.',
  'tool.gmail-delete-draft.title': 'Eliminar borrador',
  'tool.gmail-delete-draft.description':
    'Elimina un borrador de forma permanente.',
  'tool.gmail-forward-email.title': 'Reenviar correo',
  'tool.gmail-forward-email.description':
    'Reenvía un correo a un nuevo destinatario.',
  'tool.gmail-get-draft.title': 'Ver borrador',
  'tool.gmail-get-draft.description':
    'Abre un borrador guardado para revisar su contenido.',
  'tool.gmail-get-profile.title': 'Ver perfil',
  'tool.gmail-get-profile.description':
    'Muestra la dirección de correo y las estadísticas de la bandeja de la cuenta de Gmail conectada.',
  'tool.gmail-get-thread.title': 'Ver conversación',
  'tool.gmail-get-thread.description':
    'Consulta todos los mensajes de una misma conversación.',
  'tool.gmail-list-drafts.title': 'Listar borradores',
  'tool.gmail-list-drafts.description': 'Revisa tus borradores guardados.',
  'tool.gmail-list-emails.title': 'Listar correos',
  'tool.gmail-list-emails.description':
    'Revisa tu bandeja de Gmail, con filtros de búsqueda opcionales.',
  'tool.gmail-list-labels.title': 'Listar etiquetas',
  'tool.gmail-list-labels.description':
    'Consulta todas tus etiquetas y carpetas de Gmail.',
  'tool.gmail-list-threads.title': 'Listar conversaciones',
  'tool.gmail-list-threads.description': 'Lista tus conversaciones de Gmail.',
  'tool.gmail-modify-labels.title': 'Modificar etiquetas',
  'tool.gmail-modify-labels.description':
    'Agrega o quita etiquetas en un correo — archívalo, márcalo como leído, destácalo y más.',
  'tool.gmail-read-email.title': 'Leer correo',
  'tool.gmail-read-email.description': 'Abre y lee un correo específico.',
  'tool.gmail-reply-email.title': 'Responder correo',
  'tool.gmail-reply-email.description':
    'Responde a un correo para que la respuesta quede en la misma conversación.',
  'tool.gmail-send-draft.title': 'Enviar borrador',
  'tool.gmail-send-draft.description': 'Envía un borrador que ya guardaste.',
  'tool.gmail-send-email.title': 'Enviar correo',
  'tool.gmail-send-email.description':
    'Redacta y envía un correo nuevo desde tu cuenta de Gmail conectada.',
  'tool.gmail-trash-email.title': 'Mover a la papelera',
  'tool.gmail-trash-email.description':
    'Mueve un correo a la papelera. Se puede recuperar durante 30 días.',
  'tool.gmail-update-draft.title': 'Actualizar borrador',
  'tool.gmail-update-draft.description':
    'Edita el contenido de un borrador guardado.',

  'group.outlook.title': 'Outlook',
  'group.outlook.description':
    'Herramientas de correo de Microsoft Outlook, sobre Microsoft Graph.',
  'tool.outlook-batch-move-messages.title': 'Mover mensajes en lote',
  'tool.outlook-batch-move-messages.description':
    'Mueve hasta 20 mensajes a la misma carpeta.',
  'tool.outlook-create-draft.title': 'Crear borrador',
  'tool.outlook-create-draft.description':
    'Crea un borrador de correo guardado en Borradores.',
  'tool.outlook-delete-draft.title': 'Eliminar borrador',
  'tool.outlook-delete-draft.description':
    'Elimina un borrador de forma permanente.',
  'tool.outlook-forward-email.title': 'Reenviar',
  'tool.outlook-forward-email.description':
    'Reenvía un mensaje existente a un nuevo destinatario.',
  'tool.outlook-get-draft.title': 'Ver borrador',
  'tool.outlook-get-draft.description':
    'Lee el contenido completo de un borrador.',
  'tool.outlook-get-profile.title': 'Ver perfil',
  'tool.outlook-get-profile.description':
    'Obtén el perfil de la cuenta conectada y los totales de su bandeja.',
  'tool.outlook-get-thread.title': 'Ver conversación',
  'tool.outlook-get-thread.description':
    'Obtén un resumen de cada mensaje de una conversación.',
  'tool.outlook-list-drafts.title': 'Listar borradores',
  'tool.outlook-list-drafts.description':
    'Lista los borradores de la carpeta Borradores.',
  'tool.outlook-list-emails.title': 'Listar correos',
  'tool.outlook-list-emails.description':
    'Lista los mensajes de la bandeja, con búsqueda opcional.',
  'tool.outlook-list-folders.title': 'Listar carpetas',
  'tool.outlook-list-folders.description':
    'Lista todas las carpetas de correo de la cuenta.',
  'tool.outlook-list-threads.title': 'Listar conversaciones',
  'tool.outlook-list-threads.description':
    'Lista las conversaciones de la bandeja de entrada.',
  'tool.outlook-move-message.title': 'Mover mensaje',
  'tool.outlook-move-message.description': 'Mueve un mensaje a otra carpeta.',
  'tool.outlook-read-email.title': 'Leer correo',
  'tool.outlook-read-email.description':
    'Lee el contenido completo de un mensaje por su ID.',
  'tool.outlook-reply-email.title': 'Responder',
  'tool.outlook-reply-email.description':
    'Responde a un mensaje existente, manteniendo la conversación.',
  'tool.outlook-send-draft.title': 'Enviar borrador',
  'tool.outlook-send-draft.description':
    'Envía un borrador existente tal cual.',
  'tool.outlook-send-email.title': 'Enviar correo',
  'tool.outlook-send-email.description':
    'Envía un correo nuevo desde la cuenta conectada.',
  'tool.outlook-trash-email.title': 'Mover a la papelera',
  'tool.outlook-trash-email.description':
    'Mueve un mensaje a la carpeta Elementos eliminados.',
  'tool.outlook-update-draft.title': 'Actualizar borrador',
  'tool.outlook-update-draft.description':
    'Reemplaza el contenido de un borrador existente.',

  'group.slack.title': 'Slack',
  'group.slack.description':
    'Publica mensajes, explora canales y sube archivos en Slack con la Web API.',
  'tool.slack-get-user.title': 'Ver usuario',
  'tool.slack-get-user.description':
    'Busca un usuario de Slack por su ID o su correo.',
  'tool.slack-list-channels.title': 'Listar canales',
  'tool.slack-list-channels.description':
    'Explora los canales y mensajes directos que el agente puede ver.',
  'tool.slack-send-message.title': 'Enviar mensaje',
  'tool.slack-send-message.description':
    'Publica un mensaje en un canal, un mensaje directo o un hilo de Slack.',
  'tool.slack-upload-file.title': 'Subir archivo',
  'tool.slack-upload-file.description':
    'Sube un recurso guardado a un canal de Slack.',
  'group.slack-user.title': 'Búsqueda en Slack',
  'group.slack-user.description':
    'Búsqueda de mensajes en todo el workspace de Slack. Funciona con un token de usuario (xoxp) porque Slack no permite que los tokens de bot llamen a search.messages.',
  'tool.slack-search-messages.title': 'Buscar mensajes',
  'tool.slack-search-messages.description':
    'Busca mensajes en todo el workspace. Requiere un token de usuario de Slack (xoxp).',

  'group.google-calendar.title': 'Google Calendar',
  'group.google-calendar.description':
    'Crea y gestiona eventos de calendario, y encuentra espacios libres',
  'tool.calendar-create-event.title': 'Crear evento',
  'tool.calendar-create-event.description':
    'Agrega un evento nuevo a un calendario.',
  'tool.calendar-delete-event.title': 'Eliminar evento',
  'tool.calendar-delete-event.description':
    'Quita un evento de un calendario de forma permanente.',
  'tool.calendar-find-free-slots.title': 'Buscar espacios libres',
  'tool.calendar-find-free-slots.description':
    'Encuentra huecos disponibles en un calendario.',
  'tool.calendar-list-calendars.title': 'Listar calendarios',
  'tool.calendar-list-calendars.description':
    'Consulta todos los calendarios de la cuenta de Google conectada.',
  'tool.calendar-list-events.title': 'Listar eventos',
  'tool.calendar-list-events.description':
    'Revisa los eventos de un calendario dentro de un rango de fechas.',
  'tool.calendar-update-event.title': 'Actualizar evento',
  'tool.calendar-update-event.description':
    'Cambia los detalles de un evento existente.',

  'group.calcom.title': 'Cal.com',
  'group.calcom.description':
    'Consulta disponibilidad y reserva o cancela reuniones en Cal.com',
  'tool.calcom-cancel-booking.title': 'Cancelar reserva',
  'tool.calcom-cancel-booking.description':
    'Cancela una reserva existente por su UID.',
  'tool.calcom-create-booking.title': 'Crear reserva',
  'tool.calcom-create-booking.description':
    'Reserva un espacio disponible para un invitado.',
  'tool.calcom-list-available-slots.title': 'Listar espacios disponibles',
  'tool.calcom-list-available-slots.description':
    'Encuentra horarios libres para un tipo de evento dentro de un rango de fechas.',
  'tool.calcom-list-event-types.title': 'Listar tipos de evento',
  'tool.calcom-list-event-types.description':
    'Consulta los tipos de reunión reservables en la cuenta de Cal.com conectada.',

  'group.web.title': 'Búsqueda web',
  'group.web.description':
    'Busca en la web en vivo y extrae el contenido de las páginas, con tecnología de Tavily.',
  'tool.web-extract.title': 'Extraer página web',
  'tool.web-extract.description':
    'Obtén el texto completo y limpio de páginas web concretas, por su URL, para leerlas a fondo.',
  'tool.web-search.title': 'Búsqueda web',
  'tool.web-search.description':
    'Busca en la web en vivo y devuelve los mejores resultados más una respuesta sintetizada, para que el modelo pueda citar sus fuentes.',

  'group.builtin.title': 'Integradas',
  'group.builtin.description':
    'Herramientas básicas disponibles en todo servidor MCP',
  'tool.list-prompts.title': 'Listar prompts',
  'tool.list-prompts.description':
    'Lista los prompts y comandos que expone este asistente, y cómo ejecutarlos en el canal actual.',
  'tool.list-resources.title': 'Listar recursos',
  'tool.list-resources.description':
    'Lista todos los recursos disponibles para este asistente.',
  'tool.read-resource.title': 'Leer recurso',
  'tool.read-resource.description': 'Lee el contenido de un recurso guardado.',
  'tool.search-resources.title': 'Buscar recursos',
  'tool.search-resources.description':
    'Encuentra los recursos más relevantes para una pregunta mediante búsqueda semántica.',
  'tool.send-resource.title': 'Enviar recurso',
  'tool.send-resource.description':
    'Entrega un recurso al usuario como adjunto en el chat.',

  'group.greeting.title': 'Saludo',
  'group.greeting.description': 'Utilidades sencillas de saludo',
  'tool.greeting.title': 'Saludo',
  'tool.greeting.description':
    'Responde con un saludo amable en inglés o español (herramienta de demostración).',

  'group.http-endpoint.title': 'Endpoints HTTP',
  'group.http-endpoint.description':
    'Expón tus propias APIs HTTP al agente como herramientas con nombre. Cada endpoint que agregues se convierte en una herramienta que el asistente puede llamar.',
  'tool.http-endpoint.title': 'Endpoint HTTP',
  'tool.http-endpoint.description':
    'Una petición HTTP configurada por ti, expuesta al agente como su propia herramienta con nombre.',
  'group.mcp-proxy.title': 'Servidores MCP',
  'group.mcp-proxy.description':
    'Conecta el servidor MCP remoto oficial de un proveedor y expón sus herramientas al agente. Cada servidor que agregues trae su propio conjunto de herramientas.',
  'tool.mcp-proxy.title': 'Servidor MCP',
  'tool.mcp-proxy.description':
    'Un servidor MCP remoto conectado. Cada servidor que agregues expone sus herramientas al agente bajo el prefijo del proveedor.',
  'group.custom-code.title': 'Código propio',
  'group.custom-code.description':
    'Escribe tus propias herramientas como un Worker de Cloudflare y despliégalas en este servidor MCP.',
  'tool.custom-code.title': 'Código propio',
  'tool.custom-code.description':
    'Herramientas implementadas por tu propio código. Un script por artefacto; los nombres y esquemas vienen de la versión publicada.',

  'field.calendar-list-calendars.defaultMaxResults.label':
    'Máximo de resultados por defecto',
  'field.calendar-list-calendars.defaultMaxResults.help':
    'Se usa cuando una llamada omite maxResults (1–50).',
  'field.calendar-list-calendars.defaultWindowDays.label':
    'Ventana por defecto (días)',
  'field.calendar-list-calendars.defaultWindowDays.help':
    'Cuando no se indica hora de fin, lista los eventos de estos días hacia adelante.',
  'field.calendar-create-event.defaultDurationMinutes.label':
    'Duración por defecto (minutos)',
  'field.calendar-create-event.defaultDurationMinutes.help':
    'Se usa cuando un evento se crea sin hora de fin.',
  'field.calendar-create-event.addGoogleMeet.label':
    'Agregar un enlace de Google Meet',
  'field.calendar-create-event.addGoogleMeet.help':
    'Adjunta una conferencia de Meet a cada evento nuevo.',
  'field.calendar-create-event.defaultLocation.label': 'Ubicación por defecto',
  'field.calendar-create-event.defaultVisibility.label': 'Visibilidad',
  'field.calendar-find-free-slots.workingHoursStart.label':
    'Inicio del horario laboral (0–23)',
  'field.calendar-find-free-slots.workingHoursStart.help':
    'Hora local. Necesita una zona horaria por defecto para surtir efecto.',
  'field.calendar-find-free-slots.workingHoursEnd.label':
    'Fin del horario laboral (1–24)',
  'field.calendar-find-free-slots.workingDays.label': 'Días laborales',
  'field.calendar-find-free-slots.defaultDurationMinutes.label':
    'Duración del espacio por defecto (minutos)',
  'field.calendar-find-free-slots.bufferMinutes.label':
    'Margen entre reuniones (minutos)',
  'field.calendar-find-free-slots.minNoticeHours.label':
    'Antelación mínima (horas)',
  'field.calendar-find-free-slots.maxAdvanceDays.label':
    'Antelación máxima (días)',

  /**
   * The managed OAuth providers, by the slug everything keys on.
   *
   * Most of them already have a catalog group whose title says the same thing,
   * and the tools view prefers that. These are the fallback, and the two that
   * need it: `google-drive` and `one-drive` are resource sources rather than
   * tool groups, so no card carries their name.
   */
  'provider.google-gmail': 'Gmail',
  'provider.google-drive': 'Google Drive',
  'provider.google-calendar': 'Google Calendar',
  'provider.microsoft-outlook': 'Outlook',
  'provider.one-drive': 'OneDrive',
  'provider.slack': 'Slack',
  'provider.slack-user': 'Slack (usuario)',

  // Option labels inside those fields, keyed by the stored value.
  'option.calendar-visibility.default': 'La del calendario',
  'option.calendar-visibility.public': 'Público',
  'option.calendar-visibility.private': 'Privado'
};

const BY_LANG: Partial<Record<Lang, Record<string, string>>> = { es };

/**
 * The reader's wording for one catalog string, or the English the payload
 * carried.
 *
 * `fallback` is not a courtesy — it is the contract. A tool this file has never
 * heard of is a tool the platform shipped after it was last touched, and the
 * honest thing to render is the English name it actually has.
 */
export const catalogCopy = (
  lang: Lang,
  key: string,
  fallback: string | null
): string | null => BY_LANG[lang]?.[key] ?? fallback;
