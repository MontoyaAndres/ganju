---
title: Canales
description: Ofrece tu IA a clientes y equipos en las apps que ya usan — Telegram, Slack, WhatsApp y Discord.
order: 7
updated: 2026-07-06
---

Los **canales** son la forma de llevar tu asistente a otras personas — clientes,
tu equipo o individuos. Conecta **Telegram**, **Slack**, **WhatsApp** o
**Discord** y podrán conversar con él en la app que ya usan. Todo lo que
configuraste — prompts, recursos y herramientas — viaja automáticamente con él.

> **¿Quieres el panorama completo?** Esta es la versión rápida. La guía completa
> de **[Canales](/es/docs/channels)** trae la configuración paso a paso de
> Telegram, WhatsApp, Slack y Discord, además de cómo conectar
> [clientes MCP](/es/docs/mcp).

## Agrega un canal

Abre **Channels** y selecciona **Add channel**. Elige una **plataforma**,
selecciona el modelo de lenguaje (o deja **System default**) y pega un **bot
token** — Ganju registra el webhook por ti.

![El panel Connect channel con las opciones Telegram, Slack, WhatsApp y Discord y un campo de bot token](/images/new-channel.webp)

## Crea un bot de Telegram

Para Telegram, el token viene del propio **@BotFather** de Telegram. Escríbele,
envía `/newbot`, elige un nombre y un usuario que termine en `bot`, y copia el
token que te devuelve. Mantenlo en secreto — cualquiera que lo tenga puede
controlar tu bot.

![El chat con BotFather en Telegram recorriendo /newbot para crear un bot y obtener su token](/images/new-channel-telegram.webp)

## Conéctalo

Pega el token en el campo **Bot token** y selecciona **Connect**.

![El panel Connect channel con un token de bot de Telegram escrito, listo para conectar](/images/telegram-token.webp)

El canal pasa a **Active**. Desde su **Overview** puedes alternar **Receiving
messages**, cambiar el modelo, ver la actividad o eliminar el canal.

![El canal de Telegram conectado y marcado como Active, con su estado, modelo y panel de actividad](/images/channel-done.webp)

## Conversa con tu asistente

Ahora cualquiera puede escribirle a tu bot. Ejecuta el prompt `/start` y se
presenta con los recursos y herramientas que configuraste antes.

![El bot de Telegram respondiendo /start con un resumen del proyecto, sus recursos y sus herramientas](/images/telegram-message.webp)

Pídele algo real — aquí, "envíame el libro de matemáticas y cuéntame de qué
trata" — y usará tus **herramientas** y **recursos** para responder y entregar el
archivo.

![El bot de Telegram enviando el PDF de matemáticas y describiendo de qué trata el libro](/images/message-ask-book.webp)

## Monitorea las conversaciones

De vuelta en el panel, la pestaña **Conversations** de cada canal muestra todos los
intercambios — así ves exactamente cómo está usando la gente tu asistente.

![La vista Conversations del panel mostrando el intercambio /start en un chat privado de Telegram](/images/channel-messages.webp)

La tarjeta del canal lleva la cuenta de conversaciones y mensajes, y cada respuesta
muestra los recursos que envió como adjuntos.

![La página de Canales mostrando los conteos de conversaciones y mensajes junto al PDF entregado como adjunto](/images/channe-show-messages.webp)

Sigue con: adminístralo en el tiempo desde
[configuración](/es/docs/getting-started/settings).
