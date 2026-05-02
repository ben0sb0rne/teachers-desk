// =============================================================
// use-roster-bridge.ts — React hooks on top of /shared/roster-bridge.js.
//
// The vanilla bridge is the contract; these hooks just wrap its
// subscription primitives in useSyncExternalStore so React components
// re-render when canonical state changes.
//
// If a future tool also adopts React, lift these into shared/ — the
// implementation has nothing seating-chart-specific.
// =============================================================

import { useCallback, useSyncExternalStore } from "react";
import * as bridge from "@shared/roster-bridge.js";

interface ClassListEntry {
  id: string;
  name: string;
  source: "canonical" | "seating-chart";
}

/** All known classes (canonical + seating-chart fallback). Re-renders on
 *  any class metadata change (create / rename / delete). */
export function useClassList(): ClassListEntry[] {
  // We use a stable subscribe fn; the snapshot returns a fresh array each
  // time but we wrap with a referential-stability layer below.
  return useSyncExternalStore(subscribeToClasses, getClassesSnapshotRaw, getClassesSnapshotRaw);
}

let _classesCache: ClassListEntry[] = bridge.getClasses() as ClassListEntry[];
let _classesCacheKey = "";

function getClassesSnapshotRaw(): ClassListEntry[] {
  // useSyncExternalStore requires reference stability when nothing changed.
  // Compute a key from the underlying data; only refresh the cached array
  // when the key shifts.
  const list = bridge.getClasses() as ClassListEntry[];
  const key = list.map((c) => `${c.id}:${c.name}:${c.source}`).join("|");
  if (key !== _classesCacheKey) {
    _classesCache = list;
    _classesCacheKey = key;
  }
  return _classesCache;
}

function subscribeToClasses(cb: () => void): () => void {
  return bridge.onClassesChange(cb);
}

/** The canonical roster (string array of names) for a class. Re-renders
 *  on roster changes for that class, on cross-tab storage events. */
export function useClassRoster(classId: string | null | undefined): string[] {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (!classId) return () => {};
      return bridge.onRosterChange(classId, cb);
    },
    [classId],
  );
  const getSnapshot = useCallback(() => {
    if (!classId) return _emptyRoster;
    return getRosterSnapshot(classId);
  }, [classId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const _emptyRoster: string[] = [];
const _rosterCache: Record<string, { key: string; arr: string[] }> = {};

function getRosterSnapshot(classId: string): string[] {
  const arr = bridge.getRoster(classId) as string[];
  const key = arr.join("\n");
  const cached = _rosterCache[classId];
  if (!cached || cached.key !== key) {
    _rosterCache[classId] = { key, arr };
    return arr;
  }
  return cached.arr;
}

/** Per-student tool metadata, keyed by name. Returns the current value
 *  and a setter that writes through to canonical storage. */
export function useToolMeta<T>(
  toolName: string,
  classId: string | null | undefined,
  name: string | null | undefined,
): [T | undefined, (next: T) => void, (patch: Partial<T>) => void] {
  const subscribe = useCallback(
    (cb: () => void) => bridge.onAnyChange(cb),
    [],
  );
  const getSnapshot = useCallback((): T | undefined => {
    if (!classId || !name) return undefined;
    return bridge.getToolMeta(toolName, classId, name) as T | undefined;
  }, [toolName, classId, name]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const set = useCallback(
    (next: T) => {
      if (!classId || !name) return;
      bridge.setToolMeta(toolName, classId, name, next);
    },
    [toolName, classId, name],
  );

  const patch = useCallback(
    (delta: Partial<T>) => {
      if (!classId || !name) return;
      bridge.patchToolMeta(toolName, classId, name, delta as object);
    },
    [toolName, classId, name],
  );

  return [value, set, patch];
}
