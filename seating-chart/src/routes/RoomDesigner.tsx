import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useParams } from "react-router-dom";
import type Konva from "konva";
import { useAppStore } from "@/store/appStore";
import RoomStage from "@/components/canvas/RoomStage";
import DeskPalette, { type PaletteDragType } from "@/components/canvas/DeskPalette";
import AssignmentPanel from "@/components/canvas/AssignmentPanel";
import MultiShapeParamsDialog, { type ConfigKind, type ConfigPayload } from "@/components/designer/MultiShapeParamsDialog";
import { cloneDeskWithFreshIds, defaultParamsFor, layoutDesk, makeDesk, type ShapeParams } from "@/lib/shapes";
import { cloneFurnitureWithFreshId, makeFurniture } from "@/lib/furniture";
import { assign } from "@/lib/assign";
import { exportStageAsPng } from "@/lib/exportPng";
import { pageToRoom } from "@/lib/canvasCoords";
import Icon from "@/components/Icon";
import type { Desk, DeskId, DeskKind, Furniture, FurnitureId, FurnitureKind, SeatId, StudentId } from "@/types";

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

export default function RoomDesigner() {
  const { id } = useParams();
  const klass = useAppStore((s) => (id ? s.classes.find((c) => c.id === id) : undefined));
  const addDesk = useAppStore((s) => s.addDesk);
  const addDesks = useAppStore((s) => s.addDesks);
  const removeDesks = useAppStore((s) => s.removeDesks);
  const updateRoomItems = useAppStore((s) => s.updateRoomItems);
  const addFurniture = useAppStore((s) => s.addFurniture);
  const addFurnitures = useAppStore((s) => s.addFurnitures);
  const updateFurniture = useAppStore((s) => s.updateFurniture);
  const removeFurniture = useAppStore((s) => s.removeFurniture);
  const updateRoom = useAppStore((s) => s.updateRoom);
  const assignSeatStore = useAppStore((s) => s.assignSeat);
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
  const [warning, setWarning] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<{ desks: Desk[]; furniture: Furniture[] }>({
    desks: [],
    furniture: [],
  });
  const [locked, setLocked] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [paletteDrag, setPaletteDrag] = useState<PaletteDragSession | null>(null);

  const assignments = klass?.currentAssignments ?? {};

  useEffect(() => {
    setSelectedItemIds([]);
    setWarning(null);
    if (!klass) return;
    const restoreId = sessionStorage.getItem(`restore:${klass.id}`);
    if (restoreId) {
      sessionStorage.removeItem(`restore:${klass.id}`);
      const arr = klass.arrangements.find((a) => a.id === restoreId);
      if (arr) restoreArrangement(klass.id, arr.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Window-level listeners for palette drag (mousemove tracks cursor + crosses
  // the threshold; mouseup either drops on the canvas or cancels).
  useEffect(() => {
    if (!paletteDrag) return;
    function onMove(e: MouseEvent) {
      setPaletteDrag((prev) => {
        if (!prev) return null;
        const dx = e.clientX - prev.startX;
        const dy = e.clientY - prev.startY;
        const active = prev.active || Math.hypot(dx, dy) > PALETTE_DRAG_THRESHOLD;
        return { ...prev, x: e.clientX, y: e.clientY, active };
      });
    }
    function onUp(e: MouseEvent) {
      const session = paletteDrag;
      setPaletteDrag(null);
      // If the drag never activated, this was a plain click — let the
      // button's own onClick handle it (no-op here).
      if (!session || !session.active) return;
      const room = pageToRoom(stageRef.current, e.clientX, e.clientY);
      if (!room || !klass) return;
      if (session.type === "single-desk") {
        placeDeskAtPoint(session.kind as DeskKind, undefined, room.x, room.y);
      } else if (session.type === "furniture") {
        // Windows are configurable: route through the params dialog with the
        // drop point so the user can pick pane count before placement.
        if (session.kind === "window") {
          setParamsDialog({ open: true, kind: "window", dropPoint: room });
        } else {
          placeFurnitureAtPoint(session.kind as FurnitureKind, room.x, room.y);
        }
      } else if (session.type === "multi-desk") {
        // Multi-desk needs params first — open the dialog with the drop point;
        // confirm will place there.
        setParamsDialog({ open: true, kind: session.kind as DeskKind, dropPoint: room });
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteDrag, klass]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!klass) return;

      if ((e.key === "Backspace" || e.key === "Delete") && selectedItemIds.length > 0) {
        if (locked) return;
        e.preventDefault();
        const deskIds = klass.room.desks.filter((d) => selectedItemIds.includes(d.id)).map((d) => d.id);
        const furnIds = (klass.room.furniture ?? []).filter((f) => selectedItemIds.includes(f.id)).map((f) => f.id);
        if (deskIds.length) removeDesks(klass.id, deskIds);
        if (furnIds.length) removeFurniture(klass.id, furnIds);
        setSelectedItemIds([]);
      } else if (e.key === "Escape") {
        setSelectedItemIds([]);
      } else if (mod && e.key.toLowerCase() === "c" && selectedItemIds.length > 0) {
        e.preventDefault();
        const desks = klass.room.desks.filter((d) => selectedItemIds.includes(d.id));
        const furniture = (klass.room.furniture ?? []).filter((f) => selectedItemIds.includes(f.id));
        setClipboard({ desks, furniture });
      } else if (mod && e.key.toLowerCase() === "v" && (clipboard.desks.length || clipboard.furniture.length)) {
        if (locked) return;
        e.preventDefault();
        const newDesks = clipboard.desks.map((d) => cloneDeskWithFreshIds(d, PASTE_OFFSET, PASTE_OFFSET));
        const newFurn = clipboard.furniture.map((f) => cloneFurnitureWithFreshId(f, PASTE_OFFSET, PASTE_OFFSET));
        if (newDesks.length) addDesks(klass.id, newDesks);
        if (newFurn.length) addFurnitures(klass.id, newFurn);
        setSelectedItemIds([...newDesks.map((d) => d.id), ...newFurn.map((f) => f.id)]);
        setClipboard({ desks: newDesks, furniture: newFurn });
      } else if (mod && e.key.toLowerCase() === "d" && selectedItemIds.length > 0) {
        if (locked) return;
        e.preventDefault();
        const desks = klass.room.desks
          .filter((d) => selectedItemIds.includes(d.id))
          .map((d) => cloneDeskWithFreshIds(d, PASTE_OFFSET, PASTE_OFFSET));
        const furniture = (klass.room.furniture ?? [])
          .filter((f) => selectedItemIds.includes(f.id))
          .map((f) => cloneFurnitureWithFreshId(f, PASTE_OFFSET, PASTE_OFFSET));
        if (desks.length) addDesks(klass.id, desks);
        if (furniture.length) addFurnitures(klass.id, furniture);
        setSelectedItemIds([...desks.map((d) => d.id), ...furniture.map((f) => f.id)]);
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedItemIds([
          ...klass.room.desks.map((d) => d.id),
          ...(klass.room.furniture ?? []).map((f) => f.id),
        ]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selectedItemIds,
    klass,
    removeDesks,
    removeFurniture,
    addDesks,
    addFurnitures,
    clipboard,
    locked,
  ]);

  if (!klass) return <div className="p-6 text-ink-muted">Class not found.</div>;

  function placeDeskAtCenter(kind: DeskKind, params: ShapeParams) {
    if (!klass) return;
    const layout = layoutDesk(kind, params);
    const cx = klass.room.width / 2 - layout.width / 2;
    const cy = klass.room.height / 2 - layout.height / 2;
    const x = Math.round(cx / 10) * 10;
    const y = Math.round(cy / 10) * 10;
    addDesk(klass.id, makeDesk(kind, params, x, y));
  }

  function placeDeskAtPoint(kind: DeskKind, params: ShapeParams, roomX: number, roomY: number) {
    if (!klass) return;
    const layout = layoutDesk(kind, params);
    const x = Math.round((roomX - layout.width / 2) / 10) * 10;
    const y = Math.round((roomY - layout.height / 2) / 10) * 10;
    addDesk(klass.id, makeDesk(kind, params, x, y));
  }

  function placeFurnitureAtPoint(kind: FurnitureKind, roomX: number, roomY: number) {
    if (!klass) return;
    const item = makeFurniture(kind, 0, 0);
    item.x = Math.round((roomX - item.width / 2) / 10) * 10;
    item.y = Math.round((roomY - item.height / 2) / 10) * 10;
    addFurniture(klass.id, item);
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
      // Window flow: configure pane count → makeFurniture with that count.
      placeWindow(payload.paneCount, dropPoint);
      return;
    }
    const finalParams = payload.params ?? defaultParamsFor(payload.kind);
    if (dropPoint) placeDeskAtPoint(payload.kind, finalParams, dropPoint.x, dropPoint.y);
    else placeDeskAtCenter(payload.kind, finalParams);
  }

  function placeWindow(paneCount: number, dropPoint: { x: number; y: number } | null) {
    if (!klass) return;
    const item = makeFurniture("window", 0, 0, { paneCount });
    if (dropPoint) {
      item.x = Math.round((dropPoint.x - item.width / 2) / 10) * 10;
      item.y = Math.round((dropPoint.y - item.height / 2) / 10) * 10;
    } else {
      const cx = klass.room.width / 2 - item.width / 2;
      const cy = klass.room.height / 2 - item.height / 2;
      item.x = Math.round(cx / 10) * 10;
      item.y = Math.round(cy / 10) * 10;
    }
    addFurniture(klass.id, item);
  }

  function handlePlaceFurniture(kind: FurnitureKind) {
    if (!klass) return;
    // Windows route through the params dialog so the user can pick pane count
    // before placement, mirroring the multi-desk dialog flow.
    if (kind === "window") {
      setParamsDialog({ open: true, kind: "window", dropPoint: null });
      return;
    }
    const item = makeFurniture(kind, 0, 0);
    const cx = klass.room.width / 2 - item.width / 2;
    const cy = klass.room.height / 2 - item.height / 2;
    item.x = Math.round(cx / 10) * 10;
    item.y = Math.round(cy / 10) * 10;
    addFurniture(klass.id, item);
  }

  function handlePaletteDragStart(
    kind: DeskKind | FurnitureKind,
    type: PaletteDragType,
    clientX: number,
    clientY: number,
  ) {
    setPaletteDrag({
      kind,
      type,
      startX: clientX,
      startY: clientY,
      x: clientX,
      y: clientY,
      active: false,
    });
  }

  /** Build per-item patch maps from a list of SelectedItems and pipe them
   *  into the bulk store action so the temporal middleware records ONE
   *  history entry per user action (not N entries for N items). */
  function applyItemPatches(
    items: SelectedItem[],
    patchFor: (it: SelectedItem) => Partial<Desk> | Partial<Furniture> | null,
  ) {
    if (!klass) return;
    const deskPatches: Record<DeskId, Partial<Desk>> = {};
    const furniturePatches: Record<FurnitureId, Partial<Furniture>> = {};
    for (const it of items) {
      const patch = patchFor(it);
      if (!patch) continue;
      // The cast is safe: the caller's patchFor returns shapes matching
      // it.kind, and the union type only loses the discriminator across
      // the function boundary. We assign by kind, so the runtime types
      // are always correct.
      if (it.kind === "desk") deskPatches[it.entity.id] = patch as Partial<Desk>;
      else furniturePatches[it.entity.id] = patch as Partial<Furniture>;
    }
    updateRoomItems(klass.id, deskPatches, furniturePatches);
  }

  function handleAlignVertical() {
    if (!klass || selectedItemIds.length < 2) return;
    const items = collectSelectedItems(klass.room.desks, klass.room.furniture ?? [], selectedItemIds);
    const minX = Math.min(...items.map((it) => it.entity.x));
    const maxX = Math.max(...items.map((it) => it.entity.x + it.entity.width));
    const centerX = (minX + maxX) / 2;
    applyItemPatches(items, (it) => {
      const newX = Math.round(centerX - it.entity.width / 2);
      return it.entity.x === newX ? null : { x: newX };
    });
  }

  function handleAlignHorizontal() {
    if (!klass || selectedItemIds.length < 2) return;
    const items = collectSelectedItems(klass.room.desks, klass.room.furniture ?? [], selectedItemIds);
    const minY = Math.min(...items.map((it) => it.entity.y));
    const maxY = Math.max(...items.map((it) => it.entity.y + it.entity.height));
    const centerY = (minY + maxY) / 2;
    applyItemPatches(items, (it) => {
      const newY = Math.round(centerY - it.entity.height / 2);
      return it.entity.y === newY ? null : { y: newY };
    });
  }

  function handleDistributeVertical() {
    if (!klass || selectedItemIds.length < 3) return;
    const items = collectSelectedItems(klass.room.desks, klass.room.furniture ?? [], selectedItemIds)
      .slice()
      .sort((a, b) => a.entity.y - b.entity.y);
    const minY = items[0].entity.y;
    const maxY = items[items.length - 1].entity.y;
    const step = (maxY - minY) / (items.length - 1);
    const targetY = new Map<string, number>();
    items.forEach((it, i) => targetY.set(it.entity.id, Math.round(minY + i * step)));
    applyItemPatches(items, (it) => {
      const newY = targetY.get(it.entity.id);
      return newY == null || newY === it.entity.y ? null : { y: newY };
    });
  }

  function handleDistributeHorizontal() {
    if (!klass || selectedItemIds.length < 3) return;
    const items = collectSelectedItems(klass.room.desks, klass.room.furniture ?? [], selectedItemIds)
      .slice()
      .sort((a, b) => a.entity.x - b.entity.x);
    const minX = items[0].entity.x;
    const maxX = items[items.length - 1].entity.x;
    const step = (maxX - minX) / (items.length - 1);
    const targetX = new Map<string, number>();
    items.forEach((it, i) => targetX.set(it.entity.id, Math.round(minX + i * step)));
    applyItemPatches(items, (it) => {
      const newX = targetX.get(it.entity.id);
      return newX == null || newX === it.entity.x ? null : { x: newX };
    });
  }

  // Mirror selected items across the selection's vertical center axis.
  //
  // A true horizontal flip is `scaleX = -1` about the center. Since the
  // model doesn't store scale, we apply the equivalent decomposition:
  //   1. reflect each item's position about the bbox centerX
  //   2. negate rotation (rotation → -rotation, normalized to [0, 360))
  //   3. mirror seat offsets within each desk (offsetX → desk.width - offsetX)
  // Together these make a triangle desk face the opposite direction after
  // the flip while preserving its seat-on-apex relationship.
  function handleFlipHorizontal() {
    if (!klass || selectedItemIds.length < 1) return;
    const items = collectSelectedItems(klass.room.desks, klass.room.furniture ?? [], selectedItemIds);
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

  // Vertical flip = horizontal flip composed with a 180° rotation, so:
  //   rotation → 180 - rotation (normalized).
  function handleFlipVertical() {
    if (!klass || selectedItemIds.length < 1) return;
    const items = collectSelectedItems(klass.room.desks, klass.room.furniture ?? [], selectedItemIds);
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

  function normalizeAngle(deg: number): number {
    return ((deg % 360) + 360) % 360;
  }

  function handleClear() {
    if (!klass) return;
    const occupied = Object.keys(klass.currentAssignments ?? {}).length;
    if (occupied === 0) return;
    const ok = confirm(
      `Empty all ${occupied} seat${occupied === 1 ? "" : "s"}? The desks themselves stay put — this only removes who's sitting where.`,
    );
    if (!ok) return;
    setAssignmentsStore(klass.id, {});
    setWarning(null);
    setInfo(null);
  }

  function handleRandomize() {
    if (!klass) return;
    setWarning(null);
    setInfo(null);
    const occupied = Object.keys(klass.currentAssignments ?? {}).length;
    if (occupied > 0) {
      const ok = confirm(
        `This will overwrite the current arrangement (${occupied} student${occupied === 1 ? "" : "s"} placed). Continue?`,
      );
      if (!ok) return;
    }
    const result = assign({ room: klass.room, students: klass.students, history: klass.arrangements });
    if (!result.ok) {
      setWarning(result.reason);
      return;
    }
    setAssignmentsStore(klass.id, result.assignments);
    const totalSeats = klass.room.desks.reduce((n, d) => n + d.seats.length, 0);
    const emptySeats = totalSeats - Object.keys(result.assignments).length;
    if (emptySeats > 0) {
      setInfo(`${emptySeats} seat${emptySeats === 1 ? "" : "s"} left empty (more seats than students).`);
    }
  }

  function handleSaveArrangement() {
    if (!klass) return;
    const occupied = Object.keys(klass.currentAssignments ?? {}).length;
    if (occupied === 0) {
      setWarning("Nothing to save — assign students first (try Randomize).");
      return;
    }
    const label = prompt("Label for this arrangement (optional):") ?? undefined;
    saveArrangement(klass.id, label || undefined);
    setWarning(null);
  }

  /**
   * Wraps an export call so the active selection (which paints desks blue) is
   * cleared before the snapshot, then restored. flushSync forces React to
   * commit the deselect before exportStageAsPng walks the Konva tree —
   * without it, the React render is async and the snapshot would still see
   * the selected fills.
   */
  function exportDeselected(filename: string, mode: "transparent" | "print") {
    if (!stageRef.current) return;
    const wasSelected = selectedItemIds;
    flushSync(() => setSelectedItemIds([]));
    try {
      exportStageAsPng(stageRef.current, filename, mode);
    } finally {
      setSelectedItemIds(wasSelected);
    }
  }

  function handleExportImage() {
    if (!klass) return;
    const date = new Date().toISOString().slice(0, 10);
    exportDeselected(`${klass.name.replace(/\s+/g, "_")}_${date}`, "transparent");
  }

  function handleExportPrint() {
    if (!klass) return;
    const date = new Date().toISOString().slice(0, 10);
    exportDeselected(`${klass.name.replace(/\s+/g, "_")}_${date}`, "print");
  }

  function handleAssignSeat(seatId: SeatId, studentId: StudentId | null) {
    if (!klass) return;
    assignSeatStore(klass.id, seatId, studentId);
  }

  /**
   * Apply a fill color (or clear it back to the kind default when fill is
   * undefined) to every selected desk + furniture item. Stroke + text-color
   * for the affected items derive automatically inside DeskNode/FurnitureNode.
   */
  function applyColorToSelection(fill: string | undefined) {
    if (!klass || selectedItemIds.length === 0) return;
    const items = collectSelectedItems(klass.room.desks, klass.room.furniture ?? [], selectedItemIds);
    applyItemPatches(items, () => ({ fill }));
  }

  function handleSetColor(fill: string) { applyColorToSelection(fill); }
  function handleResetColor() { applyColorToSelection(undefined); }

  /**
   * Box / circle furniture have a user-typed label drawn inside the shape.
   * Right-click + double-click on those shapes route here. Simple prompt()
   * for v1; a proper inline editor would be a Phase 6 polish.
   */
  function handleRequestFurnitureRename(furnitureId: string) {
    if (!klass) return;
    const item = klass.room.furniture?.find((f) => f.id === furnitureId);
    if (!item || (item.kind !== "box" && item.kind !== "circle")) return;
    const next = window.prompt("Label:", item.label ?? "");
    if (next == null) return; // cancel
    const trimmed = next.trim();
    updateFurniture(klass.id, item.id, { label: trimmed.length > 0 ? trimmed : undefined });
  }

  return (
    <div className="flex h-full min-h-0">
      <DeskPalette
        collapsed={paletteCollapsed}
        onToggleCollapsed={() => setPaletteCollapsed((c) => !c)}
        onPlaceSingle={handlePlaceSingle}
        onOpenMulti={handleOpenMulti}
        onPlaceFurniture={handlePlaceFurniture}
        onPaletteDragStart={handlePaletteDragStart}
        room={klass.room}
        onUpdateRoom={(patch) => updateRoom(klass.id, patch)}
        selectionSize={selectedItemIds.length}
        onAlignVertical={handleAlignVertical}
        onAlignHorizontal={handleAlignHorizontal}
        onDistributeVertical={handleDistributeVertical}
        onDistributeHorizontal={handleDistributeHorizontal}
        onFlipHorizontal={handleFlipHorizontal}
        onFlipVertical={handleFlipVertical}
        onSetColor={handleSetColor}
        onResetColor={handleResetColor}
        locked={locked}
        onToggleLocked={() => setLocked((l) => !l)}
        showGrid={showGrid}
        onToggleGrid={() => setShowGrid((g) => !g)}
      />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <RoomStage
          ref={stageRef}
          room={klass.room}
          selectedItemIds={selectedItemIds}
          onSelectionChange={setSelectedItemIds}
          students={klass.students}
          assignments={assignments}
          onAssignSeat={handleAssignSeat}
          onRequestFurnitureRename={handleRequestFurnitureRename}
          classId={klass.id}
          locked={locked}
          showGrid={showGrid}
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
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded bg-white/85 px-2 py-1 text-[10px] text-ink-muted shadow-sm">
          <Icon name="help-circle" size={10} className="mr-1 inline -mt-0.5" />
          Tip: right-click a desk to mark its seats as front-row
        </div>
      </div>
      <AssignmentPanel
        collapsed={panelCollapsed}
        onToggleCollapsed={() => setPanelCollapsed((c) => !c)}
        klass={klass}
        assignments={assignments}
        onAssignSeat={handleAssignSeat}
        onRandomize={handleRandomize}
        onClear={handleClear}
        onSave={handleSaveArrangement}
        onExportImage={handleExportImage}
        onExportPrint={handleExportPrint}
        onSelectDesk={(deskId) => setSelectedItemIds([deskId])}
      />
      <MultiShapeParamsDialog
        open={paramsDialog.open}
        onOpenChange={(open) =>
          setParamsDialog((p) => (open ? { ...p, open } : { open: false, kind: null, dropPoint: null }))
        }
        kind={paramsDialog.kind}
        dropPoint={paramsDialog.dropPoint}
        onConfirm={handleConfirmMulti}
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
