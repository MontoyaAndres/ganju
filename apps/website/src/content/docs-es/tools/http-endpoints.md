---
title: Endpoints HTTP
description: Expón tus propias APIs HTTP al asistente como herramientas con nombre — sin necesidad de una integración.
order: 49
updated: 2026-07-07
---

Los **endpoints HTTP** te permiten convertir tus propias APIs en herramientas. En
lugar de esperar a que exista una integración de fábrica, describes una petición
HTTP una vez y se vuelve una herramienta con nombre que el asistente puede llamar —
perfecto para servicios internos, webhooks o cualquier API de terceros con interfaz
HTTP.

## Cómo funciona

Cada endpoint que agregas se registra como su propia herramienta. Tú defines:

- el **método y la URL** a llamar (con marcadores que el modelo completa al momento
  de la llamada);
- los **encabezados** que hagan falta — incluida la autenticación, como una llave de
  API o un bearer token, guardada de forma segura;
- las **entradas** que acepta la herramienta, que se vuelven los argumentos que
  provee el modelo;
- cómo se arma el cuerpo de la petición a partir de esas entradas.

Cuando el modelo llama a la herramienta, Ganju hace la petición HTTP por ti y
devuelve la respuesta para que el modelo la use. Las peticiones se filtran contra
SSRF (no se pueden apuntar a direcciones internas) y tienen límite de tasa para
proteger tus servicios.

## Cuándo usarlos

Recurre a un endpoint HTTP cuando quieras que el asistente llame a una API que no
traemos como integración de primera clase — tu propio backend, un CRM, una consulta
interna o la API de un socio. Para un proveedor que publica un servidor MCP remoto
oficial, es mejor conectar ese (mira [GitHub](/es/docs/tools/github) y
[Notion](/es/docs/tools/notion)), porque trae todo un conjunto de herramientas
mantenido en lugar de una sola petición.
