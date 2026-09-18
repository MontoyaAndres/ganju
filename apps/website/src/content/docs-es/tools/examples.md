---
title: Ejemplos
description: Cinco proyectos de funciones listos para desplegar — clima, issues de GitHub, notas del equipo, tiempo libre en el calendario y un resumen de noticias por correo — cada uno muestra una capacidad del anfitrión que puedes copiar en tus propias herramientas.
order: 38
updated: 2026-09-18
---

Cinco proyectos pequeños que puedes desplegar tal cual con la
[CLI](/es/docs/tools/cli/) y luego convertir en tus propias herramientas. Cada
uno es un `ganju.json` y unos pocos archivos TypeScript cortos, y cada uno
agrega una capacidad del anfitrión a lo que usaba el anterior. Si los lees en
orden, habrás visto todo `ctx`.

Están en la carpeta [`examples/`](https://github.com/MontoyaAndres/ganju/tree/main/examples)
del repositorio de Ganju.

| Ejemplo | Herramientas | Qué te enseña | Configuración |
| --- | --- | --- | --- |
| [Clima](#clima) | `current-weather`, `weather-forecast` | `fetch` y hosts permitidos | Ninguna |
| [Issues de GitHub](#issues-de-github) | `github-list-issues`, `github-create-issue` | `ctx.secret` | Un token de GitHub |
| [Notas del equipo](#notas-del-equipo) | `save-note`, `list-notes`, `read-note`, `find-notes`, `delete-note` | `ctx.resources` | Ninguna |
| [Tiempo libre en el calendario](#tiempo-libre-en-el-calendario) | `find-free-time` | `ctx.connection` | Google Calendar conectado |
| [Resumen de noticias](#resumen-de-noticias) | `hn-top-stories`, `email-hn-digest` | `ctx.resources.create` + `ctx.sendFile` | Gmail conectado |

## Antes de empezar

Necesitas Node 20 o superior y un proyecto en **Pro**, que es donde están
disponibles las [funciones](/es/docs/tools/functions/).

```bash
npm install -g @ganju/cli
ganju login

git clone https://github.com/MontoyaAndres/ganju.git
cd ganju/examples/weather
ganju link       # elige la organización y el proyecto de destino
```

A partir de aquí todos los ejemplos funcionan igual: `ganju test` ejecuta una
herramienta una vez sin publicarla, `ganju deploy` la pone en vivo y
`ganju logs` muestra las llamadas que hace tu asistente.

`ganju link` completa `organizationId`, `projectId` y `artifact` en
`ganju.json`. Las copias del repositorio no los traen, para que sirvan a
cualquiera. Ejecuta `npm install` en un ejemplo si quieres que `ctx` se
autocomplete en tu editor. El build no lo necesita.

Todos los ejemplos tienen la misma estructura:

```
ganju.json         las herramientas, sus esquemas y qué puede alcanzar el código
src/<tool>.ts      un archivo por herramienta, que exporta defineTool(...)
src/lib/*.ts       utilidades que comparten las herramientas
```

## Clima

El clima actual y el pronóstico de cualquier ciudad, desde
[Open-Meteo](https://open-meteo.com). No necesita cuenta ni llave, así que es
el primero que conviene desplegar.

```bash
ganju test current-weather --input '{"city":"Bogotá"}'
ganju test weather-forecast --input '{"city":"Lisbon","days":5}'
ganju deploy
```

Luego pregúntale a tu asistente *"¿Necesito paraguas en Lisboa esta semana?"*

**La herramienta es un `fetch` normal.** El único código de Ganju es
`defineTool` y `ctx.log`:

```ts
// src/currentWeather.ts
export default defineTool<{ city: string }>(async (input, ctx) => {
  const place = await findPlace(input.city.trim());
  ctx.log(`${input.city} → ${place.name}`);

  const { current } = await fetchForecast(place, 1);

  return {
    place: place.name,
    ...(place.country ? { country: place.country } : {}),
    conditions: describe(current.weather_code),
    temperatureC: current.temperature_2m
    // …
  };
});
```

**Qué observar**

- **`allowedHosts` es lo que deja salir a `fetch`.** Toda petición sale por la
  plataforma, que primero revisa el host. Una sola entrada, `open-meteo.com`,
  cubre `api.open-meteo.com` y `geocoding-api.open-meteo.com`, porque una
  entrada permite también sus subdominios.
- **El esquema limita la entrada antes de que corra tu código.** `days` se
  declara con `"minimum": 1, "maximum": 7`, así que una petición de 30 días se
  rechaza y nunca llega al handler.
- **Omite los campos que faltan en vez de ponerlos en `null`.** Un esquema de
  salida no tiene tipo nullable, así que un `null` en un campo `string` hace
  fallar toda la llamada. `country` se omite cuando el geocodificador no lo
  tiene.

## Issues de GitHub

Lista y abre issues en tus repositorios, para que un asistente pueda revisar si
un bug ya está reportado antes de crearlo.

Crea un [token de acceso personal fine-grained](https://github.com/settings/personal-access-tokens/new)
con **Issues: Read and write** solo en los repositorios que quieras que alcance,
y guárdalo como secreto:

```bash
read -s GANJU_SECRET_VALUE && export GANJU_SECRET_VALUE
ganju secret set GITHUB_TOKEN
unset GANJU_SECRET_VALUE

ganju test github-list-issues --input '{"repo":"your-org/your-repo","limit":5}'
ganju deploy
```

**El token se lee al momento de la llamada y nunca se guarda con el código:**

```ts
// src/lib/github.ts
const token = await ctx.secret('GITHUB_TOKEN');

const response = await fetch(`https://api.github.com${path}`, {
  headers: {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'ganju-example-github-issues'
  }
});
```

**Qué observar**

- **Los secretos se quedan fuera del repositorio.** El token no está en el
  código, ni en `ganju.json`, ni en el bundle. Rotarlo es un
  `ganju secret set` y aplica desde la siguiente llamada, sin redesplegar.
- **El esquema puede validar más que tipos.** `repo` tiene un `pattern` para
  `owner/name`, `state` es un `enum` de `open`, `closed` y `all`, y `labels` es
  un `array` de strings.
- **Los mensajes de error deben decir qué hacer.** Un 401 le dice al modelo que
  hay que restablecer el token, y un 404 que el repositorio está mal o fuera
  del alcance del token. El modelo puede transmitirlo en vez de adivinar.
- **Las herramientas que escriben deben preguntar primero.** La descripción de
  `github-create-issue` le indica al modelo que confirme el título y el
  repositorio, y que busque duplicados, antes de llamarla.

`ganju test` usa el secreto real, así que probar `github-create-issue` abre un
issue real. Usa un repositorio de pruebas.

## Notas del equipo

Una libreta en la que tu asistente puede escribir y buscar. Di *"anota que el
lanzamiento pasó al jueves"* en Slack y pregunta *"¿cuándo es el lanzamiento?"*
desde Claude una semana después.

```bash
ganju test save-note --input '{"title":"Release checklist","body":"1. Tag\n2. Build\n3. Deploy"}'
ganju test find-notes --input '{"query":"cómo publicamos"}'
ganju deploy
```

Usa los cinco métodos de `ctx.resources`, uno por herramienta:

| Herramienta | Método |
| --- | --- |
| `save-note` | `ctx.resources.create({ …, index: true })` |
| `list-notes` | `ctx.resources.list()` |
| `read-note` | `ctx.resources.read(uri)` |
| `find-notes` | `ctx.resources.search(query)` |
| `delete-note` | `ctx.resources.delete(uri)` |

```ts
// src/saveNote.ts
const saved = await ctx.resources.create({
  title,
  uri: noteUri(title), // resource://notes/release-checklist
  content: markdown,
  mimeType: 'text/markdown',
  index: true
});

return { uri: saved.uri, created: saved.created, indexed: saved.indexed };
```

**Qué observar**

- **Un uri estable hace que guardar sea idempotente.** Cada nota vive en
  `resource://notes/<slug-del-título>`, así que guardar con un título que ya
  existe reemplaza la nota, y `created: false` lo indica. El prefijo común
  también es lo que usan `list-notes` y `find-notes` para separar las notas de
  los archivos subidos y las páginas rastreadas.
- **`index: true` es una decisión deliberada.** Lo que escribe una herramienta
  no es buscable a menos que lo pida. Aquí lo pide, así que las notas aparecen
  en `find-notes` y en la [búsqueda de conocimiento](/es/docs/resources/) del
  propio asistente. La indexación tarda unos segundos y cuenta para el
  almacenamiento de tu plan.
- **La búsqueda devuelve fragmentos, no documentos.** Una nota puede coincidir
  más de una vez, así que `find-notes` se queda con el fragmento de mejor
  puntaje de cada nota.
- **`resourceAccess: "own"` limita lo que se puede borrar.** `delete-note` solo
  puede quitar lo que escribió una herramienta, nunca un archivo que alguien
  subió, reciba el uri que reciba.

Este ejemplo no llama a hosts externos. Su `allowedHosts` está vacío, y **vacío
significa cualquier host público**, no ninguno. Si lo extiendes para que
consulte algo, agrega ese host.

## Tiempo libre en el calendario

Encuentra los huecos libres de un día en tu Google Calendar donde cabe una
reunión, dentro del horario laboral. Puede responder *"¿Cuándo estoy libre el
martes una hora?"* o proponerle horarios a alguien.

Conecta **Google Calendar** en la página **Tools** del proyecto y luego:

```bash
ganju test find-free-time --input '{"date":"2026-09-21","durationMinutes":60}'
ganju deploy
```

```json
{
  "date": "2026-09-21",
  "timeZone": "America/Bogota",
  "busy": [{ "start": "10:00", "end": "11:30" }, { "start": "13:00", "end": "14:15" }],
  "free": [
    { "start": "09:00", "end": "10:00", "minutes": 60 },
    { "start": "11:30", "end": "13:00", "minutes": 90 },
    { "start": "14:15", "end": "17:00", "minutes": 165 }
  ]
}
```

**La conexión es una sola línea:**

```ts
// src/lib/google.ts
const { accessToken } = await ctx.connection('google-calendar');

const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
  headers: { authorization: `Bearer ${accessToken}` }
});
```

**Qué observar**

- **La plataforma se encarga de OAuth.** `ctx.connection` devuelve un access
  token de vida corta y lo renueva cuando hace falta. El refresh token nunca
  llega a tu código.
- **`connections` funciona como un permiso.** `ganju.json` declara
  `"connections": ["google-calendar"]`. Sin eso la llamada se rechaza aunque la
  cuenta esté conectada, así que un script no puede alcanzar cuentas que no
  declaró.
- **Pide solo lo que la tarea necesita.** La herramienta usa el endpoint
  free/busy de Google, que devuelve solo horarios. Ni los títulos de los
  eventos ni los asistentes llegan a la conversación.
- **Las zonas horarias funcionan sin librerías.** `src/lib/time.ts` usa `Intl`
  para convertir "las 9:00 en la zona horaria del calendario" en un instante
  exacto, correcto también los días en que cambia la hora.

## Resumen de noticias

La portada de Hacker News, en el chat o enviada por correo a alguien con la
lista adjunta como archivo Markdown.

Conecta **Gmail** en la página **Tools** del proyecto y luego:

```bash
ganju test hn-top-stories --input '{"limit":5}'
ganju test email-hn-digest --input '{"to":"tu@ejemplo.com","limit":5}'
ganju deploy
```

La segunda prueba envía un correo real, así que envíatelo a ti.

**Primero se crea el archivo, luego se envía:**

```ts
// src/emailDigest.ts
const saved = await ctx.resources.create({
  title: `Hacker News digest — ${date}`,
  uri: `resource://news-digest/${date}`,
  fileName: `hacker-news-${date}.md`,
  mimeType: 'text/markdown',
  content: toMarkdown(stories, date)
});

await ctx.sendFile({
  to: 'gmail',
  uris: [saved.uri],
  message: { to: input.to, subject: `Hacker News digest — ${date}`, body }
});
```

**Qué observar**

- **`sendFile` recibe uris, nunca bytes.** La plataforma lee el archivo del
  almacenamiento y lo adjunta, así que la misma llamada puede enviar un PDF de
  40MB que tu código nunca podría sostener. Cambia `to: 'gmail'` por
  `'outlook'` o `'slack'` para enviarlo a otro lugar.
- **Enviar también requiere una conexión declarada.** Enviar como una cuenta
  requiere el mismo permiso que tener su token, así que `google-gmail` está en
  `connections`.
- **Un uri por día evita que el almacenamiento se acumule.** Ejecutar la
  herramienta dos veces en un día reemplaza el archivo de la mañana.
- **Mantén acotado el número de peticiones.** Cada historia es su propia
  petición, hechas en paralelo. `limit` llega hasta 15 porque cada `fetch`
  cuenta contra el presupuesto de peticiones salientes del proyecto.

## Hazlo tuyo

La forma más rápida de escribir una herramienta nueva es copiar el ejemplo que
más se le parezca:

1. **Copia la carpeta** y ejecuta `ganju link` en ella.
2. **Renombra la herramienta** en `ganju.json`. El router se genera a partir
   del manifiesto, así que el nombre solo vive ahí.
3. **Reescribe la descripción.** Es lo que usa el modelo para decidir cuándo
   llamar la herramienta, así que di *cuándo* usarla, no solo qué hace.
4. **Declara exactamente los hosts y las conexiones que necesitas.** Cualquier
   otro se rechaza cuando la herramienta corre.
5. **Usa `ganju test` hasta que pase y luego `ganju deploy`.** Si un despliegue
   sale mal, `ganju rollback` vuelve a poner la versión anterior.

## Siguiente

- **[La CLI `ganju`](/es/docs/tools/cli/)**: todos los comandos que usan estos
  ejemplos, y cómo desplegar desde CI.
- **[Funciones](/es/docs/tools/functions/)**: la referencia completa de `ctx`,
  los ajustes y los límites.
