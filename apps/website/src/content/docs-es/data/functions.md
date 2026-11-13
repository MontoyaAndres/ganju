---
title: Datos desde funciones
description: Lee y escribe la base de datos del proyecto desde tus propias funciones con ctx.data, escríbeles a clientes y chats del equipo con ctx.channels, y deja una función solo para disparadores y programaciones.
order: 56
updated: 2026-11-13
---

Tus [funciones](/es/docs/tools/functions/) llegan a la
[base de datos](/es/docs/data/) del proyecto con `ctx.data`. Cada llamada pasa
por la plataforma, con las mismas reglas que el panel y el asistente: una fila
por debajo del mínimo de una columna se rechaza, una escritura que debe pasar
completa pasa completa o no pasa, y cada cambio queda registrado a nombre de la
función que lo hizo.

Una función no envía SQL. Para un reporte que los filtros no pueden expresar,
guarda una [consulta](/es/docs/data/#consultas-guardadas) y ejecútala por
nombre.

## `ctx.data`

| Llamada | Qué hace |
| --- | --- |
| `describe(table?)` | Tablas, columnas, número de filas y descripciones; una tabla si la nombras |
| `query({ table, where, search, sort, limit, cursor, include, aggregate, groupBy })` | Busca filas, o las cuenta, suma y promedia |
| `search(table, text, options?)` | Búsqueda de texto completo en las columnas buscables de una tabla, mejores resultados primero |
| `insert(table, values)` | Una fila; devuelve `{ id }`. Pasa una lista de filas (hasta 500) para agregar varias; devuelve `{ ids }` |
| `update(table, idOrWhere, set, { where?, expect? })` | Cambia una fila por id, o las filas que coinciden con un filtro; devuelve `{ changed }` |
| `delete(table, idOrWhere, { where?, expect? })` | Las elimina; devuelve `{ changed }` |
| `write(operations)` | Hasta 50 inserciones, cambios y eliminaciones, aplicadas juntas o ninguna |
| `run(name, params?, { limit? })` | Una consulta guardada, por nombre; devuelve `{ query, rows, truncated? }` |

### Filtros

`where` usa los mismos filtros que la API de Datos y el asistente:

```ts
{ status: 'open' }                              // igual a
{ price: { lt: 30000 } }                        // eq, ne, gt, gte, lt, lte
{ status: { in: ['open', 'ready'] } }           // in, notIn (hasta 50 valores)
{ name: { contains: 'pizza' } }                 // contains, startsWith (sin importar mayúsculas)
{ note: { isNull: true } }                      // vacío, o no
{ 'customer.name': 'Ana' }                      // una columna de la fila relacionada
{ or: [{ status: 'open' }, { total: { gte: 100000 } }] }
```

Varias claves deben cumplirse todas; `or` coincide con cualquiera de sus
filtros, y `and` los agrupa. Una fecha y hora sin desfase se lee en la
[zona horaria](/es/docs/data/#zona-horaria) de la base de datos.

### Leer filas

```ts
const { rows, nextCursor } = await ctx.data.query({
  table: 'orders',
  where: { status: 'open' },
  sort: ['-created_at'],
  include: ['customer'],
  limit: 50
});
```

- Una página tiene 20 filas por defecto, hasta 500 (o 1 MB). Pasa `nextCursor`
  como `cursor` para leer la siguiente.
- `sort` es una lista de hasta 3 columnas; un `-` delante ordena de mayor a
  menor.
- Una columna de relación vuelve como `{ id, label }`, e `include` trae en su
  lugar la fila relacionada completa.
- Una columna de archivo vuelve como `{ uri, title, mimeType }`, o
  `{ uri, missing: true }` cuando el archivo se eliminó de Recursos. Lee el
  archivo con `ctx.resources.read(uri)`; escribe la columna con el uri.
- Las fechas y horas vuelven en la zona horaria de la base de datos, con su
  desfase.

Para contar o sumar en vez de listar, pasa `aggregate`, y `groupBy` (hasta 3
columnas) para un resultado por grupo:

```ts
const { groups } = await ctx.data.query({
  table: 'orders',
  where: { created_at: { gte: '2026-11-01T00:00:00-05:00' } },
  aggregate: [{ fn: 'count' }, { fn: 'sum', column: 'total' }],
  groupBy: ['status']
});
```

`fn` es `count`, `sum`, `avg`, `min` o `max`. `times` multiplica antes de
sumar: `{ fn: 'sum', column: 'stock', times: 'unit_cost' }` es el valor del
inventario.

### Escribir filas

```ts
const { id } = await ctx.data.insert('orders', { customer: 7, status: 'open' });
await ctx.data.update('menu', 12, { stock: { decrement: 2 } }, { where: { stock: { gte: 2 } } });
await ctx.data.delete('orders', { status: 'cancelled' });
```

Un número puede cambiar respecto a sí mismo con `{ increment: n }` o
`{ decrement: n }`. `where` en las opciones es una condición que debe
cumplirse, y `expect` dice cuántas filas deben cambiar; si alguna falla, no se
escribe nada y la llamada lanza un error.

Una llamada rechazada lanza un error, con un mensaje escrito para una persona:
"menu.stock can't go below 0".

## Registrar un pedido en un solo paso

Del [ejemplo data-orders](https://github.com/MontoyaAndres/ganju/tree/main/examples/data-orders):
el pedido, una línea por plato que apunta a él y el inventario descontado, en un
solo `write`. `{ $ref: 0 }` es el id que creó la primera inserción. Cada cambio
de inventario lleva una condición, así que dos clientes que piden la última
pizza no pueden recibirla los dos: la segunda escritura falla completa y no se
guarda nada de ella.

```ts
import { defineTool } from '@ganju/sdk';

export default defineTool<{ dish: number; quantity: number }>(
  async (input, ctx) => {
    const { results } = await ctx.data.write([
      { op: 'insert', table: 'orders', values: { status: 'open' } },
      {
        op: 'insert',
        table: 'order_lines',
        values: { order: { $ref: 0 }, dish: input.dish, quantity: input.quantity }
      },
      {
        op: 'update',
        table: 'menu',
        id: input.dish,
        set: { stock: { decrement: input.quantity } },
        where: { stock: { gte: input.quantity } }
      }
    ]);
    return { order: (results[0] as { id: number }).id };
  }
);
```

Cada resultado dice qué hizo su paso: `{ op: 'insert', table, id }` (o `ids`
para varias filas) y `{ op: 'update' | 'delete', table, changed }`.

## Qué puede tocar una función

Por defecto, una función puede leer y escribir todas las tablas. Restríngela
con `data` en la herramienta dentro de `ganju.json`:

```json
{
  "name": "sales-report",
  "entry": "src/salesReport.ts",
  "data": { "access": "read", "tables": ["menu", "orders", "order_lines"] }
}
```

- `access`: `read` o `write`.
- `tables`: las únicas tablas que ve. Las demás no existen para ella, tampoco en
  filtros ni relaciones.

Esto lo hace cumplir la plataforma, no tu script. Úsalo en cualquier función
que un bot de canal llame después de leer lo que escribió un cliente. `tables`
limita lo que la función nombra, no lo que hace el esquema: eliminar una fila
igual elimina las filas que apuntan a ella con "eliminar también estas filas",
también en tablas fuera de la lista.

**Una función ve todas las filas, incluso en tablas donde cada cliente ve solo
las suyas.** Cuando un bot de canal llama a una función, la llamada no dice qué
cliente está hablando, y lo que diga sobre el cliente su entrada lo escribió el
modelo. No lo tomes como quién es.

Los cambios que hace una función quedan como `function:<nombre>` en el
historial de la fila.

## `ctx.channels`

Escríbeles a los clientes y a los chats del equipo del proyecto. Los mensajes
salen como el bot, en texto plano, y quedan en la conversación, así que el
siguiente turno del bot sabe qué se le dijo al cliente. No se cobran como
respuestas del asistente.

Una función solo tiene `ctx.channels` si lo pide: pon `"channels": true` en
ella en `ganju.json`, o activa **Puede escribir por los canales** en su diálogo
de la pestaña Funciones. Sin eso, cada llamada lanza "… can't use
ctx.channels". `ganju deploy` muestra qué funciones lo tienen. Las versiones
publicadas antes de que existiera este ajuste conservan `ctx.channels`;
agrégalo a `ganju.json` antes de volver a desplegarlas.

```json
{
  "name": "tell-customer",
  "entry": "src/tellCustomer.ts",
  "channels": true
}
```

```ts
// Un cliente con el que el bot ya habló, en su chat privado
await ctx.channels.send({
  participantId: order.participant_id,
  text: `Tu pedido #${order.id} está listo.`
});

// Un chat donde está el bot: un grupo de Telegram, o un canal de Slack o Discord
await ctx.channels.post({
  channelId: await ctx.secret('KITCHEN_CHANNEL_ID'),
  chatId: await ctx.secret('KITCHEN_CHAT_ID'),
  text: 'Nuevo pedido #42: 2× Margherita'
});
```

- **`send`** escribe en la conversación privada más reciente del cliente, en el
  canal que usó. Aplica el límite diario por cliente del canal. Una fila de una
  tabla donde cada cliente ve solo sus propias filas trae al cliente en
  `participant_id`. Devuelve `{ messageId, conversationId, channelId,
  platform, sent }`, donde `sent` es `text` o `template`.
- **WhatsApp** solo acepta texto libre dentro de las 24 horas siguientes al
  último mensaje del cliente. Después solo le llega una plantilla aprobada por
  Meta; pásala como `template: { name, language, params }`, con un valor por
  variable. Si das `text` y `template`, Ganju elige según el cliente. Sin
  plantilla, `send` lanza un error: "Outside WhatsApp's 24-hour window … use an
  approved template." Cuando puede leer las plantillas de la cuenta, Ganju
  revisa que la plantilla esté aprobada antes de llamar a Meta, y lanza un
  error con el motivo de Meta cuando está en revisión, rechazada, pausada o
  desactivada. Meta le cobra los mensajes de plantilla a tu propia cuenta de
  WhatsApp. Telegram, Slack y Discord no tienen ventana y aceptan el texto.
- **`templates()`** lista las plantillas aprobadas por Meta en los canales de
  WhatsApp del proyecto que Ganju puede enviar, cada una con su `channelId`,
  `name`, `language`, `category`, `text` y `variables` (`{ n, label, example }`),
  para que una función elija una. Las plantillas se crean en
  [Plantillas de mensaje](/es/docs/channels/whatsapp/#5-plantillas-de-mensaje)
  del canal.
- **`post`** recibe el id del canal que muestra el panel y el id del chat en la
  plataforma, como `-1001234567890` para un grupo de Telegram. No publica en
  WhatsApp.

## Funciones que solo ejecutan los disparadores

Una función que ejecuta un [disparador](/es/docs/data/triggers/) o una
[programación](/es/docs/data/schedules/) (avisarle a la cocina, escribirle al
cliente, enviar el reporte de la noche) no debería ser una herramienta que el
asistente pueda llamar. Ponle `"expose": false` en `ganju.json`, o apaga **El
asistente puede usar esta función** en su diálogo de la pestaña Funciones:

```json
{
  "name": "tell-customer",
  "entry": "src/tellCustomer.ts",
  "expose": false,
  "channels": true,
  "data": { "access": "read", "tables": ["orders"] }
}
```

Sigue desplegada, y muestra la etiqueta **Solo disparadores**. El asistente
nunca la ve, ni en canales ni en clientes MCP, y no cuenta para el límite de
herramientas del proyecto.

Un disparador la llama con el evento en lugar de los argumentos del modelo:

```ts
import { defineTool, type TriggerEvent } from '@ganju/sdk';

export default defineTool<TriggerEvent>(async (event, ctx) => {
  const order = event.row;
  if (typeof order?.participant_id !== 'string') return { skipped: 'no customer' };
  const sent = await ctx.channels.send({
    participantId: order.participant_id,
    text: `Tu pedido #${order.id} está listo. ¡Gracias!`
  });
  return { sent: sent.sent };
});
```

| Campo | Qué es |
| --- | --- |
| `event` | `insert`, `update`, `delete`, `time` (se cumplió el plazo de la fila en un [disparador por tiempo](/es/docs/data/triggers/#disparadores-por-tiempo)) o `schedule` |
| `table` | El nombre de la tabla; vacío en `schedule` |
| `row` | La fila después del cambio; `null` al eliminar y en `schedule`. En `time`, la fila como estaba cuando se cumplió el plazo |
| `previous` | La fila antes del cambio; `null` al insertar, en `time` y en `schedule` |
| `actor` | Quién hizo el cambio: `channel:<cliente>`, `user:<id>`, `function:<nombre>`…; `null` en `time` |
| `eventId` | El mismo en cada entrega de este evento. Úsalo para saltarte una repetición |
| `triggerId` | El disparador que la ejecutó |
| `dueAt` | En `time` y `schedule`: cuándo se cumplió el plazo (ISO 8601, UTC) |
| `truncated`, `rowId` | Vienen cuando la fila era demasiado grande para enviarla. Léela con `ctx.data.query({ table, where: { id: rowId } })` |
| `date` | En `schedule`: la fecha de la ejecución en la zona horaria de la base de datos (`YYYY-MM-DD`) |
| `query`, `rows`, `rowCount` | En `schedule` con una consulta: su nombre, sus filas (hasta 200) y cuántas devolvió (contadas hasta 500) |
| `rowsTruncated`, `rowCountMore` | En `schedule`: algunas filas quedaron fuera por tamaño; había más filas de las contadas |

La función de una programación recibe las filas directamente:

```ts
export default defineTool<TriggerEvent>(async (event, ctx) => {
  const total = (event.rows ?? []).reduce((sum, r) => sum + Number(r.total ?? 0), 0);
  await ctx.channels.post({
    channelId: await ctx.secret('KITCHEN_CHANNEL_ID'),
    chatId: await ctx.secret('KITCHEN_CHAT_ID'),
    text: `${event.date}: ${event.rowCount ?? 0} pedidos, ${total} en ventas`
  });
});
```

La fila es contenido que pudo escribir un cliente. Pásala a un modelo de IA como
texto no confiable, nunca como instrucciones.

Las escrituras de una función que ejecutó un disparador quedan a nombre de ese
disparador, nunca vuelven a activar ese mismo disparador y pueden activar otros
un nivel más abajo. Mira
[Disparadores y webhooks](/es/docs/data/triggers/#bucles-y-cadenas).

## Uso

Cada llamada a `ctx.data` cuenta como una solicitud a la base de datos en el
bloque **Datos** de la página de facturación, con las filas que leyó y
escribió. Una función que ejecuta un disparador o una programación cuenta como
una llamada a una herramienta propia, igual que una que llama el asistente.
