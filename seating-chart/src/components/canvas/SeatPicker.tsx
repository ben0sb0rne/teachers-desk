import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SeatId, Student, StudentId } from "@/types";

interface Props {
  x: number;
  y: number;
  students: Student[];
  assignments: Record<SeatId, StudentId>;
  seatId: SeatId;
  onPick: (studentId: StudentId | null) => void;
  onClose: () => void;
}

export default function SeatPicker({ x, y, students, assignments, seatId, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");

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

  const occupiedBy = new Set(Object.values(assignments));
  const currentStudent = assignments[seatId];

  const filtered = students.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()));

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 max-h-72 w-64 overflow-auto rounded-md border border-slate-200 bg-white p-2 shadow-xl"
      style={{ left: Math.min(x, window.innerWidth - 270), top: Math.min(y, window.innerHeight - 290) }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        className="input mb-2"
        placeholder="Find student…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        autoFocus
      />
      {currentStudent && (
        <button
          className="mb-2 w-full rounded px-2 py-1.5 text-left text-sm hover:bg-red-50 text-red-600"
          onClick={() => onPick(null)}
        >
          Clear assignment
        </button>
      )}
      {filtered.length === 0 ? (
        <div className="px-2 py-3 text-sm text-ink-muted">No matches.</div>
      ) : (
        filtered.map((s) => {
          const isHere = currentStudent === s.id;
          const isSeatedElsewhere = !isHere && occupiedBy.has(s.id);
          return (
            <button
              key={s.id}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50"
              onClick={() => onPick(s.id)}
            >
              <span>{s.name}</span>
              <span className="text-xs text-ink-muted">
                {isHere ? "current" : isSeatedElsewhere ? "(will move)" : ""}
              </span>
            </button>
          );
        })
      )}
    </div>,
    document.body,
  );
}
