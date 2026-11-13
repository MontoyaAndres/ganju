---
title: Gmail
description: Envía, lee, busca y administra correo desde una cuenta de Gmail conectada — 18 herramientas para enviar, clasificar, etiquetar, manejar conversaciones y borradores.
order: 41
updated: 2026-11-13
---

La integración de **Gmail** le permite a tu asistente trabajar con el correo de
una cuenta de Google conectada — iniciar mensajes nuevos, responder dentro de la
conversación, clasificar la bandeja, organizar con etiquetas y administrar
borradores. Ofrece **18 herramientas**; enciende solo las que tu asistente
necesita.

## Conéctala

1. Abre **Herramientas → Catálogo** y elige la tarjeta **Gmail**.
2. Elige **Conectar Gmail**, escoge la cuenta de Google y aprueba.
3. De vuelta en Herramientas, enciende las herramientas que quieras.

Una conexión sirve a las 18 herramientas. Al conectar se le piden a Google estos
permisos: leer (`gmail.readonly`), enviar (`gmail.send`), modificar
(`gmail.modify`), redactar borradores (`gmail.compose`) y etiquetas
(`gmail.labels`). Cada fila muestra el que usa en **Permisos**.

![Gmail conectado: la etiqueta Conectado, Desconectar y cada herramienta con su interruptor](/images/tool-gmail-enabled.webp)

Las herramientas no tienen ajustes propios. Los nombres entre paréntesis son los
que muestran los clientes MCP y los registros.

## Enviar

- **Enviar correo** (`gmail-send-email`) — redacta y envía un mensaje nuevo, que
  inicia una conversación nueva. Recibe `to`, `subject` y `body` (HTML), con
  `cc` y `bcc` opcionales (separados por comas) y `attachmentUris` — archivos de
  tus [recursos](/es/docs/resources/), hasta ~18 MB en total. Devuelve los IDs
  del mensaje y de la conversación.
- **Responder correo** (`gmail-reply-email`) — responde a un mensaje por
  `messageId`, dentro de la misma conversación y agregando "Re:". Activa
  `replyAll` para incluir a los destinatarios originales de Para y Cc;
  `attachmentUris` funciona igual que arriba. Úsala en lugar de Enviar correo
  para mantener la conversación junta.
- **Reenviar correo** (`gmail-forward-email`) — reenvía un mensaje (`messageId`)
  a `to`, con una introducción opcional en `body` y `cc` opcional. Agrega "Fwd:"
  e inicia una conversación nueva.

## Leer y buscar

- **Listar correos** (`gmail-list-emails`) — lista mensajes (de / asunto / fecha
  / ID), filtrados con la sintaxis de búsqueda de Gmail en `query` (`is:unread`,
  `from:a@b.com`, `after:2025/01/01`, `has:attachment`). Vacía, lista los
  mensajes recientes de la bandeja. `maxResults` de 1 a 50, 10 por defecto.
- **Leer correo** (`gmail-read-email`) — abre un mensaje por `messageId` y
  devuelve sus encabezados y el cuerpo decodificado.
- **Listar conversaciones** (`gmail-list-threads`) — lista conversaciones (ID y
  último fragmento), con la misma sintaxis en `query`. `maxResults` de 1 a 50,
  10 por defecto.
- **Ver conversación** (`gmail-get-thread`) — resume cada mensaje de una
  conversación (`threadId`): fecha, remitente, asunto, fragmento e ID, sin los
  cuerpos completos. Recorre la conversación de forma barata y luego usa Leer
  correo para el que quieras.
- **Ver perfil** (`gmail-get-profile`) — dice qué dirección está conectada y sus
  totales de mensajes y conversaciones.

## Organizar

- **Listar etiquetas** (`gmail-list-labels`) — lista cada etiqueta con su ID,
  incluidas las del sistema (`INBOX`, `UNREAD`, `STARRED`, `IMPORTANT`, `SPAM`).
  Las herramientas de etiquetas reciben IDs, no nombres, así que esta va
  primero.
- **Modificar etiquetas** (`gmail-modify-labels`) — agrega o quita etiquetas en
  un mensaje: `messageId` más `addLabelIds` y/o `removeLabelIds`. Archivar =
  quitar `INBOX`, marcar como leído = quitar `UNREAD`, destacar = agregar
  `STARRED`.
- **Modificar etiquetas en lote** (`gmail-batch-modify-labels`) — el mismo cambio
  en muchos mensajes a la vez (`messageIds`, hasta 1.000). Ideal para archivar
  en masa o marcar todo como leído.
- **Mover a la papelera** (`gmail-trash-email`) — mueve un mensaje a la
  Papelera, donde Gmail lo guarda 30 días. Es la opción segura cuando alguien
  pide "eliminar" un correo.

## Borradores

- **Crear borrador** (`gmail-create-draft`) — guarda un mensaje en Borradores
  sin enviarlo. Mismos campos que Enviar correo, adjuntos incluidos. Úsala
  cuando la persona quiera revisar antes, o cuando no esté claro que quiera
  enviarlo.
- **Listar borradores** (`gmail-list-drafts`) — lista borradores con su ID,
  destinatarios y asunto. `maxResults` de 1 a 50, 10 por defecto.
- **Ver borrador** (`gmail-get-draft`) — lee un borrador completo por `draftId`,
  para confirmar exactamente qué va a salir.
- **Actualizar borrador** (`gmail-update-draft`) — reemplaza un borrador por
  completo: pasa `draftId` con `to`, `subject` y `body` completos aunque cambies
  solo uno, y `attachmentUris` de nuevo para conservar los adjuntos — lo que
  falte se quita. No lo envía.
- **Enviar borrador** (`gmail-send-draft`) — envía tal cual un borrador guardado
  y devuelve el ID del mensaje.
- **Eliminar borrador** (`gmail-delete-draft`) — borra para siempre un borrador
  sin enviar (no va a la Papelera).

## Acciones sensibles

Con [Confirmar acciones sensibles](/es/docs/settings/#confirmar-acciones-sensibles)
encendido, el asistente pregunta antes de **Enviar correo**, **Responder
correo**, **Reenviar correo**, **Enviar borrador**, **Mover a la papelera** y
**Eliminar borrador**. Leer, etiquetar y crear o editar borradores se ejecutan
sin preguntar — un patrón común es encender **Crear borrador** pero no **Enviar
correo**, para que una persona siempre sea quien envía.

## Usa la conexión desde tu propio código

Una [función](/es/docs/tools/functions/) puede llamar a la API de Gmail con la
misma conexión: agrega `google-gmail` a sus conexiones y llama a
`ctx.connection('google-gmail')` para obtener un access token de vida corta. Un
[endpoint HTTP](/es/docs/tools/http-endpoints/) puede usarla como **Cuenta
conectada**.

## Solución de problemas

- **"Google credential not connected".** Gmail se desconectó. Conéctalo de nuevo
  desde la tarjeta.
- **La tarjeta muestra Vencido.** Google dejó de aceptar el inicio de sesión
  (cambio de contraseña o acceso revocado en la cuenta de Google). Conecta de
  nuevo; tus herramientas se conservan.
- **"Attachments exceed Gmail's 18MB raw cap".** Envía menos archivos o más
  livianos, o comparte un enlace.
- **Falla un cambio de etiqueta.** Usa los IDs de Listar etiquetas — las
  etiquetas propias tienen IDs como `Label_12`, no su nombre visible.

¿Prefieres el correo de Microsoft? Mira [Outlook](/es/docs/tools/outlook/), que
ofrece el mismo conjunto vía Microsoft Graph.
