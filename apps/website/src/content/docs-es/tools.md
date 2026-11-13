---
title: Herramientas
description: Dale a tu bot la capacidad de actuar — integraciones como Gmail, Outlook, Slack y Calendar, tus propias APIs HTTP y funciones que escribe el Asistente o tu desarrollador.
order: 4
updated: 2026-11-13
---

Las **herramientas** son las acciones que puede ejecutar tu bot. Mientras los
[recursos](/es/docs/resources/) le dejan *leer* tu conocimiento, las
herramientas le dejan *hacer* cosas: enviar un correo, publicar en Slack,
agendar una reunión, buscar en la web en vivo, revisar tu inventario o llamar a
tu propia API. Todo proyecto viene con un conjunto de herramientas integradas, y
agregas más cuando las necesites.

## Tres tipos de herramienta

La página **Herramientas** tiene tres pestañas, una por tipo:

| Pestaña | Qué es | Quién la hace | Plan |
| --- | --- | --- | --- |
| **[Funciones](/es/docs/tools/functions/)** | Herramientas en código: varios pasos, lógica, tu base de datos, una clave combinada con un cálculo. | Las escribe el [Asistente](/es/docs/assistant/); un desarrollador puede desplegarlas con la [CLI](/es/docs/tools/cli/). La pestaña las muestra solo para leer. | Pro y Enterprise |
| **[Endpoints HTTP](/es/docs/tools/http-endpoints/)** | Una petición contra una API que ya tienes, descrita en un formulario. Sin código. | Tú, en el formulario, o el Asistente. | Todos los planes |
| **[Catálogo](/es/docs/tools/catalog/)** | Las integraciones que ofrecemos y mantenemos: conecta una cuenta y enciende las herramientas que quieras. | Tú, o el Asistente. | Todos los planes |

Empieza por el catálogo. Si tu caso está cubierto ahí, conectar una cuenta es
todo el trabajo. Si no, un endpoint HTTP es el camino más corto a tu propia
API, y una función es a lo que recurres cuando una sola petición no alcanza. No
tienes que elegir tú: cuéntale al [Asistente](/es/docs/assistant/) lo que debe
hacer el bot, y elige la opción más simple que funcione.

![Herramientas, pestaña Catálogo: la barra de herramientas expuestas, la búsqueda, los filtros y las tarjetas de integraciones](/images/tools-catalog.webp)

## Por qué usar herramientas

- **Pasa de responder a actuar.** Tu bot no solo contesta: agenda la reunión,
  envía el seguimiento y guarda el pedido.
- **Conecta una vez, úsala en todas partes.** Autoriza una integración una vez,
  y cada herramienta activa funciona en todos tus canales y clientes MCP.
- **Activa solo lo que necesitas.** Enciende las herramientas una por una, para
  que el bot haga exactamente lo que permites y nada más.
- **Trae tu propia API.** Agrega un endpoint HTTP o conecta el servidor MCP
  remoto de un proveedor para llegar a servicios que no ofrecemos.

## Cómo funciona una herramienta

Por dentro, tu proyecto es un **servidor MCP**, y una herramienta es una
función que ese servidor le ofrece a cualquier IA conectada. El flujo siempre es
el mismo:

1. **Activas una herramienta.** Se agrega a las herramientas del bot y se le
   describe al modelo: su nombre, qué hace y qué entradas espera.
2. **Conectas la integración una vez.** Las herramientas que tocan una cuenta
   externa (Gmail, Slack, Calendar…) necesitan acceso. La autorizas una vez,
   con OAuth o una API key, y Ganju guarda la credencial cifrada y la renueva.
   Las herramientas integradas no necesitan conexión.
3. **El modelo decide llamarla.** Cuando alguien pregunta algo en un canal o
   cliente, el modelo lee las herramientas disponibles y, si una sirve, la llama
   con los argumentos correctos.
4. **Ganju la ejecuta y devuelve el resultado.** La llamada corre con tus
   credenciales guardadas, y el resultado vuelve al modelo para terminar la
   respuesta. Cada llamada se registra en tu uso.

Cuando tu organización activa
[Confirmar acciones sensibles](/es/docs/settings/#confirmar-acciones-sensibles),
un bot de canal le pregunta a la persona antes de que una herramienta envíe,
agende, borre o cambie algo, y solo la ejecuta si dice que sí.

## Herramientas por defecto

Todo proyecto arranca con cinco herramientas **integradas** ya instaladas, para
que tu bot pueda trabajar con tus [recursos](/es/docs/resources/) y
[prompts](/es/docs/prompts/) desde el primer día, sin conexión:

- **List Resources**: lista cada recurso disponible para el bot.
- **Read Resource**: lee el contenido de un recurso guardado.
- **Send Resource**: entrega un recurso a la persona como adjunto en el chat.
- **Search Resources**: encuentra los recursos más relevantes para una
  pregunta, por significado.
- **List Prompts**: lista los prompts y comandos que ofrece el bot, y cómo
  ejecutarlos en el canal actual.

Cuando el proyecto tiene una [base de datos](/es/docs/data/), el bot también
recibe [herramientas de datos](/es/docs/data/#las-herramientas-de-datos-del-asistente)
para leer y cambiar las tablas que le permitas.

## Encender y apagar herramientas

Cada herramienta tiene un interruptor y un botón para eliminarla, y hacen cosas
distintas. **Apagar** deja de ofrecer la herramienta pero conserva su
configuración y su conexión; **Eliminar** la borra con su configuración. Solo
cuentan para el límite las herramientas encendidas, así que puedes tener más
configuradas de las que expones a la vez:

- **Free**: hasta 7 herramientas encendidas a la vez.
- **Pro y Enterprise**: hasta 40 encendidas a la vez, lo máximo que un canal le
  envía al modelo.

Cada herramienta cuenta como una, incluidas cada función y cada herramienta de
un servidor MCP remoto, y una función que solo ejecutan los disparadores no
cuenta.

Mantén la lista corta a propósito. La descripción de cada herramienta activa se
le envía al modelo en cada turno, así que una lista larga cuesta tokens y le
complica la elección al modelo. La pestaña Catálogo muestra cuántas expones.

## Herramientas disponibles

Cada integración tiene su propia página con qué hace, cómo conectarla y todas
las herramientas que ofrece:

- **[Integradas](/es/docs/tools/built-in/)**: las cinco herramientas base de
  recursos y prompts que trae todo proyecto.
- **[Gmail](/es/docs/tools/gmail/)**: envía, lee, busca y administra correo (18
  herramientas).
- **[Outlook](/es/docs/tools/outlook/)**: correo de Microsoft 365 (18
  herramientas).
- **[Slack](/es/docs/tools/slack/)**: publica mensajes, recorre canales y sube
  archivos.
- **[Búsqueda en Slack](/es/docs/tools/slack-search/)**: búsqueda de mensajes
  en todo el espacio de trabajo (una conexión aparte).
- **[Google Calendar](/es/docs/tools/google-calendar/)**: crea y administra
  eventos y encuentra espacios libres.
- **[Cal.com](/es/docs/tools/calcom/)**: consulta disponibilidad y agenda o
  cancela reuniones.
- **[Búsqueda web](/es/docs/tools/web-search/)**: busca en la web en vivo y
  extrae el contenido de las páginas.
- **[GitHub](/es/docs/tools/github/)**: el servidor MCP remoto oficial de
  GitHub para repos, issues y pull requests.
- **[Notion](/es/docs/tools/notion/)**: el servidor MCP remoto oficial de Notion
  para buscar y actualizar páginas y bases de datos.
- **[Saludo](/es/docs/tools/greeting/)**: una herramienta de demostración
  diminuta para probar un servidor nuevo.

Y las dos que construyes:

- **[Endpoints HTTP](/es/docs/tools/http-endpoints/)**: tus propias APIs como
  herramientas con nombre, sin código.
- **[Funciones](/es/docs/tools/functions/)**: herramientas en código, escritas
  por el [Asistente](/es/docs/assistant/) o desplegadas con la
  **[CLI `ganju`](/es/docs/tools/cli/)**.

Sigue con: decide dónde habla la gente con tu bot. Configura los
[canales](/es/docs/getting-started/channels/).
