---
title: Instálalo tú mismo
description: "Ganju es software libre (Apache-2.0). Corre tu propia instancia sobre Cloudflare y Postgres: tus claves, tu infraestructura."
order: 8
updated: 2026-11-13
---

Ganju es **software libre bajo Apache-2.0**, así que puedes correr toda la
plataforma tú mismo en lugar de usar la versión alojada. Instalarlo tú significa
tus propias claves de modelo, control total de tus datos y planes que asignas tú.
Solo pones la infraestructura.

Esta página es un resumen; el repositorio tiene la guía oficial y siempre al
día:
[README](https://github.com/MontoyaAndres/ganju#readme),
[DEVELOPMENT.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/DEVELOPMENT.md)
y [DEPLOYMENT.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/DEPLOYMENT.md).

## Sobre qué corre

Ganju corre casi por completo sobre la plataforma de desarrollo de
**Cloudflare**, con **Postgres + [pgvector](https://github.com/pgvector/pgvector)**
para el almacenamiento y la búsqueda. Es un monorepo de npm workspaces +
[Turborepo](https://turbo.build/):

| App | Entorno | Responsabilidad |
|---|---|---|
| `apps/api` | Cloudflare Worker | Plano de control: autenticación, CRUD, OAuth, webhooks de canales, colas, crons, el Asistente |
| `apps/mcp` | Cloudflare Worker | El servidor MCP que expone cada proyecto |
| `apps/data` | Cloudflare Worker | Las bases de datos de los proyectos (un Durable Object SQLite por base de datos) |
| `apps/tool-broker` | Cloudflare Worker | Lo que llaman las funciones de los clientes para conexiones, secretos y archivos |
| `apps/tool-outbound` | Cloudflare Worker | Filtra cada solicitud saliente que hace la función de un cliente |
| `apps/web` | Next.js (OpenNext → Cloudflare) | El panel |
| `apps/website` | Cloudflare Pages | El sitio de marketing y esta documentación |
| `apps/resource-handler` | Contenedor | El trabajo pesado: extracción de documentos, rastreo, envíos grandes. Se construye y despliega con `apps/api` |

> **Ojo:** necesitas un plan **de pago** de Cloudflare Workers. El contenedor
> `ResourceHandler` lo requiere, y las [Funciones](/es/docs/tools/functions/) se
> despliegan en un dispatch namespace de Workers for Platforms, que es un
> complemento de pago aparte.

## Córrelo primero en local

Necesitas Node.js 20 o más nuevo, npm 11, Docker (para el contenedor
resource-handler), una cuenta de Cloudflare y una base de datos Postgres (15+)
con `pgvector` 0.8 o más nuevo.

```bash
git clone https://github.com/MontoyaAndres/ganju
cd ganju
npm install
cp .env.example .env      # luego completa los valores
npm run migrate-dev       # genera y aplica las migraciones
npm run dev               # arranca todas las apps con Turbo
```

Puertos locales por defecto:

| App | Puerto |
|---|---|
| `apps/api` | 8080 |
| `apps/mcp` | 8081 |
| `apps/resource-handler` | 8082 |
| `apps/tool-broker` | 8083 |
| `apps/tool-outbound` | 8084 |
| `apps/data` | 8085 |
| `apps/web` | 3000 |

`apps/data` tiene que estar corriendo para que las bases de datos de los
proyectos funcionen en local. Las funciones siempre corren en el dispatch
namespace remoto, así que `wrangler dev` tiene que tener la sesión iniciada en la
cuenta de Cloudflare dueña de ese namespace.

El `.env` cubre:

- `DATABASE_URL` y la cadena de conexión local de Hyperdrive.
- Secretos de autenticación y cifrado: `JWT_SECRET`, `CRYPTO_SECRET`
  (exactamente 32 bytes en base64: `openssl rand -base64 32`),
  `MCP_INTERNAL_SECRET`, `CUSTOM_CODE_TOKEN_SECRET`.
- `EMBEDDING_API_KEY`: una clave de Gemini para los embeddings y el modelo por
  defecto.
- `ANTHROPIC_API_KEY`: para el [Asistente](/es/docs/assistant/).
- Los IDs y secretos de cliente OAuth de los proveedores que quieras: Google
  (inicio de sesión, Gmail, Drive, Calendar), GitHub (inicio de sesión),
  Microsoft (Outlook, OneDrive), Slack.
- `BOT_OAUTH_CLIENT_ID` / `BOT_OAUTH_CLIENT_SECRET`: el cliente que usan los
  bots de los canales para vincular cuentas. Crea su fila con
  `npx dotenv -e .env -- node scripts/provision-bot-client.mjs`.
- `CLOUDFLARE_ACCOUNT_ID` y `CUSTOM_CODE_CF_API_TOKEN`: para publicar funciones.
- `EMAIL_FROM` y `ALERT_EMAIL`.
- Solo si quieres cobrar: tus claves de Polar.
- Las URLs `NEXT_PUBLIC_*` de la API, la app web y el servidor MCP.

## Crea los recursos en Cloudflare

Para un despliegue alojado, crea esto en tu cuenta de Cloudflare (los nombres
deben coincidir con el `wrangler.toml` de cada app, o actualiza el toml para que
coincida con los tuyos):

- **Hyperdrive**: apuntando a tu Postgres.
- **Bucket de R2**: `ganju-storage-<env>` (binding `STORAGE_BUCKET`).
- **Namespace de KV**: `<env>-JWKS_CACHE`, vinculado en `apps/mcp`.
- **Colas**: ocho, cada una con su cola de mensajes fallidos: `ganju-index`,
  `ganju-crawl-discover`, `ganju-crawl-page`, `ganju-gdrive-discover`,
  `ganju-gdrive-file`, `ganju-onedrive-discover`, `ganju-onedrive-file`,
  `ganju-data-triggers` (con el sufijo `-<env>`, y una gemela `-dlq-<env>`).
- **Dispatch namespace de Workers for Platforms**: `ganju-tools-<env>`, donde se
  despliegan las funciones de los clientes.
- **Email Service** (`SEND_EMAIL`): da de alta tu dominio de envío en Email
  Service para que el correo llegue a cualquier destinatario. Antes de eso solo
  entrega a los destinos verificados de Email Routing.
- **Containers**: el contenedor `ResourceHandler`, construido desde
  `apps/resource-handler/Dockerfile` durante el despliegue de `apps/api`.
- **Durable Objects**: los crean las migraciones de cada `wrangler.toml`:
  `ResourceHandler`, `DiscordGatewayDO`, `MessageBufferDO` y
  `BuilderConversationDO` en `apps/api`, y `ProjectDatabase` en `apps/data`.
- **Dominios propios**: `api`, `mcp` y `app` en tu zona.

Los archivos `wrangler.toml` del repositorio hacen referencia a los IDs de
recursos y a los dominios (`ganju.ai`) de la cuenta alojada. Reemplázalos con
**tus** IDs y **tu** dominio.

## Configura los secretos

Los `vars` de `wrangler.toml` solo tienen configuración no secreta (las URLs
`NEXT_PUBLIC_*`, `NODE_ENV`, los puertos). Todo lo sensible se define con
`wrangler secret`, por app y por entorno, y solo **después** del primer
despliegue de ese Worker, porque un Worker tiene que existir para guardar un
secreto:

```bash
cd apps/api
wrangler secret put JWT_SECRET --env production
wrangler secret put CRYPTO_SECRET --env production
wrangler secret put MCP_INTERNAL_SECRET --env production
wrangler secret put EMBEDDING_API_KEY --env production
wrangler secret put GOOGLE_CLIENT_SECRET --env production
# …y el resto: mira DEPLOYMENT.md para la lista completa por Worker
```

`apps/api`, `apps/mcp` y `apps/tool-broker` necesitan cada uno su propio
conjunto. `apps/tool-outbound` y `apps/web` no necesitan ninguno. Tres secretos
tienen que ser **idénticos** en los Workers que los comparten:

| Secreto | Lo comparten |
|---|---|
| `CRYPTO_SECRET` | api, mcp, tool-broker |
| `MCP_INTERNAL_SECRET` | api, mcp |
| `CUSTOM_CODE_TOKEN_SECRET` | api, tool-broker |

Elige `CRYPTO_SECRET` una sola vez: cada token de OAuth y clave de API guardados
se cifran con él, así que cambiarlo después los deja todos inservibles.

## Despliega

Cada app Worker trae los entornos `development` y `production`; los scripts de la
raíz se reparten por el workspace con Turbo.

1. Crea los recursos de Cloudflare de arriba.
2. Aplica las migraciones a tu base de datos de destino (el código y el esquema
   van juntos, así que migra primero):
   ```bash
   npm run migrate-prod   # genera y aplica contra .env.prod
   ```
3. **Solo el primer despliegue:** despliega los Workers en orden, porque algunos
   se vinculan entre sí: `apps/tool-outbound` y `apps/data`, luego `apps/api`
   (con su service binding al Worker de MCP comentado temporalmente), luego
   `apps/mcp`, luego `apps/api` de nuevo con el binding restaurado, y después
   `apps/tool-broker`, `apps/web` y `apps/website`. DEPLOYMENT.md tiene los
   detalles.
4. Configura los secretos de cada entorno de Worker, y crea el cliente OAuth de
   los bots contra la misma base de datos.
5. Desde ahí, cada despliegue es:
   ```bash
   npm run migrate-prod   # si cambió el esquema
   npm run deploy-prod    # o deploy-dev para el entorno development
   ```

No hay que precargar el catálogo: el catálogo de herramientas que trae Ganju es
código. Los servidores MCP remotos seleccionados (`mcp_server_catalog`) son las
únicas filas que agregas tú.

Por dentro, cada app ejecuta `wrangler deploy --env <env>` (u
`opennextjs-cloudflare deploy` para el panel). Con `production`, tus apps quedan
en `{api,mcp,app}.<tu-dominio>`; `development` usa el prefijo `development-`.

## Comprueba que funciona

- `https://api.<tu-dominio>/.well-known/oauth-authorization-server` responde.
  Los clientes MCP lo leen para saber cómo iniciar sesión.
- `https://mcp.<tu-dominio>/health` responde.
- Inicia sesión en `https://app.<tu-dominio>`, crea una organización y confirma
  que se ve el catálogo de herramientas.
- Publica una función pequeña (`ganju deploy` con `GANJU_API_URL` apuntando a tu
  API): lo único que prueba a la vez el dispatch namespace, el broker y el
  Worker de salida.

## Planes y facturación en tu instancia

Cobrar es opcional. Sin un token de Polar, el pago y el portal de facturación
están apagados, y cada organización funciona con los límites del plan **Free**
hasta que le asignes un plan. Como operador lo haces en la base de datos,
poniendo en la fila `subscription` de la organización `plan = 'PRO'` (o
`'ENTERPRISE'`) y `status = 'active'`. Para vender planes tú mismo, configura
Polar como se describe en DEPLOYMENT.md.

## Observa y opera

Los Workers tienen la observabilidad activada. Sigue los logs con
`wrangler tail --env <env>`, vigila las colas de mensajes fallidos por si algún
trabajo en segundo plano se atasca, y revisa la tabla `error_log` para ver los
errores entre servicios. En `apps/api` corren dos crons: cada 15 minutos (el
resumen de errores, enviado a `ALERT_EMAIL`) y cada hora (la medición de consumo,
la purga por retención, los trabajos de datos y las alertas). Para el modelo de
datos y la arquitectura, mira
[ARCHITECTURE.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/ARCHITECTURE.md)
y [DATA_MODEL.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/DATA_MODEL.md)
en el repositorio.

¿Prefieres no correr nada de esto? La [versión alojada](https://app.ganju.ai) se
encarga de todo: empieza en el plan Free y
[mejora tu plan](/es/docs/settings/#facturación-y-plan) cuando crezcas.
