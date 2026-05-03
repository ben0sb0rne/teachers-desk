import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppStore } from "@/store/appStore";
import RoomStage from "@/components/canvas/RoomStage";
import ConfirmDialog from "@/components/ConfirmDialog";
import TextInputDialog from "@/components/TextInputDialog";
import ExportDialog from "@/components/ExportDialog";
import Icon from "@/components/Icon";
import type { Arrangement, ArrangementId } from "@/types";

/** Discriminated state for the History route's confirm dialog. `restore` is
 *  only triggered when the live arrangement isn't empty (else we just restore
 *  silently). `delete` is always confirmed. */
type PendingConfirm =
  | { kind: "restore"; arrangementId: ArrangementId }
  | { kind: "delete"; arrangementId: ArrangementId };

export default function History() {
  const { id } = useParams();
  const navigate = useNavigate();
  const klass = useAppStore((s) => (id ? s.classes.find((c) => c.id === id) : undefined));
  const deleteArrangement = useAppStore((s) => s.deleteArrangement);
  const restoreArrangement = useAppStore((s) => s.restoreArrangement);
  const renameArrangement = useAppStore((s) => s.renameArrangement);

  /** When set, the View dialog (ExportDialog) is open for this arrangement. */
  const [exporting, setExporting] = useState<Arrangement | null>(null);
  /** When set, the rename text input is open for this arrangement. */
  const [renaming, setRenaming] = useState<Arrangement | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  if (!klass) return <div className="p-6 text-paper-on-wood/70">Class not found.</div>;

  function handleRestoreClick(arrangementId: ArrangementId) {
    if (!klass) return;
    const hasLive = Object.keys(klass.currentAssignments ?? {}).length > 0;
    if (hasLive) {
      setPending({ kind: "restore", arrangementId });
      return;
    }
    restoreArrangement(klass.id, arrangementId);
    navigate(`/classes/${klass.id}/room`);
  }

  function handlePendingConfirm() {
    if (!klass || !pending) return;
    if (pending.kind === "restore") {
      restoreArrangement(klass.id, pending.arrangementId);
      navigate(`/classes/${klass.id}/room`);
    } else {
      deleteArrangement(klass.id, pending.arrangementId);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Heading sits on wood-bg — use the always-light cream token. */}
      <h1 className="mb-1 text-xl font-bold text-paper-on-wood">History · {klass.name}</h1>
      <p className="mb-6 text-sm text-paper-on-wood/70">
        Previous seating arrangements. View opens an export-ready preview;
        Restore reloads the layout on the room canvas.
      </p>
      {klass.arrangements.length === 0 ? (
        <div className="card p-8 text-center text-ink-muted">
          No arrangements saved yet. Use Randomize on the room screen, then click Save.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {klass.arrangements.map((arr) => (
            <li key={arr.id} className="card overflow-hidden">
              {/* The thumbnail uses the same RoomStage the editor does, in
                  read-only mode. That guarantees the saved preview matches
                  what the user sees on the live canvas — no SVG drift. */}
              <div className="aspect-[4/3] bg-slate-50">
                <RoomStage
                  interactive={false}
                  room={klass.room}
                  students={klass.students}
                  assignments={arr.assignments}
                  classId={klass.id}
                  showFrontWallLabel={false}
                  showFrontRowMarkers={false}
                  showEmptySeatDots={false}
                  fitContents
                />
              </div>
              <div className="p-3">
                <div className="mb-2">
                  <div className="truncate text-sm font-medium" title={arr.label || "(untitled)"}>
                    {arr.label || "(untitled)"}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {new Date(arr.createdAt).toLocaleString()}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {Object.keys(arr.assignments).length} students seated
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    className="btn-secondary"
                    onClick={() => setExporting(arr)}
                    title="View + export this arrangement"
                  >
                    <Icon name="eye" size={14} />
                    View
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => handleRestoreClick(arr.id)}
                    title="Load this arrangement back onto the room canvas"
                  >
                    Restore
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => setRenaming(arr)}
                    title="Rename this arrangement"
                  >
                    <Icon name="edit" size={14} />
                    Rename
                  </button>
                  <button
                    className="btn-danger"
                    onClick={() => setPending({ kind: "delete", arrangementId: arr.id })}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ExportDialog
        open={exporting != null}
        onOpenChange={(open) => { if (!open) setExporting(null); }}
        klass={klass}
        arrangement={exporting}
      />

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
          if (renaming) renameArrangement(klass.id, renaming.id, value);
        }}
      />

      <ConfirmDialog
        open={pending != null}
        onOpenChange={(open) => { if (!open) setPending(null); }}
        title={
          pending?.kind === "restore"
            ? "Replace the current arrangement?"
            : pending?.kind === "delete"
              ? "Delete this arrangement?"
              : ""
        }
        description={
          pending?.kind === "restore"
            ? "This swaps the live seating on the room canvas for the saved one. The live state isn't auto-saved, so unsaved placements will be lost."
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
