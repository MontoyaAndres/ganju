---
title: API de Datos
description: Administra las tablas y filas de un proyecto por HTTP — crea tablas, inserta y busca filas, registra pedidos sin errores y exporta — con un token de acceso personal.
order: 7
updated: 2026-10-21
---

Cada proyecto en **Pro** o **Enterprise** puede tener su propia **base de
datos**: tablas con columnas tipadas, relaciones entre ellas y búsqueda de texto
completo. La **API de Datos** es la forma de administrarla desde tu propio
código. El panel y la CLI usan las mismas rutas, así que todo lo que ellos
hacen, tu código también lo puede hacer.

La referencia completa es un archivo OpenAPI:
[`https://api.ganju.ai/openapi/data.json`](https://api.ganju.ai/openapi/data.json).
Cárgalo en Postman, Insomnia o un generador de código.

## Autenticación

Crea un token de acceso personal para el proyecto con la CLI y envíalo como
token bearer:

```bash
ganju token create "sincronizar pedidos" --expires 90
```

```bash
export GANJU_TOKEN=ganju_pat_...
export DATA=https://api.ganju.ai/organization/<organizationId>/project/<projectId>/artifact/data
curl -H "Authorization: Bearer $GANJU_TOKEN" $DATA
```

Un token solo llega al proyecto para el que se creó. Cada token puede hacer 120
solicitudes por minuto a cada ruta. Si pasa de ese límite, la API responde
`429`: espera un minuto y vuelve a intentarlo.

## Crear la base de datos y una tabla

```bash
curl -X POST -H "Authorization: Bearer $GANJU_TOKEN" $DATA

curl -X POST -H "Authorization: Bearer $GANJU_TOKEN" -H "Content-Type: application/json" \
  $DATA/table -d '{
    "name": "menu",
    "displayColumn": "name",
    "columns": [
      { "name": "name",  "type": "text",    "required": true, "searchable": true },
      { "name": "price", "type": "integer", "min": 0 },
      { "name": "stock", "type": "integer", "min": 0, "default": 0 },
      { "name": "size",  "type": "enum",    "values": ["30cm", "40cm"] }
    ]
  }'
```

Los tipos de columna son `text`, `long_text`, `integer`, `decimal`, `boolean`,
`date`, `datetime`, `enum`, `json`, `email`, `url`, `phone`, `relation` y
`file`. Una `relation` indica la tabla a la que apunta y qué pasa cuando se
borra esa fila (`restrict`, `cascade` o `set_null`).

Cada fila tiene además `id`, `created_at`, `updated_at` y `version`. La base de
datos los asigna; nunca los envías tú.

## Insertar, leer y buscar filas

```bash
# Una fila, o hasta 500 a la vez con "rows"
curl -X POST ... $DATA/table/menu/row -d '{ "values": { "name": "Margarita", "price": 28000, "stock": 10 } }'
curl -X POST ... $DATA/table/menu/row -d '{ "rows": [{ "name": "Hawaiana" }, { "name": "Pepperoni" }] }'

# Filtrar, ordenar, buscar y paginar
curl ... "$DATA/table/menu/row?where=%7B%22price%22%3A%7B%22lt%22%3A30000%7D%7D&sort=-price&limit=50"
curl ... "$DATA/table/menu/row?q=pizza"
```

- **`where`** es JSON: `{"status":"open"}`, `{"price":{"lt":30000}}`,
  `{"name":{"contains":"pizza"}}`, que puedes combinar con `and` / `or`.
- **`sort`** es una lista de columnas. Pon `-` delante de una columna para
  ordenar de mayor a menor: `-created_at,name`.
- **`q`** busca en las columnas marcadas como `searchable`, con los mejores
  resultados primero.
- **`include`** trae las filas relacionadas: `include=customer`.
- Una página tiene hasta 500 filas (1 MB). Si hay más, la respuesta trae
  `nextCursor`; envíalo como `cursor` para leer la página siguiente.

En JavaScript:

```js
const res = await fetch(`${DATA}/table/menu/row?q=${encodeURIComponent('pizza')}`, {
  headers: { Authorization: `Bearer ${process.env.GANJU_TOKEN}` }
});
const { rows, nextCursor } = await res.json();
```

## Cambiar y borrar filas sin perder ediciones

Cada fila tiene una `version` que sube en uno con cada cambio. Envía la versión
que leíste:

```bash
curl -X PATCH ... $DATA/table/menu/row/12 -d '{ "set": { "price": 30000 }, "version": 3 }'
curl -X DELETE ... $DATA/table/menu/row/12 -d '{ "version": 4 }'
```

Puede que alguien cambie la fila después de que la leíste. Si pasa, la
respuesta es **409**, con la fila como está ahora en `details.current` y quién
la cambió en `details.updatedBy`. Vuelve a leerla e inténtalo de nuevo. Para
sobrescribir su cambio, envía la solicitud sin `version`.

## Registrar un pedido sin errores

`POST /write` recibe una lista de inserciones, cambios y borrados en varias
tablas. Se aplican todos juntos, o ninguno. Un paso posterior puede usar el id
de una inserción anterior como `{ "$ref": <paso> }`, en sus valores o como el
`id` de la fila que cambia o borra. Un cambio puede restar o sumar a un número,
con una condición:

```bash
curl -X POST ... $DATA/write -d '{
  "operations": [
    { "op": "insert", "table": "orders", "values": { "customer": "Ana" } },
    { "op": "insert", "table": "order_lines",
      "values": { "order": { "$ref": 0 }, "product": 12, "qty": 2 } },
    { "op": "update", "table": "menu", "id": 12,
      "set": { "stock": { "decrement": 2 } }, "where": { "stock": { "gte": 2 } } }
  ]
}'
```

Si dos clientes piden la última pizza al mismo tiempo, un pedido pasa. El otro
recibe un 409 ("changed 0 rows, expected 1"), y no se guarda ninguno de sus
pasos.

## Cambiar las tablas

| Ruta | Qué hace |
| --- | --- |
| `GET /table` | Tablas, columnas y relaciones |
| `POST /table` | Crea una tabla |
| `PATCH /table/:table` | Le cambia el nombre, la etiqueta, la descripción o la configuración |
| `DELETE /table/:table` | La elimina. Envía `{ "confirmName": "<tabla>" }` |
| `POST /table/:table/column` | Agrega una columna |
| `PATCH /table/:table/column/:column` | Le cambia el nombre o la configuración a una columna, incluido su tipo |
| `DELETE /table/:table/column/:column` | Elimina una columna |
| `GET /change` | El registro de estos cambios: quién, qué y cuándo |

Antes de cambiar el tipo de una columna se revisan todos sus valores. Si alguno
no cabe en el tipo nuevo, el cambio se rechaza y la respuesta lista las
primeras 10 filas que no caben. Eliminar una tabla o una columna, y cambiar un
tipo, responde con un `bookmark`. Para deshacer el cambio, restaura a ese
punto.

## Historial, restauración y exportación

- **`GET /table/:table/row/:id/history`**: cada cambio a una fila en los
  últimos 90 días, con quién lo hizo. Un cambio hecho con un token aparece como
  `cli:<id del token>`.
- **`POST /restore-point`**: deja la base de datos completa como estaba en un
  momento de los últimos 30 días (`{ "timestamp": "2026-10-20T15:00:00-05:00" }`),
  o en el `bookmark` con el que respondió una tabla o columna eliminada, un
  cambio de tipo o una restauración anterior. La respuesta trae un `undoBookmark` que deshace la
  restauración.
- **`POST /export`**: empieza una copia de la base de datos: un archivo JSONL
  o CSV por tabla, más `schema.json`. Consulta `GET /export` hasta que su
  `status` sea `done`, y luego descarga cada archivo con
  `GET /export/file?exportId=<id>&table=<tabla>`. Sin `table`, descargas
  `schema.json`. Las exportaciones también funcionan durante los 7 días
  después de eliminar la base de datos.

## Errores

Los errores son JSON con un `error` legible y un `code`:

| Estado | Cuándo |
| --- | --- |
| `400` | La solicitud no es válida. `errors` lista cada campo |
| `402` | El plan de la organización no incluye Datos |
| `403` | El token es de otro proyecto, o la base de datos quedó de solo lectura tras bajar de plan |
| `404` | No hay una base de datos, tabla o fila con ese nombre |
| `409` | Una `version` desactualizada, una condición que no cambió nada, un cambio por debajo del mínimo de una columna, una restricción (por ejemplo, hay filas que todavía apuntan a esta) o una base de datos llena |
| `429` | Demasiadas solicitudes con este token |
