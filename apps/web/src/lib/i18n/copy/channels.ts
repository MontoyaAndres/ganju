import type { Catalog } from '../core';

/**
 * The channels view — connecting Telegram, Slack, Discord and WhatsApp bots,
 * and reading back the conversations they produced.
 *
 * Most of the setup copy names things in someone else's dashboard: `Bot User
 * OAuth Token`, `Privileged Gateway Intents`, `Basic Information → App
 * Credentials`. Those navigation paths stay in English on purpose — the Meta,
 * Slack and Discord consoles are English regardless of what Ganju is set to,
 * and translating the label a reader has to hunt for makes it harder to find,
 * not easier. What is translated is the sentence around them.
 */
const en = {
  title: 'Channels',
  subtitle:
    'Connect this artifact to messaging platforms so users can chat with it.',
  addChannel: 'Add channel',
  emptyTitle: 'No channels yet',
  emptyText: 'Connect a Telegram or Slack bot to start receiving messages.',
  statusActive: 'Active',
  statusDisabled: 'Disabled',
  /** The card meta line: "3 conversations · 12 messages". */
  countConversations_one: '{count} conversation',
  countConversations_other: '{count} conversations',
  countMessages_one: '{count} message',
  countMessages_other: '{count} messages',

  panelConnect: 'Connect channel',
  panelConversation: 'Conversation',
  tabOverview: 'Overview',
  tabConversations: 'Conversations',

  // Create form.
  platform: 'Platform',
  platformSoon: 'Soon',
  languageModel: 'Language model',
  systemDefault: 'System default',
  llmHelpEmpty:
    'No LLMs configured for this organization — the system default will be used. Add one in Settings.',
  llmHelp: 'Pick the model this channel will use, or leave the system default.',
  connect: 'Connect',
  connecting: 'Connecting...',

  // Credential fields, one set per platform.
  botToken: 'Bot token',
  telegramTokenHelp:
    'Get a token from @BotFather on Telegram. We register the webhook automatically.',
  slackTokenHelp:
    'Bot User OAuth Token (OAuth & Permissions, after installing the app with the scopes below).',
  signingSecret: 'Signing secret',
  signingSecretPlaceholder: 'Slack app signing secret',
  signingSecretHelp:
    'Found under Basic Information → App Credentials. Used to verify incoming events.',
  discordTokenPlaceholder: 'Bot token from the Bot tab',
  discordTokenHelp:
    'Discord Developer Portal → your application → Bot → Reset Token.',
  applicationId: 'Application ID',
  applicationIdPlaceholder: 'Application (client) ID',
  applicationIdHelp:
    'General Information → Application ID. Used to register slash commands.',
  publicKey: 'Public key',
  publicKeyPlaceholder: 'Application public key',
  publicKeyHelp:
    'General Information → Public Key. Used to verify incoming interactions.',
  accessToken: 'Access token',
  accessTokenPlaceholder: 'System User access token',
  accessTokenHelp:
    'A permanent System User token with the whatsapp_business_messaging permission.',
  phoneNumberId: 'Phone number ID',
  phoneNumberIdPlaceholder: 'WhatsApp phone number ID',
  phoneNumberIdHelp:
    'WhatsApp → API Setup → From: the Phone number ID (not the display number).',
  verifyToken: 'Verify token',
  verifyTokenPlaceholder: 'A token you choose',
  verifyTokenHelp:
    'Any value you choose. Enter the same token in the Meta dashboard when you set the Callback URL.',
  appSecret: 'App secret',
  appSecretPlaceholder: 'Meta app secret',
  appSecretHelp:
    'App → Settings → Basic → App secret. Used to verify incoming webhooks.',
  discordAfterConnect:
    "After connecting, you'll get an Interactions Endpoint URL to paste into your application's General Information page — that's what powers slash commands.",
  slackAfterConnect:
    "After connecting, you'll get a Request URL to paste into your Slack app's Event Subscriptions. The same URL works for any Slash Commands you add.",
  whatsappAfterConnect:
    "After connecting, you'll get a Callback URL to paste into the Meta app dashboard → WhatsApp → Configuration, together with the Verify token above.",

  errorBotToken: 'Bot token is required',
  errorSigningSecret: 'Signing secret is required',
  errorApplicationId: 'Application ID is required',
  errorPublicKey: 'Public key is required',
  errorAccessToken: 'Access token is required',
  errorPhoneNumberId: 'Phone number ID is required',
  errorVerifyToken: 'Verify token is required',
  errorAppSecret: 'App secret is required',

  // Platform requirement panels.
  scopesRequired: 'Bot token scopes — required',
  scopesRecommended: 'Bot token scopes — recommended',
  scopesRecommendedHint:
    'Optional — without these the bot still works but falls back to user and channel IDs instead of names.',
  botEvents: 'Subscribe to bot events',
  botEventsHint:
    'Also enable the Messages tab (App Home) so users can DM the bot.',
  discordIntents: 'Privileged Gateway Intents',
  discordIntentsHint:
    "Enable these under Bot → Privileged Gateway Intents in the Discord Developer Portal. Without MESSAGE CONTENT the bot can only read messages in DMs or when it's @mentioned.",
  discordInviteScopes: 'Invite scopes',
  discordInviteHint:
    'Invite the bot with the Send Messages, Read Message History, and Attach Files permissions so it can reply and share files.',
  whatsappWebhookFields: 'Webhook fields',
  /** Split around the `<code>messages</code>` chip the sentence names. */
  whatsappWebhookHintBefore:
    'In the Meta app dashboard → WhatsApp → Configuration, subscribe the webhook to the ',
  whatsappWebhookHintAfter:
    ' field. Use the same Verify token you entered here.',
  whatsappCredentials: 'Credentials',
  whatsappCredentialsBefore:
    'Access token: a permanent System User token with ',
  whatsappCredentialsAfter:
    ' permission. Phone number ID and App secret come from the WhatsApp → API Setup and App → Settings → Basic pages.',

  // Overview tab.
  fallbackSlackWorkspace: 'Slack workspace',
  fallbackDiscordBot: 'Discord bot',
  fallbackWhatsappNumber: 'WhatsApp number',
  slackSetup: 'Slack setup',
  requestUrl: 'Request URL',
  slackSetupHint:
    'Paste this into your Slack app under Event Subscriptions, and as the Request URL for any Slash Commands you add.',
  discordSetup: 'Discord setup',
  interactionsUrl: 'Interactions Endpoint URL',
  discordSetupHint:
    'Paste this into the Discord Developer Portal → General Information → Interactions Endpoint URL (needed for slash commands). Normal messages and @mentions arrive over the Gateway automatically.',
  whatsappSetup: 'WhatsApp setup',
  callbackUrl: 'Callback URL',
  whatsappSetupHint:
    'Paste this into the Meta app dashboard → WhatsApp → Configuration → Callback URL, with the Verify token you set when connecting, then subscribe to the messages field.',

  statusLabel: 'Status',
  statusReceiving: 'Receiving messages',
  statusPaused: 'Paused',
  statusReceivingHint: 'Incoming webhook events are processed by the agent.',
  statusPausedHint:
    'Webhook still configured but events are dropped until re-enabled.',
  channelLlmHelpEmpty:
    'No LLMs configured. Add one in Settings to switch from the system default.',
  channelLlmHelp: 'Change which language model this channel uses.',

  replyTiming: 'Reply timing',
  replyTimingHelp:
    'People often send one thought across several messages. Waiting for a pause lets the bot answer them all in a single reply.',
  replyEveryMessage: 'Answer every message',
  replyWait2: 'Wait 2 seconds',
  replyWait5: 'Wait 5 seconds (recommended)',
  replyWait10: 'Wait 10 seconds',
  replyWait30: 'Wait 30 seconds',

  activity: 'Activity',
  statConversations: 'Conversations',
  statMessages: 'Messages',
  dangerZone: 'Danger zone',
  removeChannel: 'Remove channel',
  confirmRemoveTitle: 'Remove channel',
  confirmRemoveText:
    'This will disconnect {name} and delete its conversation history. This cannot be undone.',
  confirmRemoveFallback: 'this channel',
  confirmRemove: 'Remove',

  // Conversations tab.
  conversationsEmpty:
    'No conversations yet. Send a message to your bot to start one.',
  conversationUntitled: 'Untitled',
  loadingMessages: 'Loading messages...',
  threadEmpty: 'No messages in this thread.',
  sourcePage: 'Page {number}',

  // Usage detail modal.
  closeDetails: 'Close details',
  /** Heading over the resources an answer cited. */
  messageSources: 'Sources',

  /**
   * Values the API sends, rendered as labels: a conversation's scope, a
   * message's role, and what an agent reached for mid-turn. They arrive in
   * English and stay English on the wire — only the label is translated.
   */
  scopePrivate: 'Private',
  scopeGroup: 'Group',
  scopeChannel: 'Channel',
  roleUser: 'User',
  roleAssistant: 'Assistant',
  roleSystem: 'System',
  roleTool: 'Tool',
  kindPrompt: 'Prompt',
  kindTool: 'Tool',
  kindResource: 'Resource',
  usageUserMessage: 'User message',
  usageAssistantTurn: 'Assistant turn',
  usageError: 'Error',
  usageInput: 'Input',
  usageOutput: 'Output',
  usageUnknownActor: 'Unknown',
  usageOpenInTools: 'Open in Tools',
  usageOpenInResources: 'Open in Resources',
  usageOpenInPrompts: 'Open in Prompts',
  fallbackTool: 'Tool',
  fallbackResource: 'Resource',
  fallbackPrompt: 'Prompt',

  toastRequestUrlCopied: 'Request URL copied',
  toastInteractionsUrlCopied: 'Interactions Endpoint URL copied',
  toastCallbackUrlCopied: 'Callback URL copied',
  toastUserMessageCopied: 'User message copied',
  toastErrorCopied: 'Error copied',
  toastInputCopied: 'Input copied',
  toastOutputCopied: 'Output copied',
  toastCopyFailed: 'Failed to copy',
  toastModelUpdated: 'Model updated',
  toastModelUpdateFailed: 'Failed to update model',
  toastReplyEveryMessage: 'The bot will answer every message as it arrives',
  toastReplyTimingUpdated: 'Reply timing updated',
  toastReplyTimingFailed: 'Failed to update reply timing',
  toastChannelConnected: 'Channel connected',
  toastChannelCreateFailed: 'Failed to create channel',
  toastChannelEnabled: 'Channel enabled',
  toastChannelDisabled: 'Channel disabled',
  toastChannelUpdateFailed: 'Failed to update channel',
  toastChannelRemoved: 'Channel removed',
  toastChannelRemoveFailed: 'Failed to remove channel'
};

type ChannelsCopy = typeof en;

export const CHANNELS: Catalog<ChannelsCopy> = {
  en,
  es: {
    title: 'Canales',
    subtitle:
      'Conecta este artefacto con plataformas de mensajería para que la gente pueda chatear con él.',
    addChannel: 'Agregar canal',
    emptyTitle: 'Todavía no hay canales',
    emptyText:
      'Conecta un bot de Telegram o de Slack para empezar a recibir mensajes.',
    statusActive: 'Activo',
    statusDisabled: 'Desactivado',
    countConversations_one: '{count} conversación',
    countConversations_other: '{count} conversaciones',
    countMessages_one: '{count} mensaje',
    countMessages_other: '{count} mensajes',

    panelConnect: 'Conectar canal',
    panelConversation: 'Conversación',
    tabOverview: 'Resumen',
    tabConversations: 'Conversaciones',

    platform: 'Plataforma',
    platformSoon: 'Pronto',
    languageModel: 'Modelo de lenguaje',
    systemDefault: 'Modelo por defecto',
    llmHelpEmpty:
      'Esta organización no tiene modelos configurados — se usará el modelo por defecto. Agrega uno en Ajustes.',
    llmHelp:
      'Elige el modelo que usará este canal, o deja el modelo por defecto.',
    connect: 'Conectar',
    connecting: 'Conectando...',

    botToken: 'Token del bot',
    telegramTokenHelp:
      'Consigue un token con @BotFather en Telegram. Nosotros registramos el webhook automáticamente.',
    slackTokenHelp:
      'El Bot User OAuth Token (OAuth & Permissions, después de instalar la app con los scopes de abajo).',
    signingSecret: 'Signing secret',
    signingSecretPlaceholder: 'Signing secret de la app de Slack',
    signingSecretHelp:
      'Está en Basic Information → App Credentials. Sirve para verificar los eventos que llegan.',
    discordTokenPlaceholder: 'Token del bot, en la pestaña Bot',
    discordTokenHelp:
      'Discord Developer Portal → tu aplicación → Bot → Reset Token.',
    applicationId: 'Application ID',
    applicationIdPlaceholder: 'Application (client) ID',
    applicationIdHelp:
      'General Information → Application ID. Sirve para registrar los comandos.',
    publicKey: 'Public key',
    publicKeyPlaceholder: 'Public key de la aplicación',
    publicKeyHelp:
      'General Information → Public Key. Sirve para verificar las interacciones que llegan.',
    accessToken: 'Access token',
    accessTokenPlaceholder: 'Access token de System User',
    accessTokenHelp:
      'Un token permanente de System User con el permiso whatsapp_business_messaging.',
    phoneNumberId: 'Phone number ID',
    phoneNumberIdPlaceholder: 'Phone number ID de WhatsApp',
    phoneNumberIdHelp:
      'WhatsApp → API Setup → From: el Phone number ID (no el número que se muestra).',
    verifyToken: 'Verify token',
    verifyTokenPlaceholder: 'Un token que elijas',
    verifyTokenHelp:
      'El valor que quieras. Escribe el mismo token en el panel de Meta cuando configures la Callback URL.',
    appSecret: 'App secret',
    appSecretPlaceholder: 'App secret de Meta',
    appSecretHelp:
      'App → Settings → Basic → App secret. Sirve para verificar los webhooks que llegan.',
    discordAfterConnect:
      'Después de conectar te damos una Interactions Endpoint URL para pegar en la página General Information de tu aplicación — eso es lo que hace funcionar los slash commands.',
    slackAfterConnect:
      'Después de conectar te damos una Request URL para pegar en Event Subscriptions de tu app de Slack. La misma URL sirve para los Slash Commands que agregues.',
    whatsappAfterConnect:
      'Después de conectar te damos una Callback URL para pegar en el panel de Meta → WhatsApp → Configuration, junto con el Verify token de arriba.',

    errorBotToken: 'El token del bot es obligatorio',
    errorSigningSecret: 'El signing secret es obligatorio',
    errorApplicationId: 'El Application ID es obligatorio',
    errorPublicKey: 'La public key es obligatoria',
    errorAccessToken: 'El access token es obligatorio',
    errorPhoneNumberId: 'El Phone number ID es obligatorio',
    errorVerifyToken: 'El Verify token es obligatorio',
    errorAppSecret: 'El App secret es obligatorio',

    scopesRequired: 'Scopes del token del bot — obligatorios',
    scopesRecommended: 'Scopes del token del bot — recomendados',
    scopesRecommendedHint:
      'Opcionales — sin ellos el bot funciona igual, pero muestra IDs de usuario y de canal en vez de nombres.',
    botEvents: 'Eventos del bot a los que suscribirse',
    botEventsHint:
      'Activa también la pestaña Messages (App Home) para que la gente pueda escribirle por mensaje directo.',
    discordIntents: 'Privileged Gateway Intents',
    discordIntentsHint:
      'Actívalos en Bot → Privileged Gateway Intents, en el Discord Developer Portal. Sin MESSAGE CONTENT el bot solo puede leer mensajes directos o cuando lo mencionan con @.',
    discordInviteScopes: 'Scopes de la invitación',
    discordInviteHint:
      'Invita al bot con los permisos Send Messages, Read Message History y Attach Files para que pueda responder y compartir archivos.',
    whatsappWebhookFields: 'Campos del webhook',
    whatsappWebhookHintBefore:
      'En el panel de Meta → WhatsApp → Configuration, suscribe el webhook al campo ',
    whatsappWebhookHintAfter:
      '. Usa el mismo Verify token que escribiste aquí.',
    whatsappCredentials: 'Credenciales',
    whatsappCredentialsBefore:
      'Access token: un token permanente de System User con el permiso ',
    whatsappCredentialsAfter:
      '. El Phone number ID y el App secret están en las páginas WhatsApp → API Setup y App → Settings → Basic.',

    fallbackSlackWorkspace: 'Espacio de Slack',
    fallbackDiscordBot: 'Bot de Discord',
    fallbackWhatsappNumber: 'Número de WhatsApp',
    slackSetup: 'Configuración de Slack',
    requestUrl: 'Request URL',
    slackSetupHint:
      'Pega esto en tu app de Slack, en Event Subscriptions, y como Request URL de los Slash Commands que agregues.',
    discordSetup: 'Configuración de Discord',
    interactionsUrl: 'Interactions Endpoint URL',
    discordSetupHint:
      'Pega esto en el Discord Developer Portal → General Information → Interactions Endpoint URL (hace falta para los comandos). Los mensajes normales y las menciones llegan solos por el Gateway.',
    whatsappSetup: 'Configuración de WhatsApp',
    callbackUrl: 'Callback URL',
    whatsappSetupHint:
      'Pega esto en el panel de Meta → WhatsApp → Configuration → Callback URL, con el Verify token que pusiste al conectar, y luego suscríbete al campo messages.',

    statusLabel: 'Estado',
    statusReceiving: 'Recibiendo mensajes',
    statusPaused: 'En pausa',
    statusReceivingHint: 'El agente procesa los eventos que llegan al webhook.',
    statusPausedHint:
      'El webhook sigue configurado, pero los eventos se descartan hasta que lo vuelvas a activar.',
    channelLlmHelpEmpty:
      'No hay modelos configurados. Agrega uno en Ajustes para cambiar el modelo por defecto.',
    channelLlmHelp: 'Cambia el modelo de lenguaje que usa este canal.',

    replyTiming: 'Tiempo de respuesta',
    replyTimingHelp:
      'La gente suele mandar una misma idea en varios mensajes. Esperar una pausa deja que el bot responda a todos de una vez.',
    replyEveryMessage: 'Responder cada mensaje',
    replyWait2: 'Esperar 2 segundos',
    replyWait5: 'Esperar 5 segundos (recomendado)',
    replyWait10: 'Esperar 10 segundos',
    replyWait30: 'Esperar 30 segundos',

    activity: 'Actividad',
    statConversations: 'Conversaciones',
    statMessages: 'Mensajes',
    dangerZone: 'Zona de riesgo',
    removeChannel: 'Eliminar canal',
    confirmRemoveTitle: 'Eliminar canal',
    confirmRemoveText:
      'Esto desconecta {name} y borra su historial de conversaciones. No se puede deshacer.',
    confirmRemoveFallback: 'este canal',
    confirmRemove: 'Eliminar',

    conversationsEmpty:
      'Todavía no hay conversaciones. Escríbele a tu bot para empezar una.',
    conversationUntitled: 'Sin título',
    loadingMessages: 'Cargando los mensajes...',
    threadEmpty: 'No hay mensajes en este hilo.',
    sourcePage: 'Página {number}',

    closeDetails: 'Cerrar los detalles',
    messageSources: 'Fuentes',

    scopePrivate: 'Privado',
    scopeGroup: 'Grupo',
    scopeChannel: 'Canal',
    roleUser: 'Usuario',
    roleAssistant: 'Asistente',
    roleSystem: 'Sistema',
    roleTool: 'Herramienta',
    kindPrompt: 'Prompt',
    kindTool: 'Herramienta',
    kindResource: 'Recurso',
    usageUserMessage: 'Mensaje del usuario',
    usageAssistantTurn: 'Turno del asistente',
    usageError: 'Error',
    usageInput: 'Entrada',
    usageOutput: 'Salida',
    usageUnknownActor: 'Desconocido',
    usageOpenInTools: 'Abrir en Herramientas',
    usageOpenInResources: 'Abrir en Recursos',
    usageOpenInPrompts: 'Abrir en Prompts',
    fallbackTool: 'Herramienta',
    fallbackResource: 'Recurso',
    fallbackPrompt: 'Prompt',

    toastRequestUrlCopied: 'Request URL copiada',
    toastInteractionsUrlCopied: 'Interactions Endpoint URL copiada',
    toastCallbackUrlCopied: 'Callback URL copiada',
    toastUserMessageCopied: 'Mensaje del usuario copiado',
    toastErrorCopied: 'Error copiado',
    toastInputCopied: 'Entrada copiada',
    toastOutputCopied: 'Salida copiada',
    toastCopyFailed: 'No pudimos copiar',
    toastModelUpdated: 'Modelo actualizado',
    toastModelUpdateFailed: 'No pudimos actualizar el modelo',
    toastReplyEveryMessage: 'El bot responderá cada mensaje apenas llegue',
    toastReplyTimingUpdated: 'Tiempo de respuesta actualizado',
    toastReplyTimingFailed: 'No pudimos actualizar el tiempo de respuesta',
    toastChannelConnected: 'Canal conectado',
    toastChannelCreateFailed: 'No pudimos crear el canal',
    toastChannelEnabled: 'Canal activado',
    toastChannelDisabled: 'Canal desactivado',
    toastChannelUpdateFailed: 'No pudimos actualizar el canal',
    toastChannelRemoved: 'Canal eliminado',
    toastChannelRemoveFailed: 'No pudimos eliminar el canal'
  }
};
