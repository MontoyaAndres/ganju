---
title: Datos desde funciones
description: Lee y escribe la base de datos del proyecto desde tus propias funciones con ctx.data, escríbeles a clientes y chats del equipo con ctx.channels, y deja una función solo para disparadores.
order: 56
updated: 2026-11-03
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
| `insert(table, values)` | Una fila; devuelve `{ id }`. Pasa una lista de filas para agregar varias; devuelve `{ ids }` |
| `update(table, idOrWhere, set, { where?, expect? })` | Cambia una fila por id, o las filas que coinciden con un filtro |
| `delete(table, idOrWhere, { where?, expect? })` | Las elimina |
| `write(operations)` | Varias inserciones, cambios y eliminaciones, aplicadas juntas o ninguna |
| `run(name, params?, { limit? })` | Una consulta guardada, por nombre |

`where` usa los mismos filtros que la API de Datos: `{ status: "open" }`,
`{ price: { lt: 30000 } }`, `{ name: { contains: "pizza" } }`, combinados con
`or`. Una página tiene hasta 500 filas; `nextCursor` lee la siguiente. Una
columna de relación vuelve como `{ id, label }`, e `include` trae la fila
relacionada completa.

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
  `participant_id`.
- **WhatsApp** solo acepta texto libre dentro de las 24 horas siguientes al
  último mensaje del cliente. Después solo le llega una plantilla aprobada por
  Meta; pásala como `template: { name, language, params }`. Si das `text` y
  `template`, Ganju elige según el cliente. Sin plantilla, `send` lanza un
  error: "Outside WhatsApp's 24-hour window … use an approved template." Meta le
  cobra los mensajes de plantilla a tu propia cuenta de WhatsApp.
- **`post`** recibe el id del canal que muestra el panel y el id del chat en la
  plataforma, como `-1001234567890` para un grupo de Telegram. No publica en
  WhatsApp.

## Funciones que solo ejecutan los disparadores

Una función que ejecuta un [disparador](/es/docs/data/triggers/) — avisarle a
la cocina, escribirle al cliente — no debería ser una herramienta que el
asistente pueda llamar. Ponle `"expose": false` en `ganju.json`, o apaga **El
asistente puede usar esta función** en su diálogo de la pestaña Funciones:

```json
{
  "name": "tell-customer",
  "entry": "src/tellCustomer.ts",
  "expose": false,
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
| `event` | `insert`, `update` o `delete` |
| `table` | El nombre de la tabla |
| `row` | La fila después del cambio; `null` al eliminar |
| `previous` | La fila antes del cambio; `null` al insertar |
| `actor` | Quién hizo el cambio: `channel:<cliente>`, `user:<id>`, `function:<nombre>`… |
| `eventId` | El mismo en cada entrega de este evento. Úsalo para saltarte una repetición |
| `triggerId` | El disparador que la ejecutó |
| `truncated`, `rowId` | Vienen cuando la fila era demasiado grande para enviarla. Léela con `ctx.data.query({ table, where: { id: rowId } })` |

Las escrituras de una función que ejecutó un disparador quedan a nombre de ese
disparador, nunca vuelven a activar ese mismo disparador y pueden activar otros
un nivel más abajo. Mira
[Disparadores y webhooks](/es/docs/data/triggers/#bucles-y-cadenas).

## Uso

Cada llamada a `ctx.data` cuenta como una solicitud a la base de datos en el
bloque **Datos** de la página de facturación, con las filas que leyó y
escribió. Una función que ejecuta un disparador cuenta como una llamada a una
herramienta propia, igual que una que llama el asistente.
