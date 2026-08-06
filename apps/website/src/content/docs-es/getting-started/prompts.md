---
title: Prompts
description: Crea plantillas de prompts reutilizables que se vuelven comandos de barra en tus canales de chat.
order: 4
updated: 2026-07-06
---

Los **prompts** son plantillas de mensajes reutilizables que tu proyecto expone.
En cualquier canal de chat vinculado, cada prompt se convierte en un **comando de
barra** que la gente puede ejecutar por su nombre — así una solicitud frecuente se
vuelve un atajo de una sola palabra. Usa `{{variables}}` en un mensaje para los
valores que se completan al ejecutarlo.

> **¿Quieres el panorama completo?** Esta es la versión rápida. La guía completa
> de **[Prompts](/es/docs/prompts)** cubre plantillas de varios turnos, variables
> tipadas y edición de mensajes como JSON.

## Crea un prompt

Abre la página **Prompts** y selecciona **New prompt**. Se abre un panel donde
armarás la plantilla.

![La página de Prompts con el panel New Prompt abierto, mostrando los campos vacíos de Título, Descripción y Mensajes](/images/new-prompt.webp)

## Complétalo

Dale un **título** al prompt — Ganju lo convierte en el comando de barra que se
muestra justo debajo (aquí, `start` se vuelve `/start`). Agrega una descripción
corta y luego escribe uno o más mensajes, cambiando cada uno entre **User** y
**Assistant** según necesites. ¿Prefieres JSON puro? Alterna **Visual / JSON**
cuando quieras.

![El panel New Prompt completo: título "start", comando /start, una descripción y un mensaje de usuario](/images/new-prompt-init.webp)

## Úsalo

Selecciona **Create** y el prompt aparece como una tarjeta con su comando de
barra, su descripción y sus mensajes — listo para ejecutarse desde cualquier canal
vinculado.

![El prompt "start" guardado, mostrado como tarjeta con su comando /start y el detalle del mensaje](/images/prompt-start.webp)

Sigue con: dale con qué trabajar — agrega
[recursos](/es/docs/getting-started/resources).
