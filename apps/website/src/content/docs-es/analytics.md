---
title: Analítica
description: El panel de Inicio de cada proyecto muestra lo que hace tu asistente — la actividad en canales y clientes MCP, la salud de las herramientas con las llamadas detrás de cada número, las herramientas sin uso, los disparadores de datos y un flujo de actividad reciente.
order: 6
updated: 2026-11-13
---

Cada proyecto abre en su panel de **Inicio** — selecciona **Inicio** arriba en la
barra lateral. Ahí ves cómo se usa de verdad tu asistente: la actividad en el
tiempo, cómo le va a cada herramienta, qué no se está usando y quién hizo qué.

## Por qué importa

- **Mira el uso real, no suposiciones.** Sigue las conversaciones por día y nota
  cuándo tu asistente está ocupado — o tranquilo.
- **Sabe qué canales y clientes importan.** Cada [canal](/es/docs/channels/) y
  cada [cliente MCP](/es/docs/mcp/) es su propia línea, así sabes de dónde viene
  tu tráfico.
- **Detecta a tiempo las herramientas rotas.** La salud de las herramientas
  muestra errores, llamadas lentas y al modelo equivocándose con las entradas de
  una herramienta — con cada llamada a un clic.
- **Mantén corta la lista de herramientas.** Las que nadie usó en 30 días
  aparecen con un botón **Desactivar**.

## Qué hay en Inicio

De arriba hacia abajo:

1. El nombre y la descripción del proyecto, y su **URL de MCP** (mira
   [Clientes MCP](/es/docs/mcp/)).
2. **Arma tu bot con el Asistente** — solo en un proyecto Pro o Enterprise
   recién creado.
3. **Actividad** — la gráfica.
4. Tres contadores: **Recursos**, **Herramientas**, **Prompts**.
5. **Salud de las herramientas** — llamadas, errores y latencia por herramienta,
   más los errores, las secciones de datos y las herramientas sin uso.
6. **Actividad reciente** — un flujo de ejecuciones individuales.

## Actividad

La tarjeta **Actividad** grafica las conversaciones por día en tus canales y apps
conectadas — incluidos los mensajes que entran. Cambia el rango entre **7d**,
**30d** y **90d**, y la vista entre **Líneas**, **Área** y **Barras**. Cada canal
y cada cliente MCP tiene su propia serie en la leyenda (con su total del rango);
haz clic en una entrada de la leyenda para ocultarla o mostrarla.

> Solo las **respuestas** de tu bot cuentan para la facturación — los mensajes
> que entran en esta gráfica son gratis. Mira
> [Configuración → Facturación y plan](/es/docs/settings/#facturación-y-plan).

![El Inicio del proyecto: URL MCP, la gráfica de Actividad por canal y los contadores de Recursos, Herramientas y Prompts](/images/project-home.webp)

## Contadores

Debajo de la gráfica, tres tarjetas resumen lo que tiene el proyecto y cuánto se
usa — cada una lleva directo a su sección:

- **Recursos** — cuántos tienes, el tamaño total almacenado y cuántas lecturas.
- **Herramientas** — cuántas están activadas y cuántas llamadas recibieron.
- **Prompts** — cuántos definiste y cuántas veces se ejecutaron.

## Salud de las herramientas

**Salud de las herramientas** muestra cómo le fue a cada herramienta en el rango
elegido, tanto en clientes MCP como en bots de canales. Una fila por
herramienta:

| Columna | Qué significa |
| --- | --- |
| **Herramienta** | El nombre de la herramienta. **Apagada** si está apagada ahora; **No está en este servidor** si ya ninguna herramienta se llama así (se eliminó, o el modelo se la inventó). |
| **Llamadas** | Cuántas veces se llamó. |
| **Errores** | Cuántas de esas fallaron. |
| **p95** | El 95 % de las llamadas terminó en menos de este tiempo. |
| **Último uso** | Cuándo se llamó por última vez. |
| **Señales** | Pistas de que al modelo le cuesta usarla — mira abajo. |

Las **Señales**:

- **argumentos inválidos** — llamadas cuyos argumentos no coincidían con el
  esquema de entrada de la herramienta. Describir mejor las entradas suele
  resolverlo.
- **reintentos** — se volvió a llamar justo después de fallar, o con los mismos
  argumentos.
- **abandonos** — después de que esta herramienta falló, el modelo llamó a otra
  en su lugar.

![Salud de las herramientas: llamadas, errores, p95 y último uso por herramienta, errores más comunes y tablas sincronizadas desde una hoja de cálculo](/images/home-tool-health.webp)

### Entra a una llamada

Haz clic en una herramienta para ver **Llamadas a …**, filtradas por **Todas** o
**Errores** (con **Cargar más**). Haz clic en una llamada para verla completa: de
dónde vino (el bot de un canal o un **Cliente MCP**), sus **Argumentos**, su
**Resultado** o **Error**, o **Rechazada antes de ejecutarse**. Desde ahí:

- **Abrir la sesión** lista cada llamada a herramientas, prompt y lectura de
  recursos de esa sesión, de la más antigua a la más reciente.
- **Abrir la conversación** salta a la conversación del canal donde ocurrió la
  llamada.

### Más secciones en la salud de las herramientas

Debajo de la tabla, la salud de las herramientas agrega lo que aplique al
proyecto:

- **Errores más comunes** — los errores más vistos en el rango, con cuántas
  veces pasó cada uno.
- **Sugerencias de índices** — para proyectos con [Datos](/es/docs/data/): una
  columna por la que las consultas filtran u ordenan una y otra vez, leyendo
  muchas filas para devolver pocas ("Un índice ayudaría"), o un índice que
  ninguna consulta usó en 30 días.
- **Tablas sincronizadas desde una hoja de cálculo** — cada tabla sincronizada,
  su archivo de origen y cuándo se sincronizó por última vez (o si fue
  rechazada).
- **Disparadores de la base de datos** — cada
  [disparador](/es/docs/data/triggers/) con sus **Ejecuciones**, **Fallidas**,
  **p95**, **Última ejecución** y cuántos eventos omitió (el disparador estaba
  apagado o eliminado, o el plan ya no incluye Datos). Haz clic en uno para ver
  sus ejecuciones.
- **Sin uso en 30 días** — herramientas activadas que no se llamaron ni una vez
  en 30 días (herramientas integradas, servidores MCP, funciones, endpoints
  HTTP). Cada herramienta activada se envía al modelo en cada turno, así que
  selecciona **Desactivar** para apagar una. Puedes volver a activarla desde
  **Herramientas**. En Free, si el proyecto está en su límite de herramientas, la
  confirmación te avisa que tendrás que apagar otra antes de volver a activar
  esta.

## Actividad reciente

El flujo de **Actividad reciente** es un registro continuo de eventos — quién
**leyó** un recurso, **ejecutó** una herramienta o **usó** un prompt, de qué
origen vino (un canal como Telegram, o un cliente MCP) y cuándo. Es la forma más
rápida de confirmar que tu asistente hace lo que esperas.

![El feed de Actividad reciente: quién ejecutó o leyó qué, desde qué canal y cuándo](/images/home-recent-activity.webp)

## Otros lugares donde mirar

- **Canales → un canal → Conversaciones** — cada intercambio en ese canal, con
  las herramientas y los recursos que usó cada respuesta. Mira
  [Canales](/es/docs/channels/).
- **Ajustes → Plan y facturación** — respuestas, almacenamiento, llamadas a tus
  funciones, créditos del Asistente y uso de Datos de toda la organización. Mira
  [Configuración](/es/docs/settings/#facturación-y-plan).
- **El CLI** — las llamadas recientes a tus propias funciones, con su salida de
  `ctx.log`:

```bash
ganju logs                       # las últimas 20 llamadas
ganju logs --tool lookup-order   # solo esta
ganju logs --limit 100
ganju logs --follow              # sigue esperando llamadas nuevas
```

## Cuánto tiempo se guarda

Los argumentos y resultados de las llamadas a herramientas se guardan 90 días, el
historial de conversaciones de los canales 365 días, y los registros de "quién
ejecutó qué y cuándo" detrás de la Actividad reciente, 365 días.
