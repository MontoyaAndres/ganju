---
title: Primeros pasos
description: Un resumen de la guía de configuración — inicia sesión, arma tu proyecto y comparte tu IA, una página corta a la vez.
order: 1
updated: 2026-11-13
---

Primeros pasos te guía para configurar Ganju desde cero, con una página corta por
paso. Síguelas en orden la primera vez, o salta a la parte que necesites. Esto es
lo que cubre cada página:

1. **[Iniciar sesión](/es/docs/getting-started/sign-in/)** — crea tu cuenta con
   Google o GitHub y acepta una invitación si tienes una.
2. **[Crear una organización y un proyecto](/es/docs/getting-started/organization-and-project/)**
   — configura tu equipo y tu primer espacio de trabajo, y aprende a moverte por
   el proyecto.
3. **[Prompts](/es/docs/getting-started/prompts/)** — plantillas reutilizables
   que se convierten en comandos en tus canales.
4. **[Recursos](/es/docs/getting-started/resources/)** — agrega los archivos,
   sitios web y carpetas de Drive que tu IA puede consultar.
5. **[Herramientas](/es/docs/getting-started/tools/)** — activa las acciones que
   tu IA puede hacer, como correo, calendario y búsqueda web.
6. **[Canales](/es/docs/getting-started/channels/)** — ofrece tu IA en Telegram,
   WhatsApp, Slack o Discord, y dile cómo responder.
7. **[Configuración](/es/docs/getting-started/settings/)** — gestiona miembros,
   el plan y la facturación, y el modelo con el que funciona tu IA.

Al terminarlas tendrás un asistente en vivo respondiendo a personas reales en un
canal.

> Cada elemento de arriba es su propia página en la barra lateral, bajo
> **Primeros pasos**. ¿Eres nuevo? Empieza por
> **[Iniciar sesión](/es/docs/getting-started/sign-in/)**.

## El atajo: el Asistente

En **Pro** y **Enterprise**, un proyecto nuevo abre con una tarjeta en su
Inicio: **Arma tu bot con el Asistente**. Selecciona **Abrir el Asistente** y
cuéntale con tus palabras qué debe hacer tu bot — "que responda con mi menú",
"que tome pedidos y me los envíe por correo". Escribe las acciones, las prueba y
te pregunta antes de activar nada. Igual puedes seguir los pasos de abajo a mano
cuando quieras; son los mismos bloques que usa el Asistente. Mira
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

## Profundiza

Las páginas de arriba son el camino rápido. Cuando quieras ampliar lo que puede
hacer tu asistente, cada bloque tiene una guía más completa:

- **[Organizaciones y proyectos](/es/docs/organizations-and-projects/)** — la
  estructura de organización y proyecto, el selector, y cómo tener Free y Pro
  lado a lado.
- **[Asistente](/es/docs/assistant/)** — construye describiendo, con créditos en
  los planes de pago.
- **[Prompts](/es/docs/prompts/)** — plantillas de varios turnos, variables
  tipadas y edición como JSON.
- **[Recursos](/es/docs/resources/)** — Google Drive, OneDrive, rastreo de sitios
  web y subidas, con búsqueda semántica, citas y sincronización.
- **[Datos](/es/docs/data/)** — una base de datos por proyecto, con
  disparadores y programaciones.
- **[Herramientas](/es/docs/tools/)** — el catálogo completo más tus propios
  [endpoints HTTP](/es/docs/tools/http-endpoints/) y
  [funciones](/es/docs/tools/functions/), y el
  [`ganju` CLI](/es/docs/tools/cli/) que las publica.
- **[Canales](/es/docs/channels/)** — la configuración de Telegram, WhatsApp,
  Slack y Discord, plataforma por plataforma.
- **[Clientes MCP](/es/docs/mcp/)** — conecta Claude, ChatGPT, Cursor o VS Code
  al mismo proyecto.
- **[Analítica](/es/docs/analytics/)** — lo que te dice el panel de Inicio.
- **[Configuración](/es/docs/settings/)** — planes y facturación, miembros,
  tokens de acceso y cómo traer tu propio modelo.
