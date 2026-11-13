---
title: Canales
description: Lleva tu asistente a personas reales en las apps que ya usan (Telegram, WhatsApp, Slack y Discord), ajusta cómo responde y mira cada conversación.
order: 5
updated: 2026-11-13
---

Los **canales** son la forma de poner tu asistente frente a otras personas. Todo
lo que construiste ([prompts](/es/docs/prompts/), [recursos](/es/docs/resources/),
[herramientas](/es/docs/tools/) y [datos](/es/docs/data/)) viaja con él
automáticamente; tú solo eliges dónde lo encuentra la gente. Conecta una **app
de mensajería** para que clientes y compañeros conversen con tu IA donde ya
están, o conecta cualquier [cliente MCP](/es/docs/mcp/) para un flujo de trabajo
más avanzado.

## Por qué usar canales

- **Encuentra a la gente donde está.** No hay una app nueva que instalar: tu
  asistente vive en Telegram, WhatsApp, Slack o Discord.
- **Un asistente, disponible en todas partes.** Cada canal sirve los mismos
  prompts, recursos, herramientas e instrucciones del bot, así que las
  respuestas son consistentes entre apps.
- **Trae tu propio modelo.** Cada canal puede correr sobre el modelo por defecto
  o sobre uno que configures en [Configuración](/es/docs/settings/).
- **Controla el costo.** Espera a que la gente termine de escribir antes de
  responder, y limita cuántas respuestas recibe un cliente al día.
- **Míralo funcionar.** Cada conversación queda en el panel, con lo que el bot
  buscó e hizo para cada respuesta.

## Qué hay disponible

Ganju soporta cuatro plataformas de mensajería. Cada una tiene su propia página
con instrucciones paso a paso para crear las credenciales que necesita:

| Plataforma | Qué necesitas | Dónde responde |
| --- | --- | --- |
| **[Telegram](/es/docs/channels/telegram/)** | Un token de bot de @BotFather | Chats privados; en grupos cuando lo mencionan o le responden |
| **[WhatsApp](/es/docs/channels/whatsapp/)** | Una app de Meta con la Cloud API de WhatsApp Business | Chats uno a uno con tu número |
| **[Slack](/es/docs/channels/slack/)** | Una app de Slack: bot token y signing secret | Mensajes directos; en canales cuando lo mencionan con @ |
| **[Discord](/es/docs/channels/discord/)** | Una aplicación de Discord: bot token, application ID y public key | Mensajes directos; en servidores cuando lo mencionan con @ |

## Conecta un canal

Abre **Canales** en la barra lateral del proyecto y selecciona **Agregar canal**.
El panel **Conectar canal** te pide:

1. **Plataforma**: Telegram, Slack, WhatsApp o Discord.
2. **Modelo de lenguaje**: deja **Modelo por defecto**, o elige uno de los
   modelos de tu organización (mira [más abajo](#elige-el-modelo-de-lenguaje)).
3. Las credenciales de la plataforma. El panel explica cada campo y, para Slack,
   Discord y WhatsApp, muestra los scopes, intents o campos del webhook que
   necesita la app.

![El panel Conectar canal: Telegram, Slack, WhatsApp y Discord, el Modelo de lenguaje y el campo del token del bot](/images/channels-connect-panel.webp)

Selecciona **Conectar**. Ganju revisa las credenciales con la plataforma antes de
guardarlas (un token equivocado se rechaza de inmediato) y las guarda cifradas.
Luego:

- **Telegram** queda listo al instante: Ganju registra el webhook y el menú de
  comandos por ti.
- **Slack**, **Discord** y **WhatsApp** necesitan un paso más: el **Resumen** del
  canal muestra una URL para pegar de vuelta en esa plataforma (la **Request
  URL**, la **Interactions Endpoint URL** o la **Callback URL**) con un botón
  para copiarla. La página de cada plataforma cubre los pasos exactos.

Un bot, una app de Slack, una aplicación de Discord o un número de WhatsApp solo
puede estar conectado a un canal a la vez.

## La página Canales

Cada canal conectado es una tarjeta con el nombre del bot, el ícono de la
plataforma, su estado (**Activo** o **Desactivado**) y la cuenta de
conversaciones y mensajes. Selecciona una tarjeta para abrirla. El panel tiene
las pestañas **Resumen** y **Conversaciones**, y en WhatsApp también **Plantillas
de mensaje**.

![La página Canales con canales de Telegram, Slack, Discord y WhatsApp, Instrucciones del bot y Agregar canal](/images/channels-page.webp)

## Ajustes del canal

La pestaña **Resumen** reúne todo sobre un canal:

- **Estado**: **Recibiendo mensajes** activado, o **En pausa**. En pausa, la
  plataforma sigue enviándole los mensajes a Ganju, pero se descartan hasta que
  lo vuelvas a activar.
- **Modelo de lenguaje**: cambia el modelo que usa este canal.
- **Tiempo de respuesta**: la gente suele mandar una misma idea en varios
  mensajes. Esperar una pausa deja que el bot responda a todos de una vez. Elige
  **Responder cada mensaje**, o esperar **2**, **5** (recomendado, el valor por
  defecto), **10** o **30 segundos**. El bot nunca espera más de un minuto desde
  el primer mensaje, y un comando siempre se responde de inmediato.
- **Respuestas por cliente**: cuántas respuestas recibe un cliente en 24 horas:
  **20**, **50** (recomendado, el valor por defecto), **100**, **200** o **Sin
  límite**. Al pasarse, se le avisa una vez y el bot no responde hasta que se
  libere el día, así el spam y los chats de todo el día dejan de costarte
  mensajes y tiempo de modelo.
- **Memoria de clientes**: activa **Recordar a los clientes** y el bot guarda
  lo que cada cliente le cuenta de sí mismo (nombre, dirección, alergias, fechas
  importantes) y lo usa la próxima vez («¿a la misma dirección de siempre?»).
  Está desactivada por defecto, funciona solo en chats privados y el cliente
  puede pedirle al bot que olvide. Tú puedes borrarla desde una conversación.
- **Actividad**: la cuenta de conversaciones y mensajes del canal.
- **Zona de riesgo**: **Eliminar canal** lo desconecta y borra su historial de
  conversaciones. No se puede deshacer.

![El Resumen de un canal de Telegram: el bot, Recibiendo mensajes, Modelo de lenguaje, Tiempo de respuesta y Respuestas por cliente](/images/channel-overview.webp)

## Elige el modelo de lenguaje

Cada canal corre sobre un modelo de lenguaje. Por defecto es el **Modelo por
defecto**, que opera Ganju. En **Pro** y **Enterprise** puedes traer el tuyo:
tu propio proveedor y tu llave de API, que agregas una vez en
[Configuración](/es/docs/settings/) y eliges por canal, al conectarlo o después
desde su Resumen. Mientras no agregues uno, el desplegable solo ofrece el modelo
por defecto.

## Dile a tu bot cómo responder

Las **Instrucciones del bot**, un botón arriba en la página Canales, dicen cómo
responde tu bot en todos los canales del proyecto y en el panel
[Pruébalo como cliente](/es/docs/assistant/#pruébalo-como-cliente) del
asistente: su idioma, largo y tono, o lo que siempre o nunca debe decir.
Escríbelas como reglas cortas, una por línea, y selecciona **Guardar**:

```
Responde en dos frases como máximo.
Responde siempre en español.
Llama a los clientes por su nombre.
```

![El diálogo Instrucciones del bot con instrucciones de ejemplo y el contador de 2.000 caracteres](/images/channels-bot-instructions.webp)

- Admiten hasta **2.000 caracteres** (el contador debajo de la caja muestra
  cuántos llevas) y funcionan con cualquier modelo, incluido el modelo por
  defecto.
- En un modelo con su propio system prompt, se agregan después de él.
- Las reglas propias de Ganju van primero, así que las instrucciones no pueden
  desactivar, por ejemplo, que el bot le pregunte a un cliente antes de cambiar
  algo.
- Los datos como precios y horarios van en [Recursos](/es/docs/resources/).

El [asistente](/es/docs/assistant/) del proyecto también puede escribirlas por ti
("responde más corto", "ofrece siempre domicilio"): te propone el texto nuevo y
tú lo apruebas. El diálogo las vuelve a leer cada vez que lo abres, así que
siempre ves la versión más reciente.

## Qué puede hacer la gente en un chat

- **Escribir y ya.** El bot responde desde tus recursos, usa tus herramientas y
  tus datos, y puede enviar archivos guardados como adjuntos. En grupos y
  canales solo responde cuando lo mencionan (o, en Telegram, cuando le
  responden); en chats privados responde todo.
- **Ejecutar un prompt.** Cada [prompt](/es/docs/prompts/) es un comando; el
  texto que va después llena la primera variable del prompt.
- **Mandar una nota de voz.** El bot la transcribe y responde como si la
  hubieran escrito. Las notas de más de cinco minutos reciben una respuesta que
  lo explica.
- **Confirmar acciones sensibles.** Antes de que una herramienta cambie algo, el
  bot pregunta, con botones **Sí / No** donde la app los tiene, y solo la
  persona a la que le preguntó puede contestar.
- **Vincular su cuenta.** `/link` está reservado: le da a la persona un código
  para conectar su cuenta del chat con su cuenta de Ganju. Por seguridad solo
  funciona en un chat privado (como slash command de Slack o Discord, la
  respuesta solo la ve quien lo usó).

Con las [citas](/es/docs/resources/#cita-tus-fuentes) activadas, las respuestas
muestran los recursos que usaron.

## Mira las conversaciones

Abre la pestaña **Conversaciones** de un canal para ver cada chat, con su título
(el nombre de la persona en un chat privado, el del grupo o canal en los
demás), una etiqueta **Privado**, **Grupo** o **Canal**, cuántos mensajes tiene
y cuándo llegó el último. Selecciona uno para leer el hilo:

- cada mensaje, con quién lo envió y cuándo;
- debajo de cada respuesta, los tokens y el tiempo que tomó, y cada
  **Herramienta**, **Recurso** o **Prompt** que usó el bot (selecciona uno para
  ver su entrada, su salida o su error, con un enlace para abrirlo en
  Herramientas, Recursos o Prompts);
- los archivos que el bot envió como adjuntos y las **Fuentes** que citó (con el
  número de página en los PDF);
- etiquetas como **Nota de voz** o **Límite diario alcanzado**;
- con la memoria de clientes activada, **Lo que recuerda de este cliente**, con
  un botón **Olvidar**.

![Un hilo de conversación en el panel: el comando /start del usuario y la respuesta del asistente con los recursos, herramientas y prompts del proyecto](/images/channel-messages.webp)

Para ver números de todos los canales (conversaciones, mensajes, herramientas),
mira [Analítica](/es/docs/analytics/).

## Conecta cualquier cliente MCP

Las apps de mensajería no son la única puerta de entrada. Por debajo, tu
proyecto es un **servidor de Model Context Protocol (MCP)**, así que cualquier
cliente compatible con MCP, como **Claude**, **ChatGPT** o **Cursor**, puede
conectarse al mismo asistente, con todos tus prompts, recursos y herramientas.
Los canales son para las personas a las que atiendes; los clientes MCP son para
conectar tu IA con tus propias herramientas y flujos de trabajo. Ambos apuntan
a un mismo proyecto. Mira [Clientes MCP](/es/docs/mcp/).

## Desde la CLI

La [CLI `ganju`](/es/docs/tools/cli/) lista tus plantillas de mensaje de WhatsApp
y su estado en Meta:

```bash
ganju channel templates
ganju channel templates --json
```

Los canales en sí se conectan y se configuran en el panel.

## Límites del plan

- **Free**: un canal por proyecto y 100 mensajes del bot al mes en toda la
  organización, con el modelo por defecto.
- **Pro** y **Enterprise**: canales ilimitados, mensajes medidos más allá de lo
  que incluye el plan, y tus propios modelos.

Mira planes y consumo en [Configuración](/es/docs/settings/).

## Solución de problemas

- **El bot nunca responde.** Revisa que el canal esté **Activo** con **Recibiendo
  mensajes** activado, y luego el paso propio de la plataforma: la Request URL y
  los eventos del bot en Slack, el intent Message Content en Discord, la
  Callback URL y el campo `messages` en WhatsApp. En Slack, **Socket Mode** debe
  estar **apagado**: si está activo, Slack envía los eventos por su socket en
  vez de a la Request URL de Ganju.
- **Responde en mensajes directos pero no en un grupo.** Menciona al bot
  (`@tubot`). Ignora la conversación del grupo que no va dirigida a él.
- **Responde tarde.** Es el **Tiempo de respuesta** esperando una pausa. Elige
  una espera más corta, o **Responder cada mensaje**.
- **Un cliente dejó de recibir respuestas.** Seguramente llegó a sus
  **Respuestas por cliente**; la conversación muestra **Límite diario
  alcanzado**. Sube el límite o espera a que se libere el día.
- **"…is already connected to project…".** Ese bot, app o número está conectado
  al canal de otro proyecto. Elimina ese canal primero, o usa otro bot.
- **Plan Free: no puedes agregar un canal.** Free admite un canal por proyecto.

Sigue con: administra modelos, miembros y facturación en
[Configuración](/es/docs/settings/).
