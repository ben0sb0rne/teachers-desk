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
const W = 1400;               // wide landscape course — fills the stage
const H = 1100;
const MARBLE_R = 14;
const PEG_R = 7;
const FINISH_Y = H - 26;
const GRAVITY = 520;          // px/s² — soft gravity stretches the race
const MAX_FALL = 240;         // px/s terminal velocity: no free-fall blasts
const MAX_SPEED = 900;        // absolute cap so spinners can't launch marbles
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
  marbles: [],        // { name, initials, color, x, y, vx, vy, finished }
  segments: [],       // static walls: { x1, y1, x2, y2 }
  pegs: [],           // static circles: { x, y, r, b? }
  spinners: [],       // rotating bars: { cx, cy, len, speed, phase }
  results: [],
  running: false,
  simTime: 0,         // advances with physics substeps (drives spinners + drain)
  seed: 1,
  rafId: 0,
  lastTs: 0,
  acc: 0,
};

/* ── Course generation ──────────────────────────────────────────
   Tracks share the outer box + start funnel, then fill the body
   their own way. Two hard-learned rules: every resting surface must
   slope (flat = parked marbles), and never let a peg touch a ramp
   (V-pockets trap marbles for good). Gaps stay > 4× marble radius. */
function baseCourse() {
  return [
    { x1: 0, y1: 0, x2: W, y2: 0 },           // ceiling (spinner safety)
    { x1: 0, y1: 0, x2: 0, y2: H },
    { x1: W, y1: 0, x2: W, y2: H },
    // Funnel under the start pool — a ~120px mouth meters the pour so
    // the field strings out instead of dumping at once.
    { x1: 0, y1: 120, x2: W / 2 - 60, y2: 240 },
    { x1: W, y1: 120, x2: W / 2 + 60, y2: 240 },
  ];
}

function pegBand(pegs, rand, top, bottom, xStep = 66, yStep = 50, r = PEG_R) {
  for (let y = top; y < bottom; y += yStep) {
    const stagger = ((y / yStep) | 0) % 2 === 0 ? 0 : xStep / 2;
    for (let x = 48 + stagger; x < W - 38; x += xStep) {
      pegs.push({ x: x + (rand() - 0.5) * 14, y: y + (rand() - 0.5) * 10, r });
    }
  }
}

function buildPegField(rand) {
  const segs = baseCourse();
  const baffleYs = [400, 620, 840];
  baffleYs.forEach((y, i) => {
    if (i % 2 === 0) segs.push({ x1: 0, y1: y, x2: W * 0.7, y2: y + 60 });
    else segs.push({ x1: W, y1: y, x2: W * 0.3, y2: y + 60 });
  });
  const pegs = [];
  for (const [top, bottom] of [[275, 380], [490, 600], [710, 820], [930, FINISH_Y - 55]]) {
    pegBand(pegs, rand, top, bottom);
  }
  return { segs, pegs };
}

function buildZigzag(rand) {
  const segs = baseCourse();
  // Long alternating ramps; the pack pours off the open end of each.
  const rampYs = [290, 450, 610, 770, 930];
  rampYs.forEach((y, i) => {
    if (i % 2 === 0) segs.push({ x1: 0, y1: y, x2: W * 0.8, y2: y + 115 });
    else segs.push({ x1: W, y1: y, x2: W * 0.2, y2: y + 115 });
  });
  void rand; // pegless — see course-generation notes above
  return { segs, pegs: [] };
}

function buildPachinko(rand) {
  const segs = baseCourse();
  const pegs = [];
  pegBand(pegs, rand, 280, FINISH_Y - 55, 60, 46);
  return { segs, pegs };
}

function buildSpinners(rand) {
  // Rotating bars bat marbles sideways between sparse peg rows —
  // the only track where the course itself fights back.
  const segs = baseCourse();
  // Mid-course V-collector: no marble gets a straight-line run; the
  // whole field re-converges through one center gap, into more bars.
  segs.push({ x1: 0, y1: 620, x2: W / 2 - 80, y2: 672 });
  segs.push({ x1: W, y1: 620, x2: W / 2 + 80, y2: 672 });
  const pegs = [];
  pegBand(pegs, rand, 280, 340, 96, 52);
  const spinners = [];
  // Rows sized/placed so no bar's sweep circle clips the V-collector,
  // the peg band, or the finish strip.
  const rows = [[480, 4], [800, 5], [950, 4]];
  rows.forEach(([y, count], ri) => {
    for (let k = 0; k < count; k++) {
      spinners.push({
        cx: (W * (k + 0.5)) / count + (rand() - 0.5) * 60,
        cy: y + (rand() - 0.5) * 20,
        len: 240,
        speed: (ri % 2 === 0 ? 1 : -1) * (1.1 + rand() * 0.7),
        phase: rand() * Math.PI * 2,
      });
    }
  });
  return { segs, pegs, spinners };
}

function buildFunnelFloors(rand) {
  // V-floor tiers with one offset drain hole each: the pack pools,
  // queues, and gushes through — rhythm instead of scatter.
  const segs = baseCourse();
  const gapXs = [0.72, 0.28, 0.55, 0.35];
  const tierYs = [380, 580, 780, 960];
  tierYs.forEach((y, i) => {
    const gx = W * (gapXs[i] + (rand() - 0.5) * 0.06);
    // Both halves slope toward the gap so nothing can rest flat.
    segs.push({ x1: 0, y1: y, x2: gx - 75, y2: y + 42 });
    segs.push({ x1: W, y1: y, x2: gx + 75, y2: y + 42 });
  });
  return { segs, pegs: [] };
}

function buildBumpers(rand) {
  // A handful of big lively bumpers instead of a peg carpet.
  const segs = baseCourse();
  const pegs = [];
  // Same V-collector trick as Spinners: kill straight-line runs.
  segs.push({ x1: 0, y1: 600, x2: W * 0.32 - 80, y2: 652 });
  segs.push({ x1: W, y1: 600, x2: W * 0.32 + 80, y2: 652 });
  const rows = [300, 410, 520, 720, 830];
  rows.forEach((y, ri) => {
    const count = 7 + (ri % 2);
    for (let k = 0; k < count; k++) {
      pegs.push({
        x: (W * (k + 0.5)) / count + (rand() - 0.5) * 80 + (ri % 2 ? 45 : 0),
        y: y + (rand() - 0.5) * 36,
        r: 28,
        b: 0.95, // livelier than pegs, still no energy gain
      });
    }
  });
  pegBand(pegs, rand, 930, FINISH_Y - 55, 80, 54);
  return { segs, pegs };
}

const TRACKS = [
  { id: 'pegfield', label: 'Peg Field', build: buildPegField },
  { id: 'pachinko', label: 'Pachinko', build: buildPachinko },
  { id: 'zigzag',   label: 'Zigzag Ramps', build: buildZigzag },
  { id: 'spinners', label: 'Spinners', build: buildSpinners },
  { id: 'floors',   label: 'Funnel Floors', build: buildFunnelFloors },
  { id: 'bumpers',  label: 'Bumpers', build: buildBumpers },
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
  state.simTime = 0;
  state.acc = 0;
  state.results = [];
  if (newSeed) state.seed = (Math.random() * 2 ** 31) | 0;
  const rand = mulberry32(state.seed);
  const track = TRACKS.find((t) => t.id === state.trackId) || TRACKS[0];
  const { segs, pegs, spinners = [] } = track.build(rand);
  state.segments = segs;
  state.pegs = pegs;
  state.spinners = spinners;
  // Start pool: pack marbles in rows above the funnel, seeded jitter.
  state.marbles = state.names.map((name, i) => {
    const perRow = 19;
    const row = (i / perRow) | 0;
    const col = i % perRow;
    return {
      name,
      initials: initialsOf(name),
      color: marbleColor(i),
      x: W / 2 + (col - perRow / 2 + 0.5) * (MARBLE_R * 2.2) + (rand() - 0.5) * 6,
      y: 34 + row * (MARBLE_R * 2.2) + (rand() - 0.5) * 6,
      vx: 0, vy: 0,
      finished: false,
    };
  });
  renderResults();
  draw();
}

/* ── Physics ────────────────────────────────────────────────── */
function spinnerSegment(s, t) {
  const a = s.phase + s.speed * t;
  const dx = Math.cos(a) * s.len / 2;
  const dy = Math.sin(a) * s.len / 2;
  return { x1: s.cx - dx, y1: s.cy - dy, x2: s.cx + dx, y2: s.cy + dy };
}

function step(dt) {
  state.simTime += dt;
  const spinnerSegs = state.spinners.map((s) => spinnerSegment(s, state.simTime));
  const alive = state.marbles.filter((m) => !m.finished);
  for (const m of alive) {
    m.vy += GRAVITY * dt;
    if (m.vy > MAX_FALL) m.vy = MAX_FALL;
    m.x += m.vx * dt;
    m.y += m.vy * dt;

    for (const s of state.segments) collideSegment(m, s);
    for (let si = 0; si < spinnerSegs.length; si++) {
      if (collideSegment(m, spinnerSegs[si])) {
        // Impart a bit of the bar's surface velocity so spinners genuinely
        // bat marbles around rather than acting like static walls.
        const s = state.spinners[si];
        const rx = m.x - s.cx, ry = m.y - s.cy;
        m.vx += -ry * s.speed * 0.35;
        m.vy += rx * s.speed * 0.35;
        const sp = Math.hypot(m.vx, m.vy);
        if (sp > MAX_SPEED) { m.vx *= MAX_SPEED / sp; m.vy *= MAX_SPEED / sp; }
      }
    }
    for (const p of state.pegs) {
      const dx = m.x - p.x, dy = m.y - p.y;
      const rr = MARBLE_R + p.r;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < rr * rr) {
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        m.x = p.x + nx * rr;
        m.y = p.y + ny * rr;
        const vn = m.vx * nx + m.vy * ny;
        const bounce = p.b ?? WALL_BOUNCE;
        if (vn < 0) { m.vx -= (1 + bounce) * vn * nx; m.vy -= (1 + bounce) * vn * ny; }
      }
    }
  }
  // Marble-marble: equal-mass impulse, positional split.
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
  for (const m of alive) {
    if (m.y + MARBLE_R >= FINISH_Y) finishMarble(m);
  }
}

/* Returns true when a collision response was applied. */
function collideSegment(m, s) {
  const ex = s.x2 - s.x1, ey = s.y2 - s.y1;
  const len2 = ex * ex + ey * ey;
  const t = Math.max(0, Math.min(1, ((m.x - s.x1) * ex + (m.y - s.y1) * ey) / len2));
  const cx = s.x1 + t * ex, cy = s.y1 + t * ey;
  const dx = m.x - cx, dy = m.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 === 0 || d2 >= MARBLE_R * MARBLE_R) return false;
  const d = Math.sqrt(d2);
  const nx = dx / d, ny = dy / d;
  m.x = cx + nx * MARBLE_R;
  m.y = cy + ny * MARBLE_R;
  const vn = m.vx * nx + m.vy * ny;
  if (vn < 0) { m.vx -= (1 + WALL_BOUNCE) * vn * nx; m.vy -= (1 + WALL_BOUNCE) * vn * ny; }
  return true;
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
  while (state.acc >= DT) { step(DT); state.acc -= DT; }
  if (state.simTime > DRAIN_AFTER_S) {
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
  // Fit the course aspect inside the stage, next to the leaderboard.
  const stage = canvas.parentElement;
  const board = stage.querySelector('.race-board');
  const availW = Math.max(100, stage.clientWidth - (board?.offsetWidth ?? 0) - 14);
  const availH = Math.max(100, stage.clientHeight);
  const s = Math.min(availW / W, availH / H);
  const cssW = Math.floor(W * s);
  const cssH = Math.floor(H * s);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
}

// Fixed ink on fixed paper — the canvas is a physical object (like the
// seating chart's) and doesn't theme.
const INK = 'rgb(26 22 20)';

function draw() {
  const cw = canvas.width, ch = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const scale = Math.min(cw / W, ch / H);
  ctx.setTransform(scale, 0, 0, scale, (cw - W * scale) / 2, (ch - H * scale) / 2);

  // Finish line — checkered band.
  for (let x = 0; x < W; x += 24) {
    ctx.fillStyle = ((x / 24) | 0) % 2 === 0 ? INK : 'rgb(200 190 165)';
    ctx.fillRect(x, FINISH_Y, 24, 10);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (const s of state.segments) {
    ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
  }
  // Spinners — bar + hub dot.
  for (const s of state.spinners) {
    const seg = spinnerSegment(s, state.simTime);
    ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(s.cx, s.cy, 9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgb(140 120 90)';
  for (const p of state.pegs) {
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
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
      <canvas class="race-card-marbles" width="400" height="72" aria-hidden="true"></canvas>
      <span class="count">${n} student${n === 1 ? '' : 's'}</span>
    </button>`;
  }).join('');
  // Paint each card's marble pool — the class IS its marbles.
  grid.querySelectorAll('.race-class-card').forEach((card) => {
    const names = getRoster(card.dataset.id);
    const cv = card.querySelector('.race-card-marbles');
    // Match the buffer to the displayed box so marbles stay round.
    cv.width = cv.clientWidth || 300;
    cv.height = cv.clientHeight || 72;
    const c2 = cv.getContext('2d');
    const R = 8;
    const perRow = Math.max(1, Math.floor((cv.width - 16) / (R * 2 + 3)));
    names.slice(0, perRow * 3).forEach((_, i) => {
      const row = (i / perRow) | 0;
      const wob = ((i * 7919) % 5) - 2; // deterministic wobble, no RNG needed
      c2.fillStyle = marbleColor(i);
      c2.beginPath();
      c2.arc(14 + (i % perRow) * (R * 2 + 3), 14 + row * (R * 2 + 5) + wob, R, 0, Math.PI * 2);
      c2.fill();
    });
  });
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

/* ── Fullscreen ─────────────────────────────────────────────── */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}
document.addEventListener('fullscreenchange', () => {
  const btn = document.getElementById('btn-fullscreen');
  const use = btn?.querySelector('use');
  if (use) use.setAttribute('href', document.fullscreenElement ? '#icon-fullscreen-exit' : '#icon-fullscreen');
  if (!document.getElementById('race-view').hidden) { fitCanvas(); draw(); }
});
document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

/* ── Wiring ─────────────────────────────────────────────────── */
document.getElementById('class-grid').addEventListener('click', (e) => {
  const card = e.target.closest('.race-class-card');
  if (card) openRace(card.dataset.id);
});
document.getElementById('btn-start').addEventListener('click', startRace);
document.getElementById('btn-reset').addEventListener('click', () => resetRace(true));
document.getElementById('crumb-tool').addEventListener('click', (e) => {
  e.preventDefault();
  cancelAnimationFrame(state.rafId);
  state.running = false;
  showClassSelect();
});

// Track picker — switching tracks lays out a fresh course immediately.
const trackSelect = document.getElementById('track-select');
trackSelect.innerHTML = TRACKS.map((t) => `<option value="${t.id}">${t.label}</option>`).join('');
trackSelect.addEventListener('change', () => {
  state.trackId = trackSelect.value;
  resetRace(true);
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
  const inRace = !document.getElementById('race-view').hidden;
  if (e.key === ' ' && inRace) {
    e.preventDefault();
    startRace();
  } else if (e.key === 'Escape' && inRace && !document.fullscreenElement) {
    cancelAnimationFrame(state.rafId);
    state.running = false;
    showClassSelect();
  } else if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    toggleFullscreen();
  }
});

window.addEventListener('resize', () => {
  if (!document.getElementById('race-view').hidden) { fitCanvas(); draw(); }
});

showClassSelect();
