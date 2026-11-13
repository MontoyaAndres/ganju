---
title: Programaciones
description: "Ejecuta algo cada día o cada semana a una hora fija, en la zona horaria de la base de datos: envía por correo las filas de una consulta guardada, o pásalas a una función o a un webhook."
order: 58
updated: 2026-11-13
---

Una **programación** se ejecuta según el reloj: cada día, o cada semana en los
días que elijas, a una hora fija en la [zona horaria](/es/docs/data/#zona-horaria)
de la base de datos. Puede llevar las filas de una
[consulta guardada](/es/docs/data/#consultas-guardadas), como los pedidos de
hoy, y enviártelas por correo, o pasarlas a una función o a un webhook. «Cada
noche a las 9, envíame por correo los pedidos de hoy.» «Cada lunes a las 8,
manda las ventas de la semana pasada a nuestro sistema.»

Una programación no tiene tabla y no hace falta escribir nada para que se
ejecute. Para reaccionar cuando cambian las filas, o un tiempo después de la
fecha de una fila, usa un [disparador](/es/docs/data/triggers/).

## Crear una

Abre **Programaciones** en la lista de la página Datos y haz clic en **Nueva
programación**. La lista muestra cada programación como "Cada día a las 21:00"
o "Cada lunes, jueves a las 08:00", con la consulta cuyas filas envía.

1. **Nombre** y **Descripción**: opcionales. Letras minúsculas, números, `-` y
   `_`; si lo dejas vacío, se crea uno.
2. **Se repite**: **Cada día** o **Cada semana**. Para cada semana, marca los
   días.
3. **A las**: la hora, como 21:00, en la zona horaria de la base de datos. La
   línea de ayuda de la vista dice cuál es esa zona; cámbiala en **Ajustes de
   la base de datos**.
4. **Filas de**: una consulta guardada cuyas filas van con cada ejecución, o
   **Sin consulta: solo la hora**. Crea la consulta primero en **Consultas**.
5. Los parámetros de la consulta: un valor, o una de las fechas de la ejecución
   (abajo).
6. **No ejecutar cuando la consulta no devuelve filas**: omite los días sin
   nada.
7. **Entonces**: **Enviar un correo**, **Ejecutar una función** o **Llamar a un
   webhook**.

![El diálogo Nueva programación: nombre, Repetir, Hora, filas de una consulta guardada y Entonces "Enviar un correo"](/images/data-schedule-dialog.webp)

Cada programación se puede encender y apagar, editar y eliminar desde la lista,
y **Ejecuciones recientes** muestra cada ejecución con su estado y su error, y
**Reintentar** para una que falló. Una base de datos guarda hasta 5
programaciones; cuentan dentro de sus 50 disparadores. Lo más seguido que se
ejecuta una programación es una vez al día.

También puedes pedírselo al [Asistente](/es/docs/assistant/) del proyecto:
«cada noche a las 9, envíame por correo los pedidos de hoy». Escribe la consulta
y la programación, puede enviarte una prueba del correo antes de su hora, y tú
aplicas ambas.

## Las fechas de la ejecución

Un parámetro de la consulta puede tomar la fecha de la propia ejecución en
lugar de un valor fijo. Cada una se calcula en la zona horaria de la base de
datos:

| Valor | Qué es |
| --- | --- |
| `{{today}}` | La fecha de la ejecución, como `2026-11-13` |
| `{{yesterday}}` | El día anterior |
| `{{today_start}}` | El inicio del día de la ejecución, como fecha y hora UTC |
| `{{today_end}}` | El fin del día de la ejecución (la medianoche siguiente), como fecha y hora UTC |
| `{{now}}` | La hora para la que es la ejecución, como fecha y hora UTC |

Usa `{{today}}` y `{{yesterday}}` para una columna `date`, y `{{today_start}}`
y `{{today_end}}` para una columna como `created_at`, guardada en UTC.

Una consulta con los pedidos del día, guardada como `todays_orders` con dos
parámetros `datetime`:

```sql
SELECT customer, items, total FROM orders
WHERE created_at >= :from AND created_at < :to
ORDER BY created_at
```

Si después cambias una consulta que ejecuta una programación y sus parámetros
dejan de coincidir, al guardar la consulta te avisa: cambia también la
programación, o sus ejecuciones fallan.

## Acciones

- **Enviar un correo**: hasta 10 direcciones. El texto acepta `{{date}}` (la
  fecha de la ejecución) y `{{count}}` (cuántas filas), y va seguido de las
  filas, una por línea. El asunto por defecto es el nombre de la consulta y la
  fecha. Aplica la misma confirmación que en el correo de un disparador: los
  miembros de la organización lo reciben de inmediato, las demás direcciones
  confirman primero. Mira [Acciones](/es/docs/data/triggers/#acciones).
- **Ejecutar una función**: la función recibe la ejecución como su evento, con
  las filas. Déjala fuera de las herramientas del asistente con
  `"expose": false`; mira
  [Datos desde funciones](/es/docs/data/functions/#funciones-que-solo-ejecutan-los-disparadores).
- **Llamar a un webhook**: la ejecución se envía por POST como JSON, firmada,
  igual que la de un disparador. Mira
  [Verificar un webhook](/es/docs/data/triggers/#verificar-un-webhook).

## Qué envía una ejecución

Una función o un webhook reciben:

```json
{
  "eventId": "…",
  "triggerId": "trg_…",
  "trigger": "nightly-orders",
  "table": "",
  "event": "schedule",
  "rowId": 0,
  "row": null,
  "previous": null,
  "actor": null,
  "at": "2026-11-14T02:00:03Z",
  "dueAt": "2026-11-14T02:00:00Z",
  "date": "2026-11-13",
  "query": "todays_orders",
  "rows": [{ "customer": "Ana", "items": "2× Margherita", "total": 56000 }],
  "rowCount": 1
}
```

- `dueAt` es la hora para la que era la ejecución, en UTC; `date` es ese día en
  la zona horaria de la base de datos.
- `rows` lleva hasta 200 filas y 48 KB; `rowsTruncated` dice que algunas
  quedaron fuera. `rowCount` cuenta hasta 500 filas; `rowCountMore` dice que
  había más.
- El encabezado `x-ganju-event` del webhook es `schedule`.

## En `ganju.json` y la API

Una programación es un disparador con `"on": "schedule"` y sin `table` ni
`when`. Ponla en `"triggers"` dentro de `ganju.json` y `ganju deploy` la
publica, o envíala a `POST /trigger` en la
[API de Datos](/es/docs/data-api/#consultas-guardadas-disparadores-y-programaciones):

```json
{
  "name": "nightly-orders",
  "on": "schedule",
  "every": "day",
  "at": "21:00",
  "query": "todays_orders",
  "params": { "from": "{{today_start}}", "to": "{{today_end}}" },
  "skipEmpty": true,
  "email": { "to": "tu@ejemplo.com", "subject": "Pedidos {{date}}", "text": "{{count}} pedidos hoy:" }
}
```

| Campo | Qué es |
| --- | --- |
| `every` | `day` o `week` |
| `days` | Con `week`: algunos de `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`. Lunes si no los pones |
| `at` | Una hora de 24 horas, como `08:00` o `21:00` |
| `query` | Opcional. El nombre de una consulta guardada |
| `params` | Con `query`: un valor por parámetro, o una de [las fechas de la ejecución](#las-fechas-de-la-ejecución). Cada parámetro obligatorio necesita uno |
| `skipEmpty` | Con `query`: `true` no ejecuta nada cuando no devuelve filas |
| una acción | `email`, `function` o `webhook` |

`name`, `description`, `enabled` y `rateLimit` funcionan como en cualquier
[disparador](/es/docs/data/triggers/#desplegar-disparadores-con-la-cli).

## Cuándo se ejecuta

- **Una vez por hora programada.** Cada plazo se ejecuta una vez, aunque la
  base de datos se reinicie.
- **Ejecuciones perdidas.** Una ejecución que no pudo correr a su hora (la base
  de datos estaba caída) sale una vez, tarde, si vuelve dentro de 6 horas, y se
  omite después de eso.
- **Cambiar la zona horaria** reinicia los relojes en la zona nueva; una hora
  que ya pasó allí hoy no se envía tarde.
- **Una consulta que falla** hace que no salga nada para esa hora; la lista de
  ejecuciones muestra el error de la consulta.
- **Se omite si está vacía.** Con **No ejecutar cuando la consulta no devuelve
  filas**, un día sin filas no deja ninguna ejecución.
- **La entrega, los reintentos** y el apagado tras 20 fallas seguidas funcionan
  como en los disparadores: mira
  [Cómo se entregan los eventos](/es/docs/data/triggers/#cómo-se-entregan-los-eventos).
  Cuando Ganju apaga una programación, los administradores de la organización
  reciben un correo.
- **Planes.** Cada ejecución cuenta como una ejecución de disparador. Si el plan
  de la organización ya no incluye Datos, las programaciones se pausan.
