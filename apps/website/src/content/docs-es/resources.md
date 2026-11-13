---
title: Recursos
description: Dale a tu IA conocimiento para buscar — importa desde Google Drive o OneDrive, sube archivos o pega texto, rastrea un sitio web, mantenlo todo sincronizado y cita tus fuentes.
order: 3
updated: 2026-11-13
---

Los **recursos** son los documentos y el conocimiento en los que tu asistente
puede buscar, para que responda desde tu propio contenido en lugar de adivinar.
Agrégalos desde Google Drive, OneDrive, el rastreo de un sitio web, o subiendo
archivos y pegando texto. Cada recurso recibe una URI (como
`resource://lista-de-precios`) y, una vez procesado, queda **Listo** y tu bot
puede buscar en él en todos los canales, igual que cualquier cliente MCP.

## Por qué agregar recursos

- **Respuestas fundamentadas y precisas.** Tu IA responde desde tus documentos
  reales, no desde su entrenamiento general — menos respuestas inventadas, más
  citas en las que puedes confiar.
- **Una base de conocimiento, todos los canales.** Agrega un archivo una vez y
  se puede buscar desde cada canal vinculado y cliente MCP al mismo tiempo.
- **Trae lo que ya tienes.** Importa directo desde Google Drive u OneDrive, sube
  archivos o rastrea un sitio web completo — sin reformatear ni copiar y pegar.
- **Siempre al día.** Sincroniza una unidad o un sitio y solo se vuelve a
  indexar lo que cambió; en Pro pasa solo, cada día o cada semana.
- **Muestra tus fuentes.** Con las citas activadas, el bot muestra el recurso
  exacto detrás de cada respuesta, con un enlace a la página o al archivo.

## Dónde viven los recursos

Abre **Conocimiento** en la barra lateral del proyecto. Tiene dos pestañas:
**Recursos** y [Prompts](/es/docs/prompts/). La pestaña Recursos tiene dos
vistas, que cambias arriba a la derecha:

- **Fuentes** agrupa todo según de dónde vino, con una tarjeta por fuente, su
  conteo y un botón para agregar: **Google Drive**, **OneDrive**, **Sitios
  web**, **Mi carpeta** (lo que subes y el texto que pegas) y, cuando hay
  alguno, **Datos adjuntos** (archivos subidos desde una fila en la página de
  [Datos](/es/docs/data/)).
- **Todos los recursos** muestra todos los recursos en un solo lugar.

Dentro de una fuente, o en Todos los recursos, la caja **Buscar** filtra por
título, URI o descripción, y **Volver** te lleva de nuevo a las tarjetas.

![Conocimiento, pestaña Recursos, vista Fuentes: Google Drive, OneDrive, Sitios web y Mi carpeta](/images/knowledge-resources.webp)

## Sube un archivo o pega texto

Abre **Mi carpeta** y selecciona **Agregar archivos**. El panel **Nuevo
recurso** te pide:

- **Título** — un nombre legible (de 3 a 200 caracteres). Al elegir un archivo
  se llena con su nombre.
- **URI** — se genera a partir del título (como `resource://lista-de-precios`);
  edítala si quieres. Cada URI debe ser única en el proyecto.
- **Tipo** — **Estático — contenido fijo** para un documento normal, o
  **Plantilla — dinámico con variables** para contenido con marcadores como
  `{userId}` que un cliente MCP completa.
- **Descripción** — de qué trata el recurso (hasta 1.000 caracteres). También se
  indexa, así que una buena descripción ayuda al bot a encontrarlo.
- **Origen del contenido** — **Archivo** para subir uno, o **Texto** para pegar
  o escribir el contenido directamente, con su tipo de archivo (texto plano, CSV,
  HTML, JSON, YAML, código y otros formatos de texto) y su **Codificación**.
- **Opciones avanzadas** — las anotaciones MCP que leen los clientes:
  **Audiencia**, **Prioridad (0 a 1)** e **Iconos**.

![El panel Nuevo recurso: título, URI, tipo, descripción, archivo o texto, y opciones avanzadas](/images/resource-new-file.webp)

Selecciona **Crear**. El recurso muestra **Indexando** mientras Ganju lo lee, y
luego **Listo** (o **Falló**, si no se pudo leer el archivo).

### Tipos y tamaños de archivo

Un archivo puede pesar hasta **500 MB**. Lo que Ganju **lee y vuelve buscable**:

| Clase | Formatos |
| --- | --- |
| Documentos | PDF, Word (`.doc`, `.docx`), PowerPoint (`.pptx`) |
| Hojas de cálculo | Excel (`.xls`, `.xlsx`), CSV |
| Archivos de Google | Documentos, Hojas de cálculo y Presentaciones (desde Google Drive) |
| Texto y código | texto plano, Markdown, HTML, JSON, XML, YAML, TOML, SQL, GraphQL, JavaScript, TypeScript, Python, Ruby, Perl, PHP, shell |

También puedes guardar imágenes (PNG, JPEG, GIF, WebP, SVG) y otros
archivos. Conservan su título, descripción y URI — que sí se pueden buscar — y
el bot puede enviarlos como adjuntos, pero su contenido no se lee para el
índice.

Cuando al indexar aparecen pasajes escritos para una IA y no para una persona
("ignora tus instrucciones y…"), el recurso recibe una advertencia: **Contiene
texto que parece dar instrucciones a una IA**. Los bots tratan los documentos
como información, nunca como órdenes, y después de leer un pasaje así piden
confirmación antes de una acción sensible. Revisa el documento si no esperabas
ese texto.

## Importa desde Google Drive u OneDrive

Abre la tarjeta **Google Drive** y elige **Agregar desde Google Drive**. La
primera vez, Ganju te pide conectar tu cuenta de Google. Se abre un selector con
**Mi unidad**, **Compartido conmigo**, **Unidades compartidas** y
**Destacados**; busca en una pestaña, marca archivos o carpetas enteras y
selecciona **Agregar lo seleccionado** — Ganju los importa y los indexa. Elegir
una carpeta trae lo que tiene adentro y la mantiene sincronizada.

Los Documentos, Hojas de cálculo y Presentaciones de Google se convierten a
Word, Excel y PowerPoint al importarlos, así que se leen como cualquier otro
documento.

**OneDrive** funciona igual: **Agregar desde OneDrive**, conecta tu cuenta de
Microsoft, recorre **Mis archivos**, **Compartido conmigo**, **Recientes** o
**Unidades** y agrega lo que elegiste.

## Rastrea un sitio web

Abre la tarjeta **Sitios web** y selecciona **Agregar sitio web**. El panel te
pide:

- **URL** — la página de inicio, `http` o `https`. Ganju solo sigue los enlaces
  del mismo sitio (mismo origen). Las direcciones de redes privadas se rechazan.
- **Título** y **Descripción** — un nombre para el sitio y qué hay en él.
- **Máximo de páginas** — de 1 a 1.000 páginas (100 por defecto).
- **Profundidad máxima** — a cuántos clics de la página de inicio llegar, de 0
  a 10 (3 por defecto; 0 rastrea solo la página de inicio).

![El panel Agregar sitio web: URL, título, descripción, máximo de páginas y profundidad máxima](/images/resource-add-website.webp)

Selecciona **Iniciar rastreo**. Ganju descarga cada página, abre en un navegador
real las páginas hechas con JavaScript cuando el HTML no trae texto, e indexa
cada página como su propio recurso. Abre el sitio para ver todas las páginas que
encontró, con su título, URL y fecha.

![Un sitio web rastreado: sus páginas con URL y fecha, más Sincronizar y la configuración de sincronización](/images/resource-website-pages.webp)

## Mantén las fuentes sincronizadas

Las fuentes de Google Drive, OneDrive y sitios web se pueden volver a
sincronizar. Selecciona **Sincronizar** en la barra de la fuente, o
**Sincronizar ahora** en la sección **Sincronización** de un recurso. Solo se
vuelve a indexar lo nuevo o lo que cambió, y lo que se eliminó en el origen
también se elimina aquí. La sección muestra la **Última sincronización**.

El botón de configuración junto a **Sincronizar** define **Sincronizar
automáticamente** y la **Frecuencia**: **Cada día** o **Cada semana**. La
sincronización automática es una función de **Pro** y **Enterprise**; en Free
puedes sincronizar cualquier fuente a mano.

## Detalles de un recurso

Selecciona cualquier recurso para abrirlo. Verás su estado (**Listo**,
**Indexando** o **Falló**), su **Origen** (Archivo, Sitio web, Google Drive,
OneDrive, o Herramienta para los que crean tus
[funciones](/es/docs/tools/functions/)), **Tipo**, tipo de archivo, **Tamaño**,
**Codificación**, **Nombre del archivo**, **URI** y **Descripción**, el contenido
o un botón **Abrir el archivo**, y sus metadatos. Desde arriba del panel puedes
editarlo o eliminarlo. Eliminar una carpeta elimina todo lo que tiene adentro;
si hay filas de la página de Datos que enlazan el archivo, Ganju te dice antes
qué pasará con esos enlaces.

![El detalle de un recurso: Listo, fuente, tipo, tamaño, URI y el interruptor para citarlo en las respuestas](/images/resource-details.webp)

## Cita tus fuentes

Cada recurso tiene un interruptor de **Fuentes**, activado por defecto: **Citar
este recurso en las respuestas**. Cuando el bot lo usa para responder, lo
muestra debajo de la respuesta como una fuente numerada:

- un **archivo** enlaza a su descarga, con el número de página en los PDF
  (`p. 12`);
- una **página web** enlaza a la página misma, con el dominio del sitio.

En Telegram y Discord las fuentes llegan como botones debajo del mensaje; en
Slack y WhatsApp, como una lista corta de enlaces **Sources**. Desactiva el interruptor
(**Oculto en las citas**) y el bot sigue usando el recurso, pero nunca lo
muestra como fuente — útil para notas internas.

![Un chat de Telegram donde el bot responde una pregunta a partir de un sitio web rastreado y cita el sitio como fuente](/images/resource-chat.webp)

En las [Conversaciones](/es/docs/channels/#mira-las-conversaciones) del canal,
cada respuesta muestra las fuentes que citó, con sus números de página.

## Cómo usa el bot los recursos

Cuando un recurso está **Listo**, tu bot busca en él por su cuenta cuando una
pregunta lo necesita, en todos los canales y en el panel **Pruébalo como
cliente** del asistente. También puede enviarle a la persona un archivo guardado
como adjunto ("mándame el menú"). Los clientes MCP tienen la misma búsqueda,
además de cada recurso por su URI.

El código también puede usarlos: una [función](/es/docs/tools/functions/) lee,
lista, busca y crea recursos con `ctx.resources`.

## Deja que el asistente los maneje

El [asistente](/es/docs/assistant/) del proyecto puede listar tu conocimiento,
buscar en él como lo haría el bot, agregar una nota (un recurso de texto),
editar una nota, agregar un sitio web para rastrear y eliminar un recurso —
cada cosa como un cambio que tú apruebas. Para agregar un archivo, te pide que
lo subas.

## Límites del plan

| | Free | Pro y Enterprise |
| --- | --- | --- |
| Un archivo | 500 MB | 500 MB |
| Archivos guardados (por organización) | 30 MB | Sin límite |
| Contenido indexado (por organización) | 5 MB | Sin límite |
| Sincronización automática | — | Cada día o cada semana |

El contenido indexado es el texto que Ganju extrajo y volvió buscable, que suele
ser mucho más liviano que los archivos. Cuando una organización en Free se
llena, los recursos nuevos se rechazan hasta que elimines algunos o cambies de
plan. Mira los planes en [Configuración](/es/docs/settings/).

## Solución de problemas

- **"Tipo de archivo no admitido".** El navegador reportó un tipo de archivo que
  Ganju no guarda. Guárdalo en uno de los formatos de arriba (PDF es lo más
  seguro).
- **Un recurso muestra Falló.** No se pudo leer el archivo — por ejemplo, uno
  dañado o protegido con contraseña. Expórtalo de nuevo y sube la copia nueva
  (edita el recurso y reemplaza el archivo).
- **El rastreo encontró pocas páginas.** Sube la **Profundidad máxima** o el
  **Máximo de páginas**, y revisa que los enlaces se queden en el mismo dominio
  que la URL de inicio (`www.ejemplo.com` y `ejemplo.com` son orígenes
  distintos).
- **"Resource URI must be unique".** Otro recurso usa esa URI o URL. Cambia la
  URI, o abre el sitio que ya existe en vez de agregarlo de nuevo.
- **"Conecta Google Drive para importar archivos".** La sesión de Google o
  Microsoft venció. Selecciona **Agregar desde Google Drive** (u OneDrive) otra
  vez para reconectarla.

Sigue con: deja que tu IA actúe con [herramientas](/es/docs/tools/).
