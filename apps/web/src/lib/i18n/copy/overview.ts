import type { Catalog } from '../core';

/**
 * The project home — the MCP URL, the activity chart, three counters and a
 * recent-activity feed.
 *
 * Platform names (Telegram, Slack, …), `MCP`, and the client names in the
 * config hint are proper nouns and stay as they are.
 */
const en = {
  // Whole-page failure.
  errorText: "We couldn't load this project's overview.",
  retry: 'Retry',

  // Header.
  defaultDescription:
    'Everything this project exposes through its MCP server, at a glance.',
  mcpUrl: 'MCP URL',
  clickToCopy: 'Click to copy',
  editMcpUrl: 'Edit MCP URL',

  // Activity chart.
  activity: 'Activity',
  activityHelp:
    'All interactions per day across channels and MCP clients — including incoming messages. Only assistant replies count toward billing.',
  /** The range buttons: 7d, 30d, 90d. `{days}` is the number. */
  rangeDays: '{days}d',
  chartLine: 'Line',
  chartArea: 'Area',
  chartBar: 'Bar',
  activityEmpty: 'No activity yet in the last {days} days.',
  allHidden: 'Every series is hidden — click a legend item to show it.',
  legendShow: 'Show',
  legendHide: 'Hide',

  // Counters.
  statResources: 'Resources',
  /** `{size}` stored and `{reads}` reads. */
  statResourcesMeta: '{size} stored · {reads} reads',
  statTools: 'Tools',
  statToolsMeta: '{count} calls',
  statPrompts: 'Prompts',
  statPromptsMeta: '{count} uses',

  // Recent activity. The verb agrees with what was run.
  recentTitle: 'Recent activity',
  recentEmpty: 'No tool, prompt, or resource runs recorded yet.',
  verbTool: 'ran',
  verbPrompt: 'used',
  verbResource: 'read',
  verbDefault: 'used',
  actorMcpClient: 'An MCP client',
  actorSomeone: 'Someone',
  unknownClient: 'Unknown client',

  // Slug editor.
  slugLabel: 'Slug',
  slugPlaceholder: 'my-company',
  slugFormatError:
    'Use 3-63 lowercase letters, digits or hyphens, starting and ending with a letter or digit.',
  slugReserved: 'That slug is reserved.',
  slugUpdateFailed: 'Could not update the slug.',
  preview: 'Preview',
  clientConfig: 'Client config',
  clientConfigHint: 'Add this to your MCP client (Claude Desktop, Cursor, …)',
  toastMcpUrlCopied: 'MCP URL copied',
  toastConfigCopied: 'Config copied',
  toastCopyFailed: 'Could not copy',
  toastMcpUrlUpdated: 'MCP URL updated',
  toastRefreshFailed: 'Could not refresh activity'
};

type OverviewCopy = typeof en;

export const OVERVIEW: Catalog<OverviewCopy> = {
  en,
  es: {
    errorText: 'No pudimos cargar el resumen de este proyecto.',
    retry: 'Reintentar',

    defaultDescription:
      'Todo lo que este proyecto expone a través de su servidor MCP, de un vistazo.',
    mcpUrl: 'URL de MCP',
    clickToCopy: 'Haz clic para copiar',
    editMcpUrl: 'Editar la URL de MCP',

    activity: 'Actividad',
    activityHelp:
      'Todas las interacciones por día, en los canales y los clientes MCP — incluidos los mensajes que entran. Solo las respuestas del asistente cuentan para la facturación.',
    rangeDays: '{days}d',
    chartLine: 'Líneas',
    chartArea: 'Área',
    chartBar: 'Barras',
    activityEmpty: 'Todavía no hay actividad en los últimos {days} días.',
    allHidden:
      'Todas las series están ocultas — haz clic en la leyenda para mostrar una.',
    legendShow: 'Mostrar',
    legendHide: 'Ocultar',

    statResources: 'Recursos',
    statResourcesMeta: '{size} almacenados · {reads} lecturas',
    statTools: 'Herramientas',
    statToolsMeta: '{count} llamadas',
    statPrompts: 'Prompts',
    statPromptsMeta: '{count} usos',

    recentTitle: 'Actividad reciente',
    recentEmpty:
      'Todavía no hay ejecuciones de herramientas, prompts ni recursos.',
    verbTool: 'ejecutó',
    verbPrompt: 'usó',
    verbResource: 'leyó',
    verbDefault: 'usó',
    actorMcpClient: 'Un cliente MCP',
    actorSomeone: 'Alguien',
    unknownClient: 'Cliente desconocido',

    slugLabel: 'Slug',
    slugPlaceholder: 'mi-empresa',
    slugFormatError:
      'Usa entre 3 y 63 letras minúsculas, dígitos o guiones, empezando y terminando con una letra o un dígito.',
    slugReserved: 'Ese slug está reservado.',
    slugUpdateFailed: 'No pudimos actualizar el slug.',
    preview: 'Vista previa',
    clientConfig: 'Configuración del cliente',
    clientConfigHint:
      'Agrega esto a tu cliente MCP (Claude Desktop, Cursor, …)',
    toastMcpUrlCopied: 'URL de MCP copiada',
    toastConfigCopied: 'Configuración copiada',
    toastCopyFailed: 'No pudimos copiar',
    toastMcpUrlUpdated: 'URL de MCP actualizada',
    toastRefreshFailed: 'No pudimos actualizar la actividad'
  }
};
