---
title: Datos
description: Dale a un proyecto su propia base de datos — tablas con columnas tipadas, relaciones y búsqueda — que el asistente, tus funciones, la CLI y la API leen y escriben, con restauración a cualquier momento de los últimos 30 días.
order: 7
updated: 2026-11-13
---

Cada proyecto en **Pro** o **Enterprise** puede tener su propia **base de
datos**: tablas con columnas tipadas, relaciones entre ellas y búsqueda de texto
completo. Ahí viven un menú, los pedidos, las reservas o el inventario, para que
el asistente pueda consultarlos y anotarlos, y tu propio código también.

El asistente, tus [funciones](/es/docs/data/functions/), la
[CLI](/es/docs/data-api/#desde-la-línea-de-comandos), la
[API de Datos](/es/docs/data-api/) y el panel usan la misma base de datos, con
las mismas reglas. Nada puede escribir en ella por fuera de ellos.

> **¿Datos o Recursos?** Filas con campos — menús, pedidos, clientes, reservas,
> inventario — van en Datos. Documentos y páginas que el asistente lee y cita van
> en [Recursos](/es/docs/resources/).

## Crear la base de datos

Abre **Datos** en el proyecto. Si aún no hay base de datos, la página explica
para qué sirve y muestra **Nombre (opcional)** y **Crear base de datos**. Por
defecto el nombre es el slug del proyecto; lo escribes para eliminar la base de
datos más adelante.

Desde la CLI:

```bash
ganju data create                 # con el slug del proyecto como nombre
ganju data create --name pizzeria
```

Un proyecto tiene una base de datos. La mayoría de los proyectos nunca la
necesitan, así que no se crea nada hasta que la pides. En Free, la página
muestra **Datos es parte de Pro** con **Ver planes**.

## La página de Datos

Cuando la base de datos existe, la página tiene una lista a la izquierda y lo
que elijas a la derecha:

- **Tablas**, cada una con su número de filas. Búscalas con **Buscar tablas**,
  crea una con **+** (**Nueva tabla**) o con el ícono de subir (**Nueva tabla
  desde un archivo**).
- **Consultas**: las [consultas guardadas](#consultas-guardadas).
- **Programaciones**: las [programaciones](/es/docs/data/schedules/), cosas que
  se ejecutan cada día o cada semana a una hora fija.
- **Ajustes de la base de datos** (el engranaje de arriba): tamaño,
  [zona horaria](#zona-horaria), descarga, restauración y eliminación.

![La página Datos: tablas con su número de filas, Consultas y Programaciones a la izquierda, y la pestaña Filas de una tabla](/images/data-tables.webp)

Una tabla se abre en tres pestañas: **Filas**, **Esquema** y **Disparadores**.

## Tablas y columnas

Una tabla guarda un tipo de cosa — los platos que vendes, tus pedidos, tus
clientes — con una columna para cada detalle. Haz clic en **Nueva tabla**, dale
un **Nombre de la tabla** (minúsculas, dígitos y `_`, como `lineas_pedido`) y
sus columnas, o en **Nueva tabla desde un archivo** para empezar desde una hoja
de cálculo: mira [Importar un archivo](#importar-un-archivo).

![El diálogo Nueva tabla: nombre de la tabla, etiqueta, descripción y la primera columna](/images/data-new-table.webp)

| Tipo | En el panel | Guarda |
| --- | --- | --- |
| `text` | Texto | Texto corto |
| `long_text` | Texto largo | Notas y descripciones |
| `integer` | Número entero | Números enteros, con un mínimo opcional (el inventario no puede bajar de 0) |
| `decimal` | Número decimal | Números decimales, con un mínimo opcional |
| `boolean` | Sí / no | Sí o no |
| `date` | Fecha | Un día |
| `datetime` | Fecha y hora | Un momento, guardado en UTC y mostrado en una zona horaria |
| `enum` | Opciones | Una de una lista de hasta 100 opciones, como `open`, `ready`, `delivered` |
| `json` | JSON | Cualquier valor JSON |
| `email`, `url`, `phone` | Correo, URL, Teléfono | Texto que se revisa con esa forma |
| `relation` | Relación | Una fila de otra tabla (**Apunta a**). **Cuando se elimina esa fila**: **Impedir que se elimine**, **Eliminar también estas filas** o **Vaciar esta columna** |
| `file` | Archivo | Un archivo de [Recursos](/es/docs/resources/), por su uri |

Cada columna tiene un **Nombre**, un **Tipo**, una **Etiqueta** opcional (que se
muestra en lugar del nombre) y una **Descripción**, y además puede ser:

- **Obligatoria**: toda fila debe tenerla.
- **Única**: dos filas no comparten valor.
- **Filtrable**: con índice, para que los filtros y ordenamientos sobre ella
  sigan siendo rápidos a medida que la tabla crece. Las relaciones y las
  columnas únicas tienen índice por sí solas.
- **Buscable**: entra en la búsqueda de texto completo. La búsqueda ignora las
  tildes, así que "jalapeno" encuentra "jalapeño".

En **Más opciones**: un **Mínimo** para los números (se rechaza lo que quede por
debajo) y un **Valor por defecto**, que se usa cuando una fila nueva deja la
columna vacía.

Una columna **Archivo** toma un archivo que subes con **Subir** (queda en
Recursos, en **Datos adjuntos**) o uno que eliges con **Elegir de recursos**. Su opción **Buscable en
recursos** indexa los archivos que se suban de ahí en adelante, para que la
búsqueda de recursos del asistente los encuentre. Si el archivo se elimina
después de Recursos, la fila muestra **Archivo no encontrado**.

Cada fila también tiene `id`, `created_at`, `updated_at` y una `version` que
sube con cada cambio. La base de datos los asigna.

La **Descripción** de una tabla y de cada columna le dice al asistente qué
guarda («las pizzas que vendemos, con precio e inventario»). Escríbela: es lo
que el asistente lee para saber qué tabla usar.

### Filas

La pestaña **Filas** es una cuadrícula. Ordena y filtra desde el encabezado de
cada columna, busca texto con **Buscar filas** y pasa de página.
**Actualizar** la recarga, **Importar** agrega filas desde un archivo y **Nueva
fila** abre una fila vacía. Selecciona varias filas para eliminarlas juntas con **Eliminar**.

![La pestaña Filas de una tabla: la cuadrícula, Actualizar, Importar y Nueva fila](/images/data-rows.webp)

Haz clic en una fila para abrirla en un panel lateral, cambiar sus campos y
guardar. El panel muestra cuándo fue **Creada** y **Actualizada**, y su
**Versión**. Un campo de relación busca en la otra tabla mientras escribes;
muestra la **Columna a mostrar** de esa tabla («Margarita» en lugar de #12).

![El panel de una fila: el campo de cada columna, creada, actualizada y versión, con Guardar y Eliminar](/images/data-row-panel.webp)

Si alguien cambió la fila después de que la abriste, al guardar te dice quién y
te ofrece **Cargar la versión más reciente**. Antes de eliminar te muestra qué
más se iría: filas que también se eliminarían, que se vaciarían o que impiden
la eliminación.

### Esquema

La pestaña **Esquema** tiene:

- **Columnas**, con su tipo y sus reglas. **Agregar columna**, o edita y elimina
  una desde su fila. Cambiar el tipo de una columna revisa primero todas las
  filas; si algunas no caben, no cambia nada y te muestra cuáles. En una tabla
  de más de 100.000 filas el cambio se hace en segundo plano, con el avance
  arriba.
- **Ajustes de la tabla**: nombre, etiqueta, descripción, **Columna a
  mostrar** y quién la ve ([Quién ve qué](#quién-ve-qué)).
- **Origen: hoja de cálculo**: mantén la tabla al día con una hoja de cálculo.
  Mira [Sincronizar una tabla desde una hoja de cálculo](/es/docs/data/sheet-sync/).
- **Relaciones** desde y hacia esta tabla, y sus **Índices**.
- **Eliminar tabla**, que te pide escribir su nombre.

Eliminar una tabla o una columna, o cambiar un tipo, se puede deshacer justo
después: **Deshacer** devuelve toda la base de datos a justo antes del cambio.

![La pestaña Esquema de una tabla: columnas con su tipo y reglas, y la configuración de la tabla](/images/data-schema.webp)

### Sugerencias de índices

Ganju observa cómo se consultan tus tablas, sin guardar nada en tu base de
datos, y una vez al día sugiere un índice donde valdría la pena. Una sugerencia
aparece arriba en la pestaña **Esquema** de la tabla con los números que la
respaldan, por ejemplo: "340 consultas esta semana filtraron u ordenaron por
`status`, y cada una leyó unas 12.000 filas para devolver 8."

Se sugiere una columna cuando, en los últimos 7 días:

- no tiene índice;
- 50 consultas o más filtraron u ordenaron por ella;
- esas consultas leyeron en promedio 1.000 filas o más, y 20 o más por cada
  fila que devolvieron.

**Agregar índice** marca la columna como filtrable y lo registra en el
historial de cambios. **Descartar** oculta la sugerencia hasta que sus números
se dupliquen.

Ganju también señala un índice que ninguna consulta usó en 30 días en una tabla
donde se escribe mucho, porque cada escritura actualiza también el índice. Es
solo un aviso: no se quita nada. Desactiva **Filtrable** en la columna si nada
lo necesita.

Las sugerencias abiertas también aparecen en **Salud de las herramientas** del
proyecto y en `ganju data info`; `ganju data index add <id>` y
`ganju data index dismiss <id>` actúan sobre una.

## Importar un archivo

**Nueva tabla desde un archivo** lee un archivo CSV, TSV o Excel (`.xlsx`,
`.xls`) cuya primera fila tiene los nombres de las columnas. Deduce el nombre y
el tipo de cada columna a partir de las primeras 200 filas; corrige cualquiera,
o desmarca una columna para dejarla fuera, antes de crear la tabla. Un libro con
varias hojas te pregunta qué **Hoja** usar.

**Importar**, en la pestaña Filas de una tabla, agrega las filas de un archivo a
una tabla que ya existe:

- Cada columna del archivo va a la columna de la tabla que elijas, emparejada
  primero por nombre o etiqueta. **Dejar fuera** omite una.
- **Agregar las filas a la tabla**, o **Reemplazar todas las filas de la
  tabla** (escribes el nombre de la tabla para confirmar, y puedes **Deshacer
  la importación** justo después).
- **Números en este archivo**: valores como `28.000` se pueden leer de dos
  formas, así que elige cómo escribe los decimales el archivo cuando Ganju no
  lo pueda saber.
- Una relación se empareja por la columna a mostrar de la otra tabla. **Valores
  sin coincidencia** te deja elegir la fila a la que se refiere cada valor
  desconocido.
- La **Vista previa** marca las filas con problemas; quedan fuera, y puedes
  **Descargar las filas que quedaron fuera (CSV)** para corregirlas e
  importarlas de nuevo.

Desde la CLI, `ganju data import <tabla> <archivo>` hace lo mismo con archivos
CSV, Excel y JSONL. Mira [la línea de comandos](/es/docs/data-api/#desde-la-línea-de-comandos).

## Quién ve qué

Tus propios clientes MCP, como dueño del proyecto, el panel, la CLI y tus
funciones ven todas las tablas y todas las filas. Los **bots de los canales** —
el asistente que atiende a los clientes en WhatsApp, Telegram, Slack o Discord —
solo ven lo que permiten los ajustes de cada tabla. En la pestaña **Esquema** de
la tabla, en **Ajustes de la tabla**:

- **Acceso del asistente (bots de canales)**:
  - **Ninguno**: los bots no ven la tabla.
  - **Leer** (por defecto): los bots pueden consultar filas, pero no
    cambiarlas.
  - **Leer y agregar**: los bots pueden consultar filas y agregar nuevas, como
    pedidos.
  - **Total**: los bots pueden agregar, cambiar y eliminar filas. Eliminar sigue
    pidiéndole confirmación al cliente.
- **Cada cliente ve solo sus propias filas**: en los canales, una fila queda
  ligada al cliente cuya conversación la escribió, así que «mis pedidos» son los
  suyos. Un bot nunca lee las filas de otro cliente.
- **Guardar el historial de filas** (activado por defecto): quién cambió cada
  fila y cuándo, durante 90 días. Léelo con `ganju data history <tabla> <id>` o
  con la [API de Datos](/es/docs/data-api/#historial-restauración-y-exportación).

El texto que un cliente escribió en una fila se trata como contenido externo,
igual que una página web: el asistente lo lee, pero no sigue instrucciones que
vengan en él.

## Las herramientas de datos del asistente

Cuando el proyecto tiene una base de datos, el asistente recibe estas
herramientas, en todos los canales y clientes MCP, sin instalar nada:

| Herramienta | Qué hace |
| --- | --- |
| `data-describe` | Lista las tablas y columnas que puede ver |
| `data-query` | Busca, filtra, cuenta y suma filas, o ejecuta una [consulta guardada](#consultas-guardadas) |
| `data-write` | Agrega, cambia y elimina filas, varias a la vez, todo o nada |
| `data-admin` | Crea y cambia tablas, columnas y consultas guardadas, importa y exporta. Solo para los administradores de la organización, desde sus propios clientes MCP |

Las herramientas de un bot de canal solo llegan a las tablas, y a las filas, que
permiten sus ajustes. En un canal, cambiar o eliminar filas le pregunta primero
al cliente; agregar filas, como hacer un pedido, no.

## Constrúyela con el Asistente

El [Asistente](/es/docs/assistant/) del proyecto puede armar la base de datos
por ti con palabras sencillas: «haz una tabla con las pizzas que vendemos, con
precio e inventario», «envíame un correo con cada pedido nuevo», «cada noche a
las 9, mándame los pedidos de hoy». Puede:

- crear la base de datos y ponerle su [zona horaria](#zona-horaria);
- crear, cambiar y eliminar tablas y columnas, y agregar, cambiar o eliminar
  filas (hasta 200 a la vez);
- guardar y eliminar [consultas guardadas](#consultas-guardadas), y ejecutar
  una para mostrarte el resultado;
- crear, encender o apagar y eliminar [disparadores](/es/docs/data/triggers/) y
  [programaciones](/es/docs/data/schedules/), y enviarte una prueba de un correo
  antes de que llegue su hora.

Nada cambia hasta que lo aplicas. El Asistente propone una lista de cambios,
cada uno en una línea sencilla; la revisas y haces clic en **Aplicar**, y lo que
elimina algo te pide escribir el nombre de lo que se va. Los cambios de datos
aplicados así se pueden deshacer con **Deshacer**. Deshacer una tabla o columna
eliminada, un cambio de tipo o filas eliminadas devuelve toda la base de datos a
justo antes de ese cambio, así que lo que se haya escrito después se reemplaza;
el cambio te lo advierte antes de aplicarlo.

Si un desarrollador maneja las tablas desde código con
`ganju data schema push`, el Asistente te avisa que su próximo push revertirá un
cambio hecho ahí.

## Consultas guardadas

Hay reportes que los filtros no pueden expresar: ventas por plato la semana
pasada, los clientes que no han pedido en un mes. Escríbelos una vez como una
**consulta guardada**: un solo `SELECT` (o `WITH … SELECT`) sobre tus tablas,
con parámetros como `:from`.

```sql
SELECT m.name AS dish, sum(l.quantity) AS units, sum(l.quantity * l.price) AS revenue
FROM order_lines l
JOIN menu m ON m.id = l.dish
JOIN orders o ON o.id = l."order"
WHERE o.created_at >= :from AND o.created_at < :to
GROUP BY m.name
ORDER BY revenue DESC
```

Abre **Consultas** en la página Datos y haz clic en **Nueva consulta**. Dale un
**Nombre** (minúsculas, dígitos y `_`), una **Descripción** y el SQL. Cada
parámetro en **Parámetros** tiene un tipo (`text`, `integer`, `decimal`,
`boolean`, `date` o `datetime`) y puede ser **Obligatorio**; un valor se revisa
contra su tipo antes de ejecutar la consulta. La consulta se revisa al
guardarla: solo puede leer, y solo tus tablas. **Lee** muestra las tablas que
lee, y si lee una tabla grande completa, el diálogo te dice qué columna
indexar. **Ejecutar** la prueba con los valores que escribas.

![La vista Consultas con su descripción y el botón Nueva consulta](/images/data-queries.webp)

Una consulta guardada se ejecuta por su nombre desde tus funciones
(`ctx.data.run`), la CLI (`ganju data run`), la API (`POST /query/:name/run`),
una [programación](/es/docs/data/schedules/) y, si activas **El asistente puede
ejecutarla**, desde `data-query`. Una consulta que lee una tabla donde cada
cliente ve solo sus propias filas nunca se les ofrece a los bots de los
canales, porque vería las filas de todos los clientes.

Una ejecución devuelve hasta 100 filas por defecto, 500 como máximo, y 1 MB.
Una consulta que leería completa una tabla de más de 200.000 filas se rechaza:
filtra por una columna con índice.

Un proyecto guarda hasta 100 consultas, cada una con hasta 10.000 caracteres de
SQL y 20 parámetros. También quedan en `ganju.data.json` junto con el esquema,
en `"queries"`.

## Zona horaria

**Ajustes de la base de datos → Zona horaria** define la zona en la que vuelven
las fechas y horas para el asistente, tus funciones y la API cuando no piden
otra. Una fecha y hora escrita sin desfase también se lee en ella. Es además la
zona en la que se ejecutan las [programaciones](/es/docs/data/schedules/), y la
medianoche desde la que cuenta un
[disparador por tiempo](/es/docs/data/triggers/#disparadores-por-tiempo) sobre
una columna de fecha. Sin una, es UTC. El panel siempre muestra las horas en la
zona de tu navegador.

![El diálogo de configuración de la base de datos: tamaño, zona horaria, descargar una copia y restaurar a un momento](/images/data-settings.webp)

Desde la CLI:

```bash
ganju data time-zone                  # la muestra
ganju data time-zone America/Bogota
ganju data time-zone --clear          # vuelve a UTC
```

Por la API es un `PATCH` sobre la base de datos con `{ "timeZone":
"America/Bogota" }`, o `null` para UTC. El Asistente también puede cambiarla.

## Restaurar y descargar

Las tres están en **Ajustes de la base de datos**:

- **Restaurar a un momento**: devuelve toda la base de datos a como estaba en
  cualquier momento de los últimos 30 días. Todo lo que se escribió después se
  reemplaza, y puedes **Deshacer la restauración** justo después. Los eventos de
  disparadores que aún esperan ser enviados se descartan, y las filas que
  vuelven con una restauración no activan disparadores.
- **Puntos de restauración**: antes de un cambio grande, toma uno con
  `ganju data checkpoint` o `POST /checkpoint`, y restaura a él para deshacer
  exactamente ese cambio.
- **Descargar una copia**: cada tabla en su propio archivo JSONL o CSV, más el
  esquema, preparada en segundo plano. Desde la CLI:
  `ganju data export --format csv --out backup/`.

## Eliminar la base de datos

**Ajustes de la base de datos → Eliminar base de datos** quita todas las tablas y
filas; escribes el nombre de la base de datos para confirmar. Durante 7 días
puedes restaurarla (**Restaurar base de datos** en la página Datos, o
`ganju data restore`), o descargar una copia. Después se borra para siempre. Lo
que el asistente y tus funciones leen y escriben ahí deja de funcionar de
inmediato.

## Límites

| | Por base de datos |
| --- | --- |
| Tamaño | 9 GB. Al pasarlo, se rechazan las escrituras que agregan datos; leer, eliminar y descargar siguen funcionando |
| Tablas | 50 |
| Columnas | 93 por tabla |
| Opciones de un `enum` | 100 |
| Filas por página | 500, o 1 MB |
| Una inserción | 500 filas |
| Una escritura | 50 operaciones y 5.000 filas, todo o nada |
| Consultas guardadas | 100 |
| Disparadores y programaciones | 50 en total, de los cuales hasta 10 disparadores por tiempo y 5 programaciones |
| Historial de filas | 90 días |
| Restauración | Cualquier momento de los últimos 30 días |
| Después de eliminarla | 7 días para restaurarla |

## Planes y facturación

Datos es parte de **Pro** y **Enterprise**. Si la organización pasa a Free, sus
bases de datos se quedan, en **solo lectura**: puedes leer y descargar todo, el
asistente y tus funciones pueden seguir leyendo, y no se puede cambiar nada
hasta que mejores el plan. Los disparadores y las programaciones se pausan.

Una base de datos cuya organización sigue en Free se elimina después de un
aviso:

- **Día 30 en Free:** el dueño y los administradores reciben un correo con cada
  base de datos (proyecto, tamaño, tablas), que dice que está en solo lectura y
  la fecha en que se eliminará, con enlaces para mejorar el plan y para
  descargar una copia.
- **3 días antes de esa fecha (día 41):** un recordatorio.
- **Desde el día 44:** Ganju la elimina manualmente. Se guarda una copia durante
  90 días; escríbele a soporte si la necesitas.

Volver a Pro o Enterprise en cualquier momento detiene esto y conserva todo.
Descargar una copia no lo detiene. Una base de datos de Pro que simplemente no
se usa nunca se elimina.

**Ajustes → Plan y facturación** muestra un bloque **Datos** del periodo
actual: almacenamiento (revisado cada hora) y el máximo del periodo, filas
leídas y escritas, solicitudes y ejecuciones de disparadores. Este uso se mide
pero todavía no se cobra; se fijará un precio cuando haya números reales de uso,
y se anunciará antes de que aplique.

## Siguiente

- [Datos desde funciones](/es/docs/data/functions/): `ctx.data` y
  `ctx.channels` en tu propio código.
- [Disparadores y webhooks](/es/docs/data/triggers/): ejecuta algo cuando
  cambian las filas.
- [Programaciones](/es/docs/data/schedules/): ejecuta algo cada día o cada
  semana a una hora fija.
- [Sincronizar una tabla desde una hoja de cálculo](/es/docs/data/sheet-sync/):
  mantén un menú, los precios o el inventario al día con una hoja de Google, un
  archivo de Excel o un CSV.
- [API de Datos](/es/docs/data-api/): la misma base de datos por HTTP, y los
  comandos `ganju data`.
