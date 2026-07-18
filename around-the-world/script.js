// =============================================================
// THE TEACHER'S DESK — Around the World (boxing broadcast)
//
// The classic head-to-head review game: the champion holds the seat,
// the challenger stands. A bell rings, a flashcard shows a 3-second
// mental-math question, first to answer takes the seat. The teacher
// is the judge — tap the card to flip it and check the answer, tap a
// fighter to declare the round.
//
// Questions come from the tool's own mental-math bank (sets/*.csv,
// bingo CSV format, parsed by shared/problem-sets.js). Teacher can
// select several categories; they're shuffled into one pool. Verbal
// mode runs the structure with a generic QUESTION card.
//
// Suite conventions: roster via the bridge, both fighters recorded
// through incrementCallCount each round, prefs + records via shared
// storage, visible mute toggle, Esc/Space/F/M grammar, borderless
// fullscreen standard.
// =============================================================

import { getRoster, getClassName, incrementCallCount } from '../shared/roster-bridge.js';
import {
  getPreference, setPreference, getToolState, setToolState,
} from '../shared/storage.js';
import { mountSettingsButton } from '../shared/settings.js';
import { mountClassCardGrid } from '../shared/components/class-card-grid.js';
import { loadProblemRows, fetchSetText, renderMathInto, warmMath } from '../shared/problem-sets.js';

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
  { id: 'verbal',            label: 'Verbal — I’ll ask my own',   verbal: true },
];
const setRowsCache = new Map(); // set id → rows [{problem, answer}]

const state = {
  classId: null,
  className: '',
  roster: [],
  selected: new Set(['multiplication']),
  verbal: false,
  championPick: '',      // '' = random
  // Game state
  pool: [],
  poolIdx: 0,
  order: [],             // shuffled roster circle
  nextIdx: 0,
  champion: null,
  challenger: null,
  streak: 0,
  best: null,            // { name, streak } best this game
  phase: 'idle',         // idle | question | revealed
  running: false,
};

const shuffled = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

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
    // MATERIAL(sound): boxing bell — two bright partials, hard attack,
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
  document.getElementById('setup-class-name').textContent = state.className;
  const sel = document.getElementById('champion-select');
  sel.innerHTML = '<option value="">Random</option>' +
    state.roster.map((n) => `<option value="${escHtml(n)}">${escHtml(n)}</option>`).join('');
  sel.value = state.championPick && state.roster.includes(state.championPick) ? state.championPick : '';
  showView('setup-view');
  renderSetCards();
  refreshPool();
}

function renderSetCards() {
  const host = document.getElementById('set-cards');
  host.innerHTML = SETS.map((s) => {
    const active = s.verbal ? state.verbal : (!state.verbal && state.selected.has(s.id));
    const disabled = !s.verbal && state.verbal;
    const rows = setRowsCache.get(s.id);
    const count = s.verbal ? 'the structure only' : (rows ? `${rows.length} questions` : '…');
    return `<button type="button" class="set-card${active ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}" data-id="${s.id}">
      <strong>${escHtml(s.label)}</strong><span>${count}</span>
    </button>`;
  }).join('');
}

async function ensureSetLoaded(id) {
  if (setRowsCache.has(id)) return;
  const set = SETS.find((s) => s.id === id);
  if (!set || set.verbal) return;
  try {
    const text = await fetchSetText(set.path);
    const { rows } = loadProblemRows(text, { required: ['problem', 'answer'] });
    setRowsCache.set(id, rows);
  } catch (e) {
    console.error(`Around the World: could not load ${set.path}`, e);
    setRowsCache.set(id, []);
  }
  renderSetCards();
  refreshPool();
}

function refreshPool() {
  const line = document.getElementById('pool-line');
  const enter = document.getElementById('btn-enter-ring');
  if (state.verbal) {
    line.textContent = 'Verbal mode — you ask the questions; the card just keeps the ceremony.';
    enter.disabled = false;
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
  enter.disabled = loaded.length < chosen.length || total === 0;
}

document.getElementById('set-cards').addEventListener('click', (e) => {
  const card = e.target.closest('.set-card');
  if (!card) return;
  const set = SETS.find((s) => s.id === card.dataset.id);
  if (!set) return;
  if (set.verbal) {
    state.verbal = !state.verbal;
  } else {
    if (state.verbal) return; // sets are parked while verbal is on
    if (state.selected.has(set.id)) state.selected.delete(set.id);
    else {
      state.selected.add(set.id);
      ensureSetLoaded(set.id);
    }
  }
  renderSetCards();
  refreshPool();
});

document.getElementById('champion-select').addEventListener('change', (e) => {
  state.championPick = e.target.value;
});

/* ── The game ───────────────────────────────────────────────── */
function enterRing() {
  // Build the pool.
  if (!state.verbal) {
    state.pool = shuffled([...state.selected].flatMap((id) => setRowsCache.get(id) ?? []));
    if (state.pool.length === 0) return;
    warmMath(state.pool.flatMap((r) => [r.problem, r.answer]));
  } else {
    state.pool = [];
  }
  state.poolIdx = 0;
  // The circle: shuffled once per game. Champion steps out of it.
  state.order = shuffled(state.roster);
  state.champion = state.championPick && state.roster.includes(state.championPick)
    ? state.championPick
    : state.order[0];
  state.nextIdx = 0;
  state.challenger = nextChallenger();
  state.streak = 0;
  state.best = null;
  state.phase = 'idle';
  state.running = true;
  document.getElementById('ring-class-name').textContent = state.className;
  document.getElementById('end-card').hidden = true;
  showView('ring-view');
  renderRing();
}

function nextChallenger() {
  for (let hop = 0; hop < state.order.length; hop++) {
    const name = state.order[state.nextIdx % state.order.length];
    state.nextIdx++;
    if (name !== state.champion) return name;
  }
  return null; // roster of 1 can't happen (guarded at setup)
}

function fitPlateName(el) {
  // Shrink to one line inside the plate.
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
  const card = document.getElementById('flash-card');
  card.hidden = !inRound;

  const hint = document.getElementById('ring-hint');
  if (!inRound) hint.textContent = 'Ring the bell to start the round';
  else if (state.phase === 'question') hint.textContent = state.verbal ? 'Ask away — tap the winner' : 'Tap the card to check the answer · tap the winner';
  else hint.textContent = 'Tap the winner';

  if (enteringChallenger) {
    const plate = document.getElementById('plate-chall');
    plate.classList.remove('is-in', 'is-out');
    void plate.getBoundingClientRect();
    plate.classList.add('is-in');
  }
}

function ringBell() {
  if (state.phase !== 'idle' || !state.running) return;
  state.phase = 'question';
  synth.bell();
  const card = document.getElementById('flash-card');
  card.classList.remove('is-flipped');
  const q = document.getElementById('flash-question');
  const a = document.getElementById('flash-answer');
  if (state.verbal) {
    q.textContent = 'QUESTION';
    a.textContent = 'YOUR CALL, REF';
  } else {
    if (state.poolIdx >= state.pool.length) {
      state.pool = shuffled(state.pool);
      state.poolIdx = 0;
    }
    const row = state.pool[state.poolIdx++];
    renderMathInto(q, row.problem);
    renderMathInto(a, row.answer);
  }
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
  const q = document.getElementById('flash-question');
  const a = document.getElementById('flash-answer');
  if (state.poolIdx >= state.pool.length) {
    state.pool = shuffled(state.pool);
    state.poolIdx = 0;
  }
  const row = state.pool[state.poolIdx++];
  renderMathInto(q, row.problem);
  renderMathInto(a, row.answer);
  renderRing();
}

function declareWinner(side) {
  if (state.phase === 'idle' || !state.running) return;
  const winner = side === 'champ' ? state.champion : state.challenger;
  const loser  = side === 'champ' ? state.challenger : state.champion;
  // Suite convention: both fighters participated in the round.
  incrementCallCount(state.classId, state.champion);
  incrementCallCount(state.classId, state.challenger);
  synth.sting();

  if (side === 'champ') {
    state.streak++;
  } else {
    state.champion = state.challenger;
    state.streak = 1;
  }
  if (!state.best || state.streak > state.best.streak) {
    state.best = { name: state.champion, streak: state.streak };
  }
  void winner; void loser;

  state.challenger = nextChallenger();
  state.phase = 'idle';
  document.getElementById('flash-card').classList.remove('is-flipped');
  renderRing({ enteringChallenger: true });
}

/* ── End game + records ─────────────────────────────────────── */
function loadRecords() {
  return getToolState('around-the-world')?.records ?? {};
}

function saveRecord(classId, entry) {
  const tool = getToolState('around-the-world') ?? {};
  const records = { ...(tool.records ?? {}) };
  records[classId] = entry;
  setToolState('around-the-world', { ...tool, records });
}

function endGame() {
  if (!state.running) return;
  const champ = state.best ?? (state.streak > 0
    ? { name: state.champion, streak: state.streak }
    : { name: state.champion, streak: 0 });
  document.getElementById('end-name').textContent = champ.name ?? '—';
  document.getElementById('end-streak').textContent =
    `${champ.streak} SEAT${champ.streak === 1 ? '' : 'S'}`;

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
  document.getElementById('end-card').hidden = false;
}

/* ── Wiring ─────────────────────────────────────────────────── */
document.getElementById('btn-enter-ring').addEventListener('click', enterRing);
document.getElementById('btn-bell').addEventListener('click', ringBell);
document.getElementById('flash-card').addEventListener('click', flipCard);
document.getElementById('btn-skip').addEventListener('click', skipQuestion);
document.getElementById('plate-champ').addEventListener('click', () => declareWinner('champ'));
document.getElementById('plate-chall').addEventListener('click', () => declareWinner('chall'));
document.getElementById('btn-end-game').addEventListener('click', endGame);
document.getElementById('btn-rematch').addEventListener('click', () => {
  document.getElementById('end-card').hidden = true;
  enterRing();
});
document.getElementById('btn-change-setup').addEventListener('click', () => {
  document.getElementById('end-card').hidden = true;
  showView('setup-view');
  renderSetCards();
  refreshPool();
});
document.getElementById('crumb-tool').addEventListener('click', (e) => {
  e.preventDefault();
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
  const inRing = !document.getElementById('ring-view').hidden;
  const inSetup = !document.getElementById('setup-view').hidden;
  const endOpen = !document.getElementById('end-card').hidden;

  if (e.key === ' ' && inRing && !endOpen) {
    // Space is the contextual primary: bell, then flip.
    e.preventDefault();
    if (state.phase === 'idle') ringBell();
    else flipCard();
  } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && inRing && !endOpen) {
    if (state.phase !== 'idle') {
      e.preventDefault();
      declareWinner(e.key === 'ArrowLeft' ? 'champ' : 'chall');
    }
  } else if (e.key === 'Escape') {
    if (document.fullscreenElement) return; // native exit first
    if (endOpen) {
      document.getElementById('end-card').hidden = true;
      showView('setup-view'); renderSetCards(); refreshPool();
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

// Preload the default set so the pool line fills in quickly.
ensureSetLoaded('multiplication');
showClassSelect();
