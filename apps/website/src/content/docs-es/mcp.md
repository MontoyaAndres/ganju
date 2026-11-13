---
title: Clientes MCP
description: Copia la URL de MCP de tu proyecto y conéctala a cualquier cliente MCP — Claude, ChatGPT, Cursor o VS Code — para que tu IA trabaje dentro de las herramientas que ya usas.
order: 7
updated: 2026-11-13
---

Cada proyecto de Ganju es un **servidor de Model Context Protocol (MCP)**. Eso
significa que cualquier cliente compatible con MCP — **Claude**, **ChatGPT**,
**Cursor**, **VS Code** y más — puede conectarse a él y obtener los
[prompts](/es/docs/prompts/), [recursos](/es/docs/resources/),
[herramientas](/es/docs/tools/) y [datos](/es/docs/data/) de tu proyecto. Así
como los [canales](/es/docs/channels/) llevan tu asistente a otras personas, los
clientes MCP lo integran a tu propio flujo de trabajo.

## Copia tu URL de MCP

Cada proyecto tiene su propia **URL de MCP**, arriba a la derecha del **Inicio**
del proyecto. Haz clic en ella (**Haz clic para copiar**) para copiarla — ese
único enlace es todo lo que necesita un cliente. Se ve así:

```
https://mcp.ganju.ai/el-slug-de-tu-proyecto
```

![El Inicio del proyecto con la URL MCP arriba a la derecha y sus botones de copiar y editar](/images/project-home.webp)

## Cambia la URL

Selecciona el lápiz junto a la URL de MCP para abrir **Editar la URL de MCP**.
Cambia el **Slug** — la última parte de la dirección — y la **Vista previa**
actualiza la **URL de MCP** completa y una **Configuración del cliente** lista
para pegar, el bloque JSON que acepta la mayoría de los clientes MCP. Selecciona
**Guardar** para aplicarla.

![El diálogo para editar la URL MCP: el slug, la URL MCP completa y el JSON para el cliente](/images/home-mcp-edit.webp)

```json
{
  "mcpServers": {
    "mi-empresa": {
      "url": "https://mcp.ganju.ai/mi-empresa"
    }
  }
}
```

Un slug tiene de 3 a 63 letras minúsculas, dígitos o guiones, y empieza y termina
con una letra o un dígito. Algunos slugs están reservados, y cada uno solo puede
usarlo un proyecto. Los proyectos nuevos reciben un slug único generado; puedes
poner el tuyo en cualquier plan.

> Cambiar el slug cambia la dirección. Los clientes conectados a la URL anterior
> dejan de llegar al proyecto — vuelve a conectarlos con la nueva.

## Agrégala a tu cliente

Los pasos cambian un poco según el cliente, así que sigue la documentación de
cada uno — en todos los casos pegas la **URL de MCP** (o el JSON de
configuración):

- **Claude** — Settings → **Connectors** → **Add custom connector**, y pega tu
  URL de MCP. Mira la
  [guía de conectores personalizados de Claude](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
- **Claude Code** — agrégala desde una terminal:

  ```bash
  claude mcp add --transport http mi-empresa https://mcp.ganju.ai/mi-empresa
  ```

- **ChatGPT** — activa el **Developer mode**, luego Settings → **Connectors** →
  **Advanced**, y agrega la URL de tu servidor. Mira
  [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt).
- **Cursor** — Settings → **Tools & MCP** → **New MCP Server**, o pon el JSON en
  `.cursor/mcp.json`. Mira la [documentación de MCP de Cursor](https://cursor.com/docs/mcp).
- **VS Code** — Command Palette → **MCP: Add Server**, o edita
  `.vscode/mcp.json`. Mira
  [Add MCP servers in VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers).

## Inicia sesión desde el cliente

La primera vez que un cliente se conecta, abre un inicio de sesión de Ganju en tu
navegador. Entra con tu cuenta de Ganju y aprueba la conexión. Desde ahí, el
cliente actúa como tú:

- **Solo los miembros del proyecto pueden conectarse.** Una cuenta que no es
  miembro del proyecto se rechaza, aunque esté en la organización. Agrega
  personas en [Configuración → Proyectos → Miembros](/es/docs/settings/#proyectos).
- El cliente ve los prompts y los recursos del proyecto, y las herramientas
  activadas. Con [Datos](/es/docs/data/), una persona que inició sesión trabaja
  sobre todas las tablas, y un miembro de la organización también recibe las
  herramientas de administración de la base de datos.
- Si quitas a alguien del proyecto, su cliente deja de funcionar en la siguiente
  solicitud.

Ya conectado, pídele al cliente que use tus herramientas o busque en tus
recursos — todo pasa por tu proyecto de Ganju de forma segura.

## Aprobar acciones

Hay dos protecciones para las herramientas que envían, cambian o borran algo:

- **Confirmar acciones sensibles** (un ajuste de la organización, desactivado
  por defecto): la primera llamada vuelve como *todavía no ejecutada*, el
  asistente te pregunta en su chat y la ejecuta en una segunda llamada. Mira
  [Configuración → Confirmar acciones sensibles](/es/docs/settings/#confirmar-acciones-sensibles).
- **Después de contenido externo** (siempre activa): cuando la sesión ya leyó
  contenido externo — un correo, una página web, la respuesta de otro servidor —
  ese contenido pudo escribirse para manipular al asistente. Entonces una acción
  sensible necesita tu propio sí, fuera del chat. El asistente te da un enlace a
  una página del panel, **Un asistente quiere hacer una acción**, que muestra la
  acción y **Con estos datos**. Selecciona **Aprobar** o **Rechazar** y luego
  díselo al asistente. Una aprobación se ejecuta una sola vez, exactamente con
  esos datos, y las solicitudes vencen 10 minutos después de que el asistente las
  hace. Solo puede responder la persona que inició sesión en la conexión de ese
  cliente.

Las herramientas de solo lectura — buscar, listar, leer — se ejecutan de
inmediato en ambos casos.

## Seguimiento y facturación

**Inicio** grafica toda la actividad de canales y clientes MCP junta (un cliente
como `claude-code` aparece justo al lado de tu canal de Telegram), y la
[Salud de las herramientas](/es/docs/analytics/#salud-de-las-herramientas) lista
cada llamada que hizo un cliente.

Un cliente MCP usa su propio modelo, así que sus conversaciones no son
**respuestas del asistente** — no consumen tu cupo de respuestas. Las llamadas a
[funciones](/es/docs/tools/functions/) que escribiste sí cuentan como **llamadas a
tus funciones**, igual que desde un canal. Mira
[Configuración → Facturación y plan](/es/docs/settings/#facturación-y-plan).

## Solución de problemas

- **"No tienes acceso".** La cuenta con la que entraste no es miembro de este
  proyecto. Entra con otra cuenta, o pídele a alguien del proyecto que te
  agregue.
- **El cliente no se conecta después de cambiar el slug.** Sigue usando la URL
  anterior. Quita el servidor del cliente y agrega el nuevo.
- **Falta una herramienta en el cliente.** Está apagada en la página
  **Herramientas**, o el cliente guardó una lista anterior — reconéctalo o
  reinícialo.
- **Una acción dice que necesita aprobación y no hay enlace.** La conexión no
  tiene un usuario que haya iniciado sesión (por ejemplo, un token de máquina),
  así que no hay a quién preguntarle; esas llamadas no se ejecutan después de
  contenido externo.
