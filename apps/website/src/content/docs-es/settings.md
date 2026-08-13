---
title: Configuración
description: La sala de control de tu organización — renómbrala, administra la facturación y el consumo, invita miembros, trae tus propios modelos de lenguaje y maneja las acciones destructivas.
order: 6
updated: 2026-07-07
---

**Settings** es la sala de control de tu organización. Un submenú a la izquierda
salta entre cada área — **Organization**, **Billing & plan**, **Members**,
**Projects**, **Models** y la **Danger zone**.

## Organización

La sección **Organization** muestra cuándo se creó, cuántos proyectos y miembros
tiene, y te permite renombrarla.

## Facturación y plan

**Billing & plan** muestra tu plan actual, su fecha de renovación y tu consumo
frente a cada cuota. **Manage billing** abre el portal de clientes de Stripe; en el
plan Gratis verás **Upgrade to Pro** en su lugar. La captura de abajo muestra una
organización **Pro** — `Pro plan · active`, con las respuestas del asistente
medidas contra las `3,000` incluidas.

![La página de Settings mostrando los detalles de Organization y el desglose de consumo de Billing & plan del plan Pro](/images/settings-1.webp)

### Compara los planes

|                                     | **Gratis**                                    | **Pro**                                  | **Empresarial**       |
| ----------------------------------- | --------------------------------------------- | ---------------------------------------- | --------------------- |
| Precio                              | $0                                            | **$29 / mes**                            | A la medida           |
| Respuestas del asistente incluidas  | **100 / mes**                                 | **3.000 / mes**                          | Ilimitadas            |
| Pasadas las respuestas incluidas    | El asistente se pausa — mejora para continuar | Sigue funcionando — se factura como consumo | Condiciones a la medida |
| Contenido con embeddings (RAG)      | 5 MB                                          | 5 GB                                     | Ilimitado             |
| Almacenamiento de archivos          | 30 MB                                         | Ilimitado                                | Ilimitado             |
| Proyectos                           | 1                                             | Ilimitados                               | Ilimitados            |
| Prompts por asistente               | 3                                             | Ilimitados                               | Ilimitados            |
| Herramientas por asistente          | 7                                             | Ilimitadas                               | Ilimitadas            |
| Canales por asistente               | 1                                             | Ilimitados                               | Ilimitados            |
| Invitar miembros al equipo          | —                                             | ✓                                        | ✓                     |
| Traer tu propio modelo              | —                                             | ✓                                        | ✓                     |

**Empresarial** es un plan a la medida para organizaciones grandes — todo lo de
Pro, más usar Ganju como proxy de tu propio servidor MCP, una dirección web y
herramientas a la medida, SSO y condiciones contractuales, y soporte dedicado con
tiempos de respuesta garantizados. El precio y las cuotas se acuerdan
directamente — [habla con ventas](/es/contacto).

### Cómo funciona de verdad la cuota de mensajes

El número que hay que entender es el de **respuestas del asistente**. Solo cuentan
las _respuestas_ de tu asistente — los mensajes entrantes de los usuarios siempre
son gratis.

Todos los planes incluyen una cuota de respuestas que corren sobre el **modelo
compartido de Ganju**. Como Ganju paga esa inferencia, el modelo compartido es una
_cuota_, no algo ilimitado:

- **Gratis** — 100 respuestas al mes sobre el modelo compartido. Cuando llegas al
  tope, el asistente se pausa hasta el siguiente ciclo, o mejoras de plan. El plan
  Gratis no puede traer su propia llave de modelo.
- **Pro** — 3.000 respuestas al mes incluidas, de las cuales hasta **1.000 pueden
  correr sobre el modelo compartido**. Pasadas esas 1.000, las respuestas
  compartidas siguen funcionando y se facturan a la tarifa compartida de abajo.
  Agregar tu propia llave de proveedor en [Models](#models--trae-el-tuyo) las
  mueve a la tarifa con llave propia, mucho más barata, que es lo que hace casi
  todo el mundo al llegar a volumen real.

### Consumo adicional (Pro)

Pro no suma nada a tu cuenta hasta que pasas de los montos incluidos:

- **Respuestas adicionales con tu propia llave de modelo** — $2 por cada 1.000. Es
  una **tarifa de plataforma** por ejecutar las herramientas y el cómputo de cada
  turno — _no_ una reventa de tokens del modelo (a tu proveedor le pagas directo
  con tu llave).
- **Respuestas adicionales con el modelo de Ganju** — $15 por cada 1.000 más allá
  de las primeras 1.000. Es más alta porque Ganju compra esa inferencia por ti, así
  que cubre un costo real y no solo el trabajo de plataforma.
- **Contenido con embeddings (RAG) adicional** — $0,50 por GB más allá de los 5 GB
  incluidos.
- **Dominio propio** — complemento de $15 / mes.

> ¿Quieres más gratis? Ganju es Apache-2.0 — puedes instalarlo por tu cuenta y
> correrlo con tus propias llaves sin estos topes.

## Miembros y proyectos

Invita a tus compañeros a la organización por **correo** — aceptan la invitación
dentro de la app — y cada miembro tiene un rol (quien la crea es el **Owner**; los
demás son **Admins**). Más abajo, **Projects** lista cada proyecto de la
organización; cada uno tiene su propia lista de miembros, así controlas exactamente
quién puede acceder a cuál proyecto.

![La sección Members y la sección Projects, cada una con un campo de invitación por correo y los roles de los miembros](/images/settings-2.webp)

## Models — trae el tuyo

Por defecto tus canales usan el modelo **del sistema**, pero en **Models** puedes
traer el tuyo. Selecciona **Add model** y completa:

- **Display name** — una etiqueta para reconocerlo (por ejemplo, "Mi asistente").
- **Model** — elige del catálogo: modelos de Anthropic (Claude), OpenAI (GPT) o
  Google (Gemini).
- **API key** — tu propia llave para ese proveedor; se guarda de forma segura.
- **Base URL** _(opcional)_ — apunta a un endpoint compatible o a un proxy.
- **System prompt** _(opcional)_ — una instrucción persistente que define cómo se
  comporta este modelo.

Agrega un modelo una vez y reutilízalo en cualquier [canal](/es/docs/channels) de la
organización — cada canal puede elegir uno de tus modelos configurados o volver al
modelo del sistema.

![El formulario New model con los campos de nombre visible, modelo, llave de API, URL base y prompt de sistema](/images/settings-4.webp)

## Zona de peligro

La **Danger zone** contiene las acciones destructivas que afectan a toda la
organización. **Remove organization** elimina de forma permanente la organización y
todo lo que hay dentro — cada proyecto, canal, conversación, mensaje, recurso,
herramienta y modelo. No se puede deshacer, así que te pide confirmar. Solo el
**Owner** puede eliminar la organización.

![La Danger zone con la acción Remove organization y su advertencia de eliminación permanente](/images/settings-3.webp)
