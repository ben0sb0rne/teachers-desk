# Texture slots — the hand-drawn art manifest

Every file in this folder is one **slot**: a fixed filename that one surface in
the suite reads. **Overwrite a file with your art (same name, same rough size),
press Ctrl+Shift+T in the app, hit "Reload textures" — done.** No code edits.

- **Textures are OFF by default** for every visitor. Your on/off state (master
  and per-slot) lives in *your* browser only — flip it in the Ctrl+Shift+T
  panel, or force it with `?textures=1` / `?textures=0` in any tool URL.
- The current files are **labeled diagnostic placeholders** (checkerboard +
  name + size + fit mode). The app's clean CSS look is always the fallback:
  any slot that's off — or whose file fails to load — falls back automatically.
- When a piece of final art is ready to ship for everyone, tell Claude to flip
  that slot's default — the system supports going live one slot at a time.
- Engine: [`shared/textures.js`](../../shared/textures.js). CSS surfaces read
  `--tex-<slot-id>` vars gated by `html.tex-<slot-id>` classes; canvas/SVG
  painters call `textureImage()`/`textureUrl()` and fall back procedurally.

## Drawing notes

- Sizes below are ~2× display resolution; matching them exactly isn't
  critical, but keep the aspect ratio for COVER/SPRITE slots.
- **TILE** slots must tile seamlessly (left↔right, top↔bottom).
- **SPRITE** slots need transparent backgrounds (PNG alpha).
- Slots marked **tinted** are recolored in code by multiply blending —
  paint them in **grayscale/white with shading**; color comes from the
  student/team/column at runtime. Saturated paint will muddy the tint.
- Suite guardrails still apply: no pastels, no corner radius > 6px baked
  into UI art, shadows only where something is physically real.

## The slots

### Suite-wide
| File | Size | Fit | Covers |
|---|---|---|---|
| `home-desk-wood.png` | 1024² | TILE | The wood desk: homepage + every class-select/setup backdrop |
| `home-placard-paper.png` | 512² | TILE | Homepage placard card stock |

### Math Bingo
| File | Size | Fit | Covers |
|---|---|---|---|
| `bingo-caller-surface.png` | 1024² | TILE | Caller view table surface |
| `bingo-card-stock.png` | 512² | TILE | Card-designer sheet background (print-output wiring comes with final art — the printable cards are generated as SVG) |
| `bingo-ball.png` | 256² | SPRITE, **tinted** | The photoreal ball body; column color multiplies over it, highlight/shading CSS stays on top |

### Wheel of Names
| File | Size | Fit | Covers |
|---|---|---|---|
| `wheel-curtain.png` | 1024² | TILE | Stage curtain (the CSS spotlight still lights it from above) |
| `wheel-face.png` | 2048² | OVERLAY | Plastic sheen ring over the wedges — keep it MOSTLY TRANSPARENT; wedge colors and labels sit beneath it |
| `wheel-hub.png` | 512² | SPRITE | The brass hub, including its center screw |
| `wheel-scorecard.png` | 512² | TILE | Side scorecard stock |

### Marble Race
| File | Size | Fit | Covers |
|---|---|---|---|
| `race-playfield.png` | 1400×1100 | COVER | THE big one — replaces the whole printed field (include the finish band in the art). Drop `race-playfield-<trackId>.png` beside it for per-track art; it wins automatically. Track ids: `classic`, plus the rest in `race/script.js` TRACKS |
| `race-cabinet.png` | 512² | TILE | Cabinet bezel border around the glass (used as a border-image) |
| `race-marble.png` | 128² | SPRITE, **tinted** | The suite glass marble — race, sorter, every class card. Highest-leverage file here |
| `race-bumper.png` | 160² | SPRITE | Pop bumper at rest (the hit flash stays procedural) |
| `race-post.png` | 64² | SPRITE | Brass peg — also the sorter's peg field |

### Team Maker reveals
| File | Size | Fit | Covers |
|---|---|---|---|
| `sorter-field.png` | 1200×760 | COVER | Sorter field print — include bin dividers/floor in the art (functional labels draw on top) |
| `draft-felt.png` | 512² | TILE | Card-room felt (walls + table) |
| `draft-card-back.png` | 184×256 | SPRITE | Card back |
| `draft-card-face.png` | 184×256 | SPRITE | Card face — names print over the middle, keep it quiet there |
| `gacha-body.png` | 900×1200 | SPRITE | Machine body illustration (the glass globe + capsules stay separate layers) |
| `gacha-capsule.png` | 128² | SPRITE, **tinted** | Capsule; keep the bottom half near-white — team color multiplies over it |
| `terminal-glass.png` | 1024² | OVERLAY | Optional CRT glass smudge, screen-blended — only light strokes show |

### Around the World
| File | Size | Fit | Covers |
|---|---|---|---|
| `atw-ring-canvas.png` | 1024² | TILE | Dark ring canvas weave (Classic backdrop only; the CSS spotlight pools on top; color-variant backdrops keep their flats) |
| `atw-corner-plate-red.png` | 900×300 | COVER | Red corner fight plate |
| `atw-corner-plate-blue.png` | 900×300 | COVER | Blue corner fight plate |
| `atw-flashcard.png` | 512² | TILE | Flashcard stock, both faces (the answer side keeps its red trim) |
| `atw-title-card.png` | 1200×800 | COVER | End-of-match championship card (gold text prints over it — keep the center dark) |
| `atw-backdrop-custom.jpg` | 1920×1080 | COVER | **Your classroom photo.** While this slot is on, a "Classroom" swatch appears in AtW setup. JPG is fine here |

## Regenerating placeholders

`node audit/gen-textures.mjs` (repo-local rig) rewrites every placeholder —
only do this if you want to reset a slot you've overwritten.
