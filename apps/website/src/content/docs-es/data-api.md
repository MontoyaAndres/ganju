---
title: API de Datos
description: Administra las tablas y filas de un proyecto por HTTP — crea tablas, inserta y busca filas, registra pedidos sin errores y exporta — con un token de acceso personal.
order: 7
updated: 2026-11-06
---

Cada proyecto en **Pro** o **Enterprise** puede tener su propia **base de
datos**: tablas con columnas tipadas, relaciones entre ellas y búsqueda de texto
completo. La **API de Datos** es la forma de administrarla desde tu propio
código. El panel y la CLI usan las mismas rutas, así que todo lo que ellos
hacen, tu código también lo puede hacer. [Datos](/es/docs/data/) explica la
base de datos en sí.

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

Antes de borrar, puedes preguntar qué le haría el borrado a las filas que
apuntan a las que borras. No se borra nada:

```bash
curl -X POST ... $DATA/table/orders/delete-preview -d '{ "ids": [12, 13] }'
```

Sin `ids`, muestra qué pasaría al borrar todas las filas. La respuesta lista
cada columna que apunta a una fila borrada, con cuántas filas borraría
(`cascade`), vaciaría (`set_null`) o impedirían el borrado (`restrict`). Los
borrados en cascada se siguen hasta el final, y `depth` dice a cuántas cascadas
de distancia está cada uno. `blocked` es true cuando un `restrict` impediría el
borrado. Si se afectan más de 200.000 filas, `truncated` es true y cada número
es un mínimo.

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
| `POST /table/:table/sync` | Sincroniza ahora, desde su hoja de cálculo, una tabla que tiene `source` |
| `DELETE /table/:table` | La elimina. Envía `{ "confirmName": "<tabla>" }` |
| `POST /table/:table/column` | Agrega una columna |
| `PATCH /table/:table/column/:column` | Le cambia el nombre o la configuración a una columna, incluido su tipo |
| `DELETE /table/:table/column/:column` | Elimina una columna |
| `GET /change` | El registro de estos cambios: quién, qué y cuándo |

El `source` de una tabla (`{ "uri", "sheet", "key" }`) mantiene sus filas al
día con una hoja de cálculo o un CSV de Recursos, y las deja de solo lectura
para cualquier otro que escriba; `{ "source": null }` lo detiene. Consulta
[Sincronizar una tabla desde una hoja de cálculo](/es/docs/data/sheet-sync/).

Antes de cambiar el tipo de una columna se revisan todos sus valores. Si alguno
no cabe en el tipo nuevo, el cambio se rechaza y la respuesta lista las
primeras 10 filas que no caben. Eliminar una tabla o una columna, y cambiar un
tipo, responde con un `bookmark`. Para deshacer el cambio, restaura a ese
punto.

Cambiar un tipo copia la tabla, igual que eliminar una columna de relación.
Hasta 100.000 filas, la copia se hace dentro de la solicitud. En una tabla más
grande se hace en segundo plano. La respuesta trae `copy`, con cuántas filas van
copiadas, y la tabla conserva sus columnas anteriores hasta que termina.
Mientras tanto la lectura y las escrituras en otras tablas funcionan como
siempre. Reciben un 409 los cambios de tablas y las escrituras que cambiarían
filas de la tabla que se copia: inserciones, cambios y borrados en ella, y
borrados en una tabla a la que apunta con `cascade` o `set_null`. `GET` sobre
la base de datos muestra el avance
en `copy`. Si la copia falla, la tabla queda como estaba y `copy` muestra el
`error` hasta que lo descartes con `DELETE /copy`.

## Historial, restauración y exportación

- **`GET /table/:table/row/:id/history`**: cada cambio a una fila en los
  últimos 90 días, con quién lo hizo. Un cambio hecho con un token aparece como
  `cli:<id del token>`.
- **`POST /checkpoint`**: un punto de restauración en este momento exacto.
  Responde con un `bookmark`; toma uno antes de un cambio grande, como
  reemplazar las filas de una tabla, para luego deshacer justo ese cambio.
- **`POST /restore-point`**: deja la base de datos completa como estaba en un
  momento de los últimos 30 días (`{ "timestamp": "2026-10-20T15:00:00-05:00" }`),
  o en el `bookmark` con el que respondió un checkpoint, una tabla o columna
  eliminada, un cambio de tipo o una restauración anterior. La respuesta trae un `undoBookmark` que deshace la
  restauración.
- **`POST /export`**: empieza una copia de la base de datos: un archivo JSONL
  o CSV por tabla, más `schema.json`. Consulta `GET /export` hasta que su
  `status` sea `done`, y luego descarga cada archivo con
  `GET /export/file?exportId=<id>&table=<tabla>`. Sin `table`, descargas
  `schema.json`. Las exportaciones también funcionan durante los 7 días
  después de eliminar la base de datos.

## Consultas guardadas y disparadores

| Ruta | Qué hace |
| --- | --- |
| `GET /query` | Las consultas guardadas |
| `POST /query` | Guarda una: `{ "name", "description", "sql", "params", "assistant" }` |
| `DELETE /query/:name` | Elimina una |
| `POST /query/:name/run` | Ejecuta una: `{ "params": { "from": "2026-10-01T00:00:00-05:00" } }` |
| `GET /trigger` | Los disparadores |
| `POST /trigger` | Guarda uno, por nombre |
| `PATCH /trigger/:name` | Lo enciende o lo apaga: `{ "enabled": false }` |
| `DELETE /trigger/:name` | Elimina uno |
| `POST /trigger/deploy` | Reemplaza los disparadores de un despliegue de la CLI: `{ "triggers": [...] }` |
| `GET /trigger/:name/run` | Sus ejecuciones recientes |
| `POST /trigger/:name/run/:runId/retry` | Vuelve a enviar una ejecución que falló o se omitió |

Mira [Consultas guardadas](/es/docs/data/#consultas-guardadas) y
[Disparadores y webhooks](/es/docs/data/triggers/) para saber qué reciben.

## Desde la línea de comandos

Los comandos `ganju data` de la CLI llaman a estas mismas rutas, para el
proyecto de `ganju.json`. Instálala con `npm install -g @ganju/cli`, y luego
ejecuta `ganju login` y `ganju link`. En una máquina sin navegador, define
`GANJU_API_TOKEN` con un token de acceso personal: lo que la CLI escriba queda
registrado como `cli:<id del token>`, y si recibe un `429` espera y sigue sola.

```bash
ganju data create
ganju data info
ganju data tables

# Sugerencias de índices: agregar una, o descartarla hasta que sus números se dupliquen
ganju data index add <id>
ganju data index dismiss <id>

# Filas: filtrar, ordenar, buscar y paginar
ganju data rows menu --where 'price<30000' --where size=30cm --sort -price --limit 50
ganju data rows menu --search pizza --json
ganju data get menu 12
ganju data insert menu --input '{"name":"Margarita","price":28000}'
ganju data insert menu --input-file menu.jsonl
ganju data update menu 12 --input '{"stock":{"decrement":2}}' --version 3
ganju data delete orders 7 --yes

# Un archivo CSV, Excel o JSONL, emparejado con las columnas igual que en el panel
ganju data import menu menu.csv
ganju data import menu menu.xlsx --sheet Menu
ganju data import menu menu.csv --map 'Precio (COP)=price'
ganju data import menu menu.csv --replace --yes --confirm menu
```

`--where` acepta `columna=valor` y `!=`, `>`, `>=`, `<`, `<=`, `~` (contiene)
y `^=` (empieza por). `status=[open,done]` coincide con cualquiera de los
valores y `note=null` encuentra los vacíos. En una columna de texto, teléfono,
email, URL, enum o fecha el valor siempre es texto, así que
`phone=3001234567` funciona tal cual; en las demás, las comillas lo dejan como
texto: `code="007"`. Repite `--where` para exigir varias condiciones, o pasa
directamente el JSON de `where`.

`delete` muestra lo que un borrado en cascada también eliminaría, y se niega si
una relación `restrict` lo impide. `import` lee números como "28.000", reconoce
las relaciones por el nombre que muestra la otra tabla y deja las filas
rechazadas, con el motivo, en un CSV que puedes corregir e importar de nuevo.
Un `--replace` rechazado completo no cambia nada y devuelve el archivo entero
con cada fila culpable marcada.

### El esquema como código

`ganju data schema pull` escribe las tablas de la base de datos en
`ganju.data.json`, con la misma forma que el `schema.json` de una exportación.
Edítalo y revísalo como cualquier código. `ganju data schema diff` muestra lo
que cambiaría, y `ganju data schema push` lo aplica:

```bash
ganju data schema diff
+ create table orders (customer, status)
+ add column menu.notes long_text
~ change table menu: label "Menú"
- change menu.price: type "decimal" (copies the table) (needs --yes)
- drop column menu.code (needs --yes)
```

Las tablas y columnas se emparejan por nombre, y las tablas nuevas se crean en
un orden en el que la tabla a la que apunta cada relación ya existe. Las tablas
y columnas nuevas y los cambios de configuración se aplican de una vez. Las
eliminaciones y los cambios de tipo se listan y solo se aplican con `--yes`,
después de tomar un punto de restauración que los deshace. Un cambio de nombre
en el archivo se lee como eliminar y agregar: para renombrar, usa
`ganju data column rename` o `ganju data table rename`.

### Comandos destructivos

Todo lo que elimina, borra o reescribe datos necesita `--yes`. Eliminar la base
de datos o una tabla también pide su nombre, escrito con `--confirm`:

```bash
ganju data table rm orders --yes --confirm orders
ganju data drop --yes --confirm acme-support
ganju data restore                              # deshace la eliminación, dentro de 7 días
ganju data restore --at 2026-10-30T09:15:00-05:00 --yes
ganju data restore --bookmark <bookmark> --yes  # el deshacer que mostró una eliminación
ganju data export --format csv --out respaldo/
```

En una terminal, la CLI pregunta por lo que falte. En un script, se niega.

## Errores

Los errores son JSON con un `error` legible y un `code`:

| Estado | Cuándo |
| --- | --- |
| `400` | La solicitud no es válida. `errors` lista cada campo |
| `402` | El plan de la organización no incluye Datos |
| `403` | El token es de otro proyecto, o la base de datos quedó de solo lectura tras bajar de plan |
| `404` | No hay una base de datos, tabla o fila con ese nombre |
| `409` | Una `version` desactualizada, una condición que no cambió nada, un cambio por debajo del mínimo de una columna, una restricción (por ejemplo, hay filas que todavía apuntan a esta), una base de datos llena o una copia de tabla que aún no termina |
| `429` | Demasiadas solicitudes con este token |
