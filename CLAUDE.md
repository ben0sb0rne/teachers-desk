# The Teacher's Desk — repo conventions

A static suite of free classroom tools for K–12 teachers, made by Mr. Osborne. Each tool has its own world (homepage diorama, wheel game-show, noise meter VU/traffic-light/control-panel, timer in four flavors, grade-book call tracker, boxing-match review game), but they all read and write through one shared data layer and share the same type system, interaction grammar, and engineering tokens. Everything is static + localStorage — no backend, no accounts, no analytics.

**Shipped today:** homepage, Math Bingo, Wheel of Names, Marble Race, Team Maker (four reveal ceremonies), Around the World, Seating Chart (which owns the roster editor). The noise meter, timer, and Who's Been Called are planned — their briefs live in the `.docx` until each gets a per-tool `.md`.

## Source of truth

**The `briefs/` folder is authoritative.** Each brief in there describes one tool's purpose, aesthetic, behavior, and constraints.

- When briefs and conversation history conflict, briefs win.
- When briefs are ambiguous, **ask the user — don't guess.**
- Don't expand scope past what a brief specifies.
- Both this file and the briefs are living documents. If a decision in conversation contradicts a brief, the user updates the brief — Claude does not silently update either. **Flag the contradiction explicitly when it happens.**

Briefs live in `briefs/`. The original consolidated Word document is at `briefs/teachers-desk-briefs.docx`; per-tool `.md` files are added as each tool is specced (e.g. [`briefs/02-bingo.md`](briefs/02-bingo.md)). When a brief and the .docx disagree, the `.md` wins.

## Repo structure

```
/
├── index.html                  ← homepage (placard index today; desk diorama is the target)
├── about.html                  ← about page (+ sound credits)
├── briefs/                     ← AUTHORITATIVE. read these first.
├── shared/                     ← cross-tool code (CSS, storage, components)
│   ├── desk.css                ← single source of truth for visual style
│   ├── storage.js              ← single source of truth for localStorage
│   ├── roster-bridge.js        ← canonical-event subscription surface
│   ├── settings.js             ← suite settings dialog + per-tool section registry
│   ├── nav-levels.js           ← browser-history levels (Back walks a tool's views)
│   ├── textures.js             ← hot-swap texture registry + Ctrl+Shift+T debug panel
│   ├── problem-sets.js         ← CSV parsing + KaTeX cache (Bingo + Around the World)
│   ├── display-name.js         ← roster display-name rules (first names, initials)
│   ├── wheel-engine.js         ← STUB: future fairness-weighted picker logic
│   ├── tip-jar.js              ← STUB: future Stripe payment-link tip jar
│   ├── components/             ← shared vanilla UI (class-card-grid, marbles, overlay…)
│   └── reveals/                ← Team Maker's four reveal ceremonies (self-contained)
├── bingo/                      ← Math Bingo (vanilla)
├── wheel/                      ← Wheel of Names (vanilla)
├── race/                       ← Marble Race (vanilla)
├── teams/                      ← Team Maker (vanilla; reveals live in shared/reveals/)
├── around-the-world/           ← Around the World (vanilla)
├── picker/                     ← stub redirect to wheel/ (kept for old bookmarks)
├── rosters/                    ← stub redirect to seating-chart/
├── seating-chart/              ← React + TypeScript + Vite + Tailwind + Konva + Zustand + Radix
│                                  Owns the canonical roster editor.
├── assets/
│   └── textures/               ← hand-drawn art slots + README.md manifest (see below)
├── serve.bat                   ← double-click local server (close window to stop)
└── CLAUDE.md
```

This is a hybrid repo. **The seating chart is the only tool with a build step.** It is React + TypeScript + Vite + Tailwind + Konva + Zustand + Radix and stays that way — do **not** rewrite it as vanilla. **All future tools default to vanilla HTML/CSS/JS** unless there's a specific reason otherwise. New tool folders are self-contained: their own `index.html`, `style.css`, `script.js`, plus a `how-to.html` SEO landing page.

Tools share code only by importing from `shared/`. Don't copy code between tools.

## Design tokens

Single source of truth: [`shared/desk.css`](shared/desk.css). Color, typography, spacing, radius — all of it flows from there. **Don't redefine palette values, type scales, or spacing scales anywhere else.** If you need a new token, add it to `desk.css`.

Konva renders to canvas and can't read CSS variables, so the seating chart keeps a JS mirror of the relevant tokens at [`seating-chart/src/lib/theme-tokens.ts`](seating-chart/src/lib/theme-tokens.ts). A vitest test catches drift; if you change a token in `desk.css`, run `npm test` in `seating-chart/`.

## Texture system

The user hand-illustrates the suite's textures. [`shared/textures.js`](shared/textures.js) is the hot-swap engine; [`assets/textures/README.md`](assets/textures/README.md) is the slot manifest (fixed filenames, sizes, fit modes, drawing notes). **Textures ship OFF by default** — the CSS/procedural look is always the fallback; Ctrl+Shift+T opens the debug panel (master + per-slot toggles + cache-busting reload), `?textures=1/0` forces the master switch.

- Every material has ONE paint entry point. CSS surfaces hook via `html.tex-<slot-id>` classes + `--tex-<slot-id>` vars; canvas/SVG painters call `textureImage()`/`textureUrl()`/`tintedSprite()` and fall back procedurally when null.
- **New surfaces in any tool must register a slot** in `textures.js` + README and hook through this pattern — never invent parallel texture plumbing, never bake art-destined gradients inline.
- Sprites recolored at runtime (marble, bingo ball, gacha capsule) multiply the student/team/column color over grayscale art — keep that contract.
- As final art lands, slots flip on-by-default one at a time (per-slot defaults are the go-live mechanism).

## Aesthetic guardrails

These apply suite-wide unless a brief explicitly says otherwise:

- **No emoji** in UI.
- **No rounded corners larger than 6px.**
- **No pastels.**
- **No drop shadows for "depth" decoration.** Shadows only when something is genuinely meant to look physical.
- **No SaaS gradients.** No "shiny" buttons, no glassmorphism, no trendy 2020s gradient blobs.
- **No "AI sparkle" iconography.**
- **No animations purely for delight.** Every animation either communicates state, builds suspense, or signals completion.

## Per-tool aesthetic

Each tool has its own intentional visual character. Don't fight the impulse to make them look like one product — they aren't. (Tools marked *planned* aren't built yet; their aesthetic is the target.)

- **Homepage** — photoreal teacher's-desk diorama, time-of-day-aware *(target — today it's a placard index on the wood surface)*.
- **Wheel of Names** — 1970s Price Is Right (mustard, burnt orange, plastic-y wheel, curtain backdrop).
- **Marble Race** — pinball parlor at night (midnight cabinet, cream playfield, chrome + brass).
- **Team Maker** — suite paper-on-wood shell; each reveal is its own world: parlor annex (sorter), smoky card room (draft), Japanese toy shop (gacha), 1980s mainframe CRT (terminal).
- **Around the World** — mid-century boxing broadcast (near-black ring, corner red/blue, gold).
- **Noise Meter** *(planned)* — three switchable styles: vintage VU meter, traffic light, NASA control panel.
- **Timer** *(planned)* — four switchable styles: split-flap board, wind-up kitchen timer, vintage stopwatch, Nixie tubes.
- **Who's Been Called** *(planned)* — 1970s grade book / green-bar accountant pad.
- **Bingo** — church-hall / 1970s bingo night, paper-cream surfaces. See [`briefs/02-bingo.md`](briefs/02-bingo.md).
- **Seating Chart** — existing aesthetic, no brief yet.

Cohesion comes from:

1. The same **type system** across all tools — slab serif headings, sans body, shared scale.
2. The same **interaction grammar** — Esc closes modals, Space is the contextual primary action, toggles look the same, buttons feel pressable the same way.
3. The same **design tokens** at the engineering level, even when tools restyle them dramatically.

**There is no recurring footer or signature stamp across tools.** The homepage is the only place that ties the suite together visually.

## Cross-tool data

All persistent state goes through [`shared/storage.js`](shared/storage.js). **Never call `localStorage` directly from a tool.** Subscribe to canonical events via [`shared/roster-bridge.js`](shared/roster-bridge.js) (vanilla) or [`seating-chart/src/lib/use-roster-bridge.ts`](seating-chart/src/lib/use-roster-bridge.ts) (React) — never with raw `window.addEventListener`.

Two cross-tool stores carry most of the suite:

- **Roster store** — class periods + student names + seating chart positions. Read by the Wheel, Who's Been Called, Around the World, future pickers. Written by the Seating Chart (which currently owns the roster editor).
- **Problem set store** — collections of question/answer pairs. Read by Bingo and Around the World, which already share the loader/parser/KaTeX layer in [`shared/problem-sets.js`](shared/problem-sets.js) (each tool still keeps its own saved-sets bucket). A unified cross-tool store schema + management UI are not yet specced — a separate brief is expected before deep integration.

Per-tool state lives under `tools.<toolName>` in the storage envelope.

**`incrementCallCount(classId, name)`** (in `shared/storage.js`, re-exported by the roster bridge) is shared infrastructure: any tool that picks or calls on a student should invoke it, so participation data is consistent regardless of which tool selected the student. The Wheel calls it on each spin. Around the World should call it on each round when built. Future pickers should too.

## Tool navigation — the topstrip pattern

The top bar exists to walk the **levels of the current tool** (game → class select → suite home), not to hop between tools — teachers are single-tool visitors (decided 2026-07-19). Every tool page uses the same `.suite-topstrip` shell (defined in [`shared/desk.css`](shared/desk.css)):

- **Left, the breadcrumb** — starts with the `The Teacher's Desk` wordmark (text-only, no back-arrow icon), which links to the suite root. Deeper crumbs are tool-internal levels (e.g. `Math Bingo › Set Name`). **Every crumb above the current level is a link** and shows a resting underline (soft decoration color, firms on hover; the wordmark is exempt). The **current level is plain bold text** — when the level's element is an `<a>` that's currently at the top (Teams/AtW class crumb), it wears `.is-current`, which strips the underline and pointer.
- **Right, the icon cluster** — icon-only buttons, order `[help?] [audio?] [settings] [fullscreen]` (help and audio only where the tool has them). No chip backgrounds, no shadows. Color follows the bar: cream on the transparent home strip, ink-dark on the paper-cream app-view bar. Hover is a unified `paper-edge / 0.08` overlay.
- **Background:** transparent by default; paper-cream on app-views (caller, card designer, wheel spinner, seat editor). Toggled by `body.app-view` from each tool's view switcher.

Additional conventions:

- **Browser Back walks levels.** Every vanilla tool wires its views through [`shared/nav-levels.js`](shared/nav-levels.js): drill-downs push a history entry, and Back/Forward, the crumb links, and Esc all route through the same `onNavigate` renderer — Back never dumps the teacher out of the tool mid-game. Bingo's card designer vetoes the navigation and shows its save-changes prompt when dirty. The seating chart uses React Router URLs and manages its own history.
- **Static pages get the strip too.** `about.html` and every `how-to.html` carry the same breadcrumb shell (wordmark › tool link › current page) with **no icon cluster** — they're documents, not apps.
- **Borderless fullscreen is the suite standard** (decided 2026-07-15): in fullscreen, EVERY page sheds its chrome — the topstrip collapses to zero height and only the floating minimize button survives (fixed top-right; `body.is-fullscreen` rules in `shared/desk.css`). Tools toggle `body.is-fullscreen` from their `fullscreenchange` handler. The seating chart (its own React shell) is exempt. Dark worlds recolor `#btn-fullscreen` cream; nothing else overrides. **The top-right ~52px is the minimize button's reserved corner** — any world control that lives top-right gets a fullscreen `padding-right` so it never sits under the button (race and AtW headers do this).
- **No cross-tool navigation — deliberately.** Tools never link to each other; the breadcrumb only walks to suite root or within the current tool. Teachers usually use one tool per visit; the desk is the switchboard.
- **No footer, no sidebar.** Discovery happens at the desk.
- Tool homepages still keep the same widget set as app-views — just transparent background — so the user can hit Settings or Fullscreen from any screen.

## Audience and devices

- Audience: K–12 teachers, primarily middle and high school. Tone is warm, dry, slightly nerdy. Built by a teacher for teachers — never corporate, never SaaS-y.
- **Desktop and iPad first.** Tools must look great fullscreen on a classroom projector — that's a frequent display mode, not an edge case.
- **Phones are not a target.** Don't compromise design for them. A "this works best on a larger screen" message is acceptable.
- **Chromebooks are not a target.** This site is for teachers, not students.

## Hosting and deployment

- **GitHub Pages**, deployed by `.github/workflows/deploy.yml` on every push to `main`.
- Currently live at https://ben0sb0rne.github.io/teachers-desk/.
- The seating chart's Vite build runs as part of the deploy job; its `VITE_BASE` is wired from the Pages `base_path` so its absolute asset URLs work on the project-page subpath.
- **Domain: TBD.** Will be `theteachersdesk.io` or `theteachersdesk.com` depending on availability — placeholder for now.

## Do not

Never add any of the following without an explicit user request:

- jQuery, Vue, Astro, or any new framework.
- React for any **new** tool. (The existing seating chart keeps React.)
- A build step for any tool other than the seating chart.
- Analytics, tracking, third-party scripts (Google Analytics, Plausible, Posthog, etc.).
- User accounts, login, authentication.
- Email collection, newsletters, signup forms.
- Comments, social sharing buttons, "follow us" widgets.
- Stripe integration in code. (The tip jar is on the homepage in spirit only — actual integration comes later.)
- Any backend. Everything is static + localStorage forever.
- Service workers or PWA features.
- Custom fonts loaded from Google Fonts API. If we add a font later, self-host it.
- Direct `localStorage` calls outside `shared/storage.js`.
- Raw `window.addEventListener` for canonical events. Use the roster bridge.

## Workflow conventions

- **Fresh Claude Code session per tool when possible.** Long sessions degrade — context compresses, decisions drift. Treat the briefs as permanent memory and conversations as temporary working sessions.
- **Commit often on a branch** when doing structural work. Small, recoverable steps.
- **When a brief is ambiguous, ask before guessing.** A 30-second clarification beats an hour of misdirected work.
- **Don't silently update briefs.** If a conversation produces a decision that contradicts a brief, surface it explicitly so the user can update the brief.

## Running locally

```bash
# easiest: double-click serve.bat (repo root) — serves everything at
# http://localhost:8765/ and opens the browser; close its window to stop.

# or manually, from the repo root — vanilla tools
python -m http.server 8000        # http://localhost:8000

# seating chart only (Vite dev server)
cd seating-chart
npm install
npm run dev
```

Tools that fetch local files (e.g. Bingo's CSV problem sets) need HTTP, not `file://`.

## Testing

```bash
cd seating-chart
npm test           # solver tests + name-parsing tests + theme-token sync test
```

There are no tests for vanilla tools today.
