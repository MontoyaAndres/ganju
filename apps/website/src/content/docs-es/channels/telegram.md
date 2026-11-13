---
title: Telegram
description: "Conecta un bot de Telegram en un minuto: créalo con @BotFather, pega el token y Ganju registra el webhook y el menú de comandos por ti."
order: 51
updated: 2026-11-13
---

**Telegram** es el canal más rápido de configurar. Creas un bot con
**@BotFather**, la cuenta oficial de Telegram, copias el token que te da y lo
pegas en Ganju. Eso es todo. Ganju registra el webhook y convierte tus prompts
en el menú de comandos del bot automáticamente.

## 1. Crea un bot con BotFather

1. Abre Telegram y busca **@BotFather** (la cuenta verificada con la marca azul).
2. Inicia un chat y envía **`/newbot`**.
3. Escribe un **nombre visible** para tu bot (el que quieras).
4. Escribe un **username**: debe ser único y terminar en `bot` (por ejemplo,
   `acme_soporte_bot`).
5. BotFather te responde con el **token del bot**, una cadena larga como
   `123456789:AA...`. Cópiala.

Trata el token como una contraseña. Si quieres, ya que estás en BotFather, dale
al bot una descripción y una foto de perfil con `/setdescription` y
`/setuserpic`.

## 2. Conéctalo en Ganju

En tu proyecto, abre **Canales → Agregar canal**, elige **Telegram**, escoge un
**Modelo de lenguaje** (o deja **Modelo por defecto**), pega el token en **Token
del bot** y selecciona **Conectar**.

![El panel para conectar un canal con Telegram seleccionado y un solo campo para el token del bot](/images/new-channel-telegram-1.webp)

Ganju revisa el token con Telegram y luego:

- registra el **webhook** del bot, así que no tienes que configurar ninguna URL;
- registra tus [prompts](/es/docs/prompts/) como el **menú de comandos** del bot,
  y lo actualiza cada vez que agregas, renombras o eliminas un prompt.

El canal queda **Activo** de inmediato, con el nombre y el `@username` del bot en
su tarjeta.

Desde ese momento Ganju recibe los mensajes del bot por ese webhook, así que el
mismo token no puede funcionar a la vez en otro servidor o plataforma de bots:
gana el último que configure un webhook.

## 3. Chatea con él

Abre tu bot en Telegram (con el enlace `t.me/<username>` que te dio BotFather) y
envía un mensaje. Responde usando tus recursos, herramientas e
[instrucciones del bot](/es/docs/channels/#dile-a-tu-bot-cómo-responder).

- **Chats privados**: el bot responde todos los mensajes.
- **Grupos**: agrega el bot al grupo. Solo responde cuando lo **mencionan con
  @**, cuando alguien **responde** a uno de sus mensajes, o cuando un comando va
  dirigido a él (`/comando@tubot`). Ignora el resto de la conversación del grupo.
- **Comandos**: escribe **/** para ver tus prompts en el menú, con sus
  descripciones. El texto después de un comando llena la primera variable del
  prompt. Telegram muestra hasta 100 comandos.
- **Notas de voz** y archivos de audio se transcriben y se responden como texto;
  el pie de foto cuenta como texto enviado con la nota.
- **Fuentes**: con las [citas](/es/docs/resources/#cita-tus-fuentes) activadas,
  la respuesta llega con un botón por fuente debajo.
- **Archivos**: el bot puede enviar recursos guardados (un menú en PDF, una lista
  de precios) como adjuntos.
- **Confirmaciones**: antes de que una herramienta cambie algo, el bot pregunta
  con botones Sí / No.

Las respuestas largas se dividen en varios mensajes.

## Cambia o revoca el token

Si el token se filtra, revócalo en BotFather con **`/mybots` → tu bot → API
Token → Revoke current token**. El token viejo deja de funcionar de inmediato, y
el canal también. Para usar el token nuevo, elimina el canal y vuelve a
conectarlo. Eliminar un canal borra su historial de conversaciones.

## Solución de problemas

- **"Conectar" falla de inmediato.** El token está mal o fue revocado. Cópialo de
  nuevo desde BotFather (`/mybots` → tu bot → API Token).
- **El bot no responde en un grupo.** Menciónalo (`@tubot`) o responde a uno de
  sus mensajes. Revisa también que BotFather le permita unirse a grupos
  (`/mybots` → tu bot → Bot Settings → Allow Groups).
- **El bot dejó de responder después de usar el token en otro lado.** Otro
  servicio reemplazó el webhook. Elimina el canal y vuelve a conectarlo.
- **Falta un prompt en el menú.** Los comandos deben empezar con una letra, y el
  menú puede tardar un momento en actualizarse. Escribir el comando igual
  funciona.

Fuentes: [From BotFather to 'Hello World' (Telegram)](https://core.telegram.org/bots/tutorial),
[Telegram Bot API](https://core.telegram.org/bots/api)
