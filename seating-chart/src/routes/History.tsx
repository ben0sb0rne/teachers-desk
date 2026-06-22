import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAppStore } from "@/store/appStore";
import RoomStage from "@/components/canvas/RoomStage";
import ConfirmDialog from "@/components/ConfirmDialog";
import TextInputDialog from "@/components/TextInputDialog";
import ExportDialog from "@/components/ExportDialog";
import Icon from "@/components/Icon";
import type { Arrangement, ArrangementId, Room } from "@/types";

/** Discriminated state for the History route's confirm dialog. `restore` is
 *  only triggered when the live arrangement isn't empty (else we just restore
 *  silently). `delete` is always confirmed. */
type PendingConfirm =
  | { kind: "restore"; arrangementId: ArrangementId }
  | { kind: "delete"; arrangementId: ArrangementId };

export default function History() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const klass = useAppStore((s) => (id ? s.classes.find((c) => c.id === id) : undefined));
  const rooms = useAppStore((s) => s.rooms);
  const deleteArrangement = useAppStore((s) => s.deleteArrangement);
  const restoreArrangement = useAppStore((s) => s.restoreArrangement);
  const renameArrangement = useAppStore((s) => s.renameArrangement);

  // A class's arrangements are per-room — pick which room's history to show
  // (from the switcher, else a ?room= deep-link, else the class's first room).
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const seatingRoomIds = klass ? klass.seatings.map((se) => se.roomId) : [];
  const paramRoom = searchParams.get("room");
  const effectiveRoomId =
    activeRoomId && seatingRoomIds.includes(activeRoomId)
      ? activeRoomId
      : paramRoom && seatingRoomIds.includes(paramRoom)
        ? paramRoom
        : seatingRoomIds[0] ?? null;
  const activeRoom = rooms.find((r) => r.id === effectiveRoomId);
  const activeSeating = klass && effectiveRoomId ? klass.seatings.find((se) => se.roomId === effectiveRoomId) : undefined;
  const classRooms: Room[] = klass
    ? klass.seatings.map((se) => rooms.find((r) => r.id === se.roomId)).filter((r): r is Room => !!r)
    : [];
  const arrangements = activeSeating?.arrangements ?? [];

  /** When set, the View dialog (ExportDialog) is open for this arrangement. */
  const [exporting, setExporting] = useState<Arrangement | null>(null);
  /** When set, the rename text input is open for this arrangement. */
  const [renaming, setRenaming] = useState<Arrangement | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  if (!klass) return <div className="p-6 text-ink-muted">Class not found.</div>;

  function handleRestoreClick(arrangementId: ArrangementId) {
    if (!klass || !effectiveRoomId) return;
    const hasLive = activeSeating && Object.keys(activeSeating.currentAssignments).length > 0;
    if (hasLive) {
      setPending({ kind: "restore", arrangementId });
      return;
    }
    restoreArrangement(klass.id, effectiveRoomId, arrangementId);
    navigate(`/classes/${klass.id}/room?room=${effectiveRoomId}`);
  }

  function handlePendingConfirm() {
    if (!klass || !pending || !effectiveRoomId) return;
    if (pending.kind === "restore") {
      restoreArrangement(klass.id, effectiveRoomId, pending.arrangementId);
      navigate(`/classes/${klass.id}/room?room=${effectiveRoomId}`);
    } else {
      deleteArrangement(klass.id, effectiveRoomId, pending.arrangementId);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-ink">History · {klass.name}</h1>
        {classRooms.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            Room
            <select
              className="input w-auto py-1"
              value={effectiveRoomId ?? ""}
              onChange={(e) => setActiveRoomId(e.target.value)}
            >
              {classRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="mb-6 text-sm text-ink-muted">
        Saved seating arrangements{activeRoom ? ` for ${activeRoom.name}` : ""}. View opens an export-ready
        preview; Restore reloads it on the seating canvas.
      </p>

      {effectiveRoomId == null ? (
        <div className="card p-8 text-center text-ink-muted">
          This class has no rooms yet. Attach a room from the Classes page or the Seating screen to start saving arrangements.
        </div>
      ) : arrangements.length === 0 ? (
        <div className="card p-8 text-center text-ink-muted">
          No arrangements saved yet for {activeRoom?.name}. Use Randomize on the seating screen, then click Save.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {arrangements.map((arr) => (
            <li key={arr.id} className="card overflow-hidden">
              <div className="relative aspect-[4/3] bg-slate-50">
                {activeRoom && (
                  <div className="absolute inset-0 flex">
                    <RoomStage
                      interactive={false}
                      room={activeRoom}
                      students={klass.students}
                      assignments={arr.assignments}
                      roomId={activeRoom.id}
                      showFrontWallLabel={false}
                      showFrontRowMarkers={false}
                      showEmptySeatDots={false}
                      fitContents
                      framePadding={12}
                      nameDisplay={klass.nameDisplay}
                    />
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="mb-2">
                  <div className="truncate text-sm font-medium" title={arr.label || "(untitled)"}>
                    {arr.label || "(untitled)"}
                  </div>
                  <div className="text-xs text-ink-muted">{new Date(arr.createdAt).toLocaleString()}</div>
                  <div className="text-xs text-ink-muted">
                    {Object.keys(arr.assignments).length} students seated
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button className="btn-secondary" onClick={() => setExporting(arr)} title="View + export this arrangement">
                    <Icon name="eye" size={14} />
                    View
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => handleRestoreClick(arr.id)}
                    title="Load this arrangement back onto the seating canvas"
                  >
                    Restore
                  </button>
                  <button className="btn-secondary" onClick={() => setRenaming(arr)} title="Rename this arrangement">
                    <Icon name="edit" size={14} />
                    Rename
                  </button>
                  <button className="btn-danger" onClick={() => setPending({ kind: "delete", arrangementId: arr.id })}>
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {activeRoom && (
        <ExportDialog
          open={exporting != null}
          onOpenChange={(open) => { if (!open) setExporting(null); }}
          klass={klass}
          room={activeRoom}
          assignments={activeSeating?.currentAssignments ?? {}}
          arrangement={exporting}
        />
      )}

      <TextInputDialog
        open={renaming != null}
        onOpenChange={(open) => { if (!open) setRenaming(null); }}
        title="Rename arrangement"
        description="Give this arrangement a new label. Leave blank to clear it."
        placeholder="e.g. October seating chart"
        initialValue={renaming?.label ?? ""}
        submitLabel="Save"
        allowEmpty
        onSubmit={(value) => {
          if (renaming && effectiveRoomId) renameArrangement(klass.id, effectiveRoomId, renaming.id, value);
        }}
      />

      <ConfirmDialog
        open={pending != null}
        onOpenChange={(open) => { if (!open) setPending(null); }}
        title={
          pending?.kind === "restore"
            ? "Replace the current seating?"
            : pending?.kind === "delete"
              ? "Delete this arrangement?"
              : ""
        }
        description={
          pending?.kind === "restore"
            ? "This swaps the live seating on the seating canvas for the saved one. The live state isn't auto-saved, so unsaved placements will be lost."
            : pending?.kind === "delete"
              ? "This removes the saved arrangement from history. This cannot be undone."
              : undefined
        }
        confirmLabel={pending?.kind === "delete" ? "Delete" : "Restore"}
        danger={pending?.kind === "delete"}
        onConfirm={handlePendingConfirm}
      />
    </div>
  );
}
