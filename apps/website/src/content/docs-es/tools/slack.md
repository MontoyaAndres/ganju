---
title: Slack
description: Publica mensajes, navega canales, consulta usuarios, sube archivos y busca en el espacio de trabajo de Slack.
order: 43
updated: 2026-07-07
---

La integración de **Slack** le permite a tu asistente participar en un espacio de
trabajo de Slack — publicando mensajes e hilos, descubriendo canales y usuarios, y
compartiendo archivos de tus recursos. La **búsqueda** de mensajes en todo el
espacio de trabajo es una conexión aparte (Slack impide que los bot tokens
busquen), así que se cubre más abajo como su propio paso.

## Conéctala

Slack usa **OAuth**. Al conectarla se instala un bot token (`xoxb`) para las cuatro
herramientas base. Para usar **Search Messages** además conectas **Búsqueda en
Slack**, que agrega un token de usuario (`xoxp`) — Slack exige un token de usuario
para `search.messages`.

## Herramientas base

- **Send Message** — publica en un canal, un mensaje directo o un hilo. `channel`
  acepta un ID (`C…`/`G…`/`D…`, preferible) o un nombre (`#general`); define
  `threadTs` para responder dentro de un hilo existente. El texto usa el mrkdwn de
  Slack por defecto. Devuelve el `ts` del mensaje para que las respuestas
  posteriores se encadenen a él.
- **List Channels** — lista las conversaciones que el token puede ver (públicas por
  defecto; incluye canales privados, grupos de mensajes directos o mensajes
  directos con `types`). Devuelve nombre, número de miembros, tema e ID del canal.
  Úsala para resolver el nombre de un canal a su ID antes de publicar.
- **Get User** — busca un usuario por `userId` **o** por `email` (pasa exactamente
  uno). Devuelve el ID, el nombre visible y el real, el correo (si es visible) y
  los indicadores de activo/bot. Úsala para convertir una mención o un correo en un
  ID de Slack.
- **Upload File** — comparte un recurso guardado en un canal usando el flujo de
  carga externa de Slack. Recibe `resourceUri`, el `channel` de destino y un
  `initialComment` y `threadTs` opcionales. Hasta 100 MB por archivo. Usa esta en
  lugar de Send Message cuando compartas un documento o una imagen.

## Buscar en el espacio de trabajo

La búsqueda de mensajes es una integración **aparte** —
[Búsqueda en Slack](/es/docs/tools/slack-search) — porque Slack impide que los bot
tokens busquen y exige un token de usuario. Conéctala para agregar la herramienta
**Search Messages** y luego busca el contexto previo antes de responder con Send
Message.
