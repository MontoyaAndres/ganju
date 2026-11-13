---
title: Discord
description: Conecta una aplicación de Discord — reinicia el token del bot, activa los intents de mensajes, invita al bot, pega el token, el application ID y la public key, y define el endpoint de interacciones para los comandos.
order: 54
updated: 2026-11-13
---

**Discord** se conecta mediante una aplicación que creas en el Discord Developer
Portal. Vas a necesitar tres valores — el **token del bot**, el **Application ID**
y la **Public key** —, activar los intents de mensajes e invitar al bot. Los
mensajes normales llegan a Ganju solos por el Gateway de Discord; los slash
commands usan la **Interactions Endpoint URL** que configuras al final.

## 1. Crea una aplicación y un bot

1. Ve al [Discord Developer Portal](https://discord.com/developers/applications)
   y selecciona **New Application**. Ponle nombre y acepta los términos.
2. En **General Information**, copia el **Application ID** y la **Public key**.
3. Abre la pestaña **Bot** y selecciona **Reset Token**, luego copia el **token
   del bot** (trátalo como una contraseña; Discord lo muestra una sola vez).

## 2. Activa los intents e invita al bot

1. En **Bot → Privileged Gateway Intents**, activa **Message Content Intent** y
   **Server Members Intent**. Sin Message Content, el bot solo puede leer
   mensajes directos o mensajes donde lo mencionan con @.
2. En **OAuth2 → URL Generator**, marca los scopes **`bot`** y
   **`applications.commands`**, y luego los permisos **Send Messages**, **Read
   Message History** y **Attach Files**. Abre la URL que se genera y agrega el
   bot a tu servidor.

## 3. Conéctalo en Ganju

En **Canales → Agregar canal**, elige **Discord**, escoge un **Modelo de
lenguaje** y completa:

![El panel Conectar canal con Discord: token del bot, ID de la aplicación, clave pública y los intents requeridos](/images/new-channel-discord.webp)

- **Token del bot** — de la pestaña **Bot** (Reset Token).
- **Application ID** — de **General Information**; sirve para registrar los
  comandos.
- **Public key** — de **General Information**; sirve para verificar las
  interacciones que llegan.

Selecciona **Conectar**. Ganju revisa el token con Discord, registra los
comandos y abre la conexión con el Gateway de inmediato, así que el bot ya puede
responder mensajes directos y menciones.

## 4. Configura el endpoint de interacciones

Los slash commands nativos llegan por aparte. El **Resumen** del canal muestra
**Configuración de Discord** con una **Interactions Endpoint URL** y un botón
para copiarla. Pégala en **General Information → Interactions Endpoint URL** de
tu aplicación y guarda — Discord la verifica en el momento con tu public key.

## Slash commands

Ganju registra un slash command por cada [prompt](/es/docs/prompts/), con el
nombre del comando que aparece en la tarjeta del prompt y una opción **`text`**
opcional que llena la primera variable del prompt. También registra **`/link`**,
que responde con un código para vincular la cuenta que solo ves tú. La lista se
actualiza cada vez que agregas, renombras o eliminas un prompt. Discord admite
hasta 100 comandos; los nombres se cortan a 32 caracteres.

La respuesta a un slash command llega a la misma conversación cuando está lista.

## Cómo se comporta el bot en Discord

- **Mensajes directos**: responde todos los mensajes.
- **Servidores**: solo responde cuando lo **mencionan con @**.
- **Mensajes de voz**: se transcriben y se responden como texto.
- **Fuentes**: con las [citas](/es/docs/resources/#cita-tus-fuentes) activadas,
  las fuentes llegan como botones de enlace debajo de la respuesta.
- **Archivos**: el bot puede adjuntar recursos guardados, de hasta 25 MB cada uno
  (el límite de Discord para bots en servidores sin mejoras).
- **Confirmaciones**: antes de que una herramienta cambie algo, el bot pregunta
  con botones Sí / No que solo puede usar la persona a la que le preguntó.

Las respuestas largas se dividen en varios mensajes (Discord admite 2.000
caracteres por mensaje).

## Solución de problemas

- **El bot está en línea pero ignora los mensajes de un servidor.** Menciónalo
  con @. Si aun así no responde, revisa que **Message Content Intent** esté
  activado.
- **No aparece ningún comando.** Vuelve a invitar al bot con el scope
  `applications.commands` y configura la Interactions Endpoint URL. Discord puede
  tardar unos minutos en mostrar los comandos nuevos.
- **"Interactions endpoint URL could not be verified".** Revisa que la **Public
  key** que pegaste en Ganju sea la de **General Information**, y que el canal
  esté **Activo**.
- **"Conectar" falla de inmediato.** El token está mal o se reinició. Reinícialo
  otra vez y pega el nuevo.

Fuentes: [Discord Bots & Companion Apps (Discord docs)](https://docs.discord.com/developers/bots/overview),
[Application setup (discord.js)](https://discordjs.guide/legacy/preparations/app-setup)
