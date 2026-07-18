// Mirror of shared/components/marbles.js `marbleColor` — the suite's
// stable auto palette (golden-angle hue walk by roster index). The
// seating chart can't import from shared/ (separate build root), so
// this stays a documented mirror, same as theme-tokens.ts mirrors
// desk.css. If the shared formula changes, change it here too.
//
// Returns HEX (not hsl()) because <input type="color"> only accepts
// #rrggbb values.

export function autoColorHex(index: number): string {
  const h = (index * 137.508) % 360;
  return hslToHex(h, 72, 45);
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
