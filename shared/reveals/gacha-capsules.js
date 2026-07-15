// =============================================================
// shared/reveals/gacha-capsules.js — a capsule machine cranks out
// one capsule per student: the globe shakes, a capsule drops down
// the chute, pops open, and the name inside joins its team.
// =============================================================

import { ensureStyles, makeTimers, assignAllInstantly } from './util.js';

const CYCLE_MS = 1500;

const CSS = `
.rv-gacha {
  position: absolute; inset: 0;
  background: rgb(30 24 40);          /* toy-shop back wall */
  border-radius: 4px;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-slab, serif);
}
.rv-gacha-machine { position: relative; width: 240px; }
.rv-gacha-globe {
  /* MATERIAL: capsule globe (glass). */
  width: 240px; height: 240px;
  border-radius: 50%;
  background: rgb(246 238 216 / 0.1);
  border: 4px solid rgb(205 211 222);
  position: relative;
  overflow: hidden;
}
.rv-gacha.is-shaking .rv-gacha-globe { animation: rv-gacha-shake 0.5s ease-in-out; }
@keyframes rv-gacha-shake {
  0%, 100% { transform: translateX(0) rotate(0); }
  25% { transform: translateX(-5px) rotate(-2.5deg); }
  50% { transform: translateX(4px) rotate(2deg); }
  75% { transform: translateX(-3px) rotate(-1.5deg); }
}
.rv-gacha-pill {
  position: absolute;
  width: 34px; height: 34px;
  border-radius: 50%;
  border: 2px solid rgb(0 0 0 / 0.25);
}
.rv-gacha-body {
  /* MATERIAL: machine body (enamel metal). */
  width: 200px; height: 120px;
  margin: -8px auto 0;
  background: rgb(96 26 38);
  border: 3px solid rgb(58 15 24);
  border-radius: 5px;
  position: relative;
}
.rv-gacha-slot {
  position: absolute; left: 50%; bottom: 10px;
  width: 56px; height: 40px;
  transform: translateX(-50%);
  background: rgb(20 14 20);
  border-radius: 4px;
  border: 2px solid rgb(205 211 222 / 0.5);
}
.rv-gacha-capsule {
  position: absolute; left: 50%; top: 96px;
  width: 46px; height: 46px;
  margin-left: -23px;
  z-index: 3;
  transition: transform 500ms cubic-bezier(0.4, 0, 0.8, 1);
  will-change: transform;
}
.rv-gacha-capsule .rv-cap-top,
.rv-gacha-capsule .rv-cap-bottom {
  position: absolute; left: 0; width: 46px; height: 23px;
  transition: transform 260ms ease-out, opacity 260ms ease-out;
}
.rv-gacha-capsule .rv-cap-top {
  top: 0; border-radius: 23px 23px 0 0;
  background: rgb(246 238 216);
  border: 2px solid rgb(0 0 0 / 0.2); border-bottom: none;
}
.rv-gacha-capsule .rv-cap-bottom {
  bottom: 0; border-radius: 0 0 23px 23px;
  border: 2px solid rgb(0 0 0 / 0.2); border-top: none;
}
.rv-gacha-capsule.is-open .rv-cap-top { transform: translateY(-26px) rotate(-18deg); opacity: 0; }
.rv-gacha-capsule.is-open .rv-cap-bottom { transform: translateY(26px) rotate(14deg); opacity: 0; }
.rv-gacha-reveal {
  position: absolute; left: 50%; top: 385px;
  transform: translate(-50%, 8px);
  opacity: 0;
  transition: opacity 220ms ease-out, transform 220ms ease-out;
  background: rgb(246 238 216);
  color: rgb(30 34 56);
  border-radius: 4px;
  padding: 6px 14px;
  font-weight: 800; font-size: 18px;
  white-space: nowrap;
  display: flex; align-items: center; gap: 8px;
  z-index: 4;
}
.rv-gacha-reveal.is-in { opacity: 1; transform: translate(-50%, 0); }
.rv-gacha-reveal .rv-gacha-team {
  font-size: 12px; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: rgb(96 26 38);
}
.rv-gacha-dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgb(30 34 56 / 0.35); }
`;

export default {
  id: 'gacha',
  label: 'Gacha Capsules',
  glyph: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 9h12" stroke="currentColor" stroke-width="2"/><rect x="8" y="16" width="8" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',

  create(host, ctx) {
    ensureStyles('gacha', CSS);
    const wrap = document.createElement('div');
    wrap.className = 'rv-gacha';

    const machine = document.createElement('div');
    machine.className = 'rv-gacha-machine';
    const globe = document.createElement('div');
    globe.className = 'rv-gacha-globe';
    // The globe holds every not-yet-drawn capsule, tinted per student.
    const pills = ctx.assignments.map((a, i) => {
      const pill = document.createElement('span');
      pill.className = 'rv-gacha-pill';
      pill.style.background = a.color;
      const ang = (i * 2.399963) % (Math.PI * 2); // golden angle scatter
      const rad = 20 + ((i * 53) % 78);
      pill.style.left = 100 + Math.cos(ang) * rad + 'px';
      pill.style.top = 108 + Math.sin(ang) * rad * 0.8 + ((i * 13) % 14) + 'px';
      globe.appendChild(pill);
      return pill;
    });
    machine.appendChild(globe);
    const body = document.createElement('div');
    body.className = 'rv-gacha-body';
    body.innerHTML = '<div class="rv-gacha-slot"></div>';
    machine.appendChild(body);
    wrap.appendChild(machine);
    host.appendChild(wrap);

    const timers = makeTimers();

    function crank(i) {
      const a = ctx.assignments[i];
      wrap.classList.add('is-shaking');
      timers.after(500, () => wrap.classList.remove('is-shaking'));

      // Capsule drops out of the slot.
      const capsule = document.createElement('div');
      capsule.className = 'rv-gacha-capsule';
      capsule.innerHTML =
        '<div class="rv-cap-top"></div>' +
        `<div class="rv-cap-bottom" style="background:${a.color}"></div>`;
      machine.appendChild(capsule);
      void capsule.getBoundingClientRect();
      capsule.style.transform = 'translateY(196px)';

      timers.after(620, () => {
        pills[i].remove(); // that capsule has left the globe
        capsule.classList.add('is-open');
        const reveal = document.createElement('div');
        reveal.className = 'rv-gacha-reveal';
        reveal.innerHTML =
          `<span class="rv-gacha-dot" style="background:${a.color}"></span>` +
          `<span>${escHtml(a.name)}</span>` +
          `<span class="rv-gacha-team">${escHtml(ctx.bins[a.binIndex].label)}</span>`;
        machine.appendChild(reveal);
        void reveal.getBoundingClientRect();
        reveal.classList.add('is-in');
        ctx.onAssign(i);
        timers.after(CYCLE_MS - 660, () => {
          reveal.classList.remove('is-in');
          timers.after(240, () => { reveal.remove(); capsule.remove(); });
        });
      });
    }

    return {
      start() {
        if (ctx.reducedMotion) { assignAllInstantly(ctx); return; }
        ctx.assignments.forEach((_, i) => {
          timers.after(200 + i * CYCLE_MS, () => crank(i));
        });
        timers.after(200 + ctx.assignments.length * CYCLE_MS + 200, () => ctx.onDone());
      },
      destroy() {
        timers.clear();
        wrap.remove();
      },
    };
  },
};

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
