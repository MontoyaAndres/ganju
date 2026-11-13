---
title: Herramientas
description: Activa las acciones que tu IA puede hacer — conecta una integración, apúntala a tu propia API o deja que el Asistente escriba una.
order: 6
updated: 2026-11-13
---

Las **herramientas** son las acciones que tu asistente puede hacer por ti —
desde los ayudantes de recursos integrados hasta integraciones como Gmail, Slack
y Google Calendar. Abre **Herramientas** en la barra lateral. La página tiene tres pestañas:

| Pestaña | Qué hay |
| --- | --- |
| **[Funciones](/es/docs/tools/functions/)** | Acciones propias escritas en código — por el [Asistente](/es/docs/assistant/) para ti, o por un desarrollador con el CLI. Pro. |
| **[Endpoints HTTP](/es/docs/tools/http-endpoints/)** | Una API que ya tienes, descrita una vez y convertida en una herramienta con nombre. Sin código. |
| **[Catálogo](/es/docs/tools/catalog/)** | Las integraciones que trae Ganju, más servidores MCP remotos como GitHub y Notion. |

Esta página trata del **Catálogo** — es donde todos empiezan.

> **¿Quieres el panorama completo?** Esta es la versión rápida. La guía completa
> de **[Herramientas](/es/docs/tools/)** documenta cada integración, herramienta
> por herramienta.

## Herramientas integradas

Todo proyecto empieza con cinco herramientas **Integradas** ya activadas —
**Listar recursos**, **Leer recurso**, **Enviar recurso**, **Buscar recursos** y
**Listar prompts** — para que tu asistente pueda trabajar con tu conocimiento
desde el principio. No necesitan conexión.

## Recorre el catálogo

El **Catálogo** lista cada integración que puedes agregar: Gmail, Outlook, Slack,
Búsqueda en Slack, Google Calendar, Cal.com, Búsqueda web, Integradas y
servidores MCP remotos. Cada tarjeta muestra cuántas de sus herramientas
activaste (solo Gmail ofrece 18). Usa **Buscar integraciones...** o los filtros
**Todas**, **Encendidas**, **Apagadas** y **Falta conectar** para acotar la
lista.

![Herramientas, pestaña Catálogo: la barra de herramientas expuestas, la búsqueda, los filtros y las tarjetas de integraciones](/images/tools-catalog.webp)

## Conecta una integración

1. Abre una integración para ver las herramientas que ofrece.
2. Selecciona **Conectar Gmail** (o **Conectar** más el nombre de la integración)
   e inicia sesión en esa cuenta. Solo conectas una vez para toda la
   integración. Algunas integraciones piden una clave en su lugar (**Agregar API
   key de …**).
3. Activa solo las herramientas que quieras — aquí, **Enviar correo**. Cada
   herramienta que activas queda disponible para tu asistente al instante.

![Gmail conectado: la etiqueta Conectado, Desconectar y cada herramienta con su interruptor](/images/tool-gmail-enabled.webp)

De vuelta en el catálogo, Gmail ahora aparece como **Conectado** con tu número de
herramientas activadas (`1/18 herramientas activadas`).

## Encendida, apagada o eliminada

- El **interruptor** apaga una herramienta pero conserva su configuración y su
  conexión — la fila dice **Apagada · conserva su configuración**.
- **Eliminar** borra una herramienta y su configuración.
- **Desconectar** quita la conexión de toda la integración.

Prefiere el interruptor. La descripción de cada herramienta activada se le
reenvía al modelo en cada turno, así que una lista larga cuesta más y le hace más
difícil elegir. El contador de arriba muestra cuántas herramientas están
expuestas de un máximo de **40** — pasado eso, los canales dejan de enviar las
que sobran. La [Salud de las herramientas](/es/docs/analytics/#salud-de-las-herramientas)
del Inicio lista las que nadie usó en 30 días, con un botón **Desactivar**.

## Límites

| | Free | Pro / Enterprise |
| --- | --- | --- |
| Herramientas por proyecto | 7 (incluidas las integradas) | Ilimitadas |
| Endpoints HTTP por proyecto | 3 | Ilimitados |
| Funciones | — | ✓ |

## Cuando el catálogo no alcanza

- **Pídeselo al [Asistente](/es/docs/assistant/)** (Pro). Describe qué debe hacer
  el bot; escribe la acción, la prueba y la activa con tu clic. Las acciones que
  escribe aparecen en **Funciones**, donde puedes leerlas — para agregar o
  cambiar una, pídeselo al Asistente.
- **[Endpoints HTTP](/es/docs/tools/http-endpoints/)** — describe una solicitud a
  una API que ya tienes y se convierte en una herramienta con nombre. Sin código,
  y está en todos los planes.
- **Los desarrolladores** escriben funciones en un repositorio y las publican con
  el [`ganju` CLI](/es/docs/tools/cli/):

```bash
ganju init mis-herramientas   # crea un proyecto que se despliega tal cual
cd mis-herramientas
ganju login
ganju link                    # elige la organización y el proyecto
ganju deploy                  # empaqueta, sube y publica
```

Una versión subida desde el CLI se ve en **Funciones** solo para leer; se cambia
en el repositorio, con `ganju deploy`.

Sigue con: decide dónde la usa la gente — configura los
[canales](/es/docs/getting-started/channels/).
