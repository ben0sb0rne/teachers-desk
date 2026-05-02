# The Teacher's Desk — repo conventions

A static suite of free classroom tools, designed to feel like one product. This file is for cold-start sessions: read it before making any non-trivial change.

## What this repo is

Two working tools (Math Bingo, Seating Chart Designer) plus shared infrastructure. Everything is static + localStorage — no backend, no accounts, no auth, no analytics.

## Folder structure

```
/
├── index.html                ← homepage
├── about.html                ← about page
├── shared/                   ← cross-tool code (CSS, storage, future helpers)
│   ├── desk.css              ← single source of truth for visual style
│   ├── storage.js            ← single source of truth for localStorage
│   ├── picker-engine.js      ← stub for future name-picker tools
│   ├── tip-jar.js            ← stub for future Stripe tip jar
│   └── components/           ← README only today; future home for JS components
├── bingo/                    ← Math Bingo (vanilla)
├── picker/                   ← Name Picker (vanilla)
├── seating-chart/            ← Seating Chart Designer (React + Vite + Tailwind)
├── assets/
│   ├── renders/              ← future Blender output, empty for now
│   └── sounds/bingo/         ← bingo audio (note: lowercase `bingo`)
├── CLAUDE.md
└── README.md
```

Each tool folder is **self-contained** — it owns its own HTML/CSS/JS (or React tree) and tool-specific assets. Tools share code only by importing from `shared/`. Don't copy code between tools.

## Design tokens

Single source of truth: [`shared/desk.css`](shared/desk.css). Everything visual flows from there.

- **Color tokens are channel-form RGB** (e.g. `--accent-blue: 30 91 255`). Reference via `rgb(var(--accent-blue))` or `rgb(var(--accent-blue) / 0.5)`. This is what makes Tailwind opacity modifiers (`bg-accent-blue/30`) work correctly. **Do not** redefine palette values elsewhere; if you need a new token, add it to `desk.css`.
- **Typography:** body uses `var(--font-slab)` — `'Rockwell', 'Roboto Slab', Georgia, serif`. No web fonts are loaded. Swapping in a real face later is a one-variable change.
- **Type scale:** 11 / 13 / 17 / 22 / 34. **Spacing scale:** 4 / 8 / 12 / 18 / 26 / 38 / 52.
- **Radius:** `--radius: 6px` is the upper bound. **Do not exceed.**

### Konva colors (seating chart only)

Konva renders to canvas, not the DOM, so it can't read CSS variables. The seating chart keeps a JS mirror of the relevant tokens at [`seating-chart/src/lib/theme-tokens.ts`](seating-chart/src/lib/theme-tokens.ts). **Keep it in sync with `desk.css`.** A vitest snapshot test catches drift; if you change a token, run `npm test` in `seating-chart/`.

Functional Konva colors (front row, door amber, selection pink) intentionally do **not** track the suite tokens — they carry semantic meaning. Don't unify them.

## Storage rules

Single source of truth: [`shared/storage.js`](shared/storage.js).

- **Never call `localStorage` directly from a tool.** Always go through the shared module.
- Suite uses **one localStorage key**, `teachersdesk:v1`, with one envelope:
  ```js
  { schemaVersion: 1, preferences, rosters, callCounts, tools: { bingo, "seating-chart" } }
  ```
- The seating chart's Zustand persist middleware uses a custom storage adapter that delegates to `setToolState('seating-chart', ...)`. **Do not** point Zustand at a separate localStorage key.
- Tools that need their own internal versioning store it inside their own `tools.<name>` blob — that migration chain is the tool's concern. The seating chart already does this (its own v1→v6 chain in `src/lib/migrations.ts`).
- `getRoster(classId)` falls back to reading the seating chart's class blob if no explicit roster has been written. This means future tools can read student names without requiring the seating chart to actively sync.

## Aesthetic rules

- **No rounded corners > 6px.**
- **No pastels.**
- **No emoji** in product UI. (Sounds and confetti are fine; little smileys in tooltips are not.)
- **No SaaS gradients.** No "shiny" buttons. No glassmorphism. The aesthetic is riso-print / public-domain-engraving / teacher's desk diorama. Restrained, slightly imperfect, hand-touched.
- Blue (`--accent-blue`) is for accent only. Don't paint whole buttons or cards in it.

## Per-tool conventions

| Tool             | Stack                          | Build step? |
|------------------|--------------------------------|-------------|
| `bingo/`         | Vanilla HTML/CSS/JS (ES modules) | No |
| `picker/`        | Vanilla HTML/CSS/JS (ES modules) | No |
| `seating-chart/` | React 18 + TypeScript + Vite + Tailwind + Konva + Zustand | Yes (`npm run build`) |

The seating chart is the **only** tool with a build step. Treat it as the existing exception, not a precedent. New tools should be vanilla.

Each tool folder contains:
- `index.html` — the entry point
- `style.css` — tool-specific styles (references `shared/desk.css` tokens)
- `script.js` — tool-specific JS (uses `shared/storage.js`)
- `how-to.html` — SEO landing copy

The seating chart deviates because Vite owns its file structure.

## Do not

- Don't add jQuery, React, Vue, Astro, or any framework to a non–seating-chart tool.
- Don't add a build step (Webpack, Rollup, esbuild, etc.) anywhere outside `seating-chart/`.
- Don't add `npm`, `package.json`, or `node_modules/` anywhere outside `seating-chart/`.
- Don't add analytics scripts (Google Analytics, Plausible, Posthog, etc.).
- Don't add accounts, auth, login flows, or a backend. The suite is static + localStorage forever.
- Don't add new external dependencies (CDN scripts, fonts, libraries) without flagging it. Existing deps in the bingo monolith — KaTeX, jsPDF, `@fontsource` for PDF fonts — stay.
- Don't touch `localStorage` directly. Always go through `shared/storage.js`.

## Running locally

```bash
# from the repo root
python -m http.server 8000        # serves the suite on http://localhost:8000
```

The bingo app fetches CSV problem sets from `bingo/sets/` and needs HTTP (not `file://`).

The seating chart can be run via Vite for development:

```bash
cd seating-chart
npm install
npm run dev
```

## Deploying

Cloudflare Pages, static. The seating chart needs a build step; everything else ships as-is.

```bash
cd seating-chart
npm run build      # outputs seating-chart/dist/
```

Deploy the repo root, but replace the contents of `/seating-chart/` with the contents of `seating-chart/dist/`. The seating chart's `vite.config.ts` sets `base: '/seating-chart/'` so asset paths line up.

## Testing

```bash
cd seating-chart
npm test           # solver tests + theme-token sync test
```

There are no tests for vanilla tools today.
