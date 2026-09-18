---
title: Skill para agentes
description: Instala el skill ganju-cli para que Claude Code y otros agentes de programación escriban, prueben, desplieguen y depuren tus funciones de Ganju con el CLI, y sepan qué pasos dejarte a ti.
order: 39
updated: 2026-09-18
---

El **skill ganju-cli** le enseña a un agente de programación con IA, como
Claude Code, a construir [funciones](/es/docs/tools/functions/) con la
[CLI `ganju`](/es/docs/tools/cli/). Con el skill instalado puedes decir
*"agrega una herramienta que busque un pedido en nuestra tienda de Shopify"* y
el agente escribe la entrada en `ganju.json` y el handler, lo compila, lo
prueba y te dice exactamente qué te falta hacer a ti.

Un skill es una carpeta de instrucciones que el agente carga solo cuando hace
falta, así que no cuesta nada en las conversaciones que no tratan de Ganju.
Sigue el formato abierto
[Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview).

## Instálalo

**Para ti, en todos tus proyectos (Claude Code):**

```bash
git clone --depth 1 https://github.com/MontoyaAndres/ganju.git /tmp/ganju
mkdir -p ~/.claude/skills
cp -r /tmp/ganju/skills/ganju-cli ~/.claude/skills/
```

**Para tu equipo, en un repositorio:** copia la carpeta a
`.claude/skills/ganju-cli` dentro del repositorio de tus herramientas y haz
commit. Cualquiera que abra ese repositorio con Claude Code lo tendrá.

**En las apps de Claude:** comprime la carpeta `ganju-cli` en un zip y súbela
como skill personalizado en la configuración de Claude.

Para actualizarlo, vuelve a copiar la carpeta. El skill es Markdown plano, así
que puedes leer exactamente qué le dice al agente en
[`skills/ganju-cli`](https://github.com/MontoyaAndres/ganju/tree/main/skills/ganju-cli).

## Cuándo se usa

El agente carga el skill por su cuenta cuando la conversación trata de
herramientas de Ganju, por ejemplo:

- la carpeta tiene un `ganju.json`, o el código importa `@ganju/sdk`;
- mencionas un comando `ganju`: `deploy`, `test`, `logs`, `secret`, …;
- pides agregar una herramienta a tu asistente, bot o servidor MCP de Ganju;
- preguntas por qué falló una llamada a una herramienta de Ganju.

## Qué enseña

| Área | Qué aprende el agente |
| --- | --- |
| **El flujo** | `init` → `link` → `build` → `test` → `deploy` → `logs`, y cuándo es seguro ejecutar cada uno |
| **`ganju.json`** | La declaración de herramientas, el subconjunto de JSON Schema soportado, los nombres reservados, `connections`, `allowedHosts`, `timeoutMs` y `resourceAccess` |
| **Handlers** | `defineTool`, el runtime de Workers (sin APIs de Node) y mensajes de error con los que el modelo pueda actuar |
| **`ctx`** | `secret`, `connection`, `resources`, `sendFile` y `log`: firmas, límites y trampas |
| **Depuración** | Leer `ganju test` y `ganju logs`, probar la versión en vivo y hacer rollback |
| **CI** | Tokens con alcance de proyecto y un paso de despliegue en GitHub Actions |
| **Solución de problemas** | Los mensajes de error comunes, qué los causa y cómo arreglarlos |

También le indica al agente dónde están los [ejemplos](/es/docs/tools/examples/),
así que una herramienta nueva suele empezar como copia del más parecido.

## Qué te deja a ti

Algunos pasos necesitan a una persona, y el skill le dice al agente cuáles en
vez de dejarlo adivinar:

- **Iniciar sesión.** `ganju login` abre tu navegador, así que el agente te
  pide que lo ejecutes. En Claude Code, escribe `! ganju login` en el prompt.
- **Los valores de los secretos.** El agente escribe la llamada
  `ctx.secret('NAME')` y te da el comando `ganju secret set`. Tú escribes el
  valor, que nunca pasa por la conversación ni por el historial de tu shell.
- **Conectar cuentas.** Gmail, Google Calendar, Slack y las demás se conectan
  en la página **Tools** de tu proyecto.
- **Tokens de acceso para CI.** `ganju token create` necesita tu inicio de
  sesión en el navegador.
- **Desplegar en un proyecto que la gente usa.** `ganju deploy` cambia lo que
  ve cada cliente y reemplaza todo el conjunto de herramientas personalizadas
  del proyecto por las de la carpeta. Por eso el agente revisa
  `ganju versions` por si algo en vivo desaparecería, y te lo confirma
  primero. `ganju test`
  también es real: una herramienta que envía correos envía uno. El agente te
  lo advierte, y lo apunta a un destino seguro, antes de ejecutarlo.

## Pruébalo

Después de instalarlo, abre Claude Code en una carpeta vacía y pide:

> Hazme una herramienta de Ganju que convierta precios entre monedas usando la
> API de Frankfurter, y déjala lista para desplegar.

El agente crea el proyecto, declara `api.frankfurter.dev` en `allowedHosts`,
escribe un handler con esquemas que la plataforma acepta y ejecuta
`ganju build` para verificarlo. Luego te pide que ejecutes `ganju login` y te
da los comandos `link`, `test` y `deploy` para terminar.

## Siguiente

- **[`ganju` CLI](/es/docs/tools/cli/)**: todos los comandos que usa el
  skill.
- **[Ejemplos](/es/docs/tools/examples/)**: cinco proyectos desde los que puede
  empezar el agente.
- **[Funciones](/es/docs/tools/functions/)**: el mismo trabajo en el panel.
