// =============================================================
// shared/reveals/marble-sorter.js — pachinko sort: marbles pour from
// a funnel and ricochet down a brass peg field (the chaos, the
// suspense), then a SORTING LANE below the pegs homes each marble
// into the bin the roster assigned it. The homing is a direct
// position glide + a hard divider wall keyed to the assigned bin, so
// what lands in each bin ALWAYS matches the team list — the physics
// decides the route, never the destination.
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
const MAX_FALL = 300;         // capped descent so the sort stays watchable
const WALL_BOUNCE = 0.55;
const PEG_BOUNCE = 0.62;
const SPAWN_EVERY_S = 0.5;
const BIN_TOP = H - 210;      // divider tops
const PEG_TOP = 170;          // peg field band
const PEG_BOTTOM = BIN_TOP - 150; // sorting lane runs from here to BIN_TOP

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

    const marbles = []; // { a, x, y, vx, vy, rot, calm, born, targetX, mode: 'fall'|'done' }
    // Per-bin arrival counter → each marble homes to a spread slot inside
    // its bin (not the dead center), so a team lands as a tidy row rather
    // than a single occluding stack.
    const binArrived = new Array(t).fill(0);
    function slotTargetX(binIndex) {
      const size = ctx.bins[binIndex].size;
      const slot = binArrived[binIndex]++;
      const usable = binW - 2 * (R + 20);
      const step = size > 1 ? usable / size : 0;
      const offset = (slot + 0.5) * step - usable / 2;
      return binIndex * binW + binW / 2 + offset;
    }

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
        targetX: slotTargetX(a.binIndex),
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
        const targetX = m.targetX;
        m.vy += GRAVITY * dt;
        if (m.vy > MAX_FALL) m.vy = MAX_FALL;
        // Above the pegs and inside them: free physics — the tumble.
        // In the sorting lane (below the pegs) a direct glide homes the
        // marble to its ASSIGNED bin's center, ramping from gentle at
        // the top of the lane to decisive at the mouth. Convergence is
        // guaranteed before BIN_TOP, so no marble crosses into a
        // neighbor's bin.
        // Homing acts ONLY in the lane (above the mouths). Once the
        // marble drops into its bin it's free to pile naturally.
        if (m.y > PEG_BOTTOM && m.y < BIN_TOP) {
          const f = (m.y - PEG_BOTTOM) / (BIN_TOP - PEG_BOTTOM);
          m.x += (targetX - m.x) * (0.10 + 0.28 * f);
          m.vx *= 1 - 0.3 * f;
        }
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.rot += (m.vx / R) * dt;
        // Pegs — circle bounce, same feel as the race. (They live above
        // the sorting lane, so the tumble happens before the homing.)
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
        // Below the mouth, the dividers are hard walls of the marble's
        // ASSIGNED bin — the guarantee that landings match the roster.
        if (m.y > BIN_TOP + R * 0.4) {
          const lo = m.binIndex * binW + R + 4;
          const hi = (m.binIndex + 1) * binW - R - 4;
          if (m.x < lo) { m.x = lo; if (m.vx < 0) m.vx = -m.vx * WALL_BOUNCE; }
          if (m.x > hi) { m.x = hi; if (m.vx > 0) m.vx = -m.vx * WALL_BOUNCE; }
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
