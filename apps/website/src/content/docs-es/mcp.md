---
title: Clientes MCP
description: Copia la URL de MCP de tu proyecto y conéctala a cualquier cliente MCP — Claude, ChatGPT, Cursor o VS Code — para que tu IA trabaje dentro de las herramientas que ya usas.
order: 7
updated: 2026-07-07
---

Cada proyecto de Ganju es un **servidor de Model Context Protocol (MCP)**. Eso
significa que cualquier cliente compatible con MCP — **Claude**, **ChatGPT**,
**Cursor**, **VS Code** y más — puede conectarse y obtener todos tus
[prompts](/es/docs/prompts), [recursos](/es/docs/resources) y
[herramientas](/es/docs/tools). Mientras los [canales](/es/docs/channels) llevan tu
asistente a otras personas, los clientes MCP lo enchufan en tu propio flujo de
trabajo.

## Copia tu URL de MCP

Cada proyecto tiene su propia **URL de MCP**, visible en la parte superior del
**Home** del proyecto. Selecciona el botón de copiar para tomarla — ese único enlace
es todo lo que necesita un cliente.

![El Home del proyecto con la URL de MCP y el botón de copiar resaltados arriba a la derecha](/images/home-mcp.webp)

El Home también grafica **toda la actividad de canales y clientes MCP** junta (un
cliente como `claude-code` aparece justo al lado de tu canal de Telegram).
Recuerda: solo las respuestas de tu asistente cuentan para la facturación — los
mensajes entrantes son gratis.

## Configuración del cliente

Selecciona el lápiz junto a la URL de MCP para abrir **Edit MCP URL**. Además de la
URL copiable, Ganju genera una **configuración de cliente** lista para pegar — el
bloque JSON que aceptan la mayoría de clientes MCP:

![El diálogo Edit MCP URL mostrando el campo de slug, la URL de MCP completa y un fragmento JSON de configuración de cliente](/images/home-mcp-model.webp)

```json
{
  "mcpServers": {
    "my-company": {
      "url": "https://my-company.mcp.ganju.ai"
    }
  }
}
```

## Agrégala a tu cliente

Los pasos cambian un poco entre clientes, así que sigue la documentación de cada
uno — en todos los casos estás pegando la **URL de MCP** de arriba (o el JSON de
configuración):

- **Claude** — Settings → **Connectors** → **Add custom connector**, y pega tu URL
  de MCP. Mira la [guía de conectores personalizados de Claude](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
- **ChatGPT** — activa el **Developer mode**, luego Settings → **Connectors** →
  **Advanced**, y agrega la URL de tu servidor. Mira
  [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt).
- **Cursor** — Settings → **Tools & MCP** → **New MCP Server**, o pon el JSON en
  `.cursor/mcp.json`. Mira la [documentación de MCP de Cursor](https://cursor.com/docs/mcp).
- **VS Code** — paleta de comandos → **MCP: Add Server**, o edita
  `.vscode/mcp.json`. Mira
  [Add MCP servers in VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers).

Una vez conectado, pídele al cliente que use tus herramientas o busque en tus
recursos — todo pasa por tu proyecto de Ganju de forma segura.

## URL personalizada en Pro

Por defecto tu URL de MCP es una dirección única generada automáticamente. En el
plan **Pro** puedes definir tu propio **slug** en el diálogo Edit MCP URL, y
convertirla en una dirección limpia y con tu marca, como:

```
https://my-company.mcp.ganju.ai
```

Cámbiala cuando quieras — solo reconecta tus clientes con la nueva URL. Mira
[Configuración → Facturación y plan](/es/docs/settings#facturación-y-plan) para ver
qué incluye Pro.
