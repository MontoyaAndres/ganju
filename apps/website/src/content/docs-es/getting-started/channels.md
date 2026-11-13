---
title: Canales
description: Ofrece tu IA a clientes y equipos en las apps que ya usan — Telegram, WhatsApp, Slack y Discord — y dile cómo responder.
order: 7
updated: 2026-11-13
---

Los **canales** son la forma de llevar tu asistente a otras personas — clientes,
tu equipo o personas concretas. Conecta **Telegram**, **WhatsApp**, **Slack** o
**Discord** y chatean con él en la app que ya usan. Todo lo que configuraste —
conocimiento, datos y herramientas — viene incluido automáticamente.

> **¿Quieres el panorama completo?** Esta es la versión rápida. La guía completa
> de **[Canales](/es/docs/channels/)** tiene la configuración paso a paso de
> [Telegram](/es/docs/channels/telegram/), [WhatsApp](/es/docs/channels/whatsapp/),
> [Slack](/es/docs/channels/slack/) y [Discord](/es/docs/channels/discord/).

## Dile al bot cómo responder

Arriba en **Canales**, las **Instrucciones del bot** definen cómo responde tu bot
en todos los canales (y en el chat **Pruébalo** del Asistente): su idioma, largo y
tono, o lo que siempre o nunca debe decir. Hasta 2.000 caracteres. Selecciona
**Guardar**.

```text
Responde en dos oraciones como máximo.
Responde siempre en español.
Llama a los clientes por su nombre.
```

Los datos como precios y horarios no van aquí — ponlos en
[Recursos](/es/docs/getting-started/resources/) para que el bot pueda
consultarlos.

![El diálogo Instrucciones del bot con instrucciones de ejemplo y el contador de 2.000 caracteres](/images/channels-bot-instructions.webp)

## Agrega un canal

Abre **Canales** y selecciona **Agregar canal**. En el panel **Conectar canal**,
elige una **Plataforma**, el **Modelo de lenguaje** (o deja el **Modelo por
defecto**) y completa las credenciales de esa plataforma. Para Telegram basta con
un **Token del bot** — Ganju registra el webhook por ti.

![El panel Conectar canal con las opciones Telegram, Slack, WhatsApp y Discord y un campo para el token del bot](/images/new-channel.webp)

Lo que pide cada plataforma:

| Plataforma | Credenciales |
| --- | --- |
| Telegram | Token del bot |
| Slack | Token del bot, Signing secret |
| Discord | Token del bot, Application ID, Public key |
| WhatsApp | Access token, Phone number ID, Verify token, App secret |

Slack, Discord y WhatsApp te dan después una URL para pegar en la plataforma
(**Request URL**, **Interactions Endpoint URL** o **Callback URL**) — las páginas
de cada plataforma te guían.

## Crea un bot de Telegram

Para Telegram, el token lo da el propio **@BotFather** de Telegram. Escríbele,
envía `/newbot`, elige un nombre y un nombre de usuario que termine en `bot`, y
copia el token que te devuelve. Mantenlo en secreto — cualquiera que lo tenga
puede controlar tu bot.

![El chat con BotFather en Telegram guiando /newbot para crear un bot y obtener su token](/images/new-channel-telegram.webp)

## Conéctalo

Pega el token en el campo **Token del bot** y selecciona **Conectar**.

![El panel Conectar canal con un token de bot de Telegram escrito, listo para conectar](/images/telegram-token.webp)

El canal aparece como **Activo**. Su pestaña **Resumen** tiene sus ajustes:

- **Estado** — **Recibiendo mensajes**, o **En pausa** para descartar los
  mensajes que llegan sin desconectarlo.
- **Modelo de lenguaje** — cambia el modelo que usa este canal. Tus propios
  modelos vienen de [Configuración → Modelos](/es/docs/settings/#modelos--trae-el-tuyo).
- **Tiempo de respuesta** — espera una pausa para que varios mensajes cortos
  reciban una sola respuesta: **Responder cada mensaje**, o esperar 2, 5
  (recomendado), 10 o 30 segundos.
- **Respuestas por cliente** — cuántas respuestas recibe un cliente en 24 horas,
  o **Sin límite**.
- **Memoria de clientes** — **Recordar a los clientes**: el bot guarda lo que
  cada cliente le cuenta de sí mismo (solo en chats privados) y lo usa la
  próxima vez.
- **Actividad**, con el conteo de conversaciones y mensajes, y **Eliminar canal**
  en la **Zona de riesgo**.

![El Resumen de un canal de Telegram: el bot, Recibiendo mensajes, Modelo de lenguaje, Tiempo de respuesta y Respuestas por cliente](/images/channel-overview.webp)

## Chatea con tu asistente

Ahora cualquiera puede escribirle a tu bot. Ejecuta el prompt `/start` y se
presenta con los recursos y las herramientas que configuraste antes.

![El bot de Telegram respondiendo a /start con un resumen del proyecto, sus recursos y sus herramientas](/images/telegram-message.webp)

Pídele algo real — aquí, "envíame el libro de matemáticas y dime de qué trata" —
y usa tus **herramientas** y **recursos** para responder y entregar el archivo.

![El bot de Telegram enviando el PDF de matemáticas y describiendo lo que cubre el libro](/images/message-ask-book.webp)

## Revisa las conversaciones

De vuelta en el panel, la pestaña **Conversaciones** de cada canal muestra cada
intercambio — los mensajes, las herramientas y los recursos que usó cada
respuesta, y las **Fuentes** que citó — para que veas exactamente cómo usa la
gente tu asistente.

![La pestaña Conversaciones de un canal con un chat privado y su número de mensajes](/images/channel-conversations.webp)

## Límites y facturación

| | Free | Pro / Enterprise |
| --- | --- | --- |
| Canales por proyecto | 1 | Ilimitados |
| Respuestas del asistente al mes | 100, luego se pausa | 3.000 incluidas, luego se cobran |

Solo cuentan las **respuestas** de tu bot — los mensajes que la gente le envía
son gratis. Mira
[Configuración → Facturación y plan](/es/docs/settings/#facturación-y-plan).

Sigue con: gestiónalo con el tiempo en la
[configuración](/es/docs/getting-started/settings/).
