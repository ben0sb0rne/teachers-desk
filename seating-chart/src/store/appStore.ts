import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { temporal } from "zundo";
import * as sharedStorage from "@shared/storage.js";
import * as rosterBridge from "@shared/roster-bridge.js";
import type {
  AppState,
  Arrangement,
  ArrangementId,
  ClassId,
  ClassRoom,
  Desk,
  DeskId,
  Furniture,
  FurnitureId,
  Room,
  Seat,
  SeatId,
  Student,
  StudentId,
} from "@/types";
import { SCHEMA_VERSION } from "@/types";
import { runMigrations } from "@/lib/migrations";

const uid = () => crypto.randomUUID();

const DEFAULT_ROOM = (): Room => ({
  width: 1000,
  height: 700,
  frontWall: "top",
  desks: [],
  furniture: [],
});

interface AppActions {
  createClass: (name: string) => ClassId | null;
  renameClass: (id: ClassId, name: string) => boolean;
  deleteClass: (id: ClassId) => void;
  /** Clone the source class's room layout into a fresh class with the given
   *  name. The new class has no students, no arrangements, and no current
   *  assignments. Returns the new class id, or null if the name collides. */
  duplicateRoom: (id: ClassId, newName: string) => ClassId | null;
  setActiveClass: (id: ClassId | null) => void;

  addStudents: (classId: ClassId, names: string[]) => void;
  updateStudent: (classId: ClassId, studentId: StudentId, patch: Partial<Student>) => void;
  removeStudent: (classId: ClassId, studentId: StudentId) => void;
  toggleKeepApart: (classId: ClassId, a: StudentId, b: StudentId) => void;

  addDesk: (classId: ClassId, desk: Desk) => void;
  addDesks: (classId: ClassId, desks: Desk[]) => void;
  updateDesk: (classId: ClassId, deskId: DeskId, patch: Partial<Desk>) => void;
  /** Apply many desk + furniture patches as a SINGLE store mutation. Used by
   *  multi-item handlers (align / distribute / flip / color) so the temporal
   *  middleware records one undo step per user action instead of N. */
  updateRoomItems: (
    classId: ClassId,
    deskPatches: Record<DeskId, Partial<Desk>>,
    furniturePatches: Record<FurnitureId, Partial<Furniture>>,
  ) => void;
  removeDesks: (classId: ClassId, deskIds: DeskId[]) => void;
  updateRoom: (classId: ClassId, patch: Partial<Room>) => void;
  setSeatFrontRow: (classId: ClassId, deskId: DeskId, seatId: SeatId, value: boolean) => void;
  setDeskFrontRow: (classId: ClassId, deskId: DeskId, value: boolean) => void;
  updateSeat: (classId: ClassId, deskId: DeskId, seatId: SeatId, patch: Partial<Seat>) => void;

  addFurniture: (classId: ClassId, item: Furniture) => void;
  addFurnitures: (classId: ClassId, items: Furniture[]) => void;
  updateFurniture: (classId: ClassId, furnitureId: FurnitureId, patch: Partial<Furniture>) => void;
  removeFurniture: (classId: ClassId, furnitureIds: FurnitureId[]) => void;

  /** Update or clear a single seat assignment (and free that student from any other seat). */
  assignSeat: (classId: ClassId, seatId: SeatId, studentId: StudentId | null) => void;
  /** Replace the entire current arrangement (used by Randomize). */
  setAssignments: (classId: ClassId, assignments: Record<SeatId, StudentId>) => void;
  /** Load a saved arrangement into the live working state. */
  restoreArrangement: (classId: ClassId, arrangementId: ArrangementId) => void;
  saveArrangement: (classId: ClassId, label?: string) => { id: ArrangementId } | null;
  deleteArrangement: (classId: ClassId, arrangementId: ArrangementId) => void;

  replaceState: (next: AppState) => void;
}

export type AppStore = AppState & AppActions;

function findClass(state: AppState, id: ClassId): ClassRoom | undefined {
  return state.classes.find((c) => c.id === id);
}

function withClass(state: AppState, id: ClassId, mutate: (c: ClassRoom) => ClassRoom): AppState {
  return { ...state, classes: state.classes.map((c) => (c.id === id ? mutate(c) : c)) };
}

function nameExists(state: AppState, name: string, excludeId?: ClassId): boolean {
  const target = name.trim().toLowerCase();
  return state.classes.some(
    (c) => c.id !== excludeId && c.name.trim().toLowerCase() === target,
  );
}

/**
 * Build a new ClassRoom that reuses the source class's *room layout* (desks,
 * furniture, dimensions, front wall, background, advanced-alignment toggle)
 * with fresh ids — and pairs it with an empty roster, no arrangements, and
 * no assignments. This is what the user wants when they say "I have one
 * physical classroom and 5 different periods": same desk layout, separate
 * lists of students and seating histories per period.
 *
 * A previous full-deep-clone variant existed (cloned the roster + history
 * too) but it wasn't useful in practice — duplicating with the same names
 * led to confusion and the seating history rarely transferred meaningfully.
 */
function cloneRoomOnly(src: ClassRoom, newName: string): ClassRoom {
  return {
    id: uid(),
    name: newName,
    students: [],
    room: {
      // Spread first so any Room field we add later (Phase 3 background,
      // Phase 4 advancedAlignment, …) automatically gets copied without
      // needing a code change here.
      ...src.room,
      desks: src.room.desks.map((d) => ({
        ...d,
        id: uid(),
        seats: d.seats.map((s) => ({ ...s, id: uid() })),
      })),
      furniture: (src.room.furniture ?? []).map((f) => ({ ...f, id: uid() })),
    },
    arrangements: [],
    currentAssignments: {},
  };
}

export const useAppStore = create<AppStore>()(
  persist(
    temporal(
      (set, get) => ({
        classes: [],
        activeClassId: null,
        schemaVersion: SCHEMA_VERSION,

        createClass: (name) => {
          const trimmed = name.trim();
          if (!trimmed) return null;
          if (nameExists(get(), trimmed)) return null;
          const id = uid();
          const klass: ClassRoom = {
            id,
            name: trimmed,
            students: [],
            room: DEFAULT_ROOM(),
            arrangements: [],
            currentAssignments: {},
          };
          set((s) => ({ ...s, classes: [...s.classes, klass], activeClassId: s.activeClassId ?? id }));
          return id;
        },

        renameClass: (id, name) => {
          const trimmed = name.trim();
          if (!trimmed) return false;
          if (nameExists(get(), trimmed, id)) return false;
          set((s) => withClass(s, id, (c) => ({ ...c, name: trimmed })));
          return true;
        },

        deleteClass: (id) =>
          set((s) => ({
            ...s,
            classes: s.classes.filter((c) => c.id !== id),
            activeClassId: s.activeClassId === id ? null : s.activeClassId,
          })),

        duplicateRoom: (id, newName) => {
          const trimmed = newName.trim();
          if (!trimmed) return null;
          const src = findClass(get(), id);
          if (!src) return null;
          if (nameExists(get(), trimmed)) return null;
          const cloned = cloneRoomOnly(src, trimmed);
          set((s) => ({ ...s, classes: [...s.classes, cloned] }));
          return cloned.id;
        },

        setActiveClass: (id) => set((s) => ({ ...s, activeClassId: id })),

        addStudents: (classId, names) =>
          set((s) =>
            withClass(s, classId, (c) => {
              const fresh: Student[] = names
                .map((n) => n.trim())
                .filter(Boolean)
                .map((name) => ({ id: uid(), name, needsFrontRow: false, keepApart: [] }));
              return { ...c, students: [...c.students, ...fresh] };
            }),
          ),

        updateStudent: (classId, studentId, patch) =>
          set((s) =>
            withClass(s, classId, (c) => ({
              ...c,
              students: c.students.map((st) => (st.id === studentId ? { ...st, ...patch } : st)),
            })),
          ),

        removeStudent: (classId, studentId) =>
          set((s) =>
            withClass(s, classId, (c) => {
              const cleanedAssignments: Record<SeatId, StudentId> = {};
              for (const [seat, sid] of Object.entries(c.currentAssignments ?? {})) {
                if (sid !== studentId) cleanedAssignments[seat] = sid;
              }
              return {
                ...c,
                students: c.students
                  .filter((st) => st.id !== studentId)
                  .map((st) => ({ ...st, keepApart: st.keepApart.filter((id) => id !== studentId) })),
                arrangements: c.arrangements.map((a) => {
                  const next: Record<SeatId, StudentId> = {};
                  for (const [seat, sid] of Object.entries(a.assignments)) {
                    if (sid !== studentId) next[seat] = sid;
                  }
                  return { ...a, assignments: next };
                }),
                currentAssignments: cleanedAssignments,
              };
            }),
          ),

        toggleKeepApart: (classId, a, b) =>
          set((s) =>
            withClass(s, classId, (c) => ({
              ...c,
              students: c.students.map((st) => {
                if (st.id === a) {
                  const has = st.keepApart.includes(b);
                  return { ...st, keepApart: has ? st.keepApart.filter((x) => x !== b) : [...st.keepApart, b] };
                }
                if (st.id === b) {
                  const has = st.keepApart.includes(a);
                  return { ...st, keepApart: has ? st.keepApart.filter((x) => x !== a) : [...st.keepApart, a] };
                }
                return st;
              }),
            })),
          ),

        addDesk: (classId, desk) =>
          set((s) => withClass(s, classId, (c) => ({ ...c, room: { ...c.room, desks: [...c.room.desks, desk] } }))),

        addDesks: (classId, desks) =>
          set((s) => withClass(s, classId, (c) => ({ ...c, room: { ...c.room, desks: [...c.room.desks, ...desks] } }))),

        updateRoom: (classId, patch) =>
          set((s) => withClass(s, classId, (c) => ({ ...c, room: { ...c.room, ...patch } }))),

        updateDesk: (classId, deskId, patch) =>
          set((s) =>
            withClass(s, classId, (c) => ({
              ...c,
              room: { ...c.room, desks: c.room.desks.map((d) => (d.id === deskId ? { ...d, ...patch } : d)) },
            })),
          ),

        updateRoomItems: (classId, deskPatches, furniturePatches) =>
          set((s) =>
            withClass(s, classId, (c) => {
              const hasDeskPatches = Object.keys(deskPatches).length > 0;
              const hasFurniturePatches = Object.keys(furniturePatches).length > 0;
              if (!hasDeskPatches && !hasFurniturePatches) return c;
              return {
                ...c,
                room: {
                  ...c.room,
                  desks: hasDeskPatches
                    ? c.room.desks.map((d) =>
                        deskPatches[d.id] ? { ...d, ...deskPatches[d.id] } : d,
                      )
                    : c.room.desks,
                  furniture: hasFurniturePatches
                    ? (c.room.furniture ?? []).map((f) =>
                        furniturePatches[f.id] ? { ...f, ...furniturePatches[f.id] } : f,
                      )
                    : c.room.furniture,
                },
              };
            }),
          ),

        removeDesks: (classId, deskIds) =>
          set((s) =>
            withClass(s, classId, (c) => {
              const remaining = c.room.desks.filter((d) => !deskIds.includes(d.id));
              const removedSeatIds = new Set(
                c.room.desks.filter((d) => deskIds.includes(d.id)).flatMap((d) => d.seats.map((seat) => seat.id)),
              );
              const cleanedCurrent: Record<SeatId, StudentId> = {};
              for (const [seat, sid] of Object.entries(c.currentAssignments ?? {})) {
                if (!removedSeatIds.has(seat)) cleanedCurrent[seat] = sid;
              }
              return {
                ...c,
                room: { ...c.room, desks: remaining },
                arrangements: c.arrangements.map((a) => {
                  const next: Record<SeatId, StudentId> = {};
                  for (const [seat, sid] of Object.entries(a.assignments)) {
                    if (!removedSeatIds.has(seat)) next[seat] = sid;
                  }
                  return { ...a, assignments: next };
                }),
                currentAssignments: cleanedCurrent,
              };
            }),
          ),

        setSeatFrontRow: (classId, deskId, seatId, value) =>
          set((s) =>
            withClass(s, classId, (c) => ({
              ...c,
              room: {
                ...c.room,
                desks: c.room.desks.map((d) =>
                  d.id === deskId
                    ? { ...d, seats: d.seats.map((seat) => (seat.id === seatId ? { ...seat, isFrontRow: value } : seat)) }
                    : d,
                ),
              },
            })),
          ),

        setDeskFrontRow: (classId, deskId, value) =>
          set((s) =>
            withClass(s, classId, (c) => ({
              ...c,
              room: {
                ...c.room,
                desks: c.room.desks.map((d) =>
                  d.id === deskId ? { ...d, seats: d.seats.map((seat) => ({ ...seat, isFrontRow: value })) } : d,
                ),
              },
            })),
          ),

        updateSeat: (classId, deskId, seatId, patch) =>
          set((s) =>
            withClass(s, classId, (c) => ({
              ...c,
              room: {
                ...c.room,
                desks: c.room.desks.map((d) =>
                  d.id === deskId
                    ? { ...d, seats: d.seats.map((seat) => (seat.id === seatId ? { ...seat, ...patch } : seat)) }
                    : d,
                ),
              },
            })),
          ),

        addFurniture: (classId, item) =>
          set((s) =>
            withClass(s, classId, (c) => ({
              ...c,
              room: { ...c.room, furniture: [...(c.room.furniture ?? []), item] },
            })),
          ),

        addFurnitures: (classId, items) =>
          set((s) =>
            withClass(s, classId, (c) => ({
              ...c,
              room: { ...c.room, furniture: [...(c.room.furniture ?? []), ...items] },
            })),
          ),

        updateFurniture: (classId, furnitureId, patch) =>
          set((s) =>
            withClass(s, classId, (c) => ({
              ...c,
              room: {
                ...c.room,
                furniture: (c.room.furniture ?? []).map((f) =>
                  f.id === furnitureId ? { ...f, ...patch } : f,
                ),
              },
            })),
          ),

        removeFurniture: (classId, furnitureIds) =>
          set((s) =>
            withClass(s, classId, (c) => ({
              ...c,
              room: {
                ...c.room,
                furniture: (c.room.furniture ?? []).filter((f) => !furnitureIds.includes(f.id)),
              },
            })),
          ),

        assignSeat: (classId, seatId, studentId) =>
          set((s) =>
            withClass(s, classId, (c) => {
              const next: Record<SeatId, StudentId> = { ...(c.currentAssignments ?? {}) };
              if (studentId === null) {
                delete next[seatId];
              } else {
                // Free this student from any other seat first.
                for (const [sid, st] of Object.entries(next)) {
                  if (st === studentId) delete next[sid];
                }
                next[seatId] = studentId;
              }
              return { ...c, currentAssignments: next };
            }),
          ),

        setAssignments: (classId, assignments) =>
          set((s) =>
            withClass(s, classId, (c) => ({ ...c, currentAssignments: { ...assignments } })),
          ),

        restoreArrangement: (classId, arrangementId) =>
          set((s) =>
            withClass(s, classId, (c) => {
              const arr = c.arrangements.find((a) => a.id === arrangementId);
              if (!arr) return c;
              return { ...c, currentAssignments: { ...arr.assignments } };
            }),
          ),

        saveArrangement: (classId, label) => {
          const klass = findClass(get(), classId);
          if (!klass || Object.keys(klass.currentAssignments ?? {}).length === 0) return null;
          const id = uid();
          const arr: Arrangement = {
            id,
            createdAt: new Date().toISOString(),
            label,
            assignments: { ...(klass.currentAssignments ?? {}) },
          };
          set((s) =>
            withClass(s, classId, (c) => ({ ...c, arrangements: [arr, ...c.arrangements] })),
          );
          return { id };
        },

        deleteArrangement: (classId, arrangementId) =>
          set((s) =>
            withClass(s, classId, (c) => ({
              ...c,
              arrangements: c.arrangements.filter((a) => a.id !== arrangementId),
            })),
          ),

        replaceState: (next) => set(() => ({ ...next })),
      }),
      {
        limit: 100,
        partialize: (state) => ({ classes: state.classes }),
      },
    ),
    {
      // The `name` is just a stable identifier inside Zustand now — the actual
      // localStorage key is owned by /shared/storage.js, which keeps the
      // seating chart state under data.tools["seating-chart"]. Renaming this
      // string would NOT migrate existing user data; legacy migration of the
      // old `seating-chart-designer:v1` key is handled by shared/storage.js
      // on first init.
      name: "seating-chart",
      version: SCHEMA_VERSION,
      migrate: (persisted, fromVersion) => runMigrations(persisted, fromVersion),
      storage: createJSONStorage(() => ({
        getItem: () => {
          const v = sharedStorage.getToolState("seating-chart");
          // Critical: return JSON string or null — NOT the string "null".
          return v == null ? null : JSON.stringify(v);
        },
        setItem: (_name, value) => {
          sharedStorage.setToolState("seating-chart", JSON.parse(value));
        },
        removeItem: () => {
          sharedStorage.setToolState("seating-chart", null);
        },
      })),
    },
  ),
);

// ─────────────────────────────────────────────────────────────
// CANONICAL SYNC — bidirectional
//
// The suite's canonical roster (in /shared/storage.js) is the single
// source of truth for class.name and the list of student names. The
// seating chart's blob owns rich per-student metadata (needsFrontRow,
// keepApart, notes) and the room/arrangements geometry; the appStore
// reconciles its `students[]` array against canonical at boot and on
// every canonical event so picker/rosters-page edits propagate into
// the seating chart immediately.
//
// Loop avoidance: a `suppressMirror` flag is set whenever we are
// updating local state IN RESPONSE to a canonical event. The mirror
// subscriber checks the flag and skips, so canonical → local → mirror
// → canonical never bounces.
// ─────────────────────────────────────────────────────────────

const seatingDefaultStudent = (name: string): Student => ({
  id: uid(),
  name,
  needsFrontRow: false,
  keepApart: [],
});

const seatingDefaultClass = (id: ClassId, name: string, names: string[]): ClassRoom => ({
  id,
  name,
  students: names.map(seatingDefaultStudent),
  room: DEFAULT_ROOM(),
  arrangements: [],
  currentAssignments: {},
});

let suppressMirror = false;

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Reconcile the local store with canonical storage:
 *   1. canonical class missing locally → add a default class (with derived students)
 *   2. local class missing canonically → drop it (canonical is source of truth)
 *   3. class in both → align local class.name + students[] to canonical roster.
 *      Preserves existing Student records by name (keeps their needsFrontRow,
 *      keepApart, notes); creates default Student records for new names.
 *
 * No-op if nothing differs. Wraps the local-store update in `suppressMirror`
 * so the mirror subscriber doesn't push the (now-canonical-aligned) state
 * back to canonical and re-trigger this listener.
 */
function reconcileWithCanonical(): void {
  if (typeof window === "undefined") return;
  const state = useAppStore.getState();
  const canonical = sharedStorage.listClasses();
  const canonicalIds = new Set(canonical.map((c) => c.id));

  let changed = false;
  let nextClasses: ClassRoom[] = state.classes.slice();

  // 1) Add canonical-only classes.
  for (const c of canonical) {
    if (!nextClasses.find((sc) => sc.id === c.id)) {
      const roster = sharedStorage.getRoster(c.id);
      nextClasses.push(seatingDefaultClass(c.id, c.name, roster));
      changed = true;
    }
  }

  // 2) Drop local classes not in canonical (deleted from canonical somewhere).
  const filtered = nextClasses.filter((sc) => canonicalIds.has(sc.id));
  if (filtered.length !== nextClasses.length) {
    nextClasses = filtered;
    changed = true;
  }

  // 3) Align name + students[] for classes in both.
  nextClasses = nextClasses.map((sc) => {
    const cEntry = canonical.find((c) => c.id === sc.id);
    if (!cEntry) return sc;
    const canonicalRoster = sharedStorage.getRoster(sc.id);
    const localNames = sc.students.map((s) => s.name);

    let updated = sc;
    if (cEntry.name && cEntry.name !== "(unnamed)" && cEntry.name !== sc.name) {
      updated = { ...updated, name: cEntry.name };
      changed = true;
    }
    if (!arraysEqual(localNames, canonicalRoster)) {
      const byName = new Map(sc.students.map((s) => [s.name, s]));
      const reconciled = canonicalRoster.map(
        (n) => byName.get(n) || seatingDefaultStudent(n),
      );
      updated = { ...updated, students: reconciled };
      changed = true;
    }
    return updated;
  });

  if (changed) {
    suppressMirror = true;
    try {
      useAppStore.setState({ classes: nextClasses });
    } finally {
      suppressMirror = false;
    }
  }
}

// Boot: align local with canonical before anything else.
reconcileWithCanonical();

// Subscriptions via shared/roster-bridge.js. The bridge is the canonical
// surface every tool should use to follow shared state — when a future
// tool needs the same shape, it imports from the bridge instead of
// reinventing this wiring.
rosterBridge.onRosterRename(null, (oldName, newName, detail) => {
  if (suppressMirror) return;
  suppressMirror = true;
  try {
    useAppStore.setState((state) => ({
      classes: state.classes.map((c) => {
        if (c.id !== detail.classId) return c;
        return {
          ...c,
          students: c.students.map((s) =>
            s.name === oldName ? { ...s, name: newName } : s,
          ),
        };
      }),
    }));
  } finally {
    suppressMirror = false;
  }
});

rosterBridge.onRosterChange(null, () => {
  if (suppressMirror) return;
  reconcileWithCanonical();
});

// Class metadata events still come direct from the storage event bus —
// the bridge models them as part of onClassesChange (which would re-trigger
// a full reconcile), but we want the targeted "name-only" path for renames
// vs. "full reconcile" for new classes.
if (typeof window !== "undefined") {
  window.addEventListener("classmeta", (e: Event) => {
    if (suppressMirror) return;
    const detail = (e as CustomEvent).detail as
      | { classId: string; name: string; isNew: boolean }
      | undefined;
    if (!detail) return;
    if (detail.isNew) {
      // A class was created elsewhere — let reconcile pick it up.
      reconcileWithCanonical();
    } else {
      suppressMirror = true;
      try {
        useAppStore.setState((state) => ({
          classes: state.classes.map((c) =>
            c.id === detail.classId ? { ...c, name: detail.name } : c,
          ),
        }));
      } finally {
        suppressMirror = false;
      }
    }
  });
}

rosterBridge.onClassDelete(({ classId }) => {
  if (suppressMirror) return;
  suppressMirror = true;
  try {
    useAppStore.setState((state) => ({
      classes: state.classes.filter((c) => c.id !== classId),
      activeClassId: state.activeClassId === classId ? null : state.activeClassId,
    }));
  } finally {
    suppressMirror = false;
  }
});

// Mirror local-store changes (user actions in seating chart) back to canonical.
// The whole block runs with suppressMirror true so any events dispatched by
// shared/storage helpers don't bounce back into our own listeners.
let mirrorPrevClassIds = new Set(useAppStore.getState().classes.map((c) => c.id));
useAppStore.subscribe((state, prev) => {
  if (suppressMirror) return;
  if (state.classes === prev.classes) return;

  suppressMirror = true;
  try {
    const nextIds = new Set(state.classes.map((c) => c.id));

    // Class deletions: remove canonical entries.
    for (const id of mirrorPrevClassIds) {
      if (!nextIds.has(id)) sharedStorage.deleteClass(id);
    }

    // Mirror name + roster. setClassName / setRoster are idempotent and
    // skip writes (and event dispatches) when nothing actually changed.
    for (const c of state.classes) {
      sharedStorage.setClassName(c.id, c.name);
      sharedStorage.setRoster(c.id, c.students.map((s) => s.name));
    }

    mirrorPrevClassIds = nextIds;
  } finally {
    suppressMirror = false;
  }
});

export const selectClass = (id: ClassId | null) => (s: AppStore): ClassRoom | undefined =>
  id ? findClass(s, id) : undefined;

export const selectActiveClass = (s: AppStore): ClassRoom | undefined =>
  s.activeClassId ? findClass(s, s.activeClassId) : undefined;
