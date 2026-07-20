// =============================================================
// shared/components/marbles.js — the suite's glass marbles.
//
// One student = one marble, everywhere marbles appear: the Marble
// Race, the Team Maker's sorter reveal and class cards, and any
// future picker. Color and initials are keyed to roster index so a
// student's marble looks identical across tools.
//
// TEXTURE-READY: paintMarble is the ONE paint entry point for the
// glass material — a drawn glass/plastic texture replaces its body
// here and every tool updates at once.
// =============================================================

import { tintedSprite } from '../textures.js';

/** Distinct stable colors — golden-angle hue walk over the roster.
 *  (Mirrored in seating-chart/src/lib/marble-color.ts — change both.) */
export function marbleColor(i) {
  return `hsl(${(i * 137.508) % 360} 72% 45%)`;
}

/** The color a student's marble actually wears: their favorite color
 *  when one is assigned (Student.favColor via the roster editor),
 *  else the stable auto palette by roster index. */
export function colorForStudent(student, index) {
  return (student && student.favColor) || marbleColor(index);
}

/** "Maya Rodriguez" → "MR", "Cher" → "C". */
export function initialsOf(name) {
  const parts = String(name ?? '').trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/* Gloss gradients are cached per context+radius — contexts come and
   go (cards, stages), radii differ per surface. */
const glossCache = new WeakMap();
function glossFor(ctx, r) {
  let byR = glossCache.get(ctx);
  if (!byR) { byR = new Map(); glossCache.set(ctx, byR); }
  let g = byR.get(r);
  if (!g) {
    g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, 'rgb(255 255 255 / 0.75)');
    g.addColorStop(0.35, 'rgb(255 255 255 / 0.15)');
    g.addColorStop(1, 'rgb(0 0 0 / 0.18)');
    byR.set(r, g);
  }
  return g;
}

/**
 * MATERIAL: glass marble. Draws at the ORIGIN — callers translate
 * (and optionally scale/fade) first.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ color: string, initials: string, rot?: number }} m
 * @param {number} r marble radius in current canvas units
 */
export function paintMarble(ctx, m, r) {
  // Texture slot: race-marble — a white/grayscale glass-ball sprite
  // recolored per student. Falls through to the procedural body.
  const sprite = tintedSprite('race-marble', m.color, 128);
  if (sprite) {
    ctx.save();
    ctx.rotate(m.rot ?? 0);
    ctx.drawImage(sprite, -r, -r, r * 2, r * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = m.color;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    // Internal glass swirl — rotates with the roll (m.rot), under the
    // gloss; the initials decal stays upright for readability.
    ctx.save();
    ctx.rotate(m.rot ?? 0);
    ctx.strokeStyle = 'rgb(255 255 255 / 0.3)';
    ctx.lineWidth = Math.max(1.5, r * 0.21);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.52, 0.3, 1.8); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.52, Math.PI + 0.3, Math.PI + 1.8); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = glossFor(ctx, r);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = `800 ${Math.round(r * 0.95)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, r * 0.21);
  ctx.strokeStyle = 'rgb(0 0 0 / 0.45)';
  ctx.strokeText(m.initials, 0, 0.5);
  ctx.fillStyle = '#fff';
  ctx.fillText(m.initials, 0, 0.5);
}

/**
 * Paint a class's whole roster as a centered marble pool into a
 * canvas — the class-card preview pattern (the class IS its marbles).
 * Sizes the canvas buffer to fit every row (DPR-scaled for crisp
 * initials) and sets the element's CSS height to match.
 * @param {HTMLCanvasElement} canvas
 * @param {Array<string | { name: string, favColor?: string }>} entries
 *   plain names, or detailed students (favColor honored)
 * @param {{ r?: number }} [opts]
 */
export function paintPool(canvas, entries, opts = {}) {
  const names = entries.map((e) => (typeof e === 'string' ? e : e.name));
  const students = entries.map((e) => (typeof e === 'string' ? null : e));
  const R = opts.r ?? 13;
  const stepX = R * 2 + 8;
  const stepY = R * 2 + 10;
  const cssW = canvas.clientWidth || 300;
  const perRow = Math.max(1, Math.floor((cssW - 16) / stepX));
  const rows = Math.max(1, Math.ceil(names.length / perRow));
  const cssH = rows * stepY + 10;
  const dpr = window.devicePixelRatio || 1;
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  names.forEach((name, i) => {
    const row = (i / perRow) | 0;
    const inRow = Math.min(perRow, names.length - row * perRow);
    const rowLeft = (cssW - inRow * stepX) / 2 + stepX / 2;
    const x = rowLeft + (i % perRow) * stepX;
    const wob = ((i * 7919) % 5) - 2; // deterministic wobble, no RNG needed
    const y = 5 + stepY / 2 + row * stepY + wob;
    ctx.save();
    ctx.translate(x, y);
    paintMarble(ctx, { color: colorForStudent(students[i], i), initials: initialsOf(name) }, R);
    ctx.restore();
  });
}
