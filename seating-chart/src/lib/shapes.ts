import type { Desk, DeskKind, Seat } from "@/types";

const uid = () => crypto.randomUUID();

/** The base "single desk" module width. Multi-shape sizes derive from this. */
export const MODULE = 80;
/** Single desks are landscape rectangles: 100 wide x 60 tall. */
export const SINGLE_W = 100;
export const SINGLE_H = 60;

export interface MultiRectParams {
  rows: number;
  cols: number;
}
export interface MultiSquareParams {
  perSide: number;
}
export interface MultiCircleParams {
  seatCount: number;
}
export type ShapeParams = MultiRectParams | MultiSquareParams | MultiCircleParams | undefined;

export interface LaidOutShape {
  width: number;
  height: number;
  seats: Seat[];
}

/** Build a Desk for a given kind+params at the given position. */
export function makeDesk(kind: DeskKind, params: ShapeParams, x: number, y: number): Desk {
  const layout = layoutDesk(kind, params);
  const desk: Desk = {
    id: uid(),
    kind,
    x,
    y,
    rotation: 0,
    width: layout.width,
    height: layout.height,
    seats: layout.seats,
  };
  if (kind === "multi-rect") {
    const p = params as MultiRectParams;
    desk.rows = p.rows;
    desk.cols = p.cols;
  } else if (kind === "multi-square") {
    desk.perSide = (params as MultiSquareParams).perSide;
  } else if (kind === "multi-circle") {
    desk.seatCount = (params as MultiCircleParams).seatCount;
  }
  return desk;
}

/** Compute width, height, and seat positions for a desk kind+params. */
export function layoutDesk(kind: DeskKind, params: ShapeParams): LaidOutShape {
  switch (kind) {
    case "single-rect":
      return { width: SINGLE_W, height: SINGLE_H, seats: [seatAt(SINGLE_W / 2, SINGLE_H / 2)] };
    case "single-triangle": {
      // Squashed isoceles triangle: same bounding box as the rectangle desk.
      // Apex at top-center (W/2, 0); base spans the bottom edge from (0, H) to (W, H).
      // Centroid is at (W/2, 2H/3).
      return { width: SINGLE_W, height: SINGLE_H, seats: [seatAt(SINGLE_W / 2, (SINGLE_H * 2) / 3)] };
    }
    case "multi-rect":
      return layoutMultiRect(params as MultiRectParams);
    case "multi-square":
      return layoutMultiSquare(params as MultiSquareParams);
    case "multi-circle":
      return layoutMultiCircle(params as MultiCircleParams);
  }
}

function seatAt(x: number, y: number): Seat {
  return { id: uid(), offsetX: x, offsetY: y, isFrontRow: false };
}

function layoutMultiRect({ rows, cols }: MultiRectParams): LaidOutShape {
  const r = clamp(rows, 1, 10);
  const c = clamp(cols, 1, 10);
  // Width per column matches the module (80); height per row matches the
  // single rectangle desk (60). This keeps a 1-row table visually identical
  // in height to a row of single desks, and stacks nicely for multi-row.
  const width = c * MODULE;
  const height = r * SINGLE_H;
  const seats: Seat[] = [];
  for (let row = 0; row < r; row++) {
    for (let col = 0; col < c; col++) {
      seats.push(seatAt((col + 0.5) * MODULE, (row + 0.5) * SINGLE_H));
    }
  }
  return { width, height, seats };
}

function layoutMultiSquare({ perSide }: MultiSquareParams): LaidOutShape {
  const n = clamp(perSide, 1, 6);
  // (n + 1) intervals along each side gives each seat a full MODULE of edge.
  const side = (n + 1) * MODULE;
  const inset = MODULE / 4;
  const seats: Seat[] = [];
  // Top edge
  for (let i = 1; i <= n; i++) seats.push(seatAt((i / (n + 1)) * side, inset));
  // Right edge
  for (let i = 1; i <= n; i++) seats.push(seatAt(side - inset, (i / (n + 1)) * side));
  // Bottom edge (right to left so order goes clockwise)
  for (let i = 1; i <= n; i++) seats.push(seatAt((1 - i / (n + 1)) * side, side - inset));
  // Left edge (bottom to top)
  for (let i = 1; i <= n; i++) seats.push(seatAt(inset, (1 - i / (n + 1)) * side));
  return { width: side, height: side, seats };
}

function layoutMultiCircle({ seatCount }: MultiCircleParams): LaidOutShape {
  const n = clamp(seatCount, 3, 20);
  // Circumference per seat ~= MODULE; diameter follows from there.
  const diameter = Math.max(MODULE * 2, Math.ceil((n * MODULE) / Math.PI / 10) * 10);
  const cx = diameter / 2;
  const cy = diameter / 2;
  const r = diameter * 0.42;
  const seats: Seat[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    seats.push(seatAt(cx + r * Math.cos(angle), cy + r * Math.sin(angle)));
  }
  return { width: diameter, height: diameter, seats };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** True if the kind requires the user to pick parameters before placement. */
export function isMultiKind(kind: DeskKind): boolean {
  return kind === "multi-rect" || kind === "multi-square" || kind === "multi-circle";
}

/** Default params used for previews and as initial values in the params dialog. */
export function defaultParamsFor(kind: DeskKind): ShapeParams {
  switch (kind) {
    case "multi-rect":
      return { rows: 2, cols: 3 };
    case "multi-square":
      return { perSide: 2 };
    case "multi-circle":
      return { seatCount: 6 };
    default:
      return undefined;
  }
}

/**
 * Clone a desk with a fresh ID, fresh seat IDs, and an applied position offset.
 * Front-row tags are preserved. The new seats are guaranteed not to collide
 * with any existing seat IDs in any existing arrangement.
 */
export function cloneDeskWithFreshIds(desk: Desk, offsetX: number, offsetY: number): Desk {
  return {
    ...desk,
    id: uid(),
    x: desk.x + offsetX,
    y: desk.y + offsetY,
    seats: desk.seats.map((seat) => ({ ...seat, id: uid() })),
  };
}

/** Whether resize should constrain proportionally. True for symmetric shapes. */
export function shouldKeepRatio(kind: DeskKind): boolean {
  return kind === "multi-square" || kind === "multi-circle";
}
