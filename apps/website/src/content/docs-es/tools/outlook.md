---
title: Outlook
description: "Correo de Microsoft 365 para tu asistente, sobre Microsoft Graph: 18 herramientas para enviar, clasificar, mover entre carpetas, manejar conversaciones y borradores."
order: 42
updated: 2026-11-13
---

La integración de **Outlook** le da a tu asistente el correo de Microsoft 365 /
Outlook, sobre **Microsoft Graph**. Replica el conjunto de
[Gmail](/es/docs/tools/gmail/) (enviar, leer, organizar y redactar borradores)
con **18 herramientas**, usando *carpetas* donde Gmail usa etiquetas.

## Conéctala

1. Abre **Acciones → Catálogo** y elige la tarjeta **Outlook**.
2. Elige **Conectar Outlook**, inicia sesión con la cuenta de Microsoft y
   aprueba.
3. De vuelta en Herramientas, enciende las herramientas que quieras.

Una conexión sirve a las 18 herramientas. Al conectar se le piden a Microsoft
`Mail.ReadWrite`, `Mail.Send`, `User.Read` y `offline_access` (para que la
conexión siga funcionando sin volver a iniciar sesión). Cada fila muestra el
permiso que usa en **Permisos**. Si el administrador de Microsoft 365 de tu
organización restringe las apps de terceros, puede que tenga que aprobarla
primero.

![Outlook antes de conectarlo: Conectar Outlook, el aviso y las herramientas desactivadas](/images/tools-catalog-not-connected.webp)

Las herramientas no tienen ajustes propios. Los cuerpos van en HTML salvo que la
llamada pase `contentType: "text"`. Los nombres entre paréntesis son los que
muestran los clientes MCP y los registros.

## Enviar

- **Enviar correo** (`outlook-send-email`): envía un mensaje nuevo, que inicia
  una conversación nueva. Recibe `to`, `subject` y `body`, con `cc`, `bcc`
  (separados por comas), `contentType` y `attachmentUris` opcionales (archivos
  de tus [recursos](/es/docs/resources/), hasta 150 MB por archivo; los grandes
  se suben por partes).
- **Responder** (`outlook-reply-email`): responde a un mensaje por
  `messageId`, dentro de la conversación. Activa `replyAll` para incluir a todos
  los destinatarios originales; admite adjuntos.
- **Reenviar** (`outlook-forward-email`): reenvía un mensaje (`messageId`) a
  `to`, con una introducción opcional en `body` sobre el original citado, `cc`
  opcional y adjuntos. Inicia una conversación nueva.

## Leer y buscar

- **Listar correos** (`outlook-list-emails`): lista mensajes (de / asunto /
  recibido / ID), del más nuevo al más viejo. `query` es una búsqueda de texto
  completo: operadores como `from:` se buscan como palabras, no como filtros.
  `folderId` la limita a una carpeta (por defecto, la bandeja de entrada).
  `maxResults` de 1 a 50, 10 por defecto.
- **Leer correo** (`outlook-read-email`): lee un mensaje por `messageId`; los
  cuerpos HTML se convierten a texto plano para el modelo.
- **Listar conversaciones** (`outlook-list-threads`): lista conversaciones (una
  entrada por conversación, con su último asunto y remitente), con `query`
  opcional. `maxResults` de 1 a 50, 10 por defecto.
- **Ver conversación** (`outlook-get-thread`): resume cada mensaje de una
  conversación (`conversationId`) sin los cuerpos completos; luego usa Leer
  correo para el que quieras.
- **Ver perfil** (`outlook-get-profile`): dice el nombre, la dirección y los
  totales de la bandeja de la cuenta conectada.

## Organizar

- **Listar carpetas** (`outlook-list-folders`): lista cada carpeta de correo,
  del sistema y propias, con su ID y su cantidad de no leídos.
- **Mover mensaje** (`outlook-move-message`): mueve un mensaje (`messageId`) a
  `destinationId`: un nombre conocido (`inbox`, `drafts`, `sentitems`,
  `deleteditems`, `junkemail`, `archive`) o un ID de Listar carpetas. Sirve para
  archivar, marcar como spam o restaurar desde Elementos eliminados.
- **Mover mensajes en lote** (`outlook-batch-move-messages`): mueve hasta 20
  mensajes (`messageIds`) a la misma carpeta en una llamada; los IDs que sobren
  se ignoran.
- **Mover a la papelera** (`outlook-trash-email`): mueve un mensaje a Elementos
  eliminados, donde aún se puede restaurar. Es la opción segura para "eliminar".

## Borradores

- **Crear borrador** (`outlook-create-draft`): guarda un mensaje en Borradores
  sin enviarlo; mismos campos que Enviar correo, adjuntos incluidos.
- **Listar borradores** (`outlook-list-drafts`): lista borradores con ID,
  destinatario, asunto y fecha de última modificación. `maxResults` de 1 a 50,
  10 por defecto.
- **Ver borrador** (`outlook-get-draft`): lee un borrador completo por
  `draftId`.
- **Actualizar borrador** (`outlook-update-draft`): sobrescribe `to`, `subject`
  y `body` de un borrador (los tres obligatorios). Omite `attachmentUris` para
  conservar los adjuntos, o pasa una lista para reemplazarlos. No lo envía.
- **Enviar borrador** (`outlook-send-draft`): envía tal cual un borrador
  guardado.
- **Eliminar borrador** (`outlook-delete-draft`): borra para siempre un
  borrador sin enviar (no va a Elementos eliminados).

## Acciones sensibles

Con [Confirmar acciones sensibles](/es/docs/settings/#confirmar-acciones-sensibles)
encendido, el asistente pregunta antes de **Enviar correo**, **Responder**,
**Reenviar**, **Enviar borrador**, **Mover a la papelera** y **Eliminar
borrador**. Leer, mover entre carpetas y crear o editar borradores se ejecutan
sin preguntar.

## Usa la conexión desde tu propio código

Una [función](/es/docs/tools/functions/) puede llamar a Microsoft Graph con la
misma conexión: agrega `microsoft-outlook` a sus conexiones y llama a
`ctx.connection('microsoft-outlook')`. Un
[endpoint HTTP](/es/docs/tools/http-endpoints/) puede usarla como **Cuenta
conectada**.

## Solución de problemas

- **"Microsoft Outlook credential not connected".** Outlook se desconectó.
  Conéctalo de nuevo desde la tarjeta.
- **La tarjeta muestra Vencido.** Microsoft dejó de aceptar el inicio de sesión
  (cambio de contraseña, acceso revocado o una política del administrador).
  Conecta de nuevo; tus herramientas se conservan.
- **Una búsqueda con `from:` no sirve.** La búsqueda de Outlook es de texto
  completo; busca el nombre o la dirección del remitente como palabras.
