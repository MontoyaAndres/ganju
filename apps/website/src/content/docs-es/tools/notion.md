---
title: Notion
description: Conecta el servidor MCP remoto oficial de Notion para buscar, leer y actualizar páginas y bases de datos.
order: 48
updated: 2026-11-13
---

**Notion** no es un conjunto de herramientas que construimos nosotros — es el
**servidor MCP remoto oficial** de Notion, conectado a través de Ganju. Ganju se
enlaza con el servidor alojado de Notion, lista las herramientas que ofrece *él*
y le expone a tu asistente las que elijas. Recibes el conjunto propio y al día
de Notion — buscar, leer y actualizar páginas y bases de datos — mantenido por
Notion, no reimplementado por nosotros.

## Cómo funciona

La tarjeta **Notion** está en **Herramientas → Catálogo** junto a las demás
integraciones, marcada *Servidor MCP remoto · conéctalo para activar sus
herramientas* hasta que lo conectes. Ganju habla con el servidor de Notion
(`https://mcp.notion.com/mcp`) por streamable HTTP. Cada herramienta que
permitas se registra en tu servidor MCP como `notion__<herramienta>`; cuando el
asistente llama una, Ganju reenvía la llamada a Notion y devuelve el resultado.

## Conéctalo

El servidor de Notion te hace iniciar sesión con **OAuth** — no hay token que
copiar.

1. Abre **Herramientas → Catálogo** y elige la tarjeta **Notion**.
2. Elige **Conectar Notion**. Te enviamos a Notion para iniciar sesión y elegir
   el workspace y las páginas a las que puede llegar el asistente.
3. Vuelves a Herramientas con el diálogo de Notion abierto. Elige las
   herramientas (mira abajo) y **Guardar**.

Ganju guarda cifrada la credencial resultante y la renueva por ti. El asistente
solo llega a las páginas que compartiste al iniciar sesión.

![El diálogo Conectar Notion antes de iniciar sesión en Notion](/images/tools-mcp-notion-connect.webp)

## Elige las herramientas

Después de conectar, el diálogo muestra **Herramientas (x/y)** con cada
herramienta que ofrece el servidor de Notion, cada una con su casilla, más
**Todas** y **Ninguna**. Cada herramienta que permitas cuenta como una contra tu
[límite de herramientas](/es/docs/tools/catalog/#el-presupuesto-de-herramientas),
y el diálogo te dice cuántas más puedes encender.

Debajo de la lista:

- **Confiar en las marcas de solo lectura de este servidor** — las herramientas
  que el propio Notion marca como de solo lectura no piden confirmación.
  Actívalo solo con servidores en los que confías.
- **Solo lee — consulta, no cambia nada** — marca tú mismo las herramientas,
  para que se ejecuten sin pedir confirmación, incluso después de que el
  asistente haya leído contenido externo. Todas las demás se tratan como
  acciones sensibles.
- **Recursos y prompts (opcional)** — si el servidor ofrece recursos o prompts,
  están apagados por defecto; solo se exponen los que actives aquí.

El diálogo funciona igual que el de GitHub; mira la captura en
[GitHub](/es/docs/tools/github/#elige-las-herramientas).

## Cambiar, apagar, desconectar

Abre de nuevo la tarjeta de Notion para cambiar qué herramientas se permiten y
luego **Guardar**. El interruptor **Expuestas** de abajo apaga todo el servidor
sin perder la configuración; **Desconectar** lo quita junto con su inicio de
sesión.

## Herramientas disponibles

Las herramientas vienen del servidor de Notion y pueden cambiar cuando Notion lo
actualiza — normalmente buscar en tu workspace y leer, crear o actualizar
páginas y bases de datos. El diálogo siempre muestra la lista actual. Las
respuestas se recortan de tamaño antes de llegar al modelo, y los resultados del
servidor se tratan como contenido externo.

## Solución de problemas

- **"No pudimos iniciar la conexión con Notion."** Inténtalo de nuevo; si
  persiste, no se pudo llegar a la página de inicio de sesión.
- **No encuentra una página.** No la compartiste al iniciar sesión. Desconecta y
  conecta de nuevo, eligiendo esa página.
- **Una llamada dice que la credencial necesita volver a autorizarse.** Abre la
  tarjeta de Notion en Herramientas y conecta de nuevo.

¿Quieres el servidor de otro proveedor? Mira [GitHub](/es/docs/tools/github/), o
expón tu propia API con [Endpoints HTTP](/es/docs/tools/http-endpoints/).
