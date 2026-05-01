import { useEffect, useRef } from "react";
import { Group, Rect, Circle, Shape, Text } from "react-konva";
import type Konva from "konva";
import type { Desk, SeatId, Student, StudentId, ClassId } from "@/types";
import { useAppStore } from "@/store/appStore";
import { ACCENT_BLUE, DOOR_FILL, DOOR_STROKE, PAPER_EDGE } from "@/lib/theme-tokens";

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
const NAME_BOX_WIDTH = 88;
/** Tall enough for two wrapped lines (with verticalAlign="middle" they stay centered on the seat). */
const NAME_BOX_HEIGHT = NAME_FONT_SIZE * 2.4;
const SEAT_DOT_RADIUS = 8;
const STROKE = "#334155";
const STROKE_SELECTED = ACCENT_BLUE;
const FILL = "#f8fafc";
const FILL_SELECTED = "#e0f2fe";
const STROKE_WIDTH = 2;
const STROKE_WIDTH_SELECTED = 3;
const MIN_DESK_DIM = 40;

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

  const allFront = desk.seats.length > 0 && desk.seats.every((s) => s.isFrontRow);
  const fill = selected ? FILL_SELECTED : FILL;
  const stroke = selected ? STROKE_SELECTED : STROKE;
  const strokeWidth = selected ? STROKE_WIDTH_SELECTED : STROKE_WIDTH;

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
        return (
          <Group
            key={seat.id}
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
                fill={PAPER_EDGE}
                width={NAME_BOX_WIDTH}
                height={NAME_BOX_HEIGHT}
                align="center"
                verticalAlign="middle"
                offsetX={NAME_BOX_WIDTH / 2}
                offsetY={NAME_BOX_HEIGHT / 2}
                listening
              />
            )}
            {seat.isFrontRow && (
              <Circle
                name="front-row-marker"
                x={SEAT_DOT_RADIUS + 4}
                y={-(SEAT_DOT_RADIUS + 4)}
                radius={3.5}
                fill={DOOR_FILL}
                stroke={DOOR_STROKE}
                strokeWidth={0.5}
              />
            )}
          </Group>
        );
      })}
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
