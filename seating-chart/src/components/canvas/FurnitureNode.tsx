import { useEffect, useLayoutEffect, useRef } from "react";
import { Group, Rect, Circle, Line, Shape, Text } from "react-konva";
import type Konva from "konva";
import type { ClassId, Furniture } from "@/types";
import { FURNITURE_DEFAULTS, furnitureLabel } from "@/lib/furniture";
import { deriveStroke, deriveTextColor } from "@/lib/color";
import { useAppStore } from "@/store/appStore";
import { lightTokens } from "@/lib/theme-tokens";

interface Props {
  furniture: Furniture;
  selected: boolean;
  onSelect: (additive: boolean) => void;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, x: number, y: number) => { x: number; y: number };
  onDragEnd: () => void;
  /** Right-click on a box/circle prompts for a label. RoomDesigner owns the
   *  prompt UX so the canvas component stays presentational. */
  onRequestRename?: (id: string) => void;
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
  onRequestRename,
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

  // Same getClientRect override as DeskNode (see comment there for the full
  // rationale). Konva's Transformer queries with { skipTransform: true } and
  // composes our transform itself, so the local-frame branch is the one
  // that actually matters for selection bbox correctness.
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
      const w = furniture.width;
      const h = furniture.height;
      if (config?.skipTransform) {
        return { x: 0, y: 0, width: w, height: h };
      }
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
      return {
        x: Math.min.apply(null, xs),
        y: Math.min.apply(null, ys),
        width: Math.max.apply(null, xs) - Math.min.apply(null, xs),
        height: Math.max.apply(null, ys) - Math.min.apply(null, ys),
      };
    };
  });

  const def = FURNITURE_DEFAULTS[furniture.kind];
  // Per-object overrides: when a fill is set, derive stroke + text color
  // from it so the user only manages one channel and the result still has
  // the suite's "outline darker than fill" feel.
  const fill = furniture.fill ?? def.fill;
  const baseStroke = furniture.fill ? deriveStroke(fill) : def.stroke;
  const stroke = selected ? STROKE_SELECTED : baseStroke;
  const strokeWidth = selected ? 3 : 2;
  const textColor = deriveTextColor(fill);

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
      onContextMenu={(e) => {
        // Right-click on a labelable kind opens a rename prompt (handled by
        // RoomDesigner). Other kinds: pass through to the browser default.
        if (furniture.kind === "box" || furniture.kind === "circle") {
          e.evt.preventDefault();
          e.cancelBubble = true;
          onRequestRename?.(furniture.id);
        }
      }}
      onDblClick={(e) => {
        if (furniture.kind === "box" || furniture.kind === "circle") {
          e.cancelBubble = true;
          onRequestRename?.(furniture.id);
        }
      }}
      onDblTap={(e) => {
        if (furniture.kind === "box" || furniture.kind === "circle") {
          e.cancelBubble = true;
          onRequestRename?.(furniture.id);
        }
      }}
    >
      <FurnitureShape
        furniture={furniture}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        textColor={textColor}
      />
    </Group>
  );
}

function FurnitureShape({
  furniture,
  fill,
  stroke,
  strokeWidth,
  textColor,
}: {
  furniture: Furniture;
  fill: string;
  stroke: string;
  strokeWidth: number;
  /** Auto-derived text color used by labelled kinds (teacher-desk / box /
   *  circle). Comes from the shape's effective fill via lib/color.ts. */
  textColor: string;
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
            fill={textColor}
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
    case "chair":
      // A chair is just a small rounded rect — keeps the icon footprint
      // recognizable without burning render budget on a real silhouette.
      return (
        <Rect
          x={0}
          y={0}
          width={w}
          height={h}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          cornerRadius={3}
        />
      );
    case "tv": {
      // Outer bezel + a slightly inset darker screen panel, so the symbol
      // reads as "TV" even at small sizes.
      const inset = Math.min(2, Math.min(w, h) * 0.08);
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
            cornerRadius={1}
          />
          <Rect
            x={inset}
            y={inset}
            width={Math.max(0, w - inset * 2)}
            height={Math.max(0, h - inset * 2)}
            fill="#0b1220"
            listening={false}
          />
        </>
      );
    }
    case "screen": {
      // A wall-mounted projection screen: a thin rectangle with a small
      // pull-tab indicator on the front edge so it isn't confused with a
      // whiteboard.
      const tab = Math.min(6, h * 0.6);
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
            cornerRadius={1}
          />
          <Rect
            x={w / 2 - tab / 2}
            y={h - 1}
            width={tab}
            height={tab * 0.7}
            fill={stroke}
            listening={false}
          />
        </>
      );
    }
    case "box":
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
            cornerRadius={4}
          />
          {furniture.label ? (
            <Text
              text={furniture.label}
              x={0}
              y={0}
              width={w}
              height={h}
              align="center"
              verticalAlign="middle"
              fontSize={Math.max(11, Math.min(20, Math.min(w, h) * 0.18))}
              fontStyle="bold"
              fill={textColor}
              wrap="word"
              ellipsis
              padding={6}
              listening={false}
            />
          ) : null}
        </>
      );
    case "circle": {
      const radius = Math.min(w, h) / 2;
      return (
        <>
          <Circle
            x={w / 2}
            y={h / 2}
            radius={radius}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          {furniture.label ? (
            <Text
              text={furniture.label}
              x={0}
              y={0}
              width={w}
              height={h}
              align="center"
              verticalAlign="middle"
              fontSize={Math.max(11, Math.min(20, radius * 0.32))}
              fontStyle="bold"
              fill={textColor}
              wrap="word"
              ellipsis
              padding={6}
              listening={false}
            />
          ) : null}
        </>
      );
    }
  }
}

export { furnitureLabel };
