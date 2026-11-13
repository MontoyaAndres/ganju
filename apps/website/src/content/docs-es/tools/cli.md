---
title: CLI
description: La línea de comandos ganju — escribe, despliega, prueba y depura las funciones de tu proyecto desde una terminal, administra su base de datos y publica desde CI.
order: 37
updated: 2026-11-13
---

`ganju` es la línea de comandos para desarrolladores. Escribe, prueba y
despliega las [funciones](/es/docs/tools/functions/) de un proyecto (las
acciones que ejecuta tu bot), administra la [base de datos](/es/docs/data/) del
proyecto y funciona igual en CI. Es un cliente de los mismos endpoints que usa
la app, así que un despliegue desde la CLI y un cambio hecho por el
[Asistente](/es/docs/assistant/) llegan al mismo lugar.

Dentro de la app, el dueño del proyecto construye conversando con el Asistente
y lee el código en la página **Herramientas**; nadie
edita código en el navegador. Usa la CLI cuando las funciones pertenecen a un
repositorio, a un code review y a un pipeline.

```bash
npm install -g @ganju/cli
```

Node 20 o superior. El paquete es `@ganju/cli` y el binario es `ganju`. Para
usarla sin instalarla, ejecuta `npx @ganju/cli <comando>`. Las funciones y los
Datos necesitan que la organización esté en **Pro** o **Enterprise**.

## Tu primer despliegue

```bash
ganju init my-tools     # crea un proyecto que se despliega tal cual
cd my-tools
ganju login             # abre tu navegador e inicia sesión en esta máquina
ganju link              # elige la organización y el proyecto de destino
ganju deploy            # empaqueta, sube y publica
```

`ganju init` escribe una herramienta que funciona en vez de un archivo vacío: un
`ganju.json` con una herramienta `lookup-order` declarada y `src/lookupOrder.js`
que la implementa. El siguiente comando funciona, y editas a partir de algo que
ya corrió.

`ganju deploy` muestra cada paso y termina con las herramientas ya en vivo:

```
› bundling 1 tool
  1.1 KB (from 1.6 KB) · 1 entry, router generated
› creating a draft version
› uploading v1
› uploading the source (2 files, 1.9 KB)
› publishing
✓ v1 is live on my-tools — 1 tool
  lookup-order
```

## Todos los comandos

Ejecuta `ganju help` (o `ganju <comando> --help`) para ver la lista en tu
terminal, y `ganju --version` para ver qué versión tienes.

### Para empezar

| Comando | Qué hace |
| --- | --- |
| `ganju init [dir]` | Crea `ganju.json` y un handler en `dir` (por defecto, la carpeta actual). Se niega si esa carpeta ya tiene un `ganju.json`, y conserva un handler existente en vez de sobrescribirlo. |
| `ganju login` | Inicia sesión en esta máquina, en tu navegador. |
| `ganju logout` | Borra el token guardado para esta API. Nada de lo que desplegaste cambia. |
| `ganju whoami` | Con qué cuenta inició sesión esta máquina, y contra qué API. |
| `ganju link` | Elige la organización y el proyecto, y los escribe en `ganju.json`. Crea `ganju.json` si no existe, así que una carpeta que solo usa `ganju data` no necesita `init`. |
| `ganju link --status` | Muestra a qué está vinculado `ganju.json`, sin cambiarlo. |

### Trabajar en funciones

| Comando | Qué hace |
| --- | --- |
| `ganju build` | Revisa las herramientas, las empaqueta y minifica en `.ganju/bundle.js`, y reporta el tamaño. |
| `ganju deploy` | Compila, sube y publica. También despliega los `triggers` de `ganju.json`, si tiene. |
| `ganju test <tool>` | Ejecuta una herramienta una vez, sin publicarla. |
| `ganju logs` | Llamadas recientes y su salida de `ctx.log`. |

### Administrar lo que está en vivo

| Comando | Qué hace |
| --- | --- |
| `ganju versions` | Cada versión, cuál está publicada y cuál está en vivo. |
| `ganju rollback <version>` | Vuelve a poner una versión que estuvo en vivo. |
| `ganju secret set\|list\|rm` | Los valores que lee `ctx.secret()`. |
| `ganju token create\|list\|revoke` | Tokens duraderos para CI, limitados a este proyecto. |

### Canales y datos

| Comando | Qué hace |
| --- | --- |
| `ganju channel templates` | Las plantillas de mensajes de WhatsApp de los canales del proyecto, con su estado en Meta. |
| `ganju data …` | La base de datos del proyecto: tablas, filas, importaciones, exportaciones, consultas guardadas, el esquema como código y la restauración. Mira [Datos del proyecto](#datos-del-proyecto). |

### Flags

Aquí está cada flag con los comandos que la leen. Una flag que ningún comando
define es un error, así que un error de tipeo nunca ejecuta algo que no
querías.

| Flag | Comandos | Qué hace |
| --- | --- | --- |
| `-h`, `--help` | todos | La ayuda. `ganju data --help` muestra los comandos de datos. |
| `--draft` | `deploy` | Guarda la versión sin publicarla. |
| `--force` | `deploy` | Reemplaza sin preguntar una versión en vivo hecha en la app. |
| `--no-minify` | `build`, `deploy` | Deja el bundle legible. |
| `--strict` | `build` | Falla si el linter de herramientas tiene advertencias. |
| `--input '<json>'` | `test` | Los argumentos con los que se llama la herramienta. |
| `--input-file <ruta>` | `test` | Lo mismo, desde un archivo. |
| `--version <n\|latest\|active>` | `test` | Ejecuta una versión existente en vez del código de la carpeta. |
| `--tool <nombre>` | `logs` | Solo las llamadas de esta herramienta. |
| `--limit <n>` | `logs` | Cuántas entradas (20 por defecto). |
| `--follow` | `logs` | Sigue consultando si hay llamadas nuevas. |
| `--organization <nombre o id>` | `link` | Se salta la pregunta de la organización. |
| `--project <nombre o id>` | `link` | Se salta la pregunta del proyecto. |
| `--status` | `link` | Muestra lo que está vinculado. |
| `--expires <días\|never>` | `token create` | Cuándo deja de funcionar el token. |
| `--json` | `test`, `logs`, `versions`, `token create`, `token list`, `channel templates`, la mayoría de los comandos `data` | Salida legible por máquina. |

Las flags de `ganju data` están en [Datos del proyecto](#datos-del-proyecto).

## `ganju.json`

Un archivo describe el proyecto: las herramientas que expone, las reglas bajo
las que corre el código y, si quieres, los disparadores de la base de datos que
despliega. Viaja con el despliegue, así que el código y los permisos que
necesita se revisan en el mismo pull request.

```jsonc
{
  "artifact": "acme-support",  // lo escribe `ganju link`
  "organizationId": "…",       // lo escribe `ganju link`
  "projectId": "…",            // lo escribe `ganju link`
  "uploadSource": true,        // por defecto: envía también el código legible

  // Cómo puede correr el código. Un solo conjunto de reglas para todo el proyecto.
  "connections": ["google-gmail"],
  "allowedHosts": ["api.acme.com"],
  "timeoutMs": 10000,
  "resourceAccess": "own",

  "tools": [
    {
      "name": "lookup-order",
      "title": "Look up order",
      "description": "Find an order by its id. Use when the customer gives an order number.",
      "entry": "src/lookupOrder.js",
      "input": {
        "type": "object",
        "properties": {
          "orderId": { "type": "string", "description": "The order number the customer gave." }
        },
        "required": ["orderId"]
      },
      "output": { "type": "object", "properties": { "status": { "type": "string" } } },
      "annotations": { "readOnlyHint": true },
      "data": { "access": "read", "tables": ["orders"] }
    }
  ]
}
```

### Ajustes del proyecto

| Clave | Qué hace |
| --- | --- |
| `artifact`, `organizationId`, `projectId` | A dónde se despliega. Los escribe `ganju link`; ninguno es secreto, así que haz commit de ellos. |
| `apiUrl` | Con qué despliegue de Ganju hablar. Por defecto `https://api.ganju.ai`. `GANJU_API_URL` lo reemplaza. |
| `main` | Tu propio router, para proyectos cuyas herramientas no indican un `entry`. Por defecto `src/index.ts`. |
| `connections` | Las cuentas conectadas para las que el código puede pedir un token y enviar archivos, p. ej. `google-gmail`, `google-calendar`. Cualquier otra se rechaza cuando la herramienta corre. |
| `allowedHosts` | Los hosts a los que puede llegar `fetch`. Una entrada permite también sus subdominios. **Vacío u omitido significa cualquier host público**. Las direcciones privadas y de loopback siempre están bloqueadas. |
| `timeoutMs` | Cuánto puede tardar una llamada. Por defecto 10.000, máximo 30.000. |
| `resourceAccess` | Hasta dónde llegan `ctx.resources.create` y `.delete`: `"own"` (por defecto, solo lo que escribieron las herramientas) o `"all"`. |
| `uploadSource` | Si `deploy` sube el código legible junto al bundle. Activado salvo que pongas `false`. |
| `tools` | Las herramientas, abajo. Al menos una. |
| `triggers` | Disparadores de la base de datos que se despliegan con las funciones. Si lo omites, `deploy` no toca los disparadores; `[]` quita los que desplegó. Mira [Disparadores](#disparadores). |

Solo se envían las claves que escribes; el servidor pone sus propios valores
por defecto para el resto. Las cuatro claves `connections`, `allowedHosts`,
`timeoutMs` y `resourceAccess` son los mismos ajustes que muestra el diálogo
**Ajustes** de la página **Herramientas**, así que un cambio en un lugar se ve
en el otro.

### Cada herramienta

| Clave | Qué hace |
| --- | --- |
| `name` | Lo que llama el modelo, p. ej. `lookup-order`. Letras, dígitos, `_` o `-`, hasta 64 caracteres. |
| `title` | La etiqueta legible. |
| `description` | Cómo decide el modelo si llamarla. Di **cuándo** usarla, no solo qué hace. |
| `entry` | El archivo cuyo export por defecto atiende esta herramienta. Ponlo en todas las herramientas, o en ninguna. |
| `input` | JSON Schema de los argumentos. Cada propiedad se le ofrece al modelo. |
| `output` | JSON Schema opcional. Si declaras uno, la herramienta debe devolver un objeto que coincida; los clientes MCP reciben salida estructurada en vez de texto. |
| `annotations` | `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`. |
| `data` | Lo que la herramienta puede hacer con la base de datos del proyecto mediante `ctx.data`: `{ "access": "read" \| "write", "tables": [...] }`. Si lo omites, todo. |
| `expose` | `false` despliega la herramienta solo para disparadores: el bot nunca la ve y no cuenta para las herramientas del proyecto. |
| `channels` | `true` permite que la herramienta escriba a clientes y chats con `ctx.channels`. Si lo omites, esas llamadas se rechazan. |

`annotations` son las [anotaciones de herramientas de MCP](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-annotations).
Llegan a los clientes MCP como indicaciones, y deciden qué confirma un bot de
canal cuando la organización activa
[Confirmar acciones sensibles](/es/docs/settings/#confirmar-acciones-sensibles):
una herramienta que no declara ni `readOnlyHint: true` ni
`destructiveHint: false` se consulta antes de ejecutarse. Marca las consultas
como de solo lectura; marca con `destructiveHint: true` lo que envía, cobra o
borra.

`data`, `expose` y `channels` se explican en
[Datos desde funciones](/es/docs/data/functions/).

**Los secretos no van en este archivo, y no deben ir.** Un valor guardado junto
a tu código es justo lo que los secretos existen para evitar. Envíalos una vez
con [`ganju secret set`](#secretos).

## Dos formas de escribir el router

Pon un **`entry`** en cada herramienta y el mapa de nombre de herramienta a
handler se genera desde `ganju.json`, así que el nombre se escribe en un solo
lugar:

```js
// src/lookupOrder.js
import { defineTool } from '@ganju/sdk';

export default defineTool(async (input, ctx) => {
  const res = await fetch(`https://api.acme.com/orders/${input.orderId}`, {
    headers: { authorization: `Bearer ${await ctx.secret('ACME_KEY')}` }
  });
  return { status: (await res.json()).status };
});
```

O no le pongas a **ninguna** y escribe el mapa tú mismo, en el archivo que
indica `main` (por defecto `src/index.ts`). Esa es la forma de las funciones
que escribe el Asistente, así que también es lo que tienes si las pasas a un
repositorio:

```js
import { createHandler, defineTool } from '@ganju/sdk';

export default createHandler({
  'lookup-order': defineTool(async (input, ctx) => ({ status: 'shipped' }))
});
```

**Una mezcla de las dos se rechaza en vez de resolverse**, porque cualquier
forma de leerla descarta en silencio la mitad de lo que escribiste.

## Qué hace la compilación

`esbuild` empaqueta el proyecto en un solo módulo ES, porque un script
desplegado es un solo módulo, y empaquetar es lo que te permite repartir el
código en varios archivos y usar paquetes de npm.

**`@ganju/sdk` no se empaqueta.** Se reescribe como `./ganju-sdk.js`, el módulo
que la plataforma adjunta junto a cada subida, así tu bundle nunca lleva una
copia que pueda quedar desfasada de la plataforma con la que habla.

TypeScript funciona. Los tipos **se quitan, no se verifican**, así que ejecuta
`tsc --noEmit` tú mismo si quieres que se cumplan. Un bundle puede pesar
máximo 3 MB.

```bash
ganju build              # revisa, empaqueta, minifica y reporta el tamaño
ganju build --no-minify  # deja .ganju/bundle.js legible
ganju build --strict     # falla con cualquier advertencia (útil en CI)
```

`deploy` empaqueta por su cuenta desde el código actual; nunca lee un
`.ganju/bundle.js` que hayas compilado antes.

## El linter de herramientas

Antes de empaquetar, `ganju build` revisa cómo lee un modelo cada
herramienta: lo que hace que un modelo elija la herramienta equivocada o
adivine sus argumentos. Advierte sobre:

- una **descripción que falta o es muy corta**, o que nunca dice **cuándo**
  usar la herramienta;
- **no tener `annotations`**: la herramienta se trata entonces como una que
  puede cambiar cosas, y se confirma antes de cada llamada cuando la
  organización confirma acciones sensibles, incluso si solo consulta;
- **propiedades de entrada sin descripción**;
- una propiedad de entrada llamada **`confirmation`**, que la plataforma
  reserva para sí;
- **dos herramientas que se parecen** en nombre o descripción.

Las advertencias nunca detienen una compilación. `--strict` hace que fallen.

`ganju deploy` muestra las mismas revisiones, que la API corre sobre todo el
servidor, así que también cubren el parecido con las demás herramientas del
proyecto y advierten cuando hay más de 25 activas.

## Desplegar

```bash
ganju deploy             # compila, sube y publica
ganju deploy --draft     # sube una versión, no publica nada
ganju deploy --force     # no se detiene ante una versión en vivo hecha en la app
```

Un despliegue tiene tres pasos: se crea una versión borrador a partir de
`ganju.json`, se le adjunta el bundle (y el código legible) y el borrador se
publica. Un despliegue que se cae a mitad de camino deja un borrador. Es a
propósito: `ganju versions` lo muestra, y el siguiente despliegue crea uno
nuevo en vez de retomar un borrador cuyo bundle nunca llegó.

**Un despliegue reemplaza todas las funciones del proyecto** con las de la
carpeta. Una función que no está en `ganju.json` deja de existir en el
servidor.

### Desplegar encima de cambios hechos en la app

Puede que el dueño del proyecto haya cambiado las funciones con el
[Asistente](/es/docs/assistant/) desde tu último despliegue. Cuando la versión
en vivo se hizo en la app, `ganju deploy` se detiene antes de publicar:

```
! The live version, v14, was made in the app. Deploying replaces it with this folder's code.
  These functions would stop working: check-stock
  Copy any changes made in the app that you want to keep into this project first.
Replace it? [y/N]
```

Nombra las funciones que tu carpeta no tiene, que dejarían de funcionar. En una
terminal pregunta; en un script, donde no hay a quién preguntar, se detiene, y
`--force` despliega de todos modos. `--draft` nunca se detiene, porque un
borrador no reemplaza nada.

### Tu código en la app

Junto al bundle, `ganju deploy` sube el **código legible** del proyecto, así la
página **Herramientas** muestra tus archivos reales en vez de código
minificado, y el Asistente del proyecto puede leerlos. Solo se muestra, nunca
se ejecuta: lo que corre es el bundle.

Los archivos son los que git incluiría en un commit: los que están en
seguimiento, más los que no lo están y no se ignoran. Fuera de un repositorio
git, se leen tus archivos `.gitignore`. Algunas cosas nunca se envían, digan
lo que digan las reglas: `node_modules`, `.ganju`, `.git`, archivos `.env*`,
lockfiles y archivos binarios. Un archivo de más de 256 KB se deja fuera y se
nombra en la salida; un proyecto de más de 2 MB o 500 archivos no envía código
fuente, con una advertencia. Si falla la subida del código, el despliegue
sigue. Pon `"uploadSource": false` para enviar solo el bundle.

Como tu código está ahí, el Asistente no reemplaza el código que despliegas.
Cuando el dueño le pide un cambio de código, escribe un parche para ti, que el
dueño te pasa como **Un cambio para tu desarrollador**. Aplícalo y despliega
como siempre.

## Pruebas

```bash
ganju test lookup-order --input '{"orderId":"A-1029"}'
ganju test lookup-order --input-file ./fixtures/order.json
ganju test lookup-order --version active    # lo que está en vivo ahora
ganju test lookup-order --version latest    # la versión más nueva
ganju test lookup-order --version 12        # una versión, por número
ganju test lookup-order --input '{"orderId":"A-1029"}' --json
```

La versión corre una vez en un script de vista previa que nada más llama,
contra conexiones, secretos y reglas de salida **reales**, y la vista previa se
borra al terminar. Tu versión en vivo sigue atendiendo a los clientes todo el
tiempo. Una herramienta que envía un correo o escribe una fila lo hace de
verdad, así que dirige las pruebas a ti o a datos de prueba.

Sin `--version`, `test` empaqueta la carpeta y primero la sube como un borrador
nuevo (muestra `saved as draft vN — not published`). Con `--version`, no sube
nada.

La entrada se revisa contra el esquema de entrada de la herramienta antes de
correr, y el resultado contra su esquema de salida después, porque esas son las
dos formas en que falla una llamada real. Recibes las líneas de `ctx.log`,
luego la salida o el error, y cuánto tardó. Una ejecución fallida sale con
código 1. Las pruebas cuentan para tus llamadas a herramientas del mes.

## Logs

```bash
ganju logs                       # las últimas 20 llamadas
ganju logs --tool lookup-order   # solo esta
ganju logs --limit 100
ganju logs --follow              # sigue mirando; ctrl-c para parar
ganju logs --json
```

Cada entrada es una llamada terminada: cuándo, la herramienta, cuánto tardó,
las líneas de `ctx.log` que produjo y el error si lo hubo. Los logs vuelven con
el resultado, por eso un `ctx.log` no cuesta nada extra y una llamada llega
como una sola entrada completa. `--follow` consulta cada pocos segundos, porque
una llamada aparece solo cuando termina; no se puede combinar con `--json`.

## Versiones y rollback

```bash
ganju versions
ganju versions --json
ganju rollback 12
```

```
   VERSION  STATUS     TOOLS  SOURCE           CREATED
●  v14      live       3      editor           2026-11-12 21:04:10
   v13      published  2      bundle + source  2026-11-10 15:22:41
   v12      draft      2      bundle + source  2026-11-10 15:20:03
```

`SOURCE` dice de dónde vino una versión: `editor` es una versión hecha en la
app (por el Asistente), `bundle` una subida con la CLI, y `+ source` significa
que también se subió su código legible. Las horas están en UTC. Una versión que
no se pudo publicar aparece con su error debajo de la tabla.

**Publicada** y **en vivo** no son lo mismo: toda versión que alguna vez estuvo
en vivo queda publicada, y exactamente una es la versión en vivo del proyecto.
`ganju rollback` recibe el número (o el id) de una versión que ya estuvo en
vivo, y vuelve a ponerla en vivo.

Una versión es la unidad tanto del código como del contrato. Los nombres de
herramientas que ven tus clientes vienen de esa versión, no del script que
corre, así que un rollback trae de vuelta los esquemas junto con el código.

## Secretos

```bash
GANJU_SECRET_VALUE=sk_live_… ganju secret set ACME_KEY
ganju secret list
ganju secret rm ACME_KEY
```

Son los valores que lee `ctx.secret('ACME_KEY')`. Tres cosas que saber:

- **`set` reemplaza en vez de agregar.** Poner un nombre que ya existe borra
  primero el valor anterior.
- **`list` nunca muestra un valor.** Muestra los nombres y cuándo se puso cada
  uno. Para cambiar un valor, vuelve a ponerlo.
- **Un secreto funciona desde la siguiente llamada**, sin desplegar.

`ganju secret set NOMBRE VALOR` también funciona, pero deja el valor en el
historial de tu shell. Para evitarlo, léelo sin que se muestre:

```bash
read -s GANJU_SECRET_VALUE && export GANJU_SECRET_VALUE
ganju secret set ACME_KEY
unset GANJU_SECRET_VALUE
```

`ls` funciona como `list`, y `remove` o `delete` como `rm`. Los secretos
también se agregan y se quitan en el diálogo **Ajustes** de la página
**Herramientas**.

## Disparadores

`ganju.json` puede llevar los disparadores de la base de datos del proyecto, que
`ganju deploy` despliega justo después de las funciones, así un disparador
puede nombrar una función que el mismo despliegue agregó:

```jsonc
"triggers": [
  { "table": "orders", "on": "insert", "function": "notify-kitchen" },
  {
    "table": "orders",
    "on": "update",
    "when": { "status": { "changedTo": "ready" } },
    "function": "tell-customer"
  },
  {
    "name": "nightly-orders",
    "on": "schedule",
    "every": "day",
    "at": "21:00",
    "query": "todays_orders",
    "email": { "to": "owner@example.com", "subject": "Today's orders", "text": "{{count}} orders on {{date}}" }
  }
]
```

`deploy` muestra cada disparador que desplegó, los que quitó y el secreto de
firma de un disparador de webhook nuevo, que se muestra una sola vez. Las
reglas de condiciones, disparadores por tiempo y acciones están en
[Disparadores](/es/docs/data/triggers/#desplegar-disparadores-con-la-cli), y
las programaciones tienen su propia página,
[Programaciones](/es/docs/data/schedules/).

## Plantillas de WhatsApp

```bash
ganju channel templates
ganju channel templates --json
```

Lista las plantillas de mensajes de cada canal de WhatsApp del proyecto, como
Ganju las sincronizó por última vez desde Meta: nombre, idioma, categoría,
estado (con el motivo de Meta cuando se rechazó) y las variables. Solo lee:
las plantillas se crean en la pestaña **Plantillas de mensaje** del canal, en la app,
donde se revisan antes de ir a revisión de Meta. Una función envía una
aprobada con `ctx.channels.send`.

## Datos del proyecto

`ganju data` administra la [base de datos](/es/docs/data/) del proyecto desde
una terminal. Cada comando llama a la [API de Datos](/es/docs/data-api/) que usa
la app, así que una fila escrita aquí sigue las mismas reglas y queda
registrada a nombre de tu sesión o de tu token. Ejecuta `ganju data help` para
ver la lista en tu terminal.

### Base de datos

| Comando | Qué hace |
| --- | --- |
| `ganju data create [--name <nombre>]` | Crea la base de datos del proyecto. `--replace --yes` renuncia a restaurar una borrada y empieza una nueva. |
| `ganju data info` | Estado, tamaño, tablas y sugerencias de índices abiertas. `status` también funciona. |
| `ganju data drop --yes --confirm <nombre>` | Borra la base de datos. Se puede restaurar durante 7 días. |
| `ganju data restore` | Deshace un borrado. |
| `ganju data restore --at <hora ISO> --yes` | Devuelve la base de datos a un momento, p. ej. `2026-10-30T09:15:00-05:00`. |
| `ganju data restore --bookmark <b> --yes` | La devuelve a un marcador (un drop muestra el que lo deshace). |
| `ganju data checkpoint` | Toma un marcador de este momento. Lo imprime solo, así que `B=$(ganju data checkpoint)` funciona. |
| `ganju data time-zone [<zona>]` | Muestra o cambia la zona en la que vuelven las fechas y corren las programaciones, p. ej. `America/Bogota`. `--clear` vuelve a UTC. |
| `ganju data export [--format jsonl\|csv] [--out <carpeta>]` | Descarga todas las tablas (JSONL por defecto) y el esquema. |
| `ganju data changes` | El registro de cambios del esquema. `log` también funciona. |
| `ganju data copy [status\|wait\|dismiss]` | Una copia de tabla que corre en segundo plano, después de cambiar una columna. |
| `ganju data index add\|dismiss <id>` | Actúa sobre una sugerencia de índice de `info`. |

### Tablas y columnas

| Comando | Qué hace |
| --- | --- |
| `ganju data tables` | Las tablas y sus columnas, qué puede hacer el bot con cada una y cuáles se sincronizan desde una hoja de cálculo. |
| `ganju data table create <nombre> --schema <archivo>` | Crea una tabla desde un archivo de esquema. |
| `ganju data table rename <nombre> <nombre-nuevo>` | Renombra una tabla. |
| `ganju data table rm <nombre> --yes --confirm <nombre>` | Elimina una tabla. |
| `ganju data table sync <nombre>` | Vuelve a leer ya la hoja de cálculo de una tabla sincronizada. |
| `ganju data column add <tabla> <nombre> <tipo> [--input '<json>']` | Agrega una columna; `--input` recibe sus demás ajustes. |
| `ganju data column rename <tabla> <nombre> <nombre-nuevo>` | Renombra una columna. |
| `ganju data column change <tabla> <nombre> --input '<json>' [--yes]` | Cambia una columna. Un cambio de tipo copia la tabla y necesita `--yes`; `--no-wait` vuelve antes de que termine la copia. |
| `ganju data column rm <tabla> <nombre> --yes` | Elimina una columna. |

### El esquema como código

| Comando | Qué hace |
| --- | --- |
| `ganju data schema pull` | Escribe las tablas y consultas guardadas de la base de datos en `ganju.data.json`. |
| `ganju data schema diff` | Muestra lo que cambiaría `push`. |
| `ganju data schema push [--yes]` | Aplica el archivo. Las eliminaciones y los cambios de tipo necesitan `--yes`. |

`--schema <archivo>` usa otro archivo en vez de `ganju.data.json`.

### Filas

| Comando | Qué hace |
| --- | --- |
| `ganju data rows <tabla>` | Lista filas. Recibe `--where` (repetible), `--sort`, `--search`, `--include`, `--limit` (hasta 500), `--cursor`, `--all` y `--json`. |
| `ganju data get <tabla> <id>` | Una fila. `--include` expande relaciones. |
| `ganju data insert <tabla> --input '<json>'` | Agrega una fila, o una lista de filas. `--input-file rows.jsonl` lee JSON o JSONL. |
| `ganju data update <tabla> <id> --input '<json>' [--version <n>]` | Cambia una fila. `--version` rechaza el cambio si la fila cambió desde que la leíste. |
| `ganju data delete <tabla> <id>... [--yes]` | Borra filas. `rm` también funciona. |
| `ganju data history <tabla> <id>` | El historial de cambios de una fila. |
| `ganju data write --input-file ops.json` | Varias escrituras, todas o ninguna. |
| `ganju data import <tabla> <archivo>` | Importa un archivo CSV, Excel o JSONL. Recibe `--map 'Encabezado=columna'` (repetible), `--sheet <nombre>`, `--decimal-mark . \| ,`, `--out <archivo>` para las filas rechazadas, y `--replace --yes --confirm <tabla>` para reemplazar todas las filas. |

### Consultas guardadas

| Comando | Qué hace |
| --- | --- |
| `ganju data queries` | Las consultas guardadas, sus parámetros y qué leen. |
| `ganju data query save --input-file <archivo>` | Guarda una: `{ "name", "description", "sql", "params", "assistant" }`. |
| `ganju data query rm <nombre> --yes` | Borra una. |
| `ganju data run <nombre> [--input '<json>'] [--limit <n>]` | Ejecuta una por su nombre, con sus parámetros. |

### Filtros y confirmaciones

`--where` recibe `columna=valor` y `!=`, `>`, `>=`, `<`, `<=`, `~` (contiene),
`^=` (empieza por). `status=[open,done]` coincide con cualquiera de los
valores, y `note=null` encuentra los vacíos. En una columna de texto el valor
es texto tal cual lo escribes (`phone=3001234567`); en las demás, las comillas
mantienen un valor como texto: `code="007"`. Repite `--where` para exigir
varias condiciones, o pasa el filtro JSON directamente:
`--where '{"price":{"lt":30000}}'`.

Todo lo que elimina, borra o reescribe datos necesita `--yes`. Eliminar la base
de datos o una tabla también necesita su nombre, escrito con `--confirm`. En
una terminal se te pide la confirmación que falte; en un script se rechaza.

```bash
ganju data rows menu --where 'price<30000' --where size=30cm --sort -price --limit 50
ganju data insert menu --input '{"name":"Margherita","price":28000}'
ganju data import menu menu.xlsx --sheet Menu --map 'Price (COP)=price'
ganju data schema diff
ganju data table rm orders --yes --confirm orders
ganju data export --format csv --out backup/
```

Con `GANJU_API_TOKEN`, las escrituras quedan registradas a nombre del token, y
los comandos de datos esperan solos cuando reciben un `429`. Los detalles de
cada comando, con ejemplos, están en la página
[API de Datos](/es/docs/data-api/#desde-la-línea-de-comandos).

## Iniciar sesión

`ganju login` abre tu navegador para iniciar sesión y vuelve solo a la
terminal. Es el flujo de loopback que usan `gh` y `wrangler`: la CLI escucha
en un puerto local la redirección, con PKCE y sin secreto de cliente, y se
registra sola la primera vez.

La sesión se guarda en `~/.ganju/credentials.json`, que solo tú puedes leer,
**por API**, así que trabajar contra dos despliegues no te saca de ninguno. Una
sesión guardada se renueva sola cuando vence. `ganju logout` la borra de esta
máquina; no cambia nada de lo que desplegaste.

`ganju login` no se ejecuta mientras `GANJU_API_TOKEN` esté definido, porque se
usaría ese token.

Una sesión iniciada puede desplegar; el token que recibe un cliente MCP como
Claude Desktop cuando se conecta a tu proyecto no puede. Conectar un cliente
nunca le entrega el control de tu proyecto.

## CI

Un token de `GANJU_API_TOKEN` nunca se renueva, y el token de una sesión del
navegador dura alrededor de una hora, así que un trabajo programado necesita un
**token de acceso personal**:

```bash
ganju token create "GitHub Actions" --expires 90
ganju token create ci --expires never --json | jq -r .token
ganju token list
ganju token revoke "GitHub Actions"
```

Después, todos los comandos funcionan sin navegador:

```yaml
- run: npx @ganju/cli deploy
  env:
    GANJU_API_TOKEN: ${{ secrets.GANJU_API_TOKEN }}
```

Haz commit de `ganju.json` con `organizationId` y `projectId` (ninguno es
secreto). Una configuración común ejecuta `ganju build --strict` en cada pull
request y `ganju deploy` al hacer merge. Un pipeline no tiene terminal, así que
un despliegue encima de una versión hecha en la app se detiene salvo que pases
`--force`.

Lo que hay que saber de los tokens:

- **Limitados a un proyecto**, el que tiene vinculado `ganju.json`. Un token
  llega a las funciones y los datos de ese proyecto y a nada más de tu cuenta.
- **El valor se muestra una vez**, al crearlo. Solo se guarda una pista, así
  que `list` muestra nombres, quién creó cada uno, cuándo se usó por última vez
  y cuándo vence. Con `--json`, `create` imprime el objeto completo del token,
  que es lo que hace funcionar el `jq` de arriba.
- **`--expires`** recibe un número de días, o `never`.
- **Revoca por nombre o por id.** Un nombre que comparten dos tokens se
  rechaza, mostrando sus ids. La revocación aplica desde la siguiente
  petición.
- **Un token no puede crear ni revocar tokens.** Ejecuta `ganju token create`
  desde una sesión del navegador, así un token filtrado no puede crear su
  propio reemplazo.
- **Un token sobrevive a la cuenta que lo creó**, marcado como inactivo, y deja
  de funcionar en cuanto quitan a su dueño.

`ls` funciona como `list`, `new` como `create`, y `rm`, `remove` o `delete`
como `revoke`.

## Entorno

| Variable | Qué hace |
| --- | --- |
| `GANJU_API_URL` | Con qué despliegue hablar. Reemplaza `apiUrl` de `ganju.json`. |
| `GANJU_API_TOKEN` | Un token para una máquina sin navegador. Reemplaza la sesión guardada. |
| `GANJU_SECRET_VALUE` | `ganju secret set NOMBRE` lee el valor de aquí. |
| `GANJU_CONFIG_DIR` | Dónde se guarda la sesión. Por defecto `~/.ganju`. |

## Lo que la CLI no cubre

Las funciones, la base de datos y sus disparadores, y la lectura de plantillas
de WhatsApp. Lo demás se hace en la app: prompts, conocimiento
([recursos](/es/docs/resources/)), herramientas del catálogo y endpoints HTTP,
[canales](/es/docs/channels/), miembros y facturación.

## Siguiente

- **[Ejemplos](/es/docs/tools/examples/)**: siete proyectos para desplegar con
  estos comandos.
- **[Funciones](/es/docs/tools/functions/)**: qué es una función, la referencia
  de `ctx` y cómo las muestra la página **Herramientas**.
- **[Datos desde funciones](/es/docs/data/functions/)**: `ctx.data`,
  `ctx.channels` y las funciones que solo corren los disparadores.
- **[Skill para agentes](/es/docs/tools/agent-skill/)**: deja que un agente de
  programación ejecute estos comandos por ti.
