---
title: Búsqueda en Slack
description: Búsqueda de mensajes en todo el espacio de trabajo de Slack — una conexión aparte porque Slack impide que los bot tokens busquen.
order: 435
updated: 2026-07-07
---

**Búsqueda en Slack** le agrega a tu asistente la búsqueda de mensajes en todo el
espacio de trabajo. Es una integración separada de [Slack](/es/docs/tools/slack) por
una razón técnica: Slack **no** permite que los bot tokens llamen a
`search.messages`, así que la búsqueda necesita un **token de usuario** (`xoxp`) en
lugar del bot token que usan las herramientas base de Slack.

## Conéctala

Conecta **Slack Search** una vez en la página de Herramientas, junto a (o en lugar
de) la integración principal de Slack. Autoriza un token de usuario que se usa
únicamente para buscar. Si no está conectada, la herramienta de búsqueda devuelve el
error estándar de credencial no conectada.

## Herramienta

- **Search Messages** — busca mensajes en todo el espacio de trabajo. La `query`
  acepta los propios modificadores de Slack — `in:#canal`, `from:@usuario`,
  `before:AAAA-MM-DD`, `has:link` — y devuelve las coincidencias con el canal, el
  usuario, la marca de tiempo, un fragmento de texto y un enlace permanente. Es la
  forma de recuperar contexto previo ("¿qué dijo soporte sobre X?") antes de que el
  asistente redacte una respuesta.

Combínala con las herramientas base de [Slack](/es/docs/tools/slack): busca para
encontrar el hilo relevante y luego usa Send Message para responder dentro de él.
