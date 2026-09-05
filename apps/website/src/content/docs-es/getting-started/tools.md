---
title: Herramientas
description: Enciende las acciones que tu IA puede ejecutar — conecta una integración, apúntala a tu propia API o escribe la herramienta tú.
order: 6
updated: 2026-09-05
---

Las **herramientas** son las acciones que tu asistente puede ejecutar por ti —
desde los ayudantes integrados para recursos hasta integraciones como Gmail, Slack
y Google Calendar. La página **Tools** tiene tres pestañas:
**[Funciones](/es/docs/tools/functions)** (código que escribes tú),
**[Endpoints HTTP](/es/docs/tools/http-endpoints)** (una API que ya tienes) y
**[Catálogo](/es/docs/tools/catalog)** (las integraciones que traemos). Esta
página trata de la última — es por donde empieza todo el mundo.

> **¿Quieres el panorama completo?** Esta es la versión rápida. La guía completa
> de **[Herramientas](/es/docs/tools)** documenta cada integración — Gmail,
> Outlook, Slack, calendarios, búsqueda web, GitHub, Notion — además de tus
> propios endpoints HTTP y funciones, una por una.

## Herramientas integradas

Todo proyecto arranca con cinco herramientas **integradas** ya instaladas — **List
Resources**, **Read Resource**, **Send Resource**, **Search Resources** y **List
Prompts** — para que tu asistente pueda trabajar con tu contenido de inmediato.
Están en el catálogo bajo **Built-in** y no necesitan conexión.

## Explora el catálogo

El **Catalog** lista cada integración que puedes agregar — Gmail, Outlook, Slack,
Google Calendar, Cal.com, búsqueda web, GitHub, Notion y más. Cada tarjeta muestra
cuántas de sus herramientas has activado (solo Gmail ofrece 18).

![El catálogo de Herramientas con tarjetas de integraciones como Gmail, Slack y Google Calendar](/images/catalog-tools.webp)

## Conecta una integración

Abre una integración para ver las herramientas que ofrece. La mayoría necesita una
conexión única — selecciona **Connect Gmail** (solo te conectas una vez para toda
la integración) y luego enciende únicamente las herramientas que quieras.

![La integración de Gmail con el botón Connect Gmail y sus herramientas individuales listadas](/images/tool-gmail.webp)

Una vez conectada, activa las herramientas que necesites — aquí, **Send Email**.
Cada herramienta que enciendes queda expuesta a tu asistente de inmediato. El
interruptor de una herramienta la apaga conservando su configuración;
**Disconnect** elimina la integración completa.

![Gmail conectado, con la herramienta Send Email activada](/images/tool-gmail-done.webp)

De vuelta en el catálogo, Gmail ahora aparece como **Connected** con tu conteo de
herramientas activas (`1/18`).

![El catálogo mostrando Gmail marcado como Connected con 1 de 18 herramientas activas](/images/tool-gmail-catalog.webp)

## Mantén la lista corta

Apagar una herramienta deja de exponerla pero conserva su configuración y su
conexión; **Remove** la borra por completo. Prefiere el interruptor — el esquema
de cada herramienta activa se le reenvía al modelo en cada llamada, así que una
lista larga cuesta tokens en cada turno y le complica la elección al modelo.

## Cuando el catálogo no lo cubre

Dos salidas de emergencia, en las otras dos pestañas, en orden de esfuerzo:

- **[Endpoints HTTP](/es/docs/tools/http-endpoints)** — describe una petición
  contra una API que ya tienes y se vuelve una herramienta con nombre. Sin código,
  y disponible en todos los planes.
- **[Funciones](/es/docs/tools/functions)** — escribe la herramienta tú en
  JavaScript cuando necesitas lógica y no una sola llamada: varios pasos, una
  transformación o combinar una credencial con un cálculo. La declaras y el editor
  escribe el esqueleto del handler con `ctx` completamente tipado; la pruebas
  contra conexiones reales antes de que nadie la vea, y luego la despliegas. Pro.

¿Prefieres trabajar en una terminal? **[La CLI `ganju`](/es/docs/tools/cli)** hace
lo mismo desde un repositorio — `ganju init`, `ganju login`, `ganju link`,
`ganju deploy` — además de pruebas, logs, rollback y despliegue desde CI.

Sigue con: decide dónde lo usa la gente — configura
[canales](/es/docs/getting-started/channels).
