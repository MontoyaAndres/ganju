---
title: Sincronizar una tabla desde una hoja de cálculo
description: Mantén las filas de una tabla al día con una hoja de Google, un archivo de Excel o un CSV de Recursos — emparejadas por una columna clave, leídas de nuevo cada vez que cambia el archivo, y de solo lectura en todo lo demás.
order: 58
updated: 2026-11-06
---

Muchos negocios ya llevan el menú, los precios o el inventario en una hoja de
cálculo. Una tabla **sincronizada desde una hoja de cálculo** mantiene esas
filas al día con ella, para que nadie las escriba dos veces: cambias un precio
en la hoja y la fila en Ganju también cambia.

El origen es cualquier hoja de cálculo o CSV de [Recursos](/es/docs/resources/):
una hoja de Google importada desde Drive, un archivo de Excel de OneDrive, o un
CSV o `.xlsx` que subiste. La sincronización va en un solo sentido: **manda la
hoja**.

## Configúrala

1. Asegúrate de que la tabla tenga una columna **única** que identifique la
   misma fila en la hoja y en la tabla, como `sku` o `name`. Esa es la
   **clave**.
2. Abre la tabla en la página **Datos**, ve a su pestaña **Esquema** y, en
   **Origen: hoja de cálculo**, haz clic en **Sincronizar desde una hoja de
   cálculo**.
3. Elige el archivo, la hoja (vacío para la primera) y la columna clave, y haz
   clic en **Empezar a sincronizar**.

La primera sincronización corre de inmediato. Deja la tabla como dice la hoja,
así que **se eliminan las filas cuya clave no está en la hoja**.

La primera fila de la hoja lleva los encabezados. Cada encabezado se empareja
con una columna por su nombre o su etiqueta, como lo hace una
[importación](/es/docs/data/#tablas-y-columnas): `Precio` llena `price` cuando
`price` tiene la etiqueta «Precio». Los encabezados que no coinciden con
ninguna columna se ignoran, y también las columnas que la hoja no tiene. Las
celdas se leen como las lee una importación: fechas, números como `28.000`,
`sí` / `no`, y una relación por el valor que muestra la fila relacionada.

## Cuándo se sincroniza

- **Cuando cambia el archivo.** Un archivo de Drive o OneDrive se revisa en su
  propio [intervalo de sincronización](/es/docs/resources/#importar-desde-google-drive-u-onedrive), y se vuelve a leer
  solo si cambió. Un archivo subido se sincroniza cuando lo reemplazas.
- **Cuando lo pides.** **Sincronizar ahora**, en la pestaña Filas de la tabla o
  debajo de su origen, vuelve a traer un archivo de Drive o OneDrive si cambió,
  y luego lo lee. El **Sincronizar ahora** del elemento en Recursos hace lo
  mismo.

Cada sincronización, de una sola vez:

- inserta las líneas cuya clave es nueva,
- actualiza las filas cuyos valores difieren de su línea,
- elimina las filas cuya clave ya no está en la hoja.

Las filas que no cambiaron no se escriben: conservan su versión y no suman una
entrada al [historial](/es/docs/data/#restaurar-y-descargar). Los cambios los
hace `system:sheet-sync`, que es lo que muestra el historial de la fila, y
disparan los [disparadores](/es/docs/data/triggers/) de la tabla: un cambio de
precio o de inventario en la hoja todavía puede avisarle a alguien.

## Solo lectura mientras se sincroniza

Las filas de una tabla sincronizada solo cambian en la hoja. Agregar, cambiar o
eliminar una fila se rechaza desde cualquier lugar, el panel, la API, la CLI,
las funciones y el asistente, con un mensaje como:

```
menu se sincroniza desde "Menú.xlsx"; cambia la hoja, o deja de sincronizarla.
```

Todavía puedes cambiar las columnas y los ajustes de la tabla. La columna clave
no se puede eliminar, y sigue siendo única. **Dejar de sincronizar**, debajo
del origen, deja las filas como están y las vuelve editables.

## Cuando se rechaza una sincronización

Una hoja que no encaja se rechaza entera, y la tabla conserva sus filas como
estaban:

- la hoja no tiene una columna para la clave, o para una columna obligatoria;
- una clave está vacía, o aparece en dos líneas;
- un valor no encaja en su columna (texto en una columna de números, un número
  por debajo del mínimo de la columna, una opción que no está en la lista);
- una línea borrada de la hoja todavía la señalan filas de otra tabla.

El motivo aparece en la pestaña Filas de la tabla y debajo de su origen, con la
línea donde se encontró, y en **Salud de las herramientas** en el resumen del
proyecto. Corrige la hoja y haz clic en **Sincronizar ahora**, o espera al
próximo cambio.

## Límites

- Un archivo de hasta **5 MB**, y hasta **20.000** líneas.
- Un origen por tabla; varias tablas pueden sincronizarse desde el mismo
  archivo, cada una desde su propia hoja.
- Una tabla sincronizada no puede estar
  [limitada al cliente](/es/docs/data/#quién-ve-qué): sus filas vienen de la
  hoja, sin cliente, así que los bots no las verían.
- Se rechaza una eliminación en otra tabla que llegaría en cascada a las filas
  de una tabla sincronizada, o que vaciaría una relación en ellas; primero
  cambia la hoja.

## Desde la API, la CLI y ganju.data.json

El `source` de una tabla es un ajuste de la tabla:

```json
{
  "name": "menu",
  "source": { "uri": "gdrive://files/1AbC…", "sheet": "Precios", "key": "sku" },
  "columns": [
    { "name": "sku", "type": "text", "required": true, "unique": true },
    { "name": "name", "type": "text", "required": true },
    { "name": "price", "type": "integer", "min": 0 }
  ]
}
```

- `PATCH …/table/menu` con `{ "source": { … } }` empieza a sincronizar, y
  `{ "source": null }` lo detiene. `POST …/table/menu/sync` es **Sincronizar
  ahora**. Cada tabla responde con `sync`: cuándo corrió la última
  sincronización, `ok` o `failed`, qué insertó, actualizó y eliminó, y por qué
  se rechazó. Consulta la [API de datos](/es/docs/data-api/#cambiar-las-tablas).
- En `ganju.data.json`, `ganju data schema push` lo pone o lo quita como
  cualquier otro ajuste, y `ganju data schema pull` lo escribe.
  `ganju data tables` muestra de dónde viene cada tabla sincronizada y cómo le
  fue en su última sincronización; `ganju data table sync menu` es
  **Sincronizar ahora**.
- La herramienta `data-admin` del asistente puede detener una sincronización,
  pero se configura desde el panel, la API o la CLI, donde se revisa el
  archivo.
