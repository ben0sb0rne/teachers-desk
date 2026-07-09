import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";

interface Props {
  x: number;
  y: number;
  isFront: boolean;
  isExcluded: boolean;
  onToggleFront: () => void;
  onToggleExcluded: () => void;
  onClose: () => void;
}

/** Small right-click menu for a desk in the room editor: mark the desk's seats
 *  as front-row (orange dot) or "don't seat here" (red dot, skipped by the
 *  auto-seater). Positioned at the cursor like SeatPicker — Konva renders to a
 *  canvas, so the menu has to be an HTML overlay portaled to the body. */
export default function DeskContextMenu({
  x,
  y,
  isFront,
  isExcluded,
  onToggleFront,
  onToggleExcluded,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("touchstart", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("touchstart", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 w-52 rounded-md border border-ink/15 bg-paper p-1 text-sm shadow-lift"
      style={{ left: Math.min(x, window.innerWidth - 220), top: Math.min(y, window.innerHeight - 110) }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-ink/5"
        onClick={() => {
          onToggleFront();
          onClose();
        }}
      >
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#f59e0b" }} />
        <span className="flex-1">Front row</span>
        {isFront && <Icon name="check" size={14} />}
      </button>
      <button
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-ink/5"
        onClick={() => {
          onToggleExcluded();
          onClose();
        }}
      >
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#ef4444" }} />
        <span className="flex-1">Don't seat here</span>
        {isExcluded && <Icon name="check" size={14} />}
      </button>
    </div>,
    document.body,
  );
}
