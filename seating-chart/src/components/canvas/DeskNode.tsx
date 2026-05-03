import { useEffect, useLayoutEffect, useRef } from "react";
import { Group, Rect, Circle, Shape, Text } from "react-konva";
import type Konva from "konva";
import type { Desk, SeatId, Student, StudentId, ClassId } from "@/types";
import { useAppStore } from "@/store/appStore";
import { lightTokens } from "@/lib/theme-tokens";
import { deriveStroke, deriveTextColor } from "@/lib/color";

// DeskNode reads theme values statically because the desk's own slate fill
// (STROKE/FILL below) is hardcoded slate that doesn't flip — flipping the
// student-name text colour with the suite ink would put cream text on a
// light slate desk in dark mode and break contrast. If desks ever theme,
// migrate to useThemeTokens().
const ACCENT_BLUE = lightTokens.accentBlue;
const DOOR_FILL = lightTokens.doorFill;
const DOOR_STROKE = lightTokens.doorStroke;
const PAPER_EDGE = lightTokens.paperEdge;

interface Props {
  desk: Desk;
  selected: boolean;
  onSelect: (additive: boolean) => void;
  students: Student[];
  assignments: Record<SeatId, StudentId>;
  onSeatClick: (seatId: SeatId, screenX: number, screenY: number) => void;
  onDragStart: (deskId: string) => void;
  onDragMove: (deskId: string, x: number, y: number) => { x: number; y: number };
  onDragEnd: () => void;
  classId: ClassId;
  draggable: boolean;
  registerNode: (id: string, node: Konva.Group | null) => void;
}

const NAME_FONT_SIZE = 13;
const NAME_BOX_MAX_WIDTH = 96;
/** Tall enough for two wrapped lines (with verticalAlign="middle" they stay centered on the seat). */
const NAME_BOX_HEIGHT = NAME_FONT_SIZE * 2.4;
const NAME_BOX_MIN_WIDTH = 36;
const SEAT_DOT_RADIUS = 8;
const STROKE = "#334155";
const STROKE_SELECTED = ACCENT_BLUE;
const FILL = "#f8fafc";
const STROKE_WIDTH = 2;
const STROKE_WIDTH_SELECTED = 3;
const MIN_DESK_DIM = 40;
const FRONT_MARKER_RADIUS = 4;

/** For multi-circle, the name label is rendered INWARD from the seat
 *  position by this fraction of the radial distance to the disk center. The
 *  seat dot still sits at the rim — it's the label that gets pulled in, so
 *  the text fits inside the disk regardless of which sector it's in. */
const CIRCLE_LABEL_INWARD = 0.4;

/**
 * Per-kind name-box width for a single seat. Multi-rect cells are MODULE
 * wide, multi-square seats sit on a perimeter ~MODULE apart, multi-circle
 * seats are spaced by chord length 2·r·sin(π/n) at the LABEL radius (which
 * is pulled inward, see CIRCLE_LABEL_INWARD). Singles get the full box.
 */
function nameBoxWidth(desk: Desk): number {
  const seatCount = desk.seats.length;
  if (seatCount <= 1) return NAME_BOX_MAX_WIDTH;

  switch (desk.kind) {
    case "multi-rect": {
      const cols = desk.cols ?? 1;
      const cellW = desk.width / cols;
      return clampBox(cellW - 6);
    }
    case "multi-square": {
      // Seats live at the perimeter inset; the spacing between adjacent
      // seats on a side is desk.width / (perSide + 1) — that's the actual
      // budget per name. The previous desk.width / perSide formula was off
      // by one and let names spill into the next seat's space.
      const perSide = desk.perSide ?? 1;
      const cellW = desk.width / (perSide + 1);
      return clampBox(cellW - 8);
    }
    case "multi-circle": {
      // Labels sit at radius (1 − inward) × seatRadius. Use that radius to
      // size the chord between adjacent labels, so they stop colliding even
      // for tight seat counts.
      const r = desk.width * 0.42 * (1 - CIRCLE_LABEL_INWARD);
      const chord = 2 * r * Math.sin(Math.PI / seatCount);
      return clampBox(chord - 6);
    }
    default:
      return NAME_BOX_MAX_WIDTH;
  }
}

function clampBox(w: number): number {
  return Math.max(NAME_BOX_MIN_WIDTH, Math.min(NAME_BOX_MAX_WIDTH, Math.floor(w)));
}

/** Offset applied to a seat's NAME (not its dot) inside the seat group. For
 *  multi-circle desks we pull the name toward the disk center so it reads
 *  inside the rim instead of spilling off. Other kinds put the name right
 *  on the seat (offset 0). */
function nameOffset(desk: Desk, seatX: number, seatY: number): { x: number; y: number } {
  if (desk.kind !== "multi-circle") return { x: 0, y: 0 };
  const cx = desk.width / 2;
  const cy = desk.height / 2;
  return {
    x: (cx - seatX) * CIRCLE_LABEL_INWARD,
    y: (cy - seatY) * CIRCLE_LABEL_INWARD,
  };
}

/**
 * Where to place the per-desk front-row dot. For rectangular desks (incl.
 * multi-rect / multi-square / triangle) the inset top-right corner; for the
 * circle table, the upper-right point on the rim.
 */
function frontRowMarkerPos(desk: Desk): { x: number; y: number } {
  if (desk.kind === "multi-circle") {
    const cx = desk.width / 2;
    const cy = desk.height / 2;
    const r = desk.width / 2;
    // 45° above the +x axis on the rim.
    return { x: cx + r * Math.cos(-Math.PI / 4), y: cy + r * Math.sin(-Math.PI / 4) };
  }
  if (desk.kind === "single-triangle") {
    // Apex is at top-center; right-base corner reads as a "corner".
    return { x: desk.width - 6, y: desk.height - 8 };
  }
  return { x: desk.width - 6, y: 6 };
}

export default function DeskNode({
  desk,
  selected,
  onSelect,
  students,
  assignments,
  onSeatClick,
  onDragStart,
  onDragMove,
  onDragEnd,
  classId,
  draggable,
  registerNode,
}: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const updateDesk = useAppStore((s) => s.updateDesk);
  const setDeskFrontRow = useAppStore((s) => s.setDeskFrontRow);
  const setSeatFrontRow = useAppStore((s) => s.setSeatFrontRow);

  // Expose this Group to RoomStage's shared Transformer.
  useEffect(() => {
    registerNode(desk.id, groupRef.current);
    return () => registerNode(desk.id, null);
  }, [desk.id, registerNode]);

  // Override getClientRect so the Transformer + every other consumer sees
  // the desk's own (width × height) footprint — not the children union.
  // Konva's Transformer calls this with { skipTransform: true } and then
  // applies the node's own getAbsoluteTransform() to the result. The
  // critical detail: when skipTransform is true we MUST return bounds in
  // the node's LOCAL frame (no rotation, no scale, no translation). The
  // previous version of this override applied the rotation/scale itself,
  // which Konva then applied AGAIN — that was the actual root cause of
  // the misaligned single-select bbox bug.
  useLayoutEffect(() => {
    const node = groupRef.current;
    if (!node) return;
    type RectGetter = (config?: { skipTransform?: boolean; relativeTo?: Konva.Container }) => {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    (node as unknown as { getClientRect: RectGetter }).getClientRect = function (
      this: Konva.Group,
      config,
    ) {
      const w = desk.width;
      const h = desk.height;
      if (config?.skipTransform) {
        // Local-frame rect — caller will compose our transform on top.
        return { x: 0, y: 0, width: w, height: h };
      }
      // Otherwise (rare path; mostly drag-snapping use cases) apply the
      // node's transform ourselves so callers asking for parent-relative
      // coords still get a correct AABB.
      const x = this.x();
      const y = this.y();
      const sx = this.scaleX();
      const sy = this.scaleY();
      const rad = (this.rotation() * Math.PI) / 180;
      const cosR = Math.cos(rad);
      const sinR = Math.sin(rad);
      const corners: Array<[number, number]> = [
        [0, 0], [w * sx, 0], [w * sx, h * sy], [0, h * sy],
      ];
      const xs = corners.map(([lx, ly]) => x + lx * cosR - ly * sinR);
      const ys = corners.map(([lx, ly]) => y + lx * sinR + ly * cosR);
      const minX = Math.min.apply(null, xs);
      const maxX = Math.max.apply(null, xs);
      const minY = Math.min.apply(null, ys);
      const maxY = Math.max.apply(null, ys);
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    };
  });

  const allFront = desk.seats.length > 0 && desk.seats.every((s) => s.isFrontRow);
  const anyFront = desk.seats.some((s) => s.isFrontRow);
  const nameW = nameBoxWidth(desk);
  // Per-desk color override. The user's fill always wins — selection state
  // signals only via the stroke (thicker accent-blue) + the Transformer
  // handles. Replacing the fill with a "selected blue" was hiding whatever
  // color the user picked from the Color panel, making it impossible to see
  // the actual color while editing.
  const baseFill = desk.fill ?? FILL;
  const baseStroke = desk.fill ? deriveStroke(desk.fill) : STROKE;
  const fill = baseFill;
  const stroke = selected ? STROKE_SELECTED : baseStroke;
  const strokeWidth = selected ? STROKE_WIDTH_SELECTED : STROKE_WIDTH;
  const nameColor = desk.fill ? deriveTextColor(desk.fill) : PAPER_EDGE;
  const markerPos = frontRowMarkerPos(desk);

  return (
    <Group
      ref={groupRef}
      x={desk.x}
      y={desk.y}
      rotation={desk.rotation}
      draggable={draggable}
      onMouseDown={(e) => {
        e.cancelBubble = true;
        // Don't collapse a multi-selection on plain mousedown — the user
        // might be about to drag the whole group. We only force a fresh
        // single-select when the item isn't already in the selection.
        if (e.evt.shiftKey) onSelect(true);
        else if (!selected) onSelect(false);
      }}
      onTouchStart={(e) => {
        e.cancelBubble = true;
        if (!selected) onSelect(false);
      }}
      onClick={(e) => {
        e.cancelBubble = true;
        // If the user clicked (no drag) on a multi-selected item, collapse
        // the selection down to just this one — the standard design-tool
        // pattern for "I clicked, I want only this".
        if (!e.evt.shiftKey && selected) onSelect(false);
      }}
      onContextMenu={(e) => {
        e.evt.preventDefault();
        e.cancelBubble = true;
        setDeskFrontRow(classId, desk.id, !allFront);
      }}
      onDragStart={() => onDragStart(desk.id)}
      onDragMove={(e) => {
        const node = e.target;
        const snapped = onDragMove(desk.id, node.x(), node.y());
        node.x(snapped.x);
        node.y(snapped.y);
      }}
      onDragEnd={(e) => {
        updateDesk(classId, desk.id, { x: e.target.x(), y: e.target.y() });
        onDragEnd();
      }}
      onTransform={() => {
        // While the user is mid-resize, counter-scale each seat sub-Group so
        // the seat dot / student-name Text stays at its natural size and
        // shape. Without this, a non-uniform resize visibly stretches the
        // seat circles into ellipses until the drag ends.
        const node = groupRef.current;
        if (!node) return;
        const sx = node.scaleX();
        const sy = node.scaleY();
        const inverseX = sx === 0 ? 1 : 1 / sx;
        const inverseY = sy === 0 ? 1 : 1 / sy;
        for (const seatGroup of node.find(".seat-group")) {
          seatGroup.scaleX(inverseX);
          seatGroup.scaleY(inverseY);
        }
      }}
      onTransformEnd={() => {
        const node = groupRef.current;
        if (!node) return;
        const sx = node.scaleX();
        const sy = node.scaleY();
        const newWidth = Math.max(MIN_DESK_DIM, desk.width * sx);
        const newHeight = Math.max(MIN_DESK_DIM, desk.height * sy);
        const seats = desk.seats.map((seat) => ({
          ...seat,
          offsetX: seat.offsetX * sx,
          offsetY: seat.offsetY * sy,
        }));
        node.scaleX(1);
        node.scaleY(1);
        // Reset the per-seat counter-scale we applied during onTransform —
        // once the parent scale is committed to width/height, the seats
        // should render at natural scale again.
        for (const seatGroup of node.find(".seat-group")) {
          seatGroup.scaleX(1);
          seatGroup.scaleY(1);
        }
        updateDesk(classId, desk.id, {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          width: newWidth,
          height: newHeight,
          seats,
        });
      }}
    >
      <DeskShapeRenderer desk={desk} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />

      {desk.seats.map((seat) => {
        const studentId = assignments[seat.id];
        const student = studentId ? students.find((s) => s.id === studentId) : undefined;
        const labelShift = nameOffset(desk, seat.offsetX, seat.offsetY);
        return (
          <Group
            key={seat.id}
            name="seat-group"
            x={seat.offsetX}
            y={seat.offsetY}
            onMouseDown={(e) => {
              e.cancelBubble = true;
            }}
            onClick={(e) => {
              e.cancelBubble = true;
              const stage = e.target.getStage();
              const pos = stage?.getPointerPosition();
              if (pos) onSeatClick(seat.id, pos.x, pos.y);
            }}
            onTap={(e) => {
              e.cancelBubble = true;
              const stage = e.target.getStage();
              const pos = stage?.getPointerPosition();
              if (pos) onSeatClick(seat.id, pos.x, pos.y);
            }}
            onContextMenu={(e) => {
              e.evt.preventDefault();
              e.cancelBubble = true;
              setSeatFrontRow(classId, desk.id, seat.id, !seat.isFrontRow);
            }}
          >
            {!student ? (
              <Circle
                name="empty-seat-dot"
                radius={SEAT_DOT_RADIUS}
                fill="#ffffff"
                stroke="#94a3b8"
                strokeWidth={1.5}
              />
            ) : (
              <Text
                text={student.name}
                fontSize={NAME_FONT_SIZE}
                fontStyle="bold"
                fill={nameColor}
                width={nameW}
                height={NAME_BOX_HEIGHT}
                align="center"
                verticalAlign="middle"
                /* labelShift pulls the name inward for circle tables so it
                   reads inside the disk; zero for every other kind so the
                   label still centers on the seat. */
                x={labelShift.x}
                y={labelShift.y}
                offsetX={nameW / 2}
                offsetY={NAME_BOX_HEIGHT / 2}
                wrap="word"
                ellipsis
                listening
              />
            )}
          </Group>
        );
      })}

      {/* Per-desk front-row marker — sits at the desk's outer corner so it
          never crosses a name. We aggregate "any seat is front-row" into a
          single dot per desk; the underlying per-seat isFrontRow flags are
          still what the solver reads, so behavior is unchanged. */}
      {anyFront && (
        <Circle
          name="front-row-marker"
          x={markerPos.x}
          y={markerPos.y}
          radius={FRONT_MARKER_RADIUS}
          fill={DOOR_FILL}
          stroke={DOOR_STROKE}
          strokeWidth={0.5}
          listening={false}
        />
      )}
    </Group>
  );
}

function DeskShapeRenderer({
  desk,
  fill,
  stroke,
  strokeWidth,
}: {
  desk: Desk;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  switch (desk.kind) {
    case "single-rect":
    case "multi-rect":
    case "multi-square":
      return (
        <Rect
          x={0}
          y={0}
          width={desk.width}
          height={desk.height}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          cornerRadius={6}
        />
      );
    case "multi-circle":
      return (
        <Circle
          x={desk.width / 2}
          y={desk.height / 2}
          radius={desk.width / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    case "single-triangle": {
      const w = desk.width;
      const h = desk.height;
      const cornerR = 4;
      return (
        <Shape
          width={w}
          height={h}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          sceneFunc={(ctx, shape) => {
            const apex = { x: w / 2, y: 0 };
            const right = { x: w, y: h };
            const left = { x: 0, y: h };
            const dx = right.x - apex.x;
            const dy = right.y - apex.y;
            const len = Math.hypot(dx, dy);
            const startX = apex.x + (dx / len) * cornerR;
            const startY = apex.y + (dy / len) * cornerR;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.arcTo(right.x, right.y, left.x, left.y, cornerR);
            ctx.arcTo(left.x, left.y, apex.x, apex.y, cornerR);
            ctx.arcTo(apex.x, apex.y, right.x, right.y, cornerR);
            ctx.closePath();
            ctx.fillStrokeShape(shape);
          }}
        />
      );
    }
  }
}
