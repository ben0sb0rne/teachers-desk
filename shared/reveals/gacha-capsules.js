// =============================================================
// shared/reveals/gacha-capsules.js — a capsule machine dispenses one
// capsule per student. The teacher CRANKS it one capsule at a time,
// or flips it to AUTO and lets it run. Capsules dispense team by
// team (sequential order — the tool fills Team 1 completely, then
// Team 2…), and the plate shows which team is currently filling.
//
// Placeholder look: the real machine art is a planned user-drawn
// asset (full-screen machine, class-name label, visible capsules).
// Everything here is functional scaffolding for that overhaul.
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
.rv-gacha-title {
  text-align: center;
  color: rgb(246 238 216);
  font-size: 15px; font-weight: 800;
  letter-spacing: 0.06em; text-transform: uppercase;
  margin: 0 0 8px;
}
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
  width: 200px; height: 128px;
  margin: -8px auto 0;
  background: rgb(96 26 38);
  border: 3px solid rgb(58 15 24);
  border-radius: 5px;
  position: relative;
}
.rv-gacha-plate {
  position: absolute; top: 10px; left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  color: rgb(246 238 216);
  font-size: 12px; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase;
}
.rv-gacha-slot {
  position: absolute; left: 50%; bottom: 10px;
  width: 56px; height: 40px;
  transform: translateX(-50%);
  background: rgb(20 14 20);
  border-radius: 4px;
  border: 2px solid rgb(205 211 222 / 0.5);
}
.rv-gacha-controls {
  display: flex; justify-content: center; gap: 10px;
  margin-top: 60px;
}
.rv-gacha-controls button {
  font-family: var(--font-slab, serif);
  font-size: 13px; font-weight: 800;
  letter-spacing: 0.08em; text-transform: uppercase;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  background: rgb(246 238 216);
  color: rgb(30 34 56);
  border: 2px solid rgb(30 34 56);
}
.rv-gacha-controls button[disabled] { opacity: 0.4; cursor: default; }
.rv-gacha-controls .rv-gacha-auto.is-on {
  background: rgb(240 84 28);
  color: rgb(246 238 216);
  border-color: rgb(126 38 8);
}
.rv-gacha-capsule {
  position: absolute; left: 50%; top: 118px;
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
  position: absolute; left: 50%; top: 398px;
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

/* ── Diegetic skin: the whole reveal view joins the toy shop ──
   Deep plum walls, enamel-red buttons like the machine body, the
   team board as a shop price card. MATERIAL: enamel metal (flat
   placeholder — a painted-metal texture swaps in here). */
body.rv-skin-gacha {
  background-image: none;
  background-color: rgb(23 18 31);
}
.rv-skin-gacha .reveal-header { color: rgb(246 238 216); }
.rv-skin-gacha .reveal-controls button {
  font-family: var(--font-slab, serif);
  background: rgb(96 26 38);
  color: rgb(246 238 216);
  border: 1px solid rgb(58 15 24);
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  box-shadow: none;
}
.rv-skin-gacha .reveal-controls button:hover { background: rgb(114 34 48); }
.rv-skin-gacha .reveal-controls button[disabled] { opacity: 0.4; }
.rv-skin-gacha .reveal-stage { border-color: rgb(205 211 222 / 0.35); }
.rv-skin-gacha .team-board {
  background: rgb(36 28 46);
  border-color: rgb(205 211 222 / 0.3);
  color: rgb(246 238 216);
}
.rv-skin-gacha .team-board h2 {
  color: rgb(240 84 28);
  border-color: rgb(240 84 28 / 0.45);
}
.rv-skin-gacha .team-col li.is-empty { color: rgb(246 238 216 / 0.4); }
.rv-skin-gacha .team-col li.is-new { background: rgb(240 84 28 / 0.16); }
.rv-skin-gacha .team-col .dot { border-color: rgb(246 238 216 / 0.4); }
`;

export default {
  id: 'gacha',
  label: 'Gacha Capsules',
  order: 'sequential',
  skinClass: 'rv-skin-gacha',
  glyph: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 9h12" stroke="currentColor" stroke-width="2"/><rect x="8" y="16" width="8" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',

  create(host, ctx) {
    ensureStyles('gacha', CSS);
    const wrap = document.createElement('div');
    wrap.className = 'rv-gacha';

    const machine = document.createElement('div');
    machine.className = 'rv-gacha-machine';
    if (ctx.title) {
      const title = document.createElement('p');
      title.className = 'rv-gacha-title';
      title.textContent = ctx.title;
      machine.appendChild(title);
    }
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
    body.innerHTML = '<div class="rv-gacha-plate"></div><div class="rv-gacha-slot"></div>';
    machine.appendChild(body);
    const plate = body.querySelector('.rv-gacha-plate');

    const controls = document.createElement('div');
    controls.className = 'rv-gacha-controls';
    const crankBtn = document.createElement('button');
    crankBtn.type = 'button';
    crankBtn.textContent = 'Crank';
    const autoBtn = document.createElement('button');
    autoBtn.type = 'button';
    autoBtn.className = 'rv-gacha-auto';
    autoBtn.textContent = 'Auto';
    controls.appendChild(crankBtn);
    controls.appendChild(autoBtn);
    machine.appendChild(controls);

    wrap.appendChild(machine);
    host.appendChild(wrap);

    const timers = makeTimers();
    let next = 0;           // next assignment to dispense
    let busy = false;       // a capsule is mid-cycle
    let auto = false;
    let autoTimer = 0;
    let armed = false;

    function updatePlate() {
      if (next >= ctx.assignments.length) {
        plate.textContent = 'All teams full';
        return;
      }
      const bin = ctx.assignments[next].binIndex;
      plate.textContent = `Filling ${ctx.bins[bin].label}`;
    }

    function updateButtons() {
      const out = next >= ctx.assignments.length;
      crankBtn.disabled = !armed || busy || auto || out;
      autoBtn.disabled = !armed || out;
      autoBtn.classList.toggle('is-on', auto);
    }

    function crank() {
      if (busy || next >= ctx.assignments.length) return;
      busy = true;
      const i = next++;
      const a = ctx.assignments[i];
      wrap.classList.add('is-shaking');
      timers.after(500, () => wrap.classList.remove('is-shaking'));

      const capsule = document.createElement('div');
      capsule.className = 'rv-gacha-capsule';
      capsule.innerHTML =
        '<div class="rv-cap-top"></div>' +
        `<div class="rv-cap-bottom" style="background:${a.color}"></div>`;
      machine.appendChild(capsule);
      void capsule.getBoundingClientRect();
      capsule.style.transform = 'translateY(226px)';

      timers.after(620, () => {
        pills[i].remove(); // that capsule has left the globe
        capsule.classList.add('is-open');
        const reveal = document.createElement('div');
        reveal.className = 'rv-gacha-reveal';
        reveal.innerHTML =
          `<span class="rv-gacha-dot" style="background:${a.color}"></span>` +
          `<span>${escHtml(a.label ?? a.name)}</span>` +
          `<span class="rv-gacha-team">${escHtml(ctx.bins[a.binIndex].label)}</span>`;
        machine.appendChild(reveal);
        void reveal.getBoundingClientRect();
        reveal.classList.add('is-in');
        ctx.onAssign(i);
        updatePlate();
        timers.after(CYCLE_MS - 660, () => {
          reveal.classList.remove('is-in');
          timers.after(240, () => { reveal.remove(); capsule.remove(); });
          busy = false;
          updateButtons();
          if (next >= ctx.assignments.length) {
            stopAuto();
            ctx.onDone();
          } else if (auto) {
            autoTimer = timers.after(120, crank);
          }
        });
      });
      updateButtons();
    }

    function stopAuto() {
      auto = false;
      clearTimeout(autoTimer);
      updateButtons();
    }

    crankBtn.addEventListener('click', crank);
    autoBtn.addEventListener('click', () => {
      if (auto) { stopAuto(); return; }
      auto = true;
      updateButtons();
      if (!busy) crank();
    });

    updatePlate();
    updateButtons();

    return {
      start() {
        if (ctx.reducedMotion) { assignAllInstantly(ctx); return; }
        // Arm the machine — the teacher drives it from here.
        armed = true;
        updateButtons();
      },
      destroy() {
        stopAuto();
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
