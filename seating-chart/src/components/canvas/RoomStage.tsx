import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Stage, Layer, Rect, Line, Text, Transformer } from "react-konva";
import type Konva from "konva";
import type { ClassId, Room, SeatId, Student, StudentId, Wall } from "@/types";
import DeskNode from "./DeskNode";
import FurnitureNode from "./FurnitureNode";
import SeatPicker from "./SeatPicker";
import { snapPosition, type Guide, type SnapItem, GRID } from "@/lib/snap";
import { shouldKeepRatio } from "@/lib/shapes";
import { rotatedItemAABB, unionAABB, type AABB } from "@/lib/geometry";
import { useAppStore } from "@/store/appStore";
import Icon, { type IconName } from "@/components/Icon";
import { CHANNELS, lightTokens } from "@/lib/theme-tokens";

/** Suite slab serif fallback chain — matches `var(--font-slab)` in
 *  shared/desk.css. Konva renders text via canvas2d which respects the same
 *  font fallback chain CSS uses. */
const SLAB_FONT_FAMILY = "Rockwell, 'Roboto Slab', Georgia, serif";
/** Padding (in room-coord units) used when fitContents expands the camera
 *  frame, so items + label aren't tight against the canvas edge. */
const FIT_CONTENTS_PADDING = 16;

// Static (don't flip with theme): accent-blue is the same in light + dark;
// marquee-stroke is functional/semantic.
const ACCENT_BLUE = lightTokens.accentBlue;
const MARQUEE_STROKE = lightTokens.marqueeStroke;
// Translucent selection-marquee fill — accent blue at 12% alpha.
const MARQUEE_FILL = `rgb(${CHANNELS.ACCENT_BLUE} / 0.12)`;

function frontWallLine(wall: Wall, w: number, h: number): number[] {
  switch (wall) {
    case "top": return [0, 0, w, 0];
    case "right": return [w, 0, w, h];
    case "bottom": return [0, h, w, h];
    case "left": return [0, 0, 0, h];
  }
}

function FrontOfRoomLabel({ frontWall }: { frontWall: Wall }) {
  const arrowIcon: IconName = ({
    top: "arrow-up",
    right: "arrow-right",
    bottom: "arrow-down",
    left: "arrow-left",
  } as const)[frontWall];
  const positionClass = {
    top: "top-2 left-1/2 -translate-x-1/2",
    right: "right-2 top-1/2 -translate-y-1/2",
    bottom: "bottom-2 left-1/2 -translate-x-1/2",
    left: "left-2 top-1/2 -translate-y-1/2",
  }[frontWall];
  return (
    <div
      className={`pointer-events-none absolute ${positionClass} flex items-center gap-1.5 rounded bg-ink/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm`}
    >
      <Icon name={arrowIcon} size={12} />
      <span>Front of room</span>
    </div>
  );
}

interface Props {
  room: Room;
  students: Student[];
  assignments: Record<SeatId, StudentId>;
  classId: ClassId;
  /** When false the stage renders for display only — no Transformer, no
   *  marquee, no drag, no seat picker, no alignment guides. Editor-only props
   *  (selection, locked, showGrid, callbacks) are ignored in that mode. The
   *  actual desk + furniture render output is identical, so History
   *  thumbnails and the live editor share the same visuals. Defaults to true. */
  interactive?: boolean;
  /** Editor only: current selection. Ignored in read-only mode. */
  selectedItemIds?: string[];
  /** Editor only. */
  onSelectionChange?: (ids: string[]) => void;
  /** Editor only. */
  onAssignSeat?: (seatId: SeatId, studentId: StudentId | null) => void;
  /** Box / circle furniture: caller handles the rename UX. Editor only. */
  onRequestFurnitureRename?: (furnitureId: string) => void;
  /** Editor only — disables drag + transform when true. Read-only mode also
   *  behaves as "locked" regardless of this prop. */
  locked?: boolean;
  /** Editor only — show the snap grid dots. */
  showGrid?: boolean;
  /** Render the "Front of room" overlay label. Default true. The Export
   *  dialog flips this off when the user wants a clean PNG. */
  showFrontWallLabel?: boolean;
  /** Render seated student names on each desk. Default true. */
  showNames?: boolean;
  /** Render the per-desk amber front-row corner dot. Default true. */
  showFrontRowMarkers?: boolean;
  /** Render empty-seat placeholder circles. Default true (editor needs them
   *  as click targets); the export dialog flips off for clean charts. */
  showEmptySeatDots?: boolean;
  /** Override the room background fill. Default uses room.background, falling
   *  back to paper-cream. Pass "rgba(0,0,0,0)" or any color to override —
   *  used by the export preview to reflect the chosen background mode. */
  roomBackgroundFill?: string;
  /** Expand the camera frame to include every desk + furniture's rotated
   *  AABB, not just the room rectangle. Default false (editor uses the room
   *  bounds so the canvas always frames the same area). The export preview +
   *  History thumbnails enable this so items that sit outside the room — e.g.
   *  doors with arcs swinging through the wall — aren't clipped. */
  fitContents?: boolean;
  /** When defined, render this string as a Konva text label in the top-right
   *  of the camera frame. Used by the export preview to print the class name
   *  on the chart. */
  classNameLabel?: string;
  /** Font size in room-coord units for `classNameLabel`. Default 24. */
  classNameLabelSize?: number;
}

interface Marquee {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface DragSession {
  draggedId: string;
  /** Starting positions for every selected item at the moment drag began. */
  initialPositions: Map<string, { x: number; y: number }>;
}

const NOOP_SELECTION_CHANGE = (_ids: string[]) => {};
const NOOP_ASSIGN_SEAT = (_seatId: SeatId, _studentId: StudentId | null) => {};
const EMPTY_SELECTION: string[] = [];

const RoomStage = forwardRef<Konva.Stage, Props>(function RoomStage(
  {
    room,
    students,
    assignments,
    classId,
    interactive = true,
    selectedItemIds = EMPTY_SELECTION,
    onSelectionChange = NOOP_SELECTION_CHANGE,
    onAssignSeat = NOOP_ASSIGN_SEAT,
    onRequestFurnitureRename,
    locked = false,
    showGrid = false,
    showFrontWallLabel = true,
    showNames = true,
    showFrontRowMarkers = true,
    showEmptySeatDots = true,
    roomBackgroundFill,
    fitContents = false,
    classNameLabel,
    classNameLabelSize = 24,
  },
  ref,
) {
  // Read-only mode behaves as a permanently locked editor for the purposes of
  // drag / transform / pointer handlers. `effectiveLocked` collapses the two.
  const effectiveLocked = locked || !interactive;
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Group>());
  const dragSession = useRef<DragSession | null>(null);
  useImperativeHandle(ref, () => stageRef.current!, []);

  // Canvas chrome (room background, grid dots, front-wall line) is pinned
  // to lightTokens regardless of the active theme. The "diorama" inside the
  // canvas is meant to read like cream paper on a desk; flipping it dark in
  // dark mode produced muddy contrast against the slate desks and the
  // hardcoded white desk fills. Dark mode still applies to the chrome
  // OUTSIDE the canvas (topstrip, page background).
  const PAPER_CREAM = lightTokens.paperCream;
  const PAPER_EDGE = lightTokens.paperEdge;
  const NEUTRAL_LINE = lightTokens.neutralLine;

  const updateDesk = useAppStore((s) => s.updateDesk);
  const updateFurniture = useAppStore((s) => s.updateFurniture);

  const [size, setSize] = useState({ w: 800, h: 600 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [picker, setPicker] = useState<{ seatId: SeatId; x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  // Live shift-key tracking — when held, rotation snaps aggressively to 45°.
  const [shiftHeld, setShiftHeld] = useState(false);

  useEffect(() => {
    function onShiftChange(e: KeyboardEvent) {
      setShiftHeld(e.shiftKey);
    }
    window.addEventListener("keydown", onShiftChange);
    window.addEventListener("keyup", onShiftChange);
    return () => {
      window.removeEventListener("keydown", onShiftChange);
      window.removeEventListener("keyup", onShiftChange);
    };
  }, []);

  const registerNode = useCallback((id: string, node: Konva.Group | null) => {
    if (node) nodeRefs.current.set(id, node);
    else nodeRefs.current.delete(id);
  }, []);

  const transformerKeepRatio = useMemo(() => {
    if (selectedItemIds.length !== 1) return false;
    const id = selectedItemIds[0];
    const desk = room.desks.find((d) => d.id === id);
    if (desk) return shouldKeepRatio(desk.kind);
    return false;
  }, [selectedItemIds, room.desks]);

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    if (effectiveLocked) {
      tr.nodes([]);
      return;
    }

    const nodes = selectedItemIds
      .map((id) => nodeRefs.current.get(id))
      .filter((n): n is Konva.Group => !!n);
    tr.nodes(nodes);
    // Force the Transformer to recompute its bbox from the (newly assigned)
    // nodes. Without this, the multi-select bbox sometimes inherits a stale
    // union from the previous selection — visible as the box "going haywire"
    // when you click between selections.
    tr.forceUpdate();
    tr.getLayer()?.batchDraw();

    // Live alignment guides during resize. Single-select only — multi-select
    // resize doesn't really need guides since the whole group scales together.
    if (selectedItemIds.length !== 1 || nodes.length !== 1) {
      return;
    }
    const node = nodes[0];
    const activeId = selectedItemIds[0];

    // Snapshot the current desk/furniture metadata once. The snap calc reads
    // from this; we don't need to re-bind the listener as the user drags.
    const desk = room.desks.find((d) => d.id === activeId);
    const furniture = (room.furniture ?? []).find((f) => f.id === activeId);
    const baseW = desk?.width ?? furniture?.width;
    const baseH = desk?.height ?? furniture?.height;
    if (!baseW || !baseH) return;

    const isActiveDesk = !!desk;
    const allItems: SnapItem[] = [
      ...room.desks.map((d) => ({ id: d.id, x: d.x, y: d.y, width: d.width, height: d.height, kind: "desk" as const })),
      ...(room.furniture ?? []).map((f) => ({ id: f.id, x: f.x, y: f.y, width: f.width, height: f.height, kind: "furniture" as const })),
    ];
    const snapOpts = {
      roomWidth: room.width,
      roomHeight: room.height,
      crossType: !!room.advancedAlignment,
    };

    function onTransform() {
      const sx = node.scaleX();
      const sy = node.scaleY();
      const w = (baseW as number) * sx;
      const h = (baseH as number) * sy;
      const me: SnapItem = {
        id: activeId,
        x: node.x(),
        y: node.y(),
        width: w,
        height: h,
        kind: isActiveDesk ? "desk" : "furniture",
      };
      // Reuse snapPosition and discard its returned x/y — for resize we just
      // SHOW guides; we don't snap the resize handle itself in v1.
      const result = snapPosition(me, node.x(), node.y(), allItems, snapOpts);
      setGuides(result.guides);
    }
    function onTransformEndClear() {
      setGuides([]);
    }

    node.on("transform.guides", onTransform);
    node.on("transformend.guides", onTransformEndClear);
    return () => {
      node.off("transform.guides");
      node.off("transformend.guides");
    };
  }, [selectedItemIds, effectiveLocked, room.desks, room.furniture]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const cr = entry.contentRect;
      setSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padding = 40;
  // The camera frame ("viewBounds") is normally just the room rectangle, but
  // when fitContents is on we expand it to include every item's rotated
  // AABB so things like outward-swinging door arcs aren't clipped. The
  // expansion gets a small padding so items aren't tight against the edge.
  const viewBounds: AABB = useMemo(() => {
    const roomBounds: AABB = { x: 0, y: 0, width: room.width, height: room.height };
    if (!fitContents) return roomBounds;
    let union = roomBounds;
    for (const d of room.desks) union = unionAABB(union, rotatedItemAABB(d));
    for (const f of room.furniture ?? []) union = unionAABB(union, rotatedItemAABB(f));
    return {
      x: union.x - FIT_CONTENTS_PADDING,
      y: union.y - FIT_CONTENTS_PADDING,
      width: union.width + FIT_CONTENTS_PADDING * 2,
      height: union.height + FIT_CONTENTS_PADDING * 2,
    };
  }, [fitContents, room.width, room.height, room.desks, room.furniture]);
  const scale = Math.min(
    (size.w - padding * 2) / viewBounds.width,
    (size.h - padding * 2) / viewBounds.height,
  );
  const safeScale = isFinite(scale) && scale > 0 ? scale : 1;
  // Layer offset — point (viewBounds.x, viewBounds.y) in room coords needs to
  // land at the top-left of the centered camera frame on stage.
  const offsetX = (size.w - viewBounds.width * safeScale) / 2 - viewBounds.x * safeScale;
  const offsetY = (size.h - viewBounds.height * safeScale) / 2 - viewBounds.y * safeScale;

  function pointerToRoom(): { x: number; y: number } | null {
    const layer = layerRef.current;
    const stage = stageRef.current;
    if (!layer || !stage) return null;
    const point = stage.getPointerPosition();
    if (!point) return null;
    const transform = layer.getAbsoluteTransform().copy().invert();
    return transform.point(point);
  }

  function handleSelectItem(itemId: string, additive: boolean) {
    if (additive) {
      onSelectionChange(
        selectedItemIds.includes(itemId)
          ? selectedItemIds.filter((id) => id !== itemId)
          : [...selectedItemIds, itemId],
      );
    } else {
      onSelectionChange([itemId]);
    }
  }

  function handleStagePointerDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (!interactive) return;
    if (e.target !== e.target.getStage() && e.target.attrs.id !== "room-bg") return;
    const pt = pointerToRoom();
    if (!pt) return;
    setMarquee({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
    onSelectionChange([]);
  }

  function handleStagePointerMove() {
    if (!interactive) return;
    if (!marquee) return;
    const pt = pointerToRoom();
    if (!pt) return;
    const next = { ...marquee, x2: pt.x, y2: pt.y };
    setMarquee(next);
    const minX = Math.min(next.x1, next.x2);
    const maxX = Math.max(next.x1, next.x2);
    const minY = Math.min(next.y1, next.y2);
    const maxY = Math.max(next.y1, next.y2);
    const inside: string[] = [];
    for (const d of room.desks) {
      if (d.x + d.width >= minX && d.x <= maxX && d.y + d.height >= minY && d.y <= maxY) {
        inside.push(d.id);
      }
    }
    for (const f of room.furniture ?? []) {
      if (f.x + f.width >= minX && f.x <= maxX && f.y + f.height >= minY && f.y <= maxY) {
        inside.push(f.id);
      }
    }
    onSelectionChange(inside);
  }

  function handleStagePointerUp() {
    if (!interactive) return;
    setMarquee(null);
  }

  function handleItemDragStart(itemId: string) {
    // Record starting positions for every selected item so multi-drag can
    // apply a single delta to all of them.
    const positions = new Map<string, { x: number; y: number }>();
    if (selectedItemIds.includes(itemId)) {
      for (const id of selectedItemIds) {
        const node = nodeRefs.current.get(id);
        if (node) positions.set(id, { x: node.x(), y: node.y() });
      }
    } else {
      const node = nodeRefs.current.get(itemId);
      if (node) positions.set(itemId, { x: node.x(), y: node.y() });
    }
    dragSession.current = { draggedId: itemId, initialPositions: positions };
  }

  function snapItemDrag(itemId: string, x: number, y: number) {
    const allItems: SnapItem[] = [
      ...room.desks.map((d) => ({ id: d.id, x: d.x, y: d.y, width: d.width, height: d.height, kind: "desk" as const })),
      ...(room.furniture ?? []).map((f) => ({ id: f.id, x: f.x, y: f.y, width: f.width, height: f.height, kind: "furniture" as const })),
    ];
    const me = allItems.find((it) => it.id === itemId);
    if (!me) return { x, y };
    const result = snapPosition({ ...me, x, y }, x, y, allItems, {
      roomWidth: room.width,
      roomHeight: room.height,
      crossType: !!room.advancedAlignment,
    });
    setGuides(result.guides);

    const session = dragSession.current;
    if (session && session.initialPositions.size > 1) {
      const initial = session.initialPositions.get(itemId);
      if (initial) {
        const dx = result.x - initial.x;
        const dy = result.y - initial.y;
        for (const [id, pos] of session.initialPositions) {
          if (id === itemId) continue;
          const node = nodeRefs.current.get(id);
          if (node) {
            node.x(pos.x + dx);
            node.y(pos.y + dy);
          }
        }
        // Force the multi-select Transformer to recompute its bounding box so
        // its border/handles/rotation pivot stay centered on the whole group
        // as it moves, instead of drifting behind on the dragged item.
        transformerRef.current?.forceUpdate();
      }
    }

    return { x: result.x, y: result.y };
  }

  function handleItemDragEnd() {
    setGuides([]);
    // Persist positions for all siblings that moved during multi-drag.
    const session = dragSession.current;
    if (session && session.initialPositions.size > 1) {
      for (const [id, initial] of session.initialPositions) {
        if (id === session.draggedId) continue; // dragged item updates itself
        const node = nodeRefs.current.get(id);
        if (!node) continue;
        const finalX = node.x();
        const finalY = node.y();
        if (finalX === initial.x && finalY === initial.y) continue;
        const isDesk = room.desks.some((d) => d.id === id);
        if (isDesk) updateDesk(classId, id, { x: finalX, y: finalY });
        else updateFurniture(classId, id, { x: finalX, y: finalY });
      }
    }
    dragSession.current = null;
  }

  const gridDots = useMemo(() => {
    if (!showGrid) return null;
    const step = GRID * 4;
    const dots: { x: number; y: number }[] = [];
    for (let x = step; x < room.width; x += step) {
      for (let y = step; y < room.height; y += step) {
        dots.push({ x, y });
      }
    }
    return dots;
  }, [showGrid, room.width, room.height]);

  return (
    <div
      ref={containerRef}
      className={
        "relative min-h-0 flex-1 " + (interactive ? "bg-slate-100" : "")
      }
      style={{ touchAction: "none" }}
    >
      <Stage
        ref={stageRef}
        width={size.w}
        height={size.h}
        onMouseDown={handleStagePointerDown}
        onTouchStart={handleStagePointerDown}
        onMouseMove={handleStagePointerMove}
        onTouchMove={handleStagePointerMove}
        onMouseUp={handleStagePointerUp}
        onTouchEnd={handleStagePointerUp}
      >
        <Layer ref={layerRef} x={offsetX} y={offsetY} scaleX={safeScale} scaleY={safeScale}>
          <Rect
            id="room-bg"
            x={0}
            y={0}
            width={room.width}
            height={room.height}
            fill={roomBackgroundFill ?? room.background ?? PAPER_CREAM}
            stroke={NEUTRAL_LINE}
            strokeWidth={2 / safeScale}
          />

          {gridDots &&
            gridDots.map((d, i) => (
              <Rect
                key={`g-${i}`}
                x={d.x - 1}
                y={d.y - 1}
                width={2}
                height={2}
                fill={NEUTRAL_LINE}
                listening={false}
              />
            ))}

          <Line
            points={frontWallLine(room.frontWall ?? "top", room.width, room.height)}
            stroke={PAPER_EDGE}
            strokeWidth={5 / safeScale}
            dash={[12 / safeScale, 8 / safeScale]}
          />

          {(room.furniture ?? []).map((f) => (
            <FurnitureNode
              key={f.id}
              furniture={f}
              selected={interactive && selectedItemIds.includes(f.id)}
              onSelect={(additive) => interactive && handleSelectItem(f.id, additive)}
              registerNode={registerNode}
              draggable={!effectiveLocked}
              onDragStart={(id) => handleItemDragStart(id)}
              onDragMove={(id, x, y) => snapItemDrag(id, x, y)}
              onDragEnd={handleItemDragEnd}
              onRequestRename={interactive ? onRequestFurnitureRename : undefined}
              classId={classId}
            />
          ))}

          {room.desks.map((desk) => (
            <DeskNode
              key={desk.id}
              desk={desk}
              selected={interactive && selectedItemIds.includes(desk.id)}
              onSelect={(additive) => interactive && handleSelectItem(desk.id, additive)}
              students={students}
              assignments={assignments}
              registerNode={registerNode}
              draggable={!effectiveLocked}
              onSeatClick={(seatId, x, y) => {
                if (!interactive) return;
                const rect = containerRef.current?.getBoundingClientRect();
                setPicker({ seatId, x: (rect?.left ?? 0) + x, y: (rect?.top ?? 0) + y });
              }}
              onDragStart={(id) => handleItemDragStart(id)}
              onDragMove={(id, x, y) => snapItemDrag(id, x, y)}
              onDragEnd={handleItemDragEnd}
              classId={classId}
              showNames={showNames}
              showFrontRowMarker={showFrontRowMarkers}
              showEmptySeatDots={showEmptySeatDots}
            />
          ))}

          {interactive && (
            // Hold Shift to snap rotation aggressively to every 45°.
            // Otherwise the existing 5° tolerance keeps cardinal angles smooth
            // without forcing them.
            <Transformer
              ref={transformerRef}
              rotateEnabled={!effectiveLocked}
              resizeEnabled={!effectiveLocked}
              keepRatio={transformerKeepRatio}
              // For multi-select, scale/rotate pivots from the group's center
              // (the bounding box's geometric middle) instead of the corner
              // opposite the dragged anchor. Single-select keeps default
              // corner-anchored scaling.
              centeredScaling={selectedItemIds.length > 1}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={shiftHeld ? 23 : 5}
              borderStroke={ACCENT_BLUE}
              anchorStroke={ACCENT_BLUE}
              anchorFill="#ffffff"
              anchorStrokeWidth={2}
              anchorSize={10}
            />
          )}

          {interactive && guides.map((g, i) => {
            // Distinct stroke per guide kind so the user can tell at a
            // glance whether they're snapping to a peer (edge), to a
            // distribution rhythm, or to the room's own centerline.
            const stroke =
              g.kind === "roomCenter"
                ? ACCENT_BLUE
                : g.kind === "distribution"
                  ? "#f59e0b" // amber — matches the door fill family
                  : MARQUEE_STROKE;
            const dash =
              g.kind === "roomCenter"
                ? [8 / safeScale, 4 / safeScale]
                : [4 / safeScale, 3 / safeScale];
            return g.axis === "x" ? (
              <Line
                key={`gx-${i}`}
                points={[g.position, 0, g.position, room.height]}
                stroke={stroke}
                strokeWidth={(g.kind === "roomCenter" ? 1.4 : 1) / safeScale}
                dash={dash}
                listening={false}
              />
            ) : (
              <Line
                key={`gy-${i}`}
                points={[0, g.position, room.width, g.position]}
                stroke={stroke}
                strokeWidth={(g.kind === "roomCenter" ? 1.4 : 1) / safeScale}
                dash={dash}
                listening={false}
              />
            );
          })}

          {interactive && marquee && (
            <Rect
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
              fill={MARQUEE_FILL}
              stroke={ACCENT_BLUE}
              strokeWidth={1 / safeScale}
              dash={[4 / safeScale, 3 / safeScale]}
              listening={false}
            />
          )}

          {/* Class-name label sits in the top-right of the camera frame. The
              text is right-aligned within a band that spans the camera frame
              width minus a small padding, so long names truncate gracefully
              instead of running off the edge. */}
          {classNameLabel && (
            <Text
              text={classNameLabel}
              x={viewBounds.x + 8}
              y={viewBounds.y + 8}
              width={viewBounds.width - 16}
              align="right"
              fontFamily={SLAB_FONT_FAMILY}
              fontStyle="bold"
              fontSize={classNameLabelSize}
              fill={PAPER_EDGE}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
      {showFrontWallLabel && <FrontOfRoomLabel frontWall={room.frontWall ?? "top"} />}
      {interactive && picker && (
        <SeatPicker
          x={picker.x}
          y={picker.y}
          seatId={picker.seatId}
          students={students}
          assignments={assignments}
          onPick={(studentId) => {
            onAssignSeat(picker.seatId, studentId);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
});

export default RoomStage;
