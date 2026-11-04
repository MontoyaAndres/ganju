---
title: WhatsApp
description: Conecta la Cloud API de WhatsApp Business (Meta) — crea un token permanente de usuario del sistema, toma tu ID de número de teléfono y apunta el webhook a Ganju.
order: 52
updated: 2026-11-03
---

**WhatsApp** funciona sobre la **Cloud API de WhatsApp Business** de Meta. La
configuración tiene algunos pasos más que los otros canales porque ocurre en el
panel de Meta, pero es una sola vez. Crearás una app de Meta, generarás un token de
acceso **permanente**, copiarás tu **Phone number ID** y luego pegarás la **Callback
URL** de Ganju de vuelta en Meta.

## 1. Crea una app de Meta con WhatsApp

1. En el panel de [Meta for Developers](https://developers.facebook.com/), crea una
   app (tipo **Business**) y agrega el producto **WhatsApp**.
2. En **WhatsApp → API Setup**, anota tu **Phone number ID** (una cadena numérica —
   *no* el número de teléfono en sí) y el ID de tu cuenta de WhatsApp Business.

## 2. Genera un token de acceso permanente

El token temporal de la página API Setup expira en 24 horas — crea uno permanente en
su lugar:

1. Abre **Business Settings → System users** y agrega un **System user**.
2. Asígnale tu app y genera un token con el permiso
   **`whatsapp_business_messaging`** (y `whatsapp_business_management`).
3. Ponlo como **que nunca expira** y cópialo. Este es tu **Access token**.

## 3. Conéctalo en Ganju

En **Channels → Add channel**, elige **WhatsApp**, selecciona un modelo de lenguaje
y completa los campos:

![El panel Connect channel con WhatsApp seleccionado, mostrando los campos Access token, Phone number ID y Verify token](/images/new-channel-whatsapp.webp)

- **Access token** — el token permanente del System User del paso 2.
- **Phone number ID** — de **WhatsApp → API Setup** (el ID, no el número visible).
- **Verify token** — cualquier valor que elijas; escribirás la misma cadena en Meta.
- **App secret** — de **App → Settings → Basic**, se usa para verificar los webhooks
  entrantes.

Selecciona **Connect**. Ganju te muestra entonces una **Callback URL**.

## 4. Apunta el webhook de Meta a Ganju

1. En el panel de Meta, ve a **WhatsApp → Configuration → Webhooks**.
2. Pega la **Callback URL** de Ganju y el **Verify token** que elegiste arriba, y
   verifica.
3. Suscribe el webhook al campo **`messages`**, y a
   **`message_template_status_update`** si vas a usar plantillas de mensaje.

Una vez verificado, los mensajes enviados a tu número de WhatsApp llegan a tu
asistente.

Meta solo reenvía los mensajes de un número cuando tu app está **suscrita a su
cuenta de WhatsApp Business**. Ganju lo hace por ti al conectar el canal, y al
guardar un token o un id de cuenta nuevos en su pestaña **Plantillas de
mensaje**. Si el botón **Test** del
webhook de Meta funciona pero los mensajes reales nunca llegan, falta esa
suscripción. Pasa cuando Meta no pudo decirle a Ganju a qué cuenta pertenece el
token. Escribe el id de la cuenta en la pestaña **Plantillas de mensaje**, o
suscribe la app tú mismo con el mismo token:

```bash
curl -X POST "https://graph.facebook.com/v25.0/<WABA_ID>/subscribed_apps" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

## 5. Plantillas de mensaje

WhatsApp solo deja que un negocio le escriba libremente a un cliente dentro de
las **24 horas siguientes a su último mensaje**. Después, solo le llega una
**plantilla de mensaje** aprobada por Meta. Tu asistente nunca la necesita,
porque siempre responde a un mensaje. Sí la necesitan los disparadores y las
funciones que le escriben al cliente más tarde: «tu pedido está listo» a la
mañana siguiente.

Abre el canal y la pestaña **Plantillas de mensaje**. Ahí puedes:

- **Ver tus plantillas** con su estado en Meta: aprobada, en revisión,
  rechazada (con el motivo de Meta), pausada o desactivada. **Actualizar** las
  vuelve a leer de Meta.
- **Crear una**: un nombre (minúsculas y guiones bajos, como `pedido_listo`),
  un idioma, una categoría, un encabezado opcional, el mensaje, un pie opcional
  y hasta diez respuestas rápidas. Las variables se insertan con una etiqueta
  («nombre del cliente», «número de pedido») y se vuelven `{{1}}`, `{{2}}`;
  Meta pide un valor de ejemplo para cada una. Una vista previa la muestra como
  un mensaje de WhatsApp, y antes de enviarla se revisan las reglas por las que
  Meta más rechaza: una variable al principio o al final, dos variables
  seguidas, demasiadas variables para el texto.
- **Editar o eliminar** una. Meta revisa de nuevo una edición y limita cada
  cuánto se puede editar una plantilla aprobada; cuando la rechaza, se muestra
  su mensaje tal cual.

**Las plantillas necesitan dos cosas de Meta:**

- **La cuenta de WhatsApp Business.** Las plantillas pertenecen a la cuenta, no
  al número. Ganju le pregunta a Meta cuál administra tu token, así que
  normalmente no hay nada que hacer; cuando Meta no lo sabe, la pestaña pide el
  **WhatsApp Business Account ID** (WhatsApp Manager → Account tools →
  Business account settings, o la página **WhatsApp → API Setup** de la app).
- **El permiso `whatsapp_business_management`** en el token, además de
  `whatsapp_business_messaging`. Un token creado solo para enviar mensajes no
  lo tiene; la pestaña lo dice y explica cómo generar uno nuevo en **Business
  Settings → System users**. Pégalo ahí: como el primero, se guarda cifrado y
  no se vuelve a mostrar.

**Revisión y categoría.** Meta revisa cada plantilla en minutos o hasta un día.
Puede rechazarla, o pasarla de **Utilidad** a **Marketing** si suena
promocional. Deja en Utilidad los avisos que el cliente espera: «Tu pedido
#{{1}} está listo para recoger». Sin el campo
`message_template_status_update` del webhook, Ganju igual revisa cada hora las
plantillas en revisión, y las demás una vez al día.

**Costo.** Meta cobra los mensajes de plantilla a tu cuenta de WhatsApp
Business con sus propias tarifas, y Marketing cuesta más que Utilidad. Ganju no
los cobra.

**Lo que Ganju puede enviar.** Ganju llena las variables del mensaje. Una
plantilla creada en WhatsApp Manager con un encabezado de imagen, video o
documento, una variable en el encabezado o un botón que lleva un valor (un
enlace con variable, un código) aparece como **Ganju no puede enviarla**, y no
se ofrece en los disparadores ni en `ctx.channels.templates()`. Los enlaces
fijos, los botones de teléfono y las respuestas rápidas sí funcionan.

**Cuando Ganju no puede leer tus plantillas** (un token sin
`whatsapp_business_management`), igual envía la plantilla que nombras: Meta la
revisa, y una ejecución falla con el error de Meta cuando no está aprobada.

**Pausadas o desactivadas.** Meta pausa una plantilla cuando los clientes
bloquean o reportan sus mensajes, y desactiva la que sigue pausada. Los envíos
que la usan fallan con ese motivo, y los administradores de tu organización
reciben un correo cuando se pausa o desactiva una plantilla que usa un
disparador o una función.

Las plantillas se usan desde la acción
[escribirle al cliente de la fila](/es/docs/data/triggers/) de un disparador y
desde [`ctx.channels.send`](/es/docs/data/functions/). `ganju channel templates`
las lista, con su estado, desde la CLI.

Fuentes: [WhatsApp Cloud API — Get Started (Meta)](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started),
[Creating a permanent WhatsApp access token](https://noem.ai/help/creating-a-permanent-access-token-for-whatsapp-business-api)
