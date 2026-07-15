// =============================================================
// shared/reveals/marble-sorter.js — pachinko sort: marbles pour from
// a funnel, ricochet down a brass peg field, and drop into labeled
// team bins. The pegs own the chaos; a steering force that only
// wakes up BELOW the peg field guarantees each marble still lands in
// its assigned bin (the drama is the route, not the destination —
// assignments are decided before the pour).
//
// Uses the suite's shared glass-marble material (one paint entry
// point in shared/components/marbles.js).
// =============================================================

import { paintMarble } from '../components/marbles.js';
import { ensureStyles, makeTimers, assignAllInstantly } from './util.js';

const W = 1200;
const H = 760;
const R = 15;                 // marble radius (course units)
const PEG_R = 8;
const GRAVITY = 620;
const STEER = 3.2;            // pull toward the assigned bin's x
const STEER_MAX = 420;
const WALL_BOUNCE = 0.55;
const PEG_BOUNCE = 0.62;
const SPAWN_EVERY_S = 0.5;
const BIN_TOP = H - 210;      // divider tops
const PEG_TOP = 190;          // peg field band
const PEG_BOTTOM = BIN_TOP - 90;

const CSS = `
.rv-sorter { position: absolute; inset: 0; display: flex; }
.rv-sorter canvas { margin: auto; background: rgb(24 27 44); border-radius: 4px; }
`;

export default {
  id: 'sorter',
  label: 'Marble Sorter',
  order: 'roundRobin',
  glyph: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l6 6M20 4l-6 6"/><line x1="9" y1="20" x2="9" y2="15"/><line x1="15" y1="20" x2="15" y2="15"/></g><circle cx="12" cy="12" r="2.2" fill="currentColor"/></svg>',

  create(host, ctx) {
    ensureStyles('sorter', CSS);
    const wrap = document.createElement('div');
    wrap.className = 'rv-sorter';
    const canvas = document.createElement('canvas');
    wrap.appendChild(canvas);
    host.appendChild(wrap);
    const g = canvas.getContext('2d');

    const t = ctx.bins.length;
    const binW = W / t;
    const timers = makeTimers();

    // Pachinko peg field: staggered rows between funnel and bins.
    const pegs = [];
    {
      const xStep = 96, yStep = (PEG_BOTTOM - PEG_TOP) / 5;
      for (let row = 0; row < 6; row++) {
        const y = PEG_TOP + row * yStep;
        const offset = row % 2 === 0 ? 0 : xStep / 2;
        for (let x = 52 + offset; x < W - 40; x += xStep) {
          pegs.push({
            x: x + (Math.random() - 0.5) * 10,
            y: y + (Math.random() - 0.5) * 8,
          });
        }
      }
    }
    let rafId = 0;
    let simT = 0;
    let lastTs = 0;
    let spawned = 0;
    let landed = 0;
    let destroyed = false;

    const marbles = []; // { a: assignment index, x, y, vx, vy, rot, calm, born, mode: 'fall'|'done' }

    function fitCanvas() {
      const availW = Math.max(200, host.clientWidth - 8);
      const availH = Math.max(160, host.clientHeight - 8);
      const s = Math.min(availW / W, availH / H);
      canvas.style.width = Math.floor(W * s) + 'px';
      canvas.style.height = Math.floor(H * s) + 'px';
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(W * s * dpr);
      canvas.height = Math.round(H * s * dpr);
    }

    function spawn() {
      const i = spawned++;
      const a = ctx.assignments[i];
      // Pachinko pour: enter from the top edge roughly over the target
      // bin, with enough noise that the peg field decides the route.
      const targetX = a.binIndex * binW + binW / 2;
      const spread = Math.min(binW * 1.5, 360);
      const x = Math.max(R + 4, Math.min(W - R - 4,
        targetX + (Math.random() - 0.5) * spread));
      marbles.push({
        a: i,
        color: a.color,
        initials: a.initials,
        binIndex: a.binIndex,
        x,
        y: -R,
        vx: (Math.random() - 0.5) * 200,
        vy: 40,
        rot: 0,
        calm: 0,
        born: simT,
        mode: 'fall',
      });
    }

    function step(dt) {
      simT += dt;
      while (spawned < ctx.assignments.length && simT > spawned * SPAWN_EVERY_S) spawn();
      for (const m of marbles) {
        if (m.mode === 'done') continue;
        // Falling: gravity everywhere; steering ramps in only BELOW
        // the peg field so pegs own the chaos up top but every marble
        // still funnels into its assigned bin at the bottom. Once a
        // marble is INSIDE its bin the steering lets go entirely —
        // the landing is pure physics, piling where it piles.
        const targetX = m.binIndex * binW + binW / 2;
        // Ramp from mid peg-field: pegs rule the top, the pull firms
        // up through the lower rows, and it's decisive by the mouths.
        const depth = m.y > BIN_TOP
          ? 0
          : Math.max(0, Math.min(1, (m.y - 320) / (BIN_TOP - 320)));
        let ax = (targetX - m.x) * STEER * depth;
        if (ax > STEER_MAX) ax = STEER_MAX;
        if (ax < -STEER_MAX) ax = -STEER_MAX;
        m.vx += ax * dt;
        m.vx *= 1 - Math.min(1, dt * (0.4 + depth * 1.2)); // drag grows with the steer
        m.vy += GRAVITY * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.rot += (m.vx / R) * dt;
        // Pegs — circle bounce, same feel as the race.
        for (const p of pegs) {
          const dx = m.x - p.x, dy = m.y - p.y;
          const rr = R + PEG_R;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0 && d2 < rr * rr) {
            const d = Math.sqrt(d2);
            const nx = dx / d, ny = dy / d;
            m.x = p.x + nx * rr;
            m.y = p.y + ny * rr;
            const vn = m.vx * nx + m.vy * ny;
            if (vn < 0) {
              m.vx -= (1 + PEG_BOUNCE) * vn * nx;
              m.vy -= (1 + PEG_BOUNCE) * vn * ny;
              if (vn < -60) p.hitT = simT;
            }
          }
        }
        // Side walls.
        if (m.x < R) { m.x = R; m.vx = Math.abs(m.vx) * WALL_BOUNCE; }
        if (m.x > W - R) { m.x = W - R; m.vx = -Math.abs(m.vx) * WALL_BOUNCE; }
        // Divider caps — rounded tops so edge hits deflect naturally.
        if (m.y > BIN_TOP - R * 2 && m.y < BIN_TOP + R) {
          for (let k = 1; k < t; k++) {
            const dx = m.x - k * binW, dy = m.y - BIN_TOP;
            const rr = R + 5;
            const d2 = dx * dx + dy * dy;
            if (d2 > 0 && d2 < rr * rr) {
              const d = Math.sqrt(d2);
              const nx = dx / d, ny = dy / d;
              m.x = k * binW + nx * rr;
              m.y = BIN_TOP + ny * rr;
              const vn = m.vx * nx + m.vy * ny;
              if (vn < 0) {
                m.vx -= (1 + WALL_BOUNCE) * vn * nx;
                m.vy -= (1 + WALL_BOUNCE) * vn * ny;
              }
            }
          }
        }
        // Inside the bins the dividers are real walls (of whichever
        // bin the marble is actually over — no teleporting).
        if (m.y > BIN_TOP + R * 0.4) {
          const k = Math.max(0, Math.min(t - 1, Math.floor(m.x / binW)));
          const lo = k * binW + R + 4, hi = (k + 1) * binW - R - 4;
          if (m.x < lo) { m.x = lo; m.vx = Math.abs(m.vx) * WALL_BOUNCE; }
          if (m.x > hi) { m.x = hi; m.vx = -Math.abs(m.vx) * WALL_BOUNCE; }
        }
        // Floor.
        const floorY = H - 6 - R;
        let contact = false;
        if (m.y >= floorY) {
          m.y = floorY;
          if (m.vy > 0) m.vy = -m.vy * 0.3;
          m.vx *= 0.9; // felt friction
          contact = true;
        }
        // The pile — settled marbles are static bodies to land on.
        for (const s of marbles) {
          if (s.mode !== 'done') continue;
          const dx = m.x - s.x, dy = m.y - s.y;
          const rr = R * 2;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0 && d2 < rr * rr) {
            const d = Math.sqrt(d2);
            const nx = dx / d, ny = dy / d;
            m.x = s.x + nx * rr;
            m.y = s.y + ny * rr;
            const vn = m.vx * nx + m.vy * ny;
            if (vn < 0) { m.vx -= 1.3 * vn * nx; m.vy -= 1.3 * vn * ny; }
            m.vx *= 0.96;
            contact = true;
          }
        }
        // Rest: calm on a support for a beat → lock into the pile
        // wherever physics left it. (Timeout guards a rare wedge.)
        const speed = Math.hypot(m.vx, m.vy);
        if (contact && speed < 34 && m.y > BIN_TOP) m.calm += dt;
        else m.calm = 0;
        if ((m.calm > 0.3) || simT - m.born > 14) {
          m.mode = 'done';
          m.rot = 0;
          landed++;
          ctx.onAssign(m.a);
          if (landed === ctx.assignments.length) {
            timers.after(350, () => ctx.onDone());
          }
        }
      }
    }

    function draw() {
      const cw = canvas.width, ch = canvas.height;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cw, ch);
      const s = Math.min(cw / W, ch / H);
      g.setTransform(s, 0, 0, s, (cw - W * s) / 2, (ch - H * s) / 2);

      // Field.
      g.fillStyle = 'rgb(24 27 44)';
      g.fillRect(0, 0, W, H);
      g.lineCap = 'round';
      g.strokeStyle = 'rgb(205 211 222 / 0.8)';
      // Peg field — brass posts; lit teal for a beat after a hit.
      for (const p of pegs) {
        const flash = simT - (p.hitT ?? -9) < 0.18;
        g.fillStyle = 'rgb(140 104 36)';
        g.beginPath(); g.arc(p.x, p.y, PEG_R, 0, Math.PI * 2); g.fill();
        g.fillStyle = flash ? 'rgb(28 168 172)' : 'rgb(214 168 74)';
        g.beginPath(); g.arc(p.x, p.y, PEG_R - 2, 0, Math.PI * 2); g.fill();
      }
      // Bins: dividers + floor + labels.
      g.lineWidth = 5;
      for (let k = 0; k <= t; k++) {
        const x = Math.max(3, Math.min(W - 3, k * binW));
        g.beginPath(); g.moveTo(x, BIN_TOP); g.lineTo(x, H - 4); g.stroke();
      }
      g.beginPath(); g.moveTo(0, H - 4); g.lineTo(W, H - 4); g.stroke();
      g.font = '700 26px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillStyle = 'rgb(246 238 216 / 0.85)';
      ctx.bins.forEach((b, k) => {
        g.fillText(b.label, k * binW + binW / 2, BIN_TOP - 12);
      });
      // Marbles (shared glass material).
      for (const m of marbles) {
        g.save();
        g.translate(m.x, m.y);
        paintMarble(g, m, R);
        g.restore();
      }
    }

    function frame(ts) {
      if (destroyed) return;
      if (!lastTs) lastTs = ts;
      let dt = (ts - lastTs) / 1000;
      lastTs = ts;
      if (dt > 0.08) dt = 0.08;
      step(dt);
      draw();
      if (landed < ctx.assignments.length) {
        rafId = requestAnimationFrame(frame);
      } else {
        draw(); // final settled frame
      }
    }

    fitCanvas();
    draw();
    const onResize = () => { fitCanvas(); draw(); };
    window.addEventListener('resize', onResize);

    return {
      start() {
        if (ctx.reducedMotion) { assignAllInstantly(ctx); return; }
        lastTs = 0;
        rafId = requestAnimationFrame(frame);
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(rafId);
        timers.clear();
        window.removeEventListener('resize', onResize);
        wrap.remove();
      },
    };
  },
};
