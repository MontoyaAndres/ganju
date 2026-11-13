---
title: Recursos
description: "Agrega los archivos y el conocimiento que tu IA puede consultar: desde unidades en la nube, el rastreo de un sitio web o subidas directas."
order: 5
updated: 2026-11-13
minutes: 5
outcome: "Tus archivos, carpetas de Drive o sitio web listos para que el bot los consulte, marcados como **Listo**."
---

Los **recursos** son los documentos y el conocimiento que tu asistente puede
consultar, para que responda con tu contenido en lugar de adivinar. Agrégalos
desde Google Drive, OneDrive, el rastreo de un sitio web o subiendo archivos
directamente. Cada uno recibe una URI y, una vez procesado, queda marcado como
**Listo**.

> **¿Quieres el panorama completo?** Esta es la versión rápida. La guía completa
> de **[Recursos](/es/docs/resources/)** cubre las importaciones de Google Drive y
> OneDrive, el rastreo de sitios web, las subidas, las citas y la
> sincronización.

## De dónde vienen los recursos

Abre **Conocimiento** en la barra lateral; se abre en la pestaña **Recursos**.
Todo está agrupado por origen: **Google Drive**, **OneDrive**, **Sitios web**,
**Mi carpeta** (tus propias subidas) y **Datos adjuntos** (archivos subidos desde
una fila de la página [Datos](/es/docs/data/)). Los botones de arriba agregan a
cada uno: **Agregar desde Google Drive**, **Agregar desde OneDrive**, **Agregar
sitio web** y, dentro de una carpeta, **Agregar archivos**.

![Conocimiento, pestaña Recursos: Google Drive, OneDrive, Sitios web y Mi carpeta, cada uno con su botón para agregar](/images/knowledge-resources.webp)

## Importa desde Google Drive u OneDrive

Elige **Agregar desde Google Drive**. La primera vez conectas tu cuenta de
Google; después se abre el selector. Recorre **Mi unidad**, **Compartido
conmigo**, **Unidades compartidas** o **Destacados**, marca los archivos o
carpetas que quieras y selecciona **Agregar lo seleccionado**.

![El selector Importar desde Google Drive con pestañas para Mi unidad, Compartido conmigo, Unidades compartidas y Destacados](/images/resource-google-drive.webp)

**OneDrive** funciona igual: recorre **Mis archivos**, **Compartido conmigo**,
**Recientes** o **Unidades**, y agrega tu selección.

![El selector Importar desde OneDrive con pestañas para Mis archivos, Compartido conmigo, Recientes y Unidades](/images/resource-onedrive.webp)

## Sube un archivo

Abre **Mi carpeta** y selecciona **Agregar archivos**. En el panel **Nuevo
recurso**:

1. Ponle un **Título**. Su **URI** se genera a partir del título (como
   `resource://mathematics-book`); edítala si quieres.
2. Elige un **Tipo**: **Estático** (contenido fijo) o **Plantilla** (dinámico,
   con variables).
3. En **Origen del contenido**, elige **Archivo** y adjunta uno, o **Texto** y
   pégalo.

![El panel Nuevo recurso con un título, la URI generada automáticamente, el tipo y un PDF subido](/images/resource-math-book.webp)

Una vez procesado, el recurso muestra **Listo**, con su tipo, tamaño y URI.
Activa **Citar este recurso en las respuestas** para que tu asistente lo cite
como fuente en las respuestas que lo usen.

![El detalle de un recurso: Listo, fuente, tipo, tamaño, URI y el interruptor para citarlo en las respuestas](/images/resource-details.webp)

## Rastrea un sitio web

Selecciona **Agregar sitio web**, escribe una **URL** de inicio (se siguen los
enlaces del mismo origen), un **Título** y una **Descripción** opcionales, y
define el **Máximo de páginas** y la **Profundidad máxima**. Luego selecciona
**Iniciar rastreo**.

![El panel Agregar sitio web con los campos URL, título, descripción, máximo de páginas y profundidad](/images/resource-webpage.webp)

Cuando termina el rastreo, las páginas del sitio quedan indexadas y se pueden
consultar. Aparecen como **Listo**, igual que cualquier otro recurso.

## Mantén las fuentes al día

Las fuentes de Drive, OneDrive y sitios web se pueden actualizar. Abre la fuente
y selecciona **Sincronizar ahora**. Solo se vuelve a indexar el contenido nuevo
o modificado, y lo que se eliminó en el origen también se elimina aquí. En
**Pro** y **Enterprise** también puedes activar **Sincronizar automáticamente** y
elegir **Cada día** o **Cada semana**; en Free, sincroniza a mano.

## Límites

| | Free | Pro / Enterprise |
| --- | --- | --- |
| Contenido consultable (indexado) | 5 MB | 1 GB incluido, luego 2 USD/GB en Pro |
| Almacenamiento de archivos | 30 MB | Ilimitado |
| Sincronización automática | No disponible | Cada día o cada semana |
