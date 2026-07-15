// =============================================================
// shared/reveals/draft-cards.js — a face-down deck deals one card
// per student to the team zones. Cards behave like real dealt
// cards: tossed hard, flipping over mid-flight, then sliding to a
// gradual stop on the felt, piling loosely in the zone. The plain-
// text tab list under each pile keeps every pick readable even as
// the pile buries earlier cards.
// =============================================================

import { ensureStyles, makeTimers, assignAllInstantly } from './util.js';

const DEAL_EVERY_MS = 1250;
const FLIP_MS = 340;

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
/* The pile lives in the zone's upper region; the plain-text record
   flows beneath it. */
.rv-zone-tabs {
  margin-top: 142px;
  display: flex; flex-direction: column; gap: 3px;
}
.rv-zone-tab {
  background: rgb(246 238 216);
  color: rgb(30 34 56);
  border-radius: 3px;
  padding: 2px 7px;
  font-size: 13px; font-weight: 700;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 200ms ease-out, transform 200ms ease-out;
}
.rv-zone-tab.is-in { opacity: 1; transform: none; }
.rv-draft-card {
  position: absolute; top: 26px; left: 50%;
  width: 92px; height: 128px;
  margin-left: -46px;
  perspective: 600px;
  will-change: transform;
}
.rv-draft-card .rv-card-inner {
  position: absolute; inset: 0;
  transform-style: preserve-3d;
  transition: transform ${FLIP_MS}ms cubic-bezier(0.3, 0, 0.7, 1);
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

    /** The plain-text record beneath each pile. */
    function addTab(a) {
      const tabs = zoneEls[a.binIndex].querySelector('.rv-zone-tabs');
      const tab = document.createElement('div');
      tab.className = 'rv-zone-tab';
      tab.textContent = a.label ?? a.name;
      tabs.appendChild(tab);
      void tab.getBoundingClientRect();
      tab.classList.add('is-in');
    }

    function deal(i) {
      const a = ctx.assignments[i];
      const card = document.createElement('div');
      card.className = 'rv-draft-card';
      card.style.zIndex = String(10 + i); // newest lands on top of the pile
      card.innerHTML =
        '<div class="rv-card-inner">' +
        '<div class="rv-card-face rv-card-back"></div>' +
        '<div class="rv-card-face rv-card-front">' +
        `<span class="rv-card-dot" style="background:${a.color}"></span>` +
        `<span>${escHtml(a.label ?? a.name)}</span>` +
        '</div></div>';
      wrap.appendChild(card);

      // A real deal: thrown hard, flipping over in flight, then a long
      // glide to a stop on the felt. Every toss differs — speed, spin,
      // where in the pile it skids to rest.
      const travel = 620 + Math.random() * 260;
      const restRot = (Math.random() * 18 - 9).toFixed(1);
      const jitterX = Math.random() * 16 - 8;
      const jitterY = Math.random() * 10 - 5;
      // Fast launch, heavy deceleration tail — the slide-to-stop.
      card.style.transition =
        `transform ${travel}ms cubic-bezier(0.1, 0.74, 0.18, 1)`;

      const zone = zoneEls[a.binIndex];
      const wrapBox = wrap.getBoundingClientRect();
      const zoneBox = zone.getBoundingClientRect();
      const startX = wrapBox.width / 2 - 46;
      const targetX = zoneBox.left - wrapBox.left + (zoneBox.width - 92) / 2 + jitterX;
      const targetY = zoneBox.top - wrapBox.top + 8 + jitterY;
      void card.getBoundingClientRect();
      card.style.transform =
        `translate(${targetX - startX}px, ${targetY - 26}px) rotate(${restRot}deg)`;

      // Flip mid-flight, like a card leaving the dealer's thumb.
      timers.after(travel * 0.22, () => card.classList.add('is-flipped'));
      // Report once it has slid to rest; the tab is the lasting record
      // (the pile will bury this card as the deal goes on).
      timers.after(travel + 120, () => {
        addTab(a);
        ctx.onAssign(i);
      });
    }

    return {
      start() {
        if (ctx.reducedMotion) {
          ctx.assignments.forEach((a) => addTab(a));
          assignAllInstantly(ctx);
          return;
        }
        ctx.assignments.forEach((_, i) => {
          timers.after(300 + i * DEAL_EVERY_MS, () => deal(i));
        });
        timers.after(
          300 + (ctx.assignments.length - 1) * DEAL_EVERY_MS + 1200,
          () => ctx.onDone(),
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
