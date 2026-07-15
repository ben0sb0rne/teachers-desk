// =============================================================
// shared/reveals/algorithm-terminal.js — a deadly serious terminal
// pretends to run a very advanced team-optimization algorithm. It
// shuffles, hashes, converges, and then prints each team like it
// solved something. (It didn't. The shuffle happened before it
// booted. The terminal doesn't know that.)
// =============================================================

import { ensureStyles, makeTimers, assignAllInstantly } from './util.js';

const CSS = `
.rv-term {
  position: absolute; inset: 0;
  background: rgb(8 12 8);
  border-radius: 4px;
  overflow: hidden;
  padding: 18px 22px;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-size: clamp(13px, 1.6vw, 17px);
  line-height: 1.55;
  color: rgb(112 232 120);
  text-shadow: 0 0 6px rgb(112 232 120 / 0.35); /* CRT phosphor bloom */
}
.rv-term-scroll { position: absolute; inset: 18px 22px; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-end; }
.rv-term-line { white-space: pre-wrap; word-break: break-word; min-height: 1.55em; }
.rv-term-line.is-dim { color: rgb(112 232 120 / 0.55); text-shadow: none; }
.rv-term-line.is-team { color: rgb(246 238 216); text-shadow: 0 0 6px rgb(246 238 216 / 0.25); font-weight: 700; }
.rv-term-cursor::after {
  content: '█';
  animation: rv-term-blink 0.9s steps(1) infinite;
}
@keyframes rv-term-blink { 50% { opacity: 0; } }
`;

export default {
  id: 'terminal',
  label: 'Algorithm Terminal',
  glyph: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><polyline points="7 9 10 12 7 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="15" x2="17" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',

  create(host, ctx) {
    ensureStyles('terminal', CSS);
    const wrap = document.createElement('div');
    wrap.className = 'rv-term';
    const scroll = document.createElement('div');
    scroll.className = 'rv-term-scroll';
    wrap.appendChild(scroll);
    host.appendChild(wrap);

    const timers = makeTimers();
    let cursorEl = null;

    function line(text, cls) {
      if (cursorEl) cursorEl.classList.remove('rv-term-cursor');
      const el = document.createElement('div');
      el.className = 'rv-term-line' + (cls ? ' ' + cls : '');
      el.textContent = text;
      el.classList.add('rv-term-cursor');
      cursorEl = el;
      scroll.appendChild(el);
      // Keep the tail visible; the flex column bottom-aligns overflow.
      while (scroll.children.length > 40) scroll.firstChild.remove();
      return el;
    }

    function run() {
      const names = ctx.assignments.map((a) => a.name);
      const sizes = ctx.bins.map((b) => b.size).join('+');
      const seed = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
      let t = 0;
      const at = (ms, fn) => { t += ms; timers.after(t, fn); };

      at(100, () => line('TEAMMAKER v4.2 — quantum cohesion engine', 'is-dim'));
      at(420, () => line(`> roster loaded ......... ${names.length} students`, 'is-dim'));
      at(420, () => line(`> entropy seed .......... 0x${seed}`, 'is-dim'));
      at(380, () => {
        const el = line('> shuffling');
        // Live scramble: rewrite the line with random name pairs.
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
      at(1650, () => line(`> partition ............. ${sizes}`, 'is-dim'));
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
            line(`  + ${a.name}`);
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

    return {
      start() {
        if (ctx.reducedMotion) { assignAllInstantly(ctx); return; }
        run();
      },
      destroy() {
        timers.clear();
        wrap.remove();
      },
    };
  },
};
