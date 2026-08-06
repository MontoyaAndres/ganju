---
title: Gmail
description: Envía, lee, busca y administra correo desde una cuenta de Gmail conectada — 18 herramientas para enviar, clasificar, etiquetar, manejar hilos y borradores.
order: 41
updated: 2026-07-07
---

La integración de **Gmail** le permite a tu asistente trabajar con el correo de una
cuenta de Google conectada — iniciar mensajes nuevos, responder dentro del hilo,
clasificar la bandeja de entrada, organizar con etiquetas y administrar borradores.
Ofrece **18 herramientas**.

## Conéctala

Gmail usa **OAuth de Google**. Abre la integración en el catálogo, selecciona
**Connect Gmail** para autorizar una sola vez toda la integración, y luego enciende
únicamente las herramientas que quieras. Cada herramienta solicita solo el permiso
de Google que necesita — leer usa acceso de solo lectura, enviar usa acceso de
envío, cambiar etiquetas usa acceso de modificación — así que nunca otorgas más de
lo que requieren las herramientas que activaste.

## Enviar

- **Send Email** — redacta y envía un mensaje nuevo. Recibe `to`, `subject` y un
  `body` en HTML, con `cc`, `bcc` y `attachmentUris` opcionales (archivos de tus
  recursos, hasta ~18 MB en total). Inicia un hilo nuevo y devuelve los IDs del
  mensaje y del hilo.
- **Reply Email** — responde a un mensaje existente por `messageId`, conservando el
  hilo de Gmail y anteponiendo "Re:" automáticamente. Activa `replyAll` para
  incluir a los destinatarios originales de To y Cc. Usa esta en lugar de Send
  Email para mantener la conversación junta.
- **Forward Email** — reenvía un mensaje a un nuevo destinatario, trayendo el
  cuerpo original y agregando el prefijo "Fwd:". La copia reenviada inicia un hilo
  nuevo.

## Leer y buscar

- **List Emails** — recorre la bandeja de entrada, con filtro opcional usando la
  sintaxis de búsqueda de Gmail (`is:unread`, `from:…`, `subject:…`,
  `has:attachment`, `after:…`). Devuelve líneas de resumen (de / asunto / fecha /
  ID), hasta 50.
- **Read Email** — abre un mensaje por ID y devuelve los encabezados completos y el
  cuerpo decodificado.
- **List Threads** — lista conversaciones (ID del hilo + último fragmento), con
  filtro opcional usando la misma sintaxis de búsqueda. Ideal cuando el usuario
  pregunta por un ida y vuelta en curso.
- **Get Thread** — devuelve un resumen de una línea por cada mensaje de un hilo.
  Recorre una conversación de forma barata y luego usa Read Email para el mensaje
  que quieras completo.
- **Get Profile** — informa qué cuenta está conectada, además del total de mensajes
  e hilos.

## Organizar

- **List Labels** — lista cada etiqueta y carpeta con su ID. Las herramientas de
  etiquetas de Gmail reciben IDs, no nombres, así que llama a esta primero para
  descubrirlos.
- **Modify Labels** — agrega o quita etiquetas en un solo mensaje (archivar = quitar
  `INBOX`, marcar como leído = quitar `UNREAD`, destacar = agregar `STARRED`).
  Necesita al menos una etiqueta que agregar o quitar.
- **Batch Modify Labels** — aplica los mismos cambios de etiqueta a hasta 1.000
  mensajes en una sola llamada — mucho más barato que iterar. Ideal para archivar
  en masa o marcar todo como leído.
- **Move to Trash** — mueve un mensaje a la Papelera (recuperable durante 30 días).
  Es la opción segura cada vez que un usuario pide "eliminar" un correo.

## Borradores

- **Create Draft** — guarda un mensaje redactado en Borradores sin enviarlo.
  Soporta adjuntos. Úsala cuando el usuario quiera revisar antes de enviar, o
  cuando no tengas claro si quiere enviarlo.
- **List Drafts** — recorre los borradores guardados con su destinatario, asunto e
  IDs.
- **Get Draft** — lee el contenido completo de un borrador para confirmar
  exactamente qué va a salir.
- **Update Draft** — reemplaza un borrador por completo (cada campo que envías
  sobrescribe el anterior, así que incluye el mensaje completo aunque cambies una
  sola línea).
- **Send Draft** — envía tal cual un borrador ya guardado y devuelve el ID del
  mensaje resultante.
- **Delete Draft** — elimina permanentemente un borrador sin enviar (no va a la
  Papelera).

¿Prefieres el correo de Microsoft? Mira [Outlook](/es/docs/tools/outlook), que
ofrece la misma superficie vía Microsoft Graph.
