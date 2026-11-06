---
title: Disparadores y webhooks
description: Ejecuta algo cuando cambian las filas de una tabla, o un tiempo después de la fecha de una fila — una función, un webhook firmado, un mensaje de chat, un correo o un mensaje al cliente — y cómo funcionan la entrega, los reintentos y las firmas de los webhooks.
order: 57
updated: 2026-11-06
---

Un **disparador** es una regla sobre una tabla: cuando se agrega, cambia o
elimina una fila, y se cumple una condición, Ganju ejecuta una acción. Un
pedido nuevo se publica en el grupo de la cocina; un pedido que pasa a `ready`
le escribe al cliente; cada cambio en `bookings` llega a tu propio sistema como
webhook.

Los disparadores se activan con cada escritura, venga de donde venga: el
asistente en un canal, el panel, la CLI, la API o una función. Una escritura
que se deshace (porque falló una condición, por ejemplo) no activa nada.

Un [disparador por tiempo](#disparadores-por-tiempo) se activa cuando pasa un
tiempo, sin que nada se escriba: un pedido que sigue `pending` 30 minutos
después de hecho, una reserva que nadie confirmó al mediodía del día anterior.

## Crear uno

Abre una tabla en la página de **Datos**, luego su pestaña **Disparadores**, y
haz clic en **Nuevo disparador**:

1. **Cuando**: se agrega una fila, cambia una fila, se elimina una fila o
   [pasa un tiempo](#disparadores-por-tiempo).
2. **Solo si**: opcional. Una columna y una prueba, como `status` **cambia a**
   `ready`. **Avanzado (JSON)** acepta cualquier [condición](#condiciones).
3. **Entonces**: la [acción](#acciones).
4. **Ejecuciones por minuto**: 60 por defecto, hasta 600. Pasado ese número,
   los eventos esperan y salen después.

Un disparador se puede apagar y encender desde su tarjeta. **Ejecuciones
recientes** lista cada evento que manejó, con su estado y error, y
**Reintentar** vuelve a enviar uno que falló.

Una base de datos guarda hasta 50 disparadores. Eliminar una tabla elimina sus
disparadores. Renombrar una columna la renombra en los disparadores que la
usan, en sus condiciones y en sus textos `{{columna}}`. Una columna que usa un
disparador no se puede eliminar hasta que cambies o elimines ese disparador.

## Condiciones

Una condición revisa la fila antes y después del cambio:

| Prueba | Se cumple cuando |
| --- | --- |
| `{ "status": { "changedTo": "ready" } }` | `status` ahora es `ready` y antes no |
| `{ "status": { "changedFrom": "open" } }` | `status` era `open` y ahora no |
| `{ "price": { "changed": true } }` | `price` tiene otro valor |
| `{ "zone": { "equals": "north" } }` | `zone` es `north` (en la fila después del cambio, o en la fila eliminada) |

Una fila agregada no tiene "antes", y una eliminada no tiene "después", así que
cada uno cuenta como todas las columnas vacías: una inserción **cambia a** los
valores con los que se creó, y una eliminación **cambia desde** los valores que
tenía. En un disparador de filas que cambian, `status` **cambia a** `ready` se
activa una vez, cuando el pedido queda listo, y no otra vez con cada edición
posterior de un pedido ya listo.

Las pruebas sobre varias columnas deben cumplirse todas. `all` y `any` combinan
condiciones:

```json
{
  "any": [
    { "status": { "changedTo": "ready" } },
    { "all": [{ "status": { "equals": "open" } }, { "total": { "changed": true } }] }
  ]
}
```

Los valores se comparan exactos: `3` y `3.0` coinciden, `"3"` y `3` no. `null`
significa vacío.

## Disparadores por tiempo

Elige **Pasa un tiempo** en **Cuando**, y luego cuánto tiempo y desde qué hora
de la fila:

- **La hora de la fila**: cuando se agregó (`created_at`), cuando cambió por
  última vez (`updated_at`), o una columna de fecha o de fecha y hora de la
  tabla, como el `starts_at` de una reserva.
- **Cuánto tiempo**: de 5 minutos a 30 días, **después** de esa hora, o
  **antes** en una columna de fecha o de fecha y hora (un recordatorio el día
  antes de una reserva). Una fecha sin hora cuenta desde la medianoche en la
  zona horaria de la base de datos.
- **Solo si**: se revisa en la fila tal como está cuando se cumple el plazo,
  así que la única prueba es **es** (`equals`). `status` **es** `pending` se
  activa para un pedido que sigue pendiente 30 minutos después, no para uno
  que ya se marcó listo.

Cada fila se activa una vez por cada plazo que se le cumple. En `updated_at`,
el siguiente cambio crea un plazo nuevo, así que un disparador de "sin cambios
en 2 días" se activa otra vez dos días después de cada cambio. Las filas cuyo
plazo ya se había cumplido cuando guardaste el disparador, o mientras estaba
apagado, no se activan: un disparador nuevo no envía lo acumulado.

Ganju busca filas con el plazo cumplido cada 5 minutos, así que una ejecución
puede empezar hasta 5 minutos después del plazo. La columna recibe un índice
mientras un disparador por tiempo la usa, y no se puede eliminar, ni cambiar a
un tipo que no sea fecha, hasta que cambies o elimines el disparador.

Límites: una base de datos guarda hasta 10 disparadores por tiempo, y cada uno
activa hasta 100 eventos por revisión (el resto sale en la siguiente). Los
disparadores por tiempo de una base de datos comparten 2.000 eventos al día
(UTC): al llegar ahí, cada disparador por tiempo con otra fila pendiente ese
día se apaga, su tarjeta dice por qué y los administradores de la organización
reciben un correo. Un disparador por tiempo también se apaga mientras sus
ejecuciones están en pausa (el plan ya no incluye Datos, o se agotaron las
ejecuciones del mes). Vuelve a encenderlo cuando quieras; cuenta desde ese
momento, así que lo que se cumplió mientras estaba apagado no se envía.

En `ganju.json` y en la API:

```json
{
  "name": "still-pending",
  "table": "orders",
  "on": "time",
  "after": { "column": "created_at", "minutes": 30 },
  "when": { "status": { "equals": "pending" } },
  "customer": { "text": "Tu pedido #{{id}} está tardando más de lo normal; ya lo estamos revisando." }
}
```

`minutes` es negativo para antes: `{ "column": "starts_at", "minutes": -1440 }`
es un día antes. El `event` del evento es `time`, `previous` es `null`, y
`dueAt` dice cuándo se cumplió el plazo de la fila.

## Acciones

| Acción | En `ganju.json` | Qué pasa |
| --- | --- | --- |
| Ejecutar una función | `"function": "notify-kitchen"` | La función se ejecuta con el evento. Mira [funciones que solo ejecutan los disparadores](/es/docs/data/functions/#funciones-que-solo-ejecutan-los-disparadores) |
| Llamar a un webhook | `"webhook": "https://example.com/hooks/orders"` | El evento se envía por POST como JSON, [firmado](#verificar-un-webhook) |
| Enviar un mensaje de chat | `"chat": { "channelId": "…", "chatId": "-1001234567890", "text": "Nuevo pedido #{{id}}" }` | Se publica en un grupo de Telegram o un canal de Slack o Discord donde está el bot |
| Enviar un correo | `"email": { "to": ["cocina@example.com"], "subject": "Pedido {{id}}", "text": "…" }` | Hasta 10 direcciones. El asunto por defecto es `<tabla>: {{id}}` |
| Escribirle al cliente | `"customer": { "text": "Tu pedido #{{id}} está listo." }` | Se envía al cliente cuya conversación escribió la fila, en el canal que usó |

En un mensaje, `{{columna}}` inserta el valor de esa columna de la fila, como
texto plano. También funcionan `id`, `created_at`, `updated_at` y
`participant_id`. Los mensajes nunca se envían con formato: una fila puede
tener texto que escribió un cliente.

El **correo** les llega de inmediato a los miembros de la organización.
Cualquier otra dirección recibe primero un solo correo de Ganju, con el nombre
del proyecto y de la organización, y un enlace para confirmar que quiere estos
correos. Mientras no confirme, las ejecuciones la dejan fuera: una ejecución
que le llegó a alguien más queda **ok** y dice a quién dejó fuera, y una que no
le llegó a nadie queda **omitida**. El panel y `ganju deploy` muestran quién
falta por confirmar. Una organización envía como máximo 20 de estos enlaces al
día; los demás salen al volver a guardar el disparador. Cada correo a una
dirección confirmada trae un enlace para darse de baja, y admite la baja con un
clic en las apps de correo.

**Escribirle al cliente** necesita una tabla donde **cada cliente ve solo sus
propias filas**, porque así es como una fila sabe quién es su cliente. Una fila
que escribió el dueño no tiene cliente, y su ejecución falla diciéndolo. Aplica
el límite diario por cliente del canal.

En **WhatsApp**, el texto libre solo le llega a un cliente dentro de las 24
horas siguientes a su último mensaje. Activa **Usar una plantilla de WhatsApp**,
elige una de las plantillas aprobadas por Meta en los canales de WhatsApp del
proyecto y dale a cada variable una columna de la fila o un texto fijo; junto a
cada una se ve la etiqueta que le pusiste. Las plantillas se crean en
[Plantillas de mensaje](/es/docs/channels/whatsapp/#5-plantillas-de-mensaje)
del canal. En `ganju.json`, `params` lleva un valor por variable, en orden:

```json
"customer": {
  "text": "Tu pedido #{{id}} está listo.",
  "template": { "name": "order_ready", "language": "es", "params": ["{{id}}"] }
}
```

Dentro de la ventana el cliente recibe el texto; fuera de ella, la plantilla.
Cuando puede leer las plantillas de la cuenta, Ganju revisa que esté aprobada
antes de enviarla: una en revisión,
rechazada, pausada o desactivada hace fallar la ejecución con el motivo de
Meta, y lo mismo los rechazos del propio Meta (el cliente desactivó los
mensajes de marketing, Meta limitó la calidad del número), explicados en la
lista de ejecuciones. Meta le cobra los mensajes de plantilla a tu propia
cuenta de WhatsApp. Un mensaje de chat no puede ir a WhatsApp.

Los mensajes que envía un disparador quedan en la conversación, así que el
siguiente turno del bot sabe qué se le dijo al cliente. No se cobran como
respuestas del asistente.

## Desplegar disparadores con la CLI

Ponlos en `"triggers"` dentro de `ganju.json`, junto a tus funciones, y
`ganju deploy` publica ambos:

```json
{
  "tools": [ … ],
  "triggers": [
    { "table": "orders", "on": "insert", "function": "notify-kitchen" },
    {
      "name": "order-ready",
      "table": "orders",
      "on": "update",
      "when": { "status": { "changedTo": "ready" } },
      "function": "tell-customer"
    },
    { "table": "orders", "on": "update", "webhook": "https://example.com/hooks/orders", "rateLimit": 120 }
  ]
}
```

- `on` es `insert`, `update`, `delete` o `time` (con `after`, ver
  [disparadores por tiempo](#disparadores-por-tiempo)), y cada disparador
  tiene exactamente una acción.
- Sin `name`, se arma uno con la tabla, el evento y la acción:
  `orders-insert-notify-kitchen`. Los nombres son letras minúsculas, dígitos,
  `_` y `-`. En el panel y la API, guardar un disparador sin nombre siempre
  crea uno nuevo, con un número si el nombre ya está tomado
  (`orders-insert-webhook-2`), así que nunca reemplaza a otro.
- `ganju deploy` agrega y actualiza los disparadores de la lista, y quita los
  que desplegó antes y ya no están. Los disparadores creados en el panel no se
  tocan, y un nombre que usan los dos se rechaza.
- **Renombrar una columna que usa un disparador desplegado:** ejecuta
  `ganju data column rename`, que también la renombra en el disparador, y
  luego cambia ganju.json al nombre nuevo antes del siguiente despliegue. Un
  despliegue que aún nombra la columna vieja se rechaza.
  `ganju data schema push` lee una columna renombrada como eliminar y agregar,
  y eliminar se rechaza mientras un disparador use la columna.
- **Eliminarla:** quítala del disparador en ganju.json y despliega primero;
  luego elimina la columna.
- Un disparador apagado en el panel, o por Ganju tras fallas, sigue apagado en
  los despliegues siguientes, a menos que su entrada diga `"enabled": true`.
- Si no pones `"triggers"`, un despliegue no toca los disparadores de la base
  de datos. `"triggers": []` quita los que desplegó la CLI.
- El secreto de firma de un webhook nuevo se imprime una sola vez.

En el panel, un disparador desplegado muestra **Administrado por la CLI
(ganju.json)**. Lo cambias en el archivo, pero ahí puedes apagarlo y
encenderlo.

La [API de Datos](/es/docs/data-api/) tiene lo mismo: `GET /trigger`,
`POST /trigger` (con la forma de arriba), `PATCH /trigger/:name` con
`{ "enabled": false }`, `DELETE /trigger/:name`, `POST /trigger/deploy`,
`GET /trigger/:name/run` y `POST /trigger/:name/run/:runId/retry`.

## Cómo se entregan los eventos

- **Al menos una vez.** El mismo evento puede llegar dos veces. Cada evento
  tiene un `eventId`, el mismo en cada entrega y al **Reintentar**, para que
  quien lo recibe pueda saltarse uno que ya manejó. El ejemplo data-orders lo
  guarda en la fila.
- **El orden** se mantiene por fila en lo posible, no entre filas.
- **Reintentos.** Una ejecución que falla se intenta tres veces más, esperando
  un poco más cada vez. Algunas fallas no se reintentan, porque volver a
  intentar no las cambiaría: una función que no está publicada, un cliente
  fuera de la ventana de WhatsApp, una cadena demasiado profunda.
- **Se apaga tras 20 fallas seguidas.** La tarjeta del disparador dice por qué,
  y los administradores de la organización reciben un correo. Vuelve a
  encenderlo cuando arregles la causa.
- **Ritmo.** Las ejecuciones por minuto de un disparador se cuentan desde que
  empieza cada ejecución, así que una cola acumulada también sale a ese ritmo.
- **Filas grandes.** Una fila de más de 48 KB (en bytes UTF-8) se envía sin `row` ni
  `previous`, con `truncated: true` y su `rowId`, para leerla por id.
- **Restauraciones.** Los eventos que aún esperaban cuando restauras la base de
  datos se descartan, y las filas que trae la restauración no activan
  disparadores.

### Bucles y cadenas

- Una función que ejecuta un disparador escribe a nombre de ese disparador
  (`trigger:<id>`), y esas escrituras nunca vuelven a activar el mismo
  disparador. `notify-kitchen` puede marcar el pedido que acaba de publicar sin
  publicarlo dos veces.
- Sus escrituras sí pueden activar *otros* disparadores, un nivel más abajo.
  Una cadena se detiene en tres niveles, y la ejecución que iría más abajo
  falla con ese error.

## Verificar un webhook

Un disparador de webhook recibe un secreto que empieza por `whsec_`. Se muestra
una sola vez, al crear el disparador (o `ganju deploy` lo imprime una vez).
Guárdalo junto a tu receptor.

Cada evento es un `POST` con un cuerpo JSON:

```json
{
  "eventId": "…",
  "triggerId": "trg_…",
  "trigger": "orders-update-webhook",
  "table": "orders",
  "event": "update",
  "rowId": 42,
  "row": { "id": 42, "status": "ready", "total": 56000, … },
  "previous": { "id": 42, "status": "open", "total": 56000, … },
  "actor": "user:…",
  "at": "2026-11-03T15:04:05Z"
}
```

El evento de un disparador por tiempo trae `"event": "time"`, `"previous":
null`, `"actor": null` y `dueAt`, cuándo se cumplió el plazo de la fila.

y estos encabezados:

| Encabezado | Valor |
| --- | --- |
| `x-ganju-signature` | `t=<segundos unix>,v1=<firma>` |
| `x-ganju-event-id` | El `eventId` |
| `x-ganju-event` | `<tabla>.<evento>`, como `orders.update` u `orders.time` |
| `x-ganju-trigger` | El nombre del disparador |

La firma es el HMAC-SHA256 en hexadecimal de `<t>.<cuerpo crudo>`, con el
secreto como clave. Para revisarla, recalcúlala sobre el cuerpo tal como
llegó, antes de interpretarlo, compara en tiempo constante y rechaza un `t`
viejo:

```js
import crypto from 'node:crypto';
import express from 'express';

const SECRET = process.env.GANJU_WEBHOOK_SECRET; // whsec_…
const TOLERANCE_SECONDS = 5 * 60;

const verify = (header, rawBody) => {
  const parts = Object.fromEntries(
    (header ?? '').split(',').map(part => part.split('='))
  );
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isInteger(t)) return false;
  if (Math.abs(Date.now() / 1000 - t) > TOLERANCE_SECONDS) return false;
  const expected = crypto
    .createHmac('sha256', SECRET)
    .update(`${t}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(parts.v1, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const app = express();
app.post(
  '/hooks/orders',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const raw = req.body.toString('utf8');
    if (!verify(req.get('x-ganju-signature'), raw)) return res.sendStatus(401);
    const event = JSON.parse(raw);
    // Sáltate un eventId que ya manejaste, y luego haz el trabajo.
    res.sendStatus(200);
  }
);
app.listen(3000);
```

Responde con un `2xx` en menos de 10 segundos. Cualquier otra cosa, incluida
una redirección, es una falla y se reintenta. Cada entrega se firma de nuevo
con un `t` nuevo. La URL debe ser `https`, y las direcciones privadas o locales
se rechazan.

## Uso y límites

- Cada ejecución cuenta en el bloque **Datos** de la página de facturación,
  como ejecución de disparador. Una ejecución que llama a una función cuenta
  también como llamada a una herramienta propia.
- En **Pro**, los disparadores se ejecutan hasta 5.000.000 de veces al mes.
  Pasado ese número, se pausan hasta el siguiente periodo de facturación, y los
  administradores de la organización reciben un correo. Enterprise no tiene
  ese límite.
- Los disparadores de correo se ejecutan hasta 500 veces cada 24 horas por
  organización en Pro, y 5.000 en Enterprise. El límite cuenta ejecuciones, y
  cada una escribe a hasta 10 direcciones. Pasado ese número, las ejecuciones
  se omiten y lo dicen.
- Si el plan de la organización ya no incluye Datos, los disparadores se
  pausan: sus ejecuciones se omiten.
