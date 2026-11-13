---
title: Crear una organización y un proyecto
description: Configura tu equipo y tu primer espacio de trabajo, y aprende a moverte por un proyecto.
order: 3
updated: 2026-11-13
minutes: 3
outcome: "Una organización, tu primer proyecto, y ya sabes moverte por su Inicio."
---

Tu **organización** representa a tu equipo o empresa: ahí viven los miembros, la
facturación y los proyectos. Dentro de ella, cada **proyecto** es un espacio de
trabajo independiente para un bot, con su propio conocimiento, datos,
herramientas, canales y URL de MCP.

## Crea tu organización

La primera vez que inicias sesión, Ganju muestra **Crea tu organización** y
configura la organización y su primer proyecto a la vez:

1. En **Organización**, escribe un **Nombre** (tu equipo o empresa). Puedes
   cambiarlo después.
2. En **Proyecto**, escribe el **Nombre** del proyecto y, si quieres, una
   **Descripción** de para qué es el bot.
3. Selecciona **Crear organización**.

Los nombres necesitan al menos 3 caracteres (100 como máximo); una descripción
puede tener hasta 500.

![El formulario Crea tu organización, con campos para el nombre de la organización, el nombre del proyecto y su descripción](/images/new-org-project.webp)

Toda organización nueva empieza en el plan **Free**, con un proyecto. Mira
[Configuración → Compara los planes](/es/docs/settings/#compara-los-planes) para
ver lo que suma Pro.

## El Inicio de tu proyecto

Llegas al **Inicio** del proyecto. Arriba: el nombre y la descripción del
proyecto, y su **URL de MCP**, la dirección a la que se conectan clientes de IA
como Claude (mira [Clientes MCP](/es/docs/mcp/)). Debajo: la gráfica de
**Actividad**, los contadores de **Recursos**, **Herramientas** y **Prompts**, la
**Salud de las herramientas** y la **Actividad reciente**, todo explicado en
[Analítica](/es/docs/analytics/).

En Pro y Enterprise, un proyecto recién creado también muestra **Arma tu bot con
el Asistente** con un botón **Abrir el Asistente**. La tarjeta desaparece cuando
el proyecto tiene recursos, prompts, canales o herramientas además de las
integradas.

## Muévete por el proyecto

La barra lateral es igual en todos los proyectos:

| Elemento | Qué haces ahí |
| --- | --- |
| **Inicio** | Mira la actividad y la salud; copia la URL de MCP. |
| **Asistente** | Describe qué debe hacer el bot y deja que lo construya (Pro y Enterprise; en Free aparece bloqueado, con la opción de mejorar el plan). |
| **Conocimiento** | Dos pestañas: **Recursos** (archivos, sitios web, Google Drive, OneDrive) y **Prompts** (plantillas que se vuelven comandos). |
| **Datos** | Las tablas del proyecto (Pro y Enterprise). |
| **Acciones** | La página **Acciones**, con tres pestañas: **Funciones**, **Endpoints HTTP** y **Catálogo**. |
| **Canales** | Conecta Telegram, WhatsApp, Slack o Discord, y define las **Instrucciones del bot**. |

El ícono de cuadrícula arriba en la barra abre **Organizaciones y proyectos**,
para cambiar de proyecto o crear uno nuevo. Mira
[Organizaciones y proyectos](/es/docs/organizations-and-projects/).

## Herramientas integradas

Todo proyecto empieza con cinco herramientas integradas ya activadas
(**Listar recursos**, **Leer recurso**, **Enviar recurso**, **Buscar recursos** y
**Listar prompts**) para que tu bot pueda trabajar con tu conocimiento desde el
principio. Ese es el **5** del contador de Herramientas. No necesitan conexión, y
cuentan para el límite de 7 herramientas por proyecto del plan Free.

![La integración Integradas con sus cinco herramientas encendidas](/images/tools-catalog-builtin.webp)

## Invita a tu equipo

Los miembros pertenecen a la organización, y cada proyecto tiene además su propia
lista de miembros. Invitar es una función de **Pro**:

- Desde **Organizaciones**, selecciona **Invitar** en la tarjeta de la
  organización, escribe un **Correo electrónico** y selecciona **Enviar
  invitación**.
- O abre **Ajustes → Miembros** (toda la organización) o **Ajustes → Proyectos →
  Miembros** (solo un proyecto).

Reciben un correo y aceptan cuando inician sesión con esa dirección. Detalles en
[Configuración → Miembros](/es/docs/settings/#miembros).

## Usar el CLI con este proyecto

Si un desarrollador va a escribir acciones en código, apunta un repositorio a
esta organización y este proyecto una sola vez:

```bash
ganju login
ganju link                                   # elige la organización y el proyecto
ganju link --organization "Acme" --project "Bot de soporte"   # o sáltate las preguntas
ganju link --status                          # a qué está vinculada esta carpeta
```

`--organization` y `--project` aceptan un nombre o un id. Mira la
[guía del CLI](/es/docs/tools/cli/).
