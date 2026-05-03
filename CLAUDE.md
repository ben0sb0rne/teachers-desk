# The Teacher's Desk — repo conventions

A static suite of free classroom tools, designed to feel like one product. This file is for cold-start sessions: read it before making any non-trivial change.

## What this repo is

Three working tools (Math Bingo, Name Picker, Seating Chart Designer) plus the suite Rosters page and shared infrastructure. Everything is static + localStorage — no backend, no accounts, no auth, no analytics.

## Folder structure

```
/
├── index.html                  ← homepage
├── about.html                  ← about page
├── shared/                     ← cross-tool code (CSS, storage, bridge, components)
│   ├── desk.css                ← single source of truth for visual style
│   ├── storage.js              ← single source of truth for localStorage (annotated with JSDoc)
│   ├── roster-bridge.js        ← canonical-event subscription surface for any tool
│   ├── settings.js             ← floating gear + shared settings dialog
│   ├── picker-engine.js        ← stub for future fairness-weighted picks
│   ├── tip-jar.js              ← stub for future Stripe tip jar
│   └── components/             ← shared vanilla UI components
│       ├── overlay.js          ← openOverlay({title, onClose}) — modal w/ Esc + click-outside
│       ├── paste-bulk.js       ← mountPasteBulk(host, opts) — textarea + dedupe + submit
│       ├── class-card-grid.js  ← mountClassCardGrid(host, opts) — auto-refreshing class grid
│       └── view-router.js      ← createViewRouter({a, b}) — show/current/onChange helper
├── bingo/                      ← Math Bingo (vanilla)
├── picker/                     ← Name Picker (vanilla)
├── rosters/                    ← Stub: redirects to seating-chart/ (canonical roster manager)
├── seating-chart/              ← Seating Chart Designer (React + Vite + Tailwind)
│                                  Owns the canonical roster editor at /classes/:id/roster
│   └── src/
│       ├── components/
│       │   ├── TextInputDialog.tsx   ← reusable single-line input modal (replaces window.prompt())
│       │   ├── ConfirmDialog.tsx     ← reusable yes/no modal (replaces window.confirm())
│       │   └── ClassSwitcher.tsx     ← in-class header dropdown for jumping between classes
│       └── lib/
│           ├── use-roster-bridge.ts  ← React hooks built on shared/roster-bridge.js
│           └── color.ts              ← deriveStroke / deriveTextColor / SWATCHES for per-object color overrides
├── assets/
│   ├── renders/                ← future Blender output, empty for now
│   └── sounds/bingo/           ← bingo audio (note: lowercase `bingo`)
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

## Shared component library

Vanilla components in [`shared/components/`](shared/components/). New tools should compose these instead of reinventing modals or paste areas. Living examples in [`picker/script.js`](picker/script.js) and [`rosters/script.js`](rosters/script.js).

| Component | Mounts | Purpose |
|---|---|---|
| `overlay.js` | `openOverlay({ title, onClose })` → `{ body, close }` | Standard modal chrome (`.suite-overlay` / `.suite-panel`). Handles Esc + click-outside-to-close + initial focus. |
| `paste-bulk.js` | `mountPasteBulk(host, { placeholder, rows, buttonLabel, hint, onSubmit })` → `{ setDisabled, reset, focus, destroy }` | Textarea + button. Splits + dedupes pasted lines case-insensitively. Cmd/Ctrl+Enter submits. |
| `class-card-grid.js` | `mountClassCardGrid(host, { onSelect, onDelete, showCount, showSource })` → `{ refresh, destroy }` | Grid of class cards with name + count + source badge. Auto-refreshes via `roster-bridge` on class or roster changes. |
| `view-router.js` | `createViewRouter({ a, b })` → `{ show, current, onChange }` | Tiny `hidden` toggler so each tool stops reinventing `showView(name)`. |

When in doubt, lift toward `shared/`. The barrier to reuse is low.

## Storage rules

Single source of truth: [`shared/storage.js`](shared/storage.js). Subscription surface: [`shared/roster-bridge.js`](shared/roster-bridge.js).

- **Never call `localStorage` directly from a tool.** Always go through `shared/storage.js`.
- **Never subscribe to canonical events with raw `window.addEventListener`.** Use `shared/roster-bridge.js` (vanilla) or `seating-chart/src/lib/use-roster-bridge.ts` (React).
- Suite uses **one localStorage key**, `teachersdesk:v1`, with one envelope:
  ```js
  {
    schemaVersion: 1,
    preferences,                                    // { theme, sound, ... }
    classes: { [classId]: { name } },               // canonical class metadata
    rosters: { [classId]: string[] },               // canonical roster (names)
    callCounts: { [classId]: { [name]: number } },  // picker fairness data
    tools: {
      [toolName]: {
        // anything tool-specific; commonly:
        students: { [classId]: { [name]: any } },   // per-student per-tool metadata
        // ...other opaque tool state (e.g. seating-chart's Zustand blob)
      }
    }
  }
  ```
- The seating chart's Zustand persist middleware uses a custom storage adapter that delegates to `setToolState('seating-chart', ...)`. **Do not** point Zustand at a separate localStorage key.
- Tools that need their own internal versioning store it inside their own `tools.<name>` blob — that migration chain is the tool's concern. The seating chart already does this (its own v1→v7 chain in `src/lib/migrations.ts`).
- `getRoster(classId)` falls back to reading the seating chart's class blob if no explicit roster has been written. This means tools can read student names without requiring the seating chart to actively sync.

### Canonical event contract

Storage helpers dispatch these `window` `CustomEvent`s when canonical state changes:

| Event           | Detail                                     | Fired by                                  |
|-----------------|--------------------------------------------|-------------------------------------------|
| `classmeta`     | `{ classId, name, isNew, previousName }`   | `setClassName`                            |
| `classdelete`   | `{ classId }`                              | `deleteClass`                             |
| `rosterchange`  | `{ classId, names, added, removed }`       | `setRoster`                               |
| `rosterrename`  | `{ classId, oldName, newName }`            | `renameStudent`                           |
| `themechange`   | `{ theme }`                                | `setTheme`                                |

Subscribe via `shared/roster-bridge.js`: `onClassesChange`, `onClassDelete`, `onRosterChange(classId | null, cb)`, `onRosterRename(classId | null, cb)`, `onAnyChange`. Each returns an unsubscribe fn. The bridge also listens to cross-tab `storage` events so subscribers fire when another tab edits the same envelope.

### Idempotency + auto-cleanup

- **Idempotent helpers.** `setRoster` skips its write + event dispatch if the names match the current value; `setClassName` skips if name + isNew unchanged. Tools can call these in render loops without flooding subscribers.
- **Auto-cleanup of tool metadata.** Per-student tool data lives at `state.tools[toolName].students[classId][name]`. Canonical helpers keep this in sync automatically — `setRoster` drops metadata for removed names, `renameStudent` rekeys, `deleteClass` drops the whole class bucket. Tools never need to wire up cleanup themselves.

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
| `rosters/`       | Static redirect to `seating-chart/` | No |
| `seating-chart/` | React 18 + TypeScript + Vite + Tailwind + Konva + Zustand | Yes (`npm run build`) |

The seating chart is the **only** tool with a build step. Treat it as the existing exception, not a precedent. New tools should be vanilla.

The seating chart's classes index page (`/seating-chart/`) is the canonical roster manager for the suite — every "Rosters" link in the suite points there. The vanilla `rosters/` folder is now a stub redirect kept around so existing bookmarks (or any in-the-wild deep link) don't 404.

Each tool folder contains:
- `index.html` — the entry point
- `style.css` — tool-specific styles (references `shared/desk.css` tokens)
- `script.js` — tool-specific JS (uses `shared/storage.js`)
- `how-to.html` — SEO landing copy

The seating chart deviates because Vite owns its file structure.

### Seating chart canvas patterns

Desks and furniture override Konva's `getClientRect` to return their own (width × height) footprint, respecting `skipTransform: true` so the Transformer composes the transform itself — without that, single-select bboxes render double-transformed (misaligned or invisible). Multi-item handlers (align / distribute / flip / color / paste / duplicate) batch through `updateRoomItems` / `addRoomItems` so Ctrl+Z undoes one user action, not N. New flows that touch many items at once should follow this pattern; calling `updateDesk` / `addFurniture` in a loop creates one history entry per item.

## Do not

- Don't add jQuery, React, Vue, Astro, or any framework to a non–seating-chart tool.
- Don't add a build step (Webpack, Rollup, esbuild, etc.) anywhere outside `seating-chart/`.
- Don't add `npm`, `package.json`, or `node_modules/` anywhere outside `seating-chart/`.
- Don't add analytics scripts (Google Analytics, Plausible, Posthog, etc.).
- Don't add accounts, auth, login flows, or a backend. The suite is static + localStorage forever.
- Don't add new external dependencies (CDN scripts, fonts, libraries) without flagging it. Existing deps in the bingo monolith — KaTeX, jsPDF, `@fontsource` for PDF fonts — stay.
- Don't touch `localStorage` directly. Always go through `shared/storage.js`.
- Don't subscribe to canonical events (`classmeta` / `classdelete` / `rosterchange` / `rosterrename` / `themechange`) with raw `window.addEventListener`. Use `shared/roster-bridge.js` (vanilla) or `seating-chart/src/lib/use-roster-bridge.ts` (React). The bridge unifies same-tab and cross-tab listeners and returns an unsubscribe function.
- Don't reinvent modals, paste-bulk textareas, or class-card grids. Compose `shared/components/` instead.

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

GitHub Pages, static, via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Every push to `main` runs the workflow:

1. Build the seating chart with Vite (`VITE_BASE=/teachers-desk/seating-chart/`).
2. Assemble `_site/`: copy `index.html`, `about.html`, `bingo/`, `picker/`, `rosters/`, `shared/`, `assets/` as-is; replace `_site/seating-chart/` with `seating-chart/dist/`.
3. Upload + deploy the artifact to GitHub Pages.

Live URL: <https://ben0sb0rne.github.io/teachers-desk/>. When you add a new vanilla tool folder, **add it to the `cp -r` line in the Assemble step** so it ships.

## Testing

```bash
cd seating-chart
npm test           # solver tests + theme-token sync test
```

There are no tests for vanilla tools today.
