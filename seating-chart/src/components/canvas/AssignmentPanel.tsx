import { useMemo } from "react";
import type { ClassRoom, SeatId, StudentId } from "@/types";
import { roomSeats } from "@/lib/adjacency";
import Icon from "@/components/Icon";

interface Props {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  klass: ClassRoom;
  assignments: Record<SeatId, StudentId>;
  onAssignSeat: (seatId: SeatId, studentId: StudentId | null) => void;
  onRandomize: () => void;
  onSave: () => void;
  onExportImage: () => void;
  onExportPrint: () => void;
}

export default function AssignmentPanel({
  collapsed,
  onToggleCollapsed,
  klass,
  assignments,
  onAssignSeat,
  onRandomize,
  onSave,
  onExportImage,
  onExportPrint,
}: Props) {
  const seats = useMemo(() => roomSeats(klass.room), [klass.room]);
  const seated = new Set(Object.values(assignments));
  const unseated = klass.students.filter((s) => !seated.has(s.id));

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-l border-slate-200 bg-white py-2">
        <button
          className="rounded p-1.5 text-ink-muted hover:bg-slate-100"
          onClick={onToggleCollapsed}
          title="Expand assignments panel"
        >
          <Icon name="chevrons-left" size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Assignments
        </span>
        <button
          className="rounded p-1 text-ink-muted hover:bg-slate-100"
          onClick={onToggleCollapsed}
          title="Collapse panel"
        >
          <Icon name="chevrons-right" size={14} />
        </button>
      </div>

      <div className="space-y-2 border-b border-slate-200 p-3">
        <button className="btn-primary w-full" onClick={onRandomize}>
          <Icon name="shuffle" size={14} />
          Randomize seating
        </button>
        <button className="btn-secondary w-full" onClick={onSave}>
          <Icon name="save" size={14} />
          Save this arrangement
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary" onClick={onExportImage} title="Transparent PNG, good for screens">
            <Icon name="image" size={14} />
            <span className="text-xs">PNG</span>
          </button>
          <button className="btn-secondary" onClick={onExportPrint} title="White background, good for paper">
            <Icon name="printer" size={14} />
            <span className="text-xs">Print</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="label">Seats</span>
          <span className="text-xs text-ink-muted">{Object.keys(assignments).length} / {seats.length}</span>
        </div>
        <ul className="space-y-1 text-sm">
          {seats.length === 0 ? (
            <li className="text-ink-muted">Add some desks to the room first.</li>
          ) : (
            seats.map((s, idx) => {
              const studentId = assignments[s.seatId];
              const student = studentId ? klass.students.find((x) => x.id === studentId) : undefined;
              return (
                <li key={s.seatId} className="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-slate-50">
                  <span className="text-xs text-ink-muted">
                    Seat {idx + 1}{s.isFrontRow && <span className="ml-1 text-amber-700">·front</span>}
                  </span>
                  <span className="flex-1 truncate text-right">
                    {student?.name ?? <em className="text-ink-muted">empty</em>}
                  </span>
                  {student && (
                    <button
                      className="rounded p-0.5 text-ink-muted hover:bg-red-50 hover:text-red-600"
                      onClick={() => onAssignSeat(s.seatId, null)}
                      title="Clear assignment"
                    >
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </li>
              );
            })
          )}
        </ul>

        {unseated.length > 0 && (
          <>
            <div className="label mb-2 mt-4">Not yet seated ({unseated.length})</div>
            <ul className="space-y-1 text-sm">
              {unseated.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-1 py-0.5">
                  <span className="truncate">{s.name}</span>
                  {s.needsFrontRow && <span className="text-xs text-amber-700">front</span>}
                  {s.keepApart.length > 0 && (
                    <span className="text-xs text-ink-muted">·{s.keepApart.length} kept apart</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}
