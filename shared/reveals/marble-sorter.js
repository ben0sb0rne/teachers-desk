// =============================================================
// shared/reveals/marble-sorter.js — marbles pour from a funnel and
// sort themselves into labeled team bins. Physics is real enough to
// feel like the Marble Race; a gentle steering force guarantees each
// marble lands in its assigned bin (the drama is HOW it gets there,
// not WHERE it ends up — assignments are decided before the pour).
//
// Uses the suite's shared glass-marble material (one paint entry
// point in shared/components/marbles.js).
// =============================================================

import { paintMarble } from '../components/marbles.js';
import { ensureStyles, makeTimers, assignAllInstantly } from './util.js';

const W = 1200;
const H = 760;
const R = 15;                 // marble radius (course units)
const GRAVITY = 620;
const STEER = 2.4;            // pull toward the assigned bin's x
const STEER_MAX = 300;
const WALL_BOUNCE = 0.55;
const SPAWN_EVERY_S = 0.42;
const BIN_TOP = H - 210;      // divider tops

const CSS = `
.rv-sorter { position: absolute; inset: 0; display: flex; }
.rv-sorter canvas { margin: auto; background: rgb(24 27 44); border-radius: 4px; }
`;

export default {
  id: 'sorter',
  label: 'Marble Sorter',
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
    let rafId = 0;
    let simT = 0;
    let lastTs = 0;
    let spawned = 0;
    let landed = 0;
    let destroyed = false;

    // Per-bin stacking: landed marbles pack bottom-up, 4 per row.
    const binCounts = new Array(t).fill(0);
    function slotFor(binIndex, countInBin) {
      const perRow = Math.max(3, Math.floor((binW - 20) / (R * 2 + 4)));
      const row = (countInBin / perRow) | 0;
      const col = countInBin % perRow;
      const inRowW = Math.min(perRow, 99) * (R * 2 + 4);
      const left = binIndex * binW + (binW - Math.min(perRow, ctx.bins[binIndex].size) * (R * 2 + 4)) / 2 + R + 2;
      void inRowW;
      return {
        x: left + col * (R * 2 + 4),
        y: H - 14 - R - row * (R * 2 + 2),
      };
    }

    const marbles = []; // { a: assignment index, x, y, vx, vy, rot, mode: 'fall'|'settle'|'done', sx, sy }

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
      marbles.push({
        a: i,
        color: a.color,
        initials: a.initials,
        binIndex: a.binIndex,
        x: W / 2 + (Math.random() - 0.5) * 120,
        y: -R,
        vx: (Math.random() - 0.5) * 160,
        vy: 40,
        rot: 0,
        mode: 'fall',
      });
    }

    function step(dt) {
      simT += dt;
      while (spawned < ctx.assignments.length && simT > spawned * SPAWN_EVERY_S) spawn();
      for (const m of marbles) {
        if (m.mode === 'done') continue;
        if (m.mode === 'settle') {
          // Ease onto the assigned stack slot, then lock + report.
          m.x += (m.sx - m.x) * Math.min(1, dt * 10);
          m.y += (m.sy - m.y) * Math.min(1, dt * 10);
          m.rot *= 1 - Math.min(1, dt * 4);
          if (Math.abs(m.x - m.sx) < 0.8 && Math.abs(m.y - m.sy) < 0.8) {
            m.x = m.sx; m.y = m.sy; m.mode = 'done';
            landed++;
            ctx.onAssign(m.a);
            if (landed === ctx.assignments.length) {
              timers.after(350, () => ctx.onDone());
            }
          }
          continue;
        }
        // Falling: gravity + steering toward the assigned bin center.
        const targetX = m.binIndex * binW + binW / 2;
        let ax = (targetX - m.x) * STEER;
        if (ax > STEER_MAX) ax = STEER_MAX;
        if (ax < -STEER_MAX) ax = -STEER_MAX;
        m.vx += ax * dt;
        m.vx *= 1 - Math.min(1, dt * 0.8); // light air drag keeps steering sane
        m.vy += GRAVITY * dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.rot += (m.vx / R) * dt;
        // Side walls.
        if (m.x < R) { m.x = R; m.vx = Math.abs(m.vx) * WALL_BOUNCE; }
        if (m.x > W - R) { m.x = W - R; m.vx = -Math.abs(m.vx) * WALL_BOUNCE; }
        // Divider bounce while above the bin mouth.
        if (m.y > BIN_TOP - R && m.y < H - 60) {
          const relX = m.x - m.binIndex * binW;
          if (relX < R + 4) m.x = m.binIndex * binW + R + 4;
          if (relX > binW - R - 4) m.x = m.binIndex * binW + binW - R - 4;
        }
        // Hand off to settle once deep inside the bin.
        const slot = slotFor(m.binIndex, binCounts[m.binIndex]);
        if (m.y >= slot.y - R * 2.4) {
          m.mode = 'settle';
          m.sx = slot.x;
          m.sy = slot.y;
          binCounts[m.binIndex]++;
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
      // Funnel guides.
      g.strokeStyle = 'rgb(205 211 222 / 0.8)';
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 60); g.lineTo(W / 2 - 90, 190); g.stroke();
      g.beginPath(); g.moveTo(W, 60); g.lineTo(W / 2 + 90, 190); g.stroke();
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
