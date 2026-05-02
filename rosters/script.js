// =============================================================
// rosters/script.js — suite-wide class roster manager
//
// The canonical place to manage classes that carry across every tool
// in The Teacher's Desk. Reads listClasses() (canonical + seating-chart
// fallback) for the list view; only canonical classes are editable
// here in v1 (seating-chart-owned classes are read-only with a deep
// link to the Seating Chart for editing). Phase B will close that gap.
// =============================================================

import * as storage from '../shared/storage.js';
import * as bridge from '../shared/roster-bridge.js';
import { mountSettingsButton } from '../shared/settings.js';
import { mountPasteBulk } from '../shared/components/paste-bulk.js';

mountSettingsButton();

// -------------------------------------------------------------
// State
// -------------------------------------------------------------
const VIEW = {
  list: document.getElementById('list-view'),
  edit: document.getElementById('edit-view'),
};

const state = {
  editingId: null,
  editingSource: null, // 'canonical' | 'seating-chart'
};

function showView(name) {
  for (const [k, el] of Object.entries(VIEW)) el.hidden = k !== name;
}

// -------------------------------------------------------------
// LIST VIEW
// -------------------------------------------------------------
function renderList() {
  const list = document.getElementById('class-list');
  const empty = document.getElementById('class-empty');
  const classes = storage.listClasses();

  list.innerHTML = '';
  if (classes.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  classes.sort((a, b) => a.name.localeCompare(b.name));

  for (const c of classes) {
    const row = document.createElement('div');
    row.className = 'class-row';

    const left = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'class-row-name';
    name.textContent = c.name;
    left.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'class-row-meta';
    const count = storage.getRoster(c.id).length;
    const studentSpan = document.createElement('span');
    studentSpan.textContent = `${count} student${count === 1 ? '' : 's'}`;
    meta.appendChild(studentSpan);
    if (c.source === 'seating-chart') {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'From Seating Chart';
      meta.appendChild(tag);
    }
    left.appendChild(meta);
    row.appendChild(left);

    const actions = document.createElement('div');
    actions.className = 'class-row-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'desk-button is-ghost';
    editBtn.textContent = c.source === 'canonical' ? 'Edit' : 'View';
    editBtn.addEventListener('click', () => openEdit(c.id));
    actions.appendChild(editBtn);

    row.appendChild(actions);
    list.appendChild(row);
  }
}

// -------------------------------------------------------------
// EDIT VIEW
// -------------------------------------------------------------
const editClassName = document.getElementById('edit-class-name');
const editSourceMsg = document.getElementById('edit-source-msg');
const editRosterList = document.getElementById('edit-roster-list');
const editRosterCount = document.getElementById('edit-roster-count');
const editPasteHost = document.getElementById('edit-paste-host');
let editPasteCtl = null;
const linkPicker = document.getElementById('link-picker');
const linkSeating = document.getElementById('link-seating');
const btnDeleteClass = document.getElementById('btn-delete-class');
const deleteWarning = document.getElementById('delete-warning');

function openEdit(classId, opts = {}) {
  const cls = storage.listClasses().find((c) => c.id === classId);
  if (!cls) return;

  state.editingId = classId;
  state.editingSource = cls.source;

  editClassName.value = cls.name === '(unnamed)' ? '' : cls.name;
  editClassName.disabled = cls.source !== 'canonical';
  editClassName.placeholder = 'Class name…';
  editSourceMsg.hidden = cls.source !== 'seating-chart';
  if (cls.source === 'seating-chart') {
    editSourceMsg.textContent =
      'This class lives in the Seating Chart. Open it there to add or rename students.';
  }

  // Tool deep links
  linkPicker.href = `../picker/index.html`;
  linkSeating.href = `../seating-chart/index.html#/classes/${encodeURIComponent(classId)}/roster`;

  // Delete affordance — canonical classes only
  if (cls.source === 'canonical') {
    btnDeleteClass.disabled = false;
    deleteWarning.hidden = true;
  } else {
    btnDeleteClass.disabled = true;
    deleteWarning.hidden = false;
  }

  renderRoster();
  showView('edit');

  // For freshly created classes, focus the name input so the user can
  // type a name immediately. The class already exists in storage with
  // an empty name; the editClassName change handler persists it on blur.
  if (opts.isNew && cls.source === 'canonical') {
    setTimeout(() => {
      editClassName.focus();
      editClassName.select();
    }, 0);
  }
}

function renderRoster() {
  const names = storage.getRoster(state.editingId);
  editRosterCount.textContent = names.length === 0 ? '(empty)' : `${names.length}`;
  editRosterList.innerHTML = '';

  if (state.editingSource !== 'canonical') {
    // Read-only: render as static names
    for (const n of names) {
      const li = document.createElement('li');
      li.className = 'edit-roster-row';
      const span = document.createElement('span');
      span.textContent = n;
      span.style.padding = '4px 6px';
      li.appendChild(span);
      editRosterList.appendChild(li);
    }
    if (editPasteCtl) editPasteCtl.setDisabled(true);
    return;
  }

  // Editable rows for canonical classes
  for (let i = 0; i < names.length; i++) {
    const li = document.createElement('li');
    li.className = 'edit-roster-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = names[i];
    input.dataset.idx = String(i);
    input.addEventListener('blur', () => commitRename(parseInt(input.dataset.idx, 10), input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
    li.appendChild(input);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'row-delete';
    del.textContent = 'Remove';
    del.addEventListener('click', () => removeAt(i));
    li.appendChild(del);

    editRosterList.appendChild(li);
  }

  if (editPasteCtl) editPasteCtl.setDisabled(false);
}

function commitRename(idx, newValue) {
  const trimmed = newValue.trim();
  const names = storage.getRoster(state.editingId);
  if (idx < 0 || idx >= names.length) return;
  if (!trimmed) {
    // Empty rename → re-render and ignore (keeps the old name)
    renderRoster();
    return;
  }
  if (trimmed === names[idx]) return; // no change

  try {
    // renameStudent handles dedupe checking, call-count migration, and
    // dispatches a `rosterrename` window event so other tools (the seating
    // chart) can update their per-student metadata.
    storage.renameStudent(state.editingId, names[idx], trimmed);
  } catch (e) {
    if (e && e.name === 'RosterDuplicateError') {
      alert(e.message);
    } else {
      alert(`Rename failed: ${e && e.message ? e.message : e}`);
    }
  }
  renderRoster();
}

function removeAt(idx) {
  const names = storage.getRoster(state.editingId).slice();
  if (idx < 0 || idx >= names.length) return;
  if (!confirm(`Remove "${names[idx]}" from this class?`)) return;
  names.splice(idx, 1);
  storage.setRoster(state.editingId, names);
  renderRoster();
}

// Mount the shared paste-bulk component for the add-students area. The
// component handles dedupe within the input + the textarea/button DOM;
// our onSubmit handler still dedupes against the existing class roster.
editPasteCtl = mountPasteBulk(editPasteHost, {
  placeholder: 'Alice\nBob',
  rows: 4,
  buttonLabel: 'Add to class',
  hint: 'Paste names — one per line. Duplicates within the class are skipped.',
  onSubmit: (incoming) => {
    if (state.editingSource !== 'canonical') return;
    const existing = storage.getRoster(state.editingId);
    const existingLower = new Set(existing.map((n) => n.toLowerCase()));
    const toAdd = incoming.filter((n) => !existingLower.has(n.toLowerCase()));
    if (toAdd.length === 0) return;
    storage.setRoster(state.editingId, [...existing, ...toAdd]);
    renderRoster();
  },
});

editClassName.addEventListener('change', () => {
  if (state.editingSource !== 'canonical') return;
  const next = editClassName.value.trim();
  if (!next) {
    editClassName.value = storage.getClassName(state.editingId) || '';
    return;
  }
  storage.setClassName(state.editingId, next);
});

btnDeleteClass.addEventListener('click', () => {
  if (state.editingSource !== 'canonical') return;
  const name = storage.getClassName(state.editingId) || '(unnamed)';
  if (!confirm(`Delete "${name}"? Its roster and call counts will be removed.`)) return;
  storage.deleteClass(state.editingId);
  state.editingId = null;
  showView('list');
  renderList();
});

document.getElementById('btn-back-list').addEventListener('click', () => {
  showView('list');
  renderList();
});

// -------------------------------------------------------------
// New class
// Click "+ New class" → create a blank class and route directly into
// the same edit view used for existing classes. No separate modal —
// creation IS just editing a fresh class.
// -------------------------------------------------------------
document.getElementById('btn-new-class').addEventListener('click', () => {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'cls-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);

  // Persist immediately with an empty name. Until the user types one,
  // the class shows as "(unnamed)" in list view; deletable from there.
  storage.setClassName(id, '');
  storage.setRoster(id, []);
  openEdit(id, { isNew: true });
});

// -------------------------------------------------------------
// Boot
// -------------------------------------------------------------
renderList();
showView('list');
