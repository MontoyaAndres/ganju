---
title: Outlook
description: Correo de Microsoft 365 para tu asistente, respaldado por Microsoft Graph — 18 herramientas para enviar, clasificar, manejar carpetas, hilos y borradores.
order: 42
updated: 2026-07-07
---

La integración de **Outlook** le da a tu asistente el correo de Microsoft 365,
respaldado por **Microsoft Graph**. Replica la superficie de
[Gmail](/es/docs/tools/gmail) — enviar, leer, organizar y redactar — con **18
herramientas**, usando *carpetas* de correo donde Gmail usa etiquetas.

## Conéctala

Outlook usa **OAuth de Microsoft**. Conéctate una vez para toda la cuenta y luego
activa las herramientas que necesites. Cada herramienta solicita solo el permiso de
Graph que requiere (`Mail.Read`, `Mail.Send`, `Mail.ReadWrite` o `User.Read`), así
que los permisos se mantienen al mínimo.

## Enviar

- **Send Email** — envía un mensaje nuevo. El cuerpo es HTML por defecto (pasa
  `contentType='text'` para texto plano); soporta adjuntos, y los archivos grandes
  se suben con la sesión de carga por partes de Graph. Inicia una conversación
  nueva.
- **Reply** — responde a un mensaje mediante el flujo createReply de Graph,
  conservando la conversación. Activa `replyAll` para incluir a todos los
  destinatarios originales.
- **Forward** — reenvía un mensaje a un nuevo destinatario; la copia reenviada
  inicia una conversación nueva, con una introducción opcional sobre el original
  citado.

## Leer y buscar

- **List Emails** — lista los mensajes de la bandeja de entrada, con filtro opcional
  usando una consulta `$search` de Graph. Devuelve líneas de resumen (de / asunto /
  recibido / ID).
- **Read Email** — lee un mensaje por ID; los cuerpos HTML se convierten a texto
  plano para el modelo.
- **List Threads** — lista los hilos de conversación (una entrada por
  `conversationId` con su mensaje más reciente).
- **Get Thread** — resume cada mensaje de una conversación; usa Read Email para los
  cuerpos completos.
- **Get Profile** — informa el nombre y la dirección de la cuenta conectada y los
  totales de la bandeja de entrada.

## Organizar

- **List Folders** — lista cada carpeta de correo (del sistema y creada por el
  usuario) con su ID y sus conteos de no leídos. Llámala para encontrar los IDs que
  necesitan las herramientas de movimiento.
- **Move Message** — mueve un mensaje a otra carpeta por su nombre conocido
  (`inbox`, `archive`, `junkemail`, `deleteditems`…) o por ID de carpeta. Archiva,
  marca como spam o restaura desde la papelera.
- **Batch Move Messages** — mueve hasta 20 mensajes a la misma carpeta en una sola
  llamada.
- **Move to Trash** — mueve un mensaje a Elementos eliminados (restaurable hasta que
  se purgue) — la opción segura para "eliminar".

## Borradores

- **Create Draft** — guarda un mensaje redactado en Borradores sin enviarlo; soporta
  adjuntos.
- **List Drafts** — lista los borradores guardados con destinatario, asunto y fecha
  de última modificación.
- **Get Draft** — lee el contenido completo de un borrador antes de enviarlo.
- **Update Draft** — reemplaza los campos de un borrador; omite `attachmentUris`
  para conservar los adjuntos existentes, o pasa una lista nueva para
  reemplazarlos.
- **Send Draft** — envía tal cual un borrador existente.
- **Delete Draft** — elimina permanentemente un borrador sin enviar (se borra de
  inmediato, no va a Elementos eliminados).
