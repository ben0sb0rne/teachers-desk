export type ClassId = string;
export type StudentId = string;
export type DeskId = string;
export type SeatId = string;
export type ArrangementId = string;

export interface Student {
  id: StudentId;
  name: string;
  needsFrontRow: boolean;
  keepApart: StudentId[];
  notes?: string;
}

export interface Seat {
  id: SeatId;
  offsetX: number;
  offsetY: number;
  isFrontRow: boolean;
}

export type DeskKind =
  | "single-rect"
  | "single-triangle"
  | "multi-rect"
  | "multi-square"
  | "multi-circle";

export interface Desk {
  id: DeskId;
  kind: DeskKind;
  x: number;
  y: number;
  rotation: number;
  /** Visual bounding box. Used for snap, hit-testing, and rendering. */
  width: number;
  height: number;
  /** Parameters for multi-* kinds. Omitted/ignored for single-* kinds. */
  rows?: number;        // multi-rect
  cols?: number;        // multi-rect
  perSide?: number;     // multi-square
  seatCount?: number;   // multi-circle
  seats: Seat[];
}

export type Wall = "top" | "right" | "bottom" | "left";

export type FurnitureKind =
  | "teacher-desk"
  | "bookshelf"
  | "window"
  | "whiteboard"
  | "door"
  | "plant";

export type FurnitureId = string;

export interface Furniture {
  id: FurnitureId;
  kind: FurnitureKind;
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
}

export interface Room {
  width: number;
  height: number;
  /** Which wall the teacher considers the "front" of the room. Defaults to "top". */
  frontWall: Wall;
  desks: Desk[];
  furniture: Furniture[];
}

export interface Arrangement {
  id: ArrangementId;
  createdAt: string;
  label?: string;
  assignments: Record<SeatId, StudentId>;
}

export interface ClassRoom {
  id: ClassId;
  name: string;
  students: Student[];
  room: Room;
  arrangements: Arrangement[];
  /** Live working seat map. Persisted (and undoable) per class. */
  currentAssignments: Record<SeatId, StudentId>;
}

export const SCHEMA_VERSION = 7 as const;

export interface AppState {
  classes: ClassRoom[];
  activeClassId: ClassId | null;
  schemaVersion: typeof SCHEMA_VERSION;
}
