---
title: Búsqueda web
description: Busca en la web en vivo y lee el contenido completo de las páginas, con tecnología de Tavily.
order: 46
updated: 2026-07-07
---

La integración de **Búsqueda web** le da a tu asistente acceso a la web en vivo, con
tecnología de **Tavily** — para que pueda responder con datos actuales y citar
fuentes cuando la respuesta no está en tus recursos. Ofrece **2 herramientas**.

## Conéctala

La búsqueda web usa una **llave de API** (Tavily). Pega tu llave una sola vez al
agregar la integración.

## Herramientas

- **Web Search** — busca en la web en vivo y devuelve los mejores resultados
  (título, URL y un fragmento), además de una respuesta sintetizada cuando está
  disponible. Úsala para información actual — noticias, precios, lanzamientos — o
  para verificar una afirmación. Define `topic` como `"news"` con una ventana `days`
  opcional para eventos recientes. El asistente debería citar las URLs en las que se
  apoya.
- **Web Extract** — trae el texto completo y limpio de una o varias páginas
  específicas por su URL. Úsala después de una búsqueda (o cuando el usuario dé un
  enlace) para leer una página a fondo en lugar de quedarte con el fragmento corto.
  Las páginas que no se pueden traer se reportan aparte.

El flujo típico es Web Search para encontrar fuentes → Web Extract para leer
completas las más relevantes.
