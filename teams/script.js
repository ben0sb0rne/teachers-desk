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

import { getClasses, getRoster, getClassName } from '../shared/roster-bridge.js';
import { getPreference, setPreference } from '../shared/storage.js';
import { mountSettingsButton } from '../shared/settings.js';
import { marbleColor, initialsOf, paintPool } from '../shared/components/marbles.js';
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
  mode: 'size',            // 'size' | 'count'
  value: 4,
  options: [],             // enumerated partitions: arrays of team sizes
  partitionIndex: 0,
  revealId: getPreference('teams.reveal', 'sorter'),
  assignments: [],         // [{ name, initials, color, binIndex }] reveal order
  bins: [],                // [{ label, size }]
  reveal: null,            // active reveal instance { start, destroy }
  revealRan: false,
};

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

/** "2 teams of 4 + 2 teams of 3" from [4,4,3,3]. */
function describePartition(sizes) {
  const runs = [];
  for (const s of sizes) {
    const last = runs[runs.length - 1];
    if (last && last.size === s) last.count++;
    else runs.push({ size: s, count: 1 });
  }
  return runs
    .map((r) => `${r.count} team${r.count === 1 ? '' : 's'} of ${r.size}`)
    .join(' + ');
}

/* ── Views ──────────────────────────────────────────────────── */
const VIEWS = ['class-select-view', 'setup-view', 'reveal-view'];
function showView(id) {
  for (const v of VIEWS) document.getElementById(v).hidden = v !== id;
  document.body.classList.toggle('app-view', id !== 'class-select-view');
  document.getElementById('crumb-tool').hidden = id === 'class-select-view';
  const crumbCtx = document.getElementById('crumb-context');
  crumbCtx.hidden = id === 'class-select-view';
  crumbCtx.textContent = state.className;
}

/* ── Class select ───────────────────────────────────────────── */
function showClassSelect() {
  destroyReveal();
  showView('class-select-view');
  const classes = getClasses();
  const grid = document.getElementById('class-grid');
  document.getElementById('class-empty').hidden = classes.length > 0;
  grid.innerHTML = classes.map((c) => {
    const n = getRoster(c.id).length;
    return `<button type="button" class="teams-class-card" data-id="${escHtml(c.id)}">
      <strong>${escHtml(getClassName(c.id) || 'Untitled class')}</strong>
      <canvas class="teams-card-marbles" width="400" height="72" aria-hidden="true"></canvas>
      <span class="count">${n} student${n === 1 ? '' : 's'}</span>
    </button>`;
  }).join('');
  grid.querySelectorAll('.teams-class-card').forEach((card) => {
    paintPool(card.querySelector('.teams-card-marbles'), getRoster(card.dataset.id));
  });
}

document.getElementById('class-grid').addEventListener('click', (e) => {
  const card = e.target.closest('.teams-class-card');
  if (card) openSetup(card.dataset.id);
});

/* ── Setup (math panel) ─────────────────────────────────────── */
function openSetup(classId) {
  destroyReveal();
  state.classId = classId;
  state.className = getClassName(classId) || '(unnamed)';
  state.names = getRoster(classId);
  if (state.names.length < 2) return;
  document.getElementById('setup-class-name').textContent = state.className;
  document.getElementById('setup-count-line').textContent =
    `${state.names.length} students to split.`;
  showView('setup-view');
  refreshPartitions();
  renderRevealStyles();
}

function refreshPartitions() {
  state.options = partitionOptions(state.names.length, state.mode, state.value);
  if (state.partitionIndex >= state.options.length) state.partitionIndex = 0;
  const host = document.getElementById('partition-options');
  if (state.options.length === 0) {
    host.innerHTML = '<p class="partition-note">That doesn\'t split — try another number.</p>';
    return;
  }
  host.innerHTML = state.options.map((sizes, i) => `
    <button type="button" class="partition-card${i === state.partitionIndex ? ' is-active' : ''}" data-i="${i}">
      <strong>${sizes.length} teams</strong>
      <span>${describePartition(sizes)}</span>
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
  const sizeBtn = document.getElementById('mode-size');
  const countBtn = document.getElementById('mode-count');
  sizeBtn.classList.toggle('is-active', mode === 'size');
  countBtn.classList.toggle('is-active', mode === 'count');
  sizeBtn.setAttribute('aria-pressed', String(mode === 'size'));
  countBtn.setAttribute('aria-pressed', String(mode === 'count'));
  state.partitionIndex = 0;
  refreshPartitions();
}
document.getElementById('mode-size').addEventListener('click', () => setMode('size'));
document.getElementById('mode-count').addEventListener('click', () => setMode('count'));
document.getElementById('split-value').addEventListener('input', () => {
  const v = Number(document.getElementById('split-value').value);
  if (Number.isFinite(v) && v >= 2) {
    state.value = Math.floor(v);
    state.partitionIndex = 0;
    refreshPartitions();
  }
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
  // Shuffle students, then hand out round-robin (draft order) so the
  // reveal alternates teams instead of filling one team at a time.
  const idx = state.names.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const remaining = sizes.slice();
  state.assignments = [];
  let bin = 0;
  for (const nameIdx of idx) {
    while (remaining[bin % sizes.length] === 0) bin++;
    const b = bin % sizes.length;
    remaining[b]--;
    bin++;
    state.assignments.push({
      name: state.names[nameIdx],
      initials: initialsOf(state.names[nameIdx]),
      color: marbleColor(nameIdx),
      binIndex: b,
    });
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
  state.revealRan = false;
}

function mountReveal() {
  destroyReveal();
  const stage = document.getElementById('reveal-stage');
  stage.innerHTML = '';
  renderColumns();
  const module = REVEALS.find((r) => r.id === state.revealId) || REVEALS[0];
  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  state.reveal = module.create(stage, {
    assignments: state.assignments,
    bins: state.bins,
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
  const use = document.getElementById('btn-fullscreen')?.querySelector('use');
  if (use) use.setAttribute('href', document.fullscreenElement ? '#icon-fullscreen-exit' : '#icon-fullscreen');
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
  }
});

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

showClassSelect();
