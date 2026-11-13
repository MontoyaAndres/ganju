---
title: Prompts
description: Arma plantillas de prompts reutilizables y de varios turnos con variables tipadas. Cada una se vuelve un comando en tus canales de chat vinculados y un prompt en cualquier cliente MCP.
order: 2
updated: 2026-11-13
---

Los **prompts** son plantillas de mensajes reutilizables que tu proyecto expone a
través de su servidor MCP. En cualquier canal de chat vinculado, cada prompt se
convierte en un **comando de barra** que la gente puede ejecutar por su nombre,
así una solicitud frecuente se vuelve un atajo de una palabra. Un prompt puede ser
un solo mensaje o un intercambio completo de varios turnos, y cualquier
`{{variable}}` que uses se completa al ejecutarlo.

## Por qué usar prompts

- **Convierte el trabajo repetido en un comando.** Captura una vez la solicitud
  que envías una y otra vez, y luego ejecútala como `/comando`, sin volver a
  escribirla y sin olvidar los detalles.
- **Resultados consistentes siempre.** Todos disparan exactamente la misma
  redacción y estructura, así que tu IA responde igual sin importar quién pregunte.
- **Comparte experiencia con todo tu equipo.** Un prompt bien hecho, escrito una
  vez, queda disponible al instante para cada compañero del canal. No hace falta
  saber de ingeniería de prompts para usarlo.
- **Guía al modelo con entradas tipadas.** Cada variable tiene un tipo, una
  descripción y una marca de obligatoria, así los clientes MCP saben exactamente
  qué pedir.
- **Dirige la conversación.** Las plantillas de varios turnos User/Assistant
  marcan el tono y le dan ejemplos al modelo, produciendo respuestas más precisas
  y predecibles.
- **Edita sin volver a desplegar.** Actualiza un prompt en el panel y la nueva
  versión queda activa de inmediato en cada canal vinculado y cliente MCP.

## Dónde viven los prompts

Los prompts están junto a tus recursos. Abre **Conocimiento** en la barra
lateral del proyecto y elige la pestaña **Prompts** (la otra es **Recursos**).
La página muestra cada prompt como una tarjeta con su título, su comando, su
descripción y la fecha de su último cambio. Mientras no tengas ninguno, muestra
**Todavía no hay prompts** con un botón **Nuevo prompt**.

![Conocimiento, pestaña Prompts: una tarjeta con su comando /start y el botón Nuevo prompt](/images/knowledge-prompts-tab.webp)

## Crea un prompt

Selecciona **Nuevo prompt**. A la derecha se abre el panel **Nuevo prompt** con
**Título**, **Descripción** y **Mensajes**.

![El panel Nuevo prompt: título, descripción, mensajes con el cambio Visual/JSON y Agregar mensaje](/images/new-prompt-panel.webp)

## Ponle nombre y escribe un mensaje

Dale un **Título** al prompt. Ganju lo convierte en el comando que aparece justo
debajo, como **Comando:**, en minúsculas y con cada grupo de espacios o
símbolos cambiado por `_`. "Resumir Artículo" se vuelve `/resumir_art_culo`
(las letras con tilde también cuentan como símbolos, así que conviene escribir
el título sin tildes: "Resumir Articulo" da `/resumir_articulo`). Dos prompts
de un proyecto no pueden compartir el mismo comando: Ganju rechaza el segundo
con "A prompt with this command name already exists".

Agrega una **Descripción** corta para que tus compañeros sepan qué hace
(Telegram y Discord también la muestran junto al comando en sus menús) y luego
escribe tu primer mensaje.

Pon `{{variables}}` donde quieras que se entregue un valor al ejecutarlo. En este
ejemplo el mensaje del usuario es `hi user {{name}} your age is {{age}}`, así que
`name` y `age` se vuelven entradas. El nombre de una variable usa letras,
dígitos y guiones bajos.

![El panel de nuevo prompt con el título "test", el comando /test, una descripción y un mensaje de usuario que contiene {{name}} y {{age}}](/images/new-prompt-1.webp)

## Configura las variables

Ganju **detecta automáticamente** cada `{{variable}}` de tus mensajes y las
lista en **Variables**. Cada una nueva empieza como String obligatoria. Para
cada una puedes:

- definir el **Tipo**: **String**, **Number** o **Boolean**;
- agregar una **Descripción** que le diga a quien ejecute el prompt qué poner ahí;
- marcar o desmarcar **Obligatoria**.

Aquí `{{name}}` es un String obligatorio ("user's name") y `{{age}}` un Number
obligatorio ("user's age").

![La sección Variables con {{name}} como String obligatorio y {{age}} como Number obligatorio, cada una con su tipo y descripción](/images/new-prompt-2.webp)

Cada `{{variable}}` de un mensaje tiene que estar en Variables; Ganju no guarda
un prompt que use una que no conoce. Al ejecutarse, una variable sin valor queda
vacía en el texto.

## Agrega más mensajes

Los prompts reales suelen ser una conversación, no una sola línea. Selecciona
**Agregar mensaje** para sumar otro turno, y cambia cada mensaje entre **User** y
**Assistant** para darle forma al intercambio. Este segundo mensaje es un turno
de Assistant, `this is a new {{message}}`.

![La sección Mensajes con dos mensajes: uno de User y otro de Assistant que contiene {{message}}](/images/new-prompt-3.webp)

Las variables nuevas que agregas se detectan solas: `{{message}}` aparece
ahora junto a `{{name}}` y `{{age}}` en la lista de Variables, lista para
tiparla y describirla.

![La sección Variables mostrando ahora {{name}}, {{age}} y {{message}}, cada una configurable](/images/new-prompt-4.webp)

Un prompt necesita al menos un mensaje. Si el último es un turno de Assistant
(un saludo fijo, por ejemplo), el bot del canal igual agrega después el texto de
la persona, así el modelo siempre tiene algo que responder.

## Edita como JSON

¿Prefieres trabajar con la estructura cruda? Cambia **Visual / JSON** cuando
quieras para editar los mensajes como un arreglo de objetos `{ role, content }`,
donde `role` es `user` o `assistant`. Es la forma más rápida de pegar una
plantilla que ya tienes, y se mantiene sincronizada con el editor visual.

![El editor de mensajes en modo JSON mostrando un arreglo de objetos role/content](/images/new-prompt-5.webp)

```json
[
  { "role": "user", "content": "Resume este artículo en tres viñetas: {{article}}" },
  { "role": "assistant", "content": "Claro, estos son los puntos clave:" }
]
```

## Guarda, edita y elimina

Selecciona **Crear** y el prompt queda guardado como una tarjeta. Selecciona una
tarjeta para ver su descripción y sus mensajes; desde ahí puedes editarlo (el
panel pasa a **Editar prompt**) o eliminarlo. Eliminar pide confirmación y no se
puede deshacer.

Cada cambio llega solo a tus canales: Ganju actualiza el menú de comandos de tus
bots de Telegram y Discord cada vez que agregas, renombras o eliminas un prompt.

## Ejecuta un prompt desde un canal

En un canal vinculado, escribe el comando y luego el texto que quieras pasarle:

```
/resumir_articulo https://ejemplo.com/noticias/lanzamiento
```

- El texto después del comando va a la **primera variable** del prompt. Las
  demás quedan vacías, así que pon primero la que la gente va a escribir.
- Los mensajes del prompt, con la variable completada, reemplazan lo que la
  persona escribió, y el bot los responde como siempre, con tus recursos,
  herramientas e
  [instrucciones del bot](/es/docs/channels/#dile-a-tu-bot-cómo-responder).
- Un comando se responde de inmediato, sin esperar una pausa en la conversación.
- Si ningún prompt tiene ese nombre, o el prompt no se puede armar (por ejemplo,
  una variable obligatoria quedó sin valor), el mensaje se responde como
  cualquier otro.

Cómo encuentra la gente los comandos depende de la app:

| Canal | Cómo aparece un prompt |
| --- | --- |
| [Telegram](/es/docs/channels/telegram/) | En el menú de comandos **/** del bot, con la descripción. En grupos también funciona `/comando@tubot`. |
| [Discord](/es/docs/channels/discord/) | Como slash command nativo con una opción `text` opcional. Necesita la Interactions Endpoint URL. |
| [Slack](/es/docs/channels/slack/) | Crea un slash command de Slack con el mismo nombre que apunte a la Request URL de Ganju. |
| [WhatsApp](/es/docs/channels/whatsapp/) | No hay menú: la gente escribe `/comando` al inicio del mensaje. |

Telegram y Discord muestran como máximo 100 comandos, y ahí el nombre de un
comando se corta a 32 caracteres y debe empezar con una letra. El nombre `link`
está reservado para el comando `/link` y nunca se usa para un prompt.

Los prompts que vienen de un servidor MCP que agregaste en
[Herramientas](/es/docs/tools/) también son comandos, con el nombre de su título.

## Usa los prompts desde un cliente MCP

Tu proyecto también es un servidor MCP, así que cada prompt está disponible en
[clientes MCP](/es/docs/mcp/) como Claude, ChatGPT o Cursor con su nombre de
comando, y sus variables como argumentos (con descripciones y obligatoriedad).
El cliente pide los valores e inserta el resultado en el chat.

## Deja que el asistente los escriba

El [asistente](/es/docs/assistant/) del proyecto puede listar, crear, editar y
eliminar prompts por ti. Describe el comando que quieres ("un comando /menu que
liste los platos del día") y te propone el prompt para que lo apruebes.

## Límites del plan

El plan **Free** admite hasta **3 prompts** por proyecto. **Pro** y
**Enterprise** no tienen límite. Mira los planes en
[Configuración](/es/docs/settings/).

## Solución de problemas

- **"A prompt with this command name already exists".** El título de otro prompt
  da el mismo comando (mayúsculas y puntuación no cuentan). Cambia el título.
- **El comando no aparece en el menú de Telegram.** Los títulos que no empiezan
  con una letra quedan fuera del menú, y Telegram puede tardar un momento en
  actualizarlo. Escribir el comando igual funciona.
- **Discord no muestra comandos.** Configura la Interactions Endpoint URL e
  invita al bot con el scope `applications.commands`. Mira
  [Discord](/es/docs/channels/discord/).
- **Slack dice que el comando no es válido.** Slack solo acepta los slash
  commands que creaste en la app de Slack. Mira [Slack](/es/docs/channels/slack/).

Sigue con: dale a tus prompts algo con qué trabajar y agrega
[recursos](/es/docs/resources/).
