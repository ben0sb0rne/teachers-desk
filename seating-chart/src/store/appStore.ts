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
  NameDisplayMode,
  Room,
  RoomId,
  RoomSeating,
  SeatId,
  Student,
  StudentId,
} from "@/types";
import { SCHEMA_VERSION } from "@/types";
import { runMigrations } from "@/lib/migrations";

const uid = () => crypto.randomUUID();

/** Split a display name into first/last on the first space (matches the v10
 *  migration). `${firstName} ${lastName}`.trim() reconstructs the input. */
function splitName(full: string): { firstName: string; lastName: string } {
  const f = full.trim();
  const sp = f.indexOf(" ");
  return sp === -1
    ? { firstName: f, lastName: "" }
    : { firstName: f.slice(0, sp), lastName: f.slice(sp + 1).trim() };
}

const DEFAULT_ROOM = (name: string): Room => ({
  id: uid(),
  name,
  width: 1000,
  height: 700,
  frontWall: "top",
  desks: [],
  furniture: [],
});

interface AppActions {
  // ── Classes (rosters) ──
  /** Create a roster. Name only — rooms are attached afterward (a class can
   *  hold several rooms, each with its own seating). */
  createClass: (name: string) => ClassId | null;
  renameClass: (id: ClassId, name: string) => boolean;
  deleteClass: (id: ClassId) => void;
  /** Attach a room to a class (no-op if already attached). The class gains an
   *  empty seating for that room. */
  addClassRoom: (classId: ClassId, roomId: RoomId) => void;
  /** Detach a room from a class, dropping that room's seating for the class.
   *  Caller confirms when there are assignments to lose. */
  removeClassRoom: (classId: ClassId, roomId: RoomId) => void;

  // ── Rooms (shared, reusable layouts) ──
  createRoom: (name: string) => RoomId | null;
  renameRoom: (roomId: RoomId, name: string) => boolean;
  /** Clone a room's layout (fresh desk / seat / furniture ids) into a new
   *  room. Touches no class. Returns the new room id, or null on name clash. */
  duplicateRoom: (roomId: RoomId, newName: string) => RoomId | null;
  /** Delete a room. Refused (ok:false) while any class still references it;
   *  the blocking class names come back so the UI can explain why. */
  deleteRoom: (roomId: RoomId) => { ok: boolean; blockedBy: string[] };

  addStudents: (
    classId: ClassId,
    entries: Array<{ firstName: string; lastName: string; studentNumber?: string }>,
  ) => void;
  updateStudent: (classId: ClassId, studentId: StudentId, patch: Partial<Student>) => void;
  /** Per-class chart name display mode. */
  setNameDisplay: (classId: ClassId, mode: NameDisplayMode) => void;
  removeStudent: (classId: ClassId, studentId: StudentId) => void;
  toggleKeepApart: (classId: ClassId, a: StudentId, b: StudentId) => void;

  // ── Room layout (keyed by roomId — shared across every class using it) ──
  addDesk: (roomId: RoomId, desk: Desk) => void;
  updateDesk: (roomId: RoomId, deskId: DeskId, patch: Partial<Desk>) => void;
  /** Apply many desk + furniture patches as a SINGLE store mutation. Used by
   *  multi-item handlers (align / distribute / flip / color) so the temporal
   *  middleware records one undo step per user action instead of N. */
  updateRoomItems: (
    roomId: RoomId,
    deskPatches: Record<DeskId, Partial<Desk>>,
    furniturePatches: Record<FurnitureId, Partial<Furniture>>,
  ) => void;
  /** Add many desks + furniture in a SINGLE store mutation. Used by paste +
   *  duplicate so a mixed-content paste is one undo step, not two. */
  addRoomItems: (roomId: RoomId, desks: Desk[], furniture: Furniture[]) => void;
  /** Remove desks from a room. Because rooms are shared, this also strips the
   *  removed seats from the seating of EVERY class that uses this room. */
  removeDesks: (roomId: RoomId, deskIds: DeskId[]) => void;
  updateRoom: (roomId: RoomId, patch: Partial<Room>) => void;
  setSeatFrontRow: (roomId: RoomId, deskId: DeskId, seatId: SeatId, value: boolean) => void;
  setDeskFrontRow: (roomId: RoomId, deskId: DeskId, value: boolean) => void;
  /** Toggle a desk's "don't seat here" flag (excluded from auto-seating). */
  setDeskExcluded: (roomId: RoomId, deskId: DeskId, value: boolean) => void;

  addFurniture: (roomId: RoomId, item: Furniture) => void;
  updateFurniture: (roomId: RoomId, furnitureId: FurnitureId, patch: Partial<Furniture>) => void;
  removeFurniture: (roomId: RoomId, furnitureIds: FurnitureId[]) => void;

  // ── Seating (keyed by class + room — each (class, room) seats independently) ──
  /** Update or clear a single seat assignment (and free that student from any other seat). */
  assignSeat: (classId: ClassId, roomId: RoomId, seatId: SeatId, studentId: StudentId | null) => void;
  /** Replace the entire current arrangement for one room (used by Randomize). */
  setAssignments: (classId: ClassId, roomId: RoomId, assignments: Record<SeatId, StudentId>) => void;
  /** Load a saved arrangement into the live working state for one room. */
  restoreArrangement: (classId: ClassId, roomId: RoomId, arrangementId: ArrangementId) => void;
  saveArrangement: (classId: ClassId, roomId: RoomId, label?: string) => { id: ArrangementId } | null;
  deleteArrangement: (classId: ClassId, roomId: RoomId, arrangementId: ArrangementId) => void;
  /** Update the human label of a saved arrangement. No-op if not found. Empty /
   *  whitespace-only labels resolve to undefined so the History UI shows
   *  "(untitled)" rather than a blank entry. */
  renameArrangement: (classId: ClassId, roomId: RoomId, arrangementId: ArrangementId, label: string) => void;

  replaceState: (next: AppState) => void;
}

export type AppStore = AppState & AppActions;

function findClass(state: AppState, id: ClassId): ClassRoom | undefined {
  return state.classes.find((c) => c.id === id);
}

function findRoom(state: AppState, id: RoomId | null | undefined): Room | undefined {
  return id ? state.rooms.find((r) => r.id === id) : undefined;
}

/** A class's seating for a given room (undefined if the class isn't in it). */
export function findSeating(c: ClassRoom, roomId: RoomId): RoomSeating | undefined {
  return c.seatings.find((se) => se.roomId === roomId);
}

/** Replace a class's seating for `roomId` via `mutate`; no-op if not present. */
function withSeating(c: ClassRoom, roomId: RoomId, mutate: (se: RoomSeating) => RoomSeating): ClassRoom {
  return { ...c, seatings: c.seatings.map((se) => (se.roomId === roomId ? mutate(se) : se)) };
}

function withClass(state: AppState, id: ClassId, mutate: (c: ClassRoom) => ClassRoom): AppState {
  return { ...state, classes: state.classes.map((c) => (c.id === id ? mutate(c) : c)) };
}

function withRoom(state: AppState, id: RoomId, mutate: (r: Room) => Room): AppState {
  return { ...state, rooms: state.rooms.map((r) => (r.id === id ? mutate(r) : r)) };
}

function nameExists(state: AppState, name: string, excludeId?: ClassId): boolean {
  const target = name.trim().toLowerCase();
  return state.classes.some(
    (c) => c.id !== excludeId && c.name.trim().toLowerCase() === target,
  );
}

function roomNameExists(state: AppState, name: string, excludeId?: RoomId): boolean {
  const target = name.trim().toLowerCase();
  return state.rooms.some(
    (r) => r.id !== excludeId && r.name.trim().toLowerCase() === target,
  );
}

/**
 * Clone a room's *layout* (desks, furniture, dimensions, front wall,
 * background, advanced-alignment toggle) into a brand-new Room with fresh ids
 * for the room itself and for every desk / seat / furniture item. The clone is
 * detached — no class references it until one is pointed at it.
 */
function cloneRoomLayout(src: Room, newName: string): Room {
  return {
    ...src,
    id: uid(),
    name: newName,
    desks: src.desks.map((d) => ({
      ...d,
      id: uid(),
      seats: d.seats.map((s) => ({ ...s, id: uid() })),
    })),
    furniture: (src.furniture ?? []).map((f) => ({ ...f, id: uid() })),
  };
}

export const useAppStore = create<AppStore>()(
  persist(
    temporal(
      (set, get) => ({
        rooms: [],
        classes: [],
        activeClassId: null,
        schemaVersion: SCHEMA_VERSION,

        createClass: (name) => {
          const trimmed = name.trim();
          if (!trimmed) return null;
          if (nameExists(get(), trimmed)) return null;
          const id = uid();
          const klass: ClassRoom = { id, name: trimmed, students: [], seatings: [] };
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

        addClassRoom: (classId, roomId) =>
          set((s) =>
            withClass(s, classId, (c) =>
              c.seatings.some((se) => se.roomId === roomId)
                ? c
                : { ...c, seatings: [...c.seatings, { roomId, currentAssignments: {}, arrangements: [] }] },
            ),
          ),

        removeClassRoom: (classId, roomId) =>
          set((s) =>
            withClass(s, classId, (c) => ({
              ...c,
              seatings: c.seatings.filter((se) => se.roomId !== roomId),
            })),
          ),

        createRoom: (name) => {
          const trimmed = name.trim();
          if (!trimmed) return null;
          if (roomNameExists(get(), trimmed)) return null;
          const room = DEFAULT_ROOM(trimmed);
          set((s) => ({ ...s, rooms: [...s.rooms, room] }));
          return room.id;
        },

        renameRoom: (roomId, name) => {
          const trimmed = name.trim();
          if (!trimmed) return false;
          if (roomNameExists(get(), trimmed, roomId)) return false;
          set((s) => withRoom(s, roomId, (r) => ({ ...r, name: trimmed })));
          return true;
        },

        duplicateRoom: (roomId, newName) => {
          const trimmed = newName.trim();
          if (!trimmed) return null;
          const src = findRoom(get(), roomId);
          if (!src) return null;
          if (roomNameExists(get(), trimmed)) return null;
          const cloned = cloneRoomLayout(src, trimmed);
          set((s) => ({ ...s, rooms: [...s.rooms, cloned] }));
          return cloned.id;
        },

        deleteRoom: (roomId) => {
          const blockedBy = get()
            .classes.filter((c) => c.seatings.some((se) => se.roomId === roomId))
            .map((c) => c.name);
          if (blockedBy.length > 0) return { ok: false, blockedBy };
          set((s) => ({ ...s, rooms: s.rooms.filter((r) => r.id !== roomId) }));
          return { ok: true, blockedBy: [] };
        },

        addStudents: (classId, entries) =>
          set((s) =>
            withClass(s, classId, (c) => {
              const fresh: Student[] = entries
                .map((e) => ({
                  firstName: (e.firstName ?? "").trim(),
                  lastName: (e.lastName ?? "").trim(),
                  studentNumber: e.studentNumber?.trim() || undefined,
                }))
                .filter((e) => e.firstName || e.lastName)
                .map((e) => ({
                  id: uid(),
                  name: `${e.firstName} ${e.lastName}`.trim(),
                  firstName: e.firstName || undefined,
                  lastName: e.lastName || undefined,
                  studentNumber: e.studentNumber,
                  needsFrontRow: false,
                  keepApart: [],
                }));
              return { ...c, students: [...c.students, ...fresh] };
            }),
          ),

        updateStudent: (classId, studentId, patch) =>
          set((s) =>
            withClass(s, classId, (c) => ({
              ...c,
              students: c.students.map((st) => {
                if (st.id !== studentId) return st;
                const next: Student = { ...st, ...patch };
                // Keep the canonical `name` in sync when first/last change so
                // the Wheel/Bingo rosters track the structured edit.
                if ("firstName" in patch || "lastName" in patch) {
                  const derived = `${next.firstName ?? ""} ${next.lastName ?? ""}`.trim();
                  if (derived) next.name = derived;
                }
                return next;
              }),
            })),
          ),

        setNameDisplay: (classId, mode) =>
          set((s) => withClass(s, classId, (c) => ({ ...c, nameDisplay: mode }))),

        removeStudent: (classId, studentId) =>
          set((s) =>
            withClass(s, classId, (c) => {
              const strip = (m: Record<SeatId, StudentId>): Record<SeatId, StudentId> => {
                const out: Record<SeatId, StudentId> = {};
                for (const [seat, sid] of Object.entries(m)) if (sid !== studentId) out[seat] = sid;
                return out;
              };
              return {
                ...c,
                students: c.students
                  .filter((st) => st.id !== studentId)
                  .map((st) => ({ ...st, keepApart: st.keepApart.filter((id) => id !== studentId) })),
                // Free the student from every room's seating for this class.
                seatings: c.seatings.map((se) => ({
                  ...se,
                  currentAssignments: strip(se.currentAssignments),
                  arrangements: se.arrangements.map((a) => ({ ...a, assignments: strip(a.assignments) })),
                })),
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

        addDesk: (roomId, desk) =>
          set((s) => withRoom(s, roomId, (r) => ({ ...r, desks: [...r.desks, desk] }))),

        updateRoom: (roomId, patch) =>
          set((s) => withRoom(s, roomId, (r) => ({ ...r, ...patch }))),

        updateDesk: (roomId, deskId, patch) =>
          set((s) =>
            withRoom(s, roomId, (r) => ({
              ...r,
              desks: r.desks.map((d) => (d.id === deskId ? { ...d, ...patch } : d)),
            })),
          ),

        updateRoomItems: (roomId, deskPatches, furniturePatches) =>
          set((s) =>
            withRoom(s, roomId, (r) => {
              const hasDeskPatches = Object.keys(deskPatches).length > 0;
              const hasFurniturePatches = Object.keys(furniturePatches).length > 0;
              if (!hasDeskPatches && !hasFurniturePatches) return r;
              return {
                ...r,
                desks: hasDeskPatches
                  ? r.desks.map((d) => (deskPatches[d.id] ? { ...d, ...deskPatches[d.id] } : d))
                  : r.desks,
                furniture: hasFurniturePatches
                  ? (r.furniture ?? []).map((f) =>
                      furniturePatches[f.id] ? { ...f, ...furniturePatches[f.id] } : f,
                    )
                  : r.furniture,
              };
            }),
          ),

        addRoomItems: (roomId, desks, furniture) =>
          set((s) =>
            withRoom(s, roomId, (r) => {
              if (desks.length === 0 && furniture.length === 0) return r;
              return {
                ...r,
                desks: desks.length ? [...r.desks, ...desks] : r.desks,
                furniture: furniture.length ? [...(r.furniture ?? []), ...furniture] : r.furniture,
              };
            }),
          ),

        removeDesks: (roomId, deskIds) =>
          set((s) => {
            const room = findRoom(s, roomId);
            if (!room) return s;
            const removedSeatIds = new Set(
              room.desks
                .filter((d) => deskIds.includes(d.id))
                .flatMap((d) => d.seats.map((seat) => seat.id)),
            );
            const nextRooms = s.rooms.map((r) =>
              r.id === roomId ? { ...r, desks: r.desks.filter((d) => !deskIds.includes(d.id)) } : r,
            );
            if (removedSeatIds.size === 0) return { ...s, rooms: nextRooms };

            // Shared room: strip the removed seats from this room's seating in
            // every class that uses it.
            const strip = (m: Record<SeatId, StudentId>): Record<SeatId, StudentId> => {
              const out: Record<SeatId, StudentId> = {};
              for (const [seat, sid] of Object.entries(m)) {
                if (!removedSeatIds.has(seat)) out[seat] = sid;
              }
              return out;
            };
            const nextClasses = s.classes.map((c) => {
              if (!c.seatings.some((se) => se.roomId === roomId)) return c;
              return {
                ...c,
                seatings: c.seatings.map((se) =>
                  se.roomId !== roomId
                    ? se
                    : {
                        ...se,
                        currentAssignments: strip(se.currentAssignments),
                        arrangements: se.arrangements.map((a) => ({ ...a, assignments: strip(a.assignments) })),
                      },
                ),
              };
            });
            return { ...s, rooms: nextRooms, classes: nextClasses };
          }),

        setSeatFrontRow: (roomId, deskId, seatId, value) =>
          set((s) =>
            withRoom(s, roomId, (r) => ({
              ...r,
              desks: r.desks.map((d) =>
                d.id === deskId
                  ? { ...d, seats: d.seats.map((seat) => (seat.id === seatId ? { ...seat, isFrontRow: value } : seat)) }
                  : d,
              ),
            })),
          ),

        setDeskFrontRow: (roomId, deskId, value) =>
          set((s) =>
            withRoom(s, roomId, (r) => ({
              ...r,
              desks: r.desks.map((d) =>
                d.id === deskId ? { ...d, seats: d.seats.map((seat) => ({ ...seat, isFrontRow: value })) } : d,
              ),
            })),
          ),

        setDeskExcluded: (roomId, deskId, value) =>
          set((s) =>
            withRoom(s, roomId, (r) => ({
              ...r,
              desks: r.desks.map((d) => (d.id === deskId ? { ...d, excluded: value } : d)),
            })),
          ),

        addFurniture: (roomId, item) =>
          set((s) =>
            withRoom(s, roomId, (r) => ({ ...r, furniture: [...(r.furniture ?? []), item] })),
          ),

        updateFurniture: (roomId, furnitureId, patch) =>
          set((s) =>
            withRoom(s, roomId, (r) => ({
              ...r,
              furniture: (r.furniture ?? []).map((f) =>
                f.id === furnitureId ? { ...f, ...patch } : f,
              ),
            })),
          ),

        removeFurniture: (roomId, furnitureIds) =>
          set((s) =>
            withRoom(s, roomId, (r) => ({
              ...r,
              furniture: (r.furniture ?? []).filter((f) => !furnitureIds.includes(f.id)),
            })),
          ),

        assignSeat: (classId, roomId, seatId, studentId) =>
          set((s) =>
            withClass(s, classId, (c) =>
              withSeating(c, roomId, (se) => {
                const next: Record<SeatId, StudentId> = { ...se.currentAssignments };
                if (studentId === null) {
                  delete next[seatId];
                } else {
                  // Free this student from any other seat in this room first.
                  for (const [sid, st] of Object.entries(next)) {
                    if (st === studentId) delete next[sid];
                  }
                  next[seatId] = studentId;
                }
                return { ...se, currentAssignments: next };
              }),
            ),
          ),

        setAssignments: (classId, roomId, assignments) =>
          set((s) =>
            withClass(s, classId, (c) =>
              withSeating(c, roomId, (se) => ({ ...se, currentAssignments: { ...assignments } })),
            ),
          ),

        restoreArrangement: (classId, roomId, arrangementId) =>
          set((s) =>
            withClass(s, classId, (c) =>
              withSeating(c, roomId, (se) => {
                const arr = se.arrangements.find((a) => a.id === arrangementId);
                return arr ? { ...se, currentAssignments: { ...arr.assignments } } : se;
              }),
            ),
          ),

        saveArrangement: (classId, roomId, label) => {
          const klass = findClass(get(), classId);
          const seating = klass ? findSeating(klass, roomId) : undefined;
          if (!seating || Object.keys(seating.currentAssignments).length === 0) return null;
          const id = uid();
          const arr: Arrangement = {
            id,
            createdAt: new Date().toISOString(),
            label,
            assignments: { ...seating.currentAssignments },
          };
          set((s) =>
            withClass(s, classId, (c) =>
              withSeating(c, roomId, (se) => ({ ...se, arrangements: [arr, ...se.arrangements] })),
            ),
          );
          return { id };
        },

        deleteArrangement: (classId, roomId, arrangementId) =>
          set((s) =>
            withClass(s, classId, (c) =>
              withSeating(c, roomId, (se) => ({
                ...se,
                arrangements: se.arrangements.filter((a) => a.id !== arrangementId),
              })),
            ),
          ),

        renameArrangement: (classId, roomId, arrangementId, label) =>
          set((s) =>
            withClass(s, classId, (c) =>
              withSeating(c, roomId, (se) => {
                const trimmed = label.trim();
                const nextLabel = trimmed.length > 0 ? trimmed : undefined;
                return {
                  ...se,
                  arrangements: se.arrangements.map((a) =>
                    a.id === arrangementId ? { ...a, label: nextLabel } : a,
                  ),
                };
              }),
            ),
          ),

        replaceState: (next) => set(() => ({ ...next })),
      }),
      {
        limit: 100,
        partialize: (state) => ({ rooms: state.rooms, classes: state.classes }),
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
// keepApart, notes) and the room/seating geometry; the appStore
// reconciles its `students[]` array against canonical at boot and on
// every canonical event so wheel/rosters-page edits propagate into
// the seating chart immediately.
//
// Rooms are NOT part of canonical — they're seating-chart-internal — so
// the mirror below only watches `state.classes`, and pure room-layout
// edits never touch canonical storage.
//
// Loop avoidance: a `suppressMirror` flag is set whenever we are
// updating local state IN RESPONSE to a canonical event. The mirror
// subscriber checks the flag and skips, so canonical → local → mirror
// → canonical never bounces.
// ─────────────────────────────────────────────────────────────

const seatingDefaultStudent = (name: string): Student => ({
  id: uid(),
  name,
  ...splitName(name),
  needsFrontRow: false,
  keepApart: [],
});

// A class synced in from canonical (created in the Wheel, the rosters page,
// an import, …) arrives with no rooms — the teacher attaches one in the
// seating chart. `seatings` is empty until then.
const seatingDefaultClass = (id: ClassId, name: string, names: string[]): ClassRoom => ({
  id,
  name,
  students: names.map(seatingDefaultStudent),
  seatings: [],
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
// shared/storage helpers don't bounce back into our own listeners. Pure room
// edits change `state.rooms` (not `state.classes`) and so skip this entirely.
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

export const selectRoom = (id: RoomId | null | undefined) => (s: AppStore): Room | undefined =>
  findRoom(s, id);
