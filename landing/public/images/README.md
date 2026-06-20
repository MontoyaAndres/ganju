# Landing images — AI generation prompts

Drop the generated files in this folder using the **exact filenames** below. The
page references them by name; until a file exists the slot gracefully shows the
gradient frame (the `<img>` hides itself on a 404).

- **Format:** PNG (or WebP — if you convert, keep the same base name and change
  the `src` extension in `index.html`).
- **All one style:** every image — the big hero/step scenes and the 6 small
  feature tiles — is a 3D illustration on the **same soft off-white background**
  (no transparency). The feature tiles are just smaller, single-object scenes.
- Keep total weight reasonable — run the finals through an optimizer
  (TinyPNG / Squoosh) before committing.

---

## The shared style (paste into every prompt)

Append this to each subject prompt so all 11 images match the app's look: light,
clean, and premium, but **approachable and colorful** — soft pastel accents on
white, not black-and-white. Aim for a polished, professional product
illustration (the kind on a modern SaaS landing page), not a childish cartoon.
This is the **STYLE BLOCK**:

> Clean modern 3D illustration on a soft off-white background (#F6F6F8), polished
> premium SaaS aesthetic, smooth matte rounded shapes with a thin near-black ink
> outline (#1C1825) to keep it crisp. Cheerful pastel color palette: soft blue
> (#5B8DEF), warm orange (#F57C00), teal (#3FB6A8), green (#7BB35F), and a touch
> of purple (#B06FD8), used as gentle fills and accents — light and inviting, not
> dark or harsh. Soft natural shadows, gentle depth, lots of negative space,
> centered composition, high detail, no text, no words, no logos, no watermark.

**Negative prompt** (for tools that support one):

> text, words, letters, numbers, logos, watermark, signature, UI mockup, busy
> background, clutter, harsh neon, dark background, low quality, blurry, jpeg
> artifacts, photorealistic people, stock-photo look, muddy colors, all grey,
> black and white, childish cartoon, toy-like, cute mascot, kids illustration

**Brand & palette:** near-black ink `#1C1825` (bastille) used only for thin
outlines and small details, on white / off-white `#F6F6F8`. Bring it to life with
the product's own accent colors — soft blue `#5B8DEF`, warm orange `#F57C00`,
teal `#3FB6A8`, green `#7BB35F`, purple `#B06FD8` — plus light tinted surfaces
like mint `#E8F5E9`, cream `#FFF8E1`, and blush `#FFEBEE`. Keep colors soft and
pastel so it stays clean and premium, never garish.

---

## Scene illustrations

### `hero.png` — 1:1 (1024×1024)

> A central glowing hub (a sleek rounded server/dashboard node with a small AI
> sparkle on it) wired by clean connector lines to four floating objects around
> it: a neat stack of document pages, a cluster of app/tool plug icons, a
> standalone AI chat window, and a small phone showing a chat bubble. Tiny light
> packets travel along the wires both ways, showing the AI exchanging data with
> your files, tools and apps. Each object carries its own pastel accent — blue,
> orange, teal, green. Polished, isometric, clearly a connected system.
> — [STYLE BLOCK]

### `step-1.png` — 4:3 (1024×768)

> A clean dashboard/workspace card appearing in space — a rounded panel with a
> simple project header and a "+" to start a new one. Reads as opening your own
> private workspace. Soft blue accent, lots of negative space. — [STYLE BLOCK]

### `step-2.png` — 4:3 (1024×768)

> Document pages and small tool/plug modules sliding into a dashboard panel and
> clicking into connector sockets along its edge — like loading your content and
> switching on the tools your AI can use. Tidy, organized, pastel accents.
> — [STYLE BLOCK]

### `step-3.png` — 4:3 (1024×768)

> Your hub panel on the left joined by a secure connector cable (with a small
> shield or lock detail) to an AI chat window on the right that has a sparkle
> mark. A light packet travels the cable, showing the AI client linking to your
> server. Clear "plug your AI in" moment. — [STYLE BLOCK]

### `step-4.png` — 4:3 (1024×768)

> A phone with a chat app open, broadcasting message bubbles outward to three or
> four floating chat-app windows around it (generic, no real brand logos) — the
> same assistant now answering across multiple messaging channels. Each window a
> different pastel accent. — [STYLE BLOCK]

---

## Feature icons — 1:1 (512×512), **same background as the scenes**

These are now **mini scene illustrations**, not flat glyphs — same 3D look and
the same soft off-white background (#F6F6F8) as the hero and steps, just a single
focal object filling the square. Use the full **[STYLE BLOCK]** unchanged (do
**not** make these transparent). Compose one clear 3D object centered with a
little breathing room so it reads at small sizes. Give each a different pastel
accent so the six tiles feel lively together (blue, orange, teal, green, purple,
pink).

### `feature-host.png`  · blue accent

> A glossy 3D cloud floating above a small rounded server/rack with a couple of
> tiny status lights, soft blue accent — managed hosting, "we run it for you."
> One focal object on the off-white background. — [STYLE BLOCK]

### `feature-rag.png`  · orange accent

> A 3D magnifying glass hovering over a floating document with a few content
> lines and a small spark, warm orange accent — searching your own files for
> answers. — [STYLE BLOCK]

### `feature-tools.png`  · teal accent

> A rounded 3D hub block with three plug connectors clicking into sockets on its
> sides, teal accent — the pluggable tools your AI can use. — [STYLE BLOCK]

### `feature-channels.png`  · green accent

> Two glossy 3D chat-app message bubbles overlapping with small dots, green
> accent — your messaging channels. — [STYLE BLOCK]

### `feature-team.png`  · purple accent

> Three rounded 3D user nodes connected into a small network/org chart, purple
> accent — a team and shared projects. — [STYLE BLOCK]

### `feature-audit.png`  · pink accent

> A clean 3D bar chart rising upward with a small checkmark badge, pink accent —
> the activity log of everything your AI did. — [STYLE BLOCK]

---

## Tool-specific tips

- **Midjourney:** append `--ar 1:1` (hero + feature tiles) or `--ar 4:3` (steps),
  and `--style raw` for cleaner geometry. No transparency needed — the off-white
  background (#F6F6F8) is part of the image.
- **DALL·E 3 / ChatGPT:** paste the subject + STYLE BLOCK as one paragraph, and
  ask for "no text anywhere" and the soft off-white background.
- **Ideogram / Leonardo / SDXL:** use the **Negative prompt** above; set size to
  the listed dimensions.
- **Consistency:** generate the **hero first**, then tell the tool "same style,
  same color palette and lighting as the previous image" for the rest. Reusing a
  seed (where supported) keeps them cohesive — this matters most now that all 11
  share one background.
- **Cropping the tiles:** the feature tiles are shown edge-to-edge in a rounded
  64px frame (`object-fit: cover`), so keep the focal object centered with a
  little margin and don't put anything important in the corners.

## After you add them

```bash
npm run landing-preview     # from repo root → http://localhost:5173
```

Swap `.png` for `.webp` in [`../index.html`](../index.html) if you optimize to
WebP. Then ship with `npm run deploy-prod`.
