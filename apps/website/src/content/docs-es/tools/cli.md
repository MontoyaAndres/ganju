---
title: CLI
description: La línea de comandos ganju — escribe, despliega, prueba y depura tus herramientas personalizadas desde una terminal, y publícalas desde CI.
order: 37
updated: 2026-09-05
---

`ganju` es la mitad de terminal de las [funciones](/es/docs/tools/functions).
Todo lo que hace lo hace también el panel — es un cliente de los mismos endpoints,
no una segunda puerta de entrada — así que elegir entre ambos es una decisión
sobre dónde viven tus herramientas, no sobre lo que pueden hacer. Úsala cuando tus
herramientas pertenecen a un repositorio, a un code review y a un pipeline.

```bash
npm install -g @ganju/cli
```

Node 20 o superior. El paquete es `@ganju/cli` y el binario es `ganju`.

## Tu primer despliegue

```bash
ganju init my-tools     # crea un proyecto que se despliega tal cual
cd my-tools
ganju login             # abre tu navegador, inicia sesión en esta máquina
ganju link              # elige la organización y el proyecto de destino
ganju deploy            # empaqueta, sube y publica
```

`ganju init` escribe una herramienta que funciona en vez de un archivo vacío — un
`ganju.json` con una herramienta `lookup-order` declarada y `src/lookupOrder.js`
implementándola — para que el siguiente comando tenga éxito y edites a partir de
algo que corrió.

`ganju deploy` va reportando cada paso y termina con las herramientas ya en vivo:

```
✓ v3 is live on acme-support — 2 tools
  lookup-order
  refund-status
```

## Los comandos

### Para empezar

| | |
| --- | --- |
| `ganju init [dir]` | Crea `ganju.json` y un handler. Conserva un handler existente en vez de sobrescribirlo. |
| `ganju login` | Inicia sesión en esta máquina. |
| `ganju logout` | Olvida el token guardado. |
| `ganju whoami` | Con qué cuenta está firmada esta máquina. |
| `ganju link` | Escribe la organización y el proyecto en `ganju.json`. `--organization` / `--project` se saltan las preguntas; `--status` solo muestra lo que está vinculado. |

### Trabajar en herramientas

| | |
| --- | --- |
| `ganju build` | Empaqueta y minifica a `.ganju/bundle.js`, y reporta el tamaño. `--no-minify` lo deja legible. |
| `ganju deploy` | Compila, sube y publica. `--draft` se detiene antes de publicar. |
| `ganju test <tool>` | Corre una herramienta sin publicarla. |
| `ganju logs` | Llamadas recientes y su salida de `ctx.log`. |

### Administrar lo que está en vivo

| | |
| --- | --- |
| `ganju versions` | Cada versión, cuál está publicada y cuál está realmente en vivo. |
| `ganju rollback <version>` | Regresa a una versión que estuvo en vivo. |
| `ganju secret set\|list\|rm` | Los valores que lee `ctx.secret()`. |
| `ganju token create\|list\|revoke` | Credenciales para CI, limitadas a este proyecto. |

`--json` está disponible donde tenga sentido una salida legible por máquina.

## `ganju.json`

Un archivo describe el script completo — las herramientas que expone y las reglas
bajo las que corre. Viaja con el despliegue, así que el código y los permisos que
necesita se revisan en el mismo pull request.

```jsonc
{
  "artifact": "acme-support",
  "organizationId": "…", // lo escribe `ganju link`
  "projectId": "…",

  // A nivel de fila, porque es el nivel en el que se aplican: un script por
  // proyecto, un conjunto de reglas para todo él.
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
        "properties": { "orderId": { "type": "string" } },
        "required": ["orderId"]
      },
      "output": { "type": "object", "properties": { "status": { "type": "string" } } }
    }
  ]
}
```

Esos cuatro ajustes son exactamente los que escribe el diálogo **Settings** del
panel. Dos puertas a una misma fila — cámbialos en cualquiera de las dos y la
otra lo refleja.

**Los secretos no están en este archivo, y no deben estarlo.** Un valor
comprometido junto a tu código es justo lo que esta característica existe para
evitar. Envíalos una vez con [`ganju secret set`](#secretos).

## Dos formas de escribir el router

Dale a cada herramienta un **`entry`** y el mapa de nombre a handler se genera
desde el manifiesto, así que el nombre se escribe en un solo lugar — y
`lookup-order` contra `lookupOrder` deja de ser un error posible:

```js
// src/lookupOrder.js
import { defineTool } from '@ganju/sdk';

export default defineTool(async (input, ctx) => {
  const { accessToken } = await ctx.connection('google-gmail');
  const res = await fetch(`https://api.acme.com/orders/${input.orderId}`);
  return { status: (await res.json()).status };
});
```

O no le des `entry` a **ninguna** y escribe el mapa tú, en el archivo que nombra
`main` (por defecto `src/index.ts`). Eso es lo que produce el editor del panel,
así que también es lo que ya tienes si estás sacando un script del navegador:

```js
import { createHandler, defineTool } from '@ganju/sdk';

export default createHandler({
  'lookup-order': defineTool(async (input, ctx) => ({ status: 'shipped' }))
});
```

**Mezclar ambas formas se rechaza en lugar de resolverse**, porque cualquiera de
las dos resoluciones descarta en silencio la mitad de lo que escribiste.

## Qué hace la compilación

`esbuild` empaqueta el proyecto en un solo módulo ES — no como optimización, sino
porque un script desplegado *es* un único módulo, y empaquetar es lo que hace
posible tener más de un archivo fuente.

**`@ganju/sdk` no se empaqueta.** Se reescribe a `./ganju-sdk.js`, el módulo
hermano que el pipeline de publicación adjunta a cada subida. Una copia dentro de
tu bundle sería peso muerto, y una versión congelada ahí se desviaría del broker
con el que habla.

TypeScript funciona. Los tipos se **quitan, no se verifican** — un bundle ya está
compilado cuando llega al endpoint de subida — así que corre `tsc` tú si quieres
que se apliquen.

Una subida desde la CLI se guarda como un `bundle` compilado, y por eso el panel
la muestra en solo lectura en vez de invitarte a sobrescribir una compilación real
con el contenido de un cuadro de texto. Igual puedes leerla ahí, e igual puedes
hacer rollback a ella.

## Pruebas

```bash
ganju test lookup-order --input '{"orderId":"A-1029"}'
ganju test lookup-order --input-file ./fixtures/order.json
ganju test lookup-order --version active
```

Es la misma ejecución de vista previa que hace el panel de pruebas: la versión se
despliega en un script al que nada despacha, corre una vez contra conexiones,
secretos y reglas de salida **reales**, y se borra después. Tu versión en vivo
sigue atendiendo clientes todo el tiempo.

`--version active` corre lo que está en vivo ahora mismo y no sube nada — útil
para reproducir un reporte sin tocar nada. Sin esa bandera, `test` compila y sube
tu directorio de trabajo primero.

La entrada se valida contra el esquema de la propia herramienta antes de correr, y
el resultado contra su esquema de salida después, porque esas son las dos maneras
en que falla una llamada real. Las ejecuciones de prueba cuentan para tus llamadas
mensuales.

## Logs

```bash
ganju logs                       # las últimas 20 llamadas
ganju logs --tool lookup-order   # solo esta
ganju logs --limit 100
ganju logs --follow
```

Cada entrada es una llamada completa: la herramienta, cuánto tardó, el error si lo
hubo, y las líneas de `ctx.log` que produjo tu handler. Los logs vuelven junto con
el resultado en lugar de enviarse línea por línea, y por eso un `ctx.log` no
cuesta un viaje de ida y vuelta y una llamada llega como una entrada entera.

**`--follow` es polling, y lo dice.** No hay nada que seguir en vivo — una fila
aparece cuando una llamada termina. Las llamadas se guardan 90 días.

## Versiones y rollback

```bash
ganju versions
ganju rollback 12
```

`versions` distingue **publicada** de **en vivo**, que no son lo mismo: toda
versión que alguna vez estuvo en vivo está publicada, y exactamente una es la
versión activa del proyecto. Hacer rollback mueve ese puntero sin cambiar el
estado de ninguna fila.

Una versión es la unidad de código y contrato a la vez — los nombres de
herramienta que ven tus clientes salen de esa fila, no del script en ejecución —
así que volver atrás se lleva también los esquemas.

Un despliegue que muere a medias deja un borrador. Es el estado esperado y no una
fuga: `ganju versions` lo muestra, y el siguiente despliegue crea uno nuevo en vez
de retomar un borrador cuyo bundle nunca llegó.

## Secretos

```bash
GANJU_SECRET_VALUE=sk_live_… ganju secret set ACME_KEY
ganju secret list
ganju secret rm ACME_KEY
```

Son los valores que lee `ctx.secret('ACME_KEY')`. Tres cosas que saber:

- **`set` reemplaza en lugar de agregar.** Un segundo secreto con el mismo nombre
  ganaría en silencio mientras el primero seguiría visible en cada lista y
  alcanzable por nada, así que poner un nombre existente borra la fila anterior
  primero.
- **`list` nunca puede imprimir un valor.** El endpoint lo quita de cada fila que
  devuelve, así que la CLI no tiene manera de mostrarte a qué está puesto un
  secreto. Pon uno nuevo para cambiarlo.
- **Un secreto está vivo desde la siguiente llamada**, sin desplegar después.

`ganju secret set NAME VALUE` funciona, pero deja el valor en el historial de tu
shell — `GANJU_SECRET_VALUE` existe para que el camino feliz no lo filtre a
`~/.zsh_history`.

## Iniciar sesión

`ganju login` es un **redirect de loopback** (RFC 8252), el mismo flujo que usan
`gh` y `wrangler`: la CLI mantiene un puerto abierto, manda tu navegador al
endpoint de autorización y lee el código del redirect. El cliente es público — sin
secreto, con PKCE en su lugar, porque un secreto publicado en un paquete de npm es
un secreto que tiene cada usuario de ese paquete. Se registra solo en el primer
login, así que nadie tiene que aprovisionar nada a mano.

Los tokens viven en `~/.ganju/credentials.json`, con permisos `0600`, y
**indexados por origen de API** — así que trabajar contra un despliegue local y
uno hospedado al mismo tiempo no te desconecta de uno cada vez que tocas el otro.

Un login lleva una autoridad que el token de un cliente MCP deliberadamente no
tiene. Conectar Claude Desktop a uno de tus servidores MCP le da un token vivo de
tu cuenta; ese token es rechazado por el plano de control, así que conectar un
cliente nunca es un acto de delegación total.

## CI

Un login por navegador produce un token que vive una hora, y la CLI nunca renueva
uno que le llega por el entorno — no tiene dónde escribir el valor nuevo. Está
bien para un trabajo que arrancas a mano, e inservible para uno programado cuya
segunda corrida siempre es después de esa hora.

Los **tokens de acceso personal** son la respuesta duradera:

```bash
ganju token create "GitHub Actions" --expires 90
ganju token create ci --json | jq -r .token   # entra directo a un gestor de secretos
ganju token list
ganju token revoke "GitHub Actions"
```

Y entonces todos los comandos funcionan sin navegador:

```yaml
- run: npx @ganju/cli deploy
  env:
    GANJU_API_TOKEN: ${{ secrets.GANJU_API_TOKEN }}
```

Seis cosas que vale la pena saber:

- **Limitado a un proyecto.** Un token en la configuración de un repositorio
  alcanza el servidor de ese repositorio y nada más de tu cuenta, por mucho que su
  portador estuviera autorizado a tocar otra cosa.
- **No hay selector, porque no hay nada que elegir.** `token create` genera contra
  el proyecto al que ya está vinculado `ganju.json`.
- **El valor existe una sola vez**, en la respuesta que lo crea — lo que se guarda
  es su hash. El valor sale por stdout solo, con todas las demás líneas por
  stderr, que es lo que hace limpio el `jq` de arriba.
- **Revocar surte efecto en la siguiente petición.** La autenticación es una
  consulta, no un permiso en caché.
- **Un token no puede administrar tokens.** Generarlos es deliberadamente algo que
  hace una persona, para que una credencial filtrada no pueda generar en silencio
  su propio reemplazo. Corre `ganju token create` desde un login por navegador.
- **Un token sobrevive a la cuenta que lo creó**, marcado como inactivo en vez de
  desaparecer — así un pipeline que se detiene tiene algo a qué apuntar en lugar
  de fallar sin razón visible. Deja de autenticar en el momento en que su dueño ya
  no está.

`GANJU_API_TOKEN` también acepta un access token de OAuth normal, que es el caso
de arrancar a mano; el valor `ganju_pat_…` de arriba es sobre el que se puede
construir un trabajo programado.

## Entorno

| | |
| --- | --- |
| `GANJU_API_URL` | Con qué despliegue hablar. También se puede poner por proyecto como `apiUrl` en `ganju.json`. |
| `GANJU_API_TOKEN` | Un token para una máquina sin navegador. Ignora por completo el login guardado. |
| `GANJU_SECRET_VALUE` | `ganju secret set NAME` lee el valor de aquí, para mantenerlo fuera del historial de la shell. |
| `GANJU_CONFIG_DIR` | Dónde vive el almacén de tokens. Por defecto `~/.ganju`. |

## Qué no cubre la CLI

Las herramientas personalizadas, de principio a fin — y ahí está el límite. Los
prompts, el conocimiento ([recursos](/es/docs/resources)), las herramientas del
catálogo, los [canales](/es/docs/channels), los miembros y la facturación son por
ahora solo del panel.

## Siguiente

- **[Funciones](/es/docs/tools/functions)** — el mismo trabajo en el navegador,
  además de la referencia de `ctx` y de los ajustes que escriben estos comandos.
- **[Endpoints HTTP](/es/docs/tools/http-endpoints)** — cuando una sola petición
  es todo lo que necesitas, y sin código.
