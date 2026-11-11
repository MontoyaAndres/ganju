import type { Catalog } from '../core';

/**
 * The project's Assistant tab: the chat where the owner builds their bot with
 * the assistant, its cards, and the "Try it as a customer" panel. Owners here
 * don't write code, so nothing says draft, deploy, version or schema.
 */
const en = {
  title: 'Assistant',
  subtitle: 'Tell it what your bot should know or do. It builds it with you.',
  newChat: 'New chat',
  pastChats: 'Past chats',
  noChats: 'No chats yet',
  untitled: 'New chat',
  creditsUsed: '{used} of {included} credits used this month',
  creditsExtra: '{extra} extra credits, of {cap} allowed',
  creditsUsedUp:
    "This month's credits are used up. An admin can raise the limit in Settings → Billing & plan.",
  creditsOwnKey:
    'The assistant runs on your own Anthropic key and uses no credits. The customer test chat still does.',
  creditsPayWith: 'Pay with',
  creditsGanju: 'Ganju credits',
  errorOwnKey:
    "Your Anthropic key couldn't be used: it was refused, hit its rate limit, or has no access to the model. An admin can fix it in Settings → Models, or switch back to Ganju credits.",
  chatCredits: '{credits} credits in this chat',
  replyCredits: '{credits} credits',

  chats: 'Chats',
  composeHint: 'Enter to send · Shift + Enter for a new line',
  suggestionsLabel: 'Try one of these',
  suggestion1: 'Tell customers if we are open right now',
  suggestion2: 'Answer questions from my menu',
  suggestion3: 'Take orders and email them to me',
  suggestion4: 'Book appointments in my Google Calendar',
  stepsTitle: 'What it did',
  stepSeconds: '· {seconds} s',
  emptyTitle: 'What should your bot do?',
  emptyText:
    'Describe it in your own words. For example: "tell customers if a pizza is sold out", or "book appointments in my calendar".',
  placeholder: 'Write to the assistant...',
  send: 'Send',
  working: 'Working...',
  stop: 'Stop following',
  errorTurn: 'Something went wrong while answering. Try again.',
  errorSend: "The message couldn't be sent.",
  busy: 'The assistant is already answering in this project. Wait for it to finish.',
  rateLimited: 'Too many messages in a minute. Wait a moment and try again.',
  stoppedSteps:
    'The assistant stopped after many steps. Tell it to continue if it was not done.',
  noteLine: 'Update for the assistant: {text}',

  toolProject: 'Looking at your project',
  toolRead: 'Reading your actions',
  toolWrite: 'Writing an action',
  toolLogs: 'Checking recent runs',
  toolTurnOn: 'Getting it ready to turn on',
  toolTest: 'Trying it',
  toolData: 'Looking at your data',
  toolKnowledge: 'Reading what your bot knows',
  toolPrompts: 'Looking at your prompts',
  toolTools: 'Looking at your tools',
  toolPropose: 'Preparing your changes',
  toolPatch: 'Writing the change for your developer',
  toolAsk: 'Preparing a request for you',

  lockedBadge: 'Pro',
  lockedTitle: 'Build your bot by describing it',
  lockedText:
    'The assistant writes actions, tests them and turns them on with your click. It is part of the Pro plan.',
  upgrade: 'Upgrade',

  changeTitle: 'Ready to apply',
  changeTitleDone: 'Changes',
  changePossible: 'Once applied, your bot can:',
  changeReads: 'Only reads information',
  changeWrites: 'Changes or sends things (it asks your customer first)',
  changeTablesRead: 'Read your tables: {tables}',
  changeTablesWrite: 'Read and change your tables: {tables}',
  changeHosts: 'Reach {hosts}',
  changeAccounts: 'Use your accounts: {accounts}',
  changeCantUndo: "This can't be undone",
  changeSomeCantUndo: "Some of this can't be undone",
  itemDeletes: 'Deletes',
  itemTypeName: 'Type "{name}" to confirm',
  itemRestore:
    'Undo puts your whole database back to just before this. Anything saved after it is lost.',
  itemLostFile: "The file's contents can't come back",
  itemLostCredentials:
    'Undo adds it back, but its key or sign-in has to be added again',
  itemLostSecret: 'Its webhook gets a new secret',
  itemFromCode:
    'Your developer manages these tables from code: their next upload will put this back',
  typeToApply: 'Type the names above to apply',
  undoRestoreConfirm:
    'This puts your whole database back to how it was before. Anything saved since is lost.',
  undoAnyway: 'Undo anyway',
  cancel: 'Cancel',
  apply: 'Apply',
  applying: 'Applying...',
  applied: 'Applied',
  undo: 'Undo',
  undoing: 'Undoing...',
  undone: 'Undone',
  failed: "Couldn't apply: {error}",
  failedShort: "Didn't apply",
  discarded: 'Replaced by a newer change',
  toastApplied: 'Applied. Your bot uses it from now on.',
  toastUndone: 'Undone. Your bot is back to how it was.',

  patchTitle: 'A change for your developer',
  patchText:
    'Your actions were uploaded by a developer, so the assistant wrote the change for them. Send it to them: they apply it and upload again.',
  patchFiles: 'Files: {files}',
  patchCopy: 'Copy',
  patchDownload: 'Download',
  patchCopied: 'Copied',

  connectTitle: 'Connect your account',
  connectAction: 'Connect {provider}',
  connectDone: 'I connected {provider}.',
  healthTitle: 'Something stopped working',
  healthAction: '{name}: {failures} of its {calls} recent calls failed',
  healthAccount: '{provider}: needs signing in again',
  healthFix: 'Fix it with the assistant',
  fixMessageAction:
    'The action {name} is failing: {failures} of its {calls} recent calls failed.',
  fixMessageAccount: 'My {provider} account needs signing in again.',
  fixMessageAsk: 'Can you find out why and fix it?',
  secretTitle: 'A key the assistant needs',
  secretName: 'Name: {label}',
  secretValue: 'Paste the key here',
  secretSave: 'Save it',
  secretSaving: 'Saving...',
  secretSaved: 'Saved. The assistant never sees it.',
  secretError: "The key couldn't be saved.",
  secretDone: 'I saved the key {label}.',
  uploadTitle: 'A file the assistant needs',
  uploadOpen: 'Add it in Resources',
  uploadDone: 'Done, I added it',
  uploadDoneMessage: 'I added the file in Resources.',
  cardSkip: "I'd rather not",
  cardSkipMessage: "I'd rather not do that. Is there another way?",

  tryTitle: 'Try it as a customer',
  tryText:
    'Talk to your real bot, with everything that is turned on. On our AI model, each message uses a little of the assistant credits.',
  tryPlaceholder: 'Write as a customer...',
  tryRestart: 'Start over',
  tryEmpty: 'Say hi, or ask what a customer would ask.',
  tryCapped:
    'Your organization ran out of messages this month, so your bot answers customers that it is unavailable. See Settings to upgrade.',
  tryError: "Your bot couldn't answer. Try again.",
  tryBotFailed:
    "Your bot couldn't answer: its language model returned an error. If you added your own model, check its key in Settings, Models.",
  tryFiles: 'Sends files: {files}',
  tryOpen: 'Try it',
  tryClose: 'Close'
};

type AssistantCopy = typeof en;

export const ASSISTANT: Catalog<AssistantCopy> = {
  en,
  es: {
    title: 'Asistente',
    subtitle: 'Cuéntale qué debe saber o hacer tu bot. Lo construye contigo.',
    newChat: 'Nuevo chat',
    pastChats: 'Chats anteriores',
    noChats: 'Aún no hay chats',
    untitled: 'Nuevo chat',
    creditsUsed: '{used} de {included} créditos usados este mes',
    creditsExtra: '{extra} créditos extra, de {cap} permitidos',
    creditsUsedUp:
      'Se acabaron los créditos de este mes. Un administrador puede subir el límite en Ajustes → Plan y facturación.',
    creditsOwnKey:
      'El asistente usa tu propia clave de Anthropic y no gasta créditos. El chat de prueba como cliente sí los usa.',
    creditsPayWith: 'Pagar con',
    creditsGanju: 'Créditos de Ganju',
    errorOwnKey:
      'No se pudo usar tu clave de Anthropic: fue rechazada, llegó a su límite de uso o no tiene acceso al modelo. Un administrador puede arreglarla en Ajustes → Modelos, o volver a los créditos de Ganju.',
    chatCredits: '{credits} créditos en este chat',
    replyCredits: '{credits} créditos',

    chats: 'Chats',
    composeHint: 'Enter para enviar · Shift + Enter para una línea nueva',
    suggestionsLabel: 'Prueba con una de estas',
    suggestion1: 'Que diga a los clientes si estamos abiertos ahora',
    suggestion2: 'Que responda preguntas sobre mi menú',
    suggestion3: 'Que tome pedidos y me los envíe por correo',
    suggestion4: 'Que agende citas en mi Google Calendar',
    stepsTitle: 'Lo que hizo',
    stepSeconds: '· {seconds} s',
    emptyTitle: '¿Qué debe hacer tu bot?',
    emptyText:
      'Descríbelo con tus palabras. Por ejemplo: "que diga a los clientes si una pizza se agotó" o "que agende citas en mi calendario".',
    placeholder: 'Escríbele al asistente...',
    send: 'Enviar',
    working: 'Trabajando...',
    stop: 'Dejar de seguir',
    errorTurn: 'Algo salió mal al responder. Inténtalo de nuevo.',
    errorSend: 'No se pudo enviar el mensaje.',
    busy: 'El asistente ya está respondiendo en este proyecto. Espera a que termine.',
    rateLimited:
      'Demasiados mensajes en un minuto. Espera un momento e inténtalo de nuevo.',
    stoppedSteps:
      'El asistente se detuvo después de muchos pasos. Dile que continúe si no había terminado.',
    noteLine: 'Aviso para el asistente: {text}',

    toolProject: 'Revisando tu proyecto',
    toolRead: 'Leyendo tus acciones',
    toolWrite: 'Escribiendo una acción',
    toolLogs: 'Revisando lo que pasó hace poco',
    toolTurnOn: 'Dejándola lista para activar',
    toolTest: 'Probándola',
    toolData: 'Revisando tus datos',
    toolKnowledge: 'Leyendo lo que sabe tu bot',
    toolPrompts: 'Revisando tus prompts',
    toolTools: 'Revisando tus herramientas',
    toolPropose: 'Preparando tus cambios',
    toolPatch: 'Escribiendo el cambio para tu desarrollador',
    toolAsk: 'Preparando algo que necesita de ti',

    lockedBadge: 'Pro',
    lockedTitle: 'Construye tu bot describiéndolo',
    lockedText:
      'El asistente escribe acciones, las prueba y las activa con tu clic. Es parte del plan Pro.',
    upgrade: 'Mejorar plan',

    changeTitle: 'Listo para aplicar',
    changeTitleDone: 'Cambios',
    changePossible: 'Una vez aplicado, tu bot podrá:',
    changeReads: 'Solo leer información',
    changeWrites: 'Cambiar o enviar cosas (primero le pregunta a tu cliente)',
    changeTablesRead: 'Leer tus tablas: {tables}',
    changeTablesWrite: 'Leer y cambiar tus tablas: {tables}',
    changeHosts: 'Conectarse a {hosts}',
    changeAccounts: 'Usar tus cuentas: {accounts}',
    changeCantUndo: 'Esto no se puede deshacer',
    changeSomeCantUndo: 'Parte de esto no se puede deshacer',
    itemDeletes: 'Borra',
    itemTypeName: 'Escribe "{name}" para confirmar',
    itemRestore:
      'Deshacer devuelve toda tu base de datos a como estaba justo antes. Lo que se guarde después se pierde.',
    itemLostFile: 'El contenido del archivo no se puede recuperar',
    itemLostCredentials:
      'Deshacer la vuelve a agregar, pero su clave o inicio de sesión hay que agregarlo de nuevo',
    itemLostSecret: 'Su webhook recibe un secreto nuevo',
    itemFromCode:
      'Tu desarrollador maneja estas tablas desde código: su próxima subida revertirá esto',
    typeToApply: 'Escribe los nombres de arriba para aplicar',
    undoRestoreConfirm:
      'Esto devuelve toda tu base de datos a como estaba antes. Lo que se haya guardado desde entonces se pierde.',
    undoAnyway: 'Deshacer de todos modos',
    cancel: 'Cancelar',
    apply: 'Aplicar',
    applying: 'Aplicando...',
    applied: 'Aplicado',
    undo: 'Deshacer',
    undoing: 'Deshaciendo...',
    undone: 'Deshecho',
    failed: 'No se pudo aplicar: {error}',
    failedShort: 'No se aplicó',
    discarded: 'Reemplazado por un cambio más nuevo',
    toastApplied: 'Aplicado. Tu bot ya lo usa.',
    toastUndone: 'Deshecho. Tu bot quedó como estaba.',

    patchTitle: 'Un cambio para tu desarrollador',
    patchText:
      'Tus acciones las subió un desarrollador, así que el asistente escribió el cambio para esa persona. Envíaselo: lo aplica y las vuelve a subir.',
    patchFiles: 'Archivos: {files}',
    patchCopy: 'Copiar',
    patchDownload: 'Descargar',
    patchCopied: 'Copiado',

    connectTitle: 'Conecta tu cuenta',
    connectAction: 'Conectar {provider}',
    connectDone: 'Ya conecté {provider}.',
    healthTitle: 'Algo dejó de funcionar',
    healthAction:
      '{name}: fallaron {failures} de sus {calls} llamadas recientes',
    healthAccount: '{provider}: hay que volver a iniciar sesión',
    healthFix: 'Arreglarlo con el asistente',
    fixMessageAction:
      'La acción {name} está fallando: fallaron {failures} de sus {calls} llamadas recientes.',
    fixMessageAccount:
      'Mi cuenta de {provider} necesita volver a iniciar sesión.',
    fixMessageAsk: '¿Puedes ver por qué y arreglarlo?',
    secretTitle: 'Una clave que necesita el asistente',
    secretName: 'Nombre: {label}',
    secretValue: 'Pega la clave aquí',
    secretSave: 'Guardarla',
    secretSaving: 'Guardando...',
    secretSaved: 'Guardada. El asistente nunca la ve.',
    secretError: 'No se pudo guardar la clave.',
    secretDone: 'Ya guardé la clave {label}.',
    uploadTitle: 'Un archivo que necesita el asistente',
    uploadOpen: 'Agregarlo en Recursos',
    uploadDone: 'Listo, ya lo agregué',
    uploadDoneMessage: 'Ya agregué el archivo en Recursos.',
    cardSkip: 'Prefiero no hacerlo',
    cardSkipMessage: 'Prefiero no hacer eso. ¿Hay otra forma?',

    tryTitle: 'Pruébalo como cliente',
    tryText:
      'Habla con tu bot real, con todo lo que está activado. Con nuestro modelo de IA, cada mensaje usa un poco de los créditos del asistente.',
    tryPlaceholder: 'Escribe como cliente...',
    tryRestart: 'Empezar de nuevo',
    tryEmpty: 'Saluda o pregunta lo que preguntaría un cliente.',
    tryCapped:
      'Tu organización se quedó sin mensajes este mes, así que tu bot les responde a los clientes que no está disponible. Ve a Ajustes para mejorar tu plan.',
    tryError: 'Tu bot no pudo responder. Inténtalo de nuevo.',
    tryBotFailed:
      'Tu bot no pudo responder: su modelo de lenguaje devolvió un error. Si agregaste tu propio modelo, revisa su clave en Ajustes, Modelos.',
    tryFiles: 'Envía archivos: {files}',
    tryOpen: 'Probarlo',
    tryClose: 'Cerrar'
  }
};
