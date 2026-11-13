---
title: API de Datos
description: Maneja la base de datos de un proyecto por HTTP (crea tablas, inserta y busca filas, registra pedidos sin errores, ejecuta consultas guardadas, maneja disparadores y programaciones, restaura y exporta) con un token de acceso personal, o desde los comandos ganju data.
order: 7
updated: 2026-11-13
---

Cada proyecto en **Pro** o **Enterprise** puede tener su propia **base de
datos**: tablas con columnas tipadas, relaciones entre ellas y búsqueda de texto
completo. La **API de Datos** es la forma de manejarla desde tu propio código.
El panel y la CLI usan las mismas rutas, así que todo lo que ellos pueden hacer,
tu código también. [Datos](/es/docs/data/) explica la base de datos en sí.

La referencia completa es un archivo OpenAPI:
[`https://api.ganju.ai/openapi/data.json`](https://api.ganju.ai/openapi/data.json).
Cárgalo en Postman, Insomnia o un generador de código.

## Autenticación

Crea un token de acceso personal para el proyecto con la CLI, y envíalo como
token bearer:

```bash
ganju token create "orders sync" --expires 90   # o --expires never
```

El token se imprime una sola vez. `ganju token list` muestra tus tokens y
`ganju token revoke "orders sync"` desactiva uno.

Todas las rutas viven bajo la base de datos del proyecto. Los ids de la
organización y del proyecto están en tu `ganju.json` después de ejecutar
`ganju link`:

```bash
export GANJU_TOKEN=ganju_pat_...
export DATA=https://api.ganju.ai/organization/<organizationId>/project/<projectId>/artifact/data
curl -H "Authorization: Bearer $GANJU_TOKEN" $DATA
```

Un token solo llega al proyecto para el que se creó. Cada token puede hacer 120
solicitudes por minuto a cada ruta, dentro de 300 por minuto para tu cuenta en
total. Pasado eso, la API responde `429` con un encabezado `Retry-After`:
espera un minuto e inténtalo de nuevo.

Los ejemplos de abajo escriben `curl ...` en lugar de
`curl -H "Authorization: Bearer $GANJU_TOKEN" -H "Content-Type: application/json"`.

## La base de datos

| Ruta | Qué hace |
| --- | --- |
| `GET /` | La base de datos: `status`, tamaño, `timeZone`, sus tablas, las sugerencias de índices abiertas (`indexAdvice`) y una copia de tabla en curso (`copy`). `database` es `null` cuando el proyecto no tiene |
| `POST /` | La crea: `{ "name"? }`, por defecto el slug del proyecto. Se puede repetir sin problema. Mientras una base de datos eliminada todavía se pueda restaurar, se rechaza a menos que envíes `"replaceDeleted": true`, que renuncia a esa restauración |
| `PATCH /` | Sus ajustes: `{ "timeZone": "America/Bogota" }`, o `null` para UTC |
| `DELETE /` | La elimina: `{ "confirmName": "<nombre de la base de datos>" }`. Se puede restaurar durante 7 días |
| `POST /restore` | Deshace una eliminación, dentro de esos 7 días |

(Aquí `/` es `$DATA` mismo.)

```bash
curl -X POST ... $DATA -d '{ "name": "pizzeria" }'
curl -X PATCH ... $DATA -d '{ "timeZone": "America/Bogota" }'
```

La **zona horaria** es en la que vuelven las fechas y horas para quien no pide
otra, y en la que se lee una fecha y hora sin desfase. Una lectura de filas
puede pedir la suya con `?timeZone=Europe/Madrid`.

## Crear una tabla

```bash
curl -X POST ... $DATA/table -d '{
  "name": "menu",
  "label": "Menú",
  "description": "Las pizzas que vendemos, con precio e inventario",
  "displayColumn": "name",
  "access": "read",
  "columns": [
    { "name": "name",  "type": "text",    "required": true, "searchable": true },
    { "name": "price", "type": "integer", "min": 0 },
    { "name": "stock", "type": "integer", "min": 0, "default": 0 },
    { "name": "size",  "type": "enum",    "values": ["30cm", "40cm"] }
  ]
}'
```

Una tabla recibe:

| Campo | Qué es |
| --- | --- |
| `name` | Minúsculas, dígitos y `_`, empezando con una letra, hasta 63 caracteres |
| `label`, `description` | Lo que se muestra en lugar del nombre, y lo que lee el asistente (hasta 100 y 300 caracteres) |
| `displayColumn` | Lo que muestra una relación a esta tabla: `"name"` en lugar del id |
| `access` | Lo que pueden hacer los bots de los canales: `none`, `read` (por defecto), `add` o `full`. Mira [Quién ve qué](/es/docs/data/#quién-ve-qué) |
| `customerScoped` | `true`: cada cliente ve solo sus propias filas |
| `history` | Guardar el historial de filas; `true` por defecto |
| `source` | Sincronizarla desde una hoja de cálculo: `{ "uri", "sheet"?, "key" }`. Mira [Sincronizar una tabla desde una hoja de cálculo](/es/docs/data/sheet-sync/) |
| `columns` | Hasta 93 |

y cada columna:

| Campo | Qué es |
| --- | --- |
| `name`, `type` | El tipo es `text`, `long_text`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `enum`, `json`, `email`, `url`, `phone`, `relation` o `file` |
| `label`, `description` | Igual que en una tabla |
| `required`, `unique`, `filterable`, `searchable` | `true` o `false` |
| `values` | Para `enum`: las opciones, hasta 100 |
| `table`, `onDelete` | Para `relation`: la tabla a la que apunta, y qué pasa al eliminar esa fila: `restrict`, `cascade` o `set_null` |
| `min` | Para `integer` y `decimal`: el valor más bajo permitido |
| `default` | Se usa cuando una fila nueva la deja vacía |

Cada fila también tiene `id`, `created_at`, `updated_at` y `version`. La base de
datos los asigna; nunca los envías.

## Insertar, leer y buscar filas

```bash
# Una fila, o hasta 500 a la vez con "rows"
curl -X POST ... $DATA/table/menu/row -d '{ "values": { "name": "Margherita", "price": 28000, "stock": 10 } }'
curl -X POST ... $DATA/table/menu/row -d '{ "rows": [{ "name": "Hawaiana" }, { "name": "Pepperoni" }] }'

# Una fila
curl ... $DATA/table/menu/row/12

# Filtrar, ordenar, buscar y paginar
curl ... "$DATA/table/menu/row?where=%7B%22price%22%3A%7B%22lt%22%3A30000%7D%7D&sort=-price&limit=50"
curl ... "$DATA/table/menu/row?q=pizza"
```

Una inserción responde `{ "ids": [...] }`. Una lista responde `{ table, rows,
total, nextCursor }`:

- **`where`** es JSON: `{"status":"open"}`, `{"price":{"lt":30000}}`,
  `{"name":{"contains":"pizza"}}`. Los operadores son `eq`, `ne`, `gt`, `gte`,
  `lt`, `lte`, `in`, `notIn`, `contains`, `startsWith` e `isNull`; combínalos
  con `and` / `or`, y filtra por una columna de la fila relacionada con
  `"customer.name"`.
- **`sort`** es una lista de columnas. Pon `-` delante de una columna para
  ordenar de mayor a menor: `-created_at,name`.
- **`q`** busca en las columnas marcadas como `searchable`, mejores resultados
  primero.
- **`include`** trae filas relacionadas: `include=customer`.
- **`limit`** es 20 por defecto, hasta 500. Una página tiene hasta 500 filas y
  1 MB. Cuando hay más, la respuesta trae `nextCursor`; envíalo de vuelta como
  `cursor` para leer la siguiente página. `total` viene en la primera página.
- **`timeZone`** devuelve las fechas y horas en esa zona en lugar de la de la
  base de datos.

Una relación vuelve como `{ id, label }`. Una columna de archivo vuelve como
`{ uri, id, title, mimeType }`, o `{ uri, missing: true }` cuando ningún recurso
tiene ya ese uri; escríbela con el uri.

En JavaScript:

```js
const res = await fetch(`${DATA}/table/menu/row?q=${encodeURIComponent('pizza')}`, {
  headers: { Authorization: `Bearer ${process.env.GANJU_TOKEN}` }
});
const { rows, nextCursor } = await res.json();
```

## Cambiar y borrar filas sin perder ediciones

Cada fila tiene una `version` que sube en uno con cada cambio. Envía de vuelta
la versión que leíste:

```bash
curl -X PATCH ... $DATA/table/menu/row/12 -d '{ "set": { "price": 30000 }, "version": 3 }'
curl -X PATCH ... $DATA/table/menu/row/12 -d '{ "set": { "stock": { "decrement": 2 } } }'
curl -X DELETE ... $DATA/table/menu/row/12 -d '{ "version": 4 }'
```

Un cambio responde `{ row }`, y una eliminación `{ deleted }`. Un número puede
cambiar respecto a sí mismo con `{ "increment": n }` o `{ "decrement": n }`.

Alguien puede cambiar la fila después de que la leíste. Si pasa, la respuesta
es **409**, con la fila como está ahora en `details.current` y quién la cambió
en `details.updatedBy`. Vuelve a cargarla e inténtalo de nuevo. Para
sobrescribir su cambio, envía la solicitud sin `version`.

Antes de eliminar, puedes preguntar qué le haría la eliminación a las filas que
apuntan a ellas. No se elimina nada:

```bash
curl -X POST ... $DATA/table/orders/delete-preview -d '{ "ids": [12, 13] }'
```

Deja fuera `ids` para ver qué pasaría al eliminar todas las filas. La respuesta
lista cada columna que apunta a una fila eliminada, con cuántas filas
eliminaría (`cascade`), vaciaría (`set_null`) o impiden la eliminación
(`restrict`). Las cascadas se siguen hasta el final, y `depth` dice a cuántas
cascadas de distancia está cada una. `blocked` es verdadero cuando un restrict
impediría la eliminación. Pasadas 200.000 filas afectadas, `truncated` es
verdadero y cada número es un mínimo.

## Registrar un pedido sin errores

`POST /write` recibe una lista de hasta 50 inserciones, cambios y eliminaciones
en varias tablas, que tocan hasta 5.000 filas. Se aplican todas juntas, o
ninguna. Un paso posterior puede usar el id de una inserción anterior como
`{ "$ref": <paso> }`, en sus valores o como el `id` de la fila que cambia o
elimina. Un cambio o una eliminación nombra una fila por `id`, o las filas que
coinciden con un `where`; `expect` dice cuántas filas deben cambiar. Un cambio
puede modificar un número respecto a sí mismo, con una condición:

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

Responde `{ results }`, uno por paso: `{ op, table, id }` para una inserción
(`ids` para varias filas), `{ op, table, changed }` para un cambio o una
eliminación.

Si dos clientes piden la última pizza al mismo tiempo, un pedido pasa. El otro
recibe un 409 ("changed 0 rows, expected 1"), y no se escribe ninguno de sus
pasos.

## Cambiar las tablas

| Ruta | Qué hace |
| --- | --- |
| `GET /table` | Tablas, columnas y relaciones, y el último `sync` de cada tabla sincronizada |
| `POST /table` | Crea una tabla |
| `PATCH /table/:table` | La renombra, o cambia su etiqueta, descripción o ajustes. Un `null` devuelve un ajuste a su valor por defecto |
| `POST /table/:table/sync` | Sincroniza ahora una tabla que tiene `source` desde su hoja de cálculo (cinco por minuto) |
| `DELETE /table/:table` | La elimina. Envía `{ "confirmName": "<tabla>" }` |
| `POST /table/:table/column` | Agrega una columna |
| `PATCH /table/:table/column/:column` | Renombra o cambia una columna, incluido su tipo |
| `DELETE /table/:table/column/:column` | Elimina una columna |
| `POST /advice/:adviceId` | Agrega un índice sugerido: marca la columna como filtrable |
| `DELETE /advice/:adviceId` | Descarta una sugerencia de índice hasta que sus números se dupliquen |
| `DELETE /copy` | Descarta una copia de tabla que falló |
| `GET /change` | El historial de estos cambios: quién, qué, cuándo (`?limit=`, `?cursor=`) |

El `source` de una tabla (`{ "uri", "sheet", "key" }`) mantiene sus filas al día
con una hoja de cálculo o un CSV de Recursos, y las deja en solo lectura para
cualquier otro que escriba; `{ "source": null }` lo detiene. Mira
[Sincronizar una tabla desde una hoja de cálculo](/es/docs/data/sheet-sync/).

Cambiar el tipo de una columna revisa primero cada valor. Si alguno no cabe, el
cambio se rechaza y la respuesta lista las primeras 10 filas que no caben.
Eliminar una tabla o una columna, y cambiar un tipo, responde con un
`bookmark`. Para deshacer el cambio, restaura a él.

Un cambio de tipo copia la tabla, y eliminar una columna de relación también.
Hasta 100.000 filas eso pasa en la misma solicitud. En una tabla más grande la
copia corre en segundo plano. La respuesta trae `copy`, con cuántas filas van
copiadas, y la tabla conserva sus columnas viejas hasta que termina la copia.
Mientras tanto, leer y escribir en otras tablas funciona como siempre. Un 409
responde a los cambios de tablas, y a las escrituras que cambiarían las filas
de la tabla que se copia: inserciones, cambios y eliminaciones en ella, y
eliminaciones en una tabla a la que apunta con cascade o set null. `GET` sobre
la base de datos muestra el avance en `copy`. Si la copia falla, la tabla queda
como estaba y `copy` muestra el `error` hasta que lo descartes con
`DELETE /copy`.

## Historial, restauración y exportación

- **`GET /table/:table/row/:id/history`**: cada cambio de una fila en los
  últimos 90 días, del más nuevo al más viejo, con quién lo hizo (`?limit=`
  hasta 100, `?cursor=`). Un cambio hecho con un token aparece como
  `cli:<id del token>`.
- **`POST /checkpoint`**: un punto de restauración en este momento exacto.
  Responde con un `bookmark`; toma uno antes de un cambio grande, como
  reemplazar las filas de una tabla, para deshacer exactamente ese cambio
  después.
- **`POST /restore-point`**: devuelve toda la base de datos a como estaba en un
  momento de los últimos 30 días (`{ "timestamp": "2026-10-20T15:00:00-05:00" }`),
  o al `bookmark` con el que respondió un checkpoint, una tabla o columna
  eliminada, un cambio de tipo o una restauración anterior
  (`{ "bookmark": "…" }`). La respuesta trae un `undoBookmark` que deshace la
  restauración. Las llamadas en curso mientras se reinicia fallan.
- **`POST /export`**: empieza una copia de la base de datos,
  `{ "format": "jsonl" }` o `"csv"`: un archivo por tabla, más `schema.json`.
  Responde `{ exportId, status }`. Consulta `GET /export` (o `?exportId=`)
  hasta que su `status` sea `done`, y luego descarga cada archivo con
  `GET /export/file?exportId=<id>&table=<tabla>`. Deja fuera `table` para
  obtener `schema.json`. Las exportaciones también funcionan durante los 7
  días después de eliminar la base de datos.

## Consultas guardadas, disparadores y programaciones

| Ruta | Qué hace |
| --- | --- |
| `GET /query` | Las consultas guardadas, cada una con su SQL, sus parámetros, las tablas que lee y su plan (`SCAN orders` significa que lee la tabla completa) |
| `POST /query` | Guarda una: `{ "name", "description", "sql", "params", "assistant" }`. Guardarla con un nombre que ya existe la reemplaza |
| `DELETE /query/:name` | Elimina una |
| `POST /query/:name/run` | Ejecuta una: `{ "params": { "from": "2026-10-01T00:00:00-05:00" }, "limit": 100 }`. Responde `{ query, rows, truncated? }` |
| `GET /trigger` | Disparadores y programaciones, y `pending`: los eventos que aún no se envían |
| `POST /trigger` | Guarda un disparador o una programación |
| `PATCH /trigger/:name` | Lo enciende o apaga: `{ "enabled": false }` |
| `DELETE /trigger/:name` | Elimina uno |
| `POST /trigger/deploy` | Reemplaza los disparadores que hizo un despliegue de la CLI: `{ "triggers": [...] }` |
| `GET /trigger/:name/run` | Sus ejecuciones recientes, hasta 50 |
| `POST /trigger/:name/run/:runId/retry` | Vuelve a enviar una ejecución que falló o se omitió |
| `GET /trigger/test-send` | Tus propios chats con los bots del proyecto, adonde puede ir una prueba |
| `POST /trigger/test-send` | Envía una prueba de un mensaje al cliente o de un correo, armada con una fila |

Cada parámetro de una consulta en `params` es `{ "name", "type",
"description"?, "required"? }`, con `type` uno de `text`, `integer`,
`decimal`, `boolean`, `date` o `datetime`. Una ejecución devuelve hasta `limit`
filas (100 por defecto, 500 como máximo) y 1 MB.

```bash
curl -X POST ... $DATA/query -d '{
  "name": "sales_by_dish",
  "description": "Unidades e ingresos por plato entre dos momentos",
  "sql": "SELECT m.name AS dish, sum(l.quantity) AS units FROM order_lines l JOIN menu m ON m.id = l.dish JOIN orders o ON o.id = l.\"order\" WHERE o.created_at >= :from AND o.created_at < :to GROUP BY m.name",
  "params": [
    { "name": "from", "type": "datetime" },
    { "name": "to", "type": "datetime" }
  ]
}'

curl -X POST ... $DATA/trigger -d '{
  "table": "orders", "on": "update",
  "when": { "status": { "changedTo": "ready" } },
  "customer": { "text": "Tu pedido #{{id}} está listo." }
}'
```

Mira [Consultas guardadas](/es/docs/data/#consultas-guardadas),
[Disparadores y webhooks](/es/docs/data/triggers/) y
[Programaciones](/es/docs/data/schedules/) para ver qué reciben.

## Desde la línea de comandos

Los comandos `ganju data` de la CLI llaman a estas mismas rutas, para el
proyecto de `ganju.json`. Instálala con `npm install -g @ganju/cli`, y luego
`ganju login` y `ganju link`. En una máquina sin navegador, pon en
`GANJU_API_TOKEN` un token de acceso personal (`ganju token create`): las
escrituras de la CLI quedan entonces como `cli:<id del token>`, y espera sola
cuando recibe un `429`. Ejecuta `ganju data` solo para ver todos los comandos.
La mayoría acepta `--json` para una salida que un script pueda leer.

### La base de datos

```bash
ganju data create [--name <nombre>]     # Pro y Enterprise
ganju data info                         # estado, tamaño, zona horaria, tablas, sugerencias de índices
ganju data time-zone                    # muestra la zona horaria de la base de datos
ganju data time-zone America/Bogota     # la zona en la que vuelven las fechas y horas
ganju data time-zone --clear            # vuelve a UTC
ganju data changes                      # el historial de cambios del esquema
ganju data checkpoint                   # un bookmark de este momento, solo en stdout
ganju data export --format csv --out backup/   # jsonl por defecto
ganju data copy                         # una copia de tabla en segundo plano
ganju data copy wait
ganju data copy dismiss                 # descarta una que falló

# Sugerencias de índices: agregar una, o descartarla hasta que sus números se dupliquen
ganju data index add <id>
ganju data index dismiss <id>
```

`ganju data create --replace` empieza una base de datos nueva mientras una
eliminada todavía se puede restaurar, y renuncia a esa restauración.

### Tablas y columnas

```bash
ganju data tables
ganju data table create menu --schema menu.json
ganju data table rename menu dishes
ganju data table sync menu              # vuelve a leer ahora la hoja de una tabla sincronizada
ganju data column add menu notes long_text
ganju data column add menu size enum --input '{"values":["30cm","40cm"]}'
ganju data column rename menu notes description
ganju data column change menu price --input '{"type":"decimal"}' --yes
```

`table create` recibe un archivo con `{ "columns": [...] }`, una lista de
columnas, o un `ganju.data.json` que tenga la tabla. `column change` y
`column rm` esperan a que termine una copia de tabla, a menos que pases
`--no-wait`.

### Filas

```bash
ganju data rows menu --where 'price<30000' --where size=30cm --sort -price --limit 50
ganju data rows menu --search pizza --json
ganju data rows orders --include customer --all
ganju data get menu 12 [--include <relaciones>]
ganju data insert menu --input '{"name":"Margherita","price":28000}'
ganju data insert menu --input-file menu.jsonl
ganju data update menu 12 --input '{"stock":{"decrement":2}}' --version 3
ganju data delete orders 7 8 --yes
ganju data history orders 7
ganju data write --input-file ops.json  # {"operations":[...]}, todo o nada
```

`--where` acepta `columna=valor` y `!=`, `>`, `>=`, `<`, `<=`, `~` (contiene),
`^=` (empieza por). `status=[open,done]` coincide con cualquiera de los
valores, y `note=null` encuentra los vacíos. En una columna de texto, teléfono,
correo, URL, enum o fecha el valor siempre es texto, así que
`phone=3001234567` funciona tal cual; en las demás, las comillas mantienen un
valor como texto: `code="007"`. Repite `--where` para exigir varias
condiciones, o pasa el `where` en JSON: `--where '{"price":{"lt":30000}}'`.
`--limit` es hasta 500 por página; `--cursor` lee la siguiente página y `--all`
lee todas.

`delete` muestra lo que una cascada también quitaría, y se niega cuando un
restrict lo impide.

### Importar un archivo

```bash
# Un archivo CSV, Excel o JSONL, emparejado con las columnas igual que en el panel
ganju data import menu menu.csv
ganju data import menu menu.xlsx --sheet Menu
ganju data import menu menu.csv --map 'Precio (COP)=price'
ganju data import menu menu.csv --decimal-mark ,
ganju data import menu menu.csv --replace --yes --confirm menu
```

`import` empareja los encabezados con las columnas por nombre o etiqueta
(`--map` apunta uno a una columna), lee números como "28.000" (`--decimal-mark`
dice cómo escribe los decimales el archivo cuando no está claro), empareja las
relaciones por el nombre que muestra la otra tabla, y pone las filas que
rechazó, con el motivo, en un CSV que puedes corregir e importar de nuevo
(`--out` le da el nombre). Un `--replace` rechazado completo no cambia nada y
devuelve el archivo entero con cada fila culpable marcada. Una fecha y hora del
archivo sin desfase se lee en la zona horaria de tu computadora.

### Consultas guardadas

```bash
ganju data queries                              # las consultas guardadas y lo que leen
ganju data query save --input-file sales.json   # { name, description, sql, params, assistant }
ganju data run sales_by_dish --input '{"from":"2026-10-01T00:00:00-05:00","to":"2026-11-01T00:00:00-05:00"}'
ganju data query rm sales_by_dish --yes
```

`run` devuelve hasta `--limit` filas (100 por defecto, 500 como máximo), con
las fechas y horas en la zona horaria de tu computadora.

### El esquema como código

`ganju data schema pull` escribe las tablas de la base de datos, y sus
consultas guardadas en `"queries"`, en `ganju.data.json`, con la misma forma que
el `schema.json` de una exportación. Edítalo y revísalo como código.
`ganju data schema diff` muestra qué cambiaría, y `ganju data schema push` lo
aplica (`--schema <archivo>` usa otro archivo):

```bash
ganju data schema diff
+ create table orders (customer, status)
+ add column menu.notes long_text
~ change table menu: label "Menu"
- change menu.price: type "decimal" (copies the table) (needs --yes)
- drop column menu.code (needs --yes)
```

Las tablas y las columnas se emparejan por nombre, y las tablas nuevas se crean
en un orden en el que el destino de cada relación ya existe. Las tablas y
columnas nuevas y los ajustes cambiados se aplican de una vez. Las
eliminaciones y los cambios de tipo se listan y solo se aplican con `--yes`,
después de un punto de restauración que los deshace. Un cambio de nombre en el
archivo se lee como eliminar y agregar: renombra con
`ganju data column rename` o `ganju data table rename`.

Cada push queda anotado en el historial de cambios, así que el Asistente del
proyecto avisa que un cambio hecho en el panel lo revertirá el próximo push.

Los disparadores y las programaciones no están en `ganju.data.json`: ponlos en
`"triggers"` dentro de `ganju.json` y `ganju deploy` los publica. Mira
[Desplegar disparadores con la CLI](/es/docs/data/triggers/#desplegar-disparadores-con-la-cli).

### Comandos destructivos

Todo lo que elimina, borra o reescribe datos necesita `--yes` (`-y`). Eliminar
la base de datos o una tabla también necesita su nombre, escrito con
`--confirm`:

```bash
ganju data column rm menu code --yes
ganju data table rm orders --yes --confirm orders
ganju data drop --yes --confirm acme-support
ganju data restore                              # deshace la eliminación, dentro de 7 días
ganju data restore --at 2026-10-30T09:15:00-05:00 --yes
ganju data restore --bookmark <bookmark> --yes  # lo que imprimió una eliminación para deshacerla
```

`--at` recibe una hora ISO con su desfase (o `Z` para UTC). En una terminal, un
flag que falta se pregunta. En un script, se rechaza.

## Errores

Los errores son JSON con un `error` legible y un `code`, y `details` cuando hay
más que decir:

| Estado | Cuándo |
| --- | --- |
| `400` | La solicitud no es válida. `errors` lista cada campo, con su `path` y su `message` |
| `401` | No hay sesión ni token |
| `402` | El plan de la organización no incluye Datos |
| `403` | El token es de otro proyecto, no tienes acceso al proyecto, o la base de datos está en solo lectura tras bajar de plan |
| `404` | No hay base de datos, tabla o fila con ese nombre |
| `409` | Una `version` vieja, una condición que no cambió nada, un cambio por debajo del mínimo de una columna, una restricción (por ejemplo, todavía hay filas que apuntan a esta), las filas de una tabla sincronizada, una base de datos llena, o una copia de tabla todavía en curso |
| `429` | Demasiadas solicitudes para este token |
