---
title: Recursos
description: Dale conocimiento a tu IA para consultar — importa desde Google Drive u OneDrive, sube archivos directamente o rastrea un sitio web.
order: 3
updated: 2026-07-07
---

Los **recursos** son los documentos y el conocimiento que tu asistente puede
consultar, para que responda con tu propio contenido en lugar de adivinar.
Agrégalos desde Google Drive, OneDrive, un rastreo de sitio web o subiendo
archivos directamente. Cada recurso recibe una URI `resource://` y, una vez
procesado, queda marcado como **Ready** y pasa a ser consultable por tu IA.

## Por qué agregar recursos

- **Respuestas fundamentadas y precisas.** Tu IA responde desde tus documentos
  reales, no desde su entrenamiento general — menos respuestas inventadas y más
  citas en las que puedes confiar.
- **Una base de conocimiento, todos los canales.** Agrega un archivo una vez y
  queda consultable desde cada canal vinculado y cada cliente MCP al mismo tiempo.
- **Trae lo que ya tienes.** Jala directo desde Google Drive u OneDrive, sube
  archivos o rastrea un sitio web completo — sin reformatear ni copiar y pegar.
- **Siempre al día.** Vuelve a sincronizar un drive o a rastrear un sitio y el
  índice se actualiza — tu asistente responde con la última versión.
- **Muestra tus fuentes.** Activa las citas y el asistente referencia el recurso
  exacto detrás de cada respuesta, para que quien lea pueda verificarlo.

## De dónde vienen los recursos

La página **Resources** agrupa todo por origen: **Google Drive**, **OneDrive**,
**Websites** y las carpetas que llenas con tus propios archivos.

![La página de Recursos mostrando los orígenes Google Drive, OneDrive, Websites y My folder](/images/new-resource.webp)

## Importar desde Google Drive u OneDrive

Elige **Add from Google Drive** para abrir el selector. Navega **My Drive**,
**Shared with me**, **Shared drives** o **Starred**, marca los archivos que
quieras y selecciona **Add selected** — Ganju los importa e indexa por ti.

![El selector Import from Google Drive con las pestañas My Drive, Shared with me, Shared drives y Starred](/images/resource-google-drive.webp)

**OneDrive** funciona igual — navega **My files**, **Shared with me**, **Recent**
o **Drives**, y luego agrega tu selección.

![El selector Import from OneDrive con las pestañas My files, Shared with me, Recent y Drives](/images/resource-onedrive.webp)

## Subir un archivo

Dentro de una carpeta, selecciona **Add files**. Dale un **título** al recurso —
su URI se genera automáticamente (como `resource://mathematics-book`) y se puede
editar —, elige un **tipo** y adjunta un archivo o pega texto directamente.

![El panel New Resource con un título, la URI generada automáticamente, el tipo y un PDF subido](/images/resource-math-book.webp)

Una vez procesado, el recurso muestra **Ready**, junto con su tipo, tamaño y URI.
Activa **Cite this resource in replies** para que tu asistente lo referencie como
fuente en cualquier respuesta donde lo use.

![El recurso mathematics-book guardado y marcado como Ready, con sus metadatos y el interruptor Cite in replies](/images/resource-math-book-done.webp)

## Rastrear un sitio web

Selecciona **Add website**, escribe una **URL** de inicio (se siguen los enlaces
del mismo origen), agrega un título y una descripción, y define **Max pages**
(1–1000) y **Max depth** (0–10). Luego selecciona **Start crawl**.

![El panel Add Website con los campos de URL, título, descripción, máximo de páginas y profundidad](/images/resource-webpage.webp)

Ganju rastrea el sitio e indexa cada página que encuentra como un recurso
consultable propio. Abre el grupo del sitio web para navegar todas las páginas
descubiertas, cada una con su título, URL y fecha de rastreo.

![El grupo Websites expandido mostrando muchas páginas rastreadas de Cloudflare, cada una con su URL y fecha](/images/resource-website-cloudflare.webp)

Selecciona cualquier página para ver sus detalles — origen, tipo, tipo MIME,
tamaño, URI y descripción — y aparece marcada como **Ready** igual que cualquier
otro recurso, con el mismo interruptor **Cite this resource in replies**.

![Una página de sitio web rastreada y marcada como Ready, mostrando su origen, tipo, tamaño, URI y el interruptor Cite in replies](/images/resource-website-done.webp)

## Míralo en acción

Cuando un recurso está **Ready**, tu asistente lo consulta automáticamente. Haz una
pregunta en cualquier canal vinculado y responderá con tu contenido — y, con las
citas activadas, nombra la fuente justo debajo de la respuesta.

![Un chat de Telegram donde el bot responde una pregunta a partir de un sitio web rastreado y cita vocesqueabrazan.com como fuente](/images/resource-chat.webp)

Sigue con: deja que tu IA actúe con [herramientas](/es/docs/getting-started/tools).
