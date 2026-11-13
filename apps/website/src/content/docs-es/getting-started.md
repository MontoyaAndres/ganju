---
title: Primeros pasos
description: "Siete páginas cortas te llevan de no tener cuenta a un bot que le responde a gente real en Telegram, WhatsApp, Slack o Discord. Todo funciona en el plan Free."
order: 1
updated: 2026-11-13
---

## Cómo encajan las piezas

Un **proyecto** de Ganju es un bot. La gente llega a él por un **canal** (o
desde una app de IA como Claude, con la [URL de MCP](/es/docs/mcp/) del
proyecto), y en cada mensaje el bot puede usar tres cosas que tú le das:

| Pieza | Qué le da al bot | Dónde está en la app | Paso |
| --- | --- | --- | --- |
| **Prompts** | Pedidos listos que la gente ejecuta como comandos, como `/start`. | Conocimiento → Prompts | 3 |
| **Recursos** | Tus archivos, carpetas de Drive y sitios web, para responder con ellos en vez de adivinar. | Conocimiento → Recursos | 4 |
| **Acciones** | Lo que puede hacer: enviar un correo, agendar una reunión, buscar en la web, llamar a tu API. | Acciones | 5 |

Las **instrucciones del bot**, en la página de Canales, definen su tono y sus
reglas, y la **Configuración** guarda el plan, los miembros y los modelos de
toda la organización.

![El Inicio de un proyecto: la URL de MCP, la gráfica de Actividad por canal y los contadores de Recursos, Herramientas y Prompts](/images/project-home.webp)

## El atajo: el Asistente

En **Pro** y **Enterprise**, un proyecto nuevo abre con una tarjeta en su
Inicio: **Arma tu bot con el Asistente**. Selecciona **Abrir el Asistente** y
cuéntale con tus palabras qué debe hacer tu bot: "que responda con mi menú",
"que tome pedidos y me los mande por correo". Escribe las acciones, las prueba y
te pregunta antes de activar nada. Igual puedes seguir los pasos de arriba a
mano cuando quieras; son los mismos bloques que usa el Asistente. Mira
**[Asistente](/es/docs/assistant/)**.

## Qué necesitas

- Una cuenta de Google o GitHub para iniciar sesión.
- Para un canal, una cuenta en esa plataforma (un bot de Telegram toma dos
  minutos).
- Nada que instalar. Los desarrolladores que quieran escribir acciones en código
  pueden sumar después el [`ganju` CLI](/es/docs/tools/cli/):

```bash
npm install -g @ganju/cli
```

## Free y Pro, en estos pasos

Todo lo de esta guía funciona en Free. Pro sube los límites y suma el
Asistente:

| | Free | Pro / Enterprise |
| --- | --- | --- |
| Prompts por proyecto | 3 | Ilimitados |
| Contenido consultable | 5 MB | 1 GB incluido |
| Herramientas encendidas a la vez | 7 | 40 |
| Endpoints HTTP por proyecto | 3 | Ilimitados |
| Canales por proyecto | 1 | Ilimitados |
| Respuestas del bot al mes | 100, luego se pausa | 3.000 incluidas, luego se cobran |
| Asistente, funciones y Datos | No | Sí |
| Invitar a tu equipo | No | Sí |

Los precios y la comparación completa están en
[Configuración → Comparar planes](/es/docs/settings/#compara-los-planes).

## Profundiza

Las páginas de arriba son el camino rápido. Cuando quieras ampliar lo que puede
hacer tu asistente, cada bloque tiene una guía más completa:

- **[Organizaciones y proyectos](/es/docs/organizations-and-projects/)**: la
  estructura de organización y proyecto, el selector, y cómo tener Free y Pro
  lado a lado.
- **[Asistente](/es/docs/assistant/)**: construye describiendo, con créditos en
  los planes de pago.
- **[Prompts](/es/docs/prompts/)**: plantillas de varios turnos, variables
  tipadas y edición como JSON.
- **[Recursos](/es/docs/resources/)**: Google Drive, OneDrive, rastreo de sitios
  web y subidas, con búsqueda semántica, citas y sincronización.
- **[Datos](/es/docs/data/)**: una base de datos por proyecto, con
  disparadores y programaciones.
- **[Acciones](/es/docs/tools/)**: el catálogo completo más tus propios
  [endpoints HTTP](/es/docs/tools/http-endpoints/) y
  [funciones](/es/docs/tools/functions/), y el
  [`ganju` CLI](/es/docs/tools/cli/) que las publica.
- **[Canales](/es/docs/channels/)**: la configuración de Telegram, WhatsApp,
  Slack y Discord, plataforma por plataforma.
- **[Clientes MCP](/es/docs/mcp/)**: conecta Claude, ChatGPT, Cursor o VS Code
  al mismo proyecto.
- **[Analítica](/es/docs/analytics/)**: lo que te dice el panel de Inicio.
- **[Configuración](/es/docs/settings/)**: planes y facturación, miembros,
  tokens de acceso y cómo traer tu propio modelo.
