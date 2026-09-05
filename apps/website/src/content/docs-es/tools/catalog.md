---
title: Catálogo
description: Las integraciones que traemos — conecta una cuenta una vez, enciende las herramientas que quieras y apágalas de nuevo sin perder la configuración.
order: 39
updated: 2026-09-05
---

El **catálogo** es todo lo que traemos y mantenemos: Gmail, Outlook, Slack,
calendarios, búsqueda web y los servidores MCP remotos de los propios
proveedores. Si tu caso está cubierto aquí, no deberías tener que escribir código
para él — conectas una cuenta una vez y enciendes las herramientas que quieras.

## La cuadrícula

Cada integración es una tarjeta que muestra qué hace y cuántas de sus
herramientas tienes activas (`0/18`, `5/5`). La búsqueda filtra la cuadrícula;
abrir una tarjeta muestra cada herramienta del grupo con su propio interruptor.

Tres tarjetas no son integraciones en realidad:

- **Integradas** — las cinco herramientas de recursos y prompts que trae todo
  proyecto, activas desde el primer día. No requieren conexión. Mira
  [Integradas](/es/docs/tools/built-in).
- **Saludo** — una herramienta única de prueba, para confirmar que un servidor
  nuevo está vivo.
- **Servidores MCP remotos** — GitHub y Notion publican sus propios servidores MCP,
  y conectar uno trae todo su conjunto mantenido en lugar de una sola petición.

## Conecta una vez, activa por herramienta

La mayoría de las integraciones necesitan una conexión única. Elige **Connect**,
autoriza con OAuth o pega una llave de API, y la credencial se guarda cifrada y se
renueva por ti. **Una conexión sirve a todo el grupo** — conecta Gmail una vez y
sus 18 herramientas pueden usarla.

Después activa las herramientas que de verdad quieres. Esto es por herramienta y
no por cuenta a propósito, y vale la pena saber por qué: el esquema de cada
herramienta activa se le reenvía al modelo en **cada** llamada, así que la
cantidad de herramientas es un costo directo. Lo medimos con nuestro propio
tráfico — un asistente con 5 herramientas promedia ~1.100 tokens de entrada por
turno, y uno con 12 promedia ~13.100. Una lista más corta es un asistente más
barato y más certero.

Los canales limitan la lista a 40 por la misma razón. Las herramientas integradas
de recursos siempre se conservan, así que recortar nunca le puede costar a tu
asistente la capacidad de leer tu base de conocimiento.

## Apagar y Eliminar son cosas distintas

Cada fila tiene ambos, porque responden preguntas distintas:

| | Qué pasa |
| --- | --- |
| **Apagar** (interruptor) | La herramienta deja de exponerse. Su configuración, su credencial y sus ajustes sobreviven, y deja de contar contra tu cuota de herramientas. Una fila apagada se marca **Off · settings kept**. |
| **Eliminar** (papelera) | La fila se borra, y la configuración se va con ella. |

Apagar una herramienta libera un espacio en el conteo de tu plan, así que en Free
puedes rotar entre más herramientas de las que expones a la vez. Volver a
encender una revisa la cuota de nuevo, que es el único lugar donde puedes cruzar
un límite sin crear nada.

En un **servidor MCP remoto**, el interruptor vive en su diálogo y **Disconnect**
es la eliminación.

## Las conexiones se comparten

Una cuenta conectada es una propiedad del asistente, no de una herramienta. Eso
significa que la misma conexión de Gmail está disponible para:

- todas las herramientas de Gmail del catálogo;
- un [endpoint HTTP](/es/docs/tools/http-endpoints) que use autenticación OAuth,
  en lugar de guardar una segunda copia de la credencial;
- una [función](/es/docs/tools/functions), vía `ctx.connection('google-gmail')` —
  pero solo si listaste el proveedor en los ajustes de esa función. Tu código
  nunca recibe el refresh token, solo un access token de vida corta.

Desconectar una integración afecta a las tres.

## Las integraciones

| | |
| --- | --- |
| **[Integradas](/es/docs/tools/built-in)** | Las cinco herramientas base de recursos y prompts |
| **[Gmail](/es/docs/tools/gmail)** | Enviar, leer, buscar y gestionar correo (18 herramientas) |
| **[Outlook](/es/docs/tools/outlook)** | Correo de Microsoft 365 vía Graph (18 herramientas) |
| **[Slack](/es/docs/tools/slack)** | Publicar mensajes, explorar canales, subir archivos |
| **[Búsqueda en Slack](/es/docs/tools/slack-search)** | Búsqueda de mensajes en todo el workspace |
| **[Google Calendar](/es/docs/tools/google-calendar)** | Crear y gestionar eventos, encontrar huecos libres |
| **[Cal.com](/es/docs/tools/calcom)** | Consultar disponibilidad y agendar o cancelar reuniones |
| **[Búsqueda web](/es/docs/tools/web-search)** | Buscar en la web en vivo y extraer páginas |
| **[GitHub](/es/docs/tools/github)** | El servidor MCP remoto oficial de GitHub |
| **[Notion](/es/docs/tools/notion)** | El servidor MCP remoto oficial de Notion |
| **[Saludo](/es/docs/tools/greeting)** | Una herramienta de demostración para probar un servidor nuevo |

## ¿No está aquí?

Dos salidas de emergencia, en orden de esfuerzo:

- **[Endpoints HTTP](/es/docs/tools/http-endpoints)** — una petición contra una
  API que ya tienes, descrita en un formulario. Disponible en todos los planes.
- **[Funciones](/es/docs/tools/functions)** — tu propio código, cuando necesitas
  lógica y no una sola llamada.
