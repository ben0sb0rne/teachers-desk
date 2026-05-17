// =============================================================
// wheel/script.js — Wheel of Names
//
// Picks a name from a class via a 1970s game-show wheel. Reads
// classes via shared storage; new classes write canonical metadata
// + roster. Call counts increment on each pick.
//
// Storage namespace remains `tools.picker` (and the `picker.*` prefs
// keys) so users who saved settings before the picker→wheel folder
// rename keep them. Folder/URL is now /wheel/.
//
// Suite integration:
//   - <body class="wood-bg"> for class select; toggles to
//     .is-wheel-stage on the wheel view (curtain backdrop).
//   - .suite-topstrip with wordmark + tool name
//   - Floating settings gear + 'S' shortcut via shared/settings.js
//
// Brief reference: briefs/teachers-desk-briefs.docx — Wheel of Names.
// Pointer is on the right (3 o'clock) — deliberate project deviation
// from the brief's "pointer at the top" wording. See the brief for the
// deviation note.
// =============================================================

import * as storage from '../shared/storage.js';
import * as bridge from '../shared/roster-bridge.js';
import { mountSettingsButton, registerToolSettings } from '../shared/settings.js';
import { mountClassCardGrid } from '../shared/components/class-card-grid.js';
import { openOverlay } from '../shared/components/overlay.js';
import { mountPasteBulk } from '../shared/components/paste-bulk.js';
import * as audio from './audio.js';

// Pre-decode the wheel SFX in the background. The AudioContext is
// created suspended on browsers with autoplay policy; the first user
// click resumes it.
audio.preload();
audio.setMuted(storage.getPreference('wheel.muted', false));

let activeClassUnsubscribe = null;
let pendingSpinController = null;

mountSettingsButton();

// -------------------------------------------------------------
// Mute toggle (visible at all times per the brief). Lives in the
// topstrip; 'M' is the keyboard shortcut. State persists via the
// shared preferences store so a teacher who muted last week stays
// muted today.
// -------------------------------------------------------------
const ICON_SOUND_ON =
  '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
    '<path d="M3 10v4h4l5 4V6L7 10H3z" fill="currentColor"/>' +
    '<path d="M16 8c1.5 1.5 1.5 6.5 0 8"/>' +
    '<path d="M19 5c3 3 3 11 0 14"/>' +
  '</svg>';

const ICON_SOUND_OFF =
  '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
    '<path d="M3 10v4h4l5 4V6L7 10H3z" fill="currentColor"/>' +
    '<line x1="16" y1="9" x2="22" y2="15"/>' +
    '<line x1="22" y1="9" x2="16" y2="15"/>' +
  '</svg>';

const audioToggleBtn = document.getElementById('btn-audio-toggle');

function updateAudioToggleUI() {
  if (!audioToggleBtn) return;
  const muted = audio.isMuted();
  audioToggleBtn.innerHTML = muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
  audioToggleBtn.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
  audioToggleBtn.setAttribute('title', muted ? 'Unmute audio (M)' : 'Mute audio (M)');
  audioToggleBtn.setAttribute('aria-pressed', String(muted));
  audioToggleBtn.classList.toggle('is-muted', muted);
}

if (audioToggleBtn) {
  audioToggleBtn.addEventListener('click', () => {
    const next = !audio.isMuted();
    audio.setMuted(next);
    storage.setPreference('wheel.muted', next);
    updateAudioToggleUI();
  });
  updateAudioToggleUI();
}

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
  lastPickedName: null,
  currentRotation: 0,
  isSpinning: false,
  options: {
    allowRepeats: storage.getPreference('picker.allowRepeats', true),
  },
};

function showView(name) {
  for (const [k, el] of Object.entries(VIEW)) el.hidden = k !== name;
  document.body.classList.toggle('is-wheel-stage', name === 'wheel');
  // Per-view body class drives the topstrip background (cream on app-view,
  // transparent on home) via shared/desk.css, and per-tool fullscreen
  // behavior (wheel hides chrome only on the spin view).
  document.body.classList.toggle('view-home', name === 'classSelect');
  document.body.classList.toggle('view-spin', name === 'wheel');
  document.body.classList.toggle('app-view', name === 'wheel');
  // Breadcrumb: tool name + class context only visible in spin view.
  document.getElementById('crumb-tool').hidden    = name !== 'wheel';
  document.getElementById('crumb-context').hidden = name !== 'wheel';
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
  // Kill any rumble loop that was running for the aborted spin.
  audio.stopRumble();
}

function openClass(classId) {
  abortPendingSpin();
  hideReveal();
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

  const cls = storage.listClasses().find((c) => c.id === classId);
  document.getElementById('wheel-class-source').hidden = !cls || cls.source !== 'seating-chart';
  document.getElementById('wheel-class-name').textContent = state.activeClassName;
  // Surface the class name as the breadcrumb's current-context label.
  document.getElementById('crumb-context').textContent = state.activeClassName;

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
// NEW-CLASS MODAL
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

// Breadcrumb middle item — "Wheel of Names" link returns to the
// class-select view. Visible only while a class is open.
document.getElementById('crumb-tool').addEventListener('click', (e) => {
  e.preventDefault();
  abortPendingSpin();
  hideReveal();
  showView('classSelect');
  if (activeClassUnsubscribe) {
    activeClassUnsubscribe();
    activeClassUnsubscribe = null;
  }
});

// Fullscreen toggle. Mirrors the bingo implementation so behaviour
// (icon swap, body class, webkit fallback) stays consistent.
function updateFullscreenBtn() {
  const btn = document.getElementById('btn-fullscreen');
  if (!btn) return;
  const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  document.body.classList.toggle('is-fullscreen', inFs);
  const use = btn.querySelector('use');
  if (use) use.setAttribute('href', inFs ? '#icon-fullscreen-exit' : '#icon-fullscreen');
  btn.setAttribute('aria-label', inFs ? 'Exit fullscreen' : 'Enter fullscreen');
  btn.title = inFs ? 'Exit fullscreen (F)' : 'Enter fullscreen (F)';
}
function toggleFullscreen() {
  const inFs = document.fullscreenElement || document.webkitFullscreenElement;
  if (!inFs) {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    req?.call(el)?.catch?.(() => {});
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    exit?.call(document)?.catch?.(() => {});
  }
}
document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', updateFullscreenBtn);
document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);
document.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    e.preventDefault();
    toggleFullscreen();
  }
});

const wheelSvg = document.getElementById('wheel-svg');

// Wheel geometry (in viewBox units; viewBox is -100..100).
const HUB_R = 14;
const RIM_R = 96;
const LABEL_OUTER_PAD = 6;
const LABEL_INNER_PAD = 4;

// World angle the pointer sits at. 0 = top of wheel, 90 = right (3 o'clock).
// Brief originally specified 0 (top); permanent project deviation to 90.
const POINTER_DEG = 90;

// -------------------------------------------------------------
// Phone fallback. Per the brief: "Phone: degrade to 'tap to pick'
// with a simple animated reveal. Don't try to render the wheel."
// CSS hides .wheel-frame at ≤640px; JS skips both the SVG build
// and the spin animation, so a tap on SPIN just shows the reveal
// banner after a short suspense beat.
// -------------------------------------------------------------
const phoneMq =
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 640px)')
    : null;

function isPhoneMode() {
  return phoneMq ? phoneMq.matches : false;
}

if (phoneMq) {
  // Re-render when crossing the breakpoint (e.g. orientation flip on
  // a tablet that briefly registers as phone-width).
  const onPhoneChange = () => {
    if (state.activeClassId && !state.isSpinning) renderWheel();
  };
  if (typeof phoneMq.addEventListener === 'function') {
    phoneMq.addEventListener('change', onPhoneChange);
  } else if (typeof phoneMq.addListener === 'function') {
    // Older Safari
    phoneMq.addListener(onPhoneChange);
  }
}

// Three-color rotation per the brief: mustard, burnt orange, cream.
// Chocolate sneaks in via the dividers + outer rim, not the wedge fills.
const WEDGE_TOKENS = ['wheel-mustard', 'wheel-orange', 'wheel-cream'];

function wedgeFill(i) {
  return `rgb(var(--${WEDGE_TOKENS[i % WEDGE_TOKENS.length]}))`;
}

function labelInk(i) {
  // Cream ink reads better on the orange wedge; chocolate ink on the
  // mustard + cream wedges.
  const tok = WEDGE_TOKENS[i % WEDGE_TOKENS.length];
  return tok === 'wheel-orange'
    ? 'rgb(var(--wheel-cream))'
    : 'rgb(var(--wheel-chocolate))';
}

/**
 * Build sector + label markup for the visible roster.
 *
 * Labels are RADIAL: each name reads along its sector's centerline, from
 * the outer rim toward the hub. The orientation is uniform — `rotation =
 * θ - 90` with `text-anchor = 'end'` — so any sector that lands at the
 * right pointer (POINTER_DEG = 90) ends up with screen rotation 0 and
 * reads horizontally L→R, right-side up. This is the wheelofnames.com /
 * Wheel-of-Fortune convention; the previous flipForLeft hack made the
 * left half look upright at rest but landed left-half names UPSIDE DOWN
 * at the pointer when picked.
 */
function renderWheel() {
  // On phones the wheel-frame is hidden via CSS; building the SVG is
  // wasteful AND breaks fitLabel (getComputedTextLength on display:none
  // elements returns 0, which would force every name to ellipsis).
  if (isPhoneMode()) {
    wheelSvg.innerHTML = '';
    return;
  }

  const visible = visibleNames();
  const n = visible.length;
  wheelSvg.innerHTML = '';

  // Defs — brass radial gradient for the hub. Rebuilt each render because
  // we wipe SVG content above; cheap (one element).
  const defs = createSvgEl('defs');
  const grad = createSvgEl('radialGradient', {
    id: 'hub-gradient',
    cx: '32%', cy: '28%', r: '85%',
  });
  [
    ['0%',   'rgb(252, 232, 165)'],
    ['45%',  'rgb(214, 178, 80)'],
    ['100%', 'rgb(120, 88, 22)'],
  ].forEach(([offset, color]) => {
    grad.appendChild(createSvgEl('stop', { offset, 'stop-color': color }));
  });
  defs.appendChild(grad);
  wheelSvg.appendChild(defs);

  // Outer disk — cream base, in case any sector calculation leaves a sliver.
  appendSvg('circle', {
    cx: 0, cy: 0, r: RIM_R,
    fill: 'rgb(var(--wheel-cream))',
  });

  if (n === 0) {
    appendSvg('circle', {
      cx: 0, cy: 0, r: HUB_R,
      fill: 'url(#hub-gradient)',
      stroke: 'rgb(var(--wheel-brass-dark))',
      'stroke-width': 1.4,
    });
    const t = appendSvg('text', {
      x: 0, y: RIM_R * 0.55,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': 'var(--font-slab)',
      'font-size': 9,
      'font-weight': 700,
      'letter-spacing': '0.06em',
      fill: 'rgb(var(--wheel-cream))',
    });
    t.textContent = state.activeRoster.length === 0
      ? 'NO STUDENTS YET'
      : 'EVERYONE HAS BEEN PICKED';
    return;
  }

  const sectorDeg = 360 / n;
  const baseFontSize = labelFontSize(n);
  const outerR = RIM_R - LABEL_OUTER_PAD;
  const innerR = HUB_R + LABEL_INNER_PAD;
  const lastPickedIndex = state.lastPickedName != null
    ? visible.indexOf(state.lastPickedName)
    : -1;

  for (let i = 0; i < n; i++) {
    const startDeg = i * sectorDeg - sectorDeg / 2;
    const endDeg = startDeg + sectorDeg;
    const isPicked = i === lastPickedIndex;

    // Wedge fill — alternating warm palette.
    appendSvg('path', {
      d: sectorPath(RIM_R, startDeg, endDeg),
      fill: wedgeFill(i),
      stroke: 'rgb(var(--wheel-cream))',
      'stroke-width': 0.7,
      'stroke-linejoin': 'round',
    });

    // Picked sector glow — brass border on top of the wedge.
    if (isPicked) {
      appendSvg('path', {
        d: sectorPath(RIM_R, startDeg, endDeg),
        fill: 'rgb(var(--wheel-brass) / 0.18)',
        stroke: 'rgb(var(--wheel-brass))',
        'stroke-width': 1.6,
        'stroke-linejoin': 'round',
        class: 'is-picked-glow',
      });
    }

    // Radial label.
    const θ = i * sectorDeg;
    const θ_rad = (θ * Math.PI) / 180;
    const ax = outerR * Math.sin(θ_rad);
    const ay = -outerR * Math.cos(θ_rad);
    const rotation = θ - 90;

    const txt = appendSvg('text', {
      x: ax.toFixed(3),
      y: ay.toFixed(3),
      transform: `rotate(${rotation.toFixed(3)}, ${ax.toFixed(3)}, ${ay.toFixed(3)})`,
      'text-anchor': 'end',
      'dominant-baseline': 'central',
      'font-family': 'var(--font-slab)',
      'font-size': baseFontSize,
      'font-weight': 800,
      'letter-spacing': '0.005em',
      fill: labelInk(i),
    });
    txt.textContent = visible[i];

    // Fit the label: shrink font, then truncate with ellipsis if needed.
    fitLabel(txt, visible[i], outerR - innerR, baseFontSize);
  }

  // Pegs around the rim — one per sector boundary, brass.
  const pegRadius = RIM_R - 2.2;
  for (let i = 0; i < n; i++) {
    const θ = (i + 0.5) * sectorDeg;
    const θ_rad = (θ * Math.PI) / 180;
    appendSvg('circle', {
      cx: (pegRadius * Math.sin(θ_rad)).toFixed(3),
      cy: (-pegRadius * Math.cos(θ_rad)).toFixed(3),
      r: 1.4,
      fill: 'rgb(var(--wheel-brass-dark))',
      stroke: 'rgb(var(--wheel-brass) / 0.6)',
      'stroke-width': 0.4,
    });
  }

  // Outer rim ring — chocolate stroke for definition.
  appendSvg('circle', {
    cx: 0, cy: 0, r: RIM_R,
    fill: 'none',
    stroke: 'rgb(var(--wheel-chocolate))',
    'stroke-width': 1.4,
  });

  // Hub — brass radial gradient.
  appendSvg('circle', {
    cx: 0, cy: 0, r: HUB_R,
    fill: 'url(#hub-gradient)',
    stroke: 'rgb(var(--wheel-brass-dark))',
    'stroke-width': 1.4,
  });
  // Hub center cap (the "screw").
  appendSvg('circle', {
    cx: 0, cy: 0, r: HUB_R * 0.32,
    fill: 'rgb(var(--wheel-brass-dark))',
    stroke: 'rgb(var(--wheel-brass) / 0.7)',
    'stroke-width': 0.5,
  });
}

/**
 * Shrink the label's font, then truncate with an ellipsis if it still
 * overflows the radial budget. Uses getComputedTextLength (works as long
 * as the element is in the DOM, which it is — appendSvg adds it).
 */
function fitLabel(textEl, name, maxLen, baseFont) {
  let fs = baseFont;
  textEl.textContent = name;
  let len = textEl.getComputedTextLength();

  while (len > maxLen && fs > 5.5) {
    fs -= 0.5;
    textEl.setAttribute('font-size', fs);
    len = textEl.getComputedTextLength();
  }

  if (len <= maxLen) return;

  let chars = name.length;
  while (len > maxLen && chars > 1) {
    chars--;
    textEl.textContent = name.slice(0, chars) + '…';
    len = textEl.getComputedTextLength();
  }
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

function labelFontSize(n) {
  if (n <= 4) return 16;
  if (n <= 8) return 13;
  if (n <= 14) return 11;
  if (n <= 22) return 9;
  if (n <= 32) return 7.5;
  return 6.5;
}

function appendSvg(tag, attrs) {
  const el = createSvgEl(tag, attrs);
  wheelSvg.appendChild(el);
  return el;
}

function createSvgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
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
// Spin — single requestAnimationFrame loop driving a three-phase
// continuous-velocity profile.
//
// The previous implementation used two chained CSS transitions
// (accel-cruise + ease-out). That had two physics bugs the user could
// feel: (1) phase 1 ended at velocity 0 but phase 2's cubic-bezier
// started at velocity ~14 — the wheel APPEARED TO SPEED UP entering
// the slow-down. (2) phase 2's curve front-loaded most of its distance
// in the first ~1.5s, leaving the last 5s as near-zero motion — the
// wheel reached its target early and SAT THERE, reading as a snap.
//
// Real wheels coast to a stop with kinematic friction: constant
// deceleration → quadratic position → smooth velocity decay all the
// way to zero. We model:
//   Accel  (0 → T_ACCEL):    quadratic ease-in, v: 0 → V
//   Cruise (T_ACCEL → T_CRUISE): linear at V
//   Decel  (T_CRUISE → 1):   quadratic ease-out, v: V → 0
// Distances scale so total = 1 and velocities match exactly at every
// phase boundary. No discontinuity, no snap, no front-loading.
//
// Brief calls for "spin-up 1–2s, cruise 2–4s, slow-down 3–5s." With
// SPIN_DURATION 11s and the constants below: 1.1s / 4.4s / 5.5s.
// -------------------------------------------------------------

const SPIN_DURATION_MS = 11000;
const T_ACCEL = 0.10;     // accel covers 0–10% of duration
const T_CRUISE = 0.50;    // cruise runs from 10–50%; decel from 50–100%

// Distance fractions derived from velocity-continuity constraints:
//   V_cruise = D_cruise / (T_CRUISE - T_ACCEL)
//   V at accel-end  = 2*D_accel / T_ACCEL          (quadratic ease-in)
//   V at decel-start = 2*D_decel / (1 - T_CRUISE)  (quadratic ease-out)
// All three must equal V; D_accel + D_cruise + D_decel = 1.
// Solving yields V ≈ 1.143 with the values below.
const D_ACCEL  = 0.0714;
const D_CRUISE = 0.5714;
const D_DECEL  = 0.3571;

/** Single-piece cumulative distance function on [0, 1]. */
function spinEase(t) {
  if (t <= T_ACCEL) {
    const x = t / T_ACCEL;
    return D_ACCEL * x * x;                                        // quad ease-in
  } else if (t <= T_CRUISE) {
    const x = (t - T_ACCEL) / (T_CRUISE - T_ACCEL);
    return D_ACCEL + D_CRUISE * x;                                 // linear cruise
  } else {
    const x = (t - T_CRUISE) / (1 - T_CRUISE);
    return D_ACCEL + D_CRUISE + D_DECEL * (1 - (1 - x) * (1 - x)); // quad ease-out
  }
}

function spin() {
  if (state.isSpinning) return;
  if (VIEW.wheel.hidden) return;
  const eligible = visibleNames();
  if (eligible.length === 0) return;
  hideReveal();

  const visibleIndex = Math.floor(Math.random() * eligible.length);
  const pickedName = eligible[visibleIndex];

  const n = eligible.length;
  const sectorDeg = 360 / n;
  // Land near the centerline of sector visibleIndex but with a small
  // jitter so consecutive spins to the same name don't look identical.
  // ±35% of half-sectorDeg keeps it inside the wedge.
  const jitter = (Math.random() - 0.5) * sectorDeg * 0.7;
  const finalOffset = POINTER_DEG - (visibleIndex * sectorDeg) + jitter;
  const turns = 7 + Math.floor(Math.random() * 4); // 7–10 full rotations

  const startRot = state.currentRotation;
  const target = startRot + turns * 360 + (finalOffset - (startRot % 360));
  state.currentRotation = target;

  state.isSpinning = true;
  state.lastPickedName = null;
  renderWheel();

  // Drive rotation manually — drop any in-flight CSS transition.
  wheelSvg.style.transition = 'none';

  pendingSpinController = new AbortController();
  const signal = pendingSpinController.signal;

  // Respect prefers-reduced-motion: snap to the final position so
  // motion-sensitive users still get the result without the 11s spin.
  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion) {
    wheelSvg.style.transform = `rotate(${target}deg)`;
    setTimeout(onSpinEnd, 60);
    return;
  }

  // Phone fallback: wheel is hidden, no rotation to animate. Brief pause
  // for suspense (the reveal banner's own fade-in adds another beat),
  // then onSpinEnd shows the picked name.
  if (isPhoneMode()) {
    setTimeout(onSpinEnd, 700);
    return;
  }

  // Audio: kick off the cruise rumble loop now; peg ticks fire per
  // boundary crossing inside frame(); rumble fades out + thud plays
  // in onSpinEnd; fanfare plays inside showReveal().
  audio.startRumble();

  const startTime = performance.now();
  const totalDelta = target - startRot;
  // Track rotation between frames so we can fire one peg tick per
  // sectorDeg of rotation moved. While-loop catches multiple crossings
  // in a single frame at peak velocity (~25/s for n=24).
  let lastTickRot = startRot;

  function frame(now) {
    if (signal.aborted) return;
    const elapsed = now - startTime;
    const t = Math.min(elapsed / SPIN_DURATION_MS, 1);
    const eased = spinEase(t);
    const rotation = startRot + totalDelta * eased;
    wheelSvg.style.transform = `rotate(${rotation}deg)`;

    while (rotation - lastTickRot >= sectorDeg) {
      audio.playPeg();
      lastTickRot += sectorDeg;
    }

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      onSpinEnd();
    }
  }
  requestAnimationFrame(frame);

  function onSpinEnd() {
    if (signal.aborted) return;
    pendingSpinController = null;
    state.isSpinning = false;
    state.lastPickedName = pickedName;
    state.pickedThisSession.add(pickedName);
    storage.incrementCallCount(state.activeClassId, pickedName);
    audio.stopRumble();
    audio.playThud();
    renderWheel();
    updateMessage();
    showReveal(pickedName);
  }
}

// -------------------------------------------------------------
// Reveal banner + 70s confetti
// -------------------------------------------------------------

function showReveal(name) {
  const reveal = document.getElementById('wheel-reveal');
  const nameEl = document.getElementById('wheel-reveal-name');
  if (!reveal || !nameEl) return;
  nameEl.textContent = name;
  reveal.hidden = false;
  // Force a reflow before adding .is-active so the fade-in transition fires.
  void reveal.getBoundingClientRect();
  reveal.classList.add('is-active');
  spawnConfetti();
  audio.playFanfare();
}

function hideReveal() {
  const reveal = document.getElementById('wheel-reveal');
  if (!reveal) return;
  reveal.classList.remove('is-active');
  reveal.hidden = true;
  document.querySelectorAll('.confetti-piece').forEach((el) => el.remove());
}

function spawnConfetti() {
  const stage = document.querySelector('.wheel-stage');
  if (!stage) return;
  const colorTokens = ['wheel-mustard', 'wheel-orange', 'wheel-cream', 'wheel-brass'];
  const types = ['star', 'dot', 'streamer'];
  const count = 36;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    const type = types[Math.floor(Math.random() * types.length)];
    piece.className = 'confetti-piece is-' + type;
    piece.setAttribute('aria-hidden', 'true');
    piece.style.left = (Math.random() * 100).toFixed(1) + '%';
    piece.style.color = `rgb(var(--${colorTokens[Math.floor(Math.random() * colorTokens.length)]}))`;
    piece.style.setProperty('--drift', (Math.random() * 80 - 40).toFixed(0) + 'px');
    piece.style.setProperty('--rot', (Math.random() * 720 - 360).toFixed(0) + 'deg');
    piece.style.animationDelay = (Math.random() * 0.4).toFixed(2) + 's';
    piece.style.animationDuration = (1.6 + Math.random() * 0.9).toFixed(2) + 's';
    stage.appendChild(piece);
    setTimeout(() => piece.remove(), 3500);
  }
}

// -------------------------------------------------------------
// Click handlers
// -------------------------------------------------------------

const spinButton = document.getElementById('btn-spin');
if (spinButton) spinButton.addEventListener('click', spin);

wheelSvg.addEventListener('click', spin);
wheelSvg.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    spin();
  }
});

const revealEl = document.getElementById('wheel-reveal');
if (revealEl) revealEl.addEventListener('click', hideReveal);

// -------------------------------------------------------------
// Shortcuts: Space spins, R resets the session.
// 'S' for settings is wired by shared/settings.js.
// -------------------------------------------------------------

document.addEventListener('keydown', (e) => {
  if (VIEW.wheel.hidden) return;
  const t = e.target;
  // Skip when focus is on a form/text element. Buttons are excluded too —
  // letting Space activate the focused SPIN button instead of double-firing.
  if (t && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName)) return;
  if (t && t.isContentEditable) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('.suite-overlay')) return;

  if (e.key === ' ') {
    e.preventDefault();
    spin();
  } else if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    resetSession();
  } else if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    if (audioToggleBtn) audioToggleBtn.click();
  }
});

function resetSession() {
  hideReveal();
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

  const help = document.createElement('p');
  help.className = 'muted';
  help.style.fontSize = 'var(--type-11)';
  help.style.margin = '8px 0 0';
  help.textContent =
    'Shortcuts: Space spins the wheel. R resets the session. M toggles sound. S opens this dialog.';
  host.appendChild(help);
});

// -------------------------------------------------------------
// Boot
// -------------------------------------------------------------
mountClassSelect();
showView('classSelect');
