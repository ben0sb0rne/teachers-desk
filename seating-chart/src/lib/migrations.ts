import type { AppState, Arrangement, ClassRoom, Desk, Seat, Student } from "@/types";
import { SCHEMA_VERSION } from "@/types";

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
  return s as AppState;
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
    } as ClassRoom;
  });
  return {
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
    };
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
