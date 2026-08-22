// =============================================================
// THE TEACHER'S DESK — Contact Log (a "While You Were Out" pad)
//
// A record of every parent/guardian contact, one message slip per
// interaction. The class screen is a card file sorted coldest-first,
// so the students you haven't reached are the ones you see. Each slip
// carries how you made contact, whether you actually reached anyone,
// the blurb, and whether you still owe them a follow-up.
//
// WHY THIS TOOL OWNS ITS OWN RECORDS
// The suite has a per-student metadata API (setToolMeta →
// tools.<tool>.students[classId][name]) that is shaped exactly for
// this. We deliberately do NOT use it: the roster editor writes on
// every keystroke, and setRoster treats a rename as remove+add and
// auto-deletes the departed name's metadata (shared/storage.js
// :452-465). Fixing one typo in a name would wipe a year of contact
// records on the first keystroke, with no undo. So records live under
// tools['contact-log'].people — outside the reserved `students` key
// the auto-sweeper can reach — keyed by a tool-minted id, and are
// reconciled against the roster. Nothing here is ever deleted because
// a roster changed; the only destructive action is an explicit Clear.
//
// Suite conventions: roster via the bridge, per-tool state under
// tools['contact-log'], nav-levels for Back, borderless fullscreen,
// Esc/F/S grammar — with ONE deliberate deviation: Esc hides the log
// before it walks back (see the privacy section).
// =============================================================

import * as bridge from '../shared/roster-bridge.js';
import {
  getToolState, setToolState, getPreference, setPreference, StorageQuotaError,
} from '../shared/storage.js';
import { mountSettingsButton } from '../shared/settings.js';
import { mountClassCardGrid } from '../shared/components/class-card-grid.js';
import { initLevels } from '../shared/nav-levels.js';
import { initTextures } from '../shared/textures.js';

mountSettingsButton();

const TOOL = 'contact-log';
const NOTE_MAX = 4000;

/* How a contact was made / how it went. Short enums so a year of
   entries stays small in a shared 5MB envelope. */
const KINDS = {
  phone: 'Telephoned',
  email: 'Emailed',
  inperson: 'Came to see you',
  note: 'Note home',
};
const OUTCOMES = {
  reached: 'Reached them',
  message: 'Left message',
  noanswer: 'No answer',
};

const state = {
  classId: null,
  className: '',
  roster: [],
  personId: null,      // the open student's record id
  filter: 'all',
  hidden: false,
};

/* ── Storage ─────────────────────────────────────────────────
   Every write re-reads the envelope first. shared/storage.js keeps a
   module-level cache and never listens for cross-tab writes, so a
   long-lived copy held across a teacher's typing session would
   clobber whatever another tab (usually the seating chart) wrote in
   the meantime. Read → mutate → write, immediately, every time. */
function toolBlob() {
  return getToolState(TOOL) ?? {};
}

function writePeople(classId, people) {
  const blob = toolBlob();
  const next = { ...blob, people: { ...(blob.people ?? {}), [classId]: people } };
  setToolState(TOOL, next);
}

function peopleFor(classId) {
  const list = toolBlob().people?.[classId];
  return Array.isArray(list) ? list : [];
}

function newId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'cl-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

/* ── Reconciliation ──────────────────────────────────────────
   The roster is the source of truth for WHO is in the class; our
   records are the source of truth for WHAT was said. Keeping the two
   joined is the whole ballgame, because the canonical layer exposes
   names only — and names change.

   Two mechanisms, strongest first:

   1. The seating chart mints a stable per-student id and keeps it in
      its own blob. It isn't exposed through the bridge, but we can
      read it, and it survives renames perfectly. When a record is
      created we stash that id; afterwards a rename is a lookup, not a
      guess. This is what makes a typo correction a non-event.

   2. No id available (a Wheel-created class, say) → fall back to
      names, using the added/removed pair from a live roster change.
      Exactly one out and one in is a rename and is unambiguous, even
      keystroke-by-keystroke. Anything messier parks the record as
      'unmatched' for a manual re-link.

   A record is NEVER dropped here — not on a rename, not when a
   student leaves, not when the class is deleted. */

/** The seating chart's students for a class: [{ id, name }]. Empty when
 *  the class didn't come from there. */
function seatingStudents(classId) {
  const sc = getToolState('seating-chart');
  const inner = sc && sc.state ? sc.state : sc;
  const cls = inner?.classes?.find?.((c) => c && c.id === classId);
  return Array.isArray(cls?.students) ? cls.students : [];
}

function seatingIdForName(classId, name) {
  return seatingStudents(classId).find((s) => s.name === name)?.id ?? null;
}

function reconcile(classId, detail) {
  const people = peopleFor(classId);
  if (people.length === 0) return people;
  const rosterNames = new Set(bridge.getRoster(classId));
  const scById = new Map(seatingStudents(classId).map((s) => [s.id, s.name]));
  let changed = false;

  // 1. Anchored records follow their student wherever the name goes.
  for (const p of people) {
    if (!p.scId) continue;
    const current = scById.get(p.scId);
    if (current && current !== p.name) {
      p.name = current;
      changed = true;
    }
  }

  // 2. Name-based repair for anything still adrift, using the live
  //    added/removed pair when we have one.
  const added = (detail?.added ?? []).filter((n) => !people.some((p) => p.name === n));
  const removed = (detail?.removed ?? []).filter((n) => people.some((p) => p.name === n));
  if (added.length === 1 && removed.length === 1) {
    const rec = people.find((p) => p.name === removed[0]);
    if (rec) {
      rec.name = added[0];
      changed = true;
    }
  }

  for (const p of people) {
    // Backfill an anchor for records that predate one.
    if (!p.scId) {
      const id = seatingIdForName(classId, p.name);
      if (id) { p.scId = id; changed = true; }
    }
    const nowUnmatched = !rosterNames.has(p.name);
    if (!!p.unmatched !== nowUnmatched) {
      p.unmatched = nowUnmatched;
      changed = true;
    }
  }

  if (changed) writePeople(classId, people);
  return people;
}

/** The record for a roster name, created on demand. */
function ensurePerson(classId, name) {
  const people = peopleFor(classId);
  let rec = people.find((p) => p.name === name && !p.unmatched);
  if (!rec) {
    rec = { id: newId(), name, scId: seatingIdForName(classId, name), entries: [] };
    people.push(rec);
    writePeople(classId, people);
  }
  return rec;
}

function personById(classId, id) {
  return peopleFor(classId).find((p) => p.id === id) ?? null;
}

/** Append a slip. Re-reads immediately before writing (see above). */
function addEntry(classId, personId, entry) {
  const people = peopleFor(classId);
  const rec = people.find((p) => p.id === personId);
  if (!rec) return false;
  rec.entries = [...(rec.entries ?? []), entry];
  writePeople(classId, people);
  return true;
}

function deleteEntry(classId, personId, entryId) {
  const people = peopleFor(classId);
  const rec = people.find((p) => p.id === personId);
  if (!rec) return;
  rec.entries = (rec.entries ?? []).filter((e) => e.id !== entryId);
  writePeople(classId, people);
}

function toggleFollowUp(classId, personId, entryId) {
  const people = peopleFor(classId);
  const rec = people.find((p) => p.id === personId);
  const entry = rec?.entries?.find((e) => e.id === entryId);
  if (!entry) return;
  entry.followUp = !entry.followUp;
  writePeople(classId, people);
}

/* ── Derived reads ───────────────────────────────────────────── */
function lastContact(rec) {
  const entries = rec?.entries ?? [];
  if (entries.length === 0) return null;
  return entries.reduce((a, b) => (a.at > b.at ? a : b)).at;
}
function owedCount(rec) {
  return (rec?.entries ?? []).filter((e) => e.followUp).length;
}

/** Roster names joined to their records, coldest first: never-contacted
 *  at the top, then oldest contact, then most recent. */
function cardRows(classId) {
  const people = peopleFor(classId);
  const byName = new Map(people.filter((p) => !p.unmatched).map((p) => [p.name, p]));
  const rows = bridge.getRoster(classId).map((name) => {
    const rec = byName.get(name) ?? null;
    return {
      name,
      rec,
      last: rec ? lastContact(rec) : null,
      count: rec ? (rec.entries?.length ?? 0) : 0,
      owed: rec ? owedCount(rec) : 0,
    };
  });
  rows.sort((a, b) => {
    if (!a.last && !b.last) return a.name.localeCompare(b.name);
    if (!a.last) return -1;
    if (!b.last) return 1;
    return a.last < b.last ? -1 : a.last > b.last ? 1 : 0;
  });
  return rows;
}

/* ── Formatting ──────────────────────────────────────────────── */
function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function niceDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
function sinceLabel(iso) {
  if (!iso) return 'never contacted';
  const [y, m, d] = iso.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ── Views ───────────────────────────────────────────────────── */
const VIEWS = ['class-select-view', 'class-view', 'student-view'];
function showView(id) {
  for (const v of VIEWS) document.getElementById(v).hidden = v !== id;
  document.body.classList.toggle('app-view', id !== 'class-select-view');
  document.body.classList.toggle('is-pad', id === 'student-view');
  document.getElementById('crumb-tool').hidden = id === 'class-select-view';
  const crumbCtx = document.getElementById('crumb-context');
  crumbCtx.hidden = id === 'class-select-view';
  crumbCtx.textContent = state.className;
  // Crumb rule: every level above the current one is a link.
  crumbCtx.classList.toggle('is-current', id !== 'student-view');
}

let classGridCtl = null;
function showClassSelect() {
  state.classId = null;
  state.personId = null;
  showView('class-select-view');
  if (!classGridCtl) {
    classGridCtl = mountClassCardGrid(document.getElementById('class-grid'), {
      marblePool: true,
      onSelect: (classId) => openClass(classId),
      emptyMessage: 'No classes yet. Create one in the Seating Chart or the Wheel first.',
    });
  } else {
    classGridCtl.refresh();
  }
}

function openClass(classId, { pushLevel = true } = {}) {
  state.classId = classId;
  state.className = bridge.getClassName(classId) || '(unnamed)';
  state.roster = bridge.getRoster(classId);
  reconcile(classId, null);
  document.getElementById('class-name').textContent = state.className;
  showView('class-view');
  renderCardFile();
  if (pushLevel) nav.push('class');
}

function renderCardFile() {
  const rows = cardRows(state.classId);
  const totalOwed = rows.reduce((n, r) => n + r.owed, 0);
  const never = rows.filter((r) => !r.last).length;
  document.getElementById('class-summary').textContent =
    `${rows.length} student${rows.length === 1 ? '' : 's'} · ` +
    `${never} never contacted` + (totalOwed ? ` · ${totalOwed} follow-up${totalOwed === 1 ? '' : 's'} owed` : '');

  let shown = rows;
  if (state.filter === 'never') shown = rows.filter((r) => !r.last);
  if (state.filter === 'owed') shown = rows.filter((r) => r.owed > 0);

  const host = document.getElementById('student-cards');
  host.innerHTML = shown.length
    ? shown.map((r) => `
        <button type="button" class="student-card${r.last ? '' : ' is-cold'}" data-name="${escHtml(r.name)}">
          <span class="card-name">${escHtml(r.name)}</span>
          <span class="card-since">${escHtml(sinceLabel(r.last))}</span>
          <span class="card-meta">
            ${r.count} slip${r.count === 1 ? '' : 's'}${r.owed ? ` · <span class="card-owed">${r.owed} owed</span>` : ''}
          </span>
        </button>`).join('')
    : `<p class="muted empty-note">Nothing here — try another filter.</p>`;

  // Unmatched records: renamed or departed students, never deleted.
  const unmatched = peopleFor(state.classId).filter((p) => p.unmatched);
  const section = document.getElementById('unmatched-section');
  section.hidden = unmatched.length === 0;
  if (unmatched.length) {
    document.getElementById('unmatched-cards').innerHTML = unmatched.map((p) => `
      <div class="student-card is-unmatched" data-id="${escHtml(p.id)}">
        <span class="card-name">${escHtml(p.name)}</span>
        <span class="card-since">${p.entries?.length ?? 0} slip${(p.entries?.length ?? 0) === 1 ? '' : 's'} kept</span>
        <span class="card-meta">
          <button type="button" class="link-btn" data-open="${escHtml(p.id)}">Open</button>
          <button type="button" class="link-btn" data-relink="${escHtml(p.id)}">
            <svg class="icon" aria-hidden="true"><use href="#icon-link"/></svg> Re-link
          </button>
        </span>
      </div>`).join('');
  }
}

/* ── Slip stack (one student) ────────────────────────────────── */
function openStudent(personId, { pushLevel = true } = {}) {
  const rec = personById(state.classId, personId);
  if (!rec) return false;
  state.personId = personId;
  document.getElementById('student-name').textContent = rec.name;
  showView('student-view');
  document.getElementById('slip-date').value = todayISO();
  document.getElementById('slip-who').value = '';
  document.getElementById('slip-note').value = '';
  document.getElementById('slip-followup').checked = false;
  document.getElementById('slip-error').hidden = true;
  renderSlips();
  if (pushLevel) nav.push('student');
  return true;
}

function renderSlips() {
  const rec = personById(state.classId, state.personId);
  if (!rec) return;
  const entries = [...(rec.entries ?? [])].sort((a, b) => (a.at < b.at ? 1 : -1));
  const owed = entries.filter((e) => e.followUp).length;
  document.getElementById('student-summary').textContent =
    entries.length
      ? `${entries.length} slip${entries.length === 1 ? '' : 's'} · last ${sinceLabel(lastContact(rec))}` +
        (owed ? ` · ${owed} follow-up${owed === 1 ? '' : 's'} owed` : '')
      : 'No contact recorded yet.';

  document.getElementById('slip-stack').innerHTML = entries.map((e) => `
    <article class="slip slip-filed${e.followUp ? ' is-owed' : ''}" data-id="${escHtml(e.id)}">
      <div class="slip-head">
        <span class="slip-title">While You Were Out</span>
        <span class="slip-filed-date">${escHtml(niceDate(e.at))}</span>
      </div>
      ${e.who ? `<p class="slip-row slip-m"><span class="slip-m-prefix">M</span> ${escHtml(e.who)}</p>` : ''}
      <p class="slip-stamps">
        <span class="stamp">${escHtml(KINDS[e.kind] ?? e.kind)}</span>
        <span class="stamp stamp-outcome">${escHtml(OUTCOMES[e.outcome] ?? e.outcome)}</span>
        ${e.followUp ? '<span class="stamp stamp-owed">Please follow up</span>' : ''}
      </p>
      ${e.note ? `<p class="slip-note">${escHtml(e.note)}</p>` : ''}
      <p class="slip-filed-actions">
        <button type="button" class="link-btn" data-toggle="${escHtml(e.id)}">
          ${e.followUp ? 'Clear follow-up' : 'Mark follow-up'}
        </button>
        <button type="button" class="link-btn is-danger" data-delete="${escHtml(e.id)}">Delete</button>
      </p>
    </article>`).join('');
}

/* ── Privacy: the panic-hide ─────────────────────────────────
   DELIBERATE DEVIATION from the suite's Esc-walks-back grammar. This
   is the one tool holding notes about families, and the realistic
   threat is a student arriving at the desk mid-sentence — so Esc
   hides first (and works while typing, unlike every other key), and a
   second Esc walks up a level. Flagged in CLAUDE.md. */
function setHidden(hidden) {
  state.hidden = hidden;
  document.getElementById('privacy-curtain').hidden = !hidden;
  document.body.classList.toggle('is-hidden-log', hidden);
  if (!hidden) document.getElementById('btn-hide')?.focus();
}
document.getElementById('btn-hide').addEventListener('click', () => setHidden(true));
document.getElementById('btn-unhide').addEventListener('click', () => setHidden(false));

/* ── Fullscreen (suite standard) ─────────────────────────────── */
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

/* ── Wiring ──────────────────────────────────────────────────── */
document.getElementById('crumb-tool').addEventListener('click', (e) => {
  e.preventDefault();
  nav.popTo('select');
});
document.getElementById('crumb-context').addEventListener('click', (e) => {
  e.preventDefault();
  if (nav.current() === 'student') nav.pop();
});

document.querySelector('.file-filters').addEventListener('click', (e) => {
  const chip = e.target.closest('.filter-chip');
  if (!chip) return;
  state.filter = chip.dataset.filter;
  for (const c of document.querySelectorAll('.filter-chip')) {
    const on = c === chip;
    c.classList.toggle('is-active', on);
    c.setAttribute('aria-selected', String(on));
  }
  renderCardFile();
});

document.getElementById('student-cards').addEventListener('click', (e) => {
  const card = e.target.closest('.student-card');
  if (!card || !card.dataset.name) return;
  const rec = ensurePerson(state.classId, card.dataset.name);
  openStudent(rec.id);
});

document.getElementById('unmatched-cards').addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) { openStudent(open.dataset.open); return; }
  const relink = e.target.closest('[data-relink]');
  if (relink) relinkPrompt(relink.dataset.relink);
});

/** Manual re-link: point an unmatched record at a roster name. */
function relinkPrompt(personId) {
  const rec = personById(state.classId, personId);
  if (!rec) return;
  const names = bridge.getRoster(state.classId);
  if (names.length === 0) return;
  const list = names.map((n, i) => `${i + 1}. ${n}`).join('\n');
  const answer = window.prompt(
    `Which student is "${rec.name}"?\n\n${list}\n\nType a number (or Cancel to leave it as is):`,
  );
  const idx = Number(answer) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= names.length) return;
  const people = peopleFor(state.classId);
  const target = people.find((p) => p.id === personId);
  if (!target) return;
  target.name = names[idx];
  target.unmatched = false;
  target.scId = seatingIdForName(state.classId, names[idx]);
  writePeople(state.classId, people);
  renderCardFile();
}

document.getElementById('slip-stack').addEventListener('click', (e) => {
  const t = e.target.closest('[data-toggle]');
  if (t) { toggleFollowUp(state.classId, state.personId, t.dataset.toggle); renderSlips(); return; }
  const d = e.target.closest('[data-delete]');
  if (d && window.confirm('Delete this slip? This cannot be undone.')) {
    deleteEntry(state.classId, state.personId, d.dataset.delete);
    renderSlips();
  }
});

document.getElementById('new-slip').addEventListener('submit', (e) => {
  e.preventDefault();
  saveSlip();
});

function saveSlip() {
  const errEl = document.getElementById('slip-error');
  errEl.hidden = true;
  const note = document.getElementById('slip-note').value.trim().slice(0, NOTE_MAX);
  const who = document.getElementById('slip-who').value.trim().slice(0, 80);
  const at = document.getElementById('slip-date').value || todayISO();
  const kind = document.querySelector('input[name="kind"]:checked')?.value ?? 'phone';
  const outcome = document.querySelector('input[name="outcome"]:checked')?.value ?? 'reached';
  const followUp = document.getElementById('slip-followup').checked;

  if (!note && !who) {
    errEl.textContent = 'Add a short message (or at least who you spoke with).';
    errEl.hidden = false;
    document.getElementById('slip-note').focus();
    return;
  }

  try {
    addEntry(state.classId, state.personId, {
      id: newId(), at, kind, outcome, note, who, followUp,
    });
  } catch (err) {
    errEl.textContent = err instanceof StorageQuotaError
      ? err.message
      : 'Could not save that slip. Try again.';
    errEl.hidden = false;
    return;
  }

  document.getElementById('slip-note').value = '';
  document.getElementById('slip-who').value = '';
  document.getElementById('slip-followup').checked = false;
  document.getElementById('slip-date').value = todayISO();
  renderSlips();
  document.getElementById('slip-note').focus();
}

/* Ctrl/Cmd+Enter saves from the textarea — the whole point is that a
   slip takes seconds, so the hands never have to leave the keys. */
document.getElementById('slip-note').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    saveSlip();
  }
});

/* ── Export ──────────────────────────────────────────────────── */
function entriesCsv(rows) {
  const head = ['student', 'date', 'how', 'result', 'follow_up', 'spoke_with', 'message'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [head.join(',')];
  for (const { name, entries } of rows) {
    for (const e of entries) {
      lines.push([
        name, e.at, KINDS[e.kind] ?? e.kind, OUTCOMES[e.outcome] ?? e.outcome,
        e.followUp ? 'yes' : 'no', e.who ?? '', e.note ?? '',
      ].map(esc).join(','));
    }
  }
  return lines.join('\n');
}

function downloadCsv() {
  const rows = peopleFor(state.classId)
    .map((p) => ({ name: p.name, entries: [...(p.entries ?? [])].sort((a, b) => (a.at < b.at ? -1 : 1)) }))
    .filter((r) => r.entries.length);
  if (!rows.length) return;
  const blob = new Blob([entriesCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contact-log-${state.className.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The artifact someone actually asks for: a plain paper record. */
function printRecord(people, heading) {
  const rows = people
    .map((p) => ({ name: p.name, entries: [...(p.entries ?? [])].sort((a, b) => (a.at < b.at ? -1 : 1)) }))
    .filter((r) => r.entries.length);
  const body = rows.length ? rows.map((r) => `
    <h2>${escHtml(r.name)}</h2>
    <table>
      <thead><tr><th>Date</th><th>How</th><th>Result</th><th>Message</th></tr></thead>
      <tbody>${r.entries.map((e) => `
        <tr>
          <td>${escHtml(niceDate(e.at))}</td>
          <td>${escHtml(KINDS[e.kind] ?? e.kind)}</td>
          <td>${escHtml(OUTCOMES[e.outcome] ?? e.outcome)}${e.followUp ? ' · follow-up' : ''}</td>
          <td>${escHtml(e.who ? `${e.who}: ` : '')}${escHtml(e.note ?? '')}</td>
        </tr>`).join('')}</tbody>
    </table>`).join('') : '<p>No contact recorded.</p>';

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${escHtml(heading)} · Contact Log</title>
    <style>
      body { font: 13px/1.5 system-ui, sans-serif; color: #1c1a17; margin: 32px; }
      h1 { font-size: 20px; margin: 0 0 2px; }
      h2 { font-size: 15px; margin: 22px 0 6px; border-bottom: 1px solid #999; padding-bottom: 3px; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #555; border-bottom: 1px solid #ccc; padding: 4px 6px; }
      td { padding: 5px 6px; vertical-align: top; border-bottom: 1px solid #eee; }
      td:nth-child(1) { white-space: nowrap; width: 15%; }
      td:nth-child(2), td:nth-child(3) { white-space: nowrap; width: 15%; }
      .sub { color: #555; margin: 0 0 6px; }
      @media print { body { margin: 0; } }
    </style></head><body>
    <h1>${escHtml(heading)}</h1>
    <p class="sub">Contact record · printed ${escHtml(niceDate(todayISO()))}</p>
    ${body}
    </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

document.getElementById('btn-csv-class').addEventListener('click', downloadCsv);
document.getElementById('btn-print-class').addEventListener('click', () => {
  printRecord(peopleFor(state.classId), state.className);
});
document.getElementById('btn-print-student').addEventListener('click', () => {
  const rec = personById(state.classId, state.personId);
  if (rec) printRecord([rec], `${rec.name} — ${state.className}`);
});

/* ── Keyboard (suite grammar, with the Esc deviation) ────────── */
document.addEventListener('keydown', (e) => {
  // Esc runs BEFORE the typing guard on purpose: the panic-hide has to
  // work with the cursor sitting in a half-written message.
  if (e.key === 'Escape') {
    if (document.fullscreenElement) return;
    if (!state.hidden) {
      e.preventDefault();
      setHidden(true);
      return;
    }
    setHidden(false);
    if (nav.current() !== 'select') nav.pop();
    return;
  }
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    toggleFullscreen();
  }
});

/* ── Roster reconciliation, live ─────────────────────────────── */
bridge.onRosterChange(null, (detail) => {
  if (!detail || detail.classId !== state.classId || !state.classId) return;
  state.roster = bridge.getRoster(state.classId);
  reconcile(state.classId, detail);
  if (!document.getElementById('class-view').hidden) renderCardFile();
  if (!document.getElementById('student-view').hidden) {
    const rec = personById(state.classId, state.personId);
    if (rec) document.getElementById('student-name').textContent = rec.name;
  }
});

/* ── Browser-history levels ──────────────────────────────────── */
const nav = initLevels({
  onNavigate(level) {
    if (level === 'select') { showClassSelect(); return true; }
    if (level === 'class') {
      if (!state.classId) return false;
      openClass(state.classId, { pushLevel: false });
      return true;
    }
    if (level === 'student') {
      if (!state.classId || !state.personId) return false;
      return openStudent(state.personId, { pushLevel: false });
    }
    return false;
  },
});

void getPreference; void setPreference; // (reserved for future tool prefs)

initTextures();
showClassSelect();
nav.setRoot('select');
