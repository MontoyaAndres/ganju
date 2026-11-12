---
title: Asistente
description: Describe con tus palabras qué debe saber o hacer tu bot — el asistente lo construye contigo, lo prueba y no cambia nada hasta que presionas Aplicar.
order: 1.5
updated: 2026-11-12
---

La pestaña **Asistente** es donde construyes tu bot conversando. Cuéntale lo que
quieres — "que diga a los clientes si una pizza se agotó", "que tome pedidos y me
los envíe por correo", "que agende citas en mi Google Calendar" — y planea el
trabajo contigo, lo construye, lo prueba y te entrega una sola tarjeta para
aplicar. Nunca ves código, y nada de lo que ven tus clientes cambia hasta que
presionas **Aplicar**.

El asistente es parte de los planes **Pro** y **Enterprise**. Responde en el idioma en que le
escribes, español o inglés.

## Qué puede cambiar

- **Acciones** — pequeños programas que tu bot ejecuta, como revisar el
  inventario o guardar una reserva. El asistente las escribe y las prueba por ti.
- **[Datos](/es/docs/data/)** — las tablas, columnas y filas de tu proyecto, las
  consultas guardadas, los [disparadores](/es/docs/data/triggers/), como
  "envíame un correo con cada pedido nuevo", y las
  [programaciones](/es/docs/data/triggers/#programaciones), como "cada noche a
  las 9, envíame los pedidos de hoy".
- **Conocimiento** — notas y sitios web que tu bot consulta, en la página
  [Recursos](/es/docs/resources/). Los archivos los pones tú: cuando necesita uno,
  te pide que lo subas.
- **[Prompts](/es/docs/prompts/)** y **[herramientas](/es/docs/tools/)**,
  incluidas Gmail, Outlook, Google Calendar y Slack del catálogo, a través de
  cuentas que conectas con un clic.
- **[Instrucciones del bot](/es/docs/channels/#dile-a-tu-bot-cómo-responder)** —
  cómo responde tu bot: "responde en dos frases", "siempre en español".

Lo que **no** puede cambiar: los canales, el modelo del bot, los miembros, la
facturación, los tokens de API y los ajustes de la organización o del proyecto. Si le pides uno de esos, te dice dónde cambiarlo tú.

Nunca ve tus contraseñas, claves ni inicios de sesión. Cuando necesita uno,
muestra una tarjeta donde pegas la clave o conectas la cuenta, y el valor va
directo a tu proyecto.

## Cómo avanza una solicitud

1. **Primero planea.** Para algo nuevo, te dice lo que entendió, pregunta en un
   solo mensaje lo que falta ("Cuando el inventario esté en 0, ¿el bot debe decir
   que se agotó u ofrecer otra cosa?") y estima los créditos que usará.
2. **Construye y prueba.** Ves cada paso mientras trabaja ("Escribiendo una
   acción", "Probándola"). Las acciones que envían un correo o guardan una fila lo
   hacen de verdad al probarlas, así que lo avisa antes y dirige las pruebas a ti
   o a filas marcadas claramente como prueba.
3. **Recibes una tarjeta.** Todo lo que verían tu bot o tus clientes se junta en
   una tarjeta **Listo para aplicar**: qué cambia, en palabras sencillas, y qué
   podrá hacer tu bot una vez activo — solo leer información, o cambiar y enviar
   cosas, sobre lo cual primero le pregunta a tu cliente.
4. **Presionas Aplicar.** Desde ese momento tu bot lo usa. Luego el asistente
   prueba lo que necesitaba estar activo antes de decir que funciona.

### Deshacer

Una tarjeta aplicada tiene un botón **Deshacer** que deja tu proyecto como
estaba. La mayoría de los cambios se revierten paso a paso. Algunos son más
grandes, y la tarjeta te avisa antes de aplicarlos:

- Eliminar una tabla o columna, borrar filas o cambiar el tipo de una columna se
  deshace devolviendo **toda la base de datos** a como estaba justo antes — lo
  que se haya guardado después se pierde.
- El contenido de un archivo eliminado no vuelve.
- Una herramienta eliminada vuelve sin su clave o inicio de sesión, que agregas
  de nuevo.

### Borrar

Borrar cualquier cosa — una tabla, una columna, filas, una nota, un archivo, un
prompt, una herramienta — toma dos pasos. Primero el asistente te pregunta,
diciendo exactamente qué se iría y qué se pierde con ello, y lo prepara solo
después de tu sí. Luego la tarjeta te pide **escribir su nombre** para que
**Aplicar** funcione.

## Pruébalo como cliente

El panel **Probarlo** junto al chat habla con tu bot real, con todo lo que está
activo — el mismo bot que responde en tus canales. Úsalo después de aplicar una
tarjeta para preguntar lo que preguntaría un cliente. **Empezar de nuevo** lo
limpia.

## Créditos

El asistente se cobra en créditos; un crédito es $0,01 de costo de IA. Una
acción nueva con su tabla suele tomar de 25 a 50 créditos, un cambio a una acción
de 10 a 50, y conocimiento nuevo o un arreglo pequeño menos de 15. Cada respuesta
muestra lo que usó, y cada chat su total.

Pro y Enterprise incluyen **1.000 créditos al mes**. Después, los créditos extra cuestan $2
por cada 100, hasta el límite mensual que un administrador elige en **Ajustes →
Plan y facturación** (2.000 extra si no lo cambias; 0 se detiene en los créditos
incluidos). La parte de arriba de la pestaña Asistente muestra lo que va del mes.

Los mensajes en **Pruébalo como cliente** también usan créditos cuando tu bot
usa nuestro modelo de IA. Nada más los usa.

### Tu propia clave de Anthropic

Si tu organización agregó un modelo de Anthropic en **Ajustes → Modelos**, un
administrador puede cambiar **Pagar con**, arriba en la pestaña Asistente, de
Créditos de Ganju a ese modelo. El asistente usa entonces tu clave y no gasta
créditos; solo el chat de prueba como cliente los sigue usando.

## Cuando una acción deja de funcionar

En las acciones construidas en el panel, la pestaña Asistente muestra el aviso
**Algo dejó de funcionar** cuando una acción falla seguido — al menos 5 llamadas
fallidas, y el 30% de sus llamadas, en el último día o desde que se cambió por
última vez — o cuando una cuenta que usa necesita volver a iniciar sesión.
**Arreglarlo con el asistente** escribe el primer mensaje por ti: revisa qué
salió mal, te dice por qué en palabras sencillas y propone un arreglo como
siempre. Una cuenta que necesita iniciar sesión de nuevo se arregla
reconectándola, sin cambiar nada más.

El dueño del proyecto y los administradores de la organización también reciben
un correo, como mucho uno al día por proyecto, y sobre el mismo problema otra vez
solo después de una semana. Se apaga en **Ajustes → Plan y facturación**.

## Proyectos que despliega un desarrollador

Cuando las acciones de un proyecto las subió un desarrollador con la
[CLI](/es/docs/tools/cli/), el asistente no reemplaza su código. Lo lee, y
responde a un cambio de código con **Un cambio para tu desarrollador**: un parche
para copiar o descargar y enviárselo. Lo aplica y vuelve a subirlo.

Si el desarrollador maneja tus tablas desde código, la tarjeta lo dice: su
próxima subida revierte los cambios de tablas y columnas, así que pásale esos
también.

## Chats

Empieza un **Nuevo chat** para cada cosa nueva que construyas; los anteriores
están en la lista. En cada proyecto responde un chat a la vez.

- Después de **30 días**, un mensaje conserva lo que tú y el asistente dijeron,
  pero se quita lo que devolvieron sus herramientas y sus notas de trabajo, porque
  pueden contener datos de tus clientes. Un chat viejo se puede seguir usando: el
  asistente retoma desde lo que se dijo y vuelve a revisar tu proyecto.
- Un chat se borra **90 días después de su último mensaje**.
- **Borrar chat**, en la cabecera del chat, lo borra ya. Lo que cambió en tu
  proyecto se queda, pero sus cambios ya no se pueden deshacer.

## Siguiente

- **[Datos](/es/docs/data/)** — las tablas y disparadores sobre los que construye
  el asistente.
- **[Funciones](/es/docs/tools/functions/)** — qué es una acción por dentro, si
  te da curiosidad o trabajas con un desarrollador.
- **[Configuración](/es/docs/settings/)** — tus propios modelos, el límite de
  créditos extra y el correo de avisos.
