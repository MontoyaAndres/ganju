---
title: Funciones
description: Tus propias herramientas en código — el Asistente las escribe por ti, los desarrolladores las despliegan con la CLI, y la página Herramientas muestra lo que está en vivo, te deja probarlo y volver atrás.
order: 36
updated: 2026-11-13
---

Las **funciones** son herramientas escritas en código. En la app se llaman
**acciones**: "revisar si queda una pizza", "guardar una reserva", "enviarme
por correo cada pedido nuevo". Una función es la forma de hacer cualquier cosa
que no sea una sola petición HTTP ni una integración que ya ofrecemos: varios
pasos, lógica, una llamada a tu propia API con una clave, leer y escribir la
[base de datos](/es/docs/data/) del proyecto.

Tu código corre en el edge de Cloudflare, en un isolate que desplegamos por ti.
No hay servidor que mantener ni pipeline que armar. Las cuentas conectadas, el
envío de archivos, la base de datos y tus canales le llegan al código como
**capacidades del host**, así que nunca maneja un refresh token ni un adjunto
de 40 MB.

> Las funciones son parte de **Pro** y **Enterprise**. En Free, la pestaña
> Funciones muestra **Escribe tus propias herramientas** con **Cambiar a Pro**,
> y los [Endpoints HTTP](/es/docs/tools/http-endpoints/) son la herramienta
> personalizada que no necesita código.

![La pestaña Funciones en el plan Free: "Escribe tus propias herramientas" con un ejemplo de código y Mejorar a Pro](/images/tools-functions-free.webp)

## Quién las escribe

Nadie escribe código en la app. Las funciones de un proyecto vienen de uno de
dos lugares:

- **El [Asistente](/es/docs/assistant/).** El dueño describe lo que debe hacer
  el bot, y el Asistente escribe la función, la prueba y la activa cuando el
  dueño presiona **Aplicar**. Así obtienen sus acciones la mayoría de los
  proyectos.
- **Un desarrollador con la [CLI `ganju`](/es/docs/tools/cli/).** Las funciones
  viven en un repositorio, y `ganju deploy` las sube.

Los dos escriben en las mismas versiones, así que la página **Herramientas**,
`ganju versions` y el Asistente siempre coinciden en lo que está en vivo.
Cuando un desarrollador despliega, el Asistente deja de escribir código para
ese proyecto: responde a un cambio de código con un parche para el
desarrollador. Cuando el Asistente cambió las funciones después del último
despliegue del desarrollador, `ganju deploy` avisa antes de reemplazarlas.

## La pestaña Funciones

**Herramientas → Funciones** muestra las funciones
del proyecto: lo que está en vivo, cada versión anterior y el código, solo para
leer.

![La pestaña Funciones: el recuadro con "Abrir el asistente", el selector de versión, los datos de la versión y las funciones con sus interruptores y Ejecutar](/images/functions-assistant-readonly.webp)

Arriba:

- **Versión**, un selector con cada versión (`v14 · en vivo`,
  `v13 · publicada`, `v12 · borrador`). Elige una y se abren sus funciones y su
  código.
- **Revertir a v13**, solo en proyectos sin el Asistente: aparece cuando la
  versión abierta estuvo en vivo antes pero ya no lo está, y la vuelve a poner.
  Donde el Asistente escribe las acciones, pídele a él que vuelva atrás.
- **Ajustes**, a qué puede llegar el código. Mira [Ajustes](#ajustes).

Cuando el Asistente escribe las funciones del proyecto, un recuadro lo dice:
**Tus acciones las escribe el asistente. Aquí puedes leerlas; para agregar o
cambiar una, pídeselo.**, con **Abrir el asistente**. Un proyecto que aún no
tiene funciones muestra el mismo botón.

Debajo, una fila describe la versión abierta: **Versión**, **Estado**
(`en vivo`, `publicada`, `borrador` o `archivada`), cuántas **Funciones**
tiene, su **Origen**, y cuándo fue **Creada** y **Publicada**. El origen es
uno de estos:

| Origen | De dónde vino |
| --- | --- |
| **Editor del panel** | Escrita en la app, por el Asistente. |
| **CLI (código fuente)** | Desplegada con la CLI, con su código legible. La página muestra tus archivos. |
| **Bundle del CLI** | Desplegada con la CLI sin su código. La página muestra el bundle compilado. |

Una versión que no se pudo publicar muestra su error en un aviso.

### Cada función

Cada función es una fila con su título, su descripción, su nombre, cuántas
entradas recibe y etiquetas: **salida estructurada** cuando declara un esquema
de salida, y **Solo disparadores** cuando solo la ejecutan los disparadores de
la base de datos.

- El **interruptor** (en la versión en vivo) decide si el servidor ofrece la
  función, **sin volver a desplegar**. Apagar una conserva su código y acorta la
  lista de herramientas que el modelo lee en cada turno. Al menos una tiene que
  quedar encendida.
- **Ejecutar** expande la función y la ejecuta con su entrada de ejemplo. Mira
  [Pruébala antes de que alguien la vea](#pruébala-antes-de-que-alguien-la-vea).
- Al expandir la fila se ven su **Esquema de entrada** y su **Esquema de
  salida**.

### El código

Debajo de las funciones está el código de la versión abierta, marcado **solo
lectura**, con un explorador de archivos al lado. `index.js` es la entrada que
llama la plataforma, y `ganju-sdk.js` aparece atenuado como **adjunto**: la
plataforma lo agrega a cada despliegue. Una versión de la CLI con su código
muestra los archivos de tu proyecto, con una nota de que se cambia en el
proyecto, con `ganju deploy`.

## Cómo es una función

Un proyecto es un solo script con todas sus funciones. El módulo de entrada
exporta un router, y cada función es un handler asíncrono que recibe los
argumentos del modelo y un `ctx`:

```js
import { createHandler, defineTool } from './ganju-sdk.js';

const checkStock = async (input, ctx) => {
  const { rows } = await ctx.data.query({
    table: 'stock',
    where: { pizza: input.pizza }
  });
  return { pizza: input.pizza, left: rows[0]?.quantity ?? 0 };
};

export default createHandler({ 'check-stock': defineTool(checkStock) });
```

Junto al código, cada versión lleva un **manifiesto** que declara cada función
como la ve el modelo:

| Campo | Para qué sirve |
| --- | --- |
| **name** | Lo que llama el modelo, p. ej. `check-stock`. Debe ser una clave del router. |
| **title** | La etiqueta legible. |
| **description** | Cómo decide el modelo si llamarla. Dice **cuándo** usarla ("Úsala cuando un cliente pregunte si hay una pizza"). |
| **input schema** | JSON Schema. Cada propiedad se le ofrece al modelo como argumento. |
| **output schema** | Opcional. Con uno, la función debe devolver un objeto que coincida, y los clientes MCP reciben salida estructurada en vez de texto. |
| **annotations** | Qué hace: solo lee, cambia cosas que se pueden deshacer, o envía, borra, cobra o no se puede deshacer. Decide qué confirma primero un bot de canal. |
| **data** | Lo que puede hacer con la base de datos: leer o escribir, y en qué tablas. |
| **expose** | Apagado: solo la ejecutan los disparadores, y no cuenta para las herramientas del proyecto. |
| **channels** | Encendido: puede escribir a clientes y chats con `ctx.channels`. |

El código que escribe el Asistente son módulos de JavaScript simples, sin paso
de compilación ni paquetes de npm, con máximo 25 archivos. Un desarrollador que
despliega con la CLI puede usar TypeScript y paquetes, porque la CLI los
empaqueta. Los campos de `ganju.json` para todo lo anterior están en la
[referencia de la CLI](/es/docs/tools/cli/#cada-herramienta).

## Qué puede hacer tu código

| Miembro de `ctx` | Qué te da |
| --- | --- |
| `ctx.connection(provider)` | Un token de acceso de corta duración para una cuenta conectada, p. ej. `google-calendar`. Nunca el refresh token. |
| `ctx.secret(name)` | Una clave guardada en **Ajustes** o con `ganju secret set`, leída al momento de la llamada. |
| `ctx.resources.search / read / list` | El mismo conocimiento con el que responde tu bot. |
| `ctx.resources.create / delete` | Escribe un archivo o una nota en el proyecto, o quita uno. No se puede buscar salvo que se cree con `index: true`. |
| `ctx.sendFile(options)` | Envía por correo o publica archivos guardados como adjuntos reales, con Gmail, Outlook o Slack (hasta 10 por llamada). Los bytes nunca pasan por tu código. |
| `ctx.data` | La base de datos del proyecto: `describe`, `query`, `search`, `insert`, `update`, `delete`, `write` (todo o nada) y `run` (una consulta guardada). |
| `ctx.channels` | Escribe a un cliente con el que habló el bot (`send`), publica en un chat donde está el bot (`post`) y lista las plantillas de WhatsApp aprobadas (`templates`). |
| `ctx.log(...)` | Líneas que se ven en el panel de prueba, en los logs que lee el Asistente y en `ganju logs`. |
| `fetch` | El global que ya conoces, revisado a la salida. |

`ctx.data` y `ctx.channels` se explican en
[Datos desde funciones](/es/docs/data/functions/), junto con las funciones que
solo ejecutan los disparadores.

`ctx.sendFile` es lo que tu código no podría hacer solo: la memoria de una
función es limitada, así que la plataforma envía los adjuntos grandes desde el
almacenamiento. `ctx.resources.create` recibe hasta 1 MB de texto o 10 MB de
bytes de archivo.

## Ajustes

**Ajustes** abre **Ajustes de las funciones**: a qué puede llegar el código, y
cuánto puede gastar al hacerlo. Nada de esto vive en el código, a propósito: un
límite que el código pudiera ampliar no sería un límite. Se pueden cambiar
aquí, y un desarrollador pone los mismos valores en `ganju.json`; un cambio en
un lugar se ve en el otro.

![El diálogo de configuración de funciones: Conexiones con su estado y luego Secretos](/images/function-settings-live.webp)

- **Conexiones**: las cuentas para las que el código puede pedir un token y
  enviar archivos. Cada una muestra si está **Conectado**, **Requiere volver a
  autorizar** o **Sin conectar**. Lo que no está encendido se rechaza cuando la
  función corre. Puedes encender una que aún no conectaste: la llamada falla
  con un mensaje que lo dice.
- **Secretos**: los valores que lee `ctx.secret()`. Cifrados, leídos en cada
  llamada y nunca devueltos al navegador. Agregar o quitar uno aplica desde la
  siguiente llamada, sin volver a desplegar. El Asistente pide los que necesita
  con una tarjeta donde pegas la clave.
- **Hosts permitidos**: una lista separada por comas para las peticiones
  salientes. **Vacía significa cualquier host público**, no ninguno. Las
  direcciones privadas y de loopback siempre están bloqueadas.
- **Tiempo límite (ms)**: cuánto puede tardar una llamada. Por defecto 10.000,
  máximo 30.000.
- **Acceso a recursos**: hasta dónde llegan `ctx.resources.create` y `.delete`.
  **Solo lo que escribió esta herramienta** es el valor por defecto y el
  seguro; **Todos los recursos de este proyecto** deja que una función
  reemplace y quite también los recursos subidos y rastreados.

Conexiones, hosts, tiempo límite y acceso a recursos se guardan juntos con
**Guardar**; un secreto aplica en cuanto lo agregas o lo quitas.

## Pruébala antes de que alguien la vea

Expande una función y usa **Ejecutar** con una **Entrada de ejemplo**.

![Una función expandida con sus esquemas de entrada y salida, un campo de entrada de ejemplo, Format y Run](/images/functions-test.webp)

Una prueba ejecuta la versión abierta una vez en un script de vista previa que
nada más llama, y lo borra. Es decir, corre **lo de verdad** (conexiones,
secretos y reglas de salida reales) mientras tu versión en vivo sigue
atendiendo a los clientes. Una función que envía un correo o guarda una fila lo
hace de verdad.

Recibes la salida, las líneas de `ctx.log`, el error si lo hubo y cuánto tardó.
La entrada de ejemplo se revisa contra el esquema de entrada antes de correr, y
el resultado contra el esquema de salida después, porque esas son las dos
formas en que falla una llamada real.

El Asistente prueba de la misma forma mientras construye, y los desarrolladores
usan [`ganju test`](/es/docs/tools/cli/#pruebas). Las pruebas cuentan para tus
llamadas a herramientas del mes.

## Versiones, activar y volver atrás

Una versión es la unidad tanto del **código como del contrato**: los nombres de
herramientas que ven tus clientes vienen de la versión, no del script que
corre, así que volver atrás trae los esquemas junto con el código.

- El Asistente guarda **borradores** mientras trabaja. Nadie ve un borrador.
  Activa uno con un conjunto de cambios, que entra en vivo cuando el dueño
  presiona **Aplicar**, y **Deshacer** en esa tarjeta vuelve atrás.
- Pídele al Asistente que vuelva atrás ("deja las acciones como estaban ayer")
  y busca la versión que estaba en vivo entonces y la prepara, diciendo qué
  acciones agregadas después se irían.
- Un desarrollador publica con `ganju deploy` y vuelve atrás con
  `ganju rollback`.

**Publicada** y **en vivo** son distintas: toda versión que estuvo en vivo
queda publicada, y exactamente una está en vivo.

## Límites y costo

- **Por llamada**: 5 segundos de CPU, y tu tiempo límite (máximo 30 segundos)
  para toda la llamada. Un resultado de más de 256 KB se recorta.
- **Por minuto**: 60 llamadas por herramienta.
- **Por script**: hasta 50 funciones, y un bundle de 3 MB.
- **Por mes**: 1.000.000 de llamadas a herramientas incluidas en Pro y
  Enterprise, luego $5 por millón. Solo cuentan las llamadas a **tu propio
  código**; las integraciones que ofrecemos y los servidores MCP remotos que
  conectas no.
- **Las peticiones salientes** se revisan: las direcciones privadas, de
  loopback y link-local siempre se rechazan, y tus hosts permitidos aplican
  además.

## Cuando una función falla

El Asistente vigila las funciones que construyó. Cuando una falla seguido, o
una cuenta que usa necesita volver a iniciar sesión, la pestaña Asistente
muestra **Algo dejó de funcionar**, y **Arreglarlo con el asistente** le pide
leer los logs y proponer un arreglo. Mira
[Cuando una acción deja de funcionar](/es/docs/assistant/#cuando-una-acción-deja-de-funcionar).
Los desarrolladores leen las mismas llamadas con
[`ganju logs`](/es/docs/tools/cli/#logs).

## Siguiente

- **[Asistente](/es/docs/assistant/)**: construye y cambia funciones
  describiéndolas.
- **[CLI `ganju`](/es/docs/tools/cli/)**: despliégalas desde un repositorio y
  desde CI.
- **[Datos desde funciones](/es/docs/data/functions/)**: `ctx.data`,
  `ctx.channels` y los disparadores.
- **[Ejemplos](/es/docs/tools/examples/)**: siete proyectos listos para
  desplegar.
