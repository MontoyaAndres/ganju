---
title: Sincronizar una tabla desde una hoja de cálculo
description: Mantén las filas de una tabla al día con una hoja de Google, un archivo de Excel o un CSV de Recursos, emparejadas por una columna clave, leídas otra vez cada vez que cambia el archivo y de solo lectura en todo lo demás.
order: 59
updated: 2026-11-13
---

Muchos negocios ya llevan el menú, los precios o el inventario en una hoja de
cálculo. Una tabla **sincronizada desde una hoja de cálculo** mantiene esas
filas al día con ella, para que nadie las escriba dos veces: cambias un precio
en la hoja y la fila en Ganju cambia también.

El origen es cualquier hoja de cálculo o CSV de [Recursos](/es/docs/resources/):
una hoja de Google importada desde Drive, un archivo de Excel desde OneDrive, o
un CSV, TSV, `.xlsx`, `.xls` u hoja de cálculo OpenDocument que subiste. La
sincronización va en un solo sentido: **manda la hoja**.

> **¿Sincronizar o importar?** Para copiar una vez las filas de un archivo y
> luego editarlas en Ganju, [impórtalo](/es/docs/data/#importar-un-archivo).
> Para seguir editando la hoja de cálculo y que Ganju la siga, sincronízala.

## Configúrala

1. Pon el archivo en [Recursos](/es/docs/resources/), si todavía no está.
2. Asegúrate de que la tabla tenga una columna **Única** que identifique la
   misma fila en la hoja y en la tabla, como `sku` o `name`. Esa es la
   **clave**.
3. Abre la tabla en la página **Datos**, ve a su pestaña **Esquema**, y en
   **Origen: hoja de cálculo** haz clic en **Sincronizar desde una hoja de
   cálculo**.
4. Elige el **Archivo**, la **Hoja** (vacía para la primera) y la **Columna
   clave**, y haz clic en **Empezar a sincronizar**.

La primera sincronización corre de inmediato. Deja la tabla como dice la hoja,
así que **se eliminan las filas cuya clave no está en la hoja**.

La primera fila de la hoja tiene los encabezados. Cada encabezado se empareja
con una columna por su nombre o su etiqueta, igual que en una
[importación](/es/docs/data/#importar-un-archivo): `Precio` llena `price`
cuando `price` tiene la etiqueta "Precio". Los encabezados que no coinciden con
ninguna columna se ignoran, y también las columnas que la hoja no tiene. Las
celdas se leen como en una importación: fechas, números como `28.000`,
`sí` / `no`, y una relación por el valor que muestra la fila relacionada.

## Cuándo se sincroniza

- **Cuando cambia el archivo.** Un archivo de Drive o de OneDrive se revisa
  según su propio [intervalo de sincronización](/es/docs/resources/), y se
  vuelve a leer solo si cambió. Un archivo subido se sincroniza cuando lo
  reemplazas.
- **Cuando lo pides.** **Sincronizar ahora**, en la pestaña Filas de la tabla o
  en su origen, vuelve a traer un archivo de Drive o de OneDrive si cambió, y
  luego lo lee. **Sincronizar ahora** en el elemento de Recursos hace lo mismo.
  Puedes pedirlo cinco veces por minuto.

Cada sincronización, de una sola vez:

- inserta las líneas cuya clave es nueva,
- actualiza las filas cuyos valores difieren de su línea,
- elimina las filas cuya clave ya no está en la hoja.

Las filas que no cambiaron no se escriben: conservan su versión y no reciben
una entrada en el [historial](/es/docs/data/#quién-ve-qué). Los cambios los
hace `system:sheet-sync`, que es lo que muestra el historial de la fila, y
activan los [disparadores](/es/docs/data/triggers/) de la tabla: un cambio de
precio o de inventario en la hoja igual puede avisarle a alguien.

La pestaña Filas de la tabla dice de dónde vienen las filas y cuándo se
sincronizaron por última vez ("Sincronizada desde Menú.xlsx · sincronizada hace
5 minutos"). En **Origen: hoja de cálculo**, **Última sincronización** dice
cuándo corrió y cuántas filas agregó, actualizó y eliminó.

![La pestaña Filas de una tabla sincronizada: "Sincronizada desde qa_menu" con Sincronizar ahora, y Nueva fila e Importar desactivados](/images/data-sheet-sync-rows.webp)

## Solo lectura mientras se sincroniza

Las filas de una tabla sincronizada solo cambian en la hoja. Agregar, cambiar o
eliminar una fila se rechaza desde cualquier lugar, el panel, la API, la CLI,
las funciones y el asistente, con un mensaje como:

```
menu is synced from "Menú.xlsx"; change the sheet, or stop syncing it.
```

Todavía puedes cambiar las columnas y los ajustes de la tabla. La columna clave
no se puede eliminar, y sigue siendo única. **Dejar de sincronizar**, en el
origen, deja las filas como están y vuelve a hacerlas editables. **Cambiar**
elige otro archivo, otra hoja u otra clave.

## Cuando se rechaza una sincronización

Una hoja que no encaja se rechaza completa, y la tabla conserva sus filas como
estaban:

- la hoja no tiene una columna para la clave, o para una columna obligatoria;
- una clave está vacía, o aparece en dos líneas;
- un valor no cabe en su columna (texto en una columna de número, un número
  por debajo del mínimo de la columna, una opción que no está en la lista);
- una línea que se borró de la hoja todavía la señalan filas de otra tabla.

El motivo aparece en la pestaña Filas de la tabla y en su origen, con la línea
donde se encontró, y en **Salud de las herramientas** en el resumen del
proyecto. Corrige la hoja y luego haz clic en **Sincronizar ahora** o espera el
siguiente cambio.

## Límites

- Un archivo de hasta **5 MB**, y hasta **20.000** líneas.
- Un origen por tabla; varias tablas pueden sincronizarse desde el mismo
  archivo, cada una desde su propia hoja.
- Una tabla sincronizada no puede ser
  [limitada al cliente](/es/docs/data/#quién-ve-qué): sus filas vienen de la
  hoja, sin cliente, así que los bots no las verían.
- Se rechaza una eliminación en otra tabla que bajaría en cascada a las filas de
  una tabla sincronizada, o vaciaría una relación en ellas; cambia la hoja
  primero.

## Desde el Asistente, la API, la CLI y ganju.data.json

El `source` de una tabla es un ajuste de la tabla: `uri` (el uri del archivo en
Recursos), `sheet` (opcional) y `key`.

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

- **API de Datos**: `PATCH …/table/menu` con `{ "source": { … } }` empieza a
  sincronizar, y `{ "source": null }` lo detiene. `POST …/table/menu/sync` es
  **Sincronizar ahora** (responde `202` y corre en segundo plano). Cada tabla en
  `GET …/table` trae `sync`: cuándo corrió la última sincronización, `ok` o
  `failed`, lo que insertó, actualizó, eliminó y dejó igual, y por qué se
  rechazó. Mira la [API de Datos](/es/docs/data-api/#cambiar-las-tablas).
- **CLI**: en `ganju.data.json`, `ganju data schema push` lo pone o lo quita
  como cualquier otro ajuste, y `ganju data schema pull` lo escribe.
  `ganju data tables` muestra de dónde viene cada tabla sincronizada y cómo le
  fue en su última sincronización; `ganju data table sync menu` es
  **Sincronizar ahora**.
- **Asistente**: pídele al [Asistente](/es/docs/assistant/) del proyecto que
  cree una tabla a partir de una hoja de cálculo de Recursos y la mantenga
  sincronizada; te propone la tabla con su origen, y tú la aplicas.
- **Clientes MCP**: la herramienta `data-admin` puede detener una
  sincronización, pero configurar una se hace desde el panel, el Asistente, la
  API o la CLI, donde se revisa el archivo.
