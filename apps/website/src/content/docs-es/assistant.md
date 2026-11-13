---
title: Asistente
description: Describe con tus palabras qué debe saber o hacer tu bot. El asistente lo construye contigo, lo prueba y no cambia nada hasta que presionas Aplicar.
order: 1.5
updated: 2026-11-13
---

La pestaña **Asistente** es donde construyes tu bot conversando. Cuéntale lo que
quieres ("que diga a los clientes si una pizza se agotó", "que tome pedidos y me
los envíe por correo", "que agende citas en mi Google Calendar") y planea el
trabajo contigo, lo construye, lo prueba y te entrega una sola tarjeta para
aplicar. Nunca ves código, y nada de lo que ven tus clientes cambia hasta que
presionas **Aplicar**.

El asistente es parte de los planes **Pro** y **Enterprise**; en Free la pestaña
muestra **Construye tu bot describiéndolo** con **Mejorar plan**. Responde en el
idioma en que le escribes, español o inglés.

![La pestaña Asistente: el dueño pide un nuevo horario y el asistente responde con su plan, cuatro preguntas y un estimado de créditos](/images/assistant-chat.webp)

## Empieza un chat

Escribe lo que debe hacer tu bot en la caja de abajo (**Enter** envía,
**Shift + Enter** agrega una línea), o elige una de las sugerencias de un chat
vacío: **Que diga a los clientes si estamos abiertos ahora**, **Que responda
preguntas sobre mi menú**, **Que tome pedidos y me los envíe por correo**,
**Que agende citas en mi Google Calendar**.

![Un chat nuevo en la pestaña Asistente: "¿Qué debe hacer tu bot?" con cuatro sugerencias, la lista de chats y los créditos del mes](/images/assistant-empty.webp)

## Qué puede cambiar

- **Acciones**: pequeños programas que tu bot ejecuta, como revisar el
  inventario o guardar una reserva. El asistente las escribe y las prueba por
  ti, y puede dejarlas como estaban un día anterior. Por dentro son
  [funciones](/es/docs/tools/functions/), que la página **Acciones**
  muestra solo para leer.
- **[Datos](/es/docs/data/)**: las tablas, columnas y filas de tu proyecto, las
  consultas guardadas, los [disparadores](/es/docs/data/triggers/), como
  "envíame un correo con cada pedido nuevo", las
  [programaciones](/es/docs/data/schedules/), como "cada noche a
  las 9, envíame los pedidos de hoy", y la zona horaria de la base de datos, en
  la que corren las programaciones.
- **Conocimiento**: notas y sitios web que tu bot consulta, en **Conocimiento →
  [Recursos](/es/docs/resources/)**. Los archivos los pones tú: cuando necesita
  uno, te pide que lo subas.
- **[Prompts](/es/docs/prompts/)** y **[herramientas](/es/docs/tools/)**:
  Gmail, Outlook, Google Calendar y Slack del catálogo a través de cuentas que
  conectas con un clic, otras herramientas del catálogo y
  [endpoints HTTP](/es/docs/tools/http-endpoints/).
- **[Instrucciones del bot](/es/docs/channels/#dile-a-tu-bot-cómo-responder)**:
  cómo responde tu bot, como "responde en dos frases" o "siempre en español".

Lo que **no** puede cambiar: los canales, el modelo del bot, los miembros, la
facturación, los tokens de API y los ajustes de la organización o del proyecto.
Si le pides uno de esos, te dice dónde cambiarlo tú.

También puede **responder preguntas sobre la [CLI](/es/docs/tools/cli/)**, la
línea de comandos que usa tu desarrollador: cómo instalarla, desplegar, probar,
configurar CI o manejar la base de datos. Primero lee la documentación de la
CLI y responde con los comandos y un enlace.

## Cómo avanza una solicitud

1. **Primero planea.** Para algo nuevo, te dice lo que entendió, pregunta en un
   solo mensaje lo que falta ("Cuando el inventario esté en 0, ¿el bot debe decir
   que se agotó u ofrecer otra cosa?") y estima los créditos que usará.
2. **Construye y prueba.** Ves cada paso mientras trabaja ("Revisando tu
   proyecto", "Escribiendo una acción", "Probándola"). Las acciones que envían
   un correo o guardan una fila lo hacen de verdad al probarlas, así que lo
   avisa antes y dirige las pruebas a ti o a filas marcadas claramente como
   prueba. Antes de que un correo programado entre en vivo, te envía una
   muestra para que la leas.
3. **Recibes una tarjeta.** Todo lo que verían tu bot o tus clientes se junta en
   una tarjeta **Listo para aplicar**. Mira [La tarjeta](#la-tarjeta).
4. **Presionas Aplicar.** Desde ese momento tu bot lo usa. Luego el asistente
   prueba lo que necesitaba estar activo, y te cuenta lo que encontró, antes de
   decir que funciona.

Nada queda a medias: hasta que presionas **Aplicar**, lo que construyó el
asistente es solo un borrador. Si propone una tarjeta nueva antes de que
apliques la anterior, la anterior muestra **Reemplazado por un cambio más
nuevo**.

## La tarjeta

![Una tarjeta "Lista para aplicar": un resumen, la lista de cambios, el recuadro de lo que podrá hacer tu bot y el botón Aplicar](/images/assistant-change-card.webp)

Una tarjeta **Listo para aplicar** enumera, en palabras sencillas, cada cambio
que contiene, y bajo **Una vez aplicado, tu bot podrá:** lo que tu bot puede
hacer con él:

- **Solo leer información**, o **Cambiar o enviar cosas (primero le pregunta a
  tu cliente)**;
- **Leer tus tablas** o **Leer y cambiar tus tablas**, nombrándolas;
- **Conectarse a** los sitios externos que llama una acción;
- **Usar tus cuentas**, como Gmail o Google Calendar.

Una tarjeta con algo que no puede volver del todo dice **Esto no se puede
deshacer** o **Parte de esto no se puede deshacer**, y marca cada línea que
**Borra**.

Después de **Aplicar**, la tarjeta muestra **Aplicado** y un botón
**Deshacer**.

### Deshacer

**Deshacer** deja tu proyecto como estaba antes de la tarjeta. La mayoría de los
cambios se revierten paso a paso. Algunos son más grandes, y la tarjeta te
avisa antes de aplicarlos:

- Eliminar una tabla o columna, borrar filas o cambiar el tipo de una columna se
  deshace devolviendo **toda la base de datos** a como estaba justo antes: lo
  que se haya guardado después se pierde. Deshacer vuelve a preguntar antes de
  hacerlo (**Deshacer de todos modos**).
- El contenido de un archivo eliminado no vuelve.
- Una herramienta eliminada vuelve sin su clave o inicio de sesión, que agregas
  de nuevo.
- Un disparador de webhook que vuelve recibe un secreto de firma nuevo.

### Borrar

Borrar cualquier cosa (una tabla, una columna, filas, una nota, un archivo, un
prompt, una herramienta) toma dos pasos. Primero el asistente te pregunta,
diciendo exactamente qué se iría y qué se pierde con ello, y lo prepara solo
después de tu sí. Luego la tarjeta te pide **escribir su nombre** para que
**Aplicar** funcione. Cuando apagar algo te sirve tanto como borrarlo, te lo
sugiere.

## Tarjetas que necesitan de ti

Algunas cosas solo las puedes hacer tú. El asistente muestra una tarjeta y se
detiene hasta que termines; tu siguiente mensaje le dice cómo te fue.
**Prefiero no hacerlo**, en cualquiera de ellas, le pide otra forma.

- **Conecta tu cuenta**: **Conectar Gmail** (o Google Calendar, Outlook,
  Slack…) inicia sesión en esa cuenta para el proyecto.
- **Una clave que necesita el asistente**: te explica paso a paso dónde
  encontrarla. Pégala en **Pega la clave aquí** y presiona **Guardarla**. El
  valor va directo a tu proyecto; el asistente nunca lo ve.
- **Un archivo que necesita el asistente**: **Agregarlo en Recursos** te lleva a
  subirlo, y luego **Listo, ya lo agregué**.

Nunca te pide contraseñas, y nunca ve una clave ni un inicio de sesión.

## Volver a una versión anterior

Pídele "deja las acciones como estaban ayer" o "deshaz lo que cambiaste esta
mañana" y el asistente busca la versión de tus acciones que estaba en vivo
entonces. Te dice qué vuelve y qué acciones agregadas después se irían, y lo
prepara como una tarjeta que aplicas como cualquier otra. Si un desarrollador
sube tus acciones, te avisa que su próxima subida lo reemplazará.

Para todo lo demás de una tarjeta, **Deshacer** en esa tarjeta es la forma de
volver.

## Zona horaria y programaciones

La base de datos tiene una zona horaria, y las programaciones ("cada noche a las
9") y "hoy" corren en ella. Antes de una primera programación, o cuando una
programación llega a la hora equivocada, el asistente revisa la zona horaria, te
pregunta dónde está tu negocio si no lo sabe y prepara el cambio en la tarjeta.
Una programación corre como mucho una vez al día, todos los días o los días de
la semana que elijas, y un proyecto puede tener hasta cinco. Más en
[Programaciones](/es/docs/data/schedules/).

## Pruébalo como cliente

**Probarlo**, en la cabecera del chat, abre **Pruébalo como cliente**, un panel
que habla con tu bot real con todo lo que está activo: el mismo bot que
responde en tus canales. Úsalo después de aplicar una tarjeta para preguntar lo
que preguntaría un cliente. **Empezar de nuevo** lo limpia.

![El panel "Pruébalo como cliente" abierto junto al chat, con una pregunta de un cliente y la respuesta del bot](/images/assistant-try-it.webp)

## Créditos

El asistente se cobra en créditos; un crédito es $0,01 de costo de IA. Una
acción nueva con sus tablas suele tomar de 30 a 60 créditos en total, y hasta
unos 90 si además envía correos, revisa tu horario o maneja pagos; un cambio a
una acción de 10 a 50, y conocimiento nuevo o un arreglo pequeño menos de 15.
Cada respuesta muestra lo que usó, y cada chat su total.

Pro y Enterprise incluyen **1.000 créditos al mes**. Después, los créditos
extra cuestan $2 por cada 100, hasta el límite mensual que un administrador
elige en **Ajustes → Plan y facturación** (2.000 extra si no lo cambias; 0 se
detiene en los créditos incluidos). La lista de chats muestra lo que va del
mes; cuando se acaban los créditos, lo dice.

Los mensajes en **Pruébalo como cliente** también usan créditos cuando tu bot
usa nuestro modelo de IA. Ninguna otra cosa los usa.

### Tu propia clave de Anthropic

Si tu organización agregó un modelo de Anthropic en **Ajustes → Modelos**, un
administrador puede cambiar **Pagar con**, junto a los créditos del mes, de
**Créditos de Ganju** a ese modelo. El asistente usa entonces tu clave y no
gasta créditos; solo el chat de prueba como cliente los sigue usando.

## Cuando una acción deja de funcionar

En las acciones que construyó el asistente, la pestaña Asistente muestra el
aviso **Algo dejó de funcionar** cuando una acción falla seguido (al menos 5
llamadas fallidas, y el 30% de sus llamadas, en el último día o desde que se
cambió por última vez) o cuando una cuenta que usa necesita volver a iniciar
sesión. **Arreglarlo con el asistente** escribe el primer mensaje por ti: revisa
qué salió mal, te dice por qué en palabras sencillas y propone un arreglo como
siempre. Una cuenta que necesita iniciar sesión de nuevo se arregla
reconectándola, sin cambiar nada más.

El dueño del proyecto y los administradores de la organización también reciben
un correo, como mucho uno al día por proyecto, y sobre el mismo problema otra
vez solo después de una semana. Se apaga en **Ajustes → Plan y facturación**.

## Proyectos que despliega un desarrollador

Cuando las acciones de un proyecto las subió un desarrollador con la
[CLI](/es/docs/tools/cli/), el asistente no reemplaza su código. Lo lee, y
responde a un cambio de código con **Un cambio para tu desarrollador**: los
archivos cambiados, para **Copiar** o **Descargar** y mandárselos. Él los aplica
y vuelve a subirlos.

Si el desarrollador maneja tus tablas desde código, la tarjeta lo dice: su
próxima subida revierte los cambios de tablas y columnas, así que pásale esos
también.

Cuando el asistente cambió las acciones después de la última subida del
desarrollador, la CLI le avisa al desarrollador antes de que su próximo
despliegue las reemplace.

## Chats

Empieza un **Chat nuevo** para cada cosa nueva que construyas; los anteriores
están en la lista. En cada proyecto responde un chat a la vez, y si envías
muchos mensajes en un minuto te pide esperar un momento. Si el asistente se
detiene después de muchos pasos sin terminar, dile que continúe.

- Después de **30 días**, un mensaje conserva lo que tú y el asistente dijeron,
  pero se quita lo que devolvieron sus herramientas y sus notas de trabajo,
  porque pueden contener datos de tus clientes. Un chat viejo se puede seguir
  usando: el asistente retoma desde lo que se dijo y vuelve a revisar tu
  proyecto.
- Un chat se borra **90 días después de su último mensaje**.
- **Borrar chat**, en la cabecera del chat, lo borra ya. Lo que cambió en tu
  proyecto se queda, pero sus cambios ya no se pueden deshacer desde ahí.

## Siguiente

- **[Datos](/es/docs/data/)**: las tablas y disparadores sobre los que
  construye el asistente.
- **[Funciones](/es/docs/tools/functions/)**: qué es una acción por dentro, si
  te da curiosidad o trabajas con un desarrollador.
- **[Configuración](/es/docs/settings/)**: tus propios modelos, el límite de
  créditos extra y el correo de avisos.
