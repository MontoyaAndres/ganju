---
title: Catálogo
description: Las integraciones que traemos — conecta una cuenta una vez, enciende las herramientas que quieras y apágalas de nuevo sin perder la configuración.
order: 39
updated: 2026-11-13
---

El **catálogo** es todo lo que traemos y mantenemos: Gmail, Outlook, Slack,
Google Calendar, Cal.com, búsqueda web y los servidores MCP remotos oficiales de
GitHub y Notion. Si tu caso está cubierto aquí, nunca tienes que escribir código
para él — conectas una cuenta una vez y enciendes las herramientas que quieras.

La página **Herramientas** de un proyecto tiene tres pestañas: **Funciones** (tu
propio código), **Endpoints HTTP** (una petición contra tu API) y **Catálogo**.
Esta página trata de la última.

![Herramientas, pestaña Catálogo: la barra de herramientas expuestas, la búsqueda, los filtros y las tarjetas de integraciones](/images/tools-catalog.webp)

## La cuadrícula

Cada integración es una tarjeta con su ícono, una descripción de una línea y
cuántas de sus herramientas están encendidas (**5/18 herramientas activadas**).
Una tarjeta con la cuenta vinculada muestra la etiqueta **Conectado**; una cuyo
inicio de sesión dejó de valer muestra **Vencido**.

Encima de la cuadrícula:

- **El presupuesto de herramientas** — cuántas herramientas expone este
  proyecto, de 40 (**12 de 40 herramientas expuestas**). Cada una se le reenvía
  al modelo en cada turno; la barra te avisa cuando te acercas.
- **Buscar integraciones...** — busca en los nombres y descripciones de las
  tarjetas y en los nombres de sus herramientas, así que buscar "borrador"
  encuentra Gmail y Outlook.
- **Filtros** — **Todas**, **Encendidas** (al menos una herramienta activa),
  **Apagadas** (ninguna activa) y **Falta conectar** (integraciones que
  necesitan una cuenta que aún no vinculaste, y servidores MCP remotos que aún
  no conectaste).

Al abrir una tarjeta ves cada herramienta del grupo, con su descripción, una
etiqueta **Permisos** (pasa el cursor para ver el permiso que necesita) y su
propio interruptor. **Volver al catálogo** te regresa a la cuadrícula.

Algunas tarjetas no son integraciones con cuenta:

- **Integradas** — las cinco herramientas de recursos y prompts con las que
  arranca todo proyecto. No requieren conexión. Mira
  [Integradas](/es/docs/tools/built-in/).
- **Saludo** — una prueba de una sola herramienta para confirmar que un servidor
  nuevo responde. Mira [Saludo](/es/docs/tools/greeting/).
- **GitHub** y **Notion** — servidores MCP remotos que opera el propio
  proveedor. Conectar uno trae las herramientas que ofrece *su* servidor. Abren
  un diálogo en lugar de una lista de herramientas; mira
  [GitHub](/es/docs/tools/github/) y [Notion](/es/docs/tools/notion/).

## Conecta una vez, activa por herramienta

La mayoría de las integraciones necesitan una conexión única, y **una conexión
sirve a todo el grupo** — conecta Gmail una vez y sus 18 herramientas pueden
usarla. Mientras no conectes, el grupo muestra un aviso (*Conecta Gmail para
activar estas herramientas. Solo necesitas conectarlo una vez para toda la
integración.*) y sus interruptores aparecen deshabilitados.

Hay dos tipos de conexión:

| Tipo | Integraciones | Cómo |
| --- | --- | --- |
| **Iniciar sesión (OAuth)** | Gmail, Outlook, Slack, Búsqueda en Slack, Google Calendar | Elige **Conectar Gmail** (o el nombre de la integración). Te enviamos al proveedor para aprobar y te traemos de vuelta a Herramientas con *Conectaste Gmail. Activa abajo las herramientas que quieras usar.* |
| **API key** | Cal.com, Búsqueda web (Tavily) | Elige **Agregar API key de Cal.com**, pega la llave y **Guardar**. La validamos con el proveedor antes de guardarla, así que una llave equivocada se rechaza en el acto. |

Las credenciales se guardan cifradas, no vuelven a mostrarse, y los tokens de
OAuth se renuevan por ti. Una vez conectada, el encabezado del grupo ofrece
**Desconectar** (y **Actualizar API key** en las integraciones con llave).

![Outlook antes de conectarlo: Conectar Outlook, el aviso y las herramientas desactivadas](/images/tools-catalog-not-connected.webp)

### Cuando una herramienta necesita más permisos

Al conectar se piden todos los permisos que usan las herramientas de la
integración, así que normalmente apruebas una vez y listo. Si la conexión se
hizo antes de que una herramienta necesitara un permiso que no tiene, al
encenderla aparece **Se necesitan permisos adicionales**: **Dar permisos** te
envía de vuelta al proveedor para sumar el permiso que falta a tu conexión
actual.

## El presupuesto de herramientas

El esquema de cada herramienta activa se le reenvía al modelo en **cada**
llamada, así que la cantidad de herramientas es un costo directo — y los modelos
eligen peor pasadas unas decenas de opciones. Lo medimos con nuestro propio
tráfico: un asistente con 5 herramientas promedia ~1.100 tokens de entrada por
turno, y uno con 12 promedia ~13.100. Una lista más corta es un asistente más
barato y más certero. Enciende las herramientas que necesitas, no el grupo
entero.

Los límites:

- **Free:** 7 herramientas encendidas por proyecto. Las cinco integradas cuentan.
- **Pro y Enterprise:** sin límite del plan, pero un proyecto puede tener como
  máximo **40** herramientas encendidas.
- Cada herramienta que permitas de un servidor MCP remoto cuenta como una, y un
  proyecto con [base de datos](/es/docs/data/) suma sus tres herramientas de
  datos.

Pasado el límite, encender una más se rechaza con un mensaje que dice cuántas
hay encendidas; apaga alguna o mejora tu plan. Además, los canales nunca le
envían más de 40 herramientas al modelo, y las integradas de recursos siempre
se conservan primero, así que tu asistente nunca pierde la capacidad de leer tu
conocimiento.

## Apagar y Eliminar son cosas distintas

Cada fila activa (o que lo estuvo) tiene ambos, porque responden preguntas
distintas:

| | Qué pasa |
| --- | --- |
| **Apagar** (interruptor) | La herramienta deja de exponerse. Su configuración, su credencial y sus ajustes sobreviven, y deja de contar contra tu límite. La fila se marca **Apagada · conserva su configuración**. |
| **Eliminar** (papelera) | La fila se borra, y la configuración se va con ella. La confirmación te recuerda apagarla si solo quieres quitarla del servidor. |

Apagar una herramienta libera un espacio, así que en Free puedes rotar entre más
herramientas de las que tu plan expone a la vez. Volver a encenderla revisa el
límite de nuevo.

**Desconectar** es una tercera cosa: revoca la credencial guardada de toda la
integración. Todas las herramientas activas del grupo dejan de funcionar de
inmediato, pero las instaladas siguen en la lista, así que al reconectar
vuelven tal como estaban.

En un **servidor MCP remoto**, el interruptor (**Expuestas**) vive en su diálogo
y **Desconectar** lo elimina.

## Acciones sensibles

Cada herramienta del catálogo está marcada según lo que hace: solo lee, hace
cambios que se pueden deshacer (borradores, etiquetas, mover correo), o llega a
otra persona o no tiene vuelta atrás (enviar, publicar, reservar, eliminar).
Cuando tu organización enciende
[Confirmar acciones sensibles](/es/docs/settings/#confirmar-acciones-sensibles),
el asistente pregunta antes de ejecutar una del último tipo. La página de cada
integración dice cuáles son.

## Las conexiones se comparten

Una cuenta conectada le pertenece al asistente del proyecto, no a una
herramienta. La misma conexión de Gmail está disponible para:

- todas las herramientas de Gmail del catálogo;
- un [endpoint HTTP](/es/docs/tools/http-endpoints/) con autenticación
  **Cuenta conectada**, en lugar de guardar una segunda copia de la credencial;
- una [función](/es/docs/tools/functions/), vía `ctx.connection('google-gmail')`
  — pero solo si el proveedor está en las conexiones de esa función (la sección
  **Conexiones** de su configuración, o `"connections"` en `ganju.json` cuando
  despliegas con el [CLI](/es/docs/tools/cli/)). Tu código nunca recibe el
  refresh token, solo un access token de vida corta.

Los nombres de las conexiones son `google-gmail`, `microsoft-outlook`, `slack`,
`slack-user` (Búsqueda en Slack) y `google-calendar`. Las API keys (Cal.com,
Tavily) no son conexiones: solo las usan las herramientas del catálogo.

Desconectar una integración afecta a las tres.

## Con el asistente

En los planes de pago, el [Asistente](/es/docs/assistant/) puede trabajar con el
catálogo por ti: consulta lo que ofrece y propone agregar una herramienta del
catálogo, encender o apagar herramientas, o eliminarlas — como un cambio que tú
apruebas, con opción de deshacer. Cuando una herramienta necesita una cuenta, te
muestra una tarjeta para conectarla; nunca te pide una contraseña ni un token.
Las API keys (Cal.com, Búsqueda web) y los servidores MCP remotos que piden
inicio de sesión o token los agregas tú en Herramientas.

El CLI `ganju` no administra herramientas del catálogo; despliega funciones, que
pueden usar las mismas conexiones.

## Las integraciones

| | |
| --- | --- |
| **[Integradas](/es/docs/tools/built-in/)** | Las cinco herramientas base de recursos y prompts |
| **[Gmail](/es/docs/tools/gmail/)** | Enviar, leer, buscar y gestionar correo (18 herramientas) |
| **[Outlook](/es/docs/tools/outlook/)** | Correo de Microsoft 365 vía Graph (18 herramientas) |
| **[Slack](/es/docs/tools/slack/)** | Publicar mensajes, explorar canales, buscar usuarios, subir archivos (4 herramientas) |
| **[Búsqueda en Slack](/es/docs/tools/slack-search/)** | Búsqueda de mensajes en todo el workspace (1 herramienta) |
| **[Google Calendar](/es/docs/tools/google-calendar/)** | Crear y gestionar eventos, encontrar espacios libres (6 herramientas) |
| **[Cal.com](/es/docs/tools/calcom/)** | Consultar disponibilidad y reservar o cancelar reuniones (4 herramientas) |
| **[Búsqueda web](/es/docs/tools/web-search/)** | Buscar en la web en vivo y extraer páginas (2 herramientas) |
| **[GitHub](/es/docs/tools/github/)** | El servidor MCP remoto oficial de GitHub |
| **[Notion](/es/docs/tools/notion/)** | El servidor MCP remoto oficial de Notion |
| **[Saludo](/es/docs/tools/greeting/)** | Una herramienta de demostración para probar un servidor nuevo |

## Solución de problemas

- **Los interruptores están deshabilitados.** La integración aún no está
  conectada — usa **Conectar** o **Agregar API key** en el encabezado del grupo.
- **La tarjeta dice Vencido.** El proveedor dejó de aceptar el inicio de sesión
  guardado (cambio de contraseña, acceso revocado). Abre la tarjeta y conecta de
  nuevo; tus herramientas y ajustes se conservan.
- **Una herramienta responde "credential not connected" o "not connected".**
  Alguien desconectó la integración. Conéctala de nuevo desde su tarjeta.
- **Encender una herramienta se rechaza.** Llegaste a tu límite. Apaga una que
  no necesites, o mejora tu plan.
- **El bot ignora una herramienta que tiene.** Revisa que esté encendida (no
  **Apagada · conserva su configuración**) y que su descripción encaje con lo
  que se pide — y recuerda que un canal envía como máximo 40 herramientas.

## ¿No está aquí?

Dos salidas, en orden de esfuerzo:

- **[Endpoints HTTP](/es/docs/tools/http-endpoints/)** — una petición contra una
  API que ya tienes, descrita en un formulario. Disponible en todos los planes.
- **[Funciones](/es/docs/tools/functions/)** — tu propio código, cuando necesitas
  lógica y no una sola llamada.
