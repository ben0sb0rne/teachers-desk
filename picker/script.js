// =============================================================
// picker/script.js — Name Picker tool
//
// Picks a name from a class via spinning wheel. Reads classes via shared
// storage with a fallback to the seating chart's blob. New classes created
// here write canonical metadata + roster. Call counts increment on each
// pick (groundwork for future fairness logic).
//
// UI is intentionally minimal: just the wheel + a small back link + the
// suite settings gear. Allow-repeats / Reset session live inside the
// shared settings dialog (registered via `registerToolSettings`).
//
// Suite integration:
//   - <body class="wood-bg"> + anti-FOUC theme script in index.html
//   - .suite-topstrip with wordmark + tool name
//   - Floating settings gear + 'S' shortcut via shared/settings.js
// =============================================================

import * as storage from '../shared/storage.js';
import * as bridge from '../shared/roster-bridge.js';
import { mountSettingsButton, registerToolSettings } from '../shared/settings.js';
import { mountClassCardGrid } from '../shared/components/class-card-grid.js';
import { openOverlay } from '../shared/components/overlay.js';
import { mountPasteBulk } from '../shared/components/paste-bulk.js';

let activeClassUnsubscribe = null;

// Cancels the pending transitionend listener for an in-flight spin. Set by
// spin() at the start of a spin and cleared by onSpinEnd or abortPendingSpin.
// Without this, navigating away mid-spin leaves an orphan listener that fires
// on the next spin's transitionend and double-counts (or misattributes) picks.
let pendingSpinController = null;

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
  activeRoster: [],
  pickedThisSession: new Set(),
  lastPickedName: null, // most-recent picked name; used to highlight its sector
  currentRotation: 0,
  isSpinning: false,
  options: {
    allowRepeats: storage.getPreference('picker.allowRepeats', true),
  },
};

function showView(name) {
  for (const [k, el] of Object.entries(VIEW)) el.hidden = k !== name;
  // Toggle the in-bar "All Classes" link — visible only when we're not on
  // the class-select view (where it would be a no-op link to the current
  // page). Mirrors the seating chart's index-route behavior.
  const allClassesLink = document.getElementById('topstrip-all-classes');
  if (allClassesLink) allClassesLink.hidden = name === 'classSelect';
}

// -------------------------------------------------------------
// CLASS SELECT VIEW
// -------------------------------------------------------------
let classGridCtl = null;

function mountClassSelect() {
  if (classGridCtl) return;
  const grid = document.getElementById('class-grid');
  const empty = document.getElementById('class-empty');
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

function abortPendingSpin() {
  if (!pendingSpinController) return;
  pendingSpinController.abort();
  pendingSpinController = null;
  state.isSpinning = false;
}

function openClass(classId) {
  abortPendingSpin();
  state.activeClassId = classId;
  state.activeClassName = storage.getClassName(classId) || '(unnamed)';
  state.activeRoster = storage.getRoster(classId).slice();
  state.pickedThisSession.clear();
  state.lastPickedName = null;
  state.currentRotation = 0;

  if (activeClassUnsubscribe) activeClassUnsubscribe();
  activeClassUnsubscribe = bridge.onRosterChange(classId, ({ names }) => {
    state.activeRoster = names.slice();
    renderWheel();
    updateMessage();
  });

  // Source badge for seating-chart-owned classes.
  const cls = storage.listClasses().find((c) => c.id === classId);
  document.getElementById('wheel-class-source').hidden = !cls || cls.source !== 'seating-chart';
  document.getElementById('wheel-class-name').textContent = state.activeClassName;

  // Reset wheel transform without animating.
  wheelSvg.style.transition = 'none';
  wheelSvg.style.transform = 'rotate(0deg)';
  void wheelSvg.getBoundingClientRect();
  wheelSvg.style.transition = '';

  showView('wheel');
  renderWheel();
  updateMessage();
}

// -------------------------------------------------------------
// NEW-CLASS MODAL (unchanged)
// -------------------------------------------------------------

function openNewClassModal() {
  const handle = openOverlay({ title: 'New class' });
  const body = handle.body;

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

// Back-to-classes is now triggered from the in-bar "All Classes" link.
// Same handler the old in-view button used; preventDefault on the anchor
// since the href="#" is just a placeholder for accessibility.
document.getElementById('topstrip-all-classes').addEventListener('click', (e) => {
  e.preventDefault();
  abortPendingSpin();
  showView('classSelect');
  if (activeClassUnsubscribe) {
    activeClassUnsubscribe();
    activeClassUnsubscribe = null;
  }
});

const wheelSvg = document.getElementById('wheel-svg');

// Wheel geometry (in viewBox units; viewBox is -100..100).
const HUB_R = 14;
const RIM_R = 96;
const LABEL_OUTER_PAD = 8;
const LABEL_INNER_PAD = 4;  // gap between text and the hub

// World angle the pointer sits at. 0 = top of wheel, 90 = right side (3 o'clock).
const POINTER_DEG = 90;

/**
 * Build sector + label markup for the visible roster.
 *
 * Labels are RADIAL: each name reads along its sector's centerline, from
 * the outer rim toward the hub. We use the wheel's depth (RIM_R - HUB_R,
 * about 80 viewBox units) for text length, which gives long names like
 * "Helena Harper" room to fit even on a 17-name wheel.
 *
 * The left half of the wheel (sectors with midpoint angle in (180°, 360°))
 * gets a 180° flip + anchor swap so letters stay upright on that side. The
 * remaining seam is at the bottom (sector midpoint near 180°), where the
 * two halves' rotation conventions differ by 180°.
 */
function renderWheel() {
  const visible = visibleNames();
  const n = visible.length;
  wheelSvg.innerHTML = '';

  // Outer disk so the wheel is always a full circle, even with one slice.
  appendSvg('circle', {
    cx: 0, cy: 0, r: RIM_R,
    fill: 'rgb(var(--paper-cream))',
    stroke: 'rgb(var(--paper-edge) / 0.18)',
    'stroke-width': 1,
  });

  if (n === 0) {
    const t = appendSvg('text', {
      x: 0, y: 0,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': 'var(--font-slab)',
      'font-size': 9,
      fill: 'rgb(var(--paper-edge) / 0.6)',
    });
    t.textContent = state.activeRoster.length === 0
      ? 'No students'
      : 'Everyone has been picked';
    appendSvg('circle', {
      cx: 0, cy: 0, r: HUB_R,
      fill: 'rgb(var(--paper-cream))',
      stroke: 'rgb(var(--paper-edge) / 0.4)',
      'stroke-width': 1,
    });
    return;
  }

  const sectorDeg = 360 / n;
  const fontSize = labelFontSize(n);
  const outerR = RIM_R - LABEL_OUTER_PAD;
  const lastPickedIndex = state.lastPickedName != null
    ? visible.indexOf(state.lastPickedName)
    : -1;

  for (let i = 0; i < n; i++) {
    const startDeg = i * sectorDeg - sectorDeg / 2;
    const endDeg = startDeg + sectorDeg;

    const isPicked = i === lastPickedIndex;
    const fill = isPicked
      ? 'rgb(var(--accent-yellow) / 0.55)'
      : i % 2 === 0
        ? 'rgb(var(--paper-cream))'
        : 'rgb(var(--paper-edge) / 0.06)';

    appendSvg('path', {
      d: sectorPath(RIM_R, startDeg, endDeg),
      fill,
      stroke: 'rgb(var(--paper-edge) / 0.2)',
      'stroke-width': 0.6,
    });

    // Radial label: anchor at the outer-rim end of the sector centerline,
    // text grows inward toward the hub. Rotation is θ - 90 for the right
    // half (so the baseline runs along the radial direction, outward) and
    // θ + 90 for the left half (with anchor swapped to 'start') so the
    // letters stay upright on that side instead of being mirrored.
    const θ = i * sectorDeg;
    const norm = ((θ % 360) + 360) % 360;
    const flipForLeft = norm > 180 && norm < 360;
    const θ_rad = θ * Math.PI / 180;
    const ax = outerR * Math.sin(θ_rad);
    const ay = -outerR * Math.cos(θ_rad);
    const rotation = flipForLeft ? θ + 90 : θ - 90;

    const txt = appendSvg('text', {
      x: ax.toFixed(3),
      y: ay.toFixed(3),
      transform: `rotate(${rotation.toFixed(3)}, ${ax.toFixed(3)}, ${ay.toFixed(3)})`,
      'text-anchor': flipForLeft ? 'start' : 'end',
      'dominant-baseline': 'central',
      'font-family': 'var(--font-slab)',
      'font-size': fontSize,
      'font-weight': isPicked ? 700 : 600,
      fill: 'rgb(var(--paper-edge))',
    });
    txt.textContent = truncateLabel(visible[i], n);
  }

  // Center hub last so it sits above the sector strokes.
  appendSvg('circle', {
    cx: 0, cy: 0, r: HUB_R,
    fill: 'rgb(var(--paper-cream))',
    stroke: 'rgb(var(--paper-edge) / 0.4)',
    'stroke-width': 1,
  });
}

function sectorPath(r, startDeg, endDeg) {
  function toCart(deg) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [r * Math.cos(rad), r * Math.sin(rad)];
  }
  const [x1, y1] = toCart(startDeg);
  const [x2, y2] = toCart(endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M0,0 L${x1.toFixed(3)},${y1.toFixed(3)} A${r},${r} 0 ${largeArc} 1 ${x2.toFixed(3)},${y2.toFixed(3)} Z`;
}

/**
 * Pick a label font size based on roster size. Radial labels have the
 * wheel's depth (~80 viewBox units) to fit, but they also have to clear
 * the hub at the inner end and not overflow the rim at the outer end —
 * so font shrinks gradually as roster size grows.
 */
function labelFontSize(n) {
  if (n <= 4) return 16;
  if (n <= 8) return 13;
  if (n <= 14) return 11;
  if (n <= 22) return 9;
  if (n <= 32) return 7.5;
  return 6.5;
}

/**
 * Truncate names that wouldn't fit along the radial. Radial layout uses the
 * wheel's depth (~70 viewBox units after padding), so the cutoff scales with
 * the chosen font size — bigger rosters use smaller fonts and need slightly
 * tighter trimming to keep names from running into the hub.
 */
function truncateLabel(label, n) {
  if (n > 32 && label.includes(' ')) return label.split(' ')[0];
  if (n > 22 && label.length > 14) return label.slice(0, 13) + '…';
  if (n > 14 && label.length > 15) return label.slice(0, 14) + '…';
  if (n > 8 && label.length > 22) return label.slice(0, 20) + '…';
  return label;
}

function appendSvg(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  wheelSvg.appendChild(el);
  return el;
}

function visibleNames() {
  if (state.options.allowRepeats) return state.activeRoster.slice();
  return state.activeRoster.filter((n) => !state.pickedThisSession.has(n));
}

function updateMessage() {
  const msg = document.getElementById('wheel-msg');
  const remaining = visibleNames().length;
  if (state.activeRoster.length === 0) {
    msg.textContent = 'Add students to start picking.';
  } else if (remaining === 0) {
    msg.textContent = 'Everyone has been picked. Reset session in settings (S).';
  } else if (state.options.allowRepeats) {
    msg.textContent = '';
  } else {
    const total = state.activeRoster.length;
    const picked = total - remaining;
    msg.textContent = `${picked} / ${total} picked`;
  }
}

// -------------------------------------------------------------
// Spin
// -------------------------------------------------------------

function spin() {
  if (state.isSpinning) return;
  if (VIEW.wheel.hidden) return;
  const eligible = visibleNames();
  if (eligible.length === 0) return;

  const visibleIndex = Math.floor(Math.random() * eligible.length);
  const pickedName = eligible[visibleIndex];

  const n = eligible.length;
  const sectorDeg = 360 / n;
  // Sector i's midpoint sits at world angle (i*sectorDeg + currentRotation),
  // so to land its midpoint at the pointer (angle POINTER_DEG) we need
  // rotation = POINTER_DEG - i*sectorDeg (mod 360). The previous (i + 0.5)
  // factor used to be right when sectors were defined as [i*sectorDeg,
  // (i+1)*sectorDeg]; the current layout centers sector i on i*sectorDeg, so
  // the half-step shift was the bug that landed the pointer on every sector
  // boundary.
  // A small jitter inside the sector (±35% of half-width) keeps it from
  // looking robotic without ever overlapping a neighbor.
  const jitter = (Math.random() - 0.5) * sectorDeg * 0.7;
  const finalOffset = POINTER_DEG - (visibleIndex * sectorDeg) + jitter;
  const turns = 6 + Math.floor(Math.random() * 4); // 6–9 full rotations

  const target =
    state.currentRotation +
    turns * 360 +
    (finalOffset - (state.currentRotation % 360));
  state.currentRotation = target;

  state.isSpinning = true;
  // Clear the previous winner highlight while spinning.
  state.lastPickedName = null;
  renderWheel();

  pendingSpinController = new AbortController();
  wheelSvg.style.transform = `rotate(${target}deg)`;
  wheelSvg.addEventListener('transitionend', onSpinEnd, {
    once: true,
    signal: pendingSpinController.signal,
  });

  function onSpinEnd() {
    pendingSpinController = null;
    state.isSpinning = false;
    state.lastPickedName = pickedName;
    state.pickedThisSession.add(pickedName);
    storage.incrementCallCount(state.activeClassId, pickedName);

    // Re-render so the picked sector lights up. When repeats are off, the
    // picked name drops out of the visible roster — the wheel re-builds
    // around the remaining names without a snap (currentRotation is
    // preserved across spins).
    renderWheel();
    updateMessage();
  }
}

// Click anywhere on the wheel to spin (also keyboard-activatable).
wheelSvg.addEventListener('click', spin);
wheelSvg.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    spin();
  }
});

// -------------------------------------------------------------
// Shortcuts: Space to spin (anywhere on the wheel view), R to reset.
// 'S' for settings is wired by shared/settings.js.
// -------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (VIEW.wheel.hidden) return;
  const t = e.target;
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if (t && t.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('.suite-overlay')) return;

  if (e.key === ' ') {
    e.preventDefault();
    spin();
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    resetSession();
  }
});

function resetSession() {
  state.pickedThisSession.clear();
  state.lastPickedName = null;
  renderWheel();
  updateMessage();
}

// -------------------------------------------------------------
// Tool-specific settings (rendered inside the shared settings dialog)
// -------------------------------------------------------------

registerToolSettings('picker', 'Name Picker', (host) => {
  host.classList.add('picker-settings');

  // Allow repeats toggle.
  const repeatsRow = document.createElement('div');
  repeatsRow.className = 'suite-settings-row';
  const repeatsLabel = document.createElement('label');
  repeatsLabel.htmlFor = 'picker-allow-repeats';
  repeatsLabel.textContent = 'Allow repeats';
  const repeatsInput = document.createElement('input');
  repeatsInput.type = 'checkbox';
  repeatsInput.id = 'picker-allow-repeats';
  repeatsInput.checked = state.options.allowRepeats;
  repeatsInput.addEventListener('change', () => {
    state.options.allowRepeats = repeatsInput.checked;
    storage.setPreference('picker.allowRepeats', repeatsInput.checked);
    renderWheel();
    updateMessage();
  });
  repeatsRow.appendChild(repeatsLabel);
  repeatsRow.appendChild(repeatsInput);
  host.appendChild(repeatsRow);

  // Reset session button.
  const resetRow = document.createElement('div');
  resetRow.className = 'suite-settings-row';
  resetRow.style.justifyContent = 'flex-start';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'desk-button is-ghost';
  resetBtn.textContent = 'Reset session';
  resetBtn.title = 'Clears the picked-this-session set (call counts persist). Shortcut: R';
  resetBtn.addEventListener('click', () => {
    resetSession();
  });
  resetRow.appendChild(resetBtn);
  host.appendChild(resetRow);

  // Help blurb.
  const help = document.createElement('p');
  help.className = 'muted';
  help.style.fontSize = 'var(--type-11)';
  help.style.margin = '8px 0 0';
  help.textContent =
    'Shortcuts: Space spins the wheel. R resets the session. S opens this dialog.';
  host.appendChild(help);
});

// -------------------------------------------------------------
// Boot
// -------------------------------------------------------------
mountClassSelect();
showView('classSelect');
