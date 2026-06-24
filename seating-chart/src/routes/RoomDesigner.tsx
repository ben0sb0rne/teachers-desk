import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type Konva from "konva";
import { useAppStore } from "@/store/appStore";
import RoomStage from "@/components/canvas/RoomStage";
import DeskPalette, { type PaletteDragType } from "@/components/canvas/DeskPalette";
import AssignmentPanel from "@/components/canvas/AssignmentPanel";
import MultiShapeParamsDialog, { type ConfigKind, type ConfigPayload } from "@/components/designer/MultiShapeParamsDialog";
import TextInputDialog from "@/components/TextInputDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import ExportDialog from "@/components/ExportDialog";
import { cloneDeskWithFreshIds, defaultParamsFor, layoutDesk, makeDesk, type ShapeParams } from "@/lib/shapes";
import { cloneFurnitureWithFreshId, makeFurniture } from "@/lib/furniture";
import { assign } from "@/lib/assign";
import { roomSeats } from "@/lib/adjacency";
import { pageToRoom } from "@/lib/canvasCoords";
import { DND_STUDENT } from "@/lib/dnd";
import Icon from "@/components/Icon";
import { toast } from "@/lib/toast";
import type { ClassRoom, Desk, DeskId, DeskKind, Furniture, FurnitureId, FurnitureKind, Room, SeatId, StudentId } from "@/types";

const PASTE_OFFSET = 20;
/** Mouse must move this many pixels after mousedown before a palette drag begins. */
const PALETTE_DRAG_THRESHOLD = 5;

interface PaletteDragSession {
  kind: DeskKind | FurnitureKind;
  type: PaletteDragType;
  startX: number;
  startY: number;
  /** Live cursor position while dragging. */
  x: number;
  y: number;
  /** Once the threshold is crossed, this flips to true and the ghost shows. */
  active: boolean;
}

/**
 * The canvas screen, in two modes:
 *
 *  - `layout`  — the dedicated Room editor. URL `/rooms/:id`. Edits a shared
 *    Room's desks + furniture; no students, no seating.
 *  - `seating` — a class's seating view. URL `/classes/:id/room`. The layout is
 *    shown but LOCKED; you assign students. A class can hold several rooms, so
 *    the panel has a room switcher and an "Edit <room>" button.
 *
 * Both modes render the same Konva canvas — only the data source and which
 * side panel shows differ.
 */
export default function RoomDesigner({ mode }: { mode: "layout" | "seating" }) {
  const seating = mode === "seating";
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // In seating mode `id` is a class id; in layout mode it's a room id.
  const klass = useAppStore((s) => (seating && id ? s.classes.find((c) => c.id === id) : undefined));
  const rooms = useAppStore((s) => s.rooms);

  // Active room (seating): the room whose seating we're editing — from the room
  // switcher (activeRoomId), else a ?room= deep-link, else the class's first
  // room. Layout mode: the route id IS the room id.
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const seatingRoomIds = klass ? klass.seatings.map((se) => se.roomId) : [];
  const paramRoom = searchParams.get("room");
  const effectiveRoomId = seating
    ? activeRoomId && seatingRoomIds.includes(activeRoomId)
      ? activeRoomId
      : paramRoom && seatingRoomIds.includes(paramRoom)
        ? paramRoom
        : seatingRoomIds[0] ?? null
    : id ?? null;
  const room = rooms.find((r) => r.id === effectiveRoomId);
  const seatingEntry =
    seating && klass && effectiveRoomId ? klass.seatings.find((se) => se.roomId === effectiveRoomId) : undefined;
  const classRooms: Room[] = klass
    ? klass.seatings.map((se) => rooms.find((r) => r.id === se.roomId)).filter((r): r is Room => !!r)
    : [];

  const addDesk = useAppStore((s) => s.addDesk);
  const removeDesks = useAppStore((s) => s.removeDesks);
  const updateRoomItems = useAppStore((s) => s.updateRoomItems);
  const addRoomItems = useAppStore((s) => s.addRoomItems);
  const addFurniture = useAppStore((s) => s.addFurniture);
  const updateFurniture = useAppStore((s) => s.updateFurniture);
  const removeFurniture = useAppStore((s) => s.removeFurniture);
  const updateRoom = useAppStore((s) => s.updateRoom);
  const assignSeatStore = useAppStore((s) => s.assignSeat);
  const setNameDisplay = useAppStore((s) => s.setNameDisplay);
  const setAssignmentsStore = useAppStore((s) => s.setAssignments);
  const restoreArrangement = useAppStore((s) => s.restoreArrangement);
  const saveArrangement = useAppStore((s) => s.saveArrangement);

  const stageRef = useRef<Konva.Stage>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [paramsDialog, setParamsDialog] = useState<{
    open: boolean;
    kind: ConfigKind | null;
    dropPoint: { x: number; y: number } | null;
  }>({ open: false, kind: null, dropPoint: null });
  /** Single-line text input modal — replaces window.prompt() callers. The
   *  discriminated `kind` tells the submit handler which action to run when
   *  the user confirms. null when no input dialog is open. */
  type TextInputState =
    | { kind: "arrangement-label" }
    | { kind: "furniture-label"; furnitureId: FurnitureId; initial: string };
  const [textInput, setTextInput] = useState<TextInputState | null>(null);
  /** Confirmation modal — replaces window.confirm() callers. The `kind`
   *  discriminates which action runs on confirm. `occupied` is captured at
   *  open-time so the prompt copy reflects the count the user clicked on. */
  type ConfirmState =
    | { kind: "clear"; occupied: number }
    | { kind: "randomize"; occupied: number };
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<{ desks: Desk[]; furniture: Furniture[] }>({
    desks: [],
    furniture: [],
  });
  // User-toggled layout lock (room editor only). In seating mode the layout is
  // always locked, regardless of this flag.
  const [userLocked, setUserLocked] = useState(false);
  const locked = seating ? true : userLocked;
  const [showGrid, setShowGrid] = useState(false);
  /** When true the unified Export dialog is open. The dialog renders its own
   *  RoomStage preview and handles PNG download + print. */
  const [exportOpen, setExportOpen] = useState(false);
  // Default-collapse both side panels on phone-sized viewports so the
  // canvas gets the full screen on first paint. Computed once at mount;
  // user toggles override after.
  const [paletteCollapsed, setPaletteCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );
  const [inspectorCollapsed, setInspectorCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );
  const [panelCollapsed, setPanelCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );
  const [paletteDrag, setPaletteDrag] = useState<PaletteDragSession | null>(null);

  const assignments = seating ? seatingEntry?.currentAssignments ?? {} : {};
  const arrangements = seatingEntry?.arrangements ?? [];
  const students = seating ? klass?.students ?? [] : [];

  useEffect(() => {
    setSelectedItemIds([]);
    setWarning(null);
    if (!klass || !effectiveRoomId) return;
    // History "Restore" stashes an arrangement id under restore:<class>:<room>.
    const key = `restore:${klass.id}:${effectiveRoomId}`;
    const restoreId = sessionStorage.getItem(key);
    if (restoreId) {
      sessionStorage.removeItem(key);
      const se = klass.seatings.find((x) => x.roomId === effectiveRoomId);
      if (se?.arrangements.some((a) => a.id === restoreId)) {
        restoreArrangement(klass.id, effectiveRoomId, restoreId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, effectiveRoomId]);

  // Window-level listeners for palette drag (layout mode only — palette is
  // hidden in seating, so paletteDrag never gets set there).
  useEffect(() => {
    if (!paletteDrag) return;
    function onMove(e: PointerEvent) {
      setPaletteDrag((prev) => {
        if (!prev) return null;
        const dx = e.clientX - prev.startX;
        const dy = e.clientY - prev.startY;
        const active = prev.active || Math.hypot(dx, dy) > PALETTE_DRAG_THRESHOLD;
        return { ...prev, x: e.clientX, y: e.clientY, active };
      });
    }
    function onUp(e: PointerEvent) {
      const session = paletteDrag;
      setPaletteDrag(null);
      if (!session || !session.active) return;
      const roomPt = pageToRoom(stageRef.current, e.clientX, e.clientY);
      if (!roomPt || !room) return;
      if (session.type === "single-desk") {
        placeDeskAtPoint(session.kind as DeskKind, undefined, roomPt.x, roomPt.y);
      } else if (session.type === "furniture") {
        if (session.kind === "window") {
          setParamsDialog({ open: true, kind: "window", dropPoint: roomPt });
        } else {
          placeFurnitureAtPoint(session.kind as FurnitureKind, roomPt.x, roomPt.y);
        }
      } else if (session.type === "multi-desk") {
        setParamsDialog({ open: true, kind: session.kind as DeskKind, dropPoint: roomPt });
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteDrag, room]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      // Layout-editing keyboard shortcuts only apply in the room editor.
      if (seating || !room) return;

      if ((e.key === "Backspace" || e.key === "Delete") && selectedItemIds.length > 0) {
        if (locked) return;
        e.preventDefault();
        const deskIds = room.desks.filter((d) => selectedItemIds.includes(d.id)).map((d) => d.id);
        const furnIds = (room.furniture ?? []).filter((f) => selectedItemIds.includes(f.id)).map((f) => f.id);
        if (deskIds.length) removeDesks(room.id, deskIds);
        if (furnIds.length) removeFurniture(room.id, furnIds);
        setSelectedItemIds([]);
      } else if (e.key === "Escape") {
        setSelectedItemIds([]);
      } else if (mod && e.key.toLowerCase() === "c" && selectedItemIds.length > 0) {
        e.preventDefault();
        const desks = room.desks.filter((d) => selectedItemIds.includes(d.id));
        const furniture = (room.furniture ?? []).filter((f) => selectedItemIds.includes(f.id));
        setClipboard({ desks, furniture });
      } else if (mod && e.key.toLowerCase() === "x" && selectedItemIds.length > 0) {
        if (locked) return;
        e.preventDefault();
        const desks = room.desks.filter((d) => selectedItemIds.includes(d.id));
        const furniture = (room.furniture ?? []).filter((f) => selectedItemIds.includes(f.id));
        setClipboard({ desks, furniture });
        if (desks.length) removeDesks(room.id, desks.map((d) => d.id));
        if (furniture.length) removeFurniture(room.id, furniture.map((f) => f.id));
        setSelectedItemIds([]);
      } else if (mod && e.key.toLowerCase() === "v" && (clipboard.desks.length || clipboard.furniture.length)) {
        if (locked) return;
        e.preventDefault();
        const newDesks = clipboard.desks.map((d) => cloneDeskWithFreshIds(d, PASTE_OFFSET, PASTE_OFFSET));
        const newFurn = clipboard.furniture.map((f) => cloneFurnitureWithFreshId(f, PASTE_OFFSET, PASTE_OFFSET));
        addRoomItems(room.id, newDesks, newFurn);
        setSelectedItemIds([...newDesks.map((d) => d.id), ...newFurn.map((f) => f.id)]);
        setClipboard({ desks: newDesks, furniture: newFurn });
      } else if (mod && e.key.toLowerCase() === "d" && selectedItemIds.length > 0) {
        if (locked) return;
        e.preventDefault();
        const desks = room.desks
          .filter((d) => selectedItemIds.includes(d.id))
          .map((d) => cloneDeskWithFreshIds(d, PASTE_OFFSET, PASTE_OFFSET));
        const furniture = (room.furniture ?? [])
          .filter((f) => selectedItemIds.includes(f.id))
          .map((f) => cloneFurnitureWithFreshId(f, PASTE_OFFSET, PASTE_OFFSET));
        addRoomItems(room.id, desks, furniture);
        setSelectedItemIds([...desks.map((d) => d.id), ...furniture.map((f) => f.id)]);
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedItemIds([
          ...room.desks.map((d) => d.id),
          ...(room.furniture ?? []).map((f) => f.id),
        ]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedItemIds, seating, room, removeDesks, removeFurniture, addRoomItems, clipboard, locked]);

  // ── Guards ────────────────────────────────────────────────
  // After this block: `room` is defined; in seating mode `klass` is too.
  if (seating) {
    if (!klass) return <div className="p-6 text-ink-muted">Class not found.</div>;
    if (klass.seatings.length === 0) return <AssignRoomPrompt klass={klass} />;
    if (!room) return <div className="p-6 text-ink-muted">Room not found.</div>;
  } else if (!room) {
    return <div className="p-6 text-ink-muted">Room not found.</div>;
  }

  function placeDeskAtCenter(kind: DeskKind, params: ShapeParams) {
    if (!room) return;
    const layout = layoutDesk(kind, params);
    const cx = room.width / 2 - layout.width / 2;
    const cy = room.height / 2 - layout.height / 2;
    const x = Math.round(cx / 10) * 10;
    const y = Math.round(cy / 10) * 10;
    addDesk(room.id, makeDesk(kind, params, x, y));
  }

  function placeDeskAtPoint(kind: DeskKind, params: ShapeParams, roomX: number, roomY: number) {
    if (!room) return;
    const layout = layoutDesk(kind, params);
    const x = Math.round((roomX - layout.width / 2) / 10) * 10;
    const y = Math.round((roomY - layout.height / 2) / 10) * 10;
    addDesk(room.id, makeDesk(kind, params, x, y));
  }

  function placeFurnitureAtPoint(kind: FurnitureKind, roomX: number, roomY: number) {
    if (!room) return;
    const item = makeFurniture(kind, 0, 0);
    item.x = Math.round((roomX - item.width / 2) / 10) * 10;
    item.y = Math.round((roomY - item.height / 2) / 10) * 10;
    addFurniture(room.id, item);
  }

  function handlePlaceSingle(kind: DeskKind) {
    placeDeskAtCenter(kind, undefined);
  }

  function handleOpenMulti(kind: DeskKind) {
    setParamsDialog({ open: true, kind, dropPoint: null });
  }

  function handleConfirmMulti(
    payload: ConfigPayload,
    dropPoint: { x: number; y: number } | null,
  ) {
    if (payload.kind === "window") {
      placeWindow(payload.paneCount, dropPoint);
      return;
    }
    const finalParams = payload.params ?? defaultParamsFor(payload.kind);
    if (dropPoint) placeDeskAtPoint(payload.kind, finalParams, dropPoint.x, dropPoint.y);
    else placeDeskAtCenter(payload.kind, finalParams);
  }

  function placeWindow(paneCount: number, dropPoint: { x: number; y: number } | null) {
    if (!room) return;
    const item = makeFurniture("window", 0, 0, { paneCount });
    if (dropPoint) {
      item.x = Math.round((dropPoint.x - item.width / 2) / 10) * 10;
      item.y = Math.round((dropPoint.y - item.height / 2) / 10) * 10;
    } else {
      const cx = room.width / 2 - item.width / 2;
      const cy = room.height / 2 - item.height / 2;
      item.x = Math.round(cx / 10) * 10;
      item.y = Math.round(cy / 10) * 10;
    }
    addFurniture(room.id, item);
  }

  function handlePlaceFurniture(kind: FurnitureKind) {
    if (!room) return;
    if (kind === "window") {
      setParamsDialog({ open: true, kind: "window", dropPoint: null });
      return;
    }
    const item = makeFurniture(kind, 0, 0);
    const cx = room.width / 2 - item.width / 2;
    const cy = room.height / 2 - item.height / 2;
    item.x = Math.round(cx / 10) * 10;
    item.y = Math.round(cy / 10) * 10;
    addFurniture(room.id, item);
  }

  function handlePaletteDragStart(
    kind: DeskKind | FurnitureKind,
    type: PaletteDragType,
    clientX: number,
    clientY: number,
  ) {
    setPaletteDrag({ kind, type, startX: clientX, startY: clientY, x: clientX, y: clientY, active: false });
  }

  /** Build per-item patch maps from a list of SelectedItems and pipe them into
   *  the bulk store action so the temporal middleware records ONE history entry
   *  per user action (not N entries for N items). */
  function applyItemPatches(
    items: SelectedItem[],
    patchFor: (it: SelectedItem) => Partial<Desk> | Partial<Furniture> | null,
  ) {
    if (!room) return;
    const deskPatches: Record<DeskId, Partial<Desk>> = {};
    const furniturePatches: Record<FurnitureId, Partial<Furniture>> = {};
    for (const it of items) {
      const patch = patchFor(it);
      if (!patch) continue;
      if (it.kind === "desk") deskPatches[it.entity.id] = patch as Partial<Desk>;
      else furniturePatches[it.entity.id] = patch as Partial<Furniture>;
    }
    updateRoomItems(room.id, deskPatches, furniturePatches);
  }

  function handleAlignVertical() {
    if (!room || selectedItemIds.length < 1) return;
    const items = collectSelectedItems(room.desks, room.furniture ?? [], selectedItemIds);
    const targetCenterX = items.length === 1 ? room.width / 2 : centerOfBBoxes(items.map(rotatedAABB)).x;
    applyItemPatches(items, (it) => {
      const aabb = rotatedAABB(it);
      const delta = targetCenterX - aabb.centerX;
      const newX = Math.round(it.entity.x + delta);
      return it.entity.x === newX ? null : { x: newX };
    });
  }

  function handleAlignHorizontal() {
    if (!room || selectedItemIds.length < 1) return;
    const items = collectSelectedItems(room.desks, room.furniture ?? [], selectedItemIds);
    const targetCenterY = items.length === 1 ? room.height / 2 : centerOfBBoxes(items.map(rotatedAABB)).y;
    applyItemPatches(items, (it) => {
      const aabb = rotatedAABB(it);
      const delta = targetCenterY - aabb.centerY;
      const newY = Math.round(it.entity.y + delta);
      return it.entity.y === newY ? null : { y: newY };
    });
  }

  function handleDistributeVertical() {
    if (!room || selectedItemIds.length < 3) return;
    const items = collectSelectedItems(room.desks, room.furniture ?? [], selectedItemIds);
    // Distribute by the VISIBLE (rotated) top edge, then map back to each item's
    // top-left so rotated desks space evenly by what you actually see.
    const aabbs = new Map(items.map((it) => [it.entity.id, rotatedAABB(it)]));
    const sorted = items.slice().sort((a, b) => aabbs.get(a.entity.id)!.minY - aabbs.get(b.entity.id)!.minY);
    const minY = aabbs.get(sorted[0].entity.id)!.minY;
    const maxY = aabbs.get(sorted[sorted.length - 1].entity.id)!.minY;
    const step = (maxY - minY) / (sorted.length - 1);
    const targetY = new Map<string, number>();
    sorted.forEach((it, i) => targetY.set(it.entity.id, minY + i * step));
    applyItemPatches(items, (it) => {
      const target = targetY.get(it.entity.id);
      if (target == null) return null;
      const newY = Math.round(it.entity.y + (target - aabbs.get(it.entity.id)!.minY));
      return newY === it.entity.y ? null : { y: newY };
    });
  }

  function handleDistributeHorizontal() {
    if (!room || selectedItemIds.length < 3) return;
    const items = collectSelectedItems(room.desks, room.furniture ?? [], selectedItemIds);
    const aabbs = new Map(items.map((it) => [it.entity.id, rotatedAABB(it)]));
    const sorted = items.slice().sort((a, b) => aabbs.get(a.entity.id)!.minX - aabbs.get(b.entity.id)!.minX);
    const minX = aabbs.get(sorted[0].entity.id)!.minX;
    const maxX = aabbs.get(sorted[sorted.length - 1].entity.id)!.minX;
    const step = (maxX - minX) / (sorted.length - 1);
    const targetX = new Map<string, number>();
    sorted.forEach((it, i) => targetX.set(it.entity.id, minX + i * step));
    applyItemPatches(items, (it) => {
      const target = targetX.get(it.entity.id);
      if (target == null) return null;
      const newX = Math.round(it.entity.x + (target - aabbs.get(it.entity.id)!.minX));
      return newX === it.entity.x ? null : { x: newX };
    });
  }

  function handleFlipHorizontal() {
    if (!room || selectedItemIds.length < 1) return;
    const items = collectSelectedItems(room.desks, room.furniture ?? [], selectedItemIds);
    if (items.length === 0) return;
    const minX = Math.min(...items.map((it) => it.entity.x));
    const maxX = Math.max(...items.map((it) => it.entity.x + it.entity.width));
    const centerX = (minX + maxX) / 2;
    applyItemPatches(items, (it) => {
      const newX = Math.round(2 * centerX - (it.entity.x + it.entity.width));
      const newRotation = normalizeAngle(-it.entity.rotation);
      if (it.kind === "desk") {
        const desk = it.entity;
        const seats = desk.seats.map((seat) => ({ ...seat, offsetX: desk.width - seat.offsetX }));
        return { x: newX, rotation: newRotation, seats };
      }
      return { x: newX, rotation: newRotation };
    });
  }

  function handleFlipVertical() {
    if (!room || selectedItemIds.length < 1) return;
    const items = collectSelectedItems(room.desks, room.furniture ?? [], selectedItemIds);
    if (items.length === 0) return;
    const minY = Math.min(...items.map((it) => it.entity.y));
    const maxY = Math.max(...items.map((it) => it.entity.y + it.entity.height));
    const centerY = (minY + maxY) / 2;
    applyItemPatches(items, (it) => {
      const newY = Math.round(2 * centerY - (it.entity.y + it.entity.height));
      const newRotation = normalizeAngle(180 - it.entity.rotation);
      if (it.kind === "desk") {
        const desk = it.entity;
        const seats = desk.seats.map((seat) => ({ ...seat, offsetY: desk.height - seat.offsetY }));
        return { y: newY, rotation: newRotation, seats };
      }
      return { y: newY, rotation: newRotation };
    });
  }

  function handleMarkFrontRow() {
    if (!room) return;
    const sel = room.desks.filter((d) => selectedItemIds.includes(d.id));
    if (sel.length === 0) return;
    // Toggle: if every selected desk is already all-front, turn it off.
    const allFront = sel.every((d) => d.seats.length > 0 && d.seats.every((s) => s.isFrontRow));
    const patches: Record<DeskId, Partial<Desk>> = {};
    for (const d of sel) patches[d.id] = { seats: d.seats.map((s) => ({ ...s, isFrontRow: !allFront })) };
    updateRoomItems(room.id, patches, {});
  }

  function handleMarkExcluded() {
    if (!room) return;
    const sel = room.desks.filter((d) => selectedItemIds.includes(d.id));
    if (sel.length === 0) return;
    const allExcluded = sel.every((d) => d.excluded);
    const patches: Record<DeskId, Partial<Desk>> = {};
    for (const d of sel) patches[d.id] = { excluded: !allExcluded };
    updateRoomItems(room.id, patches, {});
  }

  function normalizeAngle(deg: number): number {
    return ((deg % 360) + 360) % 360;
  }

  function handleClear() {
    if (Object.keys(assignments).length === 0) return;
    setConfirmState({ kind: "clear", occupied: Object.keys(assignments).length });
  }

  function performClear() {
    if (!klass || !effectiveRoomId) return;
    setAssignmentsStore(klass.id, effectiveRoomId, {});
    setWarning(null);
    setInfo(null);
  }

  function handleRandomize() {
    if (Object.keys(assignments).length > 0) {
      setConfirmState({ kind: "randomize", occupied: Object.keys(assignments).length });
      return;
    }
    performRandomize();
  }

  function performRandomize() {
    if (!klass || !room || !effectiveRoomId) return;
    setWarning(null);
    setInfo(null);
    const result = assign({ room, students: klass.students, history: arrangements });
    setAssignmentsStore(klass.id, effectiveRoomId, result.assignments);
    if (result.warnings.length > 0) setWarning(result.warnings.join(" "));
    const totalSeats = room.desks.reduce((n, d) => n + d.seats.length, 0);
    const emptySeats = totalSeats - Object.keys(result.assignments).length;
    if (emptySeats > 0 && klass.students.length <= totalSeats) {
      setInfo(`${emptySeats} seat${emptySeats === 1 ? "" : "s"} left empty (more seats than students).`);
    }
  }

  function handleConfirmStateConfirm() {
    if (!confirmState) return;
    if (confirmState.kind === "clear") performClear();
    else performRandomize();
  }

  function handleSaveArrangement() {
    if (Object.keys(assignments).length === 0) {
      setWarning("Nothing to save — assign students first (try Randomize).");
      return;
    }
    setTextInput({ kind: "arrangement-label" });
  }

  function handleAssignSeat(seatId: SeatId, studentId: StudentId | null) {
    if (!klass || !effectiveRoomId) return;
    assignSeatStore(klass.id, effectiveRoomId, seatId, studentId);
  }

  // Drag-and-drop seating: the assignments panel tags the drag with a student
  // id; dropping over the canvas assigns that student to the nearest seat.
  function handleCanvasDragOver(e: ReactDragEvent) {
    if (!Array.from(e.dataTransfer.types).includes(DND_STUDENT)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleCanvasDrop(e: ReactDragEvent) {
    if (!Array.from(e.dataTransfer.types).includes(DND_STUDENT)) return;
    e.preventDefault();
    const studentId = e.dataTransfer.getData(DND_STUDENT);
    if (!studentId || !klass || !room || !effectiveRoomId) return;
    const pt = pageToRoom(stageRef.current, e.clientX, e.clientY);
    if (!pt) return;
    let best: { seatId: SeatId; d: number } | null = null;
    for (const s of roomSeats(room)) {
      const d = Math.hypot(s.x - pt.x, s.y - pt.y);
      if (!best || d < best.d) best = { seatId: s.seatId, d };
    }
    // Only assign if the drop landed reasonably near a seat.
    if (best && best.d <= 80) assignSeatStore(klass.id, effectiveRoomId, best.seatId, studentId);
  }

  /** Apply a fill color (or clear it back to the kind default when fill is
   *  undefined) to every selected desk + furniture item. */
  function applyColorToSelection(fill: string | undefined) {
    if (!room || selectedItemIds.length === 0) return;
    const items = collectSelectedItems(room.desks, room.furniture ?? [], selectedItemIds);
    applyItemPatches(items, () => ({ fill }));
  }

  function handleSetColor(fill: string) { applyColorToSelection(fill); }
  function handleResetColor() { applyColorToSelection(undefined); }

  function handleRequestFurnitureRename(furnitureId: string) {
    if (!room) return;
    const item = room.furniture?.find((f) => f.id === furnitureId);
    if (!item || (item.kind !== "box" && item.kind !== "circle")) return;
    setTextInput({ kind: "furniture-label", furnitureId, initial: item.label ?? "" });
  }

  /** Dispatcher for the TextInputDialog's onSubmit. */
  function handleTextInputSubmit(value: string) {
    if (!textInput) return;
    switch (textInput.kind) {
      case "arrangement-label": {
        if (!klass || !effectiveRoomId) return;
        saveArrangement(klass.id, effectiveRoomId, value.length > 0 ? value : undefined);
        setWarning(null);
        toast("Arrangement saved");
        return;
      }
      case "furniture-label": {
        if (!room) return;
        updateFurniture(room.id, textInput.furnitureId, {
          label: value.length > 0 ? value : undefined,
        });
        return;
      }
    }
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Left rail: the layout tools (room editor) or the assignments panel
          (seating). Both live on the left for consistency. */}
      {seating
        ? klass && (
            <AssignmentPanel
              collapsed={panelCollapsed}
              onToggleCollapsed={() => setPanelCollapsed((c) => !c)}
              klass={klass}
              room={room}
              assignments={assignments}
              onAssignSeat={handleAssignSeat}
              onRandomize={handleRandomize}
              onClear={handleClear}
              onSave={handleSaveArrangement}
              onExport={() => setExportOpen(true)}
              onSelectDesk={(deskId) => setSelectedItemIds([deskId])}
              classRooms={classRooms}
              activeRoomId={effectiveRoomId ?? undefined}
              onChangeRoom={(rid) => setActiveRoomId(rid)}
              onEditRoom={() => navigate(`/rooms/${room.id}`)}
              nameDisplay={klass.nameDisplay}
              onChangeNameDisplay={(modeNext) => setNameDisplay(klass.id, modeNext)}
            />
          )
        : (
          <DeskPalette
            variant="insert"
            collapsed={paletteCollapsed}
            onToggleCollapsed={() => setPaletteCollapsed((c) => !c)}
            onPlaceSingle={handlePlaceSingle}
            onOpenMulti={handleOpenMulti}
            onPlaceFurniture={handlePlaceFurniture}
            onPaletteDragStart={handlePaletteDragStart}
            room={room}
            onUpdateRoom={(patch) => updateRoom(room.id, patch)}
            selectionSize={selectedItemIds.length}
            onAlignVertical={handleAlignVertical}
            onAlignHorizontal={handleAlignHorizontal}
            onDistributeVertical={handleDistributeVertical}
            onDistributeHorizontal={handleDistributeHorizontal}
            onFlipHorizontal={handleFlipHorizontal}
            onFlipVertical={handleFlipVertical}
            onMarkFrontRow={handleMarkFrontRow}
            onMarkExcluded={handleMarkExcluded}
            onSetColor={handleSetColor}
            onResetColor={handleResetColor}
            locked={userLocked}
            onToggleLocked={() => setUserLocked((l) => !l)}
            showGrid={showGrid}
            onToggleGrid={() => setShowGrid((g) => !g)}
          />
        )}
      <div
        className="relative flex min-h-0 min-w-0 flex-1 flex-col"
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
      >
        <RoomStage
          ref={stageRef}
          room={room}
          selectedItemIds={selectedItemIds}
          onSelectionChange={setSelectedItemIds}
          students={students}
          assignments={assignments}
          onAssignSeat={handleAssignSeat}
          onRequestFurnitureRename={handleRequestFurnitureRename}
          roomId={room.id}
          locked={locked}
          showGrid={showGrid}
          nameDisplay={seating ? klass?.nameDisplay : undefined}
        />
        {warning && (
          <div className="absolute inset-x-0 top-0 z-10 mx-auto mt-2 max-w-md rounded border border-amber-200 bg-amber-50/95 px-3 py-2 text-sm text-amber-900 shadow-md backdrop-blur">
            <strong>Heads up:</strong> {warning}
            <button className="ml-3 text-xs underline" onClick={() => setWarning(null)}>Dismiss</button>
          </div>
        )}
        {info && !warning && (
          <div className="absolute inset-x-0 top-0 z-10 mx-auto mt-2 max-w-md rounded border border-sky-200 bg-sky-50/95 px-3 py-2 text-sm text-sky-900 shadow-md backdrop-blur">
            {info}
            <button className="ml-3 text-xs underline" onClick={() => setInfo(null)}>Dismiss</button>
          </div>
        )}
        {!seating && (
          <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded bg-white/85 px-2 py-1 text-[10px] text-ink-muted shadow-sm">
            <Icon name="help-circle" size={10} className="mr-1 inline -mt-0.5" />
            Tip: right-click a desk to mark it front row or “don’t seat here”
          </div>
        )}
      </div>
      {!seating && (
        <DeskPalette
          variant="inspect"
          collapsed={inspectorCollapsed}
          onToggleCollapsed={() => setInspectorCollapsed((c) => !c)}
          onPlaceSingle={handlePlaceSingle}
          onOpenMulti={handleOpenMulti}
          onPlaceFurniture={handlePlaceFurniture}
          onPaletteDragStart={handlePaletteDragStart}
          room={room}
          onUpdateRoom={(patch) => updateRoom(room.id, patch)}
          selectionSize={selectedItemIds.length}
          onAlignVertical={handleAlignVertical}
          onAlignHorizontal={handleAlignHorizontal}
          onDistributeVertical={handleDistributeVertical}
          onDistributeHorizontal={handleDistributeHorizontal}
          onFlipHorizontal={handleFlipHorizontal}
          onFlipVertical={handleFlipVertical}
          onMarkFrontRow={handleMarkFrontRow}
          onMarkExcluded={handleMarkExcluded}
          onSetColor={handleSetColor}
          onResetColor={handleResetColor}
          locked={userLocked}
          onToggleLocked={() => setUserLocked((l) => !l)}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((g) => !g)}
        />
      )}
      {klass && (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          klass={klass}
          room={room}
          assignments={assignments}
          arrangement={null}
        />
      )}
      <MultiShapeParamsDialog
        open={paramsDialog.open}
        onOpenChange={(open) =>
          setParamsDialog((p) => (open ? { ...p, open } : { open: false, kind: null, dropPoint: null }))
        }
        kind={paramsDialog.kind}
        dropPoint={paramsDialog.dropPoint}
        onConfirm={handleConfirmMulti}
      />
      <TextInputDialog
        open={textInput != null}
        onOpenChange={(open) => { if (!open) setTextInput(null); }}
        title={textInput?.kind === "arrangement-label" ? "Save arrangement" : "Rename"}
        description={
          textInput?.kind === "arrangement-label"
            ? "Give this seating arrangement a label so you can find it in History later."
            : "Label drawn inside the shape. Leave blank to clear."
        }
        placeholder={textInput?.kind === "arrangement-label" ? "e.g. October seating chart" : ""}
        initialValue={textInput?.kind === "furniture-label" ? textInput.initial : ""}
        submitLabel={textInput?.kind === "arrangement-label" ? "Save" : "Update"}
        allowEmpty={textInput?.kind !== "arrangement-label"}
        onSubmit={handleTextInputSubmit}
      />
      <ConfirmDialog
        open={confirmState != null}
        onOpenChange={(open) => { if (!open) setConfirmState(null); }}
        title={
          confirmState?.kind === "clear"
            ? `Empty ${confirmState.occupied} seat${confirmState.occupied === 1 ? "" : "s"}?`
            : confirmState?.kind === "randomize"
              ? "Overwrite the current arrangement?"
              : ""
        }
        description={
          confirmState?.kind === "clear"
            ? "The desks themselves stay put — this only removes who's sitting where."
            : confirmState?.kind === "randomize"
              ? `${confirmState.occupied} student${confirmState.occupied === 1 ? "" : "s"} ${confirmState.occupied === 1 ? "is" : "are"} placed. Randomize will replace the current seating.`
              : undefined
        }
        confirmLabel={confirmState?.kind === "clear" ? "Empty seats" : "Randomize"}
        danger={confirmState?.kind === "clear"}
        onConfirm={handleConfirmStateConfirm}
      />
      {paletteDrag?.active && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-ink shadow-md"
          style={{ left: paletteDrag.x + 12, top: paletteDrag.y + 12 }}
        >
          Drop on the canvas to place
        </div>
      )}
    </div>
  );
}

/** Shown in seating mode when a class has no rooms yet. Lets the teacher attach
 *  an existing room or spin up a fresh one and jump into the layout editor. */
function AssignRoomPrompt({ klass }: { klass: ClassRoom }) {
  const navigate = useNavigate();
  const rooms = useAppStore((s) => s.rooms);
  const createRoom = useAppStore((s) => s.createRoom);
  const addClassRoom = useAppStore((s) => s.addClassRoom);
  const [picked, setPicked] = useState<string>("");

  function uniqueName(base: string): string {
    const taken = new Set(rooms.map((r) => r.name.trim().toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; n < 999; n++) {
      const candidate = `${base} (${n})`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return base;
  }

  function handleUseExisting() {
    if (!picked) return;
    addClassRoom(klass.id, picked);
  }

  function handleCreate() {
    const newId = createRoom(uniqueName(`${klass.name} — room`));
    if (newId) {
      addClassRoom(klass.id, newId);
      navigate(`/rooms/${newId}`);
    }
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <div className="card p-5">
        <h2 className="mb-1 text-lg font-semibold">No room yet</h2>
        <p className="mb-4 text-sm text-ink-muted">
          “{klass.name}” isn’t in a room yet. Attach an existing room layout to reuse,
          or create a new one to lay out desks.
        </p>

        {rooms.length > 0 && (
          <div className="mb-4 flex gap-2">
            <select className="input flex-1" value={picked} onChange={(e) => setPicked(e.target.value)}>
              <option value="">Choose a room…</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button className="btn-secondary whitespace-nowrap" onClick={handleUseExisting} disabled={!picked}>
              Add room
            </button>
          </div>
        )}

        <button className="btn-primary w-full justify-center" onClick={handleCreate}>
          Create a new room
        </button>
      </div>
    </div>
  );
}

type SelectedItem =
  | { kind: "desk"; entity: Desk }
  | { kind: "furniture"; entity: Furniture };

function collectSelectedItems(
  desks: Desk[],
  furniture: Furniture[],
  selectedIds: string[],
): SelectedItem[] {
  const out: SelectedItem[] = [];
  for (const d of desks) if (selectedIds.includes(d.id)) out.push({ kind: "desk", entity: d });
  for (const f of furniture) if (selectedIds.includes(f.id)) out.push({ kind: "furniture", entity: f });
  return out;
}

interface RotatedAABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

/** Visible (rotated) bounding box of an item in room coords. */
function rotatedAABB(it: SelectedItem): RotatedAABB {
  const { x, y, width: w, height: h, rotation } = it.entity;
  const rad = (rotation * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const corners: Array<[number, number]> = [
    [0, 0], [w, 0], [w, h], [0, h],
  ];
  const xs = corners.map(([lx, ly]) => x + lx * cosR - ly * sinR);
  const ys = corners.map(([lx, ly]) => y + lx * sinR + ly * cosR);
  const minX = Math.min.apply(null, xs);
  const maxX = Math.max.apply(null, xs);
  const minY = Math.min.apply(null, ys);
  const maxY = Math.max.apply(null, ys);
  return { minX, maxX, minY, maxY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

function centerOfBBoxes(boxes: RotatedAABB[]): { x: number; y: number } {
  if (boxes.length === 0) return { x: 0, y: 0 };
  const minX = Math.min(...boxes.map((b) => b.minX));
  const maxX = Math.max(...boxes.map((b) => b.maxX));
  const minY = Math.min(...boxes.map((b) => b.minY));
  const maxY = Math.max(...boxes.map((b) => b.maxY));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
