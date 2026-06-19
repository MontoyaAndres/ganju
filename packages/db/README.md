# `@ganju/db`

The database layer: [Drizzle ORM](https://orm.drizzle.team) schema, Postgres connection (via Hyperdrive), migrations, and a shared error handler.

## Contents

| Path                                     | What                                                       |
| ---------------------------------------- | ---------------------------------------------------------- |
| [`src/lib/schema.ts`](src/lib/schema.ts) | The full schema — source of truth for all tables/relations |
| [`src/lib/db.ts`](src/lib/db.ts)         | Connection (Hyperdrive / `postgres`)                       |
| [`src/lib/usage.ts`](src/lib/usage.ts)   | Usage-tally helpers                                        |
| [`src/utils`](src/utils)                 | Error handler, connection-string resolver                  |
| [`drizzle.config.ts`](drizzle.config.ts) | Drizzle Kit config                                         |

A guided tour of the entities is in [docs/DATA_MODEL.md](../../docs/DATA_MODEL.md).

## Commands

```bash
npm run generate -w @ganju/db      # generate SQL migrations from schema.ts
npm run migrate-dev -w @ganju/db   # apply against $DATABASE_URL (.env)
npm run migrate-prod -w @ganju/db  # apply against .env.prod
npm run studio -w @ganju/db        # Drizzle Studio
```

## Notes

- Requires Postgres with [`pgvector`](https://github.com/pgvector/pgvector) ≥ 0.7 (the embedding column is a 3072-dim `halfvec` with an HNSW cosine index).
- IDs are UUIDv7 text keys. Status/enum columns are validated against constant arrays in [`@ganju/utils`](../utils).
- `toolGroup`, `toolDefinition`, and `mcpServerCatalog` rows are seeded out of band.
