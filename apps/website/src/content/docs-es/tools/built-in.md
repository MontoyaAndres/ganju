---
title: Integradas
description: Las cinco herramientas base que trae todo proyecto — cómo tu asistente lista, busca, lee y entrega tus recursos y prompts.
order: 40
updated: 2026-07-07
---

Todo proyecto arranca con cinco herramientas **integradas** ya instaladas. Son la
base que le permite a tu asistente trabajar con tus [recursos](/es/docs/resources) y
[prompts](/es/docs/prompts) desde el primer día — sin conexión ni llave de API, y no
se pueden quitar. Esto es lo que hace que un asistente de Ganju responda con *tu*
contenido en lugar de adivinar.

## Herramientas

- **Search Resources** — la caballo de batalla. Hace búsqueda semántica en cada
  recurso adjunto al servidor para encontrar los fragmentos más relevantes para una
  `query`, ordenados por similitud, y devuelve los mejores extractos (5 por
  defecto, 20 máximo) con su URI, título, puntaje y texto. El asistente la ejecuta
  antes de responder cualquier cosa sobre tus datos, para contestar con contenido
  real en vez de alucinar.
- **List Resources** — enumera cada recurso del servidor como una lista de
  `{uri, title, description, mimeType}`. Úsala para recorrer el inventario completo
  y elegir una URI, frente a Search Resources cuando buscas contenido que responda
  a una pregunta.
- **Read Resource** — trae el contenido textual de un recurso por su URI para que
  el asistente pueda citarlo, resumirlo o razonar sobre él en línea. Devuelve texto
  plano o JSON en cadena. Los archivos binarios (PDF, imágenes, audio) no se
  incrustan aquí — esos se entregan con Send Resource.
- **Send Resource** — entrega un recurso al usuario como adjunto del canal — una
  vista previa, un reproductor o un enlace de descarga, en vez de texto plano.
  Úsala cuando alguien pide ver, recibir o descargar un archivo. Un `caption`
  opcional agrega un mensaje corto al lado.
- **List Prompts** — lista cada [prompt](/es/docs/prompts) y comando que expone el
  servidor — tanto los que creaste como los de servidores MCP conectados — junto
  con el comando de barra exacto y los argumentos para ejecutar cada uno en el
  canal actual.

## Cómo encajan entre sí

Una respuesta típica las encadena: **Search Resources** encuentra los extractos
relevantes, y luego el asistente los cita directamente, llama a **Read Resource**
para traer un documento completo, o usa **Send Resource** para entregarle el
archivo al usuario. **List Resources** y **List Prompts** son para descubrir —
mostrar qué hay disponible y cómo usarlo.

Sigue con: agrega capacidades más allá de tu propio contenido — mira
[Gmail](/es/docs/tools/gmail), [Slack](/es/docs/tools/slack) o
[Búsqueda web](/es/docs/tools/web-search).
