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
  /** Optional per-desk fill override. When set, stroke + name-text colors
   *  are derived automatically (lib/color.ts). Unset = use the default
   *  slate fill from DeskNode. */
  fill?: string;
}

export type Wall = "top" | "right" | "bottom" | "left";

export type FurnitureKind =
  | "teacher-desk"
  | "bookshelf"
  | "window"
  | "whiteboard"
  | "door"
  | "plant"
  | "chair"
  | "tv"
  | "screen"
  | "box"
  | "circle";

export type FurnitureId = string;

export interface Furniture {
  id: FurnitureId;
  kind: FurnitureKind;
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
  /** Window-only: how many sashes (defaults to 2 for backwards compat — gives one
   *  vertical divider, matching the previous hardcoded render). Drawn as
   *  paneCount-1 dividers spaced evenly along the window's long axis. */
  paneCount?: number;
  /** Optional per-object fill override. When set, stroke + label-text colors
   *  are derived from it via lib/color.ts (so the user only picks one color).
   *  Unset = use the kind's default fill from FURNITURE_DEFAULTS. */
  fill?: string;
  /** Box / circle: user-typed label drawn inside the shape. Other kinds
   *  ignore this field. */
  label?: string;
}

export interface Room {
  width: number;
  height: number;
  /** Which wall the teacher considers the "front" of the room. Defaults to "top". */
  frontWall: Wall;
  desks: Desk[];
  furniture: Furniture[];
  /** Optional canvas background color override. When set, the room-bg rect
   *  uses this fill (and the print export honors it). Unset = the suite's
   *  default cream paper. */
  background?: string;
  /** When true, peer-snap fires across desk + furniture (the pre-Phase-4
   *  behavior). Default (false / undefined) keeps each kind in its own
   *  alignment group — desks line up with desks, furniture with furniture.
   *  Room-center snap fires regardless of this flag. */
  advancedAlignment?: boolean;
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
