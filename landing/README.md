# Ganju landing page

A standalone marketing landing page for Ganju, built with **only HTML, CSS, and
JavaScript** — no framework, no build step — and deployable to
[Cloudflare Pages](https://pages.cloudflare.com).

## Files

```
landing/
├── package.json          npm scripts (preview / deploy)
├── README.md
└── public/               ← the static site (this is what gets published)
    ├── index.html        Page markup & content
    ├── styles.css        Layout & components
    ├── main.js           Header state, mobile nav, scroll reveal, GitHub star count
    ├── icons/            Brand logos (Claude, Slack, GitHub … ) as SVG
    └── images/           Illustrations + the AI prompt sheet (README.md)
```

Everything served lives under `public/`, so `package.json` and docs are never
published.

## Local preview

From the repo root (recommended — `wrangler` is already installed there):

```bash
npm run landing-preview
```

Or from inside this folder:

```bash
npm run preview          # wrangler pages dev → http://localhost:5173
```

> Animations are inline SVG/CSS, so there's nothing to fetch — you can even open
> `public/index.html` directly. A server just mirrors production more closely.

Plain alternative with no Cloudflare tooling:

```bash
cd public && python3 -m http.server 5173
```

## Deploy to Cloudflare Pages

These use [Wrangler](https://developers.cloudflare.com/workers/wrangler/)
(installed at the repo root) and the project name `ganju-landing`.

```bash
npm run landing-deploy           # production deploy (--branch=main)
```

Or from inside this folder: `npm run deploy-prod` (production) /
`npm run deploy-dev` (preview).

### First-time setup

1. **Authenticate Wrangler** with your Cloudflare account (once per machine):
   ```bash
   npx wrangler login
   ```
2. **Create the Pages project** (once). The deploy command creates it on first
   run, or do it explicitly:
   ```bash
   npx wrangler pages project create ganju-landing --production-branch=main
   ```
3. Run `npm run landing-deploy`. Wrangler uploads `public/` and prints the live
   URL (e.g. `https://ganju-landing.pages.dev`).

To use a custom domain, add it in the Cloudflare dashboard under
**Workers & Pages → ganju-landing → Custom domains**.

> CI/CD: you can also connect the GitHub repo in the Cloudflare dashboard with
> **build command** empty and **output directory** `landing/public`, and Pages
> will deploy on every push.

## Customizing

- **Brand colors** — edit the CSS variables at the top of
  [`public/styles.css`](public/styles.css) (`--brand`, `--brand-2`, `--accent`).
- **Copy & sections** — all content is plain markup in
  [`public/index.html`](public/index.html).
- **Pricing** — the Pro price is a `$—` placeholder; set your real number
  (search for `TODO: set your real price`).
- **Links** — GitHub, docs, and app URLs are placeholders (`app.ganju.ai`,
  `docs.ganju.ai`, `github.com`); point them at your real destinations.
- **Illustrations** — the 11 visuals (hero, 6 feature tiles, 4 steps) are
  `<img>` tags pointing at [`public/images/`](public/images/) — friendly,
  colorful 3D scenes on a soft off-white background. Generate them with AI using
  the prompt sheet in [`public/images/README.md`](public/images/README.md) and
  drop them in with the listed filenames. Until a file exists, the slot
  gracefully shows the gradient frame (the `<img>` hides itself on a 404).
- **Brand icons** — the logos in the trust bar, integrations, and footer are real
  SVGs in [`public/icons/`](public/icons/), referenced as `<img class="brand-ico">`
  and sized by the `.brand-ico` rule in `styles.css`. To add or swap one, drop an
  SVG in that folder and point a new `<img>` at it. (The generic `http-endpoint`,
  `mcp-proxy`, and Web Search glyphs stay inline in the markup — they have no
  brand logo.)
