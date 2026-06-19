# Landing images — AI generation prompts

Drop the generated files in this folder using the **exact filenames** below. The
page references them by name; until a file exists the slot gracefully shows the
gradient frame (the `<img>` hides itself on a 404).

- **Format:** PNG (or WebP — if you convert, keep the same base name and change
  the `src` extension in `index.html`).
- **Two kinds:** big **scene** illustrations (hero + 4 steps) and small **icons**
  (6 feature badges). Icons should have a **transparent background**.
- Keep total weight reasonable — run the finals through an optimizer
  (TinyPNG / Squoosh) before committing.

---

## The shared style (paste into every prompt)

Append this to each subject prompt so all 11 images match the app's look (light,
minimal, near-black ink — no neon, no gradients). This is the **STYLE BLOCK**:

> Clean modern 3D illustration on a soft off-white background (#F6F6F8), minimal
> premium SaaS aesthetic, near-black ink and matte surfaces (#1C1825), monochrome
> with subtle grey tones, soft natural shadows, gentle depth, lots of negative
> space, centered composition, high detail, no neon, no glow, no text, no words,
> no logos, no watermark.

**Negative prompt** (for tools that support one):

> text, words, letters, numbers, logos, watermark, signature, UI mockup, busy
> background, clutter, neon, glow, dark background, gradient, low quality, blurry,
> jpeg artifacts, photorealistic people, stock-photo look

**Brand colors:** near-black `#1C1825` (bastille) on white / off-white
`#F6F6F8`. Keep it monochrome and matte to match the app — no neon or gradients.

---

## Scene illustrations

### `hero.png` — 1:1 (1024×1024)

> A glowing central server hub at the center, connected by flowing light streams
> to four floating nodes around it: a document, a chat bubble, a power plug/tool,
> and a sparkling AI star. Streams of light particles flow along the connections
> toward the hub. Concentric glowing orbital rings. Sense of a network powering
> an AI brain. — [STYLE BLOCK]

### `step-1.png` — 4:3 (1024×768)

> A single glowing glass panel/card materializing in space with a small ID tag
> or badge on it, and a soft "+" symbol of light, representing creating a new
> project. One clean focal object, lots of negative space. — [STYLE BLOCK]

### `step-2.png` — 4:3 (1024×768)

> Documents and small rounded "tool" chips floating and snapping into a glowing
> panel from the left; a stack of files merging into a hub while connector
> plugs click into sockets on the right. Sense of assembling content and tools.
> — [STYLE BLOCK]

### `step-3.png` — 4:3 (1024×768)

> A small server endpoint panel on the left connected by a glowing cable/light
> beam to an AI chat window panel on the right, a packet of light traveling
> along the connection. Sense of two systems handshaking securely.
> — [STYLE BLOCK]

### `step-4.png` — 4:3 (1024×768)

> A glowing phone/chat window broadcasting message bubbles outward to four
> floating generic messaging-app bubble icons (no real brand logos). Sense of a
> bot reaching multiple channels. — [STYLE BLOCK]

---

## Feature icons — 1:1 (512×512), **transparent background**

For these, swap the background line in the STYLE BLOCK for:
**"transparent background, single centered matte 3D icon in near-black #1C1825"**.

### `feature-host.png`

> A 3D glossy stack of server racks / a cloud server with small glowing status
> lights. — [ICON STYLE]

### `feature-rag.png`

> A 3D magnifying glass scanning a document with abstract text lines, hinting at
> search and vector retrieval. — [ICON STYLE]

### `feature-tools.png`

> A central node with three connector plugs / puzzle pieces snapping into it,
> representing pluggable tools. — [ICON STYLE]

### `feature-channels.png`

> Two overlapping glossy chat bubbles with small dots, representing messaging
> channels. — [ICON STYLE]

### `feature-team.png`

> Three connected nodes forming a small network/triangle, representing teams and
> multi-tenant organizations. — [ICON STYLE]

### `feature-audit.png`

> A small 3D bar chart trending upward with a subtle checkmark, representing
> audit and usage tracking. — [ICON STYLE]

---

## Tool-specific tips

- **Midjourney:** append `--ar 1:1` (hero/icons) or `--ar 4:3` (steps), and
  `--style raw` for cleaner geometry. For icons add `--no background` is not a
  thing — instead generate on black and remove the background, or use a tool
  that exports transparency.
- **DALL·E 3 / ChatGPT:** paste the subject + STYLE BLOCK as one paragraph; ask
  explicitly for "transparent background" on the icons and "no text anywhere."
- **Ideogram / Leonardo / SDXL:** use the **Negative prompt** above; set size to
  the listed dimensions.
- **Consistency:** generate the **hero first**, then tell the tool "same style,
  same color palette and lighting as the previous image" for the rest. Reusing a
  seed (where supported) keeps them cohesive.
- **Transparency for icons:** if your tool can't output alpha, generate on a
  flat white background and remove it (remove.bg, Photoshop, or
  `https://www.photopea.com`). The icon badge on the page already has its own
  light background, so a transparent dark icon sits cleanly inside it.

## After you add them

```bash
npm run landing-preview     # from repo root → http://localhost:5173
```

Swap `.png` for `.webp` in [`../index.html`](../index.html) if you optimize to
WebP. Then ship with `npm run deploy-prod`.
