---
title: Slack
description: Conecta una app de Slack — agrega los permisos de bot necesarios, instálala en tu espacio de trabajo, pega el bot token y el signing secret, y define la Request URL.
order: 53
updated: 2026-07-07
---

**Slack** se conecta mediante una app de Slack que creas una sola vez. Agregarás
unos permisos de bot, instalarás la app para obtener su **Bot User OAuth Token** y
su **Signing secret**, pegarás ambos en Ganju y luego pondrás la **Request URL** de
Ganju como endpoint de eventos de la app.

## 1. Crea una app de Slack

1. Ve a [api.slack.com/apps](https://api.slack.com/apps) y selecciona **Create New
   App → From scratch**. Ponle nombre y elige tu espacio de trabajo.

## 2. Agrega los permisos del bot token

En **OAuth & Permissions → Bot Token Scopes**, agrega los permisos **obligatorios**:

- `app_mentions:read`
- `im:history`
- `chat:write`
- `files:write`

Opcionalmente agrega los **recomendados** para que el bot muestre nombres en lugar
de IDs crudos: `users:read`, `channels:read`, `groups:read`.

## 3. Instálala y copia las credenciales

1. Todavía en **OAuth & Permissions**, selecciona **Install to Workspace** y
   aprueba. Copia el **Bot User OAuth Token** (empieza con `xoxb-`).
2. En **Basic Information → App Credentials**, copia el **Signing secret**.
3. Abre **App Home** y activa la **Messages tab** para que los usuarios puedan
   escribirle al bot por mensaje directo.

## 4. Conéctala en Ganju

En **Channels → Add channel**, elige **Slack**, selecciona un modelo de lenguaje y
pega el **Bot token** y el **Signing secret**, luego selecciona **Connect**.

![El panel Connect channel con Slack seleccionado, mostrando los campos Bot token y Signing secret y los permisos de bot token requeridos](/images/new-channel-slack.webp)

## 5. Define la Request URL

Después de conectar, Ganju te da una **Request URL**. De vuelta en tu app de Slack:

1. Ve a **Event Subscriptions** y activa **Enable Events**.
2. Pega la Request URL de Ganju — Slack la verifica al instante.
3. En **Subscribe to bot events**, agrega **`app_mention`** y **`message.im`**, y
   guarda.

La misma Request URL sirve también para cualquier **Slash Command** que agregues más
adelante. Una vez suscritos los eventos, menciona al bot con @ en un canal o
escríbele por mensaje directo y responderá.

Fuentes: [Creating an app from app settings (Slack)](https://docs.slack.dev/app-management/quickstart-app-settings/),
[Installing with OAuth (Slack)](https://docs.slack.dev/authentication/installing-with-oauth/)
