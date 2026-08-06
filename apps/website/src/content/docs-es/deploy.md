---
title: Instálalo tú mismo
description: Ganju es software libre (Apache-2.0). Corre tu propia instancia sobre Cloudflare y Postgres — sin límites de plan, con tus llaves y tu infraestructura.
order: 8
updated: 2026-07-07
---

Ganju es **software libre bajo Apache-2.0**, así que puedes correr toda la
plataforma por tu cuenta en lugar de usar la versión alojada. Instalarlo tú mismo
significa sin límites de plan, con tus propias llaves de modelo y control total de
tus datos — solo pones la infraestructura.

Esta página es un resumen; el repositorio tiene el manual autoritativo y siempre
actualizado:
[README](https://github.com/MontoyaAndres/ganju#readme),
[DEVELOPMENT.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/DEVELOPMENT.md)
y [DEPLOYMENT.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/DEPLOYMENT.md).

## Sobre qué corre

Ganju corre casi por completo sobre la plataforma para desarrolladores de
**Cloudflare**, con **Postgres + [pgvector](https://github.com/pgvector/pgvector)**
para almacenamiento y recuperación. Es un monorepo de npm workspaces +
[Turborepo](https://turbo.build/) con cuatro aplicaciones desplegables:

| App | Entorno de ejecución | Responsabilidad |
|---|---|---|
| `apps/api` | Cloudflare Worker | Plano de control — autenticación, CRUD, OAuth, webhooks de canales, colas |
| `apps/mcp` | Cloudflare Worker | El servidor MCP en sí |
| `apps/web` | Next.js (OpenNext → Cloudflare) | El panel |
| `apps/resource-handler` | Contenedor Node | El trabajo pesado — extracción de documentos, rastreo, envíos grandes |

> **Ojo:** el contenedor `ResourceHandler` requiere un plan **de pago** de
> Cloudflare Workers.

## Córrelo primero en local

```bash
git clone https://github.com/MontoyaAndres/ganju
cd ganju
npm install
cp .env.example .env      # luego completa los valores
npm run migrate-dev       # genera y aplica las migraciones de la BD
npm run dev               # arranca todas las apps con Turbo
```

Puertos locales por defecto: API `8080`, MCP `8081`, resource-handler `8082`, web
`3000`. Necesitas Node, npm y una base de datos Postgres con la extensión
`pgvector`. El `.env` cubre las credenciales de la base de datos, los secretos de
autenticación y cifrado, una llave de embeddings de Gemini, los client IDs y
secretos de OAuth de los proveedores que quieras (Google, GitHub, Microsoft, Slack)
y — solo si quieres facturación — tus llaves de Stripe.

## Aprovisiona los recursos de Cloudflare

Para un despliegue alojado, crea estos recursos en tu cuenta de Cloudflare (los
nombres deben coincidir con el `wrangler.toml` de cada app, o actualiza el toml
para que coincida con los tuyos):

- **Hyperdrive** — apuntando a tu Postgres.
- **Bucket de R2** — `ganju-storage-<env>` (binding `STORAGE_BUCKET`).
- **Colas** — siete, cada una con su cola de mensajes fallidos: `ganju-index`,
  `ganju-crawl-discover`, `ganju-crawl-page`, `ganju-gdrive-discover`,
  `ganju-gdrive-file`, `ganju-onedrive-discover`, `ganju-onedrive-file` (con el
  sufijo `-<env>`).
- **Email Service** (`SEND_EMAIL`) — registra tu dominio de envío en Email Service
  para que el correo llegue a cualquier destinatario; antes de eso solo entrega a
  destinos verificados de Email Routing.
- **Contenedores** — el contenedor `ResourceHandler` (construido desde
  `apps/resource-handler/Dockerfile`), en un plan de pago.
- **Durable Objects** — `ResourceHandler` y `DiscordGatewayDO`.

Los archivos `wrangler.toml` del repositorio referencian los IDs de Hyperdrive y los
dominios de la cuenta alojada (`ganju.ai`) — reemplázalos por **tus** IDs de recurso
y tu dominio.

## Define los secretos

Los `vars` de `wrangler.toml` solo contienen configuración no sensible (las URLs
`NEXT_PUBLIC_*`, `NODE_ENV`, los puertos). Todo lo sensible se define con
`wrangler secret`, por app y por entorno:

```bash
cd apps/api
wrangler secret put JWT_SECRET --env production
wrangler secret put CRYPTO_SECRET --env production
wrangler secret put MCP_INTERNAL_SECRET --env production
wrangler secret put EMBEDDING_API_KEY --env production
wrangler secret put GOOGLE_CLIENT_SECRET --env production
# …y el resto de secretos de cliente de los proveedores
```

## Despliega

Cada app Worker trae los entornos `development` y `production`; los scripts de la
raíz se distribuyen por el workspace con Turbo.

1. Aprovisiona los recursos de Cloudflare de arriba.
2. Define los secretos de cada entorno de Worker.
3. Aplica las migraciones de la base de datos contra tu base de destino:
   ```bash
   npm run migrate-prod   # genera y aplica contra .env.prod
   ```
4. Carga los datos iniciales de las tablas de catálogo (`tool_group`,
   `tool_definition`, `mcp_server_catalog`) si aún no están.
5. Despliega:
   ```bash
   npm run deploy-prod    # o deploy-dev para el entorno de desarrollo
   ```

Por debajo, cada app ejecuta `wrangler deploy --env <env>` (o
`opennextjs-cloudflare deploy` para el panel). Con `production`, tus apps quedan en
`{api,mcp,app}.<tu-dominio>`; `development` usa el prefijo `development-`.

## Observa y opera

Los Workers tienen la observabilidad activada — transmite los registros con
`wrangler tail --env <env>`, vigila las colas de mensajes fallidos por si hay
trabajos en segundo plano atascados, y revisa la tabla `error_log` para errores
entre servicios. Para el modelo de datos y la arquitectura, mira
[ARCHITECTURE.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/ARCHITECTURE.md)
y [DATA_MODEL.md](https://github.com/MontoyaAndres/ganju/blob/main/docs/DATA_MODEL.md)
en el repositorio.

¿Prefieres no correr nada de esto? La [versión alojada](https://app.ganju.ai) se
encarga de todo — empieza en el plan Gratis y
[mejora](/es/docs/settings#facturación-y-plan) cuando crezcas.
