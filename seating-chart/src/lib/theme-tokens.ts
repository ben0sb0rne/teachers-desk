// =============================================================
// theme-tokens.ts — Konva mirror of suite design tokens.
//
// Konva renders to canvas (not the DOM) and can't read CSS variables, so we
// keep these JS constants in sync with `/shared/desk.css`. A vitest snapshot
// test (tests/theme-sync.test.ts) parses desk.css as text and asserts each
// SUITE token below matches its `--<token>` value.
//
// Suite tokens: chrome colors that should track the design system.
// Functional tokens: semantic colors that intentionally do NOT theme
//   (front-row highlight, door amber, drag-select marquee). Changing one
//   shifts the meaning of a UI signal, so we hardcode them.
// =============================================================

// ── Suite tokens (kept in sync with /shared/desk.css) ──
export const PAPER_CREAM = "#F8EED6"; // --paper-cream  · room background, paper surfaces
export const PAPER_EDGE = "#1A1614"; // --paper-edge   · ink, dark strokes, primary text
export const ACCENT_BLUE = "#1E5BFF"; // --accent-blue  · selection borders, primary accent
export const ACCENT_YELLOW = "#FFE03A"; // --accent-yellow · sticky-note style highlight
export const DESK_WOOD = "#BD9060"; // --desk-wood    · honey oak (homepage backdrop)

// ── Functional tokens (semantic; do NOT theme) ──
export const FRONT_ROW = "#fde68a"; // amber-200; soft highlight on front-row seats
export const DOOR_FILL = "#f59e0b"; // amber-500; door fill — instantly readable
export const DOOR_STROKE = "#92400e"; // amber-800; door outline
export const MARQUEE_STROKE = "#ec4899"; // pink-500; drag-to-select rectangle stroke

// ── Neutral helpers ──
// A subtle grid/border tint that reads on cream paper. We keep this as a
// hex literal because the desk-cream base is light enough that a translucent
// paper-edge can render too dark in Konva when antialiased.
export const NEUTRAL_LINE = "#cbd5e1"; // slate-300; quiet grid lines, room outline

/**
 * Channel-form values, in case anyone needs to compose with alpha in
 * canvas (not common; provided for parity with the CSS API).
 */
export const CHANNELS = {
  PAPER_CREAM: "248 238 214",
  PAPER_EDGE: "26 22 20",
  ACCENT_BLUE: "30 91 255",
  ACCENT_YELLOW: "255 224 58",
  DESK_WOOD: "189 144 96",
} as const;
