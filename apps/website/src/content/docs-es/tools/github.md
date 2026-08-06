---
title: GitHub
description: Conecta el servidor MCP remoto oficial de GitHub para darle a tu asistente repositorios, issues y pull requests.
order: 47
updated: 2026-07-07
---

**GitHub** no es un conjunto de herramientas que construyamos nosotros — es el
**servidor MCP remoto oficial** de GitHub, que conectas a través de Ganju. Cuando lo
agregas, Ganju se enlaza con el servidor alojado de GitHub y expone a tu asistente
las herramientas que *ese* servidor provee, bajo un prefijo de GitHub. Siempre
obtienes el conjunto de herramientas propio y actualizado de GitHub — repos, issues,
pull requests y más — mantenido por GitHub, no reimplementado por nosotros.

## Cómo funciona

En **Tools → MCP Servers**, agrega **GitHub** desde el catálogo curado. Ganju se
conecta al servidor de GitHub (`https://api.githubcopilot.com/mcp/`) por el
transporte streamable-HTTP, descubre las herramientas que ofrece y registra cada una
para tu asistente. El modelo puede entonces llamarlas como a cualquier otra
herramienta — Ganju enruta cada llamada al servidor de GitHub y devuelve el
resultado.

## Conéctalo

El servidor de GitHub se autentica con un **token de acceso personal (PAT)** enviado
como bearer token. Crea un PAT en la configuración de tu cuenta de GitHub (con el
alcance que quieras que tenga el asistente) y pégalo al agregar el servidor. Se
guarda de forma segura y se usa en cada llamada a GitHub.

## Herramientas disponibles

Las herramientas exactas vienen del servidor de GitHub y pueden cambiar a medida que
GitHub lo actualiza — normalmente cubren repositorios, issues, pull requests y
flujos de trabajo relacionados. Después de conectarlo, abre el servidor en Ganju
para ver la lista actual y activar las que quieras.

¿Quieres conectar el servidor de otro proveedor? Mira
[Notion](/es/docs/tools/notion), o expón tu propia API con
[Endpoints HTTP](/es/docs/tools/http-endpoints).
