---
title: Notion
description: Conecta el servidor MCP remoto oficial de Notion para buscar, leer y actualizar páginas y bases de datos.
order: 48
updated: 2026-07-07
---

**Notion** no es un conjunto de herramientas que construyamos nosotros — es el
**servidor MCP remoto oficial** de Notion, que conectas a través de Ganju. Cuando lo
agregas, Ganju se enlaza con el servidor alojado de Notion y expone a tu asistente
las herramientas que *ese* servidor provee, bajo un prefijo de Notion. Siempre
obtienes el conjunto de herramientas propio y actualizado de Notion — buscar, leer y
actualizar páginas y bases de datos — mantenido por Notion, no reimplementado por
nosotros.

## Cómo funciona

En **Tools → MCP Servers**, agrega **Notion** desde el catálogo curado. Ganju se
conecta al servidor de Notion (`https://mcp.notion.com/mcp`) por el transporte
streamable-HTTP, descubre las herramientas que ofrece y registra cada una para tu
asistente. El modelo las llama como a cualquier otra herramienta, y Ganju enruta
cada llamada al servidor de Notion.

## Conéctalo

El servidor de Notion se autentica con **OAuth**. Cuando lo agregas, te envía a
Notion para iniciar sesión y otorgar acceso al espacio de trabajo y a las páginas
que elijas; Ganju guarda la credencial resultante de forma segura y la renueva
automáticamente.

## Herramientas disponibles

Las herramientas exactas vienen del servidor de Notion y pueden cambiar a medida que
Notion lo actualiza — normalmente buscar en tu espacio de trabajo y leer o
actualizar páginas y bases de datos. Después de conectarlo, abre el servidor en
Ganju para ver la lista actual y activar las que quieras.

¿Quieres conectar el servidor de otro proveedor? Mira
[GitHub](/es/docs/tools/github), o expón tu propia API con
[Endpoints HTTP](/es/docs/tools/http-endpoints).
