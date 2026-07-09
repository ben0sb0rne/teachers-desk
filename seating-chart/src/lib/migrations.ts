import type { AppState, Arrangement, ClassRoom, Desk, NameDisplay, Room, Seat, Student } from "@/types";
import { SCHEMA_VERSION } from "@/types";
import * as sharedStorage from "@shared/storage.js";

const uid = () => crypto.randomUUID();

/**
 * Run the chain of schema migrations from `fromVersion` up to the current
 * `SCHEMA_VERSION`. Used both by Zustand `persist.migrate` (for localStorage)
 * and `lib/io.ts` (for imported JSON files).
 */
export function runMigrations(persisted: unknown, fromVersion: number): AppState {
  let s: unknown = persisted;
  if (fromVersion < 2) s = migrateV1toV2(s);
  if (fromVersion < 3) s = migrateV2toV3(s);
  if (fromVersion < 4) s = migrateV3toV4(s);
  if (fromVersion < 5) s = migrateV4toV5(s);
  if (fromVersion < 6) s = migrateV5toV6(s);
  if (fromVersion < 7) s = migrateV6toV7(s);
  if (fromVersion < 8) s = migrateV7toV8(s);
  if (fromVersion < 9) s = migrateV8toV9(s);
  if (fromVersion < 10) s = migrateV9toV10(s);
  if (fromVersion < 11) s = migrateV10toV11(s);
  if (fromVersion < 12) s = migrateV11toV12(s);
  return s as AppState;
}

/** v11 → v12: adds the optional per-class `autoOrder` flag (keep roster
 *  sorted by last name + auto-number). Absent means off — pass-through. */
export function migrateV11toV12(persisted: unknown): AppState {
  return persisted as AppState;
}

const MODE_TO_DISPLAY: Record<string, NameDisplay> = {
  collision: { firstName: true, lastName: false, lastInitial: false, studentNumber: false, autoInitial: true },
  first: { firstName: true, lastName: false, lastInitial: false, studentNumber: false, autoInitial: false },
  "first-initial": { firstName: true, lastName: false, lastInitial: true, studentNumber: false, autoInitial: false },
  full: { firstName: true, lastName: true, lastInitial: false, studentNumber: false, autoInitial: false },
  number: { firstName: false, lastName: false, lastInitial: false, studentNumber: true, autoInitial: false },
};

/** v10 → v11: the per-class `nameDisplay` enum becomes a set of independent
 *  toggles (NameDisplay). Map each old mode to the equivalent toggles; an unset
 *  mode stays unset (defaults applied at render). */
export function migrateV10toV11(persisted: unknown): AppState {
  const obj = persisted as Record<string, unknown>;
  const classes = (obj.classes ?? []) as Array<Record<string, unknown>>;
  const migrated = classes.map((klass) => {
    const nd = klass.nameDisplay;
    if (typeof nd !== "string") return klass;
    return { ...klass, nameDisplay: MODE_TO_DISPLAY[nd] };
  });
  return {
    rooms: (obj.rooms as Room[]) ?? [],
    classes: migrated as unknown as ClassRoom[],
    activeClassId: (obj.activeClassId as string | null) ?? null,
    schemaVersion: SCHEMA_VERSION,
  } as AppState;
}

/** v9 → v10: split each student's `name` into `firstName`/`lastName` on the
 *  first space. Lossless — `\`${firstName} ${lastName}\`.trim()` reconstructs
 *  the original `name`, so the canonical/display string (and the Wheel/Bingo
 *  rosters) are unchanged. Other new fields default unset. */
export function migrateV9toV10(persisted: unknown): AppState {
  const obj = persisted as Record<string, unknown>;
  const classes = (obj.classes ?? []) as Array<Record<string, unknown>>;
  const migratedClasses = classes.map((klass) => {
    const students = ((klass.students ?? []) as Array<Record<string, unknown>>).map((st) => {
      const full = ((st.name as string) ?? "").trim();
      const sp = full.indexOf(" ");
      return {
        ...st,
        firstName: sp === -1 ? full : full.slice(0, sp),
        lastName: sp === -1 ? "" : full.slice(sp + 1).trim(),
      };
    });
    return { ...klass, students };
  });
  return {
    rooms: (obj.rooms as Room[]) ?? [],
    classes: migratedClasses as unknown as ClassRoom[],
    activeClassId: (obj.activeClassId as string | null) ?? null,
    schemaVersion: SCHEMA_VERSION,
  } as AppState;
}

/** v8 → v9: a class can now be taught in multiple rooms. Replace the single
 *  `roomId` + top-level `currentAssignments`/`arrangements` with a `seatings[]`
 *  list (one entry per room, each carrying its own seating). Existing
 *  single-room classes become a one-entry list, preserving their seating;
 *  room-less classes become an empty list. */
export function migrateV8toV9(persisted: unknown): AppState {
  const obj = persisted as Record<string, unknown>;
  const classes = (obj.classes ?? []) as Array<Record<string, unknown>>;
  const migratedClasses = classes.map((klass) => {
    const roomId = (klass.roomId as string | null | undefined) ?? null;
    const seatings = roomId
      ? [
          {
            roomId,
            currentAssignments: (klass.currentAssignments as Record<string, string>) ?? {},
            arrangements: (klass.arrangements as unknown[]) ?? [],
          },
        ]
      : [];
    const rest: Record<string, unknown> = { ...klass };
    delete rest.roomId;
    delete rest.currentAssignments;
    delete rest.arrangements;
    return { ...rest, seatings } as unknown as ClassRoom;
  });
  return {
    rooms: (obj.rooms as Room[]) ?? [],
    classes: migratedClasses,
    activeClassId: (obj.activeClassId as string | null) ?? null,
    schemaVersion: SCHEMA_VERSION,
  } as AppState;
}

/** v7 → v8: promote each class's embedded `room` into a shared, top-level
 *  `rooms[]` collection and replace `class.room` with `class.roomId`. Desk,
 *  seat, and furniture ids are preserved exactly, so existing
 *  `currentAssignments` / `arrangements` (keyed by seat id) keep resolving.
 *  Each class gets its own room — no dedup of identical layouts; the user
 *  consolidates later by pointing classes at one room and deleting extras. */
export function migrateV7toV8(persisted: unknown): AppState {
  const obj = persisted as Record<string, unknown>;
  const classes = (obj.classes ?? []) as Array<Record<string, unknown>>;

  const rooms: Room[] = [];
  const usedNames = new Set<string>();
  const uniqueRoomName = (base: string): string => {
    let candidate = base;
    let n = 2;
    while (usedNames.has(candidate.toLowerCase())) candidate = `${base} (${n++})`;
    usedNames.add(candidate.toLowerCase());
    return candidate;
  };

  const migratedClasses = classes.map((klass) => {
    const className = (klass.name as string) ?? "Untitled class";
    const embedded = (klass.room ?? {
      width: 1000,
      height: 700,
      frontWall: "top",
      desks: [],
      furniture: [],
    }) as Record<string, unknown>;
    const roomId = uid();
    rooms.push({
      ...(embedded as object),
      id: roomId,
      name: uniqueRoomName(`${className} — room`),
      desks: (embedded.desks as unknown[]) ?? [],
      furniture: (embedded.furniture as unknown[]) ?? [],
    } as unknown as Room);

    // Drop the now-redundant embedded `room`; link by id instead.
    const rest: Record<string, unknown> = { ...klass };
    delete rest.room;
    return { ...rest, roomId } as unknown as ClassRoom;
  });

  return {
    rooms,
    classes: migratedClasses,
    activeClassId: (obj.activeClassId as string | null) ?? null,
    schemaVersion: SCHEMA_VERSION,
  };
}

/** v6 → v7: write each class's roster + name into the suite's canonical
 *  storage so the seating chart and other tools share the same source of
 *  truth for class metadata + roster names. The seating chart's blob keeps
 *  `students[]` (with rich metadata: needsFrontRow, keepApart, notes); the
 *  appStore reconciles names against canonical at boot from this point on. */
export function migrateV6toV7(persisted: unknown): AppState {
  const obj = persisted as Record<string, unknown>;
  const classes = (obj.classes ?? []) as Array<Record<string, unknown>>;

  for (const klass of classes) {
    const id = klass.id as string | undefined;
    const name = klass.name as string | undefined;
    const students = (klass.students ?? []) as Array<{ name?: string }>;
    if (!id) continue;
    if (typeof name === "string") {
      try {
        sharedStorage.setClassName(id, name);
      } catch {
        /* ignore */
      }
    }
    const roster = students.map((s) => (s && s.name ? s.name : "")).filter(Boolean);
    try {
      // Only write if canonical doesn't already have a richer roster — avoids
      // clobbering edits the user made via the Rosters page during the brief
      // window where Phase B's overwrite-on-hydration was live.
      const existing = sharedStorage.getRoster(id);
      if (existing.length < roster.length) {
        sharedStorage.setRoster(id, roster);
      } else if (existing.length === 0) {
        sharedStorage.setRoster(id, roster);
      }
    } catch {
      /* ignore */
    }
  }

  return {
    rooms: [], // populated by migrateV7toV8 (runs next in the chain)
    classes: classes as unknown as ClassRoom[],
    activeClassId: (obj.activeClassId as string | null) ?? null,
    schemaVersion: SCHEMA_VERSION,
  };
}

/** v5 → v6: each class gains `currentAssignments` (the live working seat map). */
export function migrateV5toV6(persisted: unknown): AppState {
  const obj = persisted as Record<string, unknown>;
  const classes = (obj.classes ?? []) as Array<Record<string, unknown>>;
  const migratedClasses = classes.map(
    (klass) =>
      ({
        ...(klass as object),
        currentAssignments: (klass.currentAssignments as Record<string, string>) ?? {},
      }) as unknown as ClassRoom,
  );
  return {
    // rooms[] is populated by migrateV7toV8 (the last step in the chain),
    // which lifts each class's still-embedded `room` into the shared list.
    rooms: [],
    classes: migratedClasses,
    activeClassId: (obj.activeClassId as string | null) ?? null,
    schemaVersion: SCHEMA_VERSION,
  };
}

/** v4 → v5: rooms gain a `furniture` array. */
export function migrateV4toV5(persisted: unknown): AppState {
  const obj = persisted as Record<string, unknown>;
  const classes = (obj.classes ?? []) as Array<Record<string, unknown>>;
  const migratedClasses = classes.map((klass) => {
    const room = (klass.room ?? {
      width: 1000,
      height: 700,
      frontWall: "top",
      desks: [],
      furniture: [],
    }) as Record<string, unknown>;
    return {
      ...(klass as object),
      room: {
        width: (room.width as number) ?? 1000,
        height: (room.height as number) ?? 700,
        frontWall: (room.frontWall as string) ?? "top",
        desks: (room.desks as unknown[]) ?? [],
        furniture: (room.furniture as unknown[]) ?? [],
      },
    } as unknown as ClassRoom;
  });
  return {
    // rooms[] is populated by migrateV7toV8 (the last step in the chain),
    // which lifts each class's still-embedded `room` into the shared list.
    rooms: [],
    classes: migratedClasses,
    activeClassId: (obj.activeClassId as string | null) ?? null,
    schemaVersion: SCHEMA_VERSION,
  };
}

/** v3 → v4: drop the "single-circle" desk kind, converting any to single-rect. */
export function migrateV3toV4(persisted: unknown): AppState {
  const obj = persisted as Record<string, unknown>;
  const classes = (obj.classes ?? []) as Array<Record<string, unknown>>;
  const migratedClasses = classes.map((klass) => {
    const room = (klass.room ?? { width: 1000, height: 700, frontWall: "top", desks: [] }) as Record<
      string,
      unknown
    >;
    const desks = ((room.desks as Array<Record<string, unknown>>) ?? []).map((d) =>
      d.kind === "single-circle" ? { ...d, kind: "single-rect" } : d,
    );
    return {
      ...(klass as object),
      room: {
        width: (room.width as number) ?? 1000,
        height: (room.height as number) ?? 700,
        frontWall: (room.frontWall as string) ?? "top",
        desks: desks as unknown[],
      },
    } as unknown as ClassRoom;
  });
  return {
    // rooms[] is populated by migrateV7toV8 (the last step in the chain),
    // which lifts each class's still-embedded `room` into the shared list.
    rooms: [],
    classes: migratedClasses,
    activeClassId: (obj.activeClassId as string | null) ?? null,
    schemaVersion: SCHEMA_VERSION,
  };
}

/** v2 → v3: rooms gain a `frontWall` field, default "top". */
export function migrateV2toV3(persisted: unknown): AppState {
  const obj = persisted as Record<string, unknown>;
  const classes = (obj.classes ?? []) as Array<Record<string, unknown>>;
  const migratedClasses = classes.map((klass) => {
    const room = (klass.room ?? { width: 1000, height: 700, desks: [] }) as Record<string, unknown>;
    return {
      ...(klass as object),
      room: {
        width: (room.width as number) ?? 1000,
        height: (room.height as number) ?? 700,
        frontWall: (room.frontWall as string) ?? "top",
        desks: (room.desks as unknown[]) ?? [],
      },
    } as unknown as ClassRoom;
  });
  return {
    // rooms[] is populated by migrateV7toV8 (the last step in the chain),
    // which lifts each class's still-embedded `room` into the shared list.
    rooms: [],
    classes: migratedClasses,
    activeClassId: (obj.activeClassId as string | null) ?? null,
    schemaVersion: SCHEMA_VERSION,
  };
}

/** v1 → v2: convert DeskShape-based desks to kind-on-Desk. */
export function migrateV1toV2(persisted: unknown): AppState {
  const obj = persisted as Record<string, unknown>;
  const classes = (obj.classes ?? []) as Array<Record<string, unknown>>;
  let droppedCustomShapes = 0;

  const migratedClasses: ClassRoom[] = classes.map((klass) => {
    const room = (klass.room ?? { width: 1000, height: 700, desks: [] }) as {
      width: number;
      height: number;
      desks: Array<Record<string, unknown>>;
    };
    const desks: Desk[] = (room.desks ?? []).map((d) =>
      migrateDeskV1(d, () => droppedCustomShapes++),
    );
    return {
      id: klass.id as string,
      name: klass.name as string,
      students: (klass.students as Student[]) ?? [],
      room: { width: room.width, height: room.height, frontWall: "top", desks, furniture: [] },
      arrangements: (klass.arrangements as Arrangement[]) ?? [],
      currentAssignments: {},
    } as unknown as ClassRoom;
  });

  if (droppedCustomShapes > 0 && typeof window !== "undefined") {
    setTimeout(() => {
      window.alert(
        `Note: ${droppedCustomShapes} custom-shape desk${droppedCustomShapes === 1 ? "" : "s"} from a previous version ` +
          `couldn't be migrated cleanly and were converted to single-student desks.`,
      );
    }, 500);
  }

  return {
    // rooms[] is populated by migrateV7toV8 (the last step in the chain),
    // which lifts each class's still-embedded `room` into the shared list.
    rooms: [],
    classes: migratedClasses,
    activeClassId: (obj.activeClassId as string | null) ?? null,
    schemaVersion: SCHEMA_VERSION,
  };
}

function migrateDeskV1(d: Record<string, unknown>, onCustomDropped: () => void): Desk {
  if (typeof d.kind === "string") return d as unknown as Desk;
  const shapeId = d.shapeId as string | undefined;
  const seats = (d.seats as Seat[]) ?? [];
  const x = (d.x as number) ?? 0;
  const y = (d.y as number) ?? 0;
  const rotation = (d.rotation as number) ?? 0;
  const id = (d.id as string) ?? uid();
  const base = { id, x, y, rotation, seats };

  switch (shapeId) {
    case "single":
      return { ...base, kind: "single-rect", width: 60, height: 50 };
    case "paired":
      return { ...base, kind: "multi-rect", width: 100, height: 40, rows: 1, cols: 2 };
    case "table-rect-4":
      return { ...base, kind: "multi-rect", width: 100, height: 80, rows: 2, cols: 2 };
    case "table-rect-6":
      return { ...base, kind: "multi-rect", width: 150, height: 80, rows: 2, cols: 3 };
    case "table-round-4":
      return { ...base, kind: "multi-circle", width: 120, height: 120, seatCount: 4 };
    case "table-round-6":
      return { ...base, kind: "multi-circle", width: 162, height: 162, seatCount: 6 };
    default:
      onCustomDropped();
      return { ...base, kind: "single-rect", width: 60, height: 50 };
  }
}
