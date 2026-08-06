---
title: WhatsApp
description: Conecta la Cloud API de WhatsApp Business (Meta) — crea un token permanente de usuario del sistema, toma tu ID de número de teléfono y apunta el webhook a Ganju.
order: 52
updated: 2026-07-07
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
3. Suscribe el webhook al campo **`messages`**.

Una vez verificado, los mensajes enviados a tu número de WhatsApp llegan a tu
asistente.

Fuentes: [WhatsApp Cloud API — Get Started (Meta)](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started),
[Creating a permanent WhatsApp access token](https://noem.ai/help/creating-a-permanent-access-token-for-whatsapp-business-api)
