---
title: Búsqueda en Slack
description: Búsqueda de mensajes en todo el workspace de Slack, en una conexión aparte porque Slack no deja buscar con tokens de bot.
order: 435
updated: 2026-11-13
---

**Búsqueda en Slack** le suma a tu asistente la búsqueda de mensajes en todo el
workspace. Es una integración aparte de [Slack](/es/docs/tools/slack/) por una
razón técnica: Slack **no** deja que los tokens de bot llamen a
`search.messages`, así que la búsqueda usa un **token de usuario** (`xoxp`) en
lugar del token de bot que usan las demás herramientas de Slack.

## Conéctala

1. Abre **Acciones → Catálogo** y elige la tarjeta **Búsqueda en Slack**.
2. Elige **Conectar Búsqueda en Slack**, escoge el workspace y aprueba.
3. Enciende **Buscar mensajes**.

Pide un solo permiso, `search:read`, y puedes conectarla con o sin la
integración principal de Slack.

Como es un token de *usuario*, la búsqueda ve lo que puede ver **la persona que
la conectó** en Slack, incluidos los canales privados y mensajes directos en
los que está. Conéctala con una cuenta cuya visibilidad estés dispuesto a darle
al asistente, por ejemplo una cuenta dedicada.

## Herramienta

- **Buscar mensajes** (`slack-search-messages`): busca mensajes en todo el
  workspace. `query` acepta los modificadores de Slack: `in:#canal`,
  `from:@usuario`, `before:AAAA-MM-DD`, `has:link`. `sort` es `score`
  (relevancia, por defecto) o `timestamp` (más recientes primero);
  `maxResults` de 1 a 50, 10 por defecto. Cada resultado trae el canal, el
  usuario, el `ts`, un fragmento del texto y un enlace permanente.

Solo lee, así que nunca se detiene por
[Confirmar acciones sensibles](/es/docs/settings/#confirmar-acciones-sensibles).

Combínala con las herramientas de [Slack](/es/docs/tools/slack/): busca el hilo
("¿qué dijo soporte sobre el reembolso?") y luego usa **Enviar mensaje** con el
`ts` del resultado como `threadTs` para responder dentro de él.

## Usa la conexión desde tu propio código

Una [función](/es/docs/tools/functions/) puede usar el mismo token de usuario:
agrega `slack-user` a sus conexiones y llama a `ctx.connection('slack-user')`.

## Solución de problemas

- **"Slack credential not connected".** Búsqueda en Slack no está conectada
  (conectar la tarjeta principal de Slack no basta). Conéctala desde su propia
  tarjeta.
- **No aparece un mensaje que tú sí ves.** La búsqueda solo cubre lo que ve la
  cuenta que la conectó. Conecta con una cuenta que esté en ese canal.
