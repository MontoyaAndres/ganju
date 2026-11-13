---
title: Integradas
description: Las cinco herramientas base que trae todo proyecto — cómo tu asistente lista, busca, lee y entrega tus recursos y prompts.
order: 40
updated: 2026-11-13
---

Todo proyecto arranca con cinco herramientas **integradas** ya encendidas. Son
el núcleo que le permite a tu asistente trabajar con tus
[recursos](/es/docs/resources/) y [prompts](/es/docs/prompts/) desde el primer
día — sin conexión ni API key. Esto es lo que hace que un asistente de Ganju
responda desde *tu* contenido en lugar de adivinar.

Las encuentras en la tarjeta **Integradas** de la pestaña
[Catálogo](/es/docs/tools/catalog/), cada una con su propio interruptor.

![La integración Integradas con sus cinco herramientas encendidas](/images/tools-catalog-builtin.webp)

## Herramientas

El nombre entre paréntesis es el que muestran los clientes MCP y los registros.

- **Buscar recursos** (`search-resources`) — la que más trabaja. Busca en todos
  los recursos del servidor los pasajes más relevantes para una `query`, **por
  significado y por palabras exactas**, así que encuentra paráfrasis y también
  IDs, códigos, SKUs y nombres literales. Devuelve los mejores fragmentos
  (`limit`: 5 por defecto, máximo 20), del más relevante al menos, cada uno con
  su URI, título, puntaje y texto — y, cuando se conocen, un enlace al original
  (`source`: la página web, o el archivo en Google Drive u OneDrive), la
  `page`, la `section` (ruta de títulos, hoja o diapositiva) y cuándo se
  actualizó. El asistente tiene instrucciones de usarla antes de responder
  cualquier cosa sobre tus datos y de citar lo que usa.
- **Listar recursos** (`list-resources`) — lista los recursos del servidor por
  páginas, como `{uri, title, description, mimeType}`, con un total y un cursor
  para la página siguiente (`limit`: 100 por defecto, máximo 500). Úsala para
  recorrer el inventario y elegir un URI; Buscar recursos es para encontrar
  contenido que responda una pregunta.
- **Leer recurso** (`read-resource`) — trae el texto de un recurso por su `uri`
  para que el asistente lo cite, lo resuma o razone sobre él. Devuelve texto
  plano o JSON. Los archivos binarios (PDF, imágenes, audio, video, comprimidos)
  no se insertan aquí — se entregan con Enviar recurso, y su texto se alcanza con
  Buscar recursos.
- **Enviar recurso** (`send-resource`) — entrega un recurso (`uri`) a la persona
  como adjunto en el canal: una vista previa, un reproductor o un enlace de
  descarga en lugar de texto crudo. Úsala cuando alguien pida ver, recibir o
  descargar un archivo. Un `caption` opcional agrega un mensaje corto.
- **Listar prompts** (`list-prompts`) — lista cada [prompt](/es/docs/prompts/) y
  comando que expone el servidor — los que creaste y los de un servidor MCP
  remoto conectado — con el comando de barra exacto (por ejemplo `/summarize`)
  y los argumentos para ejecutar cada uno en el canal actual.

Ninguna llega a alguien fuera de la conversación ni cambia tus datos, así que
ninguna se detiene por
[Confirmar acciones sensibles](/es/docs/settings/#confirmar-acciones-sensibles).

## Cómo se combinan

Una respuesta típica las encadena: **Buscar recursos** encuentra los fragmentos
relevantes y luego el asistente los cita directamente, llama a **Leer recurso**
para traer un documento completo, o a **Enviar recurso** para entregarle el
archivo a la persona. **Listar recursos** y **Listar prompts** sirven para
descubrir — mostrar qué hay disponible y cómo usarlo.

## Mantenlas encendidas

Las integradas cuentan contra tu límite de herramientas (en Free, 5 de las 7),
pero son lo último que deberías recortar. Puedes apagar o eliminar cualquiera
como cualquier otra fila, y el asistente pierde esa capacidad — sin Buscar
recursos responde a ciegas. Cuando un canal tiene más de 40 herramientas, estas
cinco son las que siempre se conservan.

Si el proyecto tiene una [base de datos](/es/docs/data/), el asistente también
recibe tres herramientas de datos. No están en el catálogo; mira
[las herramientas de datos del asistente](/es/docs/data/#las-herramientas-de-datos-del-asistente).

Después, agrega capacidades más allá de tu propio contenido — mira
[Gmail](/es/docs/tools/gmail/), [Slack](/es/docs/tools/slack/) o
[Búsqueda web](/es/docs/tools/web-search/).
