// =============================================================
// picker/script.js — Name Picker tool
//
// Picks a name from a class via spinning wheel. Reads classes via shared
// storage with a fallback to the seating chart's blob. New classes created
// here write canonical metadata + roster. Call counts increment on each
// pick (groundwork for future fairness logic).
//
// Suite integration:
//   - <body class="wood-bg"> + anti-FOUC theme script in index.html
//   - .suite-topstrip with wordmark + tool name
//   - Floating settings gear + 'S' shortcut via shared/settings.js
// =============================================================

import * as storage from '../shared/storage.js';
import * as bridge from '../shared/roster-bridge.js';
import { mountSettingsButton } from '../shared/settings.js';
import { mountClassCardGrid } from '../shared/components/class-card-grid.js';
import { openOverlay } from '../shared/components/overlay.js';
import { mountPasteBulk } from '../shared/components/paste-bulk.js';

// Tracks the active class's roster subscription so we can refresh the wheel
// + sidebar when the roster is edited elsewhere (e.g. on the Rosters page,
// or in another browser tab) while the user is on the wheel view.
let activeClassUnsubscribe = null;

mountSettingsButton();

// -------------------------------------------------------------
// State
// -------------------------------------------------------------
const VIEW = {
  classSelect: document.getElementById('class-select-view'),
  wheel: document.getElementById('wheel-view'),
};

const state = {
  activeClassId: null,
  activeClassName: '',
  activeRoster: [],     // string[] — current names (read fresh from storage on entry)
  pickedThisSession: new Set(), // names picked since last reset
  justPicked: null,     // last name picked, for one-tick highlight in sidebar
  currentRotation: 0,   // running degrees (so the wheel doesn't snap back between spins)
  isSpinning: false,
  options: {
    allowRepeats: true,
    showCounts: true,
  },
};

// -------------------------------------------------------------
// View routing
// -------------------------------------------------------------
function showView(name) {
  for (const [k, el] of Object.entries(VIEW)) {
    el.hidden = k !== name;
  }
}

// -------------------------------------------------------------
// CLASS SELECT VIEW
//
// Uses shared/components/class-card-grid.js — auto-refreshes on canonical
// changes (class created/renamed/deleted in another tool, roster edited
// elsewhere) so the picker's class list never gets stale.
// -------------------------------------------------------------
let classGridCtl = null;

function mountClassSelect() {
  if (classGridCtl) return; // already mounted
  const grid = document.getElementById('class-grid');
  const empty = document.getElementById('class-empty');
  // The shared component takes ownership of `grid` and shows/hides itself.
  // We hide our own empty-state element since the component renders one too.
  empty.hidden = true;
  classGridCtl = mountClassCardGrid(grid, {
    onSelect: (classId) => openClass(classId),
    onDelete: (classId, name) => {
      if (confirm(`Delete class "${name}"? Its roster and call counts will be removed.`)) {
        storage.deleteClass(classId);
      }
    },
    emptyMessage: 'No classes yet. Create one with + New class, or use the Rosters page.',
  });
}

function openClass(classId) {
  state.activeClassId = classId;
  state.activeClassName = storage.getClassName(classId) || '(unnamed)';
  state.activeRoster = storage.getRoster(classId).slice();
  state.pickedThisSession.clear();
  state.justPicked = null;
  state.currentRotation = 0;

  // Subscribe to roster changes for this class. If the user (or another tab,
  // or the Rosters page) edits the class while we're on the wheel view,
  // refresh the visible roster + wheel.
  if (activeClassUnsubscribe) activeClassUnsubscribe();
  activeClassUnsubscribe = bridge.onRosterChange(classId, ({ names }) => {
    state.activeRoster = names.slice();
    renderWheel();
    renderRoster();
    updateSpinButton();
  });

  // Read source for the badge
  const cls = storage.listClasses().find((c) => c.id === classId);
  const sourceTag = document.getElementById('wheel-class-source');
  sourceTag.hidden = !cls || cls.source !== 'seating-chart';

  document.getElementById('wheel-class-name').textContent = state.activeClassName;
  document.getElementById('picked-card').hidden = true;
  document.getElementById('btn-spin').hidden = false;

  // Reset the wheel transform without animation, then re-render
  const wheelEl = document.getElementById('wheel-svg');
  wheelEl.style.transition = 'none';
  wheelEl.style.transform = 'rotate(0deg)';
  // Force reflow so the next transition applies cleanly
  void wheelEl.getBoundingClientRect();
  wheelEl.style.transition = '';

  showView('wheel');
  renderWheel();
  renderRoster();
  updateSpinButton();
}

// -------------------------------------------------------------
// NEW-CLASS MODAL
//
// Built ad-hoc via shared/components/overlay.js + paste-bulk.js — no
// dedicated HTML markup. Open from button click or any other entry
// point that needs a "create class quickly" affordance.
// -------------------------------------------------------------

function openNewClassModal() {
  const handle = openOverlay({ title: 'New class' });
  const body = handle.body;

  // — Class name input —
  const nameSection = document.createElement('div');
  nameSection.className = 'suite-settings-section';
  const nameHeading = document.createElement('h3');
  nameHeading.textContent = 'Class name';
  nameSection.appendChild(nameHeading);
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'modal-input';
  nameInput.placeholder = 'e.g. Period 3 Math';
  nameInput.style.width = '100%';
  nameSection.appendChild(nameInput);
  const nameError = document.createElement('p');
  nameError.className = 'error-msg';
  nameError.hidden = true;
  nameSection.appendChild(nameError);
  body.appendChild(nameSection);

  // — Paste-bulk students —
  const studentsSection = document.createElement('div');
  studentsSection.className = 'suite-settings-section';
  const studentsHeading = document.createElement('h3');
  studentsHeading.textContent = 'Students';
  studentsSection.appendChild(studentsHeading);
  body.appendChild(studentsSection);

  let pendingNames = [];
  const pasteBulk = mountPasteBulk(studentsSection, {
    placeholder: 'Alice\nBob\nCharlie',
    rows: 8,
    buttonLabel: 'Stage names',
    hint: 'Paste names — one per line. Click Stage names to confirm; you can also leave it empty and add students later from the Rosters page.',
    onSubmit: (names) => {
      pendingNames = names;
      pasteBulk.reset();
      stagedNotice.textContent = `Staged ${names.length} student${names.length === 1 ? '' : 's'}.`;
      stagedNotice.hidden = false;
    },
  });
  const stagedNotice = document.createElement('p');
  stagedNotice.className = 'muted';
  stagedNotice.style.fontSize = 'var(--type-11)';
  stagedNotice.hidden = true;
  studentsSection.appendChild(stagedNotice);

  // — Action row —
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'desk-button is-ghost';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => handle.close());
  const create = document.createElement('button');
  create.type = 'button';
  create.className = 'desk-button';
  create.textContent = 'Create class';
  create.addEventListener('click', () => {
    const name = nameInput.value.trim();
    nameError.hidden = true;
    if (!name) {
      nameError.textContent = 'Class name is required.';
      nameError.hidden = false;
      nameInput.focus();
      return;
    }
    const existing = storage.listClasses().find(
      (c) => c.source === 'canonical' && c.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      nameError.textContent = 'A class with this name already exists.';
      nameError.hidden = false;
      nameInput.focus();
      return;
    }
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'cls-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
    storage.setClassName(id, name);
    storage.setRoster(id, pendingNames);
    handle.close();
    openClass(id);
  });
  actions.appendChild(cancel);
  actions.appendChild(create);
  body.appendChild(actions);

  setTimeout(() => nameInput.focus(), 0);
}

document.getElementById('btn-new-class').addEventListener('click', openNewClassModal);

// -------------------------------------------------------------
// WHEEL VIEW
// -------------------------------------------------------------

document.getElementById('btn-back-classes').addEventListener('click', () => {
  showView('classSelect');
  // class-card-grid auto-refreshes; no manual call needed.
  if (activeClassUnsubscribe) {
    activeClassUnsubscribe();
    activeClassUnsubscribe = null;
  }
});

const wheelSvg = document.getElementById('wheel-svg');

/** Build sector + label markup for the wheel's current roster. */
function renderWheel() {
  const visibleRoster = visibleNames();
  const n = visibleRoster.length;
  wheelSvg.innerHTML = '';

  // Outer hub circle (so an empty wheel still has a visible disk).
  const hub = svgEl('circle', {
    cx: 0,
    cy: 0,
    r: 95,
    fill: 'rgb(var(--paper-cream))',
    stroke: 'rgb(var(--paper-edge) / 0.18)',
    'stroke-width': 1,
  });
  wheelSvg.appendChild(hub);

  if (n === 0) {
    const t = svgEl('text', {
      x: 0,
      y: 0,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': 'var(--font-slab)',
      'font-size': 7,
      fill: 'var(--ink-muted)',
    });
    t.textContent = state.activeRoster.length === 0
      ? 'No students'
      : 'Everyone has been picked';
    wheelSvg.appendChild(t);
    return;
  }

  const sectorDeg = 360 / n;
  for (let i = 0; i < n; i++) {
    // Sector i spans from i*sectorDeg to (i+1)*sectorDeg, with 0° at 12 o'clock
    // and increasing clockwise. We orient the path so sector 0 is centered at
    // 12 o'clock (i.e. its midpoint is up).
    const startDeg = i * sectorDeg - sectorDeg / 2;
    const endDeg = startDeg + sectorDeg;

    // Subtle alternating fill in cream/ink-tint to give sector definition
    // without a saturated palette (per the suite's design rules).
    const fill = i % 2 === 0
      ? 'rgb(var(--paper-cream))'
      : 'rgb(var(--paper-edge) / 0.06)';

    const path = svgEl('path', {
      d: sectorPath(95, startDeg, endDeg),
      fill,
      stroke: 'rgb(var(--paper-edge) / 0.18)',
      'stroke-width': 0.6,
    });
    wheelSvg.appendChild(path);

    // Label: rotated from the wheel's center to the sector's midpoint
    // angle, then placed along that radius. The text reads outward.
    const label = visibleRoster[i];
    const fontSize = labelFontSize(n);
    const txt = svgEl('text', {
      transform: `rotate(${i * sectorDeg}) translate(0,-58)`,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': 'var(--font-slab)',
      'font-size': fontSize,
      'font-weight': 600,
      fill: 'rgb(var(--paper-edge))',
    });
    txt.textContent = truncateLabel(label, n);
    wheelSvg.appendChild(txt);
  }

  // Center cap — also catches mouse to keep clicks off random sectors.
  const cap = svgEl('circle', {
    cx: 0,
    cy: 0,
    r: 12,
    fill: 'rgb(var(--paper-cream))',
    stroke: 'rgb(var(--paper-edge) / 0.4)',
    'stroke-width': 1,
  });
  wheelSvg.appendChild(cap);
}

/** Build an SVG arc path for a sector (degrees measured clockwise from 12 o'clock). */
function sectorPath(r, startDeg, endDeg) {
  // Convert from "clockwise from 12 o'clock" to math radians (counterclockwise from 3 o'clock).
  // 12 o'clock is -90° in math terms, and clockwise is negative direction.
  function toCart(deg) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [r * Math.cos(rad), r * Math.sin(rad)];
  }
  const [x1, y1] = toCart(startDeg);
  const [x2, y2] = toCart(endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M0,0 L${x1.toFixed(3)},${y1.toFixed(3)} A${r},${r} 0 ${largeArc} 1 ${x2.toFixed(3)},${y2.toFixed(3)} Z`;
}

function labelFontSize(n) {
  if (n <= 6) return 9;
  if (n <= 12) return 7;
  if (n <= 20) return 5.5;
  if (n <= 30) return 4.5;
  return 3.6;
}

function truncateLabel(label, n) {
  // For very tight sectors, fall back to first name only.
  if (n > 30 && label.includes(' ')) return label.split(' ')[0];
  if (label.length > 18 && n > 12) return label.slice(0, 16) + '…';
  return label;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Names eligible for the next pick, given the "Allow repeats" toggle. */
function visibleNames() {
  if (state.options.allowRepeats) return state.activeRoster.slice();
  return state.activeRoster.filter((n) => !state.pickedThisSession.has(n));
}

function renderRoster() {
  const list = document.getElementById('roster-list');
  list.innerHTML = '';
  for (const name of state.activeRoster) {
    const li = document.createElement('li');
    li.className = 'roster-row';
    if (!state.options.allowRepeats && state.pickedThisSession.has(name)) {
      li.classList.add('is-picked');
    }
    if (state.justPicked === name) li.classList.add('is-just-picked');

    const left = document.createElement('span');
    left.textContent = name;
    li.appendChild(left);

    if (state.options.showCounts) {
      const right = document.createElement('span');
      right.className = 'roster-count';
      const count = storage.getCallCount(state.activeClassId, name);
      right.textContent = count > 0 ? String(count) : '';
      li.appendChild(right);
    }
    list.appendChild(li);
  }
}

function updateSpinButton() {
  const spin = document.getElementById('btn-spin');
  const msg = document.getElementById('wheel-msg');
  const remaining = visibleNames().length;
  if (state.activeRoster.length === 0) {
    spin.disabled = true;
    msg.textContent = 'Add students to start picking.';
  } else if (remaining === 0) {
    spin.disabled = true;
    msg.textContent = 'Everyone has been picked. Reset session?';
  } else {
    spin.disabled = state.isSpinning;
    msg.textContent = '';
  }
}

// Spin
const spinBtn = document.getElementById('btn-spin');
const spinAgainBtn = document.getElementById('btn-spin-again');
const pickedCard = document.getElementById('picked-card');
const pickedNameEl = document.getElementById('picked-name');

function spin() {
  if (state.isSpinning) return;
  const eligible = visibleNames();
  if (eligible.length === 0) return;

  // Pick name first, then translate to its sector index in the *visible* wheel.
  const visibleIndex = Math.floor(Math.random() * eligible.length);
  const pickedName = eligible[visibleIndex];

  // The wheel renders only `eligible` names. So sector visibleIndex IS the picked sector.
  const n = eligible.length;
  const sectorDeg = 360 / n;
  const finalOffset = -((visibleIndex + 0.5) * sectorDeg);
  const turns = 5 + Math.floor(Math.random() * 4); // 5–8

  // currentRotation may have any cumulative value. We add full turns and the
  // delta needed to land the picked sector midpoint at the pointer (0°).
  const target =
    state.currentRotation +
    turns * 360 +
    (finalOffset - (state.currentRotation % 360));
  state.currentRotation = target;

  state.isSpinning = true;
  pickedCard.hidden = true;
  spinBtn.disabled = true;

  wheelSvg.style.transform = `rotate(${target}deg)`;
  wheelSvg.addEventListener('transitionend', onSpinEnd, { once: true });

  function onSpinEnd() {
    state.isSpinning = false;
    state.justPicked = pickedName;
    state.pickedThisSession.add(pickedName);
    storage.incrementCallCount(state.activeClassId, pickedName);

    pickedNameEl.textContent = pickedName;
    pickedCard.hidden = false;

    // If the toggle excludes repeats, the next render needs to drop the
    // picked name out of the wheel so the visible sectors match the
    // remaining roster.
    if (!state.options.allowRepeats) {
      renderWheel();
      // Any currentRotation works for a fresh wheel — keep continuity.
    }

    renderRoster();
    updateSpinButton();
  }
}

spinBtn.addEventListener('click', spin);
spinAgainBtn.addEventListener('click', () => {
  pickedCard.hidden = true;
  state.justPicked = null;
  renderRoster();
  spin();
});

// Spacebar to spin (only on the wheel view; ignore when typing or when
// any overlay — settings, new-class, etc. — is open above us).
document.addEventListener('keydown', (e) => {
  if (e.key !== ' ') return;
  if (VIEW.wheel.hidden) return;
  const t = e.target;
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if (document.querySelector('.suite-overlay')) return;
  e.preventDefault();
  spin();
});

// Toggles
document.getElementById('opt-allow-repeats').addEventListener('change', (e) => {
  state.options.allowRepeats = e.target.checked;
  renderWheel();
  renderRoster();
  updateSpinButton();
});
document.getElementById('opt-show-counts').addEventListener('change', (e) => {
  state.options.showCounts = e.target.checked;
  renderRoster();
});

// Reset session
document.getElementById('btn-reset-session').addEventListener('click', () => {
  state.pickedThisSession.clear();
  state.justPicked = null;
  pickedCard.hidden = true;
  renderWheel();
  renderRoster();
  updateSpinButton();
});

// -------------------------------------------------------------
// Boot
// -------------------------------------------------------------
mountClassSelect();
showView('classSelect');
