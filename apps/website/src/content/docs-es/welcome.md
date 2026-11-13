---
title: Bienvenido
description: Conecta tu IA con tus archivos, herramientas y apps, y luego ofrécesela a quien quieras por los canales que ya usa.
order: 0
updated: 2026-11-13
---

Bienvenido a la documentación de Ganju. Ganju conecta asistentes de IA como
Claude, ChatGPT y Gemini con tus propios archivos, herramientas y aplicaciones,
sin servidores que administrar y sin escribir código.

Después te deja **ofrecer esa IA a quien quieras** (clientes, tu equipo o
personas específicas) por los canales que ya usan: Telegram, WhatsApp, Slack y
Discord. Un solo espacio de trabajo, disponible en todas partes.

Estas guías te llevan de un espacio de trabajo en blanco a un asistente en vivo
que puedes compartir con cualquiera.

## Cómo está organizada la app

Todo pasa dentro de un **proyecto**: un bot, con su propio conocimiento, sus
acciones y sus canales. La barra lateral de un proyecto siempre tiene las mismas
secciones:

| Sección | Para qué sirve |
| --- | --- |
| **Inicio** | El panel del proyecto: su URL de MCP, la actividad, la salud de las herramientas y la actividad reciente. |
| **Asistente** | Describe con tus palabras qué debe saber o hacer tu bot, y lo construye contigo. Pro y Enterprise. |
| **Conocimiento** | Lo que sabe tu bot: la pestaña **Recursos** (archivos, sitios web, carpetas de Drive) y la pestaña **Prompts** (plantillas reutilizables). |
| **Datos** | La base de datos propia del proyecto: tablas que tu bot lee y escribe. Pro y Enterprise. |
| **Acciones** | Lo que puede hacer tu bot: el **Catálogo** de integraciones, los **Endpoints HTTP** y las **Funciones**. |
| **Canales** | Donde la gente habla con él (Telegram, WhatsApp, Slack, Discord), más las **Instrucciones del bot** que comparten todos. |

**Ajustes** (desde el menú de tu avatar) pertenece a la organización: el plan y
la facturación, los miembros, los proyectos, tus propios modelos y los tokens de
acceso.

![El Inicio del proyecto y el menú lateral: Inicio, Asistente, Conocimiento, Datos, Herramientas y Canales](/images/project-home.webp)

## Empieza aquí

- **[Primeros pasos](/es/docs/getting-started/)**: inicia sesión, crea tu
  primera organización y tu primer proyecto, y pon un bot a responder en un canal
  en pocos minutos.
- **[Organizaciones y proyectos](/es/docs/organizations-and-projects/)**: cómo
  está estructurado Ganju: una organización para tu equipo y la facturación, y un
  proyecto por asistente.

## Explora lo que Ganju puede hacer

Una vez configurado, estas guías profundizan en cada capacidad: los bloques que
combinas para definir exactamente qué sabe tu asistente, qué hace y dónde vive:

- **[Asistente](/es/docs/assistant/)**: describe qué debe saber o hacer tu bot,
  y él escribe las acciones, las prueba y las activa cuando das clic. Se cobra en
  créditos en los planes de pago.
- **[Prompts](/es/docs/prompts/)**: plantillas reutilizables de varios turnos con
  variables tipadas que se convierten en **comandos** en cada canal.
- **[Recursos](/es/docs/resources/)**: apoya tu IA en tu propio conocimiento:
  importa desde Google Drive u OneDrive, rastrea un sitio web o sube archivos,
  todo consultable y con citas.
- **[Datos](/es/docs/data/)**: dale a un proyecto su propia base de datos:
  tablas que el asistente y tus funciones leen y escriben, con disparadores que
  se ejecutan cuando cambian las filas.
- **[Acciones](/es/docs/tools/)**: deja que actúe: correo (Gmail, Outlook),
  Slack, calendarios (Google, Cal.com), búsqueda web, servidores MCP remotos como
  GitHub y Notion, o tus propias APIs HTTP.
- **[Funciones](/es/docs/tools/functions/)**: acciones propias en código. En la
  app, el Asistente las escribe por ti y tú puedes leerlas; los desarrolladores
  las escriben y las publican desde un repositorio.
- **[`ganju` CLI](/es/docs/tools/cli/)**: el lado del desarrollador. Compila,
  despliega, prueba, lee logs, vuelve atrás, maneja los datos del proyecto y
  publica desde CI.
- **[Canales](/es/docs/channels/)**: llévala a personas reales en Telegram,
  WhatsApp, Slack y Discord, con la configuración paso a paso de cada uno.
- **[Clientes MCP](/es/docs/mcp/)**: conecta el mismo asistente a Claude, ChatGPT,
  Cursor o VS Code con una sola URL.
- **[Analítica](/es/docs/analytics/)**: la actividad en el tiempo, la salud de
  las herramientas con cada llamada detrás, las herramientas sin uso y un flujo
  de actividad reciente.
- **[Configuración](/es/docs/settings/)**: administra tu plan y tu facturación,
  invita a tu equipo, trae tu propio modelo de lenguaje y crea tokens de acceso
  para CI.
- **[Instálalo tú mismo](/es/docs/deploy/)**: Ganju es software libre
  (Apache-2.0); corre tu propia instancia sobre Cloudflare y Postgres.

## Los planes de un vistazo

Empezar en Ganju es gratis. **Free** te da un proyecto con un cupo mensual
pequeño de respuestas; **Pro** (29 USD/mes) levanta los límites y suma el
Asistente, Datos, Funciones, miembros del equipo y tus propios modelos. Mira
[Configuración → Compara los planes](/es/docs/settings/#compara-los-planes) para
ver cada número.

> Cada página de este sitio también está disponible como Markdown: solo agrega
> `.md` a la URL (estás leyendo
> [`/es/docs/welcome.md`](/es/docs/welcome.md)). Consulta
> [`/llms.txt`](/llms.txt) para ver el índice completo.
