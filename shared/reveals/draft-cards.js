// =============================================================
// shared/reveals/draft-cards.js — a face-down deck deals one card
// per student to the team zones; each card flips on arrival to
// reveal the name. Sports-draft pacing: steady, a little solemn,
// every pick gets its beat.
// =============================================================

import { ensureStyles, makeTimers, assignAllInstantly } from './util.js';

const DEAL_EVERY_MS = 950;
const TRAVEL_MS = 420;
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
  position: absolute; left: 0; right: 0; bottom: 14px;
  display: flex; justify-content: space-evenly; gap: 8px;
  padding: 0 12px;
}
.rv-draft-zone {
  flex: 1; max-width: 170px; min-width: 90px;
  height: 148px;
  border: 2px dashed rgb(246 238 216 / 0.4);
  border-radius: 5px;
  position: relative;
  color: rgb(246 238 216 / 0.8);
  text-align: center;
}
.rv-draft-zone .rv-zone-label {
  position: absolute; left: 0; right: 0; bottom: -1.6em;
  font-size: 12px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase;
}
.rv-draft-card {
  position: absolute; top: 26px; left: 50%;
  width: 92px; height: 128px;
  margin-left: -46px;
  perspective: 600px;
  transition: transform ${TRAVEL_MS}ms cubic-bezier(0.3, 0.1, 0.4, 1);
  will-change: transform;
  z-index: 2;
}
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
  font-size: 14px;
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
      const lab = document.createElement('span');
      lab.className = 'rv-zone-label';
      lab.textContent = b.label;
      z.appendChild(lab);
      zones.appendChild(z);
      return z;
    });
    wrap.appendChild(zones);
    host.appendChild(wrap);

    const timers = makeTimers();
    const perZone = new Array(ctx.bins.length).fill(0);

    function deal(i) {
      const a = ctx.assignments[i];
      const card = document.createElement('div');
      card.className = 'rv-draft-card';
      card.innerHTML =
        '<div class="rv-card-inner">' +
        '<div class="rv-card-face rv-card-back"></div>' +
        '<div class="rv-card-face rv-card-front">' +
        `<span class="rv-card-dot" style="background:${a.color}"></span>` +
        `<span>${escHtml(a.name)}</span>` +
        '</div></div>';
      wrap.appendChild(card);

      // Fly from deck to the zone (small stack offset per arrival).
      const zone = zoneEls[a.binIndex];
      const wrapBox = wrap.getBoundingClientRect();
      const zoneBox = zone.getBoundingClientRect();
      const startX = wrapBox.width / 2 - 46;
      const targetX = zoneBox.left - wrapBox.left + (zoneBox.width - 92) / 2;
      const targetY = zoneBox.top - wrapBox.top + 8;
      const n = perZone[a.binIndex]++;
      const dx = targetX - startX + (n % 3) * 3;
      const dy = targetY - 26 - Math.min(n, 3) * 3;
      // Force layout so the transition fires from the deck position.
      void card.getBoundingClientRect();
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${(n % 3 - 1) * 2.5}deg)`;
      timers.after(TRAVEL_MS, () => card.classList.add('is-flipped'));
      timers.after(TRAVEL_MS + FLIP_MS, () => ctx.onAssign(i));
    }

    return {
      start() {
        if (ctx.reducedMotion) { assignAllInstantly(ctx); return; }
        ctx.assignments.forEach((_, i) => {
          timers.after(300 + i * DEAL_EVERY_MS, () => deal(i));
        });
        timers.after(
          300 + (ctx.assignments.length - 1) * DEAL_EVERY_MS + TRAVEL_MS + FLIP_MS + 400,
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
