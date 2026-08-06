---
title: Discord
description: Conecta una aplicación de Discord — restablece el bot token, activa los intents de mensajes, pega el token, el Application ID y la Public key, y define el endpoint de interacciones.
order: 54
updated: 2026-07-07
---

**Discord** se conecta mediante una aplicación que creas en el Portal de
Desarrolladores de Discord. Tomarás tres valores — el **bot token**, el
**Application ID** y la **Public key** —, activarás los intents de mensajes e
invitarás al bot. Los mensajes libres llegan a Ganju por el Gateway de Discord
automáticamente; los comandos de barra usan la **Interactions Endpoint URL** que
defines al final.

## 1. Crea una aplicación y un bot

1. Ve al [Portal de Desarrolladores de Discord](https://discord.com/developers/applications)
   y selecciona **New Application**. Ponle nombre y acepta los términos.
2. En **General Information**, copia el **Application ID** y la **Public key**.
3. Abre la pestaña **Bot** y selecciona **Reset Token**, luego copia el **bot
   token** (trátalo como una contraseña).

## 2. Activa los intents e invita al bot

1. En **Bot → Privileged Gateway Intents**, activa **Message Content Intent** y
   **Server Members Intent**. Sin Message Content, el bot solo puede leer mensajes
   directos o mensajes donde lo mencionen con @.
2. Invita al bot a tu servidor con los permisos **`bot`** y
   **`applications.commands`**, y con los permisos **Send Messages**, **Read Message
   History** y **Attach Files**.

## 3. Conéctalo en Ganju

En **Channels → Add channel**, elige **Discord**, selecciona un modelo de lenguaje y
completa:

![El panel Connect channel con Discord seleccionado, mostrando los campos Bot token, Application ID y Public key](/images/new-channel-discord.webp)

- **Bot token** — de la pestaña **Bot** (Reset Token).
- **Application ID** — de **General Information**; se usa para registrar los
  comandos de barra.
- **Public key** — de **General Information**; se usa para verificar las
  interacciones entrantes.

Selecciona **Connect**. Ganju abre la conexión al Gateway de inmediato, así que el
bot ya puede responder mensajes.

## 4. Define el endpoint de interacciones

Para habilitar los comandos de barra nativos, Ganju te da una **Interactions
Endpoint URL** después de conectar. Pégala en **General Information → Interactions
Endpoint URL** de tu aplicación y guarda — Discord la verifica contra tu public key.

Fuentes: [Discord Bots & Companion Apps (Discord docs)](https://docs.discord.com/developers/bots/overview),
[Application setup (discord.js)](https://discordjs.guide/legacy/preparations/app-setup)
