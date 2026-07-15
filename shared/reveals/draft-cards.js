// =============================================================
// shared/reveals/draft-cards.js — a face-down deck deals one card
// per student to the team zones. Each deal has its own feel (speed,
// spin, drift), the card lands FACE DOWN, holds a beat, then flips.
// Once the next deal starts, the revealed card collapses into a
// compact name tab inside its zone — at most one full card is ever
// face-up per zone, and every earlier pick stays readable.
// =============================================================

import { ensureStyles, makeTimers, assignAllInstantly } from './util.js';

const DEAL_EVERY_MS = 1250;
const BEAT_MS = 260;          // face-down pause before the flip
const FLIP_MS = 320;

const CSS = `
.rv-draft {
  position: absolute; inset: 0;
  background: rgb(24 44 32);        /* felt table */
  border-radius: 4px;
  overflow: hidden;
  font-family: var(--font-slab, serif);
}
.rv-draft-deck {
  position: absolute; top: 26px; left: 50%;
  width: 92px; height: 128px;
  transform: translateX(-50%);
}
.rv-draft-deck .rv-card-back {
  position: absolute; inset: 0;
  border-radius: 5px;
}
.rv-card-back {
  /* MATERIAL: card back (printed pattern placeholder). */
  background:
    repeating-linear-gradient(45deg, rgb(96 26 38) 0 6px, rgb(78 20 30) 6px 12px);
  border: 2px solid rgb(246 238 216);
  box-shadow: 0 1px 0 rgb(0 0 0 / 0.35);
}
.rv-draft-zones {
  position: absolute; left: 0; right: 0; bottom: 30px;
  display: flex; justify-content: space-evenly; gap: 8px;
  padding: 0 12px;
}
.rv-draft-zone {
  flex: 1; max-width: 190px; min-width: 100px;
  min-height: 170px;
  border: 2px dashed rgb(246 238 216 / 0.35);
  border-radius: 5px;
  position: relative;
  color: rgb(246 238 216 / 0.8);
  padding: 6px;
}
.rv-draft-zone .rv-zone-label {
  position: absolute; left: 0; right: 0; bottom: -1.7em;
  font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: center;
}
.rv-zone-tabs { display: flex; flex-direction: column; gap: 4px; }
.rv-zone-tab {
  display: flex; align-items: center; gap: 6px;
  background: rgb(246 238 216);
  color: rgb(30 34 56);
  border-radius: 3px;
  padding: 3px 7px;
  font-size: 13px; font-weight: 700;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 200ms ease-out, transform 200ms ease-out;
}
.rv-zone-tab.is-in { opacity: 1; transform: none; }
.rv-zone-tab .rv-tab-dot {
  width: 11px; height: 11px; border-radius: 50%;
  flex-shrink: 0;
  border: 1.5px solid rgb(30 34 56 / 0.35);
}
.rv-draft-card {
  position: absolute; top: 26px; left: 50%;
  width: 92px; height: 128px;
  margin-left: -46px;
  perspective: 600px;
  will-change: transform;
  z-index: 2;
}
.rv-draft-card.is-fading { transition: opacity 220ms ease-in; opacity: 0; }
.rv-draft-card .rv-card-inner {
  position: absolute; inset: 0;
  transform-style: preserve-3d;
  transition: transform ${FLIP_MS}ms ease-in;
}
.rv-draft-card.is-flipped .rv-card-inner { transform: rotateY(180deg); }
.rv-draft-card .rv-card-face {
  position: absolute; inset: 0;
  backface-visibility: hidden;
  border-radius: 5px;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px;
}
.rv-draft-card .rv-card-front {
  transform: rotateY(180deg);
  background: rgb(246 238 216);
  border: 2px solid rgb(30 34 56);
  color: rgb(30 34 56);
  font-weight: 800;
  font-size: 17px;
  text-align: center;
  padding: 6px;
  word-break: break-word;
}
.rv-draft-card .rv-card-dot {
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid rgb(30 34 56 / 0.4);
}
`;

export default {
  id: 'draft',
  label: 'Draft Cards',
  order: 'roundRobin',
  glyph: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="3" width="11" height="15" rx="1.5" transform="rotate(-8 4 3)"/><rect x="9" y="6" width="11" height="15" rx="1.5"/></g></svg>',

  create(host, ctx) {
    ensureStyles('draft', CSS);
    const wrap = document.createElement('div');
    wrap.className = 'rv-draft';

    const deck = document.createElement('div');
    deck.className = 'rv-draft-deck';
    for (let k = 0; k < 3; k++) {
      const back = document.createElement('div');
      back.className = 'rv-card-back';
      back.style.transform = `translate(${k * 2}px, ${-k * 2}px)`;
      deck.appendChild(back);
    }
    wrap.appendChild(deck);

    const zones = document.createElement('div');
    zones.className = 'rv-draft-zones';
    const zoneEls = ctx.bins.map((b) => {
      const z = document.createElement('div');
      z.className = 'rv-draft-zone';
      z.innerHTML = `<div class="rv-zone-tabs"></div><span class="rv-zone-label">${escHtml(b.label)}</span>`;
      zones.appendChild(z);
      return z;
    });
    wrap.appendChild(zones);
    host.appendChild(wrap);

    const timers = makeTimers();
    let liveCard = null; // the one face-up card; collapses on next deal

    /** Collapse the current face-up card into its zone's tab stack. */
    function collapseLive() {
      if (!liveCard) return;
      const { card, a } = liveCard;
      liveCard = null;
      const tabs = zoneEls[a.binIndex].querySelector('.rv-zone-tabs');
      const tab = document.createElement('div');
      tab.className = 'rv-zone-tab';
      tab.innerHTML =
        `<span class="rv-tab-dot" style="background:${a.color}"></span>` +
        `<span>${escHtml(a.label ?? a.name)}</span>`;
      tabs.appendChild(tab);
      void tab.getBoundingClientRect();
      tab.classList.add('is-in');
      card.classList.add('is-fading');
      timers.after(240, () => card.remove());
    }

    function deal(i) {
      collapseLive();
      const a = ctx.assignments[i];
      const card = document.createElement('div');
      card.className = 'rv-draft-card';
      card.innerHTML =
        '<div class="rv-card-inner">' +
        '<div class="rv-card-face rv-card-back"></div>' +
        '<div class="rv-card-face rv-card-front">' +
        `<span class="rv-card-dot" style="background:${a.color}"></span>` +
        `<span>${escHtml(a.label ?? a.name)}</span>` +
        '</div></div>';
      wrap.appendChild(card);

      // Every toss is a little different: speed, drift, spin.
      const travel = 380 + Math.random() * 140;
      const spin = (Math.random() * 12 - 6).toFixed(1);
      const drift = Math.random() * 10 - 5;
      card.style.transition =
        `transform ${travel}ms cubic-bezier(0.25, 0.1, 0.3, 1.12)`;

      const zone = zoneEls[a.binIndex];
      const wrapBox = wrap.getBoundingClientRect();
      const zoneBox = zone.getBoundingClientRect();
      const startX = wrapBox.width / 2 - 46;
      const targetX = zoneBox.left - wrapBox.left + (zoneBox.width - 92) / 2 + drift;
      const targetY = zoneBox.top - wrapBox.top + 10;
      void card.getBoundingClientRect();
      card.style.transform =
        `translate(${targetX - startX}px, ${targetY - 26}px) rotate(${spin}deg)`;

      // Register as the live card NOW — if timers get throttled (e.g.
      // background tab), the next deal still collapses this one instead
      // of letting face-up cards pile up.
      liveCard = { card, a };
      // Land face down → beat → flip → report.
      timers.after(travel + BEAT_MS, () => card.classList.add('is-flipped'));
      timers.after(travel + BEAT_MS + FLIP_MS, () => ctx.onAssign(i));
    }

    return {
      start() {
        if (ctx.reducedMotion) { assignAllInstantly(ctx); return; }
        ctx.assignments.forEach((_, i) => {
          timers.after(300 + i * DEAL_EVERY_MS, () => deal(i));
        });
        timers.after(
          300 + (ctx.assignments.length - 1) * DEAL_EVERY_MS + 1300,
          () => { collapseLive(); ctx.onDone(); },
        );
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
