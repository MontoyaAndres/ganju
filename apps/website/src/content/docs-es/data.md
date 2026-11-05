---
title: Datos
description: Dale a un proyecto su propia base de datos — tablas con columnas tipadas, relaciones y búsqueda — que el asistente, tus funciones, la CLI y la API leen y escriben, con restauración a cualquier momento de los últimos 30 días.
order: 7
updated: 2026-11-03
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

Abre **Datos** en el proyecto y haz clic en **Crear base de datos**. El nombre
es opcional (por defecto es el slug del proyecto); lo escribes para eliminar la
base de datos más adelante. Desde la CLI es `ganju data create`.

Un proyecto tiene una base de datos. La mayoría de los proyectos nunca la
necesitan, así que no se crea nada hasta que la pides.

## Tablas y columnas

Una tabla guarda un tipo de cosa — los platos que vendes, tus pedidos, tus
clientes — con una columna para cada detalle. Haz clic en **Nueva tabla**, o en
**Nueva tabla desde un archivo** para empezar desde un archivo CSV o JSONL: las
columnas y sus tipos se adivinan por ti.

| Tipo | Guarda |
| --- | --- |
| `text`, `long_text` | Texto. El texto largo es para notas y descripciones |
| `integer`, `decimal` | Números enteros y decimales, con un mínimo opcional (el inventario no puede bajar de 0) |
| `boolean` | Sí / no |
| `date`, `datetime` | Un día, o un momento con su zona horaria |
| `enum` | Una opción de una lista, como `open`, `ready`, `delivered` |
| `json` | Cualquier valor JSON |
| `email`, `url`, `phone` | Texto que se revisa con esa forma |
| `relation` | Una fila de otra tabla. Eliges qué pasa al eliminar esa fila: impedir que se elimine, eliminar también estas filas o vaciar esta columna |
| `file` | La dirección de un archivo (su uri) |

Cada columna además puede ser:

- **Obligatoria**: toda fila debe tenerla.
- **Única**: no hay dos filas con el mismo valor.
- **Filtrable**: con índice, para que los filtros y ordenamientos sobre ella
  sigan siendo rápidos a medida que la tabla crece. Las relaciones y las
  columnas únicas tienen índice por sí solas.
- **Buscable**: incluida en la búsqueda de texto completo. La búsqueda ignora
  las tildes, así que "jalapeno" encuentra "jalapeño".

Cada fila también tiene `id`, `created_at`, `updated_at` y una `version` que
sube con cada cambio. La base de datos los pone.

La **Descripción** de una tabla y de cada columna le dice al asistente qué
guarda ("las pizzas que vendemos, con precio e inventario"). Escríbela: es lo
que el asistente lee para saber qué tabla usar.

Cada tabla tiene tres pestañas:

- **Filas**: busca, filtra, agrega, edita y elimina filas. Si alguien cambió
  una fila después de que la abriste, al guardar te dice quién y te deja cargar
  la versión más reciente. Al eliminar, primero muestra qué más se iría: filas
  que también se eliminarían, que se vaciarían o que impiden eliminar.
- **Esquema**: columnas, relaciones e índices. Cambiar el tipo de una columna
  revisa primero cada fila; si algunas no encajan, no cambia nada y recibes la
  lista. Eliminar una tabla o una columna se puede deshacer justo después.
- **Disparadores**: ejecuta algo cuando cambian las filas de la tabla. Mira
  [Disparadores y webhooks](/es/docs/data/triggers/).

### Sugerencias de índices

Ganju mira cómo se consultan tus tablas, sin guardar nada en tu base de datos,
y una vez al día sugiere un índice donde valdría la pena. La sugerencia aparece
arriba en la pestaña **Esquema** de la tabla con los números que la explican,
por ejemplo: "340 consultas esta semana filtraron u ordenaron por `status`, y
cada una leyó unas 12.000 filas para devolver 8."

Se sugiere una columna cuando, en los últimos 7 días:

- no tiene índice;
- 50 consultas o más filtraron u ordenaron por ella;
- esas consultas leyeron en promedio 1.000 filas o más, y 20 o más por cada
  fila que devolvieron.

**Agregar índice** marca la columna como filtrable y lo registra en el historial
de cambios. **Descartar** oculta la sugerencia hasta que sus números se dupliquen.

Ganju también señala un índice que ninguna consulta usó en 30 días en una tabla
con muchas escrituras, porque cada escritura actualiza también el índice. Es
solo un aviso: no se quita nada. Desactiva **Filtrable** en la columna si nada
lo necesita.

Las sugerencias abiertas también aparecen en **Salud de las herramientas** del
proyecto y en `ganju data info` (`ganju data index add|dismiss <id>` actúa
sobre una).

## Quién ve qué

Tus propios clientes MCP, como dueño del proyecto, el panel, la CLI y tus
funciones ven todas las tablas y todas las filas. Los **bots de canales** — el
asistente que atiende clientes en WhatsApp, Telegram, Slack o Discord — solo ven
lo que permiten los ajustes de cada tabla. Abre los ajustes de una tabla:

- **Acceso del asistente (bots de canales)**:
  - **Ninguno**: los bots no ven la tabla.
  - **Leer**: los bots pueden consultar filas, pero no cambiarlas.
  - **Leer y agregar**: los bots pueden consultar filas y agregar nuevas, como
    pedidos.
  - **Total**: los bots pueden agregar, cambiar y eliminar filas. Para eliminar
    igual le piden confirmación al cliente.
- **Cada cliente ve solo sus propias filas**: en los canales, una fila queda
  ligada al cliente cuya conversación la escribió, así que "mis pedidos" son los
  suyos. Un bot nunca lee las filas de otro cliente.
- **Guardar el historial de filas**: quién cambió cada fila y cuándo, durante
  90 días.

El texto que un cliente escribió en una fila se trata como contenido externo,
como una página web: el asistente lo lee, pero no sigue instrucciones que haya
en él.

## Las herramientas de datos del asistente

Cuando el proyecto tiene base de datos, el asistente recibe estas
herramientas, en cada canal y cliente MCP, sin instalar nada:

| Herramienta | Qué hace |
| --- | --- |
| `data-describe` | Lista las tablas y columnas que puede ver |
| `data-query` | Busca, filtra, cuenta y suma filas, o ejecuta una [consulta guardada](#consultas-guardadas) |
| `data-write` | Agrega, cambia y elimina filas, varias a la vez, todo o nada |
| `data-admin` | Crea y cambia tablas, columnas y consultas guardadas, importa y exporta. Solo para los administradores de la organización, desde sus propios clientes MCP |

Las herramientas de un bot de canal solo llegan a las tablas, y a las filas,
que permiten sus ajustes. En un canal, cambiar o eliminar filas le pregunta
primero al cliente; agregar filas, como hacer un pedido, no.

## Consultas guardadas

Hay reportes que los filtros no pueden expresar: ventas por plato de la semana
pasada, los clientes que no han pedido en un mes. Escríbelos una vez como
**consulta guardada**: un `SELECT` (o `WITH … SELECT`) sobre tus tablas, con
parámetros como `:from`.

```sql
SELECT m.name AS dish, sum(l.quantity) AS units, sum(l.quantity * l.price) AS revenue
FROM order_lines l
JOIN menu m ON m.id = l.dish
JOIN orders o ON o.id = l."order"
WHERE o.created_at >= :from AND o.created_at < :to
GROUP BY m.name
ORDER BY revenue DESC
```

Abre **Consultas** en la página de Datos para escribir una. Cada parámetro
tiene un tipo (`text`, `integer`, `decimal`, `boolean`, `date` o `datetime`), y
un valor se revisa contra él antes de ejecutar la consulta. La consulta se
revisa al guardarla: solo puede leer, y solo tus tablas. Si lee toda una tabla
grande, el diálogo lo dice y qué columna indexar.

Una consulta guardada se ejecuta por nombre desde tus funciones
(`ctx.data.run`), la CLI (`ganju data run`), la API
(`POST /query/:name/run`) y, si activas **El asistente puede ejecutarla**,
desde `data-query`. Una consulta que lee una tabla donde cada cliente ve solo
sus propias filas nunca se ofrece a los bots de canales, porque vería las filas
de todos los clientes.

Un proyecto guarda hasta 100 consultas. También quedan en `ganju.data.json`
junto con el esquema, bajo `"queries"`.

## Zona horaria

**Ajustes de la base de datos → Zona horaria** define la zona en la que vuelven
las fechas y horas para el asistente, tus funciones y la API cuando no piden
una. El panel las muestra en la zona de tu navegador. Desde la CLI:
`ganju data time-zone America/Bogota`.

## Restaurar y descargar

- **Restaurar a un momento**: devuelve toda la base de datos a como estaba en
  cualquier momento de los últimos 30 días, desde **Ajustes de la base de
  datos**. Todo lo escrito después de ese momento se reemplaza, y puedes
  deshacer la restauración justo después. Los eventos de disparadores que aún
  esperaban envío se descartan, y las filas que trae la restauración no activan
  disparadores.
- **Puntos de restauración**: antes de un cambio grande, toma uno con
  `ganju data checkpoint` o `POST /checkpoint`, y restaura a él para deshacer
  exactamente ese cambio.
- **Descargar una copia**: cada tabla en su propio archivo JSONL o CSV, más el
  esquema, preparada en segundo plano.

## Eliminar la base de datos

**Ajustes de la base de datos → Eliminar base de datos** quita todas las tablas
y filas. Durante 7 días puedes restaurarla o descargar una copia. Después se va
para siempre. Lo que el asistente y tus funciones leen y escriben ahí deja de
funcionar de inmediato.

## Límites

| | Por base de datos |
| --- | --- |
| Tamaño | 9 GB. Pasado ese tamaño, se rechazan las escrituras que agregan datos; leer, eliminar y descargar siguen funcionando |
| Tablas | 50 |
| Columnas | 93 por tabla |
| Filas por página | 500, o 1 MB |
| Una escritura | 50 operaciones y 5.000 filas, todo o nada |
| Consultas guardadas | 100 |
| Disparadores | 50 |
| Historial de filas | 90 días |
| Restauración | Cualquier momento de los últimos 30 días |

## Planes y facturación

Datos es parte de **Pro** y **Enterprise**. Si la organización pasa a Free, sus
bases de datos se quedan, en **solo lectura**: puedes leer y descargar todo, el
asistente y tus funciones aún pueden leer, y no se puede cambiar nada hasta que
mejores el plan.

Una base de datos cuya organización sigue en Free se elimina después de un
aviso:

- **Día 30 en Free:** el dueño y los administradores reciben un correo con cada
  base de datos (proyecto, tamaño, tablas), que es de solo lectura y la fecha en
  que se eliminará, con enlaces para mejorar el plan y para descargar una copia.
- **3 días antes de esa fecha (día 41):** un recordatorio.
- **Desde el día 44:** Ganju la elimina a mano. Guardamos una copia 90 días;
  escríbenos a soporte si la necesitas.

Volver a Pro o Enterprise en cualquier momento lo detiene y conserva todo.
Descargar una copia no lo detiene. Una base de datos de Pro que simplemente no
se usa nunca se elimina.

**Ajustes → Plan y facturación** muestra un bloque **Datos** del periodo
actual: almacenamiento (medido cada hora) y el pico del periodo, filas leídas y
escritas, solicitudes y ejecuciones de disparadores.

## Siguiente

- [Datos desde funciones](/es/docs/data/functions/): `ctx.data` y
  `ctx.channels` en tu propio código.
- [Disparadores y webhooks](/es/docs/data/triggers/): ejecuta algo cuando
  cambian las filas.
- [API de Datos](/es/docs/data-api/): la misma base de datos por HTTP, y los
  comandos `ganju data`.
