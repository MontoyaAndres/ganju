---
title: Búsqueda web
description: Busca en la web en vivo y lee el contenido completo de las páginas, con tecnología de Tavily.
order: 46
updated: 2026-11-13
---

La integración de **Búsqueda web** le da a tu asistente acceso a la web en vivo,
con tecnología de **Tavily**, para que responda con datos actuales y cite
fuentes cuando la respuesta no está en tus recursos. Ofrece **2 herramientas**.

## Conéctala

Búsqueda web usa tu propia **API key de Tavily**; las búsquedas se cobran a tu
cuenta de Tavily.

1. Crea una cuenta en Tavily y copia una API key desde su panel.
2. En Ganju, abre **Acciones → Catálogo**, elige la tarjeta **Búsqueda web**
   y luego **Agregar API key de Búsqueda web**.
3. Pega la llave y **Guardar**. Hacemos una búsqueda mínima de prueba con ella
   antes de guardarla; se guarda cifrada y no vuelve a mostrarse.
4. Enciende **Búsqueda web** y, si quieres, **Extraer página web**.

Para cambiar la llave después, usa **Actualizar API key**; **Desconectar** la
quita.

![El diálogo de la clave de API de una integración, con Cancelar y Guardar](/images/tools-api-key-dialog.webp)

## Herramientas

Los nombres entre paréntesis son los que muestran los clientes MCP y los
registros.

- **Búsqueda web** (`web-search`): busca una `query` en la web y devuelve los
  mejores resultados (título, URL y un fragmento), más una respuesta
  sintetizada cuando la hay. Opciones:
  - `maxResults`: de 1 a 20, 5 por defecto.
  - `searchDepth`: `basic` (por defecto) o `advanced`, que busca más a fondo
    pero es más lento y gasta más créditos de Tavily.
  - `topic`: `general` (por defecto) o `news`, con `days` para quedarse solo
    con los últimos N días.
  - `includeDomains` / `excludeDomains`: limita los resultados a ciertos
    sitios, o los excluye.

  El asistente tiene instrucciones de citar las URLs en las que se apoya.
- **Extraer página web** (`web-extract`): trae el texto completo y limpio de
  una o más páginas (`urls`). `extractDepth` es `basic` (por defecto) o
  `advanced`, que también saca tablas y datos incrustados, a mayor costo. Úsala
  después de una búsqueda, o cuando la persona comparte un enlace, para leer la
  página completa y no solo el fragmento. Las páginas que no se pueden traer se
  reportan aparte.

El flujo típico es **Búsqueda web** para encontrar fuentes → **Extraer página
web** para leer completas las más relevantes. Las dos solo leen, así que
ninguna se detiene por
[Confirmar acciones sensibles](/es/docs/settings/#confirmar-acciones-sensibles).

## Solución de problemas

- **"Invalid Tavily API key (or Tavily could not be reached)".** La llave se
  rechazó al guardarla. Cópiala de nuevo desde Tavily.
- **"Web search is not connected".** La llave se quitó. Agrégala de nuevo desde
  la tarjeta.
- **Las búsquedas empiezan a fallar después de funcionar.** Revisa los créditos
  de tu plan de Tavily.
- **El asistente responde desde la web en lugar de tus documentos.** Revisa que
  tus [recursos](/es/docs/resources/) cubran el tema; el asistente los busca
  primero, y puedes orientarlo en las instrucciones del bot.

La API key solo la usan estas herramientas; las
[funciones](/es/docs/tools/functions/) no pueden tomarla prestada. Para una
consulta más acotada contra un sitio que controlas, un
[endpoint HTTP](/es/docs/tools/http-endpoints/) puede encajar mejor.
