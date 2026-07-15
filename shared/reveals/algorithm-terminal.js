// =============================================================
// shared/reveals/algorithm-terminal.js — a deadly serious terminal
// pretends to run a very advanced team-optimization algorithm.
//
// Left: the scrolling log (boot, shuffle, converge, print teams).
// Right: a wall of overstimulating fake diagnostics — matrix rain,
// a rotating wireframe polyhedron, a flickering cohesion heatmap
// with a sweeping trace — plus a row of blinking status LEDs.
// None of it means anything. That's the point. (The shuffle
// happened before the terminal booted. It doesn't know that.)
// =============================================================

import { ensureStyles, makeTimers, assignAllInstantly } from './util.js';

const GREEN = 'rgb(112 232 120)';
const GREEN_DIM = 'rgb(112 232 120 / 0.4)';

const CSS = `
.rv-term {
  position: absolute; inset: 0;
  background: rgb(8 12 8);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  color: ${GREEN};
}
.rv-term-log {
  flex: 1.2;
  min-width: 0;
  padding: 16px 18px;
  font-size: clamp(12px, 1.4vw, 16px);
  line-height: 1.55;
  display: flex; flex-direction: column; justify-content: flex-end;
  overflow: hidden;
  text-shadow: 0 0 6px rgb(112 232 120 / 0.35); /* CRT phosphor bloom */
}
.rv-term-line { white-space: pre-wrap; word-break: break-word; min-height: 1.55em; }
.rv-term-line.is-dim { color: rgb(112 232 120 / 0.55); text-shadow: none; }
.rv-term-line.is-team { color: rgb(246 238 216); text-shadow: 0 0 6px rgb(246 238 216 / 0.25); font-weight: 700; }
.rv-term-cursor::after { content: '█'; animation: rv-term-blink 0.9s steps(1) infinite; }
@keyframes rv-term-blink { 50% { opacity: 0; } }

.rv-term-diag {
  flex: 1;
  min-width: 0;
  border-left: 1px solid rgb(112 232 120 / 0.25);
  display: flex; flex-direction: column;
  padding: 10px;
  gap: 8px;
}
.rv-term-panel {
  position: relative;
  border: 1px solid rgb(112 232 120 / 0.25);
  min-height: 0;
  overflow: hidden;
}
.rv-term-panel canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.rv-term-panel .rv-panel-tag {
  position: absolute; top: 2px; left: 6px;
  font-size: 9px; letter-spacing: 0.14em;
  color: rgb(112 232 120 / 0.6);
  z-index: 1;
}
.rv-term-rain { flex: 1.6; }
.rv-term-wire { flex: 1.2; }
.rv-term-heat { flex: 1.2; }
.rv-term-leds {
  display: flex; gap: 10px; align-items: center;
  font-size: 9px; letter-spacing: 0.12em;
  color: rgb(112 232 120 / 0.7);
  flex: none;
}
.rv-term-led {
  display: inline-flex; align-items: center; gap: 4px;
}
.rv-term-led::before {
  content: '';
  width: 7px; height: 7px; border-radius: 50%;
  background: ${GREEN};
  animation: rv-led 1.3s steps(1) infinite;
}
.rv-term-led:nth-child(2)::before { animation-duration: 0.7s; background: rgb(240 84 28); }
.rv-term-led:nth-child(3)::before { animation-duration: 2.1s; }
.rv-term-led:nth-child(4)::before { animation-duration: 0.45s; background: rgb(246 238 216); }
@keyframes rv-led { 50% { opacity: 0.15; } }
@media (max-width: 700px) { .rv-term-diag { display: none; } }
`;

const RAIN_GLYPHS = '01アイウエオカキクケコサシスセソ+*/<>[]{}#$%';

export default {
  id: 'terminal',
  label: 'Algorithm Terminal',
  order: 'sequential',
  glyph: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><polyline points="7 9 10 12 7 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="15" x2="17" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',

  create(host, ctx) {
    ensureStyles('terminal', CSS);
    const wrap = document.createElement('div');
    wrap.className = 'rv-term';
    wrap.innerHTML = `
      <div class="rv-term-log"></div>
      <div class="rv-term-diag">
        <div class="rv-term-panel rv-term-rain"><span class="rv-panel-tag">ENTROPY FEED</span><canvas></canvas></div>
        <div class="rv-term-panel rv-term-wire"><span class="rv-panel-tag">COHESION MODEL</span><canvas></canvas></div>
        <div class="rv-term-panel rv-term-heat"><span class="rv-panel-tag">AFFINITY MATRIX</span><canvas></canvas></div>
        <div class="rv-term-leds">
          <span class="rv-term-led">CORE</span>
          <span class="rv-term-led">FLUX</span>
          <span class="rv-term-led">SYNC</span>
          <span class="rv-term-led">I/O</span>
        </div>
      </div>`;
    host.appendChild(wrap);

    const scroll = wrap.querySelector('.rv-term-log');
    const rainCv = wrap.querySelector('.rv-term-rain canvas');
    const wireCv = wrap.querySelector('.rv-term-wire canvas');
    const heatCv = wrap.querySelector('.rv-term-heat canvas');

    const timers = makeTimers();
    let cursorEl = null;
    let rafId = 0;
    let destroyed = false;

    /* ── Log lines ─────────────────────────────────────────── */
    function line(text, cls) {
      if (cursorEl) cursorEl.classList.remove('rv-term-cursor');
      const el = document.createElement('div');
      el.className = 'rv-term-line' + (cls ? ' ' + cls : '');
      el.textContent = text;
      el.classList.add('rv-term-cursor');
      cursorEl = el;
      scroll.appendChild(el);
      while (scroll.children.length > 40) scroll.firstChild.remove();
      return el;
    }

    /* ── Diagnostics wall (one rAF for all three canvases) ──── */
    function fit(cv) {
      const dpr = window.devicePixelRatio || 1;
      const w = cv.parentElement.clientWidth;
      const h = cv.parentElement.clientHeight;
      cv.width = Math.max(10, Math.round(w * dpr));
      cv.height = Math.max(10, Math.round(h * dpr));
      return { w: cv.width, h: cv.height };
    }

    // Matrix rain state: per-column head positions.
    let rainCols = [];
    function initRain() {
      const { w } = fit(rainCv);
      const colW = 14 * (window.devicePixelRatio || 1);
      rainCols = Array.from({ length: Math.max(4, Math.floor(w / colW)) }, () => ({
        y: Math.random() * rainCv.height,
        speed: 60 + Math.random() * 160,
      }));
    }

    // Wireframe: icosahedron-ish spinning solid (cube + axis spikes).
    const VERTS = [];
    {
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) VERTS.push([sx, sy, sz]);
      VERTS.push([1.6, 0, 0], [-1.6, 0, 0], [0, 1.6, 0], [0, -1.6, 0], [0, 0, 1.6], [0, 0, -1.6]);
    }
    const EDGES = [
      [0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7],
      [8,1],[8,3],[8,5],[8,7],[9,0],[9,2],[9,4],[9,6],
      [10,2],[10,3],[10,6],[10,7],[11,0],[11,1],[11,4],[11,5],
      [12,4],[12,5],[12,6],[12,7],[13,0],[13,1],[13,2],[13,3],
    ];

    let heatCells = [];
    function initHeat() {
      fit(heatCv);
      heatCells = Array.from({ length: 12 * 6 }, () => Math.random());
    }

    function drawDiagnostics(tSec) {
      // Rain — fade trail, bright heads.
      const rg = rainCv.getContext('2d');
      rg.fillStyle = 'rgb(8 12 8 / 0.18)';
      rg.fillRect(0, 0, rainCv.width, rainCv.height);
      const dpr = window.devicePixelRatio || 1;
      const colW = 14 * dpr;
      rg.font = `${11 * dpr}px ui-monospace, monospace`;
      rainCols.forEach((c, i) => {
        c.y += c.speed * dpr / 60;
        if (c.y > rainCv.height + 40) { c.y = -20; c.speed = 60 + Math.random() * 160; }
        const glyph = RAIN_GLYPHS[(Math.random() * RAIN_GLYPHS.length) | 0];
        rg.fillStyle = GREEN;
        rg.fillText(glyph, i * colW + 2, c.y);
        rg.fillStyle = GREEN_DIM;
        rg.fillText(RAIN_GLYPHS[(Math.random() * RAIN_GLYPHS.length) | 0], i * colW + 2, c.y - 14 * dpr);
      });

      // Wireframe — rotate, project, draw edges.
      const wg = wireCv.getContext('2d');
      fitIfChanged(wireCv);
      wg.clearRect(0, 0, wireCv.width, wireCv.height);
      const cx = wireCv.width / 2, cy = wireCv.height / 2;
      const scale = Math.min(cx, cy) * 0.52;
      const a = tSec * 0.9, b = tSec * 0.6;
      const proj = VERTS.map(([x, y, z]) => {
        let X = x * Math.cos(a) - z * Math.sin(a);
        let Z = x * Math.sin(a) + z * Math.cos(a);
        let Y = y * Math.cos(b) - Z * Math.sin(b);
        Z = y * Math.sin(b) + Z * Math.cos(b);
        const d = 3.2 / (3.2 + Z);
        return [cx + X * scale * d, cy + Y * scale * d];
      });
      wg.strokeStyle = GREEN;
      wg.globalAlpha = 0.8;
      wg.lineWidth = Math.max(1, wireCv.width / 400);
      wg.beginPath();
      for (const [i, j] of EDGES) {
        wg.moveTo(proj[i][0], proj[i][1]);
        wg.lineTo(proj[j][0], proj[j][1]);
      }
      wg.stroke();
      wg.globalAlpha = 1;

      // Heatmap — flickering cells + sweeping trace.
      const hg = heatCv.getContext('2d');
      fitIfChanged(heatCv);
      hg.fillStyle = 'rgb(8 12 8)';
      hg.fillRect(0, 0, heatCv.width, heatCv.height);
      const cols = 12, rows = 6;
      const cw = heatCv.width / cols, chh = heatCv.height / rows;
      for (let k = 0; k < heatCells.length; k++) {
        if (Math.random() < 0.06) heatCells[k] = Math.random();
        const v = heatCells[k];
        hg.fillStyle = `rgb(112 232 120 / ${(0.08 + v * 0.5).toFixed(2)})`;
        hg.fillRect((k % cols) * cw + 1, ((k / cols) | 0) * chh + 1, cw - 2, chh - 2);
      }
      const sweepX = ((tSec * 0.35) % 1) * heatCv.width;
      hg.strokeStyle = 'rgb(246 238 216 / 0.8)';
      hg.lineWidth = Math.max(1, heatCv.width / 300);
      hg.beginPath(); hg.moveTo(sweepX, 0); hg.lineTo(sweepX, heatCv.height); hg.stroke();
    }

    const sizes = new WeakMap();
    function fitIfChanged(cv) {
      const key = cv.parentElement.clientWidth + 'x' + cv.parentElement.clientHeight;
      if (sizes.get(cv) !== key) { fit(cv); sizes.set(cv, key); }
    }

    const t0 = performance.now();
    function frame(now) {
      if (destroyed) return;
      drawDiagnostics((now - t0) / 1000);
      rafId = requestAnimationFrame(frame);
    }

    /* ── The script ────────────────────────────────────────── */
    function run() {
      const names = ctx.assignments.map((a) => a.label ?? a.name);
      const sizesStr = ctx.bins.map((b) => b.size).join('+');
      const seed = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
      let t = 0;
      const at = (ms, fn) => { t += ms; timers.after(t, fn); };

      at(100, () => line('TEAMMAKER v4.2 — quantum cohesion engine', 'is-dim'));
      at(420, () => line(`> roster loaded ......... ${names.length} students`, 'is-dim'));
      at(420, () => line(`> entropy seed .......... 0x${seed}`, 'is-dim'));
      at(380, () => {
        const el = line('> shuffling');
        const scrambler = timers.every(90, () => {
          const a = names[(Math.random() * names.length) | 0];
          const b = names[(Math.random() * names.length) | 0];
          el.textContent = `> shuffling [ ${a} <-> ${b} ]`;
        });
        timers.after(1400, () => {
          clearInterval(scrambler);
          el.textContent = '> shuffling ............. OK';
        });
      });
      at(1650, () => line(`> partition ............. ${sizesStr}`, 'is-dim'));
      at(420, () => {
        const el = line('> optimizing cohesion ');
        let ticks = 0;
        const bar = timers.every(140, () => {
          ticks++;
          el.textContent = '> optimizing cohesion ' +
            '▓'.repeat(Math.min(ticks, 12)) + '░'.repeat(Math.max(0, 12 - ticks));
          if (ticks >= 12) clearInterval(bar);
        });
      });
      at(1900, () => line('> convergence reached ... dE = 0.0031', 'is-dim'));
      at(500, () => line(''));

      // Print each team block; every typed name lands its assignment.
      const byBin = ctx.bins.map((_, k) =>
        ctx.assignments.map((a, i) => ({ a, i })).filter((x) => x.a.binIndex === k));
      byBin.forEach((members, k) => {
        at(420, () => line(`${ctx.bins[k].label.toUpperCase()}`, 'is-team'));
        members.forEach(({ a, i }) => {
          at(300, () => {
            line(`  + ${a.label ?? a.name}`);
            ctx.onAssign(i);
          });
        });
      });

      at(600, () => line(''));
      at(200, () => {
        line('> done. good luck out there.', 'is-dim');
        ctx.onDone();
      });
    }

    initRain();
    initHeat();

    return {
      start() {
        if (ctx.reducedMotion) {
          drawDiagnostics(1.2); // one static frame — no motion
          assignAllInstantly(ctx);
          return;
        }
        rafId = requestAnimationFrame(frame);
        run();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(rafId);
        timers.clear();
        wrap.remove();
      },
    };
  },
};
