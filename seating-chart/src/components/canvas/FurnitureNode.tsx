import { useEffect, useRef } from "react";
import { Group, Rect, Circle, Line, Shape, Text } from "react-konva";
import type Konva from "konva";
import type { ClassId, Furniture } from "@/types";
import { FURNITURE_DEFAULTS, furnitureLabel } from "@/lib/furniture";
import { useAppStore } from "@/store/appStore";
import { lightTokens } from "@/lib/theme-tokens";

interface Props {
  furniture: Furniture;
  selected: boolean;
  onSelect: (additive: boolean) => void;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, x: number, y: number) => { x: number; y: number };
  onDragEnd: () => void;
  classId: ClassId;
  draggable: boolean;
  registerNode: (id: string, node: Konva.Group | null) => void;
}

// accent-blue stays the same in light + dark modes, so a static reference is fine.
const STROKE_SELECTED = lightTokens.accentBlue;
// Allow furniture to stay genuinely thin. Default windows (h=14) and
// whiteboards (h=16) used to clamp UP to 24 the moment the user touched a
// resize handle, which made them visibly thicker. 8 keeps them workable
// without letting anything collapse to nothing.
const MIN_DIM = 8;

export default function FurnitureNode({
  furniture,
  selected,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  classId,
  draggable,
  registerNode,
}: Props) {
  const groupRef = useRef<Konva.Group>(null);
  const updateFurniture = useAppStore((s) => s.updateFurniture);

  useEffect(() => {
    registerNode(furniture.id, groupRef.current);
    return () => registerNode(furniture.id, null);
  }, [furniture.id, registerNode]);

  const def = FURNITURE_DEFAULTS[furniture.kind];
  const stroke = selected ? STROKE_SELECTED : def.stroke;
  const strokeWidth = selected ? 3 : 2;

  return (
    <Group
      ref={groupRef}
      x={furniture.x}
      y={furniture.y}
      rotation={furniture.rotation}
      draggable={draggable}
      onMouseDown={(e) => {
        e.cancelBubble = true;
        // Preserve a multi-selection on mousedown so RoomStage's multi-drag
        // can record all selected items' starting positions and move the
        // group together. Collapse on plain click instead (below).
        if (e.evt.shiftKey) onSelect(true);
        else if (!selected) onSelect(false);
      }}
      onTouchStart={(e) => {
        e.cancelBubble = true;
        if (!selected) onSelect(false);
      }}
      onClick={(e) => {
        e.cancelBubble = true;
        if (!e.evt.shiftKey && selected) onSelect(false);
      }}
      onDragStart={() => onDragStart(furniture.id)}
      onDragMove={(e) => {
        const node = e.target;
        const snapped = onDragMove(furniture.id, node.x(), node.y());
        node.x(snapped.x);
        node.y(snapped.y);
      }}
      onDragEnd={(e) => {
        updateFurniture(classId, furniture.id, { x: e.target.x(), y: e.target.y() });
        onDragEnd();
      }}
      onTransformEnd={() => {
        const node = groupRef.current;
        if (!node) return;
        const sx = node.scaleX();
        const sy = node.scaleY();
        const newWidth = Math.max(MIN_DIM, furniture.width * sx);
        const newHeight = Math.max(MIN_DIM, furniture.height * sy);
        node.scaleX(1);
        node.scaleY(1);
        updateFurniture(classId, furniture.id, {
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
          width: newWidth,
          height: newHeight,
        });
      }}
    >
      <FurnitureShape
        furniture={furniture}
        fill={def.fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
    </Group>
  );
}

function FurnitureShape({
  furniture,
  fill,
  stroke,
  strokeWidth,
}: {
  furniture: Furniture;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  const w = furniture.width;
  const h = furniture.height;
  switch (furniture.kind) {
    case "teacher-desk":
      return (
        <>
          <Rect
            x={0}
            y={0}
            width={w}
            height={h}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            cornerRadius={6}
          />
          <Text
            text="TEACHER"
            x={0}
            y={h / 2 - 7}
            width={w}
            align="center"
            fontSize={13}
            fontStyle="bold"
            fill="#3b2010"
            listening={false}
          />
        </>
      );
    case "bookshelf":
      return (
        <>
          <Rect
            x={0}
            y={0}
            width={w}
            height={h}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            cornerRadius={2}
          />
          <Line points={[0, h * 0.33, w, h * 0.33]} stroke={stroke} strokeWidth={1} listening={false} />
          <Line points={[0, h * 0.66, w, h * 0.66]} stroke={stroke} strokeWidth={1} listening={false} />
        </>
      );
    case "window": {
      // paneCount is the user-chosen sash count; default 2 keeps existing
      // windows visually unchanged (1 vertical divider). The dividers are
      // distributed evenly along the window's long axis (assumed +x; if the
      // user rotates the window 90°, the dividers rotate with it).
      const paneCount = furniture.paneCount ?? 2;
      const dividers: number[] = [];
      for (let i = 1; i < paneCount; i++) dividers.push((i / paneCount) * w);
      return (
        <>
          <Rect
            x={0}
            y={0}
            width={w}
            height={h}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          {dividers.map((dx, i) => (
            <Line
              key={i}
              points={[dx, 0, dx, h]}
              stroke={stroke}
              strokeWidth={1.5}
              listening={false}
            />
          ))}
        </>
      );
    }
    case "whiteboard":
      return (
        <Rect
          x={0}
          y={0}
          width={w}
          height={h}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          cornerRadius={1}
        />
      );
    case "door":
      return (
        <>
          {/* Wall the door is set into. */}
          <Line points={[0, 0, w, 0]} stroke={stroke} strokeWidth={3} listening={false} />
          {/* Swing arc + light fill (the path the door sweeps through). */}
          <Shape
            width={w}
            height={h}
            stroke={stroke}
            strokeWidth={strokeWidth}
            fill="rgba(245,245,245,0.5)"
            sceneFunc={(ctx, shape) => {
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(w, 0);
              ctx.arc(0, 0, w, 0, Math.PI / 2);
              ctx.closePath();
              ctx.fillStrokeShape(shape);
            }}
          />
          {/* The door panel itself, drawn in its open position (perpendicular
              to the wall, length = swing radius). Without this the symbol
              read as "wall + arc" rather than "door". */}
          <Rect
            x={-1.5}
            y={0}
            width={3}
            height={w}
            fill={stroke}
            listening={false}
          />
        </>
      );
    case "plant": {
      const radius = Math.min(w, h) / 2;
      return (
        <Circle
          x={w / 2}
          y={h / 2}
          radius={radius}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      );
    }
  }
}

export { furnitureLabel };
