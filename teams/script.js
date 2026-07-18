// =============================================================
// THE TEACHER'S DESK — Team Maker
//
// Split a class into teams: pick a class, choose team size or team
// count, pick one of the sensible partitions the math offers, then
// reveal the (already-shuffled) teams with one of four ceremonies —
// marble sorter, draft cards, gacha capsules, or a very serious
// algorithm terminal. Reveal modules live in shared/reveals/ behind
// a small contract so future pickers can reuse them.
//
// Suite conventions honored: roster via the roster bridge, prefs via
// shared storage, no direct localStorage. Team-making doesn't call
// on anyone, so call counts are NOT incremented here.
// =============================================================

import { getRoster, getClassName } from '../shared/roster-bridge.js';
import { getPreference, setPreference } from '../shared/storage.js';
import { mountSettingsButton } from '../shared/settings.js';
import { marbleColor, initialsOf } from '../shared/components/marbles.js';
import { mountClassCardGrid } from '../shared/components/class-card-grid.js';
import { displayName, collisionFirstNames } from '../shared/display-name.js';
import marbleSorter from '../shared/reveals/marble-sorter.js';
import draftCards from '../shared/reveals/draft-cards.js';
import gachaCapsules from '../shared/reveals/gacha-capsules.js';
import algorithmTerminal from '../shared/reveals/algorithm-terminal.js';

mountSettingsButton();

const REVEALS = [marbleSorter, draftCards, gachaCapsules, algorithmTerminal];

const state = {
  classId: null,
  className: '',
  names: [],
  absent: new Set(),       // session-only — absences change daily
  mode: 'size',            // 'size' | 'count'
  sizeValue: 4,            // each mode keeps its own number
  countValue: 4,
  options: [],             // enumerated partitions: arrays of team sizes
  partitionIndex: 0,
  revealId: getPreference('teams.reveal', 'sorter'),
  assignments: [],         // [{ name, label, initials, color, binIndex }] reveal order
  bins: [],                // [{ label, size }]
  reveal: null,            // active reveal instance { start, destroy }
  activeSkin: null,        // reveal-view class from the module's skinClass
  revealRan: false,
};

/** Students actually here today, in roster order. */
function presentNames() {
  return state.names.filter((n) => !state.absent.has(n));
}

/* ── Partition math ─────────────────────────────────────────────
   "Sensible" options only: teams within one of each other, plus the
   literal k-full-teams + remainder split so a teacher can keep exact
   sizes when that's the point. */
function balanced(n, t) {
  if (t < 1 || t > n) return null;
  const q = Math.floor(n / t), r = n % t;
  return [...Array(r).fill(q + 1), ...Array(t - r).fill(q)];
}

function partitionOptions(n, mode, value) {
  const seen = new Map();
  const push = (sizes) => {
    if (!sizes || sizes.length === 0) return;
    const clean = sizes.filter((s) => s > 0).sort((a, b) => b - a);
    if (clean.reduce((a, b) => a + b, 0) !== n) return;
    seen.set(clean.join('+'), clean);
  };
  if (mode === 'size') {
    const s = Math.min(value, n);
    const k = Math.floor(n / s), r = n % s;
    if (r === 0) {
      push(Array(k).fill(s));
    } else {
      push([...Array(k).fill(s), r]);   // exact teams + one short team
      push(balanced(n, k + 1));         // spread the shortage around
      if (k >= 2) push(balanced(n, k)); // fewer, slightly bigger teams
    }
  } else {
    const t = Math.min(value, n);
    push(balanced(n, t));
    // Alternative: keep t-1 teams at the ceiling, pool the rest.
    const q = Math.ceil(n / t);
    const rest = n - q * (t - 1);
    if (t >= 2 && rest > 0 && rest !== q) push([...Array(t - 1).fill(q), rest]);
  }
  return [...seen.values()];
}

/** "2 of 4 + 2 of 3" from [4,4,3,3] — the split itself, kept short. */
function describePartition(sizes) {
  const runs = [];
  for (const s of sizes) {
    const last = runs[runs.length - 1];
    if (last && last.size === s) last.count++;
    else runs.push({ size: s, count: 1 });
  }
  return runs.map((r) => `${r.count} of ${r.size}`).join(' + ');
}

/* ── Views ──────────────────────────────────────────────────── */
const VIEWS = ['class-select-view', 'setup-view', 'reveal-view'];
function showView(id) {
  for (const v of VIEWS) document.getElementById(v).hidden = v !== id;
  document.body.classList.toggle('app-view', id !== 'class-select-view');
  // Drives the fullscreen chrome-hide (borderless projector mode).
  document.body.classList.toggle('view-reveal', id === 'reveal-view');
  document.getElementById('crumb-tool').hidden = id === 'class-select-view';
  const crumbCtx = document.getElementById('crumb-context');
  crumbCtx.hidden = id === 'class-select-view';
  crumbCtx.textContent = state.className;
}

/* ── Class select ───────────────────────────────────────────── */
let classGridCtl = null;

function showClassSelect() {
  destroyReveal();
  showView('class-select-view');
  // Shared suite class-select (marble-pool cards, live refresh).
  if (!classGridCtl) {
    classGridCtl = mountClassCardGrid(document.getElementById('class-grid'), {
      marblePool: true,
      onSelect: (classId) => openSetup(classId),
      emptyMessage: 'No classes yet. Create one in the Seating Chart or the Wheel first.',
    });
  } else {
    classGridCtl.refresh();
  }
}

/* ── Setup (math panel) ─────────────────────────────────────── */
function openSetup(classId) {
  destroyReveal();
  state.classId = classId;
  state.className = getClassName(classId) || '(unnamed)';
  state.names = getRoster(classId);
  state.absent = new Set(); // session-only: fresh every class open
  if (state.names.length < 2) return;
  document.getElementById('setup-class-name').textContent = state.className;
  showView('setup-view');
  renderAbsent();
  refreshPartitions();
  renderRevealStyles();
}

/* ── Absences ───────────────────────────────────────────────── */
function renderAbsent() {
  const select = document.getElementById('absent-select');
  select.innerHTML =
    '<option value="">Mark absent…</option>' +
    presentNames().map((n) => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  const chips = document.getElementById('absent-chips');
  chips.innerHTML = [...state.absent].map((n) => `
    <span class="absent-chip">${escHtml(n)}
      <button type="button" data-name="${escHtml(n)}" aria-label="Mark ${escHtml(n)} present">&times;</button>
    </span>`).join('');
  const present = presentNames().length;
  const total = state.names.length;
  document.getElementById('setup-count-line').textContent =
    state.absent.size === 0
      ? `${total} students to split.`
      : `${present} of ${total} students to split — ${state.absent.size} absent.`;
}

document.getElementById('absent-select').addEventListener('change', (e) => {
  const name = e.target.value;
  if (!name) return;
  state.absent.add(name);
  state.partitionIndex = 0;
  renderAbsent();
  refreshPartitions();
});
document.getElementById('absent-chips').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-name]');
  if (!btn) return;
  state.absent.delete(btn.dataset.name);
  state.partitionIndex = 0;
  renderAbsent();
  refreshPartitions();
});

/* ── Split control + partitions ─────────────────────────────── */
function currentValue() {
  return state.mode === 'size' ? state.sizeValue : state.countValue;
}

function refreshPartitions() {
  const n = presentNames().length;
  const v = currentValue();
  const host = document.getElementById('partition-options');
  const makeBtn = document.getElementById('btn-make');
  state.options = (Number.isFinite(v) && v >= 2 && n >= 2)
    ? partitionOptions(n, state.mode, v)
    : [];
  if (state.partitionIndex >= state.options.length) state.partitionIndex = 0;
  makeBtn.disabled = state.options.length === 0;
  if (state.options.length === 0) {
    host.innerHTML = n < 2
      ? '<p class="partition-note">Not enough students present to split.</p>'
      : '<p class="partition-note">That doesn\'t split — try another number.</p>';
    return;
  }
  host.innerHTML = state.options.map((sizes, i) => `
    <button type="button" class="partition-card${i === state.partitionIndex ? ' is-active' : ''}" data-i="${i}">
      <strong>${describePartition(sizes)}</strong>
      <span>${sizes.length} team${sizes.length === 1 ? '' : 's'}</span>
    </button>`).join('');
}

document.getElementById('partition-options').addEventListener('click', (e) => {
  const card = e.target.closest('.partition-card');
  if (!card) return;
  state.partitionIndex = Number(card.dataset.i);
  refreshPartitions();
});

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.split-mode').forEach((row) => {
    const active = row.dataset.mode === mode;
    row.classList.toggle('is-active', active);
    row.querySelector('input[type="radio"]').checked = active;
  });
  state.partitionIndex = 0;
  refreshPartitions();
}

document.querySelectorAll('.split-mode').forEach((row) => {
  row.querySelector('input[type="radio"]').addEventListener('change', () => setMode(row.dataset.mode));
  // Typing in a row's number is an implicit "I mean this mode".
  row.querySelector('input[type="number"]').addEventListener('focus', () => setMode(row.dataset.mode));
});
document.getElementById('size-value').addEventListener('input', (e) => {
  state.sizeValue = Math.floor(Number(e.target.value));
  state.partitionIndex = 0;
  refreshPartitions();
});
document.getElementById('count-value').addEventListener('input', (e) => {
  state.countValue = Math.floor(Number(e.target.value));
  state.partitionIndex = 0;
  refreshPartitions();
});

function renderRevealStyles() {
  const host = document.getElementById('reveal-styles');
  host.innerHTML = REVEALS.map((r) => `
    <button type="button" class="reveal-style-card${r.id === state.revealId ? ' is-active' : ''}" data-id="${r.id}">
      ${r.glyph}<span>${r.label}</span>
    </button>`).join('');
}
document.getElementById('reveal-styles').addEventListener('click', (e) => {
  const card = e.target.closest('.reveal-style-card');
  if (!card) return;
  state.revealId = card.dataset.id;
  setPreference('teams.reveal', state.revealId);
  renderRevealStyles();
});

/* ── Assignment + reveal ────────────────────────────────────── */
function makeAssignments() {
  const sizes = state.options[state.partitionIndex];
  state.bins = sizes.map((size, i) => ({ label: `Team ${i + 1}`, size }));
  const present = presentNames();
  // Ceremony labels: first name, last initial only when two present
  // students share a first name (shared suite rule — display-name.js).
  const students = present.map((name) => ({ name }));
  const collisions = collisionFirstNames(students);
  // Shuffle the present students (color stays keyed to roster index).
  const picks = present.map((name) => ({
    name,
    label: displayName({ name }, undefined, collisions),
    initials: initialsOf(name),
    color: marbleColor(state.names.indexOf(name)),
  }));
  for (let i = picks.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  // Dispense order is the ceremony's call: a draft alternates teams,
  // the gacha machine fills one team completely before the next.
  const module = REVEALS.find((r) => r.id === state.revealId) || REVEALS[0];
  state.assignments = [];
  if (module.order === 'sequential') {
    let k = 0;
    sizes.forEach((size, b) => {
      for (let s = 0; s < size; s++) {
        state.assignments.push({ ...picks[k++], binIndex: b });
      }
    });
  } else {
    const remaining = sizes.slice();
    let bin = 0;
    for (const pick of picks) {
      while (remaining[bin % sizes.length] === 0) bin++;
      const b = bin % sizes.length;
      remaining[b]--;
      bin++;
      state.assignments.push({ ...pick, binIndex: b });
    }
  }
}

function renderColumns() {
  const host = document.getElementById('team-columns');
  host.innerHTML = state.bins.map((b, k) => `
    <div class="team-col" data-bin="${k}">
      <h3>${escHtml(b.label)} <span class="count">(${b.size})</span></h3>
      <ul>${Array(b.size).fill('<li class="is-empty">—</li>').join('')}</ul>
    </div>`).join('');
}

function fillColumn(i) {
  const a = state.assignments[i];
  const col = document.querySelector(`.team-col[data-bin="${a.binIndex}"] ul`);
  if (!col) return;
  const slot = col.querySelector('li.is-empty');
  if (!slot) return;
  slot.classList.remove('is-empty');
  slot.classList.add('is-new');
  slot.innerHTML = `<span class="dot" style="background:${a.color}"></span>${escHtml(a.name)}`;
  setTimeout(() => slot.classList.remove('is-new'), 900);
}

function destroyReveal() {
  if (state.reveal) {
    state.reveal.destroy();
    state.reveal = null;
  }
  if (state.activeSkin) {
    document.getElementById('reveal-view').classList.remove(state.activeSkin);
    document.body.classList.remove(state.activeSkin);
    state.activeSkin = null;
  }
  state.revealRan = false;
}

function mountReveal() {
  destroyReveal();
  const stage = document.getElementById('reveal-stage');
  stage.innerHTML = '';
  renderColumns();
  const module = REVEALS.find((r) => r.id === state.revealId) || REVEALS[0];
  // Diegetic skin: every ceremony restyles the whole reveal view —
  // body backdrop, board, buttons, header — to be part of its world.
  // No homepage wood or beige survives inside a reveal.
  if (module.skinClass) {
    document.getElementById('reveal-view').classList.add(module.skinClass);
    document.body.classList.add(module.skinClass);
    state.activeSkin = module.skinClass;
  }
  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  state.reveal = module.create(stage, {
    assignments: state.assignments,
    bins: state.bins,
    title: state.className,
    reducedMotion,
    onAssign: (i) => fillColumn(i),
    onDone: () => {
      state.revealRan = true;
      document.getElementById('btn-run').disabled = false;
      document.getElementById('btn-run').textContent = 'Reveal again';
    },
  });
  document.getElementById('btn-run').disabled = false;
  document.getElementById('btn-run').textContent = 'Reveal teams';
}

function openReveal() {
  if (state.options.length === 0) return;
  makeAssignments();
  document.getElementById('reveal-class-name').textContent = state.className;
  showView('reveal-view');
  mountReveal();
}

function runReveal() {
  if (!state.reveal) return;
  if (state.revealRan) {
    // Same teams, fresh ceremony.
    mountReveal();
  }
  document.getElementById('btn-run').disabled = true;
  state.reveal.start();
}

document.getElementById('btn-make').addEventListener('click', openReveal);
document.getElementById('btn-run').addEventListener('click', runReveal);
document.getElementById('btn-reroll').addEventListener('click', () => {
  makeAssignments();
  mountReveal();
});
document.getElementById('btn-back-setup').addEventListener('click', () => {
  destroyReveal();
  showView('setup-view');
});
document.getElementById('crumb-tool').addEventListener('click', (e) => {
  e.preventDefault();
  showClassSelect();
});

/* ── Audio mute toggle (topstrip) ───────────────────────────────
   Suite convention: a tool that plays audio keeps a visible mute
   toggle. Teams' only sound source is the reveal modules' synth,
   which reads the suite 'soundMuted' preference per note — so the
   toggle flips that pref and takes effect immediately. */
function updateAudioToggleUI() {
  const btn = document.getElementById('btn-audio-toggle');
  if (!btn) return;
  const muted = !!getPreference('soundMuted', false);
  const use = btn.querySelector('use');
  if (use) use.setAttribute('href', muted ? '#icon-volume-x' : '#icon-volume');
  btn.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
  btn.title = muted ? 'Unmute audio (M)' : 'Mute audio (M)';
  btn.setAttribute('aria-pressed', String(muted));
  btn.classList.toggle('is-muted', muted);
}

function toggleAudioMuted() {
  setPreference('soundMuted', !getPreference('soundMuted', false));
  updateAudioToggleUI();
}

document.getElementById('btn-audio-toggle')?.addEventListener('click', toggleAudioMuted);
updateAudioToggleUI();

/* ── Fullscreen + keys (suite grammar) ──────────────────────── */
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}
document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  const inFs = !!document.fullscreenElement;
  document.body.classList.toggle('is-fullscreen', inFs);
  const use = document.getElementById('btn-fullscreen')?.querySelector('use');
  if (use) use.setAttribute('href', inFs ? '#icon-fullscreen-exit' : '#icon-fullscreen');
});

document.addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const inReveal = !document.getElementById('reveal-view').hidden;
  const inSetup = !document.getElementById('setup-view').hidden;
  if (e.key === ' ' && inReveal) {
    e.preventDefault();
    runReveal();
  } else if (e.key === 'Escape') {
    if (document.fullscreenElement) return;
    if (inReveal) { destroyReveal(); showView('setup-view'); }
    else if (inSetup) showClassSelect();
  } else if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    toggleFullscreen();
  } else if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    toggleAudioMuted();
  }
});

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

showClassSelect();
