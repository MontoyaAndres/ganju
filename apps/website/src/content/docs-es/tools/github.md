---
title: GitHub
description: Conecta el servidor MCP remoto oficial de GitHub para darle a tu asistente repositorios, issues y pull requests.
order: 47
updated: 2026-11-13
---

**GitHub** no es un conjunto de herramientas que construimos nosotros: es el
**servidor MCP remoto oficial** de GitHub, conectado a través de Ganju. Ganju se
enlaza con el servidor alojado de GitHub, lista las herramientas que ofrece *él*
y le expone a tu asistente las que elijas. Recibes el conjunto propio y al día
de GitHub (repositorios, issues, pull requests y más), mantenido por GitHub y no
reimplementado por nosotros.

## Cómo funciona

La tarjeta **GitHub** está en **Acciones → Catálogo** junto a las demás
integraciones, marcada *Servidor MCP remoto · conéctalo para activar sus
herramientas* hasta que lo conectes. Ganju habla con el servidor de GitHub
(`https://api.githubcopilot.com/mcp/`) por streamable HTTP. Cada herramienta que
permitas se registra en tu servidor MCP como `github__<herramienta>` (por
ejemplo `github__search_repositories`); cuando el asistente llama una, Ganju
reenvía la llamada a GitHub con tu token y devuelve el resultado.

## Conéctalo

El servidor de GitHub se autentica con un **token de acceso personal** (PAT).

1. En GitHub, ve a **Settings → Developer settings → Personal access tokens** y
   crea un token. Dale acceso solo a los repositorios y permisos que quieras que
   tenga el asistente. El token es el techo de lo que puede hacer.
2. En Ganju, abre **Acciones → Catálogo** y elige la tarjeta **GitHub**.
3. Pega el token en **Token de GitHub** y elige **Conectar y listar
   herramientas**. Si GitHub lo rechaza, verás *No pudimos listar las
   herramientas con este token.*
4. Elige las herramientas (mira abajo) y luego **Conectar GitHub** para guardar.

El token se guarda cifrado y no vuelve a mostrarse.

## Elige las herramientas

Después de listar, el diálogo muestra **Herramientas (x/y)** con cada
herramienta que ofrece el servidor de GitHub, cada una con su casilla, más
**Todas** y **Ninguna**. Cada herramienta que permitas cuenta como una contra tu
[límite de herramientas](/es/docs/tools/catalog/#el-presupuesto-de-herramientas),
y el diálogo te dice cuántas más puedes encender. El servidor de GitHub ofrece
muchas; elige las pocas que tu asistente necesita.

Debajo de la lista:

- **Confiar en las marcas de solo lectura de este servidor**: las herramientas
  que el propio GitHub marca como de solo lectura no piden confirmación. Un
  servidor podría marcar mal una herramienta, así que actívalo solo con
  servidores en los que confías.
- **Solo lee** (*consulta, no cambia nada*): marca tú mismo las herramientas,
  para que se ejecuten sin pedir confirmación, incluso después de que el
  asistente haya leído contenido externo. Todas las demás se tratan como
  acciones sensibles.
- **Recursos y prompts (opcional)**: si el servidor ofrece recursos o prompts,
  están apagados por defecto; solo se exponen los que actives aquí.

![El diálogo de herramientas de GitHub: el total, confiar en las etiquetas de solo lectura, cada herramienta con "Solo lee", Expuesta, Desconectar y Guardar](/images/tools-mcp-github-tools.webp)

## Cambiar, apagar, desconectar

Abre de nuevo la tarjeta de GitHub para cambiar qué herramientas se permiten y
luego **Guardar**. El interruptor **Expuestas** de abajo apaga todo el servidor
sin perder la configuración (*Se conservan, pero no están en tu servidor MCP*);
**Desconectar** lo quita junto con su token.

## Herramientas disponibles

Las herramientas vienen del servidor de GitHub y pueden cambiar cuando GitHub lo
actualiza. Normalmente cubren repositorios, archivos, issues, pull requests y
flujos relacionados. El diálogo siempre muestra la lista actual. Las respuestas
se recortan de tamaño antes de llegar al modelo, y los resultados del servidor
se tratan como contenido externo.

## Solución de problemas

- **"No pudimos listar las herramientas con este token."** El token está mal,
  venció o no tiene acceso. Crea uno nuevo y conecta de nuevo.
- **Una herramienta falla por permisos.** El token no cubre ese repositorio o
  permiso; amplíalo en GitHub.
- **"Could not reach the remote MCP server".** El servidor de GitHub no
  respondió; inténtalo más tarde.

¿Quieres el servidor de otro proveedor? Mira [Notion](/es/docs/tools/notion/), o
expón tu propia API con [Endpoints HTTP](/es/docs/tools/http-endpoints/).
