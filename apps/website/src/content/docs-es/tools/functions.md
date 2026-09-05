---
title: Funciones
description: Escribe tus propias herramientas en JavaScript — declara una función, edítala en el navegador o despliégala desde la CLI, pruébala antes de que nadie la vea y vuelve atrás cuando lo necesites.
order: 36
updated: 2026-09-05
---

Las **funciones** son herramientas que escribes tú. El catálogo es una
suposición finita sobre lo que necesitas; una función es la salida de emergencia
— lógica de varios pasos, una transformación, una llamada a tu propia API
combinada con una credencial, cualquier cosa que no sea una sola petición HTTP ni
una integración que nosotros traigamos.

Tu código corre en el edge de Cloudflare, en un isolate que desplegamos por ti.
No hay servidor que administrar, contenedor que construir ni pipeline que armar.
Las cuentas conectadas y el envío de archivos de la plataforma llegan como
**capacidades del anfitrión**, así que tu código nunca toca un refresh token ni
un adjunto de 40MB.

> Las funciones son una característica **Pro**. En Free la pestaña muestra lo que
> te daría y te apunta a los [endpoints HTTP](/es/docs/tools/http-endpoints), que
> no requieren código.

## La pestaña

Todo lo de una función vive en una sola pestaña: declararla, editarla, probarla,
desplegarla y volver a una versión que funcionaba.

![La página de Herramientas en la pestaña Functions, vacía, con New function, Settings, Save draft y Deploy](/images/new-function.webp)

Cuatro controles cruzan la parte superior, y se quedan en ese orden conforme
crece el script:

- **Settings** — qué puede alcanzar tu código: conexiones, secretos, hosts
  permitidos, timeout y acceso a recursos.
- **New function** — declarar una herramienta.
- **Save draft** — guardar tu código como una versión nueva. Nadie la ve.
- **Deploy** — publicar la versión abierta. *Esto* es lo que cambia lo que tus
  clientes MCP y tus canales pueden llamar.

Guardar y exponer son actos distintos, que es justamente para lo que hay dos
botones. `⌘S` guarda un borrador.

## Declarar una función

Elige **New function** y describe la herramienta tal como la verá el modelo.

![El diálogo New function con nombre, título, descripción, esquema de entrada y esquema de salida opcional](/images/new-function-modal.webp)

| Campo | Para qué sirve |
| --- | --- |
| **Name** | Lo que el modelo llama, p. ej. `lookup-order`. Se vuelve el nombre de la herramienta MCP *y* la llave en tu handler — renombrarlo aquí renombra también esa llave en tu código. |
| **Title** | La etiqueta legible para personas. |
| **Description** | Cómo decide el modelo si debe llamarla. Di **cuándo** usarla, no solo qué hace — es el campo con más peso del formulario. |
| **Input schema** | JSON Schema. Cada propiedad que declare se le ofrece al modelo como argumento. |
| **Output schema** | Opcional. Si declaras uno, tu herramienta debe devolver un objeto que lo cumpla; el cliente MCP recibe entonces salida estructurada en vez de texto. |

Ambos campos de esquema son editores de verdad con validación de JSON Schema, así
que una comilla faltante o un `"type": "date"` se subraya donde está en lugar de
volver como un error después de guardar.

**Agregar la función escribe el esqueleto del handler por ti.** El nombre de la
herramienta y la llave del handler son dos formas de escribir lo mismo, y que se
desalineen es un despliegue que falla en cada llamada — así que el diálogo
escribe los dos:

```js
/** @type {import('./ganju-sdk.js').ToolHandler<{ orderId: string }>} */
const lookupOrder = async (input, ctx) => {
  ctx.log('lookup-order called');
  return { ok: true };
};

export default createHandler({
  'lookup-order': defineTool(lookupOrder)
});
```

El tipo de `input` se genera del esquema que acabas de declarar, así que
`input.orderId` autocompleta y una propiedad que nadie declaró no.

## El editor

El editor es Monaco — el mismo sobre el que está construido VS Code — servido
desde este sitio y no desde un CDN, y cargado solo cuando ya hay algo que editar.

`ctx` autocompleta desde las declaraciones de tipos reales del SDK, así que pasar
el cursor sobre un método muestra la misma documentación que verías en un editor
local. Una pasada de marcadores señala cosas que existen en un navegador pero no
en un Worker (`localStorage`, `process`, `require`), además de `eval` y cualquier
import que no sea uno de tus propios archivos — cada uno con su razón y con la
alternativa.

**El archivo que escribes se despliega exactamente como lo tecleaste.** No hay
paso de compilación entre el cuadro de texto y el Worker en ejecución, y por eso
el lenguaje es JavaScript: las anotaciones de tipo llegarían al runtime como
errores de sintaxis. La *verificación* de tipos sigue corriendo, contra los tipos
del SDK y el JSDoc que escribas.

Un script es un conjunto de archivos. El explorador junto al editor es el
proyecto completo — crear carpetas, renombrar, borrar, navegar con las flechas.
Dos archivos son especiales: `index.js` es el módulo que llamamos y no se puede
renombrar ni borrar, y `ganju-sdk.js` va adjunto en cada despliegue y se muestra
atenuado, porque es parte de la respuesta honesta a "qué hay en mi script".

## Qué puede hacer tu código

Cada handler recibe los argumentos del modelo y un objeto `ctx`:

| Miembro de `ctx` | Qué te da |
| --- | --- |
| `ctx.connection(provider)` | Un access token de vida corta para una cuenta conectada. Nunca el refresh token — esos se quedan del lado del servidor. |
| `ctx.secret(name)` | Una llave de API que guardaste en Settings, resuelta al momento de la llamada. |
| `ctx.resources.search / read / list` | La misma base de conocimiento desde la que responde tu asistente. |
| `ctx.resources.create / delete` | Escribir un archivo o una nota de vuelta en el proyecto. No es buscable a menos que lo pidas con `index: true`. |
| `ctx.sendFile(opts)` | Enviar un recurso como adjunto real por Gmail, Outlook o Slack. Los bytes nunca pasan por tu código. |
| `ctx.log(...)` | Aparece en el panel de pruebas y en `ganju logs`. |
| `fetch` | El global que ya conoces, filtrado a la salida. |

`ctx.sendFile` es lo único que tu código genuinamente no podría hacer solo: un
Worker está limitado a 128MB y no tiene camino al almacenamiento, así que los
adjuntos grandes y las subidas siguen siendo una capacidad de la plataforma en
lugar de algo que reimplementas.

## Settings

**Settings** es qué puede alcanzar tu código y cuánto puede gastar haciéndolo.
Nada de esto vive en tu código, a propósito — un límite que el código puede
ampliar no es un límite.

![El diálogo Function settings con conexiones, secretos, hosts permitidos, timeout y acceso a recursos](/images/function-settings.webp)

- **Connections** — los proveedores a los que este script puede pedir un token, y
  como los que puede enviar archivos. Lo que no esté encendido aquí se rechaza en
  tiempo de ejecución. Declarar un proveedor que aún no conectas está permitido:
  la llamada falla con un mensaje que lo dice, en lugar de que la herramienta
  falle al desplegar.
- **Secrets** — los valores que lee `ctx.secret()`. Cifrados en reposo, resueltos
  a través del broker en cada llamada y nunca devueltos al navegador. Cambiar uno
  surte efecto en la siguiente llamada, sin volver a desplegar.
- **Allowed hosts** — una lista separada por comas para las peticiones salientes.
  **Vacío significa cualquier host público**, no ninguno. Las direcciones privadas
  y de loopback siempre están bloqueadas, diga lo que diga este campo.
- **Timeout** — cuánto puede durar una llamada. Por defecto 10.000ms, con tope de
  30.000.
- **Resource access** — hasta dónde llegan `ctx.resources.create` y `.delete`.
  *Solo lo que esta herramienta escribió* es el valor por defecto y el piso
  seguro; el otro deja que la herramienta reemplace y elimine también recursos
  subidos y rastreados, que es lo que de verdad necesita una herramienta cuyo
  trabajo es limpiar un crawl viejo.

Las dos mitades guardan distinto, y se nota. Las capacidades se guardan juntas
detrás de un botón; un secreto actúa en el momento en que lo agregas o lo quitas,
porque eso es lo que realmente pasa.

## Probar antes de que nadie la vea

Cada fila de función se expande a sus esquemas y a un botón **Run**.

![Una función expandida con sus esquemas de entrada y salida, un campo de entrada de ejemplo y un botón Run](/images/functions-test.webp)

Una ejecución de prueba despliega la versión en un script de vista previa al que
nada despacha, lo llama una vez y lo borra. Eso significa que corre **la cosa
real** — conexiones reales, secretos reales, reglas de salida reales — mientras tu
versión en vivo sigue atendiendo clientes todo el tiempo.

Recibes de vuelta la salida, tus líneas de `ctx.log`, el error si lo hubo y
cuánto tardó. La entrada de ejemplo se valida contra tu propio esquema de entrada
antes de correr, y el resultado contra tu esquema de salida después, porque esas
son exactamente las dos maneras en que falla una llamada real.

Las ejecuciones de prueba cuentan para tus llamadas mensuales, igual que
cualquier otra llamada a tu código.

## Versiones, despliegue y rollback

Una versión es la unidad de **código y contrato** a la vez: los nombres de
herramienta que ven tus clientes salen de esa fila, no del script en ejecución.
Eso es lo que hace seguro el rollback — volver atrás se lleva también los
esquemas.

![Un script desplegado con cuatro funciones, un selector de versión con v21 en vivo y un bundle de CLI en solo lectura](/images/functions-existing.webp)

El encabezado dice qué versión está abierta, su estado, cuántas funciones tiene,
si el código vino del editor o de la CLI, y cuándo se creó y se publicó. El
historial es un **selector**, no una lista — eliges cualquier versión y se abre su
código. Deploy publica lo que está abierto; una versión publicada que no es la
que está en vivo ofrece **Roll back** en su lugar.

Cada fila de función lleva además un interruptor. Apagar una reduce lo que expone
el servidor **sin volver a desplegar** — útil cuando una lista larga de
herramientas te está costando tokens en cada llamada al modelo — y tu código
queda intacto. El manifiesto es lo que tu código *puede* hacer; los interruptores
son lo que el servidor ofrece ahora mismo.

Una versión subida desde la CLI es un bundle compilado, así que el editor la
muestra en solo lectura en lugar de invitarte a sobrescribir una compilación real
con el contenido de un cuadro de texto. Igual puedes leerla, e igual puedes hacer
rollback a ella.

## La CLI

Todo lo anterior tiene su equivalente en terminal. `ganju` es un cliente de los
mismos endpoints que usa el panel — no una segunda puerta de escritura — así que
ambos escriben en las mismas filas y elegir entre ellos es una decisión sobre
dónde viven tus herramientas, no sobre lo que pueden hacer. Úsala cuando tus
herramientas pertenecen a un repositorio, a un code review y a un pipeline.

```bash
npm install -g @ganju/cli

ganju init my-tools
cd my-tools
ganju login          # abre tu navegador, inicia sesión en esta máquina
ganju link           # apunta el proyecto a una organización y un proyecto
ganju deploy         # compila, sube y publica
```

Un proyecto es un `ganju.json` — las herramientas que expone más los cuatro
ajustes que escribe el diálogo **Settings**, para que el código y los permisos que
necesita se revisen juntos — y un archivo de handler por herramienta.
`ganju test`, `ganju logs`, `ganju versions` y `ganju rollback` hacen desde una
terminal lo que hacen arriba los paneles en el navegador, y `ganju token create`
genera una credencial con la que CI puede desplegar.

Una subida desde la CLI es un bundle compilado, y por eso el panel la muestra en
solo lectura en vez de invitarte a sobrescribir una compilación real con el
contenido de un cuadro de texto. Igual puedes leerla ahí, e igual puedes hacer
rollback a ella.

**→ [La CLI `ganju`](/es/docs/tools/cli)** — instalación, todos los comandos,
`ganju.json`, las dos formas de router, secretos, inicio de sesión y despliegue
desde CI.

## Límites y costo

- **Por llamada**: 5 segundos de CPU, y tu timeout configurado como tope de reloj.
- **Por minuto**: 60 llamadas por herramienta.
- **Por mes**: 1.000.000 de llamadas incluidas en Pro, y después $5 por millón.
  Solo cuentan las llamadas a **tu propio código** — las integraciones que traemos
  y los servidores MCP remotos que conectas siguen incluidas.
- **Las peticiones salientes** se filtran: las direcciones privadas, de loopback y
  link-local siempre se rechazan, y tu lista de hosts permitidos aplica encima.

## Siguiente

- **[La CLI `ganju`](/es/docs/tools/cli)** — el mismo trabajo desde una terminal,
  y desde CI.
- **[Endpoints HTTP](/es/docs/tools/http-endpoints)** — cuando una sola petición
  es todo lo que necesitas, y sin código.
- **[Catálogo](/es/docs/tools/catalog)** — las integraciones que traemos.
