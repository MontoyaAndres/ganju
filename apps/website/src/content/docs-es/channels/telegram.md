---
title: Telegram
description: Conecta un bot de Telegram en un minuto — créalo con @BotFather, pega el token y Ganju registra el webhook por ti.
order: 51
updated: 2026-07-07
---

**Telegram** es el canal más rápido de configurar. Creas un bot con el propio
**@BotFather** de Telegram, copias el token que te da y lo pegas en Ganju — eso es
todo. Ganju registra el webhook y tus comandos de barra automáticamente.

## 1. Crea un bot con BotFather

1. Abre Telegram y busca **@BotFather** (la cuenta verificada con el chulo azul).
2. Inicia un chat y envía **`/newbot`**.
3. Escribe un **nombre visible** para tu bot (el que quieras).
4. Escribe un **nombre de usuario** — debe ser único y terminar en `bot` (por
   ejemplo, `acme_support_bot`).
5. BotFather responde con tu **bot token** — una cadena larga como
   `123456789:AA...`. Cópiala.

Trata el token como una contraseña. Si se filtra, revócalo en BotFather con
**`/mybots` → tu bot → API Token → Revoke current token** y luego reconecta el canal
con el nuevo.

## 2. Conéctalo en Ganju

En tu proyecto, abre **Channels → Add channel**, elige **Telegram**, selecciona un
**modelo de lenguaje** (o deja *System default*), pega el token en **Bot token** y
selecciona **Connect**.

![El panel Connect channel con Telegram seleccionado y un único campo de Bot token](/images/new-channel-telegram-1.webp)

Ganju llama por ti al `setWebhook` de Telegram y registra tus prompts como comandos
del bot — no hay URL de callback que configurar. El canal pasa a **Active** de
inmediato.

## 3. Conversa con él

Abre tu bot en Telegram (con el enlace `t.me/<usuario>` que te dio BotFather), envía
`/start` o un mensaje, y responderá usando tus prompts, recursos y herramientas.

Fuentes: [From BotFather to 'Hello World' (Telegram)](https://core.telegram.org/bots/tutorial),
[Telegram Bot API](https://core.telegram.org/bots/api)
