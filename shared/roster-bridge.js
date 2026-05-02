// =============================================================
// shared/roster-bridge.js
//
// The canonical-state subscription surface for every tool in the suite.
// Wraps shared/storage.js + the canonical DOM event bus into:
//
//   • subscription helpers (vanilla):
//       onClassesChange(cb)  — class created / renamed / deleted
//       onClassDelete(cb)    — single-event subset of the above
//       onRosterChange(classId, cb)
//       onRosterRename(classId, cb)  — fires (oldName, newName)
//       onAnyChange(cb)      — fires for any of the above
//
//   • snapshot reads (re-exports from storage for ergonomics):
//       getClasses()                   → [{ id, name, source }]
//       getRoster(classId)             → string[]
//       getCallCount(classId, name)    → number
//       getToolMeta(toolName, …)       → tool's per-student metadata
//
//   • cross-tab + same-tab unification: subscriptions fire for events
//     dispatched in this tab AND when localStorage is modified in
//     another tab (via the browser's `storage` event).
//
// Use this from ANY tool that needs to follow canonical state instead
// of polling. The seating chart's React hooks (use-roster-bridge.ts)
// build on top of this same vanilla module.
// =============================================================

import * as storage from './storage.js';

// -------------------------------------------------------------
// Snapshot re-exports (so consumers only import from one place)
// -------------------------------------------------------------
export const getClasses = storage.listClasses;
export const getRoster = storage.getRoster;
export const getClassName = storage.getClassName;
export const getCallCount = storage.getCallCount;
export const getToolMeta = storage.getToolMeta;
export const setClassName = storage.setClassName;
export const setRoster = storage.setRoster;
export const renameStudent = storage.renameStudent;
export const deleteClass = storage.deleteClass;
export const setToolMeta = storage.setToolMeta;
export const patchToolMeta = storage.patchToolMeta;
export const removeToolMeta = storage.removeToolMeta;
export const incrementCallCount = storage.incrementCallCount;

// -------------------------------------------------------------
// Subscriptions
// -------------------------------------------------------------

/**
 * Subscribe to any change in the suite-canonical class list:
 * creation, rename of class.name, deletion. Callback is invoked
 * with no args (call getClasses() to read fresh state).
 *
 * Returns an unsubscribe function.
 */
export function onClassesChange(cb) {
  return _subscribe(['classmeta', 'classdelete', 'storage'], cb);
}

/** Subscribe to class deletions specifically. Callback receives `{ classId }`. */
export function onClassDelete(cb) {
  function handler(e) {
    cb(e && e.detail ? e.detail : { classId: undefined });
  }
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('classdelete', handler);
  return () => window.removeEventListener('classdelete', handler);
}

/**
 * Subscribe to roster changes for a specific class. Callback receives
 * `{ names, added, removed }`. Fires when names are added/removed/reordered.
 *
 * If `classId` is `null`/`undefined`, subscribes to ALL classes' rosters.
 */
export function onRosterChange(classId, cb) {
  function handler(e) {
    const detail = e && e.detail;
    if (!detail) return;
    if (classId != null && detail.classId !== classId) return;
    cb(detail);
  }
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('rosterchange', handler);
  // Also fire on cross-tab storage events.
  function storageHandler() {
    const names = storage.getRoster(classId);
    cb({ classId, names, added: [], removed: [] });
  }
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener('rosterchange', handler);
    window.removeEventListener('storage', storageHandler);
  };
}

/**
 * Subscribe to per-name renames in a specific class. Callback receives
 * `(oldName, newName, detail)`. If `classId` is null, fires for all classes.
 */
export function onRosterRename(classId, cb) {
  function handler(e) {
    const detail = e && e.detail;
    if (!detail) return;
    if (classId != null && detail.classId !== classId) return;
    cb(detail.oldName, detail.newName, detail);
  }
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('rosterrename', handler);
  return () => window.removeEventListener('rosterrename', handler);
}

/**
 * Subscribe to ANY canonical change (classes, rosters, renames, deletes,
 * cross-tab storage events). Useful for tools that just want to refresh
 * their view on any change without caring about the type.
 */
export function onAnyChange(cb) {
  return _subscribe(
    ['classmeta', 'classdelete', 'rosterchange', 'rosterrename', 'storage'],
    cb,
  );
}

// -------------------------------------------------------------
// Internal: multi-event subscribe with a single off-handle
// -------------------------------------------------------------
function _subscribe(eventNames, cb) {
  if (typeof window === 'undefined') return () => {};
  function handler(e) {
    cb(e);
  }
  for (const name of eventNames) window.addEventListener(name, handler);
  return () => {
    for (const name of eventNames) window.removeEventListener(name, handler);
  };
}

export default {
  // snapshots
  getClasses,
  getRoster,
  getClassName,
  getCallCount,
  getToolMeta,
  setClassName,
  setRoster,
  renameStudent,
  deleteClass,
  setToolMeta,
  patchToolMeta,
  removeToolMeta,
  incrementCallCount,
  // subscriptions
  onClassesChange,
  onClassDelete,
  onRosterChange,
  onRosterRename,
  onAnyChange,
};
