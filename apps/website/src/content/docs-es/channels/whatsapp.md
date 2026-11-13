---
title: WhatsApp
description: Conecta la Cloud API de WhatsApp Business (Meta) — crea un token permanente de usuario del sistema, toma tu Phone number ID, apunta el webhook a Ganju y administra las plantillas de mensaje.
order: 52
updated: 2026-11-13
---

**WhatsApp** funciona sobre la **Cloud API de WhatsApp Business** de Meta. La
configuración tiene algunos pasos más que los otros canales porque ocurre en el
panel de Meta, pero es una sola vez. Crearás una app de Meta, generarás un token
de acceso **permanente**, copiarás tu **Phone number ID** y luego pegarás la
**Callback URL** de Ganju de vuelta en Meta.

## 1. Crea una app de Meta con WhatsApp

1. En el panel de [Meta for Developers](https://developers.facebook.com/), crea una
   app (tipo **Business**) y agrega el producto **WhatsApp**.
2. Anota tu **Phone number ID** (una cadena numérica — *no* el número de
   teléfono en sí) y el **ID de tu cuenta de WhatsApp Business**. Para tu número
   real, los dos están en **WhatsApp → Configuración de producción → Registra tu
   número de teléfono de WhatsApp**, donde Meta llama a la cuenta "Messaging
   Account ID" o "Identificador de la cuenta de mensajes". La página **API
   Setup** (o **Pruébalo**) muestra el número de prueba gratuito de Meta y su
   propia cuenta de prueba: usa esos IDs solo para probar con ese número.

## 2. Genera un token de acceso permanente

El token temporal de la página API Setup vence en 24 horas — crea uno permanente
en su lugar:

1. Abre **Business Settings → System users** y agrega un **System user**.
2. Asígnale tu app y genera un token con los permisos
   **`whatsapp_business_messaging`** y **`whatsapp_business_management`**. El
   primero deja que el bot envíe y reciba mensajes; el segundo deja que Ganju
   administre tus plantillas de mensaje.
3. Ponlo como **que nunca vence** y cópialo. Este es tu **Access token**.

## 3. Conéctalo en Ganju

En **Canales → Agregar canal**, elige **WhatsApp**, escoge un **Modelo de
lenguaje** y completa los campos:

![El panel Conectar canal con WhatsApp: token de acceso, ID del número de teléfono y token de verificación](/images/new-channel-whatsapp.webp)

- **Access token** — el token permanente del System User del paso 2.
- **Phone number ID** — de **WhatsApp → Configuración de producción** (el ID, no
  el número visible). API Setup solo muestra el del número de prueba.
- **Verify token** — el valor que quieras; escribirás la misma cadena en Meta.
- **App secret** — de **App → Settings → Basic**, sirve para verificar los
  webhooks que llegan.

Selecciona **Conectar**. Ganju revisa que el token pueda actuar por ese número, y
luego el **Resumen** del canal muestra **Configuración de WhatsApp** con una
**Callback URL** y un botón para copiarla.

## 4. Apunta el webhook de Meta a Ganju

1. En el panel de Meta, ve a **WhatsApp → Configuration → Webhooks**.
2. Pega la **Callback URL** de Ganju y el **Verify token** que elegiste arriba, y
   verifica.
3. Suscribe el webhook al campo **`messages`**, y a
   **`message_template_status_update`** si vas a usar plantillas de mensaje.

Una vez verificado, los mensajes enviados a tu número de WhatsApp llegan a tu
asistente.

Meta solo reenvía los mensajes de un número cuando tu app está **suscrita a su
cuenta de WhatsApp Business**. Ganju lo hace por ti al conectar el canal, y
cuando guardas un token o un id de cuenta nuevos en su pestaña **Plantillas de
mensaje**. Si el botón **Test** del webhook de Meta funciona pero los mensajes
reales nunca llegan, falta la suscripción. Eso pasa cuando Meta no pudo decirle a
Ganju a qué cuenta pertenece el token. Escribe el id de la cuenta en la pestaña
**Plantillas de mensaje**, o suscribe la app tú mismo con el mismo token:

```bash
curl -X POST "https://graph.facebook.com/v25.0/<WABA_ID>/subscribed_apps" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

## Cómo se comporta el bot en WhatsApp

- **Chats uno a uno.** Cada conversación es un chat privado con tu número; el bot
  responde todos los mensajes.
- **Comandos.** WhatsApp no tiene menú de comandos: la gente escribe el
  `/comando` de un [prompt](/es/docs/prompts/) al inicio del mensaje, seguido del
  texto para su primera variable.
- **Notas de voz**: se transcriben y se responden como texto.
- **Fuentes**: con las [citas](/es/docs/resources/#cita-tus-fuentes) activadas,
  después de la respuesta llega una lista corta de enlaces **Sources**.
- **Archivos**: el bot puede enviar recursos guardados como adjuntos, dentro de
  los tamaños de Meta: documentos hasta 100 MB, imágenes hasta 5 MB, video y
  audio hasta 16 MB.
- **Confirmaciones**: antes de que una herramienta cambie algo, el bot pregunta
  con botones de respuesta Sí / No que solo ese cliente puede usar.

Las respuestas largas se dividen en varios mensajes.

## 5. Plantillas de mensaje

WhatsApp solo deja que un negocio le escriba libremente a un cliente dentro de
las **24 horas siguientes a su último mensaje**. Después, solo le llega una
**plantilla de mensaje** aprobada por Meta. Tu asistente nunca la necesita, porque
siempre responde a un mensaje. Los disparadores y las funciones que le escriben a
un cliente más tarde sí — "tu pedido está listo" a la mañana siguiente.

Abre el canal y la pestaña **Plantillas de mensaje**. Ahí puedes:

- **Ver tus plantillas** con su estado en Meta: **Aprobada**, **En revisión**,
  **Rechazada** (con el motivo de Meta), **Pausada**, **Desactivada** o **En
  apelación**, y cuándo se sincronizaron por última vez. **Actualizar** las
  vuelve a leer desde Meta.
- **Crear una** con **Nueva plantilla**: un **Nombre** (minúsculas, números y
  guiones bajos, como `pedido_listo`), un **Idioma**, una **Categoría**
  (**Utilidad** o **Marketing**), un **Encabezado** y un **Pie** opcionales (hasta
  60 caracteres cada uno, sin variables), el **Mensaje** (hasta 1.024
  caracteres) y hasta diez **Respuestas rápidas** (de 25 caracteres cada una).
  Las variables se insertan con una etiqueta ("nombre del cliente", "número de
  pedido") y se vuelven `{{1}}`, `{{2}}`, … (hasta 20); Meta pide un valor de
  ejemplo para cada una. La **Vista previa** la muestra como un mensaje de
  WhatsApp, y antes de enviarla se revisan las reglas por las que Meta más
  rechaza: una variable al principio o al final, dos variables seguidas,
  demasiadas variables para el texto. Selecciona **Enviar a revisión**.
- **Editar o eliminar** una. Meta vuelve a revisar una edición y limita cada
  cuánto se puede editar una plantilla aprobada; cuando la rechaza, su mensaje se
  muestra tal cual. Eliminarla también la borra en Meta, los disparadores y
  funciones que la envían empiezan a fallar, y Meta no deja volver a usar el
  nombre durante 30 días.

![La pestaña de plantillas de mensajes de un canal de WhatsApp con plantillas aprobadas, Actualizar y Nueva plantilla](/images/whatsapp-message-templates.webp)

**Las plantillas necesitan dos cosas de Meta:**

- **La cuenta de WhatsApp Business.** Las plantillas pertenecen a la cuenta, no
  al número. Ganju le pregunta a Meta cuál administra tu token, así que casi
  nunca tienes que hacer nada; cuando Meta no sabe, la pestaña pide el **ID de la
  cuenta de WhatsApp Business** (en la app, **WhatsApp → Configuración de
  producción → Registra tu número de teléfono de WhatsApp**, como "Messaging
  Account ID", o en WhatsApp Manager → Account tools → Business account
  settings). Ganju lo revisa con Meta antes de guardarlo: una cuenta que no tiene
  el número del canal se rechaza, así no guardas por error la cuenta del número
  de prueba para un número real.
- **El permiso `whatsapp_business_management`** en el token, además de
  `whatsapp_business_messaging`. Un token hecho solo para enviar mensajes no lo
  tiene; la pestaña te lo dice y explica cómo generar uno nuevo en **Business
  Settings → System users**. Pégalo en **Nuevo token de acceso**: como el
  primero, se guarda cifrado y no se vuelve a mostrar. La misma caja aparece
  cuando el token venció o fue revocado.

**Revisión y categoría.** Meta revisa cada plantilla en minutos o hasta en un
día. Puede rechazarla, o pasarla de **Utilidad** a **Marketing** si suena
promocional. Usa Utilidad para avisos que el cliente espera: "Tu pedido #{{1}}
está listo para recoger". Sin el campo `message_template_status_update` del
webhook, Ganju igual revisa cada hora las plantillas en revisión, y las demás una
vez al día.

**Costo.** Meta cobra los mensajes de plantilla a tu cuenta de WhatsApp Business
con sus propias tarifas, y Marketing cuesta más que Utilidad. Ganju no los cobra.

**Qué puede enviar Ganju.** Ganju llena las variables del mensaje en sí. Una
plantilla hecha en WhatsApp Manager con un encabezado de imagen, video o
documento, una variable en el encabezado, o un botón que lleva un valor (un
enlace con variable, un código) aparece como **Ganju no puede enviarla**, y queda
fuera de los disparadores y de `ctx.channels.templates()`. Los enlaces fijos, los
botones de llamada y las respuestas rápidas no tienen problema.

**Cuando Ganju no puede leer tus plantillas** (un token sin
`whatsapp_business_management`), igual envía la plantilla que nombres: Meta la
revisa, y la ejecución falla con el error de Meta cuando no está aprobada.

**Pausada o desactivada.** Meta pausa una plantilla cuando los clientes bloquean
o reportan sus mensajes, y desactiva la que sigue pausada. Los envíos que la usan
fallan con ese motivo, y los administradores de tu organización reciben un correo
cuando se pausa o se desactiva una plantilla que usa un disparador o una función.

Las plantillas se usan desde la acción de disparador
[escribirle al cliente de la fila](/es/docs/data/triggers/) y desde
[`ctx.channels.send`](/es/docs/data/functions/). Desde la
[CLI](/es/docs/tools/cli/), lístalas con su estado:

```bash
ganju channel templates
```

## Solución de problemas

- **"Conectar" falla de inmediato.** El token no puede actuar por ese Phone
  number ID: revisa que copiaste el ID (no el número) desde Configuración de
  producción, y que el System User tenga asignadas la app y la cuenta de
  WhatsApp.
- **La Callback URL no se verifica.** El **Verify token** en Meta debe ser
  exactamente el mismo que escribiste en Ganju.
- **El Test de Meta funciona, pero no llegan los mensajes reales.** La app no
  está suscrita a la cuenta de WhatsApp Business — mira el final del paso 4.
- **Los mensajes dejaron de llegar después de un día.** Usaste el token temporal
  de API Setup. Genera un token permanente de System User y pégalo en la pestaña
  **Plantillas de mensaje**.
- **El mensaje de un disparador nunca le llegó al cliente.** Pasadas las 24
  horas, solo pasa una plantilla **Aprobada**. Revisa su estado en **Plantillas de
  mensaje**.

Fuentes: [WhatsApp Cloud API — Get Started (Meta)](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started),
[Creating a permanent WhatsApp access token](https://noem.ai/help/creating-a-permanent-access-token-for-whatsapp-business-api)
