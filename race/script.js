// =============================================================
// THE TEACHER'S DESK — Marble Race (GREYBOX PROTOTYPE)
//
// A physics race that produces a full finishing order for a class:
// every student is a marble; the leaderboard fills 1st → last as
// marbles cross the finish line. Mechanics-first prototype — the
// tool's real name/world lands with its brief.
//
// Suite conventions honored: roster via the roster bridge, winner
// recorded through incrementCallCount, no direct localStorage.
// =============================================================

import {
  getClasses, getRoster, getClassName, incrementCallCount,
} from '../shared/roster-bridge.js';
import { mountSettingsButton } from '../shared/settings.js';

mountSettingsButton();

/* ── Course space (internal units; canvas scales to fit) ────── */
const W = 800;
const H = 1200;
const MARBLE_R = 14;
const PEG_R = 7;
const FINISH_Y = H - 26;
const GRAVITY = 520;          // px/s² — soft gravity stretches the race
const MAX_FALL = 240;         // px/s terminal velocity: no free-fall blasts
                              // between obstacles; roughly doubles race
                              // length and keeps the pack readable
const WALL_BOUNCE = 0.72;
const MARBLE_BOUNCE = 0.9;
const DT = 1 / 120;           // fixed physics step
const DRAIN_AFTER_S = 90;     // force-finish stragglers past this

/* Seeded RNG (mulberry32) so a course can be replayed. */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── State ──────────────────────────────────────────────────── */
const state = {
  classId: null,
  trackId: 'pegfield',
  names: [],
  marbles: [],        // { name, color, x, y, vx, vy, finished }
  segments: [],       // static walls: { x1, y1, x2, y2 }
  pegs: [],           // static circles: { x, y }
  results: [],        // names in finish order
  running: false,
  raceTime: 0,
  seed: 1,
  rafId: 0,
  lastTs: 0,
  acc: 0,
};

/* ── Course generation ──────────────────────────────────────────
   Every track shares the outer walls + start funnel, then fills the
   body its own way. All gaps stay comfortably wider than a marble
   diameter (28px); the drain timeout catches freak stalls anyway. */
function baseCourse() {
  return [
    // Outer walls (left, right). Top stays open — marbles drop in.
    { x1: 0, y1: 0, x2: 0, y2: H },
    { x1: W, y1: 0, x2: W, y2: H },
    // Funnel under the start pool. The mouth (~112px for 28px marbles)
    // meters the pour so the field strings out instead of dumping at once.
    { x1: 0, y1: 150, x2: W * 0.43, y2: 260 },
    { x1: W, y1: 150, x2: W * 0.57, y2: 260 },
  ];
}

function pegBand(pegs, rand, top, bottom, xStep = 62, yStep = 48) {
  for (let y = top; y < bottom; y += yStep) {
    const stagger = ((y / yStep) | 0) % 2 === 0 ? 0 : xStep / 2;
    for (let x = 44 + stagger; x < W - 34; x += xStep) {
      // Jitter keeps runs from looking gridded; seeded so Reset replays.
      pegs.push({ x: x + (rand() - 0.5) * 14, y: y + (rand() - 0.5) * 10 });
    }
  }
}

function buildPegField(rand) {
  const segs = baseCourse();
  const baffleYs = [430, 660, 890];
  baffleYs.forEach((y, i) => {
    if (i % 2 === 0) segs.push({ x1: 0, y1: y, x2: W * 0.68, y2: y + 60 });
    else segs.push({ x1: W, y1: y, x2: W * 0.32, y2: y + 60 });
  });
  const pegs = [];
  for (const [top, bottom] of [[290, 410], [520, 640], [750, 870], [980, FINISH_Y - 60]]) {
    pegBand(pegs, rand, top, bottom);
  }
  return { segs, pegs };
}

function buildZigzag(rand) {
  const segs = baseCourse();
  // Five long alternating ramps; marbles pour off the open end of each.
  // Steep enough that packs keep rolling — shallow ramps stalled the
  // field and left the drain timeout to finish half the class.
  const rampYs = [300, 470, 640, 810, 980];
  rampYs.forEach((y, i) => {
    if (i % 2 === 0) segs.push({ x1: 0, y1: y, x2: W * 0.78, y2: y + 120 });
    else segs.push({ x1: W, y1: y, x2: W * 0.22, y2: y + 120 });
  });
  // No pegs: with alternating ramps, any peg "below" one ramp sits ON the
  // next one and forms a wedge pocket that parks marbles for good. The
  // pack jostling on the ramps is plenty of chaos by itself.
  void rand;
  return { segs, pegs: [] };
}

function buildPachinko(rand) {
  // No baffles — one tall dense pin field, pure pachinko chaos.
  const segs = baseCourse();
  const pegs = [];
  pegBand(pegs, rand, 300, FINISH_Y - 60, 56, 44);
  return { segs, pegs };
}

function buildSlalom(rand) {
  // Alternating gate walls leave one open lane per tier; small peg
  // clusters at each gate mouth scramble the queue.
  const segs = baseCourse();
  const pegs = [];
  const tierYs = [340, 500, 660, 820, 980];
  tierYs.forEach((y, i) => {
    if (i % 2 === 0) segs.push({ x1: 0, y1: y, x2: W * 0.72, y2: y + 90 });
    else segs.push({ x1: W, y1: y, x2: W * 0.28, y2: y + 90 });
  });
  // Pegless for the same wedge-pocket reason as the zigzag track.
  void rand;
  return { segs, pegs };
}

const TRACKS = [
  { id: 'pegfield', label: 'Peg Field', build: buildPegField },
  { id: 'zigzag',   label: 'Zigzag Ramps', build: buildZigzag },
  { id: 'pachinko', label: 'Pachinko', build: buildPachinko },
  { id: 'slalom',   label: 'Slalom Gates', build: buildSlalom },
];

/* Distinct stable colors — golden-angle hue walk. */
function marbleColor(i) {
  return `hsl(${(i * 137.508) % 360} 72% 45%)`;
}

/* "Maya Rodriguez" → "MR", "Cher" → "C". */
function initialsOf(name) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function resetRace(newSeed) {
  cancelAnimationFrame(state.rafId);
  state.running = false;
  state.raceTime = 0;
  state.acc = 0;
  state.results = [];
  if (newSeed) state.seed = (Math.random() * 2 ** 31) | 0;
  const rand = mulberry32(state.seed);
  const track = TRACKS.find((t) => t.id === state.trackId) || TRACKS[0];
  const { segs, pegs } = track.build(rand);
  state.segments = segs;
  state.pegs = pegs;
  // Start pool: pack marbles in rows above the funnel, seeded jitter.
  state.marbles = state.names.map((name, i) => {
    const perRow = 12;
    const row = (i / perRow) | 0;
    const col = i % perRow;
    return {
      name,
      initials: initialsOf(name),
      color: marbleColor(i),
      x: W / 2 + (col - perRow / 2 + 0.5) * (MARBLE_R * 2.2) + (rand() - 0.5) * 6,
      y: 36 + row * (MARBLE_R * 2.2) + (rand() - 0.5) * 6,
      vx: 0, vy: 0,
      finished: false,
    };
  });
  renderResults();
  draw();
}

/* ── Physics ────────────────────────────────────────────────── */
function step(dt) {
  const alive = state.marbles.filter((m) => !m.finished);
  for (const m of alive) {
    m.vy += GRAVITY * dt;
    if (m.vy > MAX_FALL) m.vy = MAX_FALL;
    m.x += m.vx * dt;
    m.y += m.vy * dt;

    // Walls / baffles: push out along the normal, reflect velocity.
    for (const s of state.segments) collideSegment(m, s);
    // Pegs: treat as circle-circle against a static body.
    for (const p of state.pegs) {
      const dx = m.x - p.x, dy = m.y - p.y;
      const rr = MARBLE_R + PEG_R;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < rr * rr) {
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        m.x = p.x + nx * rr;
        m.y = p.y + ny * rr;
        const vn = m.vx * nx + m.vy * ny;
        if (vn < 0) { m.vx -= (1 + WALL_BOUNCE) * vn * nx; m.vy -= (1 + WALL_BOUNCE) * vn * ny; }
      }
    }
  }
  // Marble-marble: equal-mass impulse, positional split. 38² pairs is cheap.
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = MARBLE_R * 2;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < rr * rr) {
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const overlap = (rr - d) / 2;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;
        const rvn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rvn < 0) {
          const imp = (-(1 + MARBLE_BOUNCE) * rvn) / 2;
          a.vx -= imp * nx; a.vy -= imp * ny;
          b.vx += imp * nx; b.vy += imp * ny;
        }
      }
    }
  }
  // Finish line.
  for (const m of alive) {
    if (m.y + MARBLE_R >= FINISH_Y) finishMarble(m);
  }
}

function collideSegment(m, s) {
  const ex = s.x2 - s.x1, ey = s.y2 - s.y1;
  const len2 = ex * ex + ey * ey;
  const t = Math.max(0, Math.min(1, ((m.x - s.x1) * ex + (m.y - s.y1) * ey) / len2));
  const cx = s.x1 + t * ex, cy = s.y1 + t * ey;
  const dx = m.x - cx, dy = m.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 === 0 || d2 >= MARBLE_R * MARBLE_R) return;
  const d = Math.sqrt(d2);
  const nx = dx / d, ny = dy / d;
  m.x = cx + nx * MARBLE_R;
  m.y = cy + ny * MARBLE_R;
  const vn = m.vx * nx + m.vy * ny;
  if (vn < 0) { m.vx -= (1 + WALL_BOUNCE) * vn * nx; m.vy -= (1 + WALL_BOUNCE) * vn * ny; }
}

function finishMarble(m) {
  m.finished = true;
  state.results.push(m.name);
  if (state.results.length === 1 && state.classId) {
    // Suite convention: any tool that picks a student records the call.
    incrementCallCount(state.classId, m.name);
  }
  renderResults();
  if (state.results.length === state.marbles.length) state.running = false;
}

/* ── Loop ───────────────────────────────────────────────────── */
function frame(ts) {
  if (!state.running) return;
  if (!state.lastTs) state.lastTs = ts;
  let dt = (ts - state.lastTs) / 1000;
  state.lastTs = ts;
  if (dt > 0.1) dt = 0.1; // background-tab hiccup guard
  state.acc += dt;
  state.raceTime += dt;
  while (state.acc >= DT) { step(DT); state.acc -= DT; }
  // Drain: past the timeout, force-finish stragglers by current progress.
  if (state.raceTime > DRAIN_AFTER_S) {
    [...state.marbles.filter((m) => !m.finished)]
      .sort((a, b) => b.y - a.y)
      .forEach(finishMarble);
  }
  draw();
  state.rafId = requestAnimationFrame(frame);
}

/* ── Rendering ──────────────────────────────────────────────── */
const canvas = document.getElementById('race-canvas');
const ctx = canvas.getContext('2d');

function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
}

function draw() {
  const cw = canvas.width, ch = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const scale = Math.min(cw / W, ch / H);
  ctx.setTransform(scale, 0, 0, scale, (cw - W * scale) / 2, (ch - H * scale) / 2);

  // Fixed ink on fixed paper — the canvas is a physical object (like the
  // seating chart's) and doesn't theme, so the themed --paper-edge would
  // go cream-on-cream in dark mode.
  const inkCss = 'rgb(26 22 20)';

  // Finish line — checkered band.
  for (let x = 0; x < W; x += 24) {
    ctx.fillStyle = ((x / 24) | 0) % 2 === 0 ? inkCss : 'rgb(200 190 165)';
    ctx.fillRect(x, FINISH_Y, 24, 10);
  }
  // Walls + baffles.
  ctx.strokeStyle = inkCss;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (const s of state.segments) {
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
  }
  // Pegs.
  ctx.fillStyle = 'rgb(140 120 90)';
  for (const p of state.pegs) {
    ctx.beginPath(); ctx.arc(p.x, p.y, PEG_R, 0, Math.PI * 2); ctx.fill();
  }
  // Marbles with initials — the leaderboard's color dots are the full key.
  ctx.font = `800 ${Math.round(MARBLE_R * 0.95)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgb(0 0 0 / 0.45)';
  for (const m of state.marbles) {
    if (m.finished) continue;
    ctx.fillStyle = m.color;
    ctx.beginPath(); ctx.arc(m.x, m.y, MARBLE_R, 0, Math.PI * 2); ctx.fill();
    // White glyphs with a soft dark outline read on every hue.
    ctx.strokeText(m.initials, m.x, m.y + 0.5);
    ctx.fillStyle = '#fff';
    ctx.fillText(m.initials, m.x, m.y + 0.5);
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

/* ── Leaderboard ────────────────────────────────────────────── */
function renderResults() {
  const ol = document.getElementById('race-results');
  ol.innerHTML = state.results.map((name, i) => {
    const idx = state.names.indexOf(name);
    return `<li${i === 0 ? ' class="is-winner"' : ''}><span class="dot" style="background:${marbleColor(idx)}"></span>${escHtml(name)}</li>`;
  }).join('');
}

function escHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── Views ──────────────────────────────────────────────────── */
function showClassSelect() {
  document.body.classList.remove('app-view');
  document.getElementById('race-view').hidden = true;
  document.getElementById('class-select-view').hidden = false;
  document.getElementById('crumb-tool').hidden = true;
  document.getElementById('crumb-context').hidden = true;
  const classes = getClasses();
  const grid = document.getElementById('class-grid');
  document.getElementById('class-empty').hidden = classes.length > 0;
  grid.innerHTML = classes.map((c) => {
    const n = getRoster(c.id).length;
    return `<button type="button" class="race-class-card" data-id="${escHtml(c.id)}">
      <strong>${escHtml(getClassName(c.id) || 'Untitled class')}</strong>
      <span class="count">${n} student${n === 1 ? '' : 's'}</span>
    </button>`;
  }).join('');
}

function openRace(classId) {
  state.classId = classId;
  state.names = getRoster(classId);
  if (state.names.length === 0) return;
  document.body.classList.add('app-view');
  document.getElementById('class-select-view').hidden = true;
  document.getElementById('race-view').hidden = false;
  const label = getClassName(classId) || '';
  document.getElementById('race-class-name').textContent = label;
  const crumbTool = document.getElementById('crumb-tool');
  const crumbCtx = document.getElementById('crumb-context');
  crumbTool.hidden = false;
  crumbCtx.hidden = false;
  crumbCtx.textContent = label;
  fitCanvas();
  resetRace(true);
}

/* ── Wiring ─────────────────────────────────────────────────── */
document.getElementById('class-grid').addEventListener('click', (e) => {
  const card = e.target.closest('.race-class-card');
  if (card) openRace(card.dataset.id);
});
document.getElementById('btn-start').addEventListener('click', startRace);
document.getElementById('btn-reset').addEventListener('click', () => resetRace(true));

// Track picker — switching tracks lays out a fresh course immediately.
const trackSelect = document.getElementById('track-select');
trackSelect.innerHTML = TRACKS.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');
trackSelect.addEventListener('change', () => {
  state.trackId = trackSelect.value;
  resetRace(true);
});
document.getElementById('crumb-tool').addEventListener('click', (e) => {
  e.preventDefault();
  cancelAnimationFrame(state.rafId);
  state.running = false;
  showClassSelect();
});

function startRace() {
  if (state.running) return;
  if (state.results.length) resetRace(false); // rerun same course
  state.running = true;
  state.lastTs = 0;
  state.rafId = requestAnimationFrame(frame);
}

document.addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.key === ' ' && !document.getElementById('race-view').hidden) {
    e.preventDefault();
    startRace();
  } else if (e.key === 'Escape' && !document.getElementById('race-view').hidden) {
    cancelAnimationFrame(state.rafId);
    state.running = false;
    showClassSelect();
  }
});

window.addEventListener('resize', () => {
  if (!document.getElementById('race-view').hidden) { fitCanvas(); draw(); }
});

showClassSelect();
