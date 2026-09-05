---
title: Herramientas
description: Dale a tu IA la capacidad de actuar — integraciones como Gmail, Outlook, Slack y Calendar, tus propias APIs HTTP y funciones que escribes tú.
order: 4
updated: 2026-09-05
---

Las **herramientas** son las acciones que tu asistente puede ejecutar por ti.
Mientras los [recursos](/es/docs/resources) le dejan *leer* tu conocimiento, las
herramientas le dejan *hacer* cosas — enviar un correo, publicar en Slack, agendar
una reunión, buscar en la web en vivo o llamar a tu propia API. Todo proyecto viene
con un conjunto de herramientas integradas, y agregas más cuando las necesites.

## Tres formas de agregar una

La página **Tools** tiene tres pestañas, que corresponden a las tres cosas que
puedes poner en tu servidor:

| Pestaña | Qué es | Plan |
| --- | --- | --- |
| **[Funciones](/es/docs/tools/functions)** | Código que escribes tú. Lógica de varios pasos, transformaciones, cualquier cosa que combine una credencial con un cálculo. | Pro |
| **[Endpoints HTTP](/es/docs/tools/http-endpoints)** | Una petición contra una API que ya tienes, descrita en un formulario. Sin código. | Todos los planes |
| **[Catálogo](/es/docs/tools/catalog)** | Las integraciones que traemos y mantenemos — conecta una cuenta y enciende las herramientas que quieras. | Todos los planes |

Empieza por el catálogo. Si tu caso está cubierto ahí, conectar una cuenta es todo
el trabajo. Si no lo está, un endpoint HTTP es el camino más corto a tu propia API,
y una función es a lo que recurres cuando una sola petición no alcanza.

## Por qué usar herramientas

- **Pasa de responder a actuar.** Tu IA no solo contesta — agenda la reunión, envía
  el seguimiento y crea el ticket.
- **Conecta una vez, reutiliza en todas partes.** Autoriza una integración una sola
  vez y cada herramienta activada funciona en todos tus canales vinculados y
  clientes MCP.
- **Activa solo lo que necesites.** Enciende las herramientas una por una, para que
  el asistente pueda hacer exactamente lo que le permitas — y nada más.
- **Trae tu propia API.** Agrega un endpoint HTTP personalizado o conecta el
  servidor MCP remoto de un proveedor para exponer servicios que no traemos de
  fábrica.

## Cómo funciona una herramienta

Por debajo, tu proyecto es un **servidor MCP** — y una herramienta es simplemente
una función que ese servidor expone a cualquier IA conectada. El flujo siempre es
el mismo:

1. **Activas una herramienta.** Se agrega al conjunto de herramientas de tu
   asistente y se le describe al modelo — su nombre, qué hace y qué entradas
   espera.
2. **Conectas la integración una vez.** Las herramientas que tocan una cuenta
   externa (Gmail, Slack, Calendar…) necesitan acceso. Autorizas la integración una
   sola vez — con OAuth o una llave de API — y Ganju guarda la credencial de forma
   segura y la renueva automáticamente. Las herramientas integradas no necesitan
   conexión.
3. **El modelo decide llamarla.** Cuando alguien hace una solicitud en un canal o
   cliente, el modelo lee las herramientas disponibles y, si alguna encaja, la
   llama con los argumentos correctos — sin que tú escribas código.
4. **Ganju la ejecuta y devuelve el resultado.** La llamada corre con tus
   credenciales guardadas, limitada solo a los permisos que esa herramienta
   necesita, y el resultado vuelve al modelo para terminar la respuesta o
   completar la acción. Cada llamada se registra en tu consumo.

## Herramientas por defecto

Todo proyecto arranca con cinco herramientas **integradas** ya instaladas, para que
tu asistente pueda trabajar con tus [recursos](/es/docs/resources) y
[prompts](/es/docs/prompts) desde el primer día — sin necesidad de conexión:

- **List Resources** — lista cada recurso disponible para este asistente.
- **Read Resource** — lee el contenido de un recurso guardado.
- **Send Resource** — entrega un recurso al usuario como adjunto en el chat.
- **Search Resources** — encuentra los recursos más relevantes para una pregunta
  usando búsqueda semántica.
- **List Prompts** — lista los prompts y comandos que expone este asistente, y cómo
  ejecutarlos en el canal actual.

## Encender y apagar herramientas

Cada herramienta tiene un interruptor y un borrar, y hacen cosas distintas.
**Apagar** deja de exponer la herramienta pero conserva su configuración y su
conexión; **Eliminar** borra la fila y se lleva los ajustes. Apagar una
herramienta libera un espacio en el conteo de tu plan, así que puedes rotar entre
más de las que expones a la vez.

Mantén la lista corta a propósito. El esquema de cada herramienta activa se le
reenvía al modelo en cada llamada, así que una lista larga cuesta tokens en cada
turno y le complica la elección al modelo. Los canales la limitan a 40 por esa
razón.

## Herramientas disponibles

Cada integración tiene su propia página que cubre qué hace, cómo conectarla y todas
las herramientas que ofrece:

- **[Integradas](/es/docs/tools/built-in)** — las cinco herramientas base de
  recursos y prompts que trae todo proyecto.
- **[Gmail](/es/docs/tools/gmail)** — envía, lee, busca y administra correo (18
  herramientas).
- **[Outlook](/es/docs/tools/outlook)** — correo de Microsoft 365 vía Graph (18
  herramientas).
- **[Slack](/es/docs/tools/slack)** — publica mensajes, navega canales y sube
  archivos.
- **[Búsqueda en Slack](/es/docs/tools/slack-search)** — búsqueda de mensajes en
  todo el espacio de trabajo (conexión aparte con token de usuario).
- **[Google Calendar](/es/docs/tools/google-calendar)** — crea y administra eventos
  y encuentra espacios libres.
- **[Cal.com](/es/docs/tools/calcom)** — consulta disponibilidad y agenda o cancela
  reuniones.
- **[Búsqueda web](/es/docs/tools/web-search)** — busca en la web en vivo y extrae
  el contenido de las páginas, con tecnología de Tavily.
- **[GitHub](/es/docs/tools/github)** — conecta el servidor MCP remoto oficial de
  GitHub para repos, issues y pull requests.
- **[Notion](/es/docs/tools/notion)** — conecta el servidor MCP remoto oficial de
  Notion para buscar y actualizar páginas y bases de datos.
- **[Saludo](/es/docs/tools/greeting)** — una herramienta de demostración diminuta
  para probar un servidor nuevo.

Y las dos que construyes tú:

- **[Endpoints HTTP](/es/docs/tools/http-endpoints)** — expón tus propias APIs como
  herramientas con nombre, sin código.
- **[Funciones](/es/docs/tools/functions)** — escribe tus propias herramientas en
  JavaScript, desde el navegador o con la **[CLI `ganju`](/es/docs/tools/cli)**.

Sigue con: decide dónde usa la gente tu asistente — configura
[canales](/es/docs/getting-started/channels).
