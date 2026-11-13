---
title: Slack
description: Publica mensajes, explora canales, busca usuarios y sube archivos en un workspace de Slack.
order: 43
updated: 2026-11-13
---

La integración de **Slack** le permite a tu asistente actuar en un workspace de
Slack — publicar mensajes y respuestas en hilos, encontrar canales y personas, y
compartir archivos de tus recursos. Ofrece **4 herramientas**. La **búsqueda**
de mensajes es una integración aparte,
[Búsqueda en Slack](/es/docs/tools/slack-search/), porque Slack no deja buscar
con un token de bot.

Esto es Slack como un conjunto de *herramientas* que el asistente llama. Para
poner al asistente mismo en Slack, y que la gente hable con él ahí, mira el
[canal de Slack](/es/docs/channels/slack/).

## Conéctala

1. Abre **Herramientas → Catálogo** y elige la tarjeta **Slack**.
2. Elige **Conectar Slack**, escoge el workspace y aprueba.
3. De vuelta en Herramientas, enciende las herramientas que quieras.

Al conectar se instala un bot en el workspace con estos permisos: `chat:write`,
`channels:read`, `groups:read`, `mpim:read`, `im:read`, `users:read`,
`users:read.email` y `files:write`. Cada fila muestra los que usa en
**Permisos**.

El bot publica como él mismo y solo ve lo que puede ver un bot: para publicar en
un canal, o listar uno privado, invítalo primero (`/invite @TuBot` en Slack).

![Herramientas, pestaña Catálogo: la barra de herramientas expuestas, la búsqueda, los filtros y las tarjetas de integraciones](/images/tools-catalog.webp)

## Herramientas

Los nombres entre paréntesis son los que muestran los clientes MCP y los
registros.

- **Enviar mensaje** (`slack-send-message`) — publica `text` en un canal, un
  mensaje directo o un hilo. `channel` acepta un ID (`C…`, `G…`, `D…` —
  preferible) o un nombre (`#general`); `threadTs` responde dentro de un hilo
  existente. El texto usa el mrkdwn de Slack (`*negrita*`, `_cursiva_`,
  menciones `<@U123>`) salvo que `mrkdwn` sea `false`. Devuelve el `ts` del
  mensaje, para que las respuestas siguientes vayan en su hilo.
- **Listar canales** (`slack-list-channels`) — lista las conversaciones que el
  bot puede ver, con nombre, cantidad de miembros, si está archivado, tema e ID.
  `types` es `public_channel,private_channel` por defecto (también `mpim`,
  `im`); `includeArchived` suma los archivados; `query` filtra por nombre;
  `maxResults` de 1 a 200, 50 por defecto. Úsala para convertir el nombre de un
  canal en su ID antes de publicar.
- **Ver usuario** (`slack-get-user`) — busca a una persona por `userId` **o** por
  `email` (exactamente uno). Devuelve el ID, el nombre visible y el real, el
  correo (si es visible), si es bot o está desactivado, y su estado. Úsala para
  convertir un correo en un ID de Slack antes de un mensaje directo.
- **Subir archivo** (`slack-upload-file`) — comparte un recurso guardado
  (`resourceUri`) en un `channel`, con `title`, `initialComment` y `threadTs`
  opcionales. Hasta 100 MB por archivo. Úsala en lugar de Enviar mensaje para
  compartir un documento o una imagen.

## Acciones sensibles

Con [Confirmar acciones sensibles](/es/docs/settings/#confirmar-acciones-sensibles)
encendido, el asistente pregunta antes de **Enviar mensaje** y **Subir
archivo**. Listar canales y Ver usuario se ejecutan sin preguntar.

## Buscar en el workspace

Conecta [Búsqueda en Slack](/es/docs/tools/slack-search/) para sumar **Buscar
mensajes**: busca el contexto previo y luego responde con Enviar mensaje usando
como `threadTs` el `ts` que devolvió la búsqueda.

## Usa la conexión desde tu propio código

Una [función](/es/docs/tools/functions/) puede llamar a la Web API de Slack con
el token del bot: agrega `slack` a sus conexiones y llama a
`ctx.connection('slack')`.

## Solución de problemas

- **"Slack credential not connected".** Slack se desconectó. Conéctalo de nuevo
  desde la tarjeta.
- **`not_in_channel` o `channel_not_found`.** El bot no es miembro de ese canal.
  Invítalo en Slack, o revisa el ID con Listar canales.
- **Ver usuario no devuelve el correo.** El correo de esa persona no es visible
  para el bot en ese workspace; búscala por `userId`.
