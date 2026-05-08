# The Teacher's Desk — repo conventions

A static suite of free classroom tools for K–12 teachers, made by Mr. Osborne. Each tool has its own world (homepage diorama, wheel game-show, noise meter VU/traffic-light/control-panel, timer in four flavors, grade-book call tracker, boxing-match review game), but they all read and write through one shared data layer and share the same type system, interaction grammar, and engineering tokens. Everything is static + localStorage — no backend, no accounts, no analytics.

## Source of truth

**The `briefs/` folder is authoritative.** Each brief in there describes one tool's purpose, aesthetic, behavior, and constraints.

- When briefs and conversation history conflict, briefs win.
- When briefs are ambiguous, **ask the user — don't guess.**
- Don't expand scope past what a brief specifies.
- Both this file and the briefs are living documents. If a decision in conversation contradicts a brief, the user updates the brief — Claude does not silently update either. **Flag the contradiction explicitly when it happens.**

The briefs currently exist as a single Word document at `briefs/teachers-desk-briefs.docx`. The plan is to split it into per-tool `.md` files (`briefs/00-suite-conventions.md`, `briefs/01-homepage.md`, etc.) when ready.

## Repo structure

```
/
├── index.html                  ← homepage (desk diorama)
├── about.html                  ← about page
├── briefs/                     ← AUTHORITATIVE. read these first.
├── shared/                     ← cross-tool code (CSS, storage, components)
│   ├── desk.css                ← single source of truth for visual style
│   ├── storage.js              ← single source of truth for localStorage
│   ├── roster-bridge.js        ← canonical-event subscription surface
│   └── components/             ← shared vanilla UI components
├── bingo/                      ← Math Bingo (vanilla)
├── wheel/                      ← Wheel of Names (vanilla)
├── picker/                     ← stub redirect to wheel/ (kept for old bookmarks)
├── rosters/                    ← stub redirect to seating-chart/
├── seating-chart/              ← React + TypeScript + Vite + Tailwind + Konva + Zustand + Radix
│                                  Owns the canonical roster editor.
├── assets/
└── CLAUDE.md
```

This is a hybrid repo. **The seating chart is the only tool with a build step.** It is React + TypeScript + Vite + Tailwind + Konva + Zustand + Radix and stays that way — do **not** rewrite it as vanilla. **All future tools default to vanilla HTML/CSS/JS** unless there's a specific reason otherwise. New tool folders are self-contained: their own `index.html`, `style.css`, `script.js`, plus a `how-to.html` SEO landing page.

Tools share code only by importing from `shared/`. Don't copy code between tools.

## Design tokens

Single source of truth: [`shared/desk.css`](shared/desk.css). Color, typography, spacing, radius — all of it flows from there. **Don't redefine palette values, type scales, or spacing scales anywhere else.** If you need a new token, add it to `desk.css`.

Konva renders to canvas and can't read CSS variables, so the seating chart keeps a JS mirror of the relevant tokens at [`seating-chart/src/lib/theme-tokens.ts`](seating-chart/src/lib/theme-tokens.ts). A vitest test catches drift; if you change a token in `desk.css`, run `npm test` in `seating-chart/`.

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

Each tool has its own intentional visual character. Don't fight the impulse to make them look like one product — they aren't:

- **Homepage** — photoreal teacher's-desk diorama, time-of-day-aware.
- **Wheel of Names** — 1970s Price Is Right (mustard, burnt orange, plastic-y wheel, curtain backdrop).
- **Noise Meter** — three switchable styles: vintage VU meter, traffic light, NASA control panel.
- **Timer** — four switchable styles: split-flap board, wind-up kitchen timer, vintage stopwatch, Nixie tubes.
- **Who's Been Called** — 1970s grade book / green-bar accountant pad.
- **Around the World** — boxing-match broadcast.
- **Bingo** — existing aesthetic, no brief yet.
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
- **Problem set store** — collections of question/answer pairs. Read by Bingo and Around the World. Schema and management UI are not yet specced — a separate brief is expected before deep integration.

Per-tool state lives under `tools.<toolName>` in the storage envelope.

**`recordCall(periodId, studentName)`** is shared infrastructure: any tool that picks or calls on a student should invoke it, so participation data is consistent regardless of which tool selected the student. The Wheel calls it on each spin. Around the World calls it on each round. Future pickers should too.

## Tool navigation

- Every tool has **one** "← The Teacher's Desk" link in its top-left corner that returns to the homepage.
- **No cross-tool navigation.** Tools never link to each other.
- **No top nav, no footer, no sidebar.** Discovery happens at the desk.

## Audience and devices

- Audience: K–12 teachers, primarily middle and high school. Tone is warm, dry, slightly nerdy. Built by a teacher for teachers — never corporate, never SaaS-y.
- **Desktop and iPad first.** Tools must look great fullscreen on a classroom projector — that's a frequent display mode, not an edge case.
- **Phones are not a target.** Don't compromise design for them. A "this works best on a larger screen" message is acceptable.
- **Chromebooks are not a target.** This site is for teachers, not students.

## Hosting and deployment

- **Cloudflare Pages**, deployed from this repo.
- The seating chart's Vite build runs as part of the deploy.
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
# from the repo root — vanilla tools
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
npm test           # solver tests + theme-token sync test
```

There are no tests for vanilla tools today.
