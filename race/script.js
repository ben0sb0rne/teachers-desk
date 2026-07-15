// =============================================================
// THE TEACHER'S DESK — Marble Race: the Pinball Parlor
//
// A physics race that produces a full finishing order for a class:
// every student is a marble; the leaderboard fills 1st → last as
// marbles cross the finish line. The course renders as a pinball
// playfield — cream field with printed art, chrome rails, brass
// posts, pop bumpers that flash on hit.
//
// TEXTURE-READY: each material has exactly ONE paint* function
// (rail, post, bumper, marble, playfield art). Hand-drawn textures
// replace the placeholder fills inside that function and nowhere
// else. PALETTE mirrors the --pin-* tokens in style.css: change both.
//
// Suite conventions honored: roster via the roster bridge, winner
// recorded through incrementCallCount, no direct localStorage.
// =============================================================

import {
  getClasses, getRoster, getClassName, incrementCallCount,
} from '../shared/roster-bridge.js';
import { mountSettingsButton } from '../shared/settings.js';
import { marbleColor, initialsOf, paintMarble, paintPool } from '../shared/components/marbles.js';

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
  pegs: [],           // static circles: { x, y, r, b?, hitT? }
  spinners: [],       // rotating bars: { cx, cy, len, speed, phase }
  sparks: [],         // impact particles: { x, y, vx, vy, t, life }
  lastFinishT: 0,     // sim time of the latest finish (drives the sink fade)
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

/* Small course glyphs for the playfield cards (stroke/fill follow the
   card's currentColor — teal at rest, orange when active). */
const TRACK_GLYPHS = {
  pegfield: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="6" cy="9" r="2"/><circle cx="12" cy="9" r="2"/><circle cx="18" cy="9" r="2"/><circle cx="9" cy="15" r="2"/><circle cx="15" cy="15" r="2"/></g></svg>',
  pachinko: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="5" cy="7" r="1.7"/><circle cx="12" cy="7" r="1.7"/><circle cx="19" cy="7" r="1.7"/><circle cx="8.5" cy="12" r="1.7"/><circle cx="15.5" cy="12" r="1.7"/><circle cx="5" cy="17" r="1.7"/><circle cx="12" cy="17" r="1.7"/><circle cx="19" cy="17" r="1.7"/></g></svg>',
  zigzag: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="3 6 21 10 3 14 21 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  spinners: '<svg viewBox="0 0 24 24" aria-hidden="true"><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="7" x2="19" y2="17"/><line x1="19" y1="7" x2="5" y2="17"/></g><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>',
  floors: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 7 10 11"/><polyline points="21 7 14 11"/><polyline points="3 15 12 19"/><polyline points="21 15 16 17.2"/></g></svg>',
  bumpers: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.8" fill="currentColor"/></svg>',
};

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
  state.sparks = [];
  state.lastFinishT = 0;
  // Start pool: pack marbles in rows above the funnel, seeded jitter.
  // Pool SLOTS are shuffled (seeded Fisher-Yates) so roster order gives
  // no positional edge; color/initials stay keyed to the student.
  const order = state.names.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [order[i], order[j]] = [order[j], order[i]];
  }
  state.marbles = order.map((nameIdx, slot) => {
    const perRow = 19;
    const row = (slot / perRow) | 0;
    const col = slot % perRow;
    return {
      name: state.names[nameIdx],
      initials: initialsOf(state.names[nameIdx]),
      color: marbleColor(nameIdx),
      x: W / 2 + (col - perRow / 2 + 0.5) * (MARBLE_R * 2.2) + (rand() - 0.5) * 6,
      y: 34 + row * (MARBLE_R * 2.2) + (rand() - 0.5) * 6,
      vx: 0, vy: 0,
      rot: 0,
      finished: false,
      finishT: 0,
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

/* Impact sparks — a hard hit throws 2–3 short-lived particles off the
   contact normal. Math.random is fine here: sparks are visual only and
   never touch the physics, so the race stays seed-reproducible. */
const SPARK_MIN_VN = 260;   // impact speed that earns sparks
function emitSparks(x, y, nx, ny, strength) {
  if (state.sparks.length > 140) return; // cap: pileups can't spark-storm
  const n = 2 + (Math.random() * 2) | 0;
  for (let i = 0; i < n; i++) {
    const spread = (Math.random() - 0.5) * 1.6;
    const cos = Math.cos(spread), sin = Math.sin(spread);
    const sx = nx * cos - ny * sin, sy = nx * sin + ny * cos;
    const v = 120 + Math.random() * 0.4 * strength;
    state.sparks.push({
      x, y,
      vx: sx * v, vy: sy * v,
      t: 0,
      life: 0.14 + Math.random() * 0.12,
    });
  }
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
    // Rolling rotation — drives the glass swirl so marbles visibly
    // roll rather than slide. Simple v/r approximation.
    m.rot += (m.vx / MARBLE_R) * dt;

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
        if (vn < 0) {
          m.vx -= (1 + bounce) * vn * nx;
          m.vy -= (1 + bounce) * vn * ny;
          // Real impacts light the hardware (grazing contact doesn't,
          // or resting marbles would strobe the field).
          if (vn < -60) p.hitT = state.simTime;
          if (vn < -SPARK_MIN_VN) {
            emitSparks(p.x + nx * p.r, p.y + ny * p.r, nx, ny, -vn);
          }
        }
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
          if (rvn < -SPARK_MIN_VN) {
            emitSparks(a.x + nx * MARBLE_R, a.y + ny * MARBLE_R, nx, ny, -rvn);
          }
        }
      }
    }
  }
  for (const m of alive) {
    if (m.y + MARBLE_R >= FINISH_Y) finishMarble(m);
  }
  // Spark particles — light, short, slightly gravity-bent.
  for (let i = state.sparks.length - 1; i >= 0; i--) {
    const sp = state.sparks[i];
    sp.t += dt;
    if (sp.t >= sp.life) { state.sparks.splice(i, 1); continue; }
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.vy += 700 * dt;
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
  if (vn < 0) {
    m.vx -= (1 + WALL_BOUNCE) * vn * nx;
    m.vy -= (1 + WALL_BOUNCE) * vn * ny;
    if (vn < -SPARK_MIN_VN) emitSparks(cx, cy, nx, ny, -vn);
  }
  return true;
}

function finishMarble(m) {
  m.finished = true;
  m.finishT = state.simTime;
  state.lastFinishT = state.simTime;
  state.results.push(m.name);
  if (state.results.length === 1 && state.classId) {
    // Suite convention: any tool that picks a student records the call.
    incrementCallCount(state.classId, m.name);
  }
  renderResults();
  // The loop stops in frame(), after the last sink-through fade plays out.
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
  // Stop only after the last finisher's sink-through fade has played.
  if (
    state.marbles.length > 0 &&
    state.results.length === state.marbles.length &&
    state.simTime - state.lastFinishT > SINK_S + 0.1
  ) {
    state.running = false;
    return;
  }
  state.rafId = requestAnimationFrame(frame);
}

/* ── Rendering ──────────────────────────────────────────────── */
const canvas = document.getElementById('race-canvas');
const ctx = canvas.getContext('2d');

function fitCanvas() {
  // Fit the course aspect inside the stage, next to the leaderboard.
  // The 24px allowance keeps the cabinet bezel (box-shadow rings in
  // style.css) from clipping against the stage edges.
  const stage = canvas.parentElement;
  const board = stage.querySelector('.race-board');
  const availW = Math.max(100, stage.clientWidth - (board?.offsetWidth ?? 0) - 14 - 24);
  const availH = Math.max(100, stage.clientHeight - 24);
  const s = Math.min(availW / W, availH / H);
  const cssW = Math.floor(W * s);
  const cssH = Math.floor(H * s);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
}

// Parlor palette for the canvas — mirrors the --pin-* tokens in
// style.css (canvas can't read CSS variables). Change both together.
// Fixed values: the machine is a physical object and doesn't theme.
const PALETTE = {
  cream:      'rgb(246 238 216)',
  ink:        'rgb(30 34 56)',
  chrome:     'rgb(205 211 222)',
  chromeDark: 'rgb(122 130 146)',
  brass:      'rgb(214 168 74)',
  brassDark:  'rgb(140 104 36)',
  orange:     'rgb(240 84 28)',
  teal:       'rgb(28 168 172)',
};

// How long hardware stays lit after an impact (seconds of sim time).
const FLASH_S = 0.18;
// How long a finisher takes to sink through the finish slot.
const SINK_S = 0.45;

/* MATERIAL: playfield print — cream base, pinstripe border, rollover
   stars, lane chevrons, checkered finish. A drawn playfield texture
   would replace this function wholesale. */
function paintPlayfield() {
  ctx.fillStyle = PALETTE.cream;
  ctx.fillRect(0, 0, W, H);

  // Pinstripe border — navy rule inside a hot-orange hairline.
  ctx.strokeStyle = 'rgb(30 34 56 / 0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.strokeStyle = 'rgb(240 84 28 / 0.55)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  // (No printed symbols — the field stays open for a hand-drawn
  // playfield texture, which will replace this function wholesale.)

  // Finish band — navy-on-cream checkers.
  for (let x = 0; x < W; x += 24) {
    ctx.fillStyle = ((x / 24) | 0) % 2 === 0 ? PALETTE.ink : 'rgb(214 202 172)';
    ctx.fillRect(x, FINISH_Y, 24, 10);
  }
}

/* MATERIAL: chrome rail — every wall, ramp, and spinner bar. Concentric
   dark/light strokes read as a polished tube; a metal texture would
   swap in here. */
function paintRail(seg) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = PALETTE.chromeDark;
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); ctx.stroke();
  ctx.strokeStyle = PALETTE.chrome;
  ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(seg.x1, seg.y1); ctx.lineTo(seg.x2, seg.y2); ctx.stroke();
}

/* MATERIAL: brass post (small pegs). Flashes teal for FLASH_S after a
   real impact. */
function paintPost(p, now) {
  const flash = now - (p.hitT ?? -9) < FLASH_S;
  if (flash) {
    const t = (now - p.hitT) / FLASH_S;
    ctx.strokeStyle = `rgb(28 168 172 / ${(0.9 * (1 - t)).toFixed(2)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = PALETTE.brassDark;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = flash ? PALETTE.teal : PALETTE.brass;
  ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, p.r - 2.2), 0, Math.PI * 2); ctx.fill();
}

/* MATERIAL: pop bumper (big lively circles). Chrome skirt, cream body,
   orange cap; the whole cap burns bright while lit. */
function paintBumper(p, now) {
  const flash = now - (p.hitT ?? -9) < FLASH_S;
  if (flash) {
    const t = (now - p.hitT) / FLASH_S;
    ctx.strokeStyle = `rgb(240 84 28 / ${(0.85 * (1 - t)).toFixed(2)})`;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = PALETTE.chromeDark;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.chrome;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.cream;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = flash ? 'rgb(255 128 60)' : PALETTE.orange;
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.45, 0, Math.PI * 2); ctx.fill();
}

/* MATERIAL: spinner hub — brass bearing the bar swings on. */
function paintHub(s) {
  ctx.fillStyle = PALETTE.brassDark;
  ctx.beginPath(); ctx.arc(s.cx, s.cy, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.brass;
  ctx.beginPath(); ctx.arc(s.cx, s.cy, 6.5, 0, Math.PI * 2); ctx.fill();
}

/* MATERIAL: glass marble — shared suite material, one paint entry
   point for all tools: shared/components/marbles.js paintMarble. */

function draw() {
  const cw = canvas.width, ch = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const scale = Math.min(cw / W, ch / H);
  ctx.setTransform(scale, 0, 0, scale, (cw - W * scale) / 2, (ch - H * scale) / 2);
  const now = state.simTime;

  paintPlayfield();
  for (const s of state.segments) paintRail(s);
  for (const s of state.spinners) {
    paintRail(spinnerSegment(s, now));
    paintHub(s);
  }
  for (const p of state.pegs) {
    if (p.r >= 20) paintBumper(p, now);
    else paintPost(p, now);
  }

  // Shadow pass — one soft navy print under every live marble, cast
  // slightly down-right by the parlor's overhead light.
  ctx.fillStyle = 'rgb(30 34 56 / 0.14)';
  for (const m of state.marbles) {
    if (m.finished) continue;
    ctx.beginPath();
    ctx.ellipse(m.x + 3, m.y + 5, MARBLE_R * 0.92, MARBLE_R * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Marbles with initials — the leaderboard's color dots are the full key.
  // Finishers sink through the slot: shrink + fade at the crossing point.
  for (const m of state.marbles) {
    if (!m.finished) continue;
    const t = (now - m.finishT) / SINK_S;
    if (t < 0 || t >= 1) continue;
    const s = 1 - 0.45 * t;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.translate(m.x, m.y + 9 * t);
    ctx.scale(s, s);
    paintMarble(ctx, m, MARBLE_R);
    ctx.restore();
  }

  for (const m of state.marbles) {
    if (m.finished) continue;
    ctx.save();
    ctx.translate(m.x, m.y);
    paintMarble(ctx, m, MARBLE_R);
    ctx.restore();
  }

  // Impact sparks — white-hot core over an orange streak.
  ctx.lineCap = 'round';
  for (const sp of state.sparks) {
    const a = 1 - sp.t / sp.life;
    const tx = sp.x - sp.vx * 0.03, ty = sp.y - sp.vy * 0.03;
    ctx.strokeStyle = `rgb(240 84 28 / ${(0.8 * a).toFixed(2)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = `rgb(255 235 200 / ${(0.9 * a).toFixed(2)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(tx, ty); ctx.stroke();
  }
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
  document.body.classList.remove('app-view', 'is-parlor');
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
  // Paint each card's marble pool — the class IS its marbles (shared
  // suite pattern; see shared/components/marbles.js paintPool).
  grid.querySelectorAll('.race-class-card').forEach((card) => {
    paintPool(card.querySelector('.race-card-marbles'), getRoster(card.dataset.id));
  });
}

function openRace(classId) {
  state.classId = classId;
  state.names = getRoster(classId);
  if (state.names.length === 0) return;
  // app-view creams the topstrip (suite pattern); is-parlor kills the
  // wood desk and turns the room lights off for the machine.
  document.body.classList.add('app-view', 'is-parlor');
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

// Track picker — named playfield cards; switching lays out a fresh
// course immediately.
const trackCardsHost = document.getElementById('track-cards');

function renderTrackCards() {
  trackCardsHost.innerHTML = TRACKS.map((t) => {
    const active = t.id === state.trackId;
    return `<button type="button" class="track-card${active ? ' is-active' : ''}"
      data-id="${t.id}" aria-pressed="${active}">
      ${TRACK_GLYPHS[t.id] ?? ''}<span>${t.label}</span>
    </button>`;
  }).join('');
}

trackCardsHost.addEventListener('click', (e) => {
  const card = e.target.closest('.track-card');
  if (!card || card.dataset.id === state.trackId) return;
  state.trackId = card.dataset.id;
  renderTrackCards();
  resetRace(true);
});

renderTrackCards();

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
