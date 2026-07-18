// =============================================================
// THE TEACHER'S DESK — Around the World (boxing broadcast)
//
// The classic head-to-head review game: the champion holds the seat,
// the challenger stands. A bell rings, a flashcard shows a 3-second
// mental-math question, first to answer takes the seat. The teacher
// is the judge — tap the card to flip it and check, tap a fighter to
// declare the round.
//
// Setup is the corner office: multi-select question sets (built-in
// bank + uploaded/authored custom sets, all bingo CSV format via
// shared/problem-sets.js), verbal mode, a DRAGGABLE fight order that
// mirrors the literal walk around the room (persisted per class,
// tap a student to sit them out today), first champion, and a ring
// backdrop. Matches autosave per class — reopening the class offers
// to pick up where you left off. A champion who beats every other
// fighter in one reign sweeps the room and ends the match.
//
// Suite conventions: roster via the bridge, both fighters recorded
// through incrementCallCount each round, prefs + records + saves in
// tools.around-the-world, visible mute toggle, Esc/Space/F/M
// grammar, borderless fullscreen standard.
// =============================================================

import { getRoster, getClassName, incrementCallCount } from '../shared/roster-bridge.js';
import {
  getPreference, setPreference, getToolState, setToolState,
} from '../shared/storage.js';
import { mountSettingsButton } from '../shared/settings.js';
import { mountClassCardGrid } from '../shared/components/class-card-grid.js';
import { loadProblemRows, fetchSetText, parseCSVText, renderMathInto, warmMath } from '../shared/problem-sets.js';

mountSettingsButton();

/* ── Question bank ──────────────────────────────────────────── */
const SETS = [
  { id: 'multiplication',    label: 'Multiplication 1–12',        path: 'sets/multiplication.csv' },
  { id: 'doubles',           label: 'Doubles',                    path: 'sets/doubles.csv' },
  { id: 'halves',            label: 'Halves',                     path: 'sets/halves.csv' },
  { id: 'add-sub-20',        label: 'Add & subtract to 20',       path: 'sets/add-sub-20.csv' },
  { id: 'powers-of-2',       label: 'Powers of 2',                path: 'sets/powers-of-2.csv' },
  { id: 'fraction-compare',  label: 'Which fraction is greater?', path: 'sets/fraction-compare.csv' },
  { id: 'fraction-simplify', label: 'Simplify the fraction',      path: 'sets/fraction-simplify.csv' },
  { id: 'percents',          label: 'Percents',                   path: 'sets/percents.csv' },
];
const BACKDROPS = [
  { id: 'classic', label: 'Classic' },
  { id: 'crimson', label: 'Crimson' },
  { id: 'navy',    label: 'Navy' },
  { id: 'slate',   label: 'Slate' },
  { id: 'forest',  label: 'Forest' },
];
const setRowsCache = new Map(); // built-in id / 'custom:<id>' → rows

const state = {
  classId: null,
  className: '',
  roster: [],
  selected: new Set(['multiplication']),
  verbal: false,
  championPick: '',      // '' = random
  orderNames: [],        // full roster in fight order (persisted per class)
  out: new Set(),        // sitting out today (session + saved with a match)
  // Game state
  pool: [],
  poolIdx: 0,
  order: [],             // present fighters, in fight order
  nextIdx: 0,
  champion: null,
  challenger: null,
  streak: 0,
  beaten: new Set(),     // distinct opponents beaten in the current reign
  best: null,            // { name, streak } best this game
  phase: 'idle',         // idle | question | revealed
  running: false,
};
let hintsRetired = false; // "tap to…" copy leaves after the first flip

const shuffled = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ── Tool storage (orders / custom sets / saves / records) ──── */
function toolBlob() { return getToolState('around-the-world') ?? {}; }
function patchTool(patch) { setToolState('around-the-world', { ...toolBlob(), ...patch }); }

function savedOrderFor(classId) { return toolBlob().orders?.[classId] ?? null; }
function persistOrder() {
  const orders = { ...(toolBlob().orders ?? {}) };
  orders[state.classId] = state.orderNames.slice();
  patchTool({ orders });
}

function customSets() { return toolBlob().customSets ?? []; }
function upsertCustomSet(entry) {
  const sets = customSets().slice();
  const i = sets.findIndex((s) => s.id === entry.id);
  if (i >= 0) sets[i] = entry; else sets.push(entry);
  patchTool({ customSets: sets });
}
function deleteCustomSet(id) {
  patchTool({ customSets: customSets().filter((s) => s.id !== id) });
  state.selected.delete('custom:' + id);
  setRowsCache.delete('custom:' + id);
}

function savedMatchFor(classId) { return toolBlob().saves?.[classId] ?? null; }
function persistMatch() {
  if (!state.running) return;
  const saves = { ...(toolBlob().saves ?? {}) };
  saves[state.classId] = {
    at: new Date().toISOString(),
    selected: [...state.selected],
    verbal: state.verbal,
    orderNames: state.orderNames.slice(),
    out: [...state.out],
    champion: state.champion,
    challenger: state.challenger,
    nextIdx: state.nextIdx,
    streak: state.streak,
    beaten: [...state.beaten],
    best: state.best,
  };
  patchTool({ saves });
}
function clearMatchSave() {
  const saves = { ...(toolBlob().saves ?? {}) };
  if (saves[state.classId]) {
    delete saves[state.classId];
    patchTool({ saves });
  }
}

/* ── Synth — bell + winner sting (WebAudio, no assets; the real
   samples arrive with the asset pass). Honors suite soundMuted. ── */
const synth = (() => {
  let ac = null;
  const muted = () => !!getPreference('soundMuted', false);
  const vol = () => 0.6 * Number(getPreference('soundVolume', 0.6));
  function ensure() {
    if (muted()) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ac) ac = new AC();
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function strike(c, t0, v) {
    // MATERIAL(sound): boxing bell — bright partials, hard attack,
    // long ring-out.
    for (const [f, g] of [[1046, 1], [1568, 0.6], [2093, 0.25]]) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, v * g), t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + 1.4);
    }
  }
  // Audio must never break a round — every entry point swallows its
  // own failures (blocked autoplay, missing WebAudio, whatever).
  return {
    bell() {
      try {
        const c = ensure();
        if (!c) return;
        const v = vol() * 0.35;
        strike(c, c.currentTime, v);
        strike(c, c.currentTime + 0.32, v * 0.85);
      } catch (e) { void e; }
    },
    sting() {
      try {
        const c = ensure();
        if (!c) return;
        const v = vol() * 0.3;
        [523, 659, 784, 1046].forEach((f, i) => {
          const t0 = c.currentTime + i * 0.09;
          const osc = c.createOscillator();
          const g = c.createGain();
          osc.type = 'triangle';
          osc.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(Math.max(0.001, v), t0 + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
          osc.connect(g).connect(c.destination);
          osc.start(t0);
          osc.stop(t0 + 0.32);
        });
      } catch (e) { void e; }
    },
  };
})();

/* ── Views ──────────────────────────────────────────────────── */
const VIEWS = ['class-select-view', 'setup-view', 'ring-view'];
function showView(id) {
  for (const v of VIEWS) document.getElementById(v).hidden = v !== id;
  document.body.classList.toggle('app-view', id !== 'class-select-view');
  document.body.classList.toggle('is-ring', id === 'ring-view');
  document.getElementById('crumb-tool').hidden = id === 'class-select-view';
  const crumbCtx = document.getElementById('crumb-context');
  crumbCtx.hidden = id === 'class-select-view';
  crumbCtx.textContent = state.className;
}

/* ── Class select ───────────────────────────────────────────── */
let classGridCtl = null;
function showClassSelect() {
  state.running = false;
  showView('class-select-view');
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

/* ── Setup ──────────────────────────────────────────────────── */
function openSetup(classId) {
  state.classId = classId;
  state.className = getClassName(classId) || '(unnamed)';
  state.roster = getRoster(classId);
  if (state.roster.length < 2) return;

  // Fight order: saved order, pruned to the live roster, new students
  // appended at the end.
  const saved = savedOrderFor(classId) ?? [];
  const inRoster = new Set(state.roster);
  state.orderNames = [
    ...saved.filter((n) => inRoster.has(n)),
    ...state.roster.filter((n) => !saved.includes(n)),
  ];
  state.out = new Set();

  document.getElementById('setup-class-name').textContent = state.className;
  showView('setup-view');
  renderResumeBanner();
  renderSetCards();
  renderOrderCards();
  renderChampionSelect();
  renderBackdropCards();
  refreshPool();
  // Eager-load every set so the counts are real, not "…".
  for (const s of SETS) ensureSetLoaded(s.id);
  for (const c of customSets()) ensureSetLoaded('custom:' + c.id);
}

function renderResumeBanner() {
  const banner = document.getElementById('resume-banner');
  const save = savedMatchFor(state.classId);
  banner.hidden = !save;
  if (save) {
    const when = new Date(save.at);
    const nice = when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    document.getElementById('resume-text').textContent =
      `${save.champion} was defending the seat (${save.streak} in a row) — saved ${nice}.`;
  }
}

/* Set cards: built-ins + custom sets. */
function allSetDefs() {
  return [
    ...SETS,
    ...customSets().map((c) => ({
      id: 'custom:' + c.id,
      label: c.name,
      custom: c,
    })),
  ];
}

function renderSetCards() {
  const host = document.getElementById('set-cards');
  host.innerHTML = allSetDefs().map((s) => {
    const active = !state.verbal && state.selected.has(s.id);
    const disabled = state.verbal;
    const rows = setRowsCache.get(s.id);
    const count = rows ? `${rows.length} questions` : '…';
    const actions = s.custom
      ? `<span class="set-card-actions">
           <button type="button" data-edit="${s.custom.id}" aria-label="Edit ${escHtml(s.label)}">Edit</button>
           <button type="button" data-del="${s.custom.id}" aria-label="Delete ${escHtml(s.label)}">&times;</button>
         </span>`
      : '';
    return `<button type="button" class="set-card${active ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}" data-id="${s.id}">
      <strong>${escHtml(s.label)}</strong><span>${count}</span>${actions}
    </button>`;
  }).join('');
  document.getElementById('verbal-check').checked = state.verbal;
}

async function ensureSetLoaded(id) {
  if (setRowsCache.has(id)) { renderSetCards(); refreshPool(); return; }
  try {
    let text;
    if (id.startsWith('custom:')) {
      const c = customSets().find((s) => 'custom:' + s.id === id);
      if (!c) return;
      text = c.csv;
    } else {
      const set = SETS.find((s) => s.id === id);
      if (!set) return;
      text = await fetchSetText(set.path);
    }
    const { rows } = loadProblemRows(text, { required: ['problem', 'answer'] });
    setRowsCache.set(id, rows);
  } catch (e) {
    console.error(`Around the World: could not load set ${id}`, e);
    setRowsCache.set(id, []);
  }
  renderSetCards();
  refreshPool();
}

function refreshPool() {
  const line = document.getElementById('pool-line');
  const enter = document.getElementById('btn-enter-ring');
  const present = state.orderNames.filter((n) => !state.out.has(n));
  const enoughFighters = present.length >= 2;
  document.getElementById('order-line').textContent =
    `${present.length} fighting${state.out.size ? ` · ${state.out.size} sitting out` : ''}`;

  if (state.verbal) {
    line.textContent = 'Verbal mode — you ask the questions; the card just keeps the ceremony.';
    enter.disabled = !enoughFighters;
    return;
  }
  const chosen = [...state.selected];
  if (chosen.length === 0) {
    line.textContent = 'Pick at least one set (or go verbal).';
    enter.disabled = true;
    return;
  }
  const loaded = chosen.filter((id) => setRowsCache.has(id));
  const total = loaded.reduce((n, id) => n + setRowsCache.get(id).length, 0);
  line.textContent = loaded.length < chosen.length
    ? 'Loading questions…'
    : `${total} questions in the pool, shuffled together.`;
  enter.disabled = loaded.length < chosen.length || total === 0 || !enoughFighters;
}

document.getElementById('set-cards').addEventListener('click', (e) => {
  const edit = e.target.closest('button[data-edit]');
  if (edit) { e.stopPropagation(); openSetEditor(edit.dataset.edit); return; }
  const del = e.target.closest('button[data-del]');
  if (del) {
    e.stopPropagation();
    const c = customSets().find((s) => s.id === del.dataset.del);
    if (c && confirm(`Delete "${c.name}"?`)) {
      deleteCustomSet(del.dataset.del);
      renderSetCards();
      refreshPool();
    }
    return;
  }
  const card = e.target.closest('.set-card');
  if (!card || state.verbal) return;
  const id = card.dataset.id;
  if (state.selected.has(id)) state.selected.delete(id);
  else {
    state.selected.add(id);
    ensureSetLoaded(id);
  }
  renderSetCards();
  refreshPool();
});

document.getElementById('verbal-check').addEventListener('change', (e) => {
  state.verbal = e.target.checked;
  renderSetCards();
  refreshPool();
});

/* ── Custom sets: upload + editor ───────────────────────────── */
function showSetError(msg) {
  const el = document.getElementById('set-error');
  el.textContent = msg ?? '';
  el.hidden = !msg;
}

document.getElementById('btn-upload-set').addEventListener('click', () => {
  document.getElementById('set-file-input').click();
});
document.getElementById('set-file-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  showSetError(null);
  const text = await file.text();
  const { rows, errors } = loadProblemRows(text, { required: ['problem', 'answer'] });
  if (rows.length === 0) {
    showSetError(`Couldn't use "${file.name}": ${errors[0] ?? 'no usable rows'}`);
    return;
  }
  const id = 'up-' + Date.now().toString(36);
  const name = file.name.replace(/\.csv$/i, '');
  upsertCustomSet({ id, name, csv: text, savedAt: new Date().toISOString() });
  setRowsCache.set('custom:' + id, rows);
  state.selected.add('custom:' + id);
  renderSetCards();
  refreshPool();
});

/** Lean set editor — name + problem/answer rows, saved to the tool's
 *  custom sets in the same CSV format uploads use (LaTeX welcome). */
function openSetEditor(editId = null) {
  const existing = editId ? customSets().find((s) => s.id === editId) : null;
  const startRows = existing
    ? loadProblemRows(existing.csv, { required: ['problem', 'answer'] }).rows
    : [{ problem: '', answer: '' }, { problem: '', answer: '' }, { problem: '', answer: '' }];

  const overlay = document.createElement('div');
  overlay.className = 'suite-overlay';
  overlay.innerHTML = `
    <div class="suite-panel atw-editor" role="dialog" aria-modal="true" aria-label="Design a question set">
      <div class="suite-panel-header"><h2>${existing ? 'Edit set' : 'Design a set'}</h2>
      <button type="button" class="suite-panel-close" aria-label="Close">&times;</button></div>
      <div class="suite-panel-body">
        <label style="display:block;margin-bottom:var(--space-3)">
          <span style="display:block;font-size:var(--type-11);font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">Set name</span>
          <input type="text" id="ed-name" class="modal-input" style="width:100%" placeholder="e.g. Squares to 15" value="${existing ? escHtml(existing.name) : ''}">
        </label>
        <div id="ed-rows"></div>
        <button type="button" class="set-tool-btn" id="ed-add">+ Add a question</button>
        <p class="block-hint" style="margin-top:var(--space-2)">LaTeX works in both fields — e.g. \\frac{3}{4}.</p>
        <p class="pool-line is-error" id="ed-error" hidden></p>
        <div style="display:flex;gap:var(--space-2);justify-content:flex-end;margin-top:var(--space-3)">
          <button type="button" class="desk-button is-ghost" data-act="cancel">Cancel</button>
          <button type="button" class="desk-button" data-act="save">Save set</button>
        </div>
      </div>
    </div>`;
  const rowsHost = overlay.querySelector('#ed-rows');
  const addRow = (p = '', a = '') => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-bottom:6px;align-items:center';
    row.innerHTML = `
      <input type="text" class="modal-input ed-q" placeholder="Problem" style="flex:1.4" value="${escHtml(p)}">
      <input type="text" class="modal-input ed-a" placeholder="Answer" style="flex:1" value="${escHtml(a)}">
      <button type="button" class="set-tool-btn ed-del" aria-label="Remove row">&times;</button>`;
    row.querySelector('.ed-del').addEventListener('click', () => row.remove());
    rowsHost.appendChild(row);
  };
  startRows.forEach((r) => addRow(r.problem, r.answer));
  overlay.querySelector('#ed-add').addEventListener('click', () => addRow());

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) return close();
    const btn = e.target.closest('.suite-panel-close, [data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'save') {
      const name = overlay.querySelector('#ed-name').value.trim() || 'My set';
      const rows = [...rowsHost.children].map((row) => ({
        problem: row.querySelector('.ed-q').value.trim(),
        answer: row.querySelector('.ed-a').value.trim(),
      })).filter((r) => r.problem && r.answer);
      if (rows.length === 0) {
        const err = overlay.querySelector('#ed-error');
        err.textContent = 'Add at least one complete question.';
        err.hidden = false;
        return;
      }
      const cols = ['B', 'I', 'N', 'G', 'O'];
      const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
      const csv = 'column,problem,answer\n' +
        rows.map((r, i) => `${cols[i % 5]},${q(r.problem)},${q(r.answer)}`).join('\n') + '\n';
      const id = existing?.id ?? ('ed-' + Date.now().toString(36));
      upsertCustomSet({ id, name, csv, savedAt: new Date().toISOString() });
      setRowsCache.set('custom:' + id, rows);
      state.selected.add('custom:' + id);
      renderSetCards();
      refreshPool();
      close();
    } else {
      close();
    }
  });
  document.body.appendChild(overlay);
  setTimeout(() => overlay.querySelector('#ed-name').focus(), 0);
}
document.getElementById('btn-new-set').addEventListener('click', () => openSetEditor());

/* ── Fight order: drag to reorder, tap to sit out ───────────── */
let dragName = null;

function renderOrderCards() {
  const host = document.getElementById('order-cards');
  let n = 0;
  host.innerHTML = state.orderNames.map((name) => {
    const out = state.out.has(name);
    if (!out) n++;
    return `<span class="order-card${out ? ' is-out' : ''}" draggable="true" data-name="${escHtml(name)}" role="button" tabindex="0"
      aria-label="${escHtml(name)}${out ? ' (sitting out)' : `, position ${n}`}">
      <span class="order-num">${out ? '' : n}</span>${escHtml(name)}
    </span>`;
  }).join('');
}

{
  const host = document.getElementById('order-cards');
  host.addEventListener('click', (e) => {
    const card = e.target.closest('.order-card');
    if (!card || dragName) return;
    const name = card.dataset.name;
    if (state.out.has(name)) state.out.delete(name);
    else state.out.add(name);
    renderOrderCards();
    renderChampionSelect();
    refreshPool();
  });
  host.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.order-card');
    if (!card) return;
    dragName = card.dataset.name;
    card.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragName); } catch (err) { void err; }
  });
  host.addEventListener('dragover', (e) => {
    if (!dragName) return;
    e.preventDefault();
    const card = e.target.closest('.order-card');
    host.querySelectorAll('.is-drop-target').forEach((c) => c.classList.remove('is-drop-target'));
    if (card && card.dataset.name !== dragName) card.classList.add('is-drop-target');
  });
  host.addEventListener('drop', (e) => {
    e.preventDefault();
    const card = e.target.closest('.order-card');
    if (dragName && card && card.dataset.name !== dragName) {
      const from = state.orderNames.indexOf(dragName);
      let to = state.orderNames.indexOf(card.dataset.name);
      state.orderNames.splice(from, 1);
      if (from < to) to--;
      // Drop BEFORE the target when coming from the right, AFTER when
      // coming from the left — reads as "insert where I pointed".
      state.orderNames.splice(from < to + 1 ? to + 1 : to, 0, dragName);
      persistOrder();
    }
    endDrag();
  });
  host.addEventListener('dragend', endDrag);
  function endDrag() {
    dragName = null;
    document.querySelectorAll('.order-card.is-dragging, .order-card.is-drop-target')
      .forEach((c) => c.classList.remove('is-dragging', 'is-drop-target'));
    renderOrderCards();
    renderChampionSelect();
    refreshPool();
  }
}

function renderChampionSelect() {
  const sel = document.getElementById('champion-select');
  const present = state.orderNames.filter((n) => !state.out.has(n));
  sel.innerHTML = '<option value="">Random</option>' +
    present.map((n) => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  sel.value = state.championPick && present.includes(state.championPick) ? state.championPick : '';
}
document.getElementById('champion-select').addEventListener('change', (e) => {
  state.championPick = e.target.value;
});

/* ── Ring backdrop ──────────────────────────────────────────── */
function renderBackdropCards() {
  const current = getPreference('atw.backdrop', 'classic');
  document.getElementById('backdrop-cards').innerHTML = BACKDROPS.map((b) => `
    <button type="button" class="backdrop-card${b.id === current ? ' is-active' : ''}"
      data-id="${b.id}" data-label="${b.label}" aria-label="${b.label} backdrop"></button>`).join('');
  document.body.setAttribute('data-ring-backdrop', current);
}
document.getElementById('backdrop-cards').addEventListener('click', (e) => {
  const card = e.target.closest('.backdrop-card');
  if (!card) return;
  setPreference('atw.backdrop', card.dataset.id);
  renderBackdropCards();
});

/* ── The game ───────────────────────────────────────────────── */
function buildPool() {
  if (state.verbal) { state.pool = []; state.poolIdx = 0; return; }
  state.pool = shuffled([...state.selected].flatMap((id) => setRowsCache.get(id) ?? []));
  state.poolIdx = 0;
  warmMath(state.pool.flatMap((r) => [r.problem, r.answer]));
}

function enterRing() {
  const present = state.orderNames.filter((n) => !state.out.has(n));
  if (present.length < 2) return;
  buildPool();
  if (!state.verbal && state.pool.length === 0) return;
  state.order = present;
  state.champion = state.championPick && present.includes(state.championPick)
    ? state.championPick
    : present[(Math.random() * present.length) | 0];
  state.nextIdx = 0;
  state.challenger = nextChallenger();
  state.streak = 0;
  state.beaten = new Set();
  state.best = null;
  state.phase = 'idle';
  state.running = true;
  document.getElementById('ring-class-name').textContent = state.className;
  document.getElementById('end-card').hidden = true;
  showView('ring-view');
  renderRing();
  persistMatch();
}

function resumeMatch() {
  const save = savedMatchFor(state.classId);
  if (!save) return;
  const inRoster = new Set(state.roster);
  state.selected = new Set(save.selected.filter((id) =>
    id.startsWith('custom:') ? customSets().some((c) => 'custom:' + c.id === id)
      : SETS.some((s) => s.id === id)));
  state.verbal = save.verbal;
  state.orderNames = [
    ...save.orderNames.filter((n) => inRoster.has(n)),
    ...state.roster.filter((n) => !save.orderNames.includes(n)),
  ];
  state.out = new Set(save.out.filter((n) => inRoster.has(n)));
  const present = state.orderNames.filter((n) => !state.out.has(n));
  if (present.length < 2 || !present.includes(save.champion)) {
    // The room changed too much — a stale save can't drive a match.
    clearMatchSave();
    renderResumeBanner();
    return;
  }
  const finish = () => {
    buildPool();
    state.order = present;
    state.champion = save.champion;
    state.nextIdx = save.nextIdx;
    state.streak = save.streak;
    state.beaten = new Set(save.beaten.filter((n) => present.includes(n)));
    state.best = save.best;
    // The saved challenger was already drawn — restore, don't redraw
    // (redrawing would skip them). Redraw only if they're now absent.
    state.challenger = save.challenger && present.includes(save.challenger)
      ? save.challenger
      : nextChallenger();
    state.phase = 'idle';
    state.running = true;
    document.getElementById('ring-class-name').textContent = state.className;
    document.getElementById('end-card').hidden = true;
    showView('ring-view');
    renderRing();
  };
  if (state.verbal) { finish(); return; }
  // Make sure every selected set is loaded before the pool builds.
  Promise.all([...state.selected].map((id) => ensureSetLoaded(id))).then(finish);
}

function nextChallenger() {
  for (let hop = 0; hop < state.order.length; hop++) {
    const name = state.order[state.nextIdx % state.order.length];
    state.nextIdx++;
    if (name !== state.champion) return name;
  }
  return null;
}

function fitPlateName(el) {
  el.style.fontSize = '';
  const max = el.parentElement.clientWidth - 24;
  let px = parseFloat(getComputedStyle(el).fontSize);
  while (el.scrollWidth > max && px > 15) {
    px -= 2;
    el.style.fontSize = px + 'px';
  }
}

function renderRing({ enteringChallenger = false } = {}) {
  const champName = document.getElementById('champ-name');
  const challName = document.getElementById('chall-name');
  champName.textContent = state.champion ?? '';
  challName.textContent = state.challenger ?? '';
  fitPlateName(champName);
  fitPlateName(challName);
  document.getElementById('champ-streak-text').textContent =
    state.streak === 0 ? 'NEW CHAMPION' : `${state.streak} SEAT${state.streak === 1 ? '' : 'S'} DEFENDED`;

  const inRound = state.phase !== 'idle';
  document.getElementById('plate-champ').disabled = !inRound;
  document.getElementById('plate-chall').disabled = !inRound;
  document.getElementById('btn-bell').hidden = inRound;
  document.getElementById('btn-skip').hidden = !inRound || state.verbal;
  document.getElementById('flash-card').hidden = !inRound;

  // The coaching copy retires once the teacher has flipped a card.
  const hint = document.getElementById('ring-hint');
  if (hintsRetired) hint.textContent = '';
  else if (!inRound) hint.textContent = 'Ring the bell to start the round';
  else if (state.phase === 'question') hint.textContent = state.verbal ? 'Ask away — tap the winner' : 'Tap the card to check the answer · tap the winner';
  else hint.textContent = 'Tap the winner';
  document.querySelector('.flash-flip-hint').hidden = hintsRetired;

  if (enteringChallenger) {
    const plate = document.getElementById('plate-chall');
    plate.classList.remove('is-in', 'is-out');
    void plate.getBoundingClientRect();
    plate.classList.add('is-in');
  }
}

function dealQuestion() {
  const q = document.getElementById('flash-question');
  const a = document.getElementById('flash-answer');
  if (state.verbal) {
    q.textContent = 'QUESTION';
    a.textContent = 'YOUR CALL, REF';
    return;
  }
  if (state.poolIdx >= state.pool.length) {
    state.pool = shuffled(state.pool);
    state.poolIdx = 0;
  }
  const row = state.pool[state.poolIdx++];
  renderMathInto(q, row.problem);
  renderMathInto(a, row.answer);
}

function ringBell() {
  if (state.phase !== 'idle' || !state.running) return;
  state.phase = 'question';
  synth.bell();
  const card = document.getElementById('flash-card');
  card.classList.remove('is-flipped');
  dealQuestion();
  card.hidden = false;
  card.classList.remove('is-dealt');
  void card.getBoundingClientRect();
  card.classList.add('is-dealt');
  renderRing();
}

function flipCard() {
  if (state.phase === 'question') {
    state.phase = 'revealed';
    document.getElementById('flash-card').classList.add('is-flipped');
    hintsRetired = true; // they know the move now
    renderRing();
  } else if (state.phase === 'revealed') {
    state.phase = 'question';
    document.getElementById('flash-card').classList.remove('is-flipped');
    renderRing();
  }
}

function skipQuestion() {
  if (state.phase === 'idle' || state.verbal) return;
  state.phase = 'question';
  document.getElementById('flash-card').classList.remove('is-flipped');
  dealQuestion();
  renderRing();
}

function declareWinner(side) {
  if (state.phase === 'idle' || !state.running) return;
  // Suite convention: both fighters participated in the round.
  incrementCallCount(state.classId, state.champion);
  incrementCallCount(state.classId, state.challenger);
  synth.sting();

  if (side === 'champ') {
    state.streak++;
    state.beaten.add(state.challenger);
  } else {
    // New reign: the dethroned champion is the first name on the list.
    const dethroned = state.champion;
    state.champion = state.challenger;
    state.streak = 1;
    state.beaten = new Set([dethroned]);
  }

  if (!state.best || state.streak > state.best.streak) {
    state.best = { name: state.champion, streak: state.streak };
  }

  // Swept the room: beaten every other present fighter in one reign.
  if (state.beaten.size >= state.order.length - 1) {
    persistMatch();
    endGame({ sweep: true });
    return;
  }

  state.challenger = nextChallenger();
  state.phase = 'idle';
  document.getElementById('flash-card').classList.remove('is-flipped');
  renderRing({ enteringChallenger: true });
  persistMatch();
}

/* ── End game + records ─────────────────────────────────────── */
function loadRecords() {
  return toolBlob().records ?? {};
}
function saveRecord(classId, entry) {
  patchTool({ records: { ...(toolBlob().records ?? {}), [classId]: entry } });
}

function endGame({ sweep = false } = {}) {
  if (!state.running) return;
  const champ = state.best ?? { name: state.champion, streak: state.streak };
  document.getElementById('end-name').textContent = champ.name ?? '—';
  document.getElementById('end-streak').textContent = sweep
    ? `BEAT THE WHOLE ROOM — ${champ.streak} SEAT${champ.streak === 1 ? '' : 'S'}`
    : `${champ.streak} SEAT${champ.streak === 1 ? '' : 'S'}`;

  const recordEl = document.getElementById('end-record');
  const prev = loadRecords()[state.classId];
  if (champ.streak > 0 && (!prev || champ.streak > prev.streak)) {
    saveRecord(state.classId, { name: champ.name, streak: champ.streak, at: new Date().toISOString() });
    recordEl.textContent = prev
      ? `NEW CLASS RECORD — previous: ${prev.name}, ${prev.streak}`
      : 'NEW CLASS RECORD';
  } else if (prev) {
    recordEl.textContent = `Class record: ${prev.name}, ${prev.streak} seats`;
  } else {
    recordEl.textContent = '';
  }
  state.running = false;
  clearMatchSave();
  document.getElementById('end-card').hidden = false;
}

/* ── Wiring ─────────────────────────────────────────────────── */
document.getElementById('btn-enter-ring').addEventListener('click', () => {
  clearMatchSave(); // an explicit fresh start replaces any waiting match
  enterRing();
});
document.getElementById('btn-resume').addEventListener('click', resumeMatch);
document.getElementById('btn-fresh').addEventListener('click', () => {
  clearMatchSave();
  renderResumeBanner();
});
document.getElementById('btn-bell').addEventListener('click', ringBell);
document.getElementById('flash-card').addEventListener('click', flipCard);
document.getElementById('btn-skip').addEventListener('click', skipQuestion);
document.getElementById('plate-champ').addEventListener('click', () => declareWinner('champ'));
document.getElementById('plate-chall').addEventListener('click', () => declareWinner('chall'));
document.getElementById('btn-end-game').addEventListener('click', () => endGame());
document.getElementById('btn-rematch').addEventListener('click', () => {
  document.getElementById('end-card').hidden = true;
  enterRing();
});
document.getElementById('btn-change-setup').addEventListener('click', () => {
  document.getElementById('end-card').hidden = true;
  state.running = false;
  showView('setup-view');
  renderResumeBanner();
  renderSetCards();
  renderOrderCards();
  renderChampionSelect();
  refreshPool();
});
document.getElementById('crumb-tool').addEventListener('click', (e) => {
  e.preventDefault();
  persistMatch(); // leaving mid-match keeps it waiting
  showClassSelect();
});

/* ── Audio toggle (suite convention) ────────────────────────── */
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

/* ── Fullscreen (suite standard) ────────────────────────────── */
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

/* ── Keyboard (suite grammar) ───────────────────────────────── */
document.addEventListener('keydown', (e) => {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('.suite-overlay')) return; // editor open
  const inRing = !document.getElementById('ring-view').hidden;
  const inSetup = !document.getElementById('setup-view').hidden;
  const endOpen = !document.getElementById('end-card').hidden;

  if (e.key === ' ' && inRing && !endOpen) {
    e.preventDefault();
    if (state.phase === 'idle') ringBell();
    else flipCard();
  } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && inRing && !endOpen) {
    if (state.phase !== 'idle') {
      e.preventDefault();
      declareWinner(e.key === 'ArrowLeft' ? 'champ' : 'chall');
    }
  } else if (e.key === 'Escape') {
    if (document.fullscreenElement) return;
    if (endOpen) {
      document.getElementById('end-card').hidden = true;
      showView('setup-view');
      renderResumeBanner(); renderSetCards(); renderOrderCards(); renderChampionSelect(); refreshPool();
    } else if (inRing) {
      endGame();
    } else if (inSetup) {
      showClassSelect();
    }
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
void parseCSVText; // (kept for future import tooling)

showClassSelect();
