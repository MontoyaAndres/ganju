---
title: El archivo de esquema (ganju.data.json)
description: Todos los campos de ganju.data.json, el archivo donde los comandos ganju data schema guardan como código las tablas, columnas y consultas guardadas de un proyecto, con un ejemplo completo.
order: 60
updated: 2026-11-24
---

`ganju.data.json` guarda el esquema de la base de datos de un proyecto como
código, junto a las funciones de `ganju.json`. Pasa por revisión de código como
cualquier otro cambio, y el CLI lo aplica:

```bash
ganju data schema pull    # escribe el esquema de la base de datos en ganju.data.json
ganju data schema diff    # lo que cambiaría push
ganju data schema push    # aplica el archivo (borrar y cambiar tipos piden --yes)
```

`pull` en una base de datos vacía escribe `{ "tables": [] }`. Mejor empieza
por el ejemplo de abajo y luego usa `diff` y `push`. `--schema <archivo>` lee
otro archivo.

## Un ejemplo completo

Dos tablas relacionadas (platos, y pedidos que apuntan a un plato) y una
consulta guardada:

```json
{
  "tables": [
    {
      "name": "menu",
      "label": "Menú",
      "description": "Los platos que vendemos, con precio e inventario.",
      "displayColumn": "name",
      "access": "read",
      "columns": [
        { "name": "name", "type": "text", "required": true, "unique": true, "searchable": true },
        { "name": "price", "type": "decimal", "required": true, "min": 0 },
        { "name": "stock", "type": "integer", "min": 0, "default": 0 },
        { "name": "category", "type": "enum", "values": ["pizza", "bebida", "postre"], "filterable": true }
      ]
    },
    {
      "name": "orders",
      "description": "Pedidos que hacen los clientes por WhatsApp.",
      "access": "add",
      "customerScoped": true,
      "columns": [
        { "name": "dish", "type": "relation", "table": "menu", "onDelete": "restrict", "required": true },
        { "name": "quantity", "type": "integer", "required": true, "min": 1 },
        { "name": "customer_name", "type": "text", "personal": true },
        { "name": "phone", "type": "phone", "personal": true },
        { "name": "status", "type": "enum", "values": ["nuevo", "listo", "entregado"], "default": "nuevo", "filterable": true },
        { "name": "notes", "type": "long_text", "description": "Lo que pidió el cliente, en sus palabras." }
      ]
    }
  ],
  "queries": [
    {
      "name": "orders_by_dish",
      "description": "Unidades pedidas por plato entre dos fechas.",
      "sql": "SELECT m.name AS dish, sum(o.quantity) AS units FROM orders o JOIN menu m ON m.id = o.dish WHERE o.created_at >= :from AND o.created_at < :to GROUP BY m.name",
      "params": [
        { "name": "from", "type": "datetime", "required": true },
        { "name": "to", "type": "datetime", "required": true }
      ]
    }
  ]
}
```

## Tablas

| Campo | Obligatorio | Qué es |
| --- | --- | --- |
| `name` | sí | Letras minúsculas, dígitos y `_`, empezando con una letra, hasta 63 caracteres. |
| `columns` | sí | Al menos una [columna](#columnas), hasta 93. |
| `label` | no | Se muestra en lugar del nombre, hasta 100 caracteres. |
| `description` | no | Qué guarda la tabla, hasta 300 caracteres. El asistente la lee para saber cuándo usar la tabla, así que escríbela. |
| `displayColumn` | no | La columna que muestra una relación a esta tabla ("Margherita" en lugar de #12). Si no la pones, la primera columna `text`; `"id"` o `null` muestra el id. |
| `access` | no | Lo que pueden hacer los bots de los canales con la tabla: `none`, `read` (el valor por defecto), `add` (leer y agregar) o `full`. Tus clientes MCP, las funciones, el CLI y el panel siempre lo ven todo. Mira [Quién ve qué](/es/docs/data/#quién-ve-qué). |
| `customerScoped` | no | `true`: en los canales, cada cliente ve solo las filas que escribió su propia conversación. Por defecto `false`. |
| `history` | no | Guarda quién cambió cada fila y cuándo, durante 90 días. Por defecto `true`. |
| `source` | no | Mantiene las filas al día con una hoja de cálculo de Recursos: `{ "uri": "…", "sheet": "…", "key": "columna" }`. Mira [Sincronizar una tabla desde una hoja de cálculo](/es/docs/data/sheet-sync/). |

Un proyecto tiene hasta 50 tablas.

## Columnas

| Campo | Obligatorio | Qué es |
| --- | --- | --- |
| `name` | sí | La misma regla que el nombre de una tabla. `id`, `created_at`, `updated_at` y `version` ya están ocupados: toda fila los tiene. |
| `type` | sí | `text`, `long_text`, `integer`, `decimal`, `boolean`, `date`, `datetime`, `enum`, `json`, `email`, `url`, `phone`, `relation` o `file`. Lo que guarda cada uno está en [Tablas y columnas](/es/docs/data/#tablas-y-columnas). |
| `label` | no | Se muestra en lugar del nombre, hasta 100 caracteres. |
| `description` | no | Qué guarda la columna, hasta 300 caracteres. |
| `required` | no | Toda fila debe tener un valor. |
| `unique` | no | Dos filas no pueden tener el mismo valor. |
| `filterable` | no | Con índice, para que los filtros y el orden sigan siendo rápidos. Las relaciones y las columnas únicas ya tienen índice. |
| `searchable` | no | Entra en la búsqueda de texto completo. |
| `personal` | no | Marca que la columna guarda datos personales (un nombre, un teléfono). Se guarda con el esquema y lo muestra `ganju data tables`; por ahora nada más lo usa. |
| `values` | para `enum` | Las opciones, hasta 100. |
| `table` | para `relation` | La tabla a la que apunta. |
| `onDelete` | no, solo `relation` | Qué pasa al borrar la fila a la que apunta: `restrict` (no deja borrarla, el valor por defecto), `cascade` (borra también estas filas) o `set_null` (vacía la columna; no se permite en una columna obligatoria). |
| `min` | no, solo números | El valor más bajo que puede tener un `integer` o un `decimal`. |
| `default` | no | Se usa cuando una fila nueva deja la columna vacía: un texto, un número, un booleano o `null`. |

Los indicadores que no pongas quedan en `false`.

## Consultas guardadas

`queries` es opcional. Si no está en el archivo, `push` deja como están las
consultas de la base de datos; si está, las deja iguales a la lista. Cada una:

| Campo | Obligatorio | Qué es |
| --- | --- | --- |
| `name` | sí | La misma regla que el nombre de una tabla. |
| `sql` | sí | Un `SELECT` (o `WITH … SELECT`) sobre tus tablas, hasta 10.000 caracteres, con parámetros como `:from`. |
| `description` | no | Qué responde, hasta 300 caracteres. |
| `params` | no | Hasta 20, cada uno `{ "name", "type", "description"?, "required"? }`. `type` es `text`, `integer`, `decimal`, `boolean`, `date` o `datetime`. |
| `assistant` | no | `true` deja que los bots de los canales la ejecuten desde `data-query`. |

Más en [Consultas guardadas](/es/docs/data/#consultas-guardadas).

## Lo que no va en este archivo

Los disparadores y las programaciones van en `triggers` de `ganju.json` y se
publican con `ganju deploy`: mira [Disparadores](/es/docs/data/triggers/) y
[Programaciones](/es/docs/data/schedules/). Las filas no son parte del esquema;
cárgalas con `ganju data import`.
