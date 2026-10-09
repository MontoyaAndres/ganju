import type { Catalog } from '../core';

/**
 * The project home — the MCP URL, the activity chart, three counters, tool
 * health with the calls behind it, and a recent-activity feed.
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
  toastRefreshFailed: 'Could not refresh activity',

  // Tool health: per-tool calls, errors and latency, from MCP clients and
  // channel bots alike, with the calls behind each number.
  healthTitle: 'Tool health',
  /** `{days}` is the selected range. */
  healthHelp:
    'How each tool did over the last {days} days, from MCP clients and channel bots alike. Click a tool to see its calls.',
  healthEmpty: 'No tool calls in the last {days} days.',
  healthLoadFailed: "We couldn't load tool health.",
  colTool: 'Tool',
  colCalls: 'Calls',
  colErrors: 'Errors',
  colP95: 'p95',
  colP95Hint: '95% of calls finished faster than this.',
  colLastUsed: 'Last used',
  colSignals: 'Signals',
  notInstalled: 'Not on this server',
  notInstalledHint:
    'No tool on this server has this name now. It was removed, or the model made it up.',
  toolOff: 'Off',
  signalSchema_one: '{count} bad arguments',
  signalSchema_other: '{count} bad arguments',
  signalSchemaHint:
    "Calls whose arguments didn't match the tool's input schema. Clearer descriptions of the inputs usually fix these.",
  signalRetry_one: '{count} retry',
  signalRetry_other: '{count} retries',
  signalRetryHint:
    'Called again right after it failed, or with the very same arguments.',
  signalSwitch_one: '{count} gave up',
  signalSwitch_other: '{count} gave up',
  signalSwitchHint:
    'After this tool failed, the model called a different tool instead.',
  /** Milliseconds. */
  latencyMs: '{ms} ms',

  errorsTitle: 'Most common errors',
  errorsEmpty: 'No errors in the last {days} days.',
  /** How many times the same error happened. */
  errorTimes: '{count}×',

  unusedTitle: 'Unused in {days} days',
  unusedHelp:
    'Enabled, but not called once in {days} days. Every enabled tool is sent to the model on every turn.',
  unusedEmpty: 'Every enabled tool was used in the last {days} days.',
  unusedNative: 'Built-in tool',
  unusedProxy: 'MCP server',
  unusedFunctions: 'Functions',
  unusedHttp: 'HTTP endpoint',
  disable: 'Disable',
  disabling: 'Disabling…',
  /** `{name}` is the tool, server or functions. */
  disableConfirmTitle: 'Disable {name}?',
  disableConfirmText:
    'MCP clients and channel bots stop seeing it. You can turn it back on from the Tools page.',
  /**
   * When enabling it again would be refused: the project is already at or
   * over its plan's tool limit. `{plan}` is FREE, PRO, …
   */
  disableConfirmQuota:
    "MCP clients and channel bots stop seeing it. This project has {enabled} tools on and the {plan} plan allows {limit}, so you won't be able to turn it back on unless you turn another tool off first or upgrade.",
  /** `{name}` is the tool or server. */
  toastDisabled: '{name} disabled',
  toastDisableFailed: "Couldn't disable {name}",

  // The drill-down: a tool's calls, one call, the session it ran in.
  callsTitle: 'Calls to {tool}',
  filterAll: 'All',
  filterErrors: 'Errors',
  callsEmpty: 'No calls to show.',
  callsLoadFailed: "We couldn't load these calls.",
  loadMore: 'Load more',
  callTitle: 'Call to {tool}',
  callLoadFailed: "We couldn't load this call.",
  callRejected: 'Rejected before it ran',
  back: 'Back',
  /** `{platform}` is Telegram, Slack, … */
  viaChannel: '{platform} bot',
  viaMcp: 'MCP client',
  labelError: 'Error',
  labelArguments: 'Arguments',
  labelResult: 'Result',
  openSession: 'Open session',
  openConversation: 'Open conversation',
  sessionTitle: 'Session',
  sessionHelp:
    'Every tool call, prompt and resource read in this session, oldest first. Click one to see it whole.',
  sessionTruncated: 'Showing the latest {count} calls.',
  sessionEmpty: 'Nothing recorded in this session.',
  sessionLoadFailed: "We couldn't load this session.",
  methodPrompt: 'Prompt',
  methodResource: 'Read',
  toastCopied: 'Copied'
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
    toastRefreshFailed: 'No pudimos actualizar la actividad',

    healthTitle: 'Salud de las herramientas',
    healthHelp:
      'Cómo le fue a cada herramienta en los últimos {days} días, tanto en clientes MCP como en bots de canales. Haz clic en una para ver sus llamadas.',
    healthEmpty: 'No hubo llamadas a herramientas en los últimos {days} días.',
    healthLoadFailed: 'No pudimos cargar la salud de las herramientas.',
    colTool: 'Herramienta',
    colCalls: 'Llamadas',
    colErrors: 'Errores',
    colP95: 'p95',
    colP95Hint: 'El 95 % de las llamadas terminó en menos de este tiempo.',
    colLastUsed: 'Último uso',
    colSignals: 'Señales',
    notInstalled: 'No está en este servidor',
    notInstalledHint:
      'Ninguna herramienta de este servidor se llama así ahora. Se eliminó, o el modelo se la inventó.',
    toolOff: 'Apagada',
    signalSchema_one: '{count} argumentos inválidos',
    signalSchema_other: '{count} argumentos inválidos',
    signalSchemaHint:
      'Llamadas cuyos argumentos no coincidían con el esquema de entrada de la herramienta. Describir mejor las entradas suele resolverlo.',
    signalRetry_one: '{count} reintento',
    signalRetry_other: '{count} reintentos',
    signalRetryHint:
      'Se volvió a llamar justo después de fallar, o con los mismos argumentos.',
    signalSwitch_one: '{count} abandono',
    signalSwitch_other: '{count} abandonos',
    signalSwitchHint:
      'Después de que esta herramienta falló, el modelo llamó a otra en su lugar.',
    latencyMs: '{ms} ms',

    errorsTitle: 'Errores más comunes',
    errorsEmpty: 'Sin errores en los últimos {days} días.',
    errorTimes: '{count}×',

    unusedTitle: 'Sin uso en {days} días',
    unusedHelp:
      'Activadas, pero sin una sola llamada en {days} días. Cada herramienta activada se envía al modelo en cada turno.',
    unusedEmpty:
      'Todas las herramientas activadas se usaron en los últimos {days} días.',
    unusedNative: 'Herramienta integrada',
    unusedProxy: 'Servidor MCP',
    unusedFunctions: 'Funciones',
    unusedHttp: 'Endpoint HTTP',
    disable: 'Desactivar',
    disabling: 'Desactivando…',
    disableConfirmTitle: '¿Desactivar {name}?',
    disableConfirmText:
      'Los clientes MCP y los bots de canales dejan de verla. Puedes volver a activarla desde la página de Acciones.',
    disableConfirmQuota:
      'Los clientes MCP y los bots de canales dejan de verla. Este proyecto tiene {enabled} herramientas activadas y el plan {plan} permite {limit}, así que no podrás volver a activarla a menos que primero desactives otra o mejores tu plan.',
    toastDisabled: '{name} desactivada',
    toastDisableFailed: 'No pudimos desactivar {name}',

    callsTitle: 'Llamadas a {tool}',
    filterAll: 'Todas',
    filterErrors: 'Errores',
    callsEmpty: 'No hay llamadas para mostrar.',
    callsLoadFailed: 'No pudimos cargar estas llamadas.',
    loadMore: 'Cargar más',
    callTitle: 'Llamada a {tool}',
    callLoadFailed: 'No pudimos cargar esta llamada.',
    callRejected: 'Rechazada antes de ejecutarse',
    back: 'Volver',
    viaChannel: 'Bot de {platform}',
    viaMcp: 'Cliente MCP',
    labelError: 'Error',
    labelArguments: 'Argumentos',
    labelResult: 'Resultado',
    openSession: 'Abrir la sesión',
    openConversation: 'Abrir la conversación',
    sessionTitle: 'Sesión',
    sessionHelp:
      'Cada llamada a herramientas, prompt y lectura de recursos de esta sesión, de la más antigua a la más reciente. Haz clic en una para verla completa.',
    sessionTruncated: 'Se muestran las últimas {count} llamadas.',
    sessionEmpty: 'No hay nada registrado en esta sesión.',
    sessionLoadFailed: 'No pudimos cargar esta sesión.',
    methodPrompt: 'Prompt',
    methodResource: 'Lectura',
    toastCopied: 'Copiado'
  }
};
