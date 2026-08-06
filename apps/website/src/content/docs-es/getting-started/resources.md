---
title: Recursos
description: Agrega los archivos y el conocimiento que tu IA puede consultar — desde discos en la nube, un rastreo de sitio web o archivos que subas.
order: 5
updated: 2026-07-06
---

Los **recursos** son los documentos y el conocimiento que tu asistente puede
consultar, para que responda con tu contenido en lugar de adivinar. Agrégalos
desde Google Drive, OneDrive, un rastreo de sitio web o subiendo archivos
directamente — cada uno recibe una URI y, una vez procesado, queda marcado como
**Ready**.

> **¿Quieres el panorama completo?** Esta es la versión rápida. La guía completa
> de **[Recursos](/es/docs/resources)** cubre las importaciones desde Google Drive
> y OneDrive, los rastreos de sitios web, los archivos subidos y las citas.

## De dónde vienen los recursos

La página **Resources** agrupa todo por origen: **Google Drive**, **OneDrive**,
**Websites** y las carpetas que llenas con tus propios archivos.

![La página de Recursos mostrando los orígenes Google Drive, OneDrive, Websites y My folder](/images/new-resource.webp)

## Importar desde Google Drive u OneDrive

Elige **Add from Google Drive** para abrir el selector. Navega **My Drive**,
**Shared with me**, **Shared drives** o **Starred**, marca los archivos que
quieras y selecciona **Add selected**.

![El selector Import from Google Drive con las pestañas My Drive, Shared with me, Shared drives y Starred](/images/resource-google-drive.webp)

**OneDrive** funciona igual — navega **My files**, **Shared with me**, **Recent**
o **Drives**, y luego agrega tu selección.

![El selector Import from OneDrive con las pestañas My files, Shared with me, Recent y Drives](/images/resource-onedrive.webp)

## Subir un archivo

Dentro de una carpeta, selecciona **Add files**. Dale un **título** al recurso —
su URI se genera automáticamente (como `resource://mathematics-book`) y se puede
editar —, elige un **tipo** y adjunta un archivo o pega texto.

![El panel New Resource con un título, la URI generada automáticamente, el tipo y un PDF subido](/images/resource-math-book.webp)

Una vez procesado, el recurso muestra **Ready**, junto con su tipo, tamaño y URI.
Activa **Cite this resource in replies** para que tu asistente lo cite como fuente
en las respuestas donde lo use.

![El recurso mathematics-book guardado y marcado como Ready, con sus metadatos y el interruptor Cite in replies](/images/resource-math-book-done.webp)

## Rastrear un sitio web

Selecciona **Add website**, escribe una **URL** de inicio (se siguen los enlaces
del mismo origen) y define **Max pages** y **Max depth**. Luego selecciona **Start
crawl**.

![El panel Add Website con los campos de URL, título, descripción, máximo de páginas y profundidad](/images/resource-webpage.webp)

Cuando termina el rastreo, las páginas del sitio quedan indexadas y consultables —
marcadas **Ready** como cualquier otro recurso.

![El recurso del sitio web rastreado marcado como Ready, con su origen, URI y descripción](/images/resource-website-done.webp)

Sigue con: déjala actuar con [herramientas](/es/docs/getting-started/tools).
