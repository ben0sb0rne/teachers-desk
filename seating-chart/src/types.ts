export type ClassId = string;
export type StudentId = string;
export type DeskId = string;
export type SeatId = string;
export type ArrangementId = string;
export type RoomId = string;

export interface Student {
  id: StudentId;
  /** Display + canonical name (what the Wheel/Bingo read). When first/last are
   *  set it stays in sync as `${firstName} ${lastName}`.trim(). */
  name: string;
  /** Optional structured name parts — power the display modes + numbering. */
  firstName?: string;
  lastName?: string;
  /** Manual, free-text — a class number or an SIS id. */
  studentNumber?: string;
  /** The student's favorite color (hex, e.g. "#e63946"). Drives their
   *  marble + other per-student visuals suite-wide. Unset = the tools
   *  fall back to the auto palette (stable golden-angle hue by roster
   *  index) and the roster editor shows a clearly-unassigned grey. */
  favColor?: string;
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
  /** When true, Randomize skips this desk's seats — "don't seat here". Shown
   *  with a red corner dot. */
  excluded?: boolean;
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
  /** Stable id — rooms are a top-level, reusable collection (AppState.rooms).
   *  Many classes can reference one room by id; editing the room updates every
   *  class that uses it. */
  id: RoomId;
  /** Human-facing name shown in the Rooms list (e.g. "Lab 2", "My Classroom"). */
  name: string;
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

/** A class's seating in one room. A class can be taught in several rooms (e.g.
 *  Room 104 some days, the Library others); each room keeps its own independent
 *  seating. `currentAssignments` is the live working map; `arrangements` are the
 *  saved snapshots. Both are keyed by that room's seat ids. */
export interface RoomSeating {
  roomId: RoomId;
  currentAssignments: Record<SeatId, StudentId>;
  arrangements: Arrangement[];
}

/** How student names render on the chart — independent toggles for each piece,
 *  so a teacher composes exactly what shows. Unset on a class = DEFAULT_NAME_DISPLAY. */
export interface NameDisplay {
  /** Show the first name. */
  firstName: boolean;
  /** Show the full last name (wins over lastInitial when both are set). */
  lastName: boolean;
  /** Show the last name as an initial ("Chris R."). */
  lastInitial: boolean;
  /** Show the student number ("#7"). */
  studentNumber: boolean;
  /** Add a last initial only for students who share a first name (when no last
   *  name is otherwise shown). */
  autoInitial: boolean;
}

/** First name, with an auto last-initial only when first names clash. */
export const DEFAULT_NAME_DISPLAY: NameDisplay = {
  firstName: true,
  lastName: false,
  lastInitial: false,
  studentNumber: false,
  autoInitial: true,
};

export interface ClassRoom {
  id: ClassId;
  name: string;
  students: Student[];
  /** The rooms this class is taught in, each with its own seating. Empty = no
   *  room assigned yet. Order is display order; the first is the default. */
  seatings: RoomSeating[];
  /** Per-class chart name display. Unset = DEFAULT_NAME_DISPLAY. */
  nameDisplay?: NameDisplay;
  /** When true the roster is kept sorted by last name and studentNumber is
   *  auto-assigned 1..N on every roster mutation. Unset = off. */
  autoOrder?: boolean;
}

export const SCHEMA_VERSION = 13 as const;

export interface AppState {
  /** Top-level, reusable room layouts. Referenced by ClassRoom.seatings[].roomId. */
  rooms: Room[];
  classes: ClassRoom[];
  activeClassId: ClassId | null;
  schemaVersion: typeof SCHEMA_VERSION;
}
