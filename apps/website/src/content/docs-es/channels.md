---
title: Canales
description: Lleva tu asistente a personas reales en las apps que ya usan — Telegram, WhatsApp, Slack y Discord — o conéctalo a cualquier cliente MCP.
order: 5
updated: 2026-07-07
---

Los **canales** son la forma de poner tu asistente frente a otras personas. Todo lo
que construiste — [prompts](/es/docs/prompts), [recursos](/es/docs/resources) y
[herramientas](/es/docs/tools) — viaja con él automáticamente; tú solo eliges dónde
lo alcanza la gente. Conecta una **app de mensajería** para que clientes y
compañeros conversen con tu IA donde ya están, o conecta cualquier **cliente MCP**
para un flujo de trabajo más avanzado.

## Por qué usar canales

- **Encuentra a la gente donde está.** No hay una app nueva que instalar — tu
  asistente vive en Telegram, WhatsApp, Slack o Discord.
- **Un asistente, disponible en todas partes.** Cada canal sirve los mismos
  prompts, recursos y herramientas, así que las respuestas son consistentes entre
  apps.
- **Trae tu propio modelo.** Cada canal puede correr sobre el modelo del sistema o
  sobre uno que tú configures — mira [Configuración](/es/docs/settings).
- **Míralo funcionar.** Cada conversación queda registrada en el panel para que
  veas exactamente cómo usa la gente tu IA.

## Qué hay disponible

Ganju soporta cuatro plataformas de mensajería. Cada una tiene su propia página con
instrucciones paso a paso para crear las credenciales que necesita:

- **[Telegram](/es/docs/channels/telegram)** — un solo bot token de @BotFather.
- **[WhatsApp](/es/docs/channels/whatsapp)** — la Cloud API de WhatsApp Business
  (Meta).
- **[Slack](/es/docs/channels/slack)** — una app de Slack con bot token y permisos.
- **[Discord](/es/docs/channels/discord)** — una aplicación y un bot de Discord.

## Cómo funciona

Abre **Channels** y selecciona **Add channel**. Elige una **plataforma**, escoge el
**modelo de lenguaje** (o deja *System default*) y pega las credenciales de esa
plataforma. Ganju las guarda de forma segura y arma la conexión — para Telegram
registra el webhook por ti; para Slack, WhatsApp y Discord te da una URL para pegar
de vuelta en esa plataforma (la página de cada servicio cubre los pasos exactos).

![El panel Connect channel con las opciones Telegram, Slack, WhatsApp y Discord, un desplegable de modelo de lenguaje y un campo de bot token](/images/new-channel.webp)

Una vez conectado, el canal pasa a **Active**. Desde su **Overview** puedes
alternar **Receiving messages**, cambiar el modelo, ver la actividad o eliminar el
canal.

![Un canal conectado y marcado como Active, con su estado, modelo y panel de actividad](/images/channel-done.webp)

## Elige el modelo de lenguaje

Cada canal corre sobre un modelo de lenguaje. Por defecto es el **System default**,
pero puedes traer el tuyo — tu propio proveedor y tu llave de API, configurados una
vez y reutilizados entre canales. Explicamos cómo agregar uno en
[Configuración](/es/docs/settings); hasta entonces, los canales nuevos simplemente
usan el modelo del sistema.

## Conecta cualquier cliente MCP

Las apps de mensajería no son la única puerta de entrada. Por debajo, tu proyecto
es un **servidor de Model Context Protocol (MCP)**, así que cualquier cliente
compatible con MCP — **Claude**, **ChatGPT** o **Cursor** — puede conectarse al
mismísimo asistente, con todos tus prompts, recursos y herramientas disponibles.
Los canales son para las personas a las que atiendes; los clientes MCP son para
enchufar tu IA en tus propias herramientas y flujos de trabajo. Ambos apuntan a un
mismo proyecto. Cubrimos la conexión de un cliente en detalle en la guía de
[clientes MCP](/es/docs/mcp).

## Monitorea las conversaciones

De vuelta en el panel, la vista **Conversations** de cada canal muestra todos los
intercambios, para que veas exactamente cómo está usando la gente tu asistente.

![La vista Conversations del panel mostrando un intercambio en un canal](/images/channel-messages.webp)

La tarjeta del canal lleva la cuenta de conversaciones y mensajes, y cada respuesta
muestra los recursos que entregó como adjuntos.

![La página de Canales mostrando los conteos de conversaciones y mensajes junto a un archivo entregado como adjunto](/images/channe-show-messages.webp)

Sigue con: administra modelos, miembros y facturación en
[Configuración](/es/docs/settings).
