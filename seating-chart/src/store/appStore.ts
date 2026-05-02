import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { temporal } from "zundo";
import * as sharedStorage from "@shared/storage.js";
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
  duplicateClass: (id: ClassId) => ClassId | null;
  setActiveClass: (id: ClassId | null) => void;

  addStudents: (classId: ClassId, names: string[]) => void;
  updateStudent: (classId: ClassId, studentId: StudentId, patch: Partial<Student>) => void;
  removeStudent: (classId: ClassId, studentId: StudentId) => void;
  toggleKeepApart: (classId: ClassId, a: StudentId, b: StudentId) => void;

  addDesk: (classId: ClassId, desk: Desk) => void;
  addDesks: (classId: ClassId, desks: Desk[]) => void;
  updateDesk: (classId: ClassId, deskId: DeskId, patch: Partial<Desk>) => void;
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

/** Pick a unique class name by suffixing " (copy)" / " (copy 2)" etc. */
function uniqueCopyName(state: AppState, base: string): string {
  const suffix = " (copy)";
  let candidate = `${base}${suffix}`;
  if (!nameExists(state, candidate)) return candidate;
  let n = 2;
  while (nameExists(state, `${base}${suffix.replace(")", "")} ${n})`)) n++;
  return `${base}${suffix.replace(")", "")} ${n})`;
}

/** Deep-clone a class, generating fresh IDs everywhere. Arrangement seat-ID
 * mappings are remapped so saved history still resolves to real seats. */
function cloneClass(src: ClassRoom, newName: string): ClassRoom {
  const newClassId = uid();

  // Build student id remap
  const studentIdMap = new Map<StudentId, StudentId>();
  const newStudents: Student[] = src.students.map((st) => {
    const newId = uid();
    studentIdMap.set(st.id, newId);
    return { ...st, id: newId, keepApart: [] };
  });
  // Pass 2: remap keepApart references
  newStudents.forEach((st, i) => {
    st.keepApart = src.students[i].keepApart
      .map((id) => studentIdMap.get(id))
      .filter((id): id is StudentId => !!id);
  });

  // Build seat id remap
  const seatIdMap = new Map<SeatId, SeatId>();
  const newDesks: Desk[] = src.room.desks.map((d) => ({
    ...d,
    id: uid(),
    seats: d.seats.map((s) => {
      const newSeatId = uid();
      seatIdMap.set(s.id, newSeatId);
      return { ...s, id: newSeatId };
    }),
  }));

  const newFurniture: Furniture[] = (src.room.furniture ?? []).map((f) => ({ ...f, id: uid() }));

  function remapAssignments(orig: Record<SeatId, StudentId>): Record<SeatId, StudentId> {
    const out: Record<SeatId, StudentId> = {};
    for (const [seatId, studentId] of Object.entries(orig)) {
      const newSeatId = seatIdMap.get(seatId);
      const newStudentId = studentIdMap.get(studentId);
      if (newSeatId && newStudentId) out[newSeatId] = newStudentId;
    }
    return out;
  }

  return {
    id: newClassId,
    name: newName,
    students: newStudents,
    room: {
      width: src.room.width,
      height: src.room.height,
      frontWall: src.room.frontWall,
      desks: newDesks,
      furniture: newFurniture,
    },
    arrangements: src.arrangements.map((a) => ({
      ...a,
      id: uid(),
      assignments: remapAssignments(a.assignments),
    })),
    currentAssignments: remapAssignments(src.currentAssignments ?? {}),
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

        duplicateClass: (id) => {
          const src = findClass(get(), id);
          if (!src) return null;
          const newName = uniqueCopyName(get(), src.name);
          const cloned = cloneClass(src, newName);
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
// Phase B: mirror seating-chart classes into the suite's canonical
// roster store (/shared/storage.js). Other tools (Picker, Rosters
// page) read from canonical, so this is what makes seating-chart
// classes show up there as if they were canonical, and stay in sync
// when the seating chart edits a roster.
//
// One-way: seating chart → canonical. The reverse (canonical →
// seating chart) is bigger work — picker/rosters-created classes
// don't appear in the seating chart in v1. The seating chart
// remains the only place rich Student metadata (needsFrontRow,
// keepApart, notes) is edited.
// ─────────────────────────────────────────────────────────────

function mirrorClassToShared(c: ClassRoom) {
  sharedStorage.setClassName(c.id, c.name);
  sharedStorage.setRoster(c.id, c.students.map((s) => s.name));
}

// Initial sync after hydration so existing data shows canonically right away.
{
  const initial = useAppStore.getState().classes;
  for (const c of initial) mirrorClassToShared(c);
}

let mirrorPrevClassIds = new Set(useAppStore.getState().classes.map((c) => c.id));

useAppStore.subscribe((state, prev) => {
  if (state.classes === prev.classes) return;

  const nextIds = new Set(state.classes.map((c) => c.id));

  // Class deletions: remove canonical entries.
  for (const id of mirrorPrevClassIds) {
    if (!nextIds.has(id)) sharedStorage.deleteClass(id);
  }

  // Re-mirror every class. Cheap on typical class sizes; the canonical
  // setRoster doesn't dispatch any cascading events.
  for (const c of state.classes) mirrorClassToShared(c);

  mirrorPrevClassIds = nextIds;
});

// Phase C: when a student is renamed via the suite Rosters page, the shared
// storage dispatches a 'rosterrename' window event so we can update the
// matching Student object's name (preserving its id, needsFrontRow,
// keepApart references, notes). Idempotent: if the seating chart originated
// the rename, the `oldName` is already gone and the .map() is a no-op.
if (typeof window !== "undefined") {
  window.addEventListener("rosterrename", (e: Event) => {
    const detail = (e as CustomEvent).detail as
      | { classId: string; oldName: string; newName: string }
      | undefined;
    if (!detail) return;
    const { classId, oldName, newName } = detail;
    useAppStore.setState((state) => ({
      classes: state.classes.map((c) => {
        if (c.id !== classId) return c;
        return {
          ...c,
          students: c.students.map((s) =>
            s.name === oldName ? { ...s, name: newName } : s,
          ),
        };
      }),
    }));
  });
}

export const selectClass = (id: ClassId | null) => (s: AppStore): ClassRoom | undefined =>
  id ? findClass(s, id) : undefined;

export const selectActiveClass = (s: AppStore): ClassRoom | undefined =>
  s.activeClassId ? findClass(s, s.activeClassId) : undefined;
