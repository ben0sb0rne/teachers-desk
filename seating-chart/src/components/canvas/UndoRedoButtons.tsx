import { useStore } from "zustand";
import { useAppStore } from "@/store/appStore";
import Icon from "@/components/Icon";

/** Visible Undo/Redo wired to the zundo temporal store (the same history that
 *  Ctrl+Z / Ctrl+Y drive in AppShell). Surfaced in the room editor + seating
 *  panel so the shortcut is discoverable. */
export default function UndoRedoButtons() {
  const canUndo = useStore(useAppStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useAppStore.temporal, (s) => s.futureStates.length > 0);
  return (
    <div className="flex items-center gap-1">
      <button
        className="btn-secondary flex-1 justify-center"
        onClick={() => useAppStore.temporal.getState().undo()}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
      >
        <Icon name="rotate-ccw" size={14} />
        <span className="text-xs">Undo</span>
      </button>
      <button
        className="btn-secondary flex-1 justify-center"
        onClick={() => useAppStore.temporal.getState().redo()}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
      >
        <Icon name="rotate-cw" size={14} />
        <span className="text-xs">Redo</span>
      </button>
    </div>
  );
}
