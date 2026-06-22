import { useMemo } from "react";
import type { ClassRoom, NameDisplayMode, Room, SeatId, StudentId } from "@/types";
import { roomSeats } from "@/lib/adjacency";
import Icon from "@/components/Icon";

interface Props {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  klass: ClassRoom;
  /** The room being seated (the active room when the class uses several). */
  room: Room;
  assignments: Record<SeatId, StudentId>;
  onAssignSeat: (seatId: SeatId, studentId: StudentId | null) => void;
  onRandomize: () => void;
  onClear: () => void;
  onSave: () => void;
  /** Open the unified Export dialog (PNG, print, BW, toggles all live there). */
  onExport: () => void;
  /** Select the given desk on the canvas. Called when the user clicks a seat
   *  or a seated student row in this panel. */
  onSelectDesk?: (deskId: string) => void;
  /** The class's rooms — shows a switcher dropdown when there's more than one. */
  classRooms?: Room[];
  activeRoomId?: string;
  onChangeRoom?: (roomId: string) => void;
  /** Open the room layout editor for the active room. */
  onEditRoom?: () => void;
  /** Per-class chart name display + setter (renders a small selector). */
  nameDisplay?: NameDisplayMode;
  onChangeNameDisplay?: (mode: NameDisplayMode) => void;
}

export default function AssignmentPanel({
  collapsed,
  onToggleCollapsed,
  klass,
  room,
  assignments,
  onAssignSeat,
  onRandomize,
  onClear,
  onSave,
  onExport,
  onSelectDesk,
  classRooms = [],
  activeRoomId,
  onChangeRoom,
  onEditRoom,
  nameDisplay,
  onChangeNameDisplay,
}: Props) {
  const seats = useMemo(() => roomSeats(room), [room]);
  const seated = new Set(Object.values(assignments));
  const unseated = klass.students.filter((s) => !seated.has(s.id));

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-r border-slate-200 bg-white py-2">
        <button
          className="rounded p-1.5 text-ink-muted hover:bg-slate-100"
          onClick={onToggleCollapsed}
          title="Expand assignments panel"
        >
          <Icon name="chevrons-right" size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Assignments
        </span>
        <button
          className="rounded p-1 text-ink-muted hover:bg-slate-100"
          onClick={onToggleCollapsed}
          title="Collapse panel"
        >
          <Icon name="chevrons-left" size={14} />
        </button>
      </div>

      {/* Room switcher (only when the class uses more than one room) + the
          prominent "Edit <room>" jump to the layout editor. */}
      <div className="space-y-2 border-b border-slate-200 p-3">
        {classRooms.length > 1 && onChangeRoom && (
          <label className="block">
            <span className="label mb-1 block">Room</span>
            <select className="input" value={activeRoomId ?? ""} onChange={(e) => onChangeRoom(e.target.value)}>
              {classRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {onEditRoom && (
          <button className="btn-secondary w-full" onClick={onEditRoom} title="Edit this room's desk layout">
            <Icon name="edit" size={14} />
            Edit {room.name}
          </button>
        )}
        {onChangeNameDisplay && (
          <label className="block">
            <span className="label mb-1 block">Names on chart</span>
            <select
              className="input"
              value={nameDisplay ?? "collision"}
              onChange={(e) => onChangeNameDisplay(e.target.value as NameDisplayMode)}
              title="How student names appear on the seating chart"
            >
              <option value="collision">Smart (first, +initial if shared)</option>
              <option value="first">First name</option>
              <option value="first-initial">First + last initial</option>
              <option value="full">Full name</option>
              <option value="number">Student number</option>
            </select>
          </label>
        )}
      </div>

      <div className="space-y-2 border-b border-slate-200 p-3">
        <button className="btn-primary w-full" onClick={onRandomize}>
          <Icon name="shuffle" size={14} />
          Randomize seating
        </button>
        <button
          className="btn-secondary w-full"
          onClick={onClear}
          disabled={Object.keys(assignments).length === 0}
          title="Empty every seat (the desks themselves stay put)"
        >
          <Icon name="x" size={14} />
          Clear assignments
        </button>
        <button className="btn-secondary w-full" onClick={onSave}>
          <Icon name="save" size={14} />
          Save this arrangement
        </button>
        <button
          className="btn-secondary w-full"
          onClick={onExport}
          title="PNG download or print preview, with toggles for names and markers"
        >
          <Icon name="download" size={14} />
          Download or print
        </button>
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
              const selectable = !!onSelectDesk;
              return (
                <li
                  key={s.seatId}
                  className={
                    "flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-slate-50" +
                    (selectable ? " cursor-pointer" : "")
                  }
                  onClick={() => onSelectDesk?.(s.deskId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectDesk?.(s.deskId);
                    }
                  }}
                  role={selectable ? "button" : undefined}
                  tabIndex={selectable ? 0 : undefined}
                  title={selectable ? "Select this desk on the canvas" : undefined}
                >
                  <span className="text-xs text-ink-muted">
                    Seat {idx + 1}{s.isFrontRow && <span className="ml-1 text-amber-700">·front</span>}
                  </span>
                  <span className="flex-1 truncate text-right">
                    {student?.name ?? <em className="text-ink-muted">empty</em>}
                  </span>
                  {student && (
                    <button
                      className="rounded p-0.5 text-ink-muted hover:bg-red-50 hover:text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAssignSeat(s.seatId, null);
                      }}
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
