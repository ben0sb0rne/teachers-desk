// =============================================================
// color.ts — automatic stroke / text color derivation from a fill.
//
// Used by per-object color overrides on Furniture (Phase 3) and the room
// background. The user only picks a fill; we derive the stroke (a darker
// shade) and the text color (light or dark depending on luminance) so the
// art style stays consistent with the predesigned objects without making
// the user manage three parallel colors.
// =============================================================

/** Suite-friendly preset swatches surfaced in the color picker. Tuned so
 *  every entry reads cleanly against the cream paper canvas and gets a
 *  legible auto-derived stroke + text. Keep this short — too many swatches
 *  becomes a paint chip aisle, not a curated palette. */
export const SWATCHES: readonly string[] = [
  "#f8fafc", // slate-50 (default-ish)
  "#fde68a", // soft amber
  "#fca5a5", // soft red
  "#bbf7d0", // soft green
  "#bfdbfe", // soft blue
  "#e9d5ff", // soft purple
  "#fdba74", // warm orange
  "#a8a29e", // warm gray
];

/** Parse a CSS hex color (#rgb, #rrggbb, with or without the #) into 0-255
 *  channels. Returns null for anything else (rgb()/named/etc.) — those
 *  aren't currently allowed via the picker. */
export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const s = hex.trim().replace(/^#/, "");
  if (s.length === 3) {
    const r = parseInt(s[0] + s[0], 16);
    const g = parseInt(s[1] + s[1], 16);
    const b = parseInt(s[2] + s[2], 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b };
  }
  if (s.length === 6) {
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b };
  }
  return null;
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/** Perceptual luminance, 0-1, using the standard sRGB weights. */
export function luminance(hex: string): number {
  const c = parseHex(hex);
  if (!c) return 1;
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
}

/** Derive a stroke color from a fill — darken by `amount` (default 30%).
 *  Clamps each channel so very dark fills don't underflow into pure black. */
export function deriveStroke(fill: string, amount = 0.3): string {
  const c = parseHex(fill);
  if (!c) return "#1a1614"; // fallback: paper-edge ink
  const r = c.r * (1 - amount);
  const g = c.g * (1 - amount);
  const b = c.b * (1 - amount);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Pick a text color (white or near-black) that reads cleanly on the given
 *  fill. Threshold tuned slightly above 0.5 because slab-serif text is
 *  optically lighter than its bbox suggests. */
export function deriveTextColor(fill: string): string {
  return luminance(fill) < 0.55 ? "#ffffff" : "#1a1614";
}
