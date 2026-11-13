---
title: Prompts
description: Crea plantillas de prompts reutilizables que se vuelven comandos en tus canales de chat.
order: 4
updated: 2026-11-13
minutes: 3
outcome: "Un comando `/start` que la gente puede ejecutar en cualquier canal."
---

Los **prompts** son plantillas de mensajes reutilizables que tu proyecto expone.
En cualquier canal de chat vinculado, cada prompt se convierte en un **comando**
que la gente puede ejecutar por su nombre. Así, una solicitud frecuente se vuelve
un atajo de una sola palabra. Los clientes MCP como Claude también los ven. Usa
`{{variables}}` en un mensaje para los valores que se completan al ejecutarlo.

> **¿Quieres el panorama completo?** Esta es la versión rápida. La guía completa
> de **[Prompts](/es/docs/prompts/)** cubre plantillas de varios turnos, variables
> tipadas y edición de mensajes como JSON.

## Crea un prompt

1. Abre **Conocimiento** en la barra lateral y luego la pestaña **Prompts**.
2. Selecciona **Nuevo prompt**. Se abre el panel **Nuevo prompt**.

![El panel Nuevo prompt: título, descripción, mensajes con el cambio Visual/JSON y Agregar mensaje](/images/new-prompt-panel.webp)

## Complétalo

1. **Título**: un nombre corto. Ganju lo convierte en el comando que aparece
   justo debajo (**Comando:**); aquí, `start` se vuelve `/start`.
2. **Descripción**: qué hace el prompt. La ven las personas y los clientes de
   IA.
3. **Mensajes**: escribe uno o más mensajes, cambiando cada uno entre **User** y
   **Assistant**. **Agregar mensaje** suma otro turno. ¿Prefieres JSON puro?
   Cambia entre **Visual / JSON** cuando quieras.
4. **Variables**: cada `{{nombre}}` que escribas se detecta solo. Define su
   **Tipo**, una **Descripción** y si es **Obligatoria** u **Opcional**.

## Úsalo

Selecciona **Crear**. El prompt aparece como una tarjeta con su comando, su
descripción y sus mensajes, listo para ejecutarse como `/start` desde cualquier
canal vinculado. Abre una tarjeta para editarlo, o para eliminarlo.

![Una tarjeta de prompt guardada con su título, el comando /start y su descripción](/images/knowledge-prompts-tab.webp)

## Límites

| | Free | Pro / Enterprise |
| --- | --- | --- |
| Prompts por proyecto | 3 | Ilimitados |
