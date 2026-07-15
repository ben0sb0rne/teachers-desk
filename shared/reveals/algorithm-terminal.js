// =============================================================
// shared/reveals/algorithm-terminal.js — a deadly serious terminal
// pretends to run a very advanced team-optimization algorithm.
//
// The stage is a full CRT workstation: a main log window plus a
// randomized wall of little diagnostic windows drawn from a pool —
// matrix rain that occasionally spells a student's name, a spinning
// wireframe, an affinity heatmap, an oscilloscope, a hexdump whose
// ASCII column leaks the roster, vector readouts, radar blips
// tagged with initials, gauges, process spinners, a file loader.
// Every mount picks a different set, so no two runs look alike.
// Scanlines, vignette, a slow CRT roll bar, and a synthesized
// soundtrack (WebAudio — key ticks, beeps, hum; honors the suite's
// soundMuted / soundVolume prefs) finish the machine.
//
// skinClass: the host tool applies 'rv-skin-terminal' to the reveal
// view while this module is mounted, so the team board and controls
// go diegetic — green phosphor, mono, part of the workstation.
// None of the math means anything. That's the point.
// =============================================================

import { getPreference } from '../storage.js';
import { ensureStyles, makeTimers, assignAllInstantly } from './util.js';

const GREEN = 'rgb(112 232 120)';
const GREEN_DIM = 'rgb(112 232 120 / 0.4)';
const CREAM = 'rgb(246 238 216)';
const RAIN_GLYPHS = '01アイウエオカキクケコサシスセソ+*/<>[]{}#$%';

const CSS = `
.rv-term {
  position: absolute; inset: 0;
  background: rgb(8 12 8);
  border-radius: 4px;
  overflow: hidden;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  color: ${GREEN};
}
/* ── CRT filter ─────────────────────────────────────────────── */
.rv-term::after {
  content: ''; position: absolute; inset: 0; z-index: 40;
  pointer-events: none;
  background: repeating-linear-gradient(0deg, rgb(0 0 0 / 0.22) 0 1px, transparent 1px 3px);
}
.rv-term::before {
  content: ''; position: absolute; inset: 0; z-index: 41;
  pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 58%, rgb(0 0 0 / 0.45) 100%);
  animation: rv-crt-flicker 3.7s steps(3) infinite;
}
@keyframes rv-crt-flicker { 0%,100% { opacity: 1; } 92% { opacity: 0.86; } 96% { opacity: 1; } 98% { opacity: 0.92; } }
.rv-crt-roll {
  position: absolute; left: 0; right: 0; height: 90px; z-index: 42;
  pointer-events: none;
  background: linear-gradient(180deg, transparent, rgb(112 232 120 / 0.05), transparent);
  animation: rv-crt-roll 7s linear infinite;
}
@keyframes rv-crt-roll { from { top: -12%; } to { top: 112%; } }

/* ── Window manager ─────────────────────────────────────────── */
.rv-term-grid {
  position: absolute; inset: 0; z-index: 1;
  display: flex; gap: 8px; padding: 10px;
}
.rv-term-main { flex: 1.2; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.rv-term-side { flex: 0.85; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.rv-win {
  display: flex; flex-direction: column;
  min-height: 0; min-width: 0;
  border: 1px solid rgb(112 232 120 / 0.3);
  background: rgb(6 10 6 / 0.65);
}
.rv-win-bar {
  flex: none;
  display: flex; justify-content: space-between; align-items: center;
  padding: 2px 6px;
  font-size: 9px; letter-spacing: 0.14em;
  color: rgb(112 232 120 / 0.65);
  border-bottom: 1px solid rgb(112 232 120 / 0.22);
}
.rv-win-bar .rv-win-dots { letter-spacing: 0.2em; opacity: 0.6; }
.rv-win-body { flex: 1; position: relative; min-height: 0; overflow: hidden; }
.rv-win-body canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.rv-win-body pre {
  margin: 0; padding: 4px 7px;
  font-size: 10px; line-height: 1.5;
  color: rgb(112 232 120 / 0.85);
  white-space: pre; overflow: hidden; height: 100%;
}
.rv-win-body pre .rv-hot { color: ${CREAM}; }

/* ── Main log ───────────────────────────────────────────────── */
.rv-term-log {
  position: absolute; inset: 0;
  padding: 8px 12px;
  font-size: clamp(12px, 1.3vw, 15px);
  line-height: 1.5;
  display: flex; flex-direction: column; justify-content: flex-end;
  overflow: hidden;
  text-shadow:
    0.6px 0 rgb(255 60 60 / 0.16),
    -0.6px 0 rgb(60 160 255 / 0.16),
    0 0 6px rgb(112 232 120 / 0.35);
}
.rv-term-line { white-space: pre-wrap; word-break: break-word; min-height: 1.5em; }
.rv-term-line.is-dim { color: rgb(112 232 120 / 0.55); }
.rv-term-line.is-team { color: ${CREAM}; text-shadow: 0 0 6px rgb(246 238 216 / 0.25); font-weight: 700; }
.rv-term-cursor::after { content: '█'; animation: rv-term-blink 0.9s steps(1) infinite; }
@keyframes rv-term-blink { 50% { opacity: 0; } }
.rv-term-leds {
  flex: none;
  display: flex; gap: 12px; align-items: center;
  padding: 3px 2px 0;
  font-size: 9px; letter-spacing: 0.12em;
  color: rgb(112 232 120 / 0.7);
}
.rv-term-led { display: inline-flex; align-items: center; gap: 4px; }
.rv-term-led::before {
  content: '';
  width: 7px; height: 7px; border-radius: 50%;
  background: ${GREEN};
  animation: rv-led 1.3s steps(1) infinite;
}
.rv-term-led:nth-child(2)::before { animation-duration: 0.7s; background: rgb(240 84 28); }
.rv-term-led:nth-child(3)::before { animation-duration: 2.1s; }
.rv-term-led:nth-child(4)::before { animation-duration: 0.45s; background: ${CREAM}; }
.rv-term-led:nth-child(5)::before { animation-duration: 1.7s; }
@keyframes rv-led { 50% { opacity: 0.15; } }
@media (max-width: 760px) { .rv-term-side { display: none; } }

/* ── Diegetic skin: the tool's board + controls join the CRT ── */
.rv-skin-terminal .team-board {
  background: rgb(8 12 8);
  border-color: rgb(112 232 120 / 0.4);
  color: ${GREEN};
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
}
.rv-skin-terminal .team-board h2 {
  color: rgb(112 232 120 / 0.8);
  border-color: rgb(112 232 120 / 0.35);
}
.rv-skin-terminal .team-col h3 { color: ${CREAM}; }
.rv-skin-terminal .team-col li .dot { display: none; }
.rv-skin-terminal .team-col li.is-empty { color: rgb(112 232 120 / 0.35); }
.rv-skin-terminal .team-col li.is-new { background: rgb(112 232 120 / 0.14); }
.rv-skin-terminal .reveal-header { color: ${GREEN}; }
.rv-skin-terminal .reveal-header h1 {
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  letter-spacing: 0.04em;
}
.rv-skin-terminal .reveal-header h1::before { content: '> '; }
.rv-skin-terminal .reveal-controls button {
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  background: rgb(8 12 8);
  color: ${GREEN};
  border: 1px solid rgb(112 232 120 / 0.55);
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  box-shadow: none;
}
.rv-skin-terminal .reveal-controls button:hover { background: rgb(112 232 120 / 0.12); }
.rv-skin-terminal .reveal-controls button[disabled] { opacity: 0.4; }
.rv-skin-terminal .reveal-stage { border-color: rgb(112 232 120 / 0.4); }
`;

/* ── Synth — everything is oscillators; no assets ───────────── */
function makeSynth() {
  let ac = null;
  const muted = () => !!getPreference('soundMuted', false);
  const vol = () => 0.5 * Number(getPreference('soundVolume', 0.6));
  function ensure() {
    if (muted()) return null;
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function blip(freq, dur = 0.05, type = 'square', v = 1, when = 0) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + when;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, v * vol() * 0.25), t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  let humNodes = null;
  return {
    tick() { blip(1300 + Math.random() * 800, 0.014, 'square', 0.22); },
    soft() { blip(500 + Math.random() * 260, 0.03, 'sine', 0.18); },
    ok() { blip(740, 0.05, 'square', 0.4); blip(1180, 0.06, 'square', 0.4, 0.07); },
    glitchy() { blip(180 + Math.random() * 120, 0.05, 'sawtooth', 0.22); },
    team(k) {
      const base = 300 * Math.pow(1.12, k);
      blip(base, 0.09, 'triangle', 0.65);
      blip(base * 1.33, 0.09, 'triangle', 0.65, 0.09);
      blip(base * 1.66, 0.13, 'triangle', 0.7, 0.18);
    },
    done() {
      [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.12, 'triangle', 0.7, i * 0.11));
    },
    humOn() {
      const c = ensure();
      if (!c || humNodes) return;
      humNodes = [55, 110].map((f, i) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'triangle';
        osc.frequency.value = f;
        g.gain.value = (i === 0 ? 0.014 : 0.007) * vol();
        osc.connect(g).connect(c.destination);
        osc.start();
        return { osc, g };
      });
    },
    humOff() {
      if (!humNodes) return;
      for (const { osc, g } of humNodes) {
        try { g.gain.setTargetAtTime(0.0001, osc.context.currentTime, 0.08); osc.stop(osc.context.currentTime + 0.4); } catch (e) { void e; }
      }
      humNodes = null;
    },
    dispose() {
      this.humOff();
      if (ac) { try { ac.close(); } catch (e) { void e; } ac = null; }
    },
  };
}

/* ── Small helpers ──────────────────────────────────────────── */
function pad(s, n) { return (s + ' '.repeat(n)).slice(0, n); }
function hex2(v) { return v.toString(16).padStart(2, '0').toUpperCase(); }
function slug(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ── The diagnostic-window pool ─────────────────────────────────
   Each factory returns { tag, kind: 'canvas'|'dom', flex,
   mount(bodyEl), draw?(g, w, h, t), tickMs?, tick?() }. Canvas
   panels are driven by the module's single rAF; DOM panels by
   timers. Factories close over the roster so names leak into
   everything. */
function buildPanelPool(names, initials) {
  const rain = () => {
    let cols = [];
    let nameDrop = null; // { col, word, t0 }
    return {
      tag: 'ENTROPY FEED', kind: 'canvas', flex: 1.5,
      draw(g, w, h, t) {
        if (cols.length === 0 || Math.abs(cols._w - w) > 2) {
          const n = Math.max(4, Math.floor(w / (14 * dpr())));
          cols = Array.from({ length: n }, () => ({ y: Math.random() * h, speed: 60 + Math.random() * 160 }));
          cols._w = w;
          g.fillStyle = 'rgb(8 12 8)';
          g.fillRect(0, 0, w, h);
        }
        g.fillStyle = 'rgb(8 12 8 / 0.18)';
        g.fillRect(0, 0, w, h);
        const cw = 14 * dpr();
        g.font = `${11 * dpr()}px ui-monospace, monospace`;
        cols.forEach((c, i) => {
          c.y += (c.speed * dpr()) / 60;
          if (c.y > h + 40) { c.y = -20; c.speed = 60 + Math.random() * 160; }
          g.fillStyle = GREEN;
          g.fillText(RAIN_GLYPHS[(Math.random() * RAIN_GLYPHS.length) | 0], i * cw + 2, c.y);
          g.fillStyle = GREEN_DIM;
          g.fillText(RAIN_GLYPHS[(Math.random() * RAIN_GLYPHS.length) | 0], i * cw + 2, c.y - 14 * dpr());
        });
        // Every few seconds one column briefly rains a student's name.
        if (!nameDrop && Math.random() < 0.006) {
          nameDrop = {
            col: (Math.random() * cols.length) | 0,
            word: names[(Math.random() * names.length) | 0].toUpperCase().replace(/\s+/g, ''),
            t0: t,
          };
        }
        if (nameDrop) {
          const age = t - nameDrop.t0;
          if (age > 2.2) nameDrop = null;
          else {
            g.fillStyle = CREAM;
            const chars = nameDrop.word.slice(0, Math.max(1, Math.floor(age * 9)));
            for (let k = 0; k < chars.length; k++) {
              g.fillText(chars[k], nameDrop.col * cw + 2, 16 * dpr() + k * 13 * dpr());
            }
          }
        }
      },
    };
  };

  const wire = () => {
    const VERTS = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) VERTS.push([sx, sy, sz]);
    VERTS.push([1.6, 0, 0], [-1.6, 0, 0], [0, 1.6, 0], [0, -1.6, 0], [0, 0, 1.6], [0, 0, -1.6]);
    const EDGES = [
      [0,1],[0,2],[0,4],[1,3],[1,5],[2,3],[2,6],[3,7],[4,5],[4,6],[5,7],[6,7],
      [8,1],[8,3],[8,5],[8,7],[9,0],[9,2],[9,4],[9,6],
      [10,2],[10,3],[10,6],[10,7],[11,0],[11,1],[11,4],[11,5],
      [12,4],[12,5],[12,6],[12,7],[13,0],[13,1],[13,2],[13,3],
    ];
    const sa = 0.5 + Math.random() * 0.9, sb = 0.35 + Math.random() * 0.7;
    return {
      tag: 'COHESION MODEL', kind: 'canvas', flex: 1.1,
      draw(g, w, h, t) {
        g.clearRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2;
        const scale = Math.min(cx, cy) * 0.5;
        const a = t * sa, b = t * sb;
        const proj = VERTS.map(([x, y, z]) => {
          let X = x * Math.cos(a) - z * Math.sin(a);
          let Z = x * Math.sin(a) + z * Math.cos(a);
          const Y = y * Math.cos(b) - Z * Math.sin(b);
          Z = y * Math.sin(b) + Z * Math.cos(b);
          const d = 3.2 / (3.2 + Z);
          return [cx + X * scale * d, cy + Y * scale * d];
        });
        g.strokeStyle = GREEN;
        g.globalAlpha = 0.8;
        g.lineWidth = Math.max(1, w / 400);
        g.beginPath();
        for (const [i, j] of EDGES) { g.moveTo(proj[i][0], proj[i][1]); g.lineTo(proj[j][0], proj[j][1]); }
        g.stroke();
        g.globalAlpha = 1;
      },
    };
  };

  const heat = () => {
    const cells = Array.from({ length: 12 * 6 }, () => Math.random());
    return {
      tag: 'AFFINITY MATRIX', kind: 'canvas', flex: 1.1,
      draw(g, w, h, t) {
        g.fillStyle = 'rgb(8 12 8)';
        g.fillRect(0, 0, w, h);
        const cols = 12, rows = 6;
        const cw = w / cols, ch = h / rows;
        for (let k = 0; k < cells.length; k++) {
          if (Math.random() < 0.06) cells[k] = Math.random();
          g.fillStyle = `rgb(112 232 120 / ${(0.08 + cells[k] * 0.5).toFixed(2)})`;
          g.fillRect((k % cols) * cw + 1, ((k / cols) | 0) * ch + 1, cw - 2, ch - 2);
        }
        const sweepX = ((t * 0.35) % 1) * w;
        g.strokeStyle = 'rgb(246 238 216 / 0.8)';
        g.lineWidth = Math.max(1, w / 300);
        g.beginPath(); g.moveTo(sweepX, 0); g.lineTo(sweepX, h); g.stroke();
      },
    };
  };

  const scope = () => {
    const f1 = 2 + Math.random() * 3, f2 = 5 + Math.random() * 6;
    let glitch = 0;
    return {
      tag: 'WAVEFORM', kind: 'canvas', flex: 0.8,
      draw(g, w, h, t) {
        g.fillStyle = 'rgb(8 12 8 / 0.35)';
        g.fillRect(0, 0, w, h);
        if (Math.random() < 0.01) glitch = t;
        const glitching = t - glitch < 0.15;
        g.strokeStyle = glitching ? CREAM : GREEN;
        g.lineWidth = Math.max(1, w / 350);
        g.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const p = x / w;
          let y = h / 2 +
            Math.sin(p * f1 * Math.PI * 2 + t * 3) * h * 0.22 +
            Math.sin(p * f2 * Math.PI * 2 - t * 5) * h * 0.1;
          if (glitching) y += (Math.random() - 0.5) * h * 0.4;
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      },
    };
  };

  const radar = () => {
    const blips = shuffled(initials).slice(0, 8).map((ini) => ({
      ini,
      ang: Math.random() * Math.PI * 2,
      rad: 0.25 + Math.random() * 0.65,
    }));
    return {
      tag: 'PROXIMITY SCAN', kind: 'canvas', flex: 1.1,
      draw(g, w, h, t) {
        g.fillStyle = 'rgb(8 12 8 / 0.25)';
        g.fillRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2;
        const rad = Math.min(cx, cy) * 0.92;
        g.strokeStyle = GREEN_DIM;
        g.lineWidth = 1;
        for (const rr of [0.33, 0.66, 1]) {
          g.beginPath(); g.arc(cx, cy, rad * rr, 0, Math.PI * 2); g.stroke();
        }
        const sweep = t * 1.4;
        g.strokeStyle = GREEN;
        g.beginPath(); g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(sweep) * rad, cy + Math.sin(sweep) * rad);
        g.stroke();
        g.font = `${9 * dpr()}px ui-monospace, monospace`;
        for (const b of blips) {
          const lit = Math.abs(((sweep - b.ang) % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2) < 0.9;
          g.fillStyle = lit ? CREAM : GREEN_DIM;
          const bx = cx + Math.cos(b.ang) * rad * b.rad;
          const by = cy + Math.sin(b.ang) * rad * b.rad;
          g.fillRect(bx - 1.5, by - 1.5, 3, 3);
          g.fillText(b.ini, bx + 4, by + 3);
        }
      },
    };
  };

  const gauges = () => {
    const n = 5 + ((Math.random() * 3) | 0);
    const bars = Array.from({ length: n }, () => ({ v: Math.random(), target: Math.random() }));
    return {
      tag: 'FLUX LEVELS', kind: 'canvas', flex: 0.8,
      draw(g, w, h) {
        g.fillStyle = 'rgb(8 12 8)';
        g.fillRect(0, 0, w, h);
        const bw = w / bars.length;
        bars.forEach((b, i) => {
          if (Math.random() < 0.02) b.target = Math.random();
          b.v += (b.target - b.v) * 0.06;
          const bh = b.v * (h - 8);
          g.fillStyle = `rgb(112 232 120 / ${(0.35 + b.v * 0.5).toFixed(2)})`;
          g.fillRect(i * bw + 3, h - 4 - bh, bw - 6, bh);
          g.strokeStyle = GREEN_DIM;
          g.strokeRect(i * bw + 3, 4, bw - 6, h - 8);
        });
      },
    };
  };

  const hexdump = () => {
    let addr = 0x3f20;
    let el = null;
    let rows = [];
    return {
      tag: 'CORE DUMP', kind: 'dom', flex: 1.1, tickMs: 300,
      mount(body) {
        el = document.createElement('pre');
        body.appendChild(el);
      },
      tick() {
        const name = names[(Math.random() * names.length) | 0].toUpperCase();
        const chunk = pad(name, 8);
        const bytes = [...chunk].map((ch) => hex2(ch.charCodeAt(0) || 0)).join(' ');
        rows.push(`${addr.toString(16).padStart(6, '0').toUpperCase()}  ${bytes}  <span class="rv-hot">${chunk}</span>`);
        addr += 16;
        if (rows.length > 16) rows = rows.slice(-16);
        el.innerHTML = rows.join('\n');
      },
    };
  };

  const vectors = () => {
    let el = null;
    const rowNames = shuffled(names).slice(0, 10);
    return {
      tag: 'STUDENT VECTORS', kind: 'dom', flex: 1.2, tickMs: 380,
      mount(body) {
        el = document.createElement('pre');
        body.appendChild(el);
      },
      tick() {
        el.innerHTML = rowNames.map((n) => {
          const v = Math.random();
          const bar = '▓'.repeat(Math.round(v * 8)) + '░'.repeat(8 - Math.round(v * 8));
          return `<span class="rv-hot">${pad(n.split(' ')[0].toUpperCase(), 9)}</span> ${v.toFixed(4)} ${bar}`;
        }).join('\n');
      },
    };
  };

  const procs = () => {
    let el = null;
    const SPIN = '|/-\\';
    const jobs = ['cohese', 'entropy', 'kmeans', 'anneal', 'chi_sq', 'stir'].slice(0, 4 + ((Math.random() * 3) | 0))
      .map((j) => ({ j, pct: Math.random() * 60, s: 0 }));
    return {
      tag: 'PROCESSES', kind: 'dom', flex: 0.9, tickMs: 130,
      mount(body) {
        el = document.createElement('pre');
        body.appendChild(el);
      },
      tick() {
        el.textContent = jobs.map((job) => {
          job.s = (job.s + 1) % 4;
          job.pct += Math.random() * 3;
          if (job.pct >= 100) job.pct = Math.random() * 20;
          return `${SPIN[job.s]} ${pad(job.j, 8)} ${String(Math.floor(job.pct)).padStart(2)}%`;
        }).join('\n');
      },
    };
  };

  const files = () => {
    let el = null;
    let lines = [];
    const queue = shuffled(names);
    let qi = 0;
    return {
      tag: 'I/O STREAM', kind: 'dom', flex: 1.0, tickMs: 340,
      mount(body) {
        el = document.createElement('pre');
        body.appendChild(el);
        lines.push('> mount /dev/roster ......... OK');
      },
      tick() {
        const n = queue[qi % queue.length];
        qi++;
        lines.push(`> load /var/cohort/<span class="rv-hot">${slug(n)}</span>.vec .. OK`);
        if (lines.length > 12) lines = lines.slice(-12);
        el.innerHTML = lines.join('\n');
      },
    };
  };

  return [rain, wire, heat, scope, radar, gauges, hexdump, vectors, procs, files];
}

function dpr() { return window.devicePixelRatio || 1; }

export default {
  id: 'terminal',
  label: 'Algorithm Terminal',
  order: 'sequential',
  skinClass: 'rv-skin-terminal',
  glyph: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><polyline points="7 9 10 12 7 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="15" x2="17" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',

  create(host, ctx) {
    ensureStyles('terminal', CSS);
    const names = ctx.assignments.map((a) => a.name);
    const labels = ctx.assignments.map((a) => a.label ?? a.name);
    const inis = ctx.assignments.map((a) => a.initials);

    const wrap = document.createElement('div');
    wrap.className = 'rv-term';
    wrap.innerHTML = `
      <div class="rv-term-grid">
        <div class="rv-term-main">
          <div class="rv-win" style="flex:1">
            <div class="rv-win-bar"><span>COHESION.LOG</span><span class="rv-win-dots">▪ ▪ ▫</span></div>
            <div class="rv-win-body"><div class="rv-term-log"></div></div>
          </div>
          <div class="rv-term-leds">
            <span class="rv-term-led">CORE</span>
            <span class="rv-term-led">FLUX</span>
            <span class="rv-term-led">SYNC</span>
            <span class="rv-term-led">I/O</span>
            <span class="rv-term-led">CHAOS</span>
          </div>
        </div>
        <div class="rv-term-side" data-col="0"></div>
        <div class="rv-term-side" data-col="1"></div>
      </div>
      <div class="rv-crt-roll"></div>`;
    host.appendChild(wrap);

    const scroll = wrap.querySelector('.rv-term-log');
    const timers = makeTimers();
    const synth = makeSynth();
    let cursorEl = null;
    let rafId = 0;
    let destroyed = false;

    /* Pick a different diagnostic wall every mount. */
    const pool = buildPanelPool(names, inis);
    const chosen = shuffled(pool).slice(0, 6).map((f) => f());
    const canvasPanels = [];
    const sideEls = wrap.querySelectorAll('.rv-term-side');
    chosen.forEach((p, i) => {
      const win = document.createElement('div');
      win.className = 'rv-win';
      win.style.flex = String(p.flex ?? 1);
      win.innerHTML =
        `<div class="rv-win-bar"><span>${p.tag}</span><span class="rv-win-dots">▪ ▪ ▫</span></div>` +
        '<div class="rv-win-body"></div>';
      sideEls[i % 2].appendChild(win);
      const body = win.querySelector('.rv-win-body');
      if (p.kind === 'canvas') {
        const cv = document.createElement('canvas');
        body.appendChild(cv);
        canvasPanels.push({ p, cv });
      } else {
        p.mount(body);
        // DOM tickers start ticking immediately — the wall is alive
        // even before the teacher hits Run.
        timers.every(p.tickMs, () => p.tick());
        p.tick();
      }
    });

    const sizes = new WeakMap();
    function fitIfChanged(cv) {
      const key = cv.parentElement.clientWidth + 'x' + cv.parentElement.clientHeight;
      if (sizes.get(cv) !== key) {
        const d = dpr();
        cv.width = Math.max(10, Math.round(cv.parentElement.clientWidth * d));
        cv.height = Math.max(10, Math.round(cv.parentElement.clientHeight * d));
        sizes.set(cv, key);
      }
    }

    const t0 = performance.now();
    function frame(now) {
      if (destroyed) return;
      const t = (now - t0) / 1000;
      for (const { p, cv } of canvasPanels) {
        fitIfChanged(cv);
        p.draw(cv.getContext('2d'), cv.width, cv.height, t);
      }
      rafId = requestAnimationFrame(frame);
    }

    /* ── Log ───────────────────────────────────────────────── */
    function line(text, cls, silent) {
      if (cursorEl) cursorEl.classList.remove('rv-term-cursor');
      const el = document.createElement('div');
      el.className = 'rv-term-line' + (cls ? ' ' + cls : '');
      el.textContent = text;
      el.classList.add('rv-term-cursor');
      cursorEl = el;
      scroll.appendChild(el);
      while (scroll.children.length > 40) scroll.firstChild.remove();
      if (!silent) synth.tick();
      return el;
    }

    /* Boot chatter varies per run — sampled from a nonsense pool. */
    const BOOT_POOL = [
      '> thermal drift ......... nominal',
      '> handshake GRADEBOOK ... DENIED (expected)',
      '> psychic dampeners ..... engaged',
      '> caffeine reserves ..... CRITICAL',
      '> tuning chaos lattice .. done',
      '> friendship tensor ..... loaded',
      '> drama coefficients .... clamped',
      '> recess variable ....... ignored',
    ];

    function run() {
      const sizesStr = ctx.bins.map((b) => b.size).join('+');
      const seed = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
      let t = 0;
      const at = (ms, fn) => { t += ms; timers.after(t, fn); };

      synth.humOn();
      at(100, () => { line('TEAMMAKER v4.2 — quantum cohesion engine', 'is-dim'); synth.ok(); });
      at(400, () => line(`> roster loaded ......... ${names.length} students`, 'is-dim'));
      at(360, () => line(`> entropy seed .......... 0x${seed}`, 'is-dim'));
      for (const extra of shuffled(BOOT_POOL).slice(0, 2 + ((Math.random() * 2) | 0))) {
        at(300 + Math.random() * 200, () => line(extra, 'is-dim'));
      }
      at(380, () => {
        const el = line('> shuffling');
        const scrambler = timers.every(90, () => {
          const a = labels[(Math.random() * labels.length) | 0];
          const b = labels[(Math.random() * labels.length) | 0];
          el.textContent = `> shuffling [ ${a} <-> ${b} ]`;
          if (Math.random() < 0.5) synth.soft();
        });
        timers.after(1400, () => {
          clearInterval(scrambler);
          el.textContent = '> shuffling ............. OK';
          synth.ok();
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
          synth.soft();
          if (ticks >= 12) clearInterval(bar);
        });
      });
      at(1900, () => { line('> convergence reached ... dE = 0.0031', 'is-dim'); synth.ok(); });
      at(300, () => line(`> ${['sanity check skipped (confidence: absolute)', 'rounding errors donated to charity', 'results notarized by the void'][(Math.random() * 3) | 0]}`, 'is-dim'));
      at(500, () => line('', null, true));

      const byBin = ctx.bins.map((_, k) =>
        ctx.assignments.map((a, i) => ({ a, i })).filter((x) => x.a.binIndex === k));
      byBin.forEach((members, k) => {
        at(500, () => { line(`${ctx.bins[k].label.toUpperCase()}`, 'is-team', true); synth.team(k); });
        members.forEach(({ a, i }) => {
          at(300, () => {
            line(`  + ${a.label ?? a.name}`);
            ctx.onAssign(i);
          });
        });
      });

      at(600, () => line('', null, true));
      at(200, () => {
        line('> done. good luck out there.', 'is-dim');
        synth.done();
        timers.after(900, () => synth.humOff());
        ctx.onDone();
      });
    }

    return {
      start() {
        if (ctx.reducedMotion) {
          // Static wall, no motion, no sound.
          for (const { p, cv } of canvasPanels) {
            fitIfChanged(cv);
            p.draw(cv.getContext('2d'), cv.width, cv.height, 1.2);
          }
          assignAllInstantly(ctx);
          return;
        }
        rafId = requestAnimationFrame(frame);
        // Ambient machine chatter while it "works".
        timers.every(1700, () => { if (Math.random() < 0.4) synth.glitchy(); });
        run();
      },
      destroy() {
        destroyed = true;
        cancelAnimationFrame(rafId);
        timers.clear();
        synth.dispose();
        wrap.remove();
      },
    };
  },
};
