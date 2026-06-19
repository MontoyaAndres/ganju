# `@ganju/tsconfig`

Shared TypeScript configuration for the monorepo. Every app and package extends one of these so compiler options stay consistent.

| Config                       | For                                       |
| ---------------------------- | ----------------------------------------- |
| [`base.json`](base.json)     | Node/Worker packages (strict, `NodeNext`) |
| [`react.json`](react.json)   | React libraries                           |
| [`nextjs.json`](nextjs.json) | The Next.js web app                       |

Reference it from a workspace `tsconfig.json`:

```jsonc
{
  "extends": "@ganju/tsconfig/base.json"
  // …workspace-specific overrides
}
```
