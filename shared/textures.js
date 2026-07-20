// =============================================================
// shared/textures.js — the suite's hot-swappable texture system.
//
// Every hand-drawn texture is ONE file in assets/textures/ with a
// fixed name (the slot id + extension). Overwrite the file, hit
// "Reload textures" in the debug panel, and the new art shows in
// place — no code edits. assets/textures/README.md is the manifest
// (sizes, tile/cover modes, what each slot covers).
//
// How a slot reaches the screen:
//   • CSS surfaces — when a slot is enabled, <html> gets the class
//     `tex-<slot-id>` and the CSS var `--tex-<slot-id>: url(…)`.
//     Stylesheets opt in with rules like
//       html.tex-wheel-curtain body.is-wheel-stage { background-image: var(--tex-wheel-curtain); }
//     Disabled slot → class absent → the tool's existing look wins.
//   • Canvas/SVG surfaces — painters call textureImage(id) (an
//     HTMLImageElement or null) or textureUrl(id) and fall back to
//     their procedural paint when null.
//
// State: preferences.textures = { on: false, off: {} } via
// shared/storage.js — master switch + per-slot disables, this
// browser only. Textures ship OFF by default, so the public site
// keeps the clean CSS look while art is in progress.
//
// Debug panel: Ctrl+Shift+T on any tool page (or ?textures=1 / 0
// in the URL to force the master switch). The panel lists every
// slot grouped by world with per-slot toggles and a cache-busting
// reload button.
//
// A 'textureschange' window event fires after any apply/load so
// canvas tools can repaint static frames.
// =============================================================

import { getPreference, setPreference } from './storage.js';

const BASE = new URL('../assets/textures/', import.meta.url);

// The manifest. `img: true` marks slots consumed by canvas/SVG
// painters (preloaded as Image objects); everything else is CSS-only.
// Sizes/modes are documented in assets/textures/README.md.
export const SLOTS = [
  // Homepage / suite-wide
  { id: 'home-desk-wood',      file: 'home-desk-wood.png',      world: 'Suite',  label: 'Desk wood (all wood views)' },
  { id: 'home-placard-paper',  file: 'home-placard-paper.png',  world: 'Suite',  label: 'Homepage placard stock' },
  // Math Bingo
  { id: 'bingo-caller-surface', file: 'bingo-caller-surface.png', world: 'Bingo', label: 'Caller table surface' },
  { id: 'bingo-card-stock',     file: 'bingo-card-stock.png',     world: 'Bingo', label: 'Printable card stock' },
  { id: 'bingo-ball',           file: 'bingo-ball.png',           world: 'Bingo', label: 'Bingo ball' },
  // Wheel of Names
  { id: 'wheel-curtain',   file: 'wheel-curtain.png',   world: 'Wheel', label: 'Stage curtain' },
  { id: 'wheel-face',      file: 'wheel-face.png',      world: 'Wheel', label: 'Wheel face sheen', img: true },
  { id: 'wheel-hub',       file: 'wheel-hub.png',       world: 'Wheel', label: 'Brass hub', img: true },
  { id: 'wheel-scorecard', file: 'wheel-scorecard.png', world: 'Wheel', label: 'Side scorecard stock' },
  // Marble Race
  { id: 'race-playfield', file: 'race-playfield.png', world: 'Race', label: 'Playfield print', img: true },
  { id: 'race-cabinet',   file: 'race-cabinet.png',   world: 'Race', label: 'Cabinet bezel' },
  { id: 'race-marble',    file: 'race-marble.png',    world: 'Race', label: 'Glass marble (suite-wide)', img: true },
  { id: 'race-bumper',    file: 'race-bumper.png',    world: 'Race', label: 'Pop bumper', img: true },
  { id: 'race-post',      file: 'race-post.png',      world: 'Race', label: 'Brass post / sorter peg', img: true },
  // Team Maker reveals
  { id: 'sorter-field',    file: 'sorter-field.png',    world: 'Teams', label: 'Sorter field + bins', img: true },
  { id: 'draft-felt',      file: 'draft-felt.png',      world: 'Teams', label: 'Card-room felt' },
  { id: 'draft-card-back', file: 'draft-card-back.png', world: 'Teams', label: 'Draft card back' },
  { id: 'draft-card-face', file: 'draft-card-face.png', world: 'Teams', label: 'Draft card face' },
  { id: 'gacha-body',      file: 'gacha-body.png',      world: 'Teams', label: 'Gacha machine body' },
  { id: 'gacha-capsule',   file: 'gacha-capsule.png',   world: 'Teams', label: 'Gacha capsule' },
  { id: 'terminal-glass',  file: 'terminal-glass.png',  world: 'Teams', label: 'Terminal CRT glass' },
  // Around the World
  { id: 'atw-ring-canvas',       file: 'atw-ring-canvas.png',       world: 'AtW', label: 'Ring canvas weave' },
  { id: 'atw-corner-plate-red',  file: 'atw-corner-plate-red.png',  world: 'AtW', label: 'Red corner plate' },
  { id: 'atw-corner-plate-blue', file: 'atw-corner-plate-blue.png', world: 'AtW', label: 'Blue corner plate' },
  { id: 'atw-flashcard',         file: 'atw-flashcard.png',         world: 'AtW', label: 'Flashcard stock' },
  { id: 'atw-title-card',        file: 'atw-title-card.png',        world: 'AtW', label: 'Championship title card' },
  { id: 'atw-backdrop-custom',   file: 'atw-backdrop-custom.jpg',   world: 'AtW', label: 'Classroom photo backdrop' },
];

// Per-track playfield variants win over the generic print when the
// file exists: race-playfield-<trackId>.png. They're registered
// lazily on request so new tracks need no manifest edit.
const EXTRA_IMG_FILES = new Map(); // id → file

let version = 0;                // cache-buster; bumped by reloadTextures()
const images = new Map();       // id → { img: HTMLImageElement, ok: bool }
let prefs = null;

function loadPrefs() {
  const p = getPreference('textures', null);
  prefs = { on: !!(p && p.on), off: { ...(p && p.off) } };
}
function savePrefs() {
  setPreference('textures', { on: prefs.on, off: prefs.off });
}

export function texturesOn() {
  return !!(prefs && prefs.on);
}
function slotEnabled(id) {
  return texturesOn() && !prefs.off[id];
}

function urlFor(file) {
  return new URL(file, BASE).href + (version ? `?v=${version}` : '');
}

/** Enabled slot → its (cache-busted) URL; otherwise null. */
export function textureUrl(id) {
  const slot = SLOTS.find((s) => s.id === id);
  const file = slot ? slot.file : EXTRA_IMG_FILES.get(id);
  if (!file || !slotEnabled(slot ? id : baseIdOf(id))) return null;
  return urlFor(file);
}

// race-playfield-<track> toggles with the race-playfield slot.
function baseIdOf(id) {
  return id.startsWith('race-playfield-') ? 'race-playfield' : id;
}

/** Enabled + loaded slot → HTMLImageElement; otherwise null.
 *  Unknown `race-playfield-<track>` ids register + load lazily. */
export function textureImage(id) {
  const known = SLOTS.some((s) => s.id === id) || EXTRA_IMG_FILES.has(id);
  if (!known && id.startsWith('race-playfield-')) {
    EXTRA_IMG_FILES.set(id, `${id}.png`);
    loadImage(id, `${id}.png`);
  }
  if (!slotEnabled(baseIdOf(id))) return null;
  const entry = images.get(id);
  return entry && entry.ok ? entry.img : null;
}

function loadImage(id, file) {
  const img = new Image();
  const entry = { img, ok: false };
  images.set(id, entry);
  img.onload = () => {
    entry.ok = img.naturalWidth > 0;
    window.dispatchEvent(new CustomEvent('textureschange'));
  };
  img.onerror = () => { entry.ok = false; };
  img.src = urlFor(file);
}

/* Tinted-sprite cache — a white/grayscale sprite (marble, capsule)
   recolored per student/team. Multiply keeps the painted shading;
   destination-in restores the sprite's alpha. */
const tintCache = new Map(); // `${id}|${color}|${px}` → canvas
export function tintedSprite(id, color, px = 128) {
  const img = textureImage(id);
  if (!img) return null;
  const key = `${id}|${color}|${px}|${version}`;
  let c = tintCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = px; c.height = px;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, px, px);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = color;
    g.fillRect(0, 0, px, px);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(img, 0, 0, px, px);
    tintCache.set(key, c);
  }
  return c;
}

function applyTextures() {
  const root = document.documentElement;
  root.dataset.textures = texturesOn() ? 'on' : 'off';
  for (const slot of SLOTS) {
    const on = slotEnabled(slot.id);
    root.classList.toggle('tex-' + slot.id, on);
    if (on) {
      root.style.setProperty('--tex-' + slot.id, `url("${urlFor(slot.file)}")`);
      if (slot.img && !images.has(slot.id)) loadImage(slot.id, slot.file);
    } else {
      root.style.removeProperty('--tex-' + slot.id);
    }
  }
  // Re-load registered per-track extras on reload/version bumps.
  if (texturesOn()) {
    for (const [id, file] of EXTRA_IMG_FILES) {
      if (!images.has(id)) loadImage(id, file);
    }
  }
  window.dispatchEvent(new CustomEvent('textureschange'));
}

/** Cache-bust every slot and re-apply — the "I just overwrote the
 *  file" button. */
export function reloadTextures() {
  version = Date.now();
  images.clear();
  tintCache.clear();
  applyTextures();
}

// -------------------------------------------------------------
// Debug panel — Ctrl+Shift+T. Dev-facing, self-contained styles.
// -------------------------------------------------------------
let panel = null;

function buildPanel() {
  panel = document.createElement('div');
  panel.id = 'texture-debug-panel';
  panel.style.cssText = [
    'position:fixed', 'top:52px', 'right:12px', 'z-index:99999',
    'width:280px', 'max-height:calc(100vh - 70px)', 'overflow:auto',
    'background:rgb(24 22 20 / 0.96)', 'color:rgb(240 234 220)',
    'border:1px solid rgb(240 234 220 / 0.25)', 'border-radius:6px',
    'font:12px/1.5 system-ui,sans-serif', 'padding:10px 12px',
    'box-shadow:0 6px 24px rgb(0 0 0 / 0.5)',
  ].join(';');

  const row = (label, checked, onchange, bold) => {
    const l = document.createElement('label');
    l.style.cssText = 'display:flex;align-items:center;gap:8px;padding:2px 0;cursor:pointer;' +
      (bold ? 'font-weight:700;' : '');
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.checked = checked;
    c.addEventListener('change', () => onchange(c.checked));
    l.appendChild(c);
    l.appendChild(document.createTextNode(label));
    return l;
  };

  const render = () => {
    panel.innerHTML = '';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;';
    const title = document.createElement('strong');
    title.textContent = 'TEXTURES (debug)';
    title.style.letterSpacing = '0.06em';
    head.appendChild(title);
    const close = document.createElement('button');
    close.textContent = 'X';
    close.setAttribute('aria-label', 'Close texture panel');
    close.style.cssText = 'background:none;border:1px solid rgb(240 234 220 / 0.4);color:inherit;border-radius:4px;cursor:pointer;padding:0 6px;';
    close.addEventListener('click', togglePanel);
    head.appendChild(close);
    panel.appendChild(head);

    panel.appendChild(row('Textures on (this browser)', prefs.on, (v) => {
      prefs.on = v; savePrefs(); applyTextures(); render();
    }, true));

    const note = document.createElement('div');
    note.style.cssText = 'opacity:0.65;margin:4px 0 6px;';
    note.textContent = 'Overwrite files in assets/textures/, then Reload. Slots:';
    panel.appendChild(note);

    let world = '';
    for (const slot of SLOTS) {
      if (slot.world !== world) {
        world = slot.world;
        const h = document.createElement('div');
        h.textContent = world;
        h.style.cssText = 'margin:8px 0 2px;font-weight:700;opacity:0.85;border-bottom:1px solid rgb(240 234 220 / 0.2);';
        panel.appendChild(h);
      }
      const el = row(slot.label, !prefs.off[slot.id], (v) => {
        if (v) delete prefs.off[slot.id];
        else prefs.off[slot.id] = true;
        savePrefs(); applyTextures();
      });
      if (!prefs.on) el.style.opacity = '0.45';
      panel.appendChild(el);
    }

    const reload = document.createElement('button');
    reload.textContent = 'Reload textures';
    reload.style.cssText = 'margin-top:10px;width:100%;padding:6px;border-radius:4px;border:1px solid rgb(240 234 220 / 0.4);background:rgb(240 234 220 / 0.12);color:inherit;cursor:pointer;font-weight:700;';
    reload.addEventListener('click', reloadTextures);
    panel.appendChild(reload);
  };

  render();
  panel.__render = render;
  document.body.appendChild(panel);
}

function togglePanel() {
  if (!panel) { buildPanel(); return; }
  panel.hidden = !panel.hidden;
  if (!panel.hidden) panel.__render();
}

// -------------------------------------------------------------
// Init — call once per page (tools + homepage).
// -------------------------------------------------------------
let inited = false;
export function initTextures() {
  if (inited) return;
  inited = true;
  loadPrefs();
  // URL override: ?textures=1 / ?textures=0 forces + persists master.
  const q = new URLSearchParams(location.search).get('textures');
  if (q === '1' || q === '0') {
    prefs.on = q === '1';
    savePrefs();
  }
  applyTextures();
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 't' && e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      togglePanel();
    }
  });
}
