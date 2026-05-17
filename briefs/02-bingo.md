# Brief: Math Bingo

**Status:** living document. Authoritative for the bingo tool.
**Last updated:** 2026-05-17.

---

## Purpose

A bingo-style classroom review game. A teacher loads (or builds) a problem set,
prints physical bingo cards (one per student), and hosts a live calling round
on a classroom projector. Students mark off called answers on their cards.

Bingo is the second-oldest tool in the suite. It was built before the topstrip
pattern was formalized, so several screens were reworked once the suite's
conventions stabilized.

## Audience

- Middle and high school math teachers primarily. Elementary teachers too —
  the topic catalog covers K through Calculus.
- Single-classroom use: one teacher hosting on a projector while students
  work at desks with physical cards.
- Bingo is **not** a remote / synchronous-online tool.

## Aesthetic

Church-hall / 1970s bingo night. Paper-cream surfaces, dark-ink text, no
chrome. Cohesion with the rest of the suite comes from the shared design
tokens; bingo's character comes from the **photoreal ball** in the caller
view and the **paper editor table** in the card designer.

- Square chips with thin paper-edge separators, not rounded glass tiles.
- The "called number" stamp on the board looks like a quick ink press, not
  a CTA.
- The photoreal ball is the one exception to "no animations purely for
  delight": it's a physical bingo metaphor and earns the staging.

## Three views

The tool has three top-level views, toggled by `showView('home' | 'print' |
'caller')` in `bingo/script.js`. The body class `view-{home|print|caller}`
plus `app-view` (on print + caller) drives the topstrip's per-view chrome.

### 1. Homepage (`view-home`)

The first screen. No active game; the bar is transparent over the wood
desk surface.

- **Topstrip:** `[The Teacher's Desk]` wordmark left, `[Settings]
  [Fullscreen]` right. The settings cog on the homepage opens the
  **suite-level** dialog (Appearance / Sound / Data) — not the bingo
  in-tool settings.
- **Get Started bar:** Choose File · New Blank Set · Format Help · Download
  Template. The first two ingest a CSV (Choose File) or open a blank
  editor (New Blank Set); the last two link out to the CSV format guide
  and a sample CSV download.
- **Topic picker:** "Pick a topic to play" — search box, grade-band chips
  (Elementary K-5 / Middle School / High School), grade-specific chips,
  and the filtered topic list. Each topic card expands to show variants.
- **Custom sets:** any sets the user has saved (currently CSV-only — no
  localStorage "My Sets" yet; tracked as a follow-up).

### 2. Print View / Card Designer (`view-print`)

Where the teacher edits problems and prints cards.

- **Topstrip:** `[The Teacher's Desk] › [Math Bingo] › [Set name]` left;
  `[Settings] [Fullscreen]` right. (Host Game lives next to Save as CSV
  in the editor toolbar, not the topstrip — the user explicitly asked
  for that prominence.) Paper-cream background.
- **Left sidebar:** number of cards, pre-assign to a class (Roster bridge
  integration), card style (Full Page / Half-Page / Work Area), card
  colors (per-column hex pickers), advanced options (card label, work
  area style, line spacing, caller-sheet inclusion), Download Cards.
- **Right pane:** the always-editable problem table. Header row shows
  per-column problem counts (`B 15 / I 15 / N 15 / G 15 / O 15`) and the
  "15 answers per column is recommended" guidance. Save as CSV +
  Host Game buttons sit in this toolbar.
- **Editor row layout:** color picker · Problem input · Answer input ·
  Problem preview · Answer preview · Delete. Inputs and previews share a
  baseline; errors flow below the input in the same cell only.
- **LaTeX in answers:** the answer field accepts LaTeX (e.g.
  `\frac{1}{2}`). Live KaTeX preview in the Answer Preview column.

### 3. Caller View (`view-caller`)

The active hosting screen, projected to the class.

- **Topstrip:** breadcrumb same as print-view; `[Help] [Settings]
  [Fullscreen]`. Paper-cream background. **Fullscreen-hides-others**
  applies only on this view — entering fullscreen collapses the strip to
  just the fullscreen toggle so the only chrome the class sees is the
  problem.
- **Problem card:** the called ball + the problem text. The ball is
  either the photoreal 3D rolling ball or the simple chip, per
  `state.settings.ballStyle`.
- **Recent-balls strip:** the last N balls (1-10, default 5) as small
  square tiles with the problem under each. Animates as a row when a new
  ball arrives.
- **Board panel:** either Grid mode (5x5 of called problems) or Recent
  Balls mode (collapses to just the recent-balls strip). Toggle with K.
- **Bottom nav:** Back · Check Answers · Next.
- **Check Answers overlay:** quick checker (column pill buttons + answer
  input) and a "Show full call sheet" collapsible. Bingo! button (red
  fill, white bold, 3D press shadow) is the win-verify CTA.

## Topstrip pattern (suite convention)

Every screen follows the same shape:

- **Left:** a breadcrumb. First item is always `The Teacher's Desk` (no
  back-arrow icon — the wordmark itself is the link to suite home).
  Subsequent items navigate one level deeper.
- **Right:** icon-only actions. Icons inherit the bar's contrast color —
  cream on dark wood (homepage), ink-dark on cream paper (app-views).
- **Hover:** a single unified recipe — `background: rgb(var(--paper-edge)
  / 0.08)` overlay. No opacity flicker, no color shift.
- **Backgrounds:** the bar is transparent on tool homepages and
  paper-cream on app-views. Toggled by `body.app-view`.
- **Fullscreen-hides-others** is opt-in per view. Bingo enables it on
  `view-caller` only.

## Ball styles

Two visual styles, picked by `state.settings.ballStyle`:

- **Realistic** (default) — 3D rolling photoreal ball. Sphere with
  radial-gradient shading, cream sticker disc with the column letter,
  cast shadow that tracks the ball's Y position as it rolls in. Per-letter
  color tokens derive from `cardColors` via `color-mix()` for highlight
  + shadow shades.
- **Simple** — flat colored chip with a column letter.

Each style has its own entrance animation list:

- Realistic: `Roll forward` (default) | `None`.
- Simple: `Drop & bounce` | `Pop spring` | `Roll-in` | `None`. Each has a
  distinct keyframe (`@keyframes chip-drop / chip-pop / chip-roll`).

Audio: the Roll-In.flac plays on photoreal entrance regardless of style
when the variant resolves to `roll`. Simple uses Drop-Bounce.flac /
Pop-Spring.flac / Roll-In.flac per variant.

## Settings inventory

Stored under `state.settings`. Saved via `saveSettings()` which routes
suite-wide preferences (theme) through `shared/storage.js` and bingo-only
settings under `tools.bingo`.

Display:
- `showNavButtons` — show Next / Check Answers / Back in caller view
- `showProgress` — show "Question N of M" call count
- `showRecentBalls` — show the recent-balls strip (when board mode is Recent)

Animation & Sound:
- `ballStyle` — `'photoreal' | 'classic'` (UI labels: Realistic / Simple)
- `ballAnimation` — `'drop' | 'pop' | 'roll' | 'none'` (Simple mode)
- `ballPhotorealAnimation` — `'roll-forward' | 'none'` (Realistic mode)
- `soundEnabled` / `soundMuted` / `soundVolume` (0.0-1.0) / `soundTick`

Called Numbers Board:
- `showBoard` — show / hide the board panel
- `boardMode` — `'recent' | 'grid'`
- `recentCount` (1-10) — number of recent balls
- `recentBallScale` (0.5-2.5) — recent ball size
- `boardContent` — `'problems' | 'answers'`

Auto-Advance Timer:
- `autoAdvanceOn` (bool)
- `autoAdvanceInterval` (seconds; presets 10/20/30/45/60)

Suite-wide (proxied):
- `theme` — `'auto' | 'light' | 'dark'`
- `font` — `'default'` or a font key

Card Colors (per-column, only in print view):
- `cardColors.B / I / N / G / O` — hex strings, default `#1565c0 #2e7d32
  #e65100 #6a1b9a #b71c1c`. Propagate to the caller view (recent balls +
  photoreal ball pick up the live values via the `--col-X` token cascade).

## Problem sets

### CSV format

```
column,problem,answer
B,-10 + (-15),-25
I,-7 + (-6),-13
...
```

Three required headers exactly: `column`, `problem`, `answer`. The CSV
parser strips a UTF-8 BOM (Excel "Save As CSV UTF-8" prepends one).
Quoted fields with embedded commas or quotes are RFC-4180. LaTeX is
accepted in both `problem` and `answer` — preview renders via KaTeX.

Each column needs at least **5 distinct answer values** for bingo cards
to be generatable. Answer ranges per column should ideally not overlap;
this isn't enforced but is documented in the CSV Format Guide overlay.

### Topic catalog

`TOPIC_GROUPS` in `bingo/script.js` — 67 topic groups spanning K through
Calculus + Statistics. Each entry:

```js
{ id, short, long, grades: { gradeKey: standard | [standard, ...] },
  fluency?: { gradeKey: true }, calc?: bool,
  variants: [{ label, path?, recommended?, calc? }] }
```

A topic is **playable** if any variant has a `path` to a CSV. Currently
3 variants ship (Adding Negatives: Mixed / Addition / Subtraction), all
under `bingo/sets/grade-6/`. The rest are roadmap. Full inventory in
`bingo-roadmap.txt` at the repo root.

## Animations

Brief: simple realism. Short durations, ease-out / ease-in only, opacity
+ small translateY (≤6px); no rotation or scale > 1.06 except the
photoreal-ball staging (the one exception).

- **Photoreal ball roll-in** — 1.7s. Three parallel keyframes: depth +
  motion-blur ramp (`ball-roll-forward`), 540° label rotation
  (`ball-label-roll`), shadow scale + Y-track (`ball-cast-grow`). Each
  has its own cubic-bezier. Performance-tuned for Chromium; Firefox lags
  slightly and is accepted.
- **Simple-mode chip animations** — 450-700ms keyframes per variant.
  Duration auto-updates from each audio file's metadata so visual + sound
  end together.
- **Recent-balls slide** — 320ms cubic-bezier. The new ball slides in
  from the left with a fade; the dropped tail ball is rendered briefly as
  a ghost (absolute-positioned outside flex flow) and fades out. Partial-
  fill renders use a half-slot shift so existing cards don't snap.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables
  all of the above. The chip / ball appears instantly.

## Persistence

Storage shape:

```
tools.bingo = {
  settings: { ... },        // see Settings inventory
  // Currently no persisted set / history bucket; reload starts at home.
}
```

Settings persist via `saveSettings()` which wraps `localStorage.setItem`
in a quota-aware try/catch (surfaces `showNotification` on
`StorageQuotaError`).

### Dirty tracking

The card designer tracks "dirty" state in `_pvBaseline` — a JSON
snapshot of `state.editRows` taken whenever a set is loaded, a new blank
is created, or a Save as CSV succeeds. `isPvDirty()` compares the
current rows to the baseline.

`confirmIfDirty(actionLabel, onProceed)` wraps the breadcrumb Back link
and the Host Game button. With unsaved changes, opens the shared
confirm overlay (`#confirm-overlay`) with three buttons: Save (downloads
CSV, then proceeds), Discard (proceeds), Cancel (stays).

The baseline is also re-snapshotted at the end of `init()` so a fresh
page load onto a previously-edited set isn't false-positive dirty.

## Cross-tool integration

- **Roster bridge:** the print-view's "Pre-assign by class" reads
  `shared/roster-bridge.js` to render a class roster and pre-assign cards
  per student. Read-only.
- **`recordCall` hook** (suite convention): bingo does NOT currently call
  this on each problem advance — bingo calls *answers*, not students. If
  we later add a "spotlight a student" feature, it would call
  `recordCall`.
- **Problem set store:** spec'd in CLAUDE.md as a future cross-tool store
  (read by bingo + Around the World). Not yet built — bingo's catalog
  lives entirely in its own `TOPIC_GROUPS` array.

## Accessibility

- All overlays carry `role="dialog" aria-modal="true" aria-labelledby`.
- `openOverlay` / `closeOverlay` capture and restore focus per-overlay.
- Esc closes the topmost overlay.
- Error banners (`#hp-set-error`, `#pv-host-error`, `#pv-dl-error`,
  `#pv-load-error`) are `aria-live="polite" aria-atomic="true"`.
- Icon-only buttons carry explicit `aria-label` (the column color reset
  buttons, the close buttons, the topstrip icons).
- Reduced motion respected.

## PDF output

Cards (`pvDownloadCards`):
- Full Page (1 per page, portrait) | Half-Page (2 per page, landscape) |
  Work Area (2 per page, work space)
- Color | Black & White
- Optional caller-sheet companion at the end of the PDF
- Pre-assign by class fills the card label with each student's name

Save as CSV (`pvSaveSetCsv`): exports the current editor rows back to a
CSV with the same column order. Rewrites the dirty baseline on success.

## Constraints / non-goals

- **No backend** — everything is static + localStorage.
- **No accounts, sharing, multi-device sync.**
- **No on-screen marking** — bingo cards are physical; students mark on
  paper. The Check Answers panel lets the teacher verify a claim.
- **No image / hand-written problems** — CSV only, KaTeX or plain text.
- **No timer-as-game-pacing** — auto-advance is an optional pacing aid,
  not a competitive element.

## Outstanding follow-ups (not blocking)

These are noted in past plan files; none are blocking, listed here so
the brief stays the source of truth:

1. Browser-level `beforeunload` guard for unsaved set edits.
2. `confirmIfDirty()` on topstrip nav links (currently only on the Back
   + Host Game buttons).
3. Bingo settings could register into the shared suite dialog via
   `shared/settings.js#registerToolSettings`.
4. "My Sets" localStorage bucket for custom sets to persist across
   reloads.
5. iPad responsiveness pass.
6. Firefox lag wishlist on the photoreal ball (blur isolation,
   `contain: paint`, pre-multiplied texture).
7. Caller-sheet "ANS" abbreviation consistency.
8. CSV Format Guide example doesn't demonstrate non-overlapping column
   ranges.
9. Topic Roadmap empty-state link styling.
10. `.active` vs `.is-active` naming divergence between bingo and the
    suite settings dialog.

## Reference files

- `bingo/index.html`, `bingo/style.css`, `bingo/script.js`
- `bingo/sets/` — shipped CSVs (grade-6 only)
- `bingo-roadmap.txt` — full topic inventory
- `shared/desk.css`, `shared/storage.js`, `shared/roster-bridge.js`,
  `shared/settings.js` — suite utilities
