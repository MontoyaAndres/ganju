---
title: Slack
description: "Conecta una app de Slack: agrega los scopes del bot, instálala en tu espacio de trabajo, pega el bot token y el signing secret, y define la Request URL para eventos y slash commands."
order: 53
updated: 2026-11-13
---

**Slack** se conecta con una app de Slack que creas una sola vez. Agregarás
unos scopes de bot, instalarás la app para obtener su **Bot User OAuth Token** y
su **Signing secret**, pegarás ambos en Ganju y luego pondrás la **Request URL**
de Ganju como endpoint de eventos de la app (y de los slash commands que
quieras).

## 1. Crea una app de Slack

1. Ve a [api.slack.com/apps](https://api.slack.com/apps) y selecciona **Create New
   App → From scratch**. Ponle nombre y elige tu espacio de trabajo.
2. Deja **Socket Mode** (en **Settings**) **apagado**. Ganju recibe los eventos
   por HTTP en su Request URL; con Socket Mode activo, Slack nunca los envía ahí.

## 2. Agrega los scopes del bot token

En **OAuth & Permissions → Bot Token Scopes**, agrega los scopes
**obligatorios**:

- `app_mentions:read`: ver los mensajes que mencionan al bot con @
- `im:history`: leer los mensajes directos al bot
- `chat:write`: publicar respuestas
- `files:write`: enviar archivos como adjuntos
- `files:read`: descargar los clips de voz para transcribirlos

Opcionalmente agrega los **recomendados** para que el bot muestre nombres en
lugar de IDs: `users:read`, `channels:read`, `groups:read`.

Una app instalada antes de agregar un scope necesita **volver a instalarse** para
que surta efecto. Mientras no tenga `files:read`, los clips de voz reciben una
respuesta pidiendo que lo escriban.

## 3. Instálala y copia las credenciales

1. Todavía en **OAuth & Permissions**, selecciona **Install to Workspace** y
   aprueba. Copia el **Bot User OAuth Token** (empieza con `xoxb-`).
2. En **Basic Information → App Credentials**, copia el **Signing secret**.
3. Abre **App Home** y, en **Show Tabs**, activa la **Messages tab** y permite
   que los usuarios envíen mensajes desde ella, para que la gente pueda
   escribirle al bot por mensaje directo.

## 4. Conéctala en Ganju

En **Canales → Agregar canal**, elige **Slack**, escoge un **Modelo de
lenguaje** y pega el **Token del bot** y el **Signing secret**. El panel muestra
los scopes obligatorios y recomendados y los eventos del bot a los que
suscribirse. Selecciona **Conectar**.

![El panel Conectar canal con Slack: token del bot, Signing secret y los scopes requeridos](/images/new-channel-slack.webp)

Ganju revisa el bot token con Slack y muestra el espacio de trabajo y el nombre
del bot en el canal. El signing secret se verifica cuando Slack envía su primer
evento.

## 5. Define la Request URL

Después de conectar, el **Resumen** del canal muestra **Configuración de Slack**
con una **Request URL** y un botón para copiarla. De vuelta en tu app de Slack:

1. Ve a **Event Subscriptions** y activa **Enable Events**.
2. Pega la Request URL de Ganju. Slack la verifica al instante.
3. En **Subscribe to bot events**, agrega **`app_mention`** y **`message.im`**, y
   selecciona **Save Changes**. Vuelve a instalar la app si Slack te lo pide.

Ahora escríbele al bot por mensaje directo, o invítalo a un canal
(`/invite @tubot`) y menciónalo con @, y responderá.

## 6. Agrega slash commands (opcional)

Slack solo acepta los slash commands que creaste en la app, así que un
[prompt](/es/docs/prompts/) se vuelve comando de Slack cuando lo agregas ahí:

1. En tu app de Slack, abre **Slash Commands → Create New Command**.
2. **Command**: el comando del prompt tal como aparece en su tarjeta, por
   ejemplo `/resumir_articulo`.
3. **Request URL**: la misma Request URL del paso 5.
4. Agrega una descripción corta y guarda; vuelve a instalar la app si Slack te
   lo pide.

El texto después del comando llena la primera variable del prompt, y la
respuesta se publica en la conversación donde se usó el comando. También puedes
agregar `/link`, que responde con un código para vincular la cuenta que solo ves
tú.

## Cómo se comporta el bot en Slack

- **Mensajes directos**: responde todos los mensajes.
- **Canales**: solo responde cuando lo **mencionan con @**, y contesta en un hilo
  debajo de ese mensaje, siguiendo el hilo si ya existe.
- **Clips de voz**: se transcriben y se responden como texto (necesita
  `files:read`).
- **Fuentes**: con las [citas](/es/docs/resources/#cita-tus-fuentes) activadas,
  después de la respuesta llega una lista corta de enlaces a las fuentes.
- **Archivos**: el bot puede subir recursos guardados como adjuntos.
- **Confirmaciones**: antes de que una herramienta cambie algo, el bot pregunta;
  responde sí o no.

## Solución de problemas

- **La Request URL no se verifica.** Revisa que pegaste exactamente la URL del
  Resumen de este canal, y que el canal esté **Activo**.
- **Nunca llegan eventos.** Revisa que **Socket Mode** esté apagado, que **Enable
  Events** esté activado y que `app_mention` y `message.im` estén suscritos.
- **"Sending messages to this app has been turned off".** Activa la **Messages
  tab** en **App Home**.
- **El bot ignora un canal.** Invítalo al canal y menciónalo con @.
- **Muestra IDs de usuario en vez de nombres.** Agrega los scopes recomendados y
  vuelve a instalar la app.
- **"/comando is not a valid command".** Crea el slash command en la app de
  Slack (paso 6).

Fuentes: [Creating an app from app settings (Slack)](https://docs.slack.dev/app-management/quickstart-app-settings/),
[Installing with OAuth (Slack)](https://docs.slack.dev/authentication/installing-with-oauth/)
