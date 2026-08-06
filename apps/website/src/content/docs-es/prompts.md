---
title: Prompts
description: Arma plantillas de prompts reutilizables y de varios turnos con variables tipadas — cada una se vuelve un comando de barra en tus canales de chat vinculados.
order: 2
updated: 2026-07-07
---

Los **prompts** son plantillas de mensajes reutilizables que tu proyecto expone a
través de su servidor MCP. En cualquier canal de chat vinculado, cada prompt se
convierte en un **comando de barra** que la gente puede ejecutar por su nombre —
así una solicitud frecuente se vuelve un atajo de una palabra. Un prompt puede ser
un solo mensaje o un intercambio completo de varios turnos, y cualquier
`{{variable}}` que uses se completa al ejecutarlo.

## Por qué usar prompts

- **Convierte el trabajo repetido en un comando.** Captura una vez la solicitud
  que envías una y otra vez, y luego ejecútala como `/comando` — sin volver a
  escribirla y sin olvidar los detalles.
- **Resultados consistentes siempre.** Todos disparan exactamente la misma
  redacción y estructura, así que tu IA responde igual sin importar quién pregunte.
- **Comparte experiencia con todo tu equipo.** Un prompt bien hecho, escrito una
  vez, queda disponible al instante para cada compañero del canal — no hace falta
  saber de ingeniería de prompts para usarlo.
- **Guía al modelo con entradas tipadas.** Las variables se validan por tipo y se
  marcan como obligatorias, así que nadie puede ejecutar un prompt con un valor
  faltante o mal formado.
- **Dirige la conversación.** Las plantillas de varios turnos User/Assistant
  marcan el tono y le dan ejemplos al modelo, produciendo respuestas más precisas
  y predecibles.
- **Edita sin volver a desplegar.** Actualiza un prompt en el panel y la nueva
  versión queda activa de inmediato en cada canal vinculado — no hay nada que
  publicar.

## Crea un prompt

Abre la página **Prompts** y selecciona **New prompt**. Se abre un panel a la
derecha con los campos vacíos **Title**, **Description** y **Messages**.

![La página de Prompts en estado vacío, con el panel New Prompt abierto y los campos Title, Description y Messages en blanco](/images/new-prompt.webp)

## Ponle nombre y escribe un mensaje

Dale un **título** al prompt — Ganju lo convierte en el comando de barra que se
muestra justo debajo (aquí, `test` se vuelve `/test`). Agrega una descripción corta
para que tu equipo sepa qué hace, y luego escribe tu primer mensaje.

Pon `{{variables}}` donde quieras un valor que se entregue al momento de
ejecutarlo. En este ejemplo el mensaje de usuario es
`hi user {{name}} your age is {{age}}`, así que `name` y `age` se vuelven entradas
que provee quien lo ejecuta.

![El panel New Prompt con el título "test", el comando /test, una descripción y un mensaje de usuario que contiene {{name}} y {{age}}](/images/new-prompt-1.webp)

## Configura las variables

Ganju **detecta automáticamente** cada `{{variable}}` de tus mensajes y las lista
bajo **Variables**. Para cada una puedes:

- definir un **tipo** — String, Number y Boolean;
- agregar una **descripción** corta que oriente a quien ejecute el prompt;
- marcarla como **obligatoria** u opcional.

Aquí `{{name}}` es un String obligatorio ("nombre del usuario") y `{{age}}` un
Number obligatorio ("edad del usuario").

![La sección Variables listando {{name}} como String obligatorio y {{age}} como Number obligatorio, cada uno con su tipo y descripción](/images/new-prompt-2.webp)

## Agrega más mensajes

Los prompts reales suelen ser una conversación, no una sola línea. Selecciona
**Add message** para agregar otro turno, y cambia cada mensaje entre **User** y
**Assistant** para darle forma al intercambio. Este segundo mensaje es un turno de
Assistant, `this is a new {{message}}`.

![La sección Messages con dos mensajes: uno de User y uno de Assistant que contiene {{message}}](/images/new-prompt-3.webp)

Las variables nuevas que introduzcas se recogen automáticamente — `{{message}}`
ahora aparece junto a `{{name}}` y `{{age}}` en la lista de Variables, lista para
tiparla y describirla.

![La sección Variables mostrando ahora {{name}}, {{age}} y {{message}}, cada una configurable](/images/new-prompt-4.webp)

## Edita como JSON

¿Prefieres trabajar con la estructura en crudo? Alterna **Visual / JSON** cuando
quieras para editar los mensajes directamente como un arreglo de objetos
`{ role, content }`. Es la forma más rápida de pegar una plantilla que ya tengas,
y se mantiene sincronizado con el editor visual.

![El editor de Messages en modo JSON mostrando un arreglo de objetos role/content](/images/new-prompt-5.webp)

## Guárdalo y ejecútalo

Selecciona **Create** y el prompt se guarda como una tarjeta que muestra su comando
de barra, su descripción y sus mensajes. Desde cualquier canal vinculado, escribe
el comando (como `/test`), completa las variables obligatorias y Ganju ejecuta la
plantilla — con las variables sustituidas — como si la hubieras escrito entera a
mano.

Sigue con: dale a tus prompts con qué trabajar — agrega
[recursos](/es/docs/getting-started/resources).
