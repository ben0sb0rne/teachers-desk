// =============================================================
// THE TEACHER'S DESK — shared storage module
//
// Single source of truth for localStorage. Every tool in the suite
// reads and writes through this module. Never touch localStorage
// directly from a tool.
//
// Internal model:
//   localStorage["teachersdesk:v1"] = JSON.stringify({
//     schemaVersion: 1,
//     preferences: {...},          // suite-wide (theme, audio, ...)
//     rosters:     { [classId]: ["Jordan", "Maya", ...] },
//     callCounts:  { [classId]: { "Jordan": 4, "Maya": 1 } },
//     tools: {
//       bingo:           { customSets: [...], settings: {...} },
//       "seating-chart": { /* opaque blob owned by seating chart */ }
//     }
//   })
//
// Notes:
// - Concurrent tabs: last-write-wins. We do not subscribe to the
//   `storage` event in v1.
// - Quota: ~5MB browser limit. Writes that exceed the quota throw
//   StorageQuotaError; callers surface a friendly message.
// - Legacy keys (mathBingoSettings_v1, seating-chart-designer:v1) are
//   migrated once on first init then deleted.
// - Schema version 1 is current. Future migrations slot into MIGRATIONS.
// - This module is a native ES module. Vanilla tools load it via
//   <script type="module">; React tools (Vite) import it directly.
// =============================================================

const KEY = 'teachersdesk:v1';
const CURRENT_SCHEMA_VERSION = 1;

const LEGACY_KEYS = {
  bingo: 'mathBingoSettings_v1',
  seatingChart: 'seating-chart-designer:v1',
};

// -------------------------------------------------------------
// Default state
// -------------------------------------------------------------
function defaultState() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    preferences: {},
    classes: {},        // canonical class metadata: { [classId]: { name } }
    rosters: {},        // canonical roster: { [classId]: string[] }
    callCounts: {},
    tools: {},
  };
}

// -------------------------------------------------------------
// Errors
// -------------------------------------------------------------
export class StorageQuotaError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'StorageQuotaError';
    if (cause) this.cause = cause;
  }
}

export class ImportFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImportFormatError';
  }
}

// -------------------------------------------------------------
// Storage availability + in-memory fallback (private mode, etc.)
// -------------------------------------------------------------
function localStorageAvailable() {
  try {
    const probe = '__teachersdesk_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

const HAS_LS = typeof window !== 'undefined' && localStorageAvailable();
let memoryFallback = null; // mirror state when LS unavailable

function rawGet(key) {
  if (HAS_LS) return window.localStorage.getItem(key);
  return memoryFallback && memoryFallback[key] != null ? memoryFallback[key] : null;
}
function rawSet(key, value) {
  if (HAS_LS) {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
        throw new StorageQuotaError(
          'Browser storage is full. Export and clear unused data, then retry.',
          err
        );
      }
      throw err;
    }
    return;
  }
  if (!memoryFallback) memoryFallback = {};
  memoryFallback[key] = value;
}
function rawRemove(key) {
  if (HAS_LS) {
    window.localStorage.removeItem(key);
    return;
  }
  if (memoryFallback) delete memoryFallback[key];
}

// -------------------------------------------------------------
// Migration scaffold (future versions slot in here)
// -------------------------------------------------------------
const MIGRATIONS = {
  // Example (not yet needed):
  // 2: (state) => { state.newField = []; return state; },
};

function applyMigrations(state) {
  let s = state;
  while (s.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const next = s.schemaVersion + 1;
    const fn = MIGRATIONS[next];
    if (!fn) {
      throw new Error(`Missing migration to schema v${next}`);
    }
    s = fn(s);
    s.schemaVersion = next;
  }
  return s;
}

// -------------------------------------------------------------
// Legacy key migration (one-shot on first init)
// -------------------------------------------------------------
function migrateLegacy() {
  const out = defaultState();
  let migratedAnything = false;

  // Math Bingo: split into suite-wide preferences + bingo tool settings.
  const bingoLegacyRaw = rawGet(LEGACY_KEYS.bingo);
  if (bingoLegacyRaw) {
    try {
      const legacy = JSON.parse(bingoLegacyRaw);
      // Suite-wide preferences:
      ['theme', 'soundEnabled', 'soundMuted', 'soundVolume'].forEach((k) => {
        if (legacy[k] !== undefined) out.preferences[k] = legacy[k];
      });
      // Tool-specific settings: everything else.
      const toolSettings = { ...legacy };
      delete toolSettings.theme;
      delete toolSettings.soundEnabled;
      delete toolSettings.soundMuted;
      delete toolSettings.soundVolume;
      out.tools.bingo = { customSets: [], settings: toolSettings };
      migratedAnything = true;
    } catch (err) {
      // Corrupt JSON — log and skip.
      // eslint-disable-next-line no-console
      console.warn('[teachersdesk] Failed to migrate legacy bingo settings:', err);
    }
  }

  // Seating Chart: store the parsed object verbatim under tools["seating-chart"].
  // The seating chart's own Zustand persist will run its v1->v6 migrations on first hydrate.
  const seatingLegacyRaw = rawGet(LEGACY_KEYS.seatingChart);
  if (seatingLegacyRaw) {
    try {
      const legacy = JSON.parse(seatingLegacyRaw);
      // Zustand wraps state as { state: {...}, version: 6 }. Preserve as-is.
      out.tools['seating-chart'] = legacy;
      migratedAnything = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[teachersdesk] Failed to migrate legacy seating chart state:', err);
    }
  }

  if (migratedAnything) {
    // Persist new shape, then delete legacy keys.
    rawSet(KEY, JSON.stringify(out));
    rawRemove(LEGACY_KEYS.bingo);
    rawRemove(LEGACY_KEYS.seatingChart);
  }

  return migratedAnything ? out : null;
}

// -------------------------------------------------------------
// Cached state load
// -------------------------------------------------------------
let cache = null;

function load() {
  if (cache) return cache;

  const raw = rawGet(KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        cache = defaultState();
      } else {
        // Coerce missing top-level fields to safe defaults.
        cache = {
          schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : CURRENT_SCHEMA_VERSION,
          preferences: parsed.preferences && typeof parsed.preferences === 'object' ? parsed.preferences : {},
          classes: parsed.classes && typeof parsed.classes === 'object' ? parsed.classes : {},
          rosters: parsed.rosters && typeof parsed.rosters === 'object' ? parsed.rosters : {},
          callCounts: parsed.callCounts && typeof parsed.callCounts === 'object' ? parsed.callCounts : {},
          tools: parsed.tools && typeof parsed.tools === 'object' ? parsed.tools : {},
        };
        cache = applyMigrations(cache);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[teachersdesk] Corrupt storage; falling back to defaults:', err);
      cache = defaultState();
    }
    return cache;
  }

  // No teachersdesk:v1 key — try legacy migration once.
  const migrated = migrateLegacy();
  cache = migrated || defaultState();
  return cache;
}

function save() {
  if (!cache) return;
  rawSet(KEY, JSON.stringify(cache));
}

// -------------------------------------------------------------
// Low-level get/set/remove using dot-paths.
// Examples: get('preferences.theme'), set('rosters.period-3', [...])
// Useful for ad-hoc access; tools should usually use the named helpers below.
// -------------------------------------------------------------
function dotGet(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

function dotSet(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function dotRemove(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object') return;
    cur = cur[p];
  }
  delete cur[parts[parts.length - 1]];
}

export function get(path) {
  return dotGet(load(), path);
}

export function set(path, value) {
  const state = load();
  dotSet(state, path, value);
  save();
}

export function remove(path) {
  const state = load();
  dotRemove(state, path);
  save();
}

// -------------------------------------------------------------
// Preferences (suite-wide)
// -------------------------------------------------------------
/** Read a suite-wide preference (theme, soundVolume, etc.).
 *  @template T
 *  @param {string} key
 *  @param {T} [defaultValue]
 *  @returns {T} */
export function getPreference(key, defaultValue) {
  const state = load();
  return state.preferences[key] !== undefined ? state.preferences[key] : defaultValue;
}

/** Persist a suite-wide preference.
 *  @param {string} key
 *  @param {unknown} value */
export function setPreference(key, value) {
  const state = load();
  state.preferences[key] = value;
  save();
}

// -------------------------------------------------------------
// Theme — three states ('auto' | 'light' | 'dark'), default 'auto'.
// 'auto' follows system preference (prefers-color-scheme); the others
// are explicit overrides set via <html data-theme="...">.
//
// applyTheme() is called eagerly at boot from each tool's entry point;
// setTheme() is called by the theme-toggle UI in each app.
//
// A 'themechange' window event is dispatched whenever the theme actually
// changes, so non-CSS consumers (Konva canvas in the seating chart) can
// re-render to match.
// -------------------------------------------------------------
const VALID_THEMES = ['auto', 'light', 'dark'];

/** Get the user's theme preference. Defaults to `'auto'` (follows OS).
 *  @returns {'auto' | 'light' | 'dark'} */
export function getTheme() {
  return getPreference('theme', 'auto');
}

/** Set + persist + apply the user's theme. Dispatches a `themechange` window
 *  event so canvas-based consumers (the seating chart's Konva layer) can
 *  re-render to match. Throws if `theme` is not one of the valid values.
 *  @param {'auto' | 'light' | 'dark'} theme */
export function setTheme(theme) {
  if (!VALID_THEMES.includes(theme)) {
    throw new Error(`Invalid theme "${theme}" — expected one of ${VALID_THEMES.join(', ')}`);
  }
  setPreference('theme', theme);
  applyTheme(theme);
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }
}

/** Apply a theme to `<html data-theme="...">` (DOM only — no persistence).
 *  Called eagerly at boot from each tool's entry point. Pass `'auto'` (or
 *  null/undefined) to remove the override and let CSS `prefers-color-scheme`
 *  decide.
 *  @param {'auto' | 'light' | 'dark' | null | undefined} theme */
export function applyTheme(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!theme || theme === 'auto') {
    root.removeAttribute('data-theme');
  } else if (theme === 'light' || theme === 'dark') {
    root.setAttribute('data-theme', theme);
  }
}

// -------------------------------------------------------------
// Rosters
// `getRoster` falls back to reading the seating chart's class blob if
// no explicit roster has been written for that classId. This lets
// future tools (a name picker) read names without requiring the
// seating chart to actively sync.
// -------------------------------------------------------------
/** Canonical roster (names) for a class. Falls back to the seating-chart
 *  blob if no explicit roster has been written.
 *  @param {string} classId
 *  @returns {string[]} */
export function getRoster(classId) {
  const state = load();
  if (state.rosters[classId]) return state.rosters[classId].slice();

  // Fallback: derive from seating chart's tool blob if available.
  const sc = state.tools && state.tools['seating-chart'];
  // Zustand persist wraps as { state: {...}, version: N }
  const inner = sc && sc.state ? sc.state : sc;
  if (inner && Array.isArray(inner.classes)) {
    const cls = inner.classes.find((c) => c && c.id === classId);
    if (cls && Array.isArray(cls.students)) {
      return cls.students.map((s) => s.name);
    }
  }
  return [];
}

/** Replace the canonical roster for a class. Idempotent — skipped when nothing
 *  changed. Drops tool metadata for any names that were removed. Dispatches
 *  `rosterchange` window event with `{ classId, names, added, removed }`.
 *  @param {string} classId
 *  @param {string[]} names */
export function setRoster(classId, names) {
  const state = load();
  if (!Array.isArray(names)) {
    throw new TypeError('setRoster: names must be an array of strings');
  }
  const next = names.slice();
  const previous = state.rosters[classId] ? state.rosters[classId].slice() : [];
  // Idempotency check — skip the write + event if nothing actually changed.
  if (
    previous.length === next.length &&
    previous.every((n, i) => n === next[i])
  ) {
    return;
  }
  state.rosters[classId] = next;

  // Compute additions and removals so listeners can do targeted updates
  // without re-reading the whole roster.
  const prevSet = new Set(previous);
  const nextSet = new Set(next);
  const added = next.filter((n) => !prevSet.has(n));
  const removed = previous.filter((n) => !nextSet.has(n));

  // Auto-cleanup: drop tool metadata for any names that were removed.
  if (removed.length > 0) {
    forEachToolStudentBucket(state, classId, (bucket) => {
      for (const name of removed) delete bucket[name];
    });
  }

  save();

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('rosterchange', {
        detail: { classId, names: next, added, removed },
      }),
    );
  }
}

/**
 * Thrown by `renameStudent` when the new name already exists in the class
 * (case-insensitive). Tools can detect this via `e.name === 'RosterDuplicateError'`.
 */
export class RosterDuplicateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RosterDuplicateError';
  }
}

/**
 * Rename one student in a class's roster. Migrates the call count and rekeys
 * every tool's per-student metadata (`tools[*].students[classId][name]`)
 * automatically — no per-tool cleanup wiring required. Dispatches a
 * `rosterrename` window event so subscribers can react.
 *
 * Idempotent: if `oldName === newName.trim()` or the class/oldName isn't
 * found, no event is dispatched.
 *
 * @param {string} classId
 * @param {string} oldName
 * @param {string} newName  Trimmed before use.
 * @returns {string}        The trimmed new name.
 * @throws {TypeError}            If either name is not a string.
 * @throws {Error}                If `newName` trims to empty.
 * @throws {RosterDuplicateError} If `newName` already exists in the class.
 */
export function renameStudent(classId, oldName, newName) {
  if (typeof oldName !== 'string' || typeof newName !== 'string') {
    throw new TypeError('renameStudent: names must be strings');
  }
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('renameStudent: new name cannot be empty');
  if (oldName === trimmed) return trimmed;

  const state = load();
  const names = state.rosters[classId];
  if (!Array.isArray(names)) return trimmed;
  const idx = names.indexOf(oldName);
  if (idx === -1) return trimmed;

  // Disallow duplicates within the class (case-insensitive).
  const lower = trimmed.toLowerCase();
  for (let i = 0; i < names.length; i++) {
    if (i !== idx && names[i].toLowerCase() === lower) {
      throw new RosterDuplicateError(`"${trimmed}" is already in this class.`);
    }
  }

  names[idx] = trimmed;

  // Migrate call counts under the new name.
  if (
    state.callCounts[classId] &&
    Object.prototype.hasOwnProperty.call(state.callCounts[classId], oldName)
  ) {
    const carry = state.callCounts[classId][oldName] || 0;
    delete state.callCounts[classId][oldName];
    state.callCounts[classId][trimmed] =
      (state.callCounts[classId][trimmed] || 0) + carry;
  }

  // Migrate tool metadata under the new name. Tools store per-student data
  // at tools[toolName].students[classId][name] — rekey each bucket.
  forEachToolStudentBucket(state, classId, (bucket) => {
    if (Object.prototype.hasOwnProperty.call(bucket, oldName)) {
      const existing = bucket[oldName];
      delete bucket[oldName];
      // If the new name already had metadata, preserve it (incoming wins for
      // any overlapping fields via shallow merge); otherwise just move.
      bucket[trimmed] = bucket[trimmed]
        ? { ...existing, ...bucket[trimmed] }
        : existing;
    }
  });

  save();

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('rosterrename', {
        detail: { classId, oldName, newName: trimmed },
      }),
    );
  }

  return trimmed;
}

export function listPeriods() {
  const state = load();
  // Union of explicit roster classIds, canonical class metadata, and seating-chart
  // class IDs (so classes from any source surface).
  const ids = new Set(Object.keys(state.rosters));
  if (state.classes) for (const id of Object.keys(state.classes)) ids.add(id);
  const sc = state.tools && state.tools['seating-chart'];
  const inner = sc && sc.state ? sc.state : sc;
  if (inner && Array.isArray(inner.classes)) {
    for (const c of inner.classes) if (c && c.id) ids.add(c.id);
  }
  return Array.from(ids);
}

// -------------------------------------------------------------
// Class metadata (suite-canonical "what's this class called?")
//
// Canonical class metadata lives at state.classes[classId] = { name }.
// Created by the picker, the suite Rosters page, and (from Phase B onward)
// mirrored by the seating chart. listClasses() unions canonical entries with
// any seating-chart-only classes so every tool can list them.
// -------------------------------------------------------------

/** Display name for a class. Canonical first; falls back to seating-chart blob.
 *  @param {string} classId
 *  @returns {string|null} */
export function getClassName(classId) {
  const state = load();
  // Canonical first.
  const canonical = state.classes && state.classes[classId];
  if (canonical && typeof canonical.name === 'string' && canonical.name) {
    return canonical.name;
  }
  // Fallback: read the seating chart's blob.
  const sc = state.tools && state.tools['seating-chart'];
  const inner = sc && sc.state ? sc.state : sc;
  if (inner && Array.isArray(inner.classes)) {
    const cls = inner.classes.find((c) => c && c.id === classId);
    if (cls && typeof cls.name === 'string' && cls.name) return cls.name;
  }
  return null;
}

/** Persist a canonical class name. Idempotent — a no-op when nothing changed.
 *  Dispatches `classmeta` window event with `{ classId, name, isNew, previousName }`.
 *  @param {string} classId
 *  @param {string} name */
export function setClassName(classId, name) {
  if (typeof name !== 'string') {
    throw new TypeError('setClassName: name must be a string');
  }
  const trimmed = name.trim();
  const state = load();
  if (!state.classes) state.classes = {};
  const isNew = !state.classes[classId];
  if (!state.classes[classId]) state.classes[classId] = {};
  const previousName = state.classes[classId].name;
  if (previousName === trimmed && !isNew) return;
  state.classes[classId].name = trimmed;
  save();
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('classmeta', {
        detail: { classId, name: trimmed, isNew, previousName },
      }),
    );
  }
}

/**
 * Returns every known class as `{ id, name, source }`. Source is:
 *   - 'canonical'      → the suite owns this class metadata
 *   - 'seating-chart'  → the class only exists in the seating chart's blob
 * If a class exists both canonically and in seating-chart, canonical wins.
 * @returns {{ id: string, name: string, source: 'canonical' | 'seating-chart' }[]}
 */
export function listClasses() {
  const state = load();
  const out = new Map(); // id -> { id, name, source }

  // Canonical first.
  if (state.classes) {
    for (const [id, meta] of Object.entries(state.classes)) {
      out.set(id, {
        id,
        name: (meta && meta.name) || '(unnamed)',
        source: 'canonical',
      });
    }
  }

  // Seating chart fallback.
  const sc = state.tools && state.tools['seating-chart'];
  const inner = sc && sc.state ? sc.state : sc;
  if (inner && Array.isArray(inner.classes)) {
    for (const c of inner.classes) {
      if (c && c.id && !out.has(c.id)) {
        out.set(c.id, {
          id: c.id,
          name: (c.name && String(c.name)) || '(unnamed)',
          source: 'seating-chart',
        });
      }
    }
  }

  return Array.from(out.values());
}

/**
 * Remove canonical class metadata + the canonical roster + call counts for
 * a classId, plus every tool's per-student bucket for that class. The
 * seating chart's own class blob is NOT touched here — when a class
 * originated in the seating chart, deletion has to happen there, and the
 * seating chart's mirror block then propagates the removal back to canonical.
 *
 * Idempotent: if nothing matches the classId anywhere, no event is
 * dispatched. Otherwise dispatches a `classdelete` window event with
 * `{ detail: { classId } }`.
 *
 * @param {string} classId
 */
export function deleteClass(classId) {
  const state = load();
  let changed = false;
  if (state.classes && state.classes[classId]) {
    delete state.classes[classId];
    changed = true;
  }
  if (state.rosters && state.rosters[classId]) {
    delete state.rosters[classId];
    changed = true;
  }
  if (state.callCounts && state.callCounts[classId]) {
    delete state.callCounts[classId];
    changed = true;
  }
  // Drop every tool's metadata bucket for this class.
  if (state.tools) {
    for (const toolName of Object.keys(state.tools)) {
      const tool = state.tools[toolName];
      if (tool && tool.students && tool.students[classId]) {
        delete tool.students[classId];
        changed = true;
      }
    }
  }
  if (changed) {
    save();
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('classdelete', { detail: { classId } }));
    }
  }
}

// -------------------------------------------------------------
// Call counts (for future name-picker fairness)
// -------------------------------------------------------------
/** Per-name call count for a class (used by the picker for fairness logic).
 *  @param {string} classId
 *  @param {string} name
 *  @returns {number} */
export function getCallCount(classId, name) {
  const state = load();
  const bucket = state.callCounts[classId];
  return bucket && typeof bucket[name] === 'number' ? bucket[name] : 0;
}

/** Increment a per-name call count and return the new value.
 *  @param {string} classId
 *  @param {string} name
 *  @returns {number} */
export function incrementCallCount(classId, name) {
  const state = load();
  if (!state.callCounts[classId]) state.callCounts[classId] = {};
  state.callCounts[classId][name] = (state.callCounts[classId][name] || 0) + 1;
  save();
  return state.callCounts[classId][name];
}

// -------------------------------------------------------------
// Tool state (opaque blob per tool)
// -------------------------------------------------------------
/** Get an opaque per-tool state blob. Each tool owns the shape of its blob.
 *  @template T
 *  @param {string} toolName
 *  @returns {T | null} */
export function getToolState(toolName) {
  const state = load();
  const v = state.tools[toolName];
  return v == null ? null : v;
}

/** Replace (or clear, when value == null) a tool's state blob.
 *  @param {string} toolName
 *  @param {unknown} value */
export function setToolState(toolName, value) {
  const state = load();
  if (value == null) {
    delete state.tools[toolName];
  } else {
    state.tools[toolName] = value;
  }
  save();
}

// -------------------------------------------------------------
// Tool metadata (per-student, keyed by canonical name)
//
// Convention: tools[toolName].students[classId][name] = arbitrary value.
// The seating chart's needsFrontRow / keepApart / notes are stored here
// (Phase B+ refactor); a future attendance tool's presentToday flag
// would live here too.
//
// Auto-maintenance:
//   renameStudent → tool metadata key migrates from oldName to newName
//   setRoster     → tool metadata for removed names is dropped
//   deleteClass   → all tool metadata for the classId is dropped
// Tools therefore don't need to wire up cleanup themselves.
// -------------------------------------------------------------

function ensureToolStudentBucket(state, toolName, classId) {
  if (!state.tools[toolName]) state.tools[toolName] = {};
  if (!state.tools[toolName].students) state.tools[toolName].students = {};
  if (!state.tools[toolName].students[classId]) state.tools[toolName].students[classId] = {};
  return state.tools[toolName].students[classId];
}

/**
 * Read a tool's per-student metadata. Storage path is
 * `state.tools[toolName].students[classId][name]`.
 *
 * @template T
 * @param {string} toolName
 * @param {string} classId
 * @param {string} name      Canonical roster name (matches `getRoster(classId)`).
 * @returns {T | undefined}  Undefined if the tool / class / name has no metadata yet.
 */
export function getToolMeta(toolName, classId, name) {
  const state = load();
  const tool = state.tools[toolName];
  if (!tool || !tool.students) return undefined;
  const bucket = tool.students[classId];
  if (!bucket) return undefined;
  return bucket[name];
}

/**
 * Replace a tool's per-student metadata for one name. Lazy-creates the
 * tool/class buckets — tools don't need to bootstrap any structure.
 *
 * Auto-cleanup: this metadata is dropped automatically by `setRoster` (when
 * the name is removed), `renameStudent` (rekeyed), and `deleteClass` (whole
 * class bucket removed). Tools therefore don't need their own cleanup hooks.
 *
 * @param {string} toolName
 * @param {string} classId
 * @param {string} name
 * @param {unknown} value
 */
export function setToolMeta(toolName, classId, name, value) {
  const state = load();
  const bucket = ensureToolStudentBucket(state, toolName, classId);
  bucket[name] = value;
  save();
}

/**
 * Shallow-merge a partial update into a tool's per-student metadata. If no
 * value exists yet, behaves like `setToolMeta(toolName, classId, name, patch)`.
 *
 * @param {string} toolName
 * @param {string} classId
 * @param {string} name
 * @param {object} patch
 */
export function patchToolMeta(toolName, classId, name, patch) {
  const state = load();
  const bucket = ensureToolStudentBucket(state, toolName, classId);
  bucket[name] = { ...(bucket[name] || {}), ...patch };
  save();
}

/**
 * Drop a tool's metadata for a single student. No-op if no metadata exists.
 *
 * @param {string} toolName
 * @param {string} classId
 * @param {string} name
 */
export function removeToolMeta(toolName, classId, name) {
  const state = load();
  const tool = state.tools[toolName];
  if (!tool || !tool.students || !tool.students[classId]) return;
  if (name in tool.students[classId]) {
    delete tool.students[classId][name];
    save();
  }
}

// Walk all tool blobs and apply a transform to each tool's per-student
// bucket for the given classId. Used internally by the canonical helpers
// below to keep tool metadata in lock-step with canonical changes.
function forEachToolStudentBucket(state, classId, transform) {
  if (!state.tools) return;
  for (const toolName of Object.keys(state.tools)) {
    const tool = state.tools[toolName];
    if (!tool || !tool.students || !tool.students[classId]) continue;
    transform(tool.students[classId]);
  }
}

// -------------------------------------------------------------
// Export / Import
// -------------------------------------------------------------
const EXPORT_FORMAT_ID = 'teachersdesk-classroom-export';
const EXPORT_FORMAT_VERSION = 1;

/**
 * Build a portable JSON snapshot of the user's data — preferences, rosters,
 * call counts, and every tool's blob. Use `downloadExport()` to push it as
 * a file the user can save; use `importClassroom()` to restore it.
 *
 * @returns {{
 *   format: 'teachersdesk-classroom-export',
 *   version: number,
 *   exportedAt: string,
 *   data: {
 *     rosters: object,
 *     callCounts: object,
 *     preferences: object,
 *     tools: object,
 *   }
 * }}
 */
export function exportClassroom() {
  const state = load();
  return {
    format: EXPORT_FORMAT_ID,
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      rosters: deepClone(state.rosters),
      callCounts: deepClone(state.callCounts),
      preferences: deepClone(state.preferences),
      tools: deepClone(state.tools),
    },
  };
}

/**
 * Import a previously-exported classroom JSON.
 *
 * @param {object} json   Parsed JSON (not a string). Must match the shape
 *                        produced by `exportClassroom()`.
 * @param {'replace' | 'merge'} [mode='replace']
 *   - `'replace'`: discard current state, install the import wholesale.
 *   - `'merge'`: per-key union — rosters union by classId (incoming wins on
 *      conflict), call counts sum, preferences shallow-merge (incoming wins),
 *      tool blobs use a tool-specific merge (`mergeToolState`).
 * @throws {ImportFormatError} If the payload is missing/wrong format, has no
 *   version, or was made with a newer suite version than this one.
 */
export function importClassroom(json, mode = 'replace') {
  if (!json || typeof json !== 'object') {
    throw new ImportFormatError('Import payload is not an object.');
  }
  if (json.format !== EXPORT_FORMAT_ID) {
    throw new ImportFormatError(
      `Unrecognized format. Expected "${EXPORT_FORMAT_ID}", got "${json.format}".`
    );
  }
  if (typeof json.version !== 'number') {
    throw new ImportFormatError('Missing or invalid version field.');
  }
  if (json.version > EXPORT_FORMAT_VERSION) {
    throw new ImportFormatError(
      `This export was made with a newer version of The Teacher's Desk (v${json.version}). Please update before importing.`
    );
  }

  const incoming = json.data || {};
  // Future: forward-migrate `incoming` if json.version < EXPORT_FORMAT_VERSION.

  if (mode === 'replace') {
    cache = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      preferences: deepClone(incoming.preferences || {}),
      rosters: deepClone(incoming.rosters || {}),
      callCounts: deepClone(incoming.callCounts || {}),
      tools: deepClone(incoming.tools || {}),
    };
    save();
    return;
  }

  if (mode === 'merge') {
    const current = load();

    // preferences: shallow merge, incoming wins
    current.preferences = { ...current.preferences, ...(incoming.preferences || {}) };

    // rosters: per-classId, incoming wins on conflict
    const inRosters = incoming.rosters || {};
    for (const classId of Object.keys(inRosters)) {
      current.rosters[classId] = (inRosters[classId] || []).slice();
    }

    // callCounts: per-classId per-name, sum
    const inCC = incoming.callCounts || {};
    for (const classId of Object.keys(inCC)) {
      if (!current.callCounts[classId]) current.callCounts[classId] = {};
      for (const name of Object.keys(inCC[classId])) {
        current.callCounts[classId][name] =
          (current.callCounts[classId][name] || 0) + (inCC[classId][name] || 0);
      }
    }

    // tools: tool-specific merge logic
    const inTools = incoming.tools || {};
    for (const toolName of Object.keys(inTools)) {
      current.tools[toolName] = mergeToolState(
        toolName,
        current.tools[toolName],
        inTools[toolName]
      );
    }

    save();
    return;
  }

  throw new ImportFormatError(`Unknown mode: ${mode}`);
}

function mergeToolState(toolName, existing, incoming) {
  if (!existing) return deepClone(incoming);
  if (!incoming) return existing;

  if (toolName === 'bingo') {
    // Union customSets by name; incoming wins on conflict.
    const exSets = Array.isArray(existing.customSets) ? existing.customSets : [];
    const inSets = Array.isArray(incoming.customSets) ? incoming.customSets : [];
    const byName = new Map();
    for (const s of exSets) if (s && s.name) byName.set(s.name, s);
    for (const s of inSets) if (s && s.name) byName.set(s.name, s);
    return {
      ...existing,
      ...incoming,
      customSets: Array.from(byName.values()),
      settings: { ...(existing.settings || {}), ...(incoming.settings || {}) },
    };
  }

  if (toolName === 'seating-chart') {
    // Zustand persist shape: { state: { classes, activeClassId, schemaVersion }, version }
    // Merge classes by id; incoming replaces duplicates; novel classes append.
    const exState = (existing && existing.state) || existing || {};
    const inState = (incoming && incoming.state) || incoming || {};
    const exClasses = Array.isArray(exState.classes) ? exState.classes : [];
    const inClasses = Array.isArray(inState.classes) ? inState.classes : [];
    const byId = new Map();
    for (const c of exClasses) if (c && c.id) byId.set(c.id, c);
    for (const c of inClasses) if (c && c.id) byId.set(c.id, c);
    const mergedState = {
      ...exState,
      ...inState,
      classes: Array.from(byId.values()),
    };
    // Preserve outer Zustand wrapper if present.
    if (existing && 'version' in existing) {
      return { ...existing, ...incoming, state: mergedState };
    }
    return mergedState;
  }

  // Default: shallow merge, incoming wins.
  return { ...existing, ...incoming };
}

/**
 * Trigger a browser download of the current classroom export. Wraps
 * `exportClassroom()` in a JSON Blob and clicks an anchor.
 *
 * Filename: `teachersdesk-classroom-YYYY-MM-DD.json`.
 */
export function downloadExport() {
  const payload = exportClassroom();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const today = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `teachersdesk-classroom-${today}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the click can resolve.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// -------------------------------------------------------------
// Utilities
// -------------------------------------------------------------
function deepClone(v) {
  if (v == null) return v;
  // structuredClone is broadly supported; fall back to JSON for older runtimes.
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

// For tests / debugging only — not part of the public API.
export function _resetCacheForTests() {
  cache = null;
  memoryFallback = null;
}

// Default export: convenience namespaced object.
export default {
  // low-level
  get,
  set,
  remove,
  // domain
  getPreference,
  setPreference,
  getTheme,
  setTheme,
  applyTheme,
  getRoster,
  setRoster,
  renameStudent,
  listPeriods,
  getClassName,
  setClassName,
  listClasses,
  deleteClass,
  getCallCount,
  incrementCallCount,
  getToolState,
  setToolState,
  getToolMeta,
  setToolMeta,
  patchToolMeta,
  removeToolMeta,
  // export/import
  exportClassroom,
  importClassroom,
  downloadExport,
  // errors
  StorageQuotaError,
  ImportFormatError,
  RosterDuplicateError,
};
