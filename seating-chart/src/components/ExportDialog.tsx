import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type Konva from "konva";
import RoomStage from "@/components/canvas/RoomStage";
import { exportStageAsPng, renderStageToPngDataUrl } from "@/lib/exportPng";
import { rotatedItemAABB, unionAABB } from "@/lib/geometry";
import type { Arrangement, ClassRoom } from "@/types";
import Icon from "@/components/Icon";

/**
 * Unified export dialog. Replaces the legacy PNG / Print buttons that lived
 * in the Assignment panel. Renders a live preview using a read-only RoomStage
 * so what the user sees in the dialog matches what the downloaded PNG looks
 * like — including the visibility toggles for names + front-row markers.
 *
 * The export path uses the dialog's preview stage (not the editor stage), so
 * toggles never disturb the underlying editor canvas.
 *
 * Pass `arrangement` to export a saved arrangement; pass null to export the
 * live current assignments.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  klass: ClassRoom;
  arrangement: Arrangement | null;
}

const DEFAULT_CLASS_LABEL_SIZE = 24;

export default function ExportDialog({ open, onOpenChange, klass, arrangement }: Props) {
  const [showFloor, setShowFloor] = useState(true);
  const [showBackground, setShowBackground] = useState(false);
  const [blackAndWhite, setBlackAndWhite] = useState(false);
  const [showNames, setShowNames] = useState(true);
  const [showFrontRowMarkers, setShowFrontRowMarkers] = useState(false);
  const [showFrontWallLabel, setShowFrontWallLabel] = useState(true);
  const [showClassName, setShowClassName] = useState(true);
  const [classNameSize, setClassNameSize] = useState(DEFAULT_CLASS_LABEL_SIZE);
  const stageRef = useRef<Konva.Stage>(null);

  // Reset toggles to defaults each time the dialog opens so a previous
  // session's choices don't carry forward unexpectedly.
  useEffect(() => {
    if (open) {
      setShowFloor(true);
      setShowBackground(false);
      setBlackAndWhite(false);
      setShowNames(true);
      setShowFrontRowMarkers(false);
      setShowFrontWallLabel(true);
      setShowClassName(true);
      setClassNameSize(DEFAULT_CLASS_LABEL_SIZE);
    }
  }, [open]);

  const assignments = arrangement?.assignments ?? klass.currentAssignments ?? {};
  const roomBackgroundFill = showFloor
    ? klass.room.background
    : "rgba(0,0,0,0)";
  const backgroundFill = showBackground ? "#ffffff" : undefined;

  function buildFilename(): string {
    const date = new Date(arrangement?.createdAt ?? Date.now()).toISOString().slice(0, 10);
    const safeClass = klass.name.replace(/\s+/g, "_");
    const safeLabel = arrangement?.label ? `_${arrangement.label.replace(/\s+/g, "_")}` : "";
    return `${safeClass}${safeLabel}_${date}`;
  }

  function handleDownload() {
    if (!stageRef.current) return;
    exportStageAsPng(stageRef.current, buildFilename(), {
      blackAndWhite,
      hideNames: !showNames,
      hideFrontRowMarkers: !showFrontRowMarkers,
      pixelRatio: 4,
    });
  }

  function handlePrint() {
    if (!stageRef.current) return;
    // Render the stage to a high-res PNG via the same prep/restore pipeline
    // the download path uses, then open it in a new window and trigger that
    // window's print dialog. The user gets a clean print of just the chart.
    const dataUrl = renderStageToPngDataUrl(stageRef.current, {
      blackAndWhite,
      hideNames: !showNames,
      hideFrontRowMarkers: !showFrontRowMarkers,
      pixelRatio: 4,
    });
    // Pick page orientation that best fits the chart's actual rendered
    // shape (room + items, including outward door arcs). Landscape if it's
    // wider than tall, portrait otherwise. Keeping margin: 0 strips the
    // browser's default URL/date/page-number headers + footers.
    const fit = computeFitBounds(klass);
    const orientation = fit.width >= fit.height ? "landscape" : "portrait";
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    const titleSafe = (klass.name + (arrangement?.label ? ` — ${arrangement.label}` : ""))
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;");
    w.document.write(
      `<!doctype html><html><head><title>${titleSafe}</title>` +
        `<style>` +
        `@page { size: ${orientation}; margin: 0; }` +
        `html, body { margin: 0; height: 100%; background: #fff; }` +
        `body { display: flex; align-items: center; justify-content: center; }` +
        `img { max-width: 100%; max-height: 100%; object-fit: contain; }` +
        `@media print { html, body { background: #fff; } }` +
        `</style>` +
        `</head><body><img src="${dataUrl}" onload="window.focus();window.print();"/></body></html>`,
    );
    w.document.close();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[92vw] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-white p-5 shadow-xl focus:outline-none">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-semibold">
                {arrangement
                  ? `Export "${arrangement.label || "untitled"}"`
                  : "Export current arrangement"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-ink-muted">
                Live preview reflects every option below.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="rounded p-1 text-ink-muted hover:bg-slate-100 hover:text-ink"
                aria-label="Close"
              >
                <Icon name="x" size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="grid min-h-[20rem] flex-1 grid-cols-[14rem_1fr] gap-4 overflow-hidden">
            <aside className="space-y-4 overflow-y-auto pr-2">
              <Segmented
                label="Color"
                options={[
                  { value: "color", label: "Color" },
                  { value: "bw", label: "B&W" },
                ]}
                value={blackAndWhite ? "bw" : "color"}
                onChange={(v) => setBlackAndWhite(v === "bw")}
              />
              <fieldset>
                <legend className="label mb-2">Show</legend>
                <div className="space-y-1.5">
                  <CheckboxRow label="Floor color" checked={showFloor} onChange={setShowFloor} />
                  <CheckboxRow
                    label="White background"
                    checked={showBackground}
                    onChange={setShowBackground}
                  />
                  <CheckboxRow label="Student names" checked={showNames} onChange={setShowNames} />
                  <CheckboxRow
                    label="Front-row markers"
                    checked={showFrontRowMarkers}
                    onChange={setShowFrontRowMarkers}
                  />
                  <CheckboxRow
                    label="Front-of-room label"
                    checked={showFrontWallLabel}
                    onChange={setShowFrontWallLabel}
                  />
                  <CheckboxRow
                    label="Class name"
                    checked={showClassName}
                    onChange={setShowClassName}
                  />
                </div>
              </fieldset>
              {/* Class-name size slider — only meaningful while the class
                  name is shown, so disable when the toggle is off. The
                  reset icon snaps back to the default size for users who
                  drag the slider far away and want to start over. */}
              <div>
                <div className="label mb-1 flex items-center justify-between">
                  <span>Name size</span>
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-ink-muted">
                      {classNameSize}px
                    </span>
                    <button
                      type="button"
                      onClick={() => setClassNameSize(DEFAULT_CLASS_LABEL_SIZE)}
                      disabled={!showClassName || classNameSize === DEFAULT_CLASS_LABEL_SIZE}
                      title="Reset to default size"
                      aria-label="Reset name size"
                      className="rounded p-0.5 text-ink-muted hover:bg-ink/5 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <Icon name="rotate-ccw" size={12} />
                    </button>
                  </span>
                </div>
                <input
                  type="range"
                  min={12}
                  max={128}
                  step={1}
                  value={classNameSize}
                  onChange={(e) => setClassNameSize(Number(e.target.value))}
                  disabled={!showClassName}
                  className="w-full"
                />
              </div>
            </aside>

            {/* Preview surface. When the export will be transparent (no
                "White background" toggle), we paint a checker pattern under
                the Konva stage so the user can see where transparency lands.
                The B&W toggle is rendered as a CSS grayscale filter so the
                live preview matches the desaturated PNG output. */}
            <div
              className="min-h-0 overflow-hidden rounded border border-slate-200"
              style={{
                ...(showBackground
                  ? { backgroundColor: "#fff" }
                  : {
                      backgroundColor: "#fff",
                      backgroundImage:
                        "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)",
                      backgroundSize: "16px 16px",
                      backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
                    }),
                filter: blackAndWhite ? "grayscale(1)" : undefined,
              }}
            >
              <RoomStage
                ref={stageRef}
                interactive={false}
                room={klass.room}
                students={klass.students}
                assignments={assignments}
                classId={klass.id}
                showFrontWallLabel={showFrontWallLabel}
                showNames={showNames}
                showFrontRowMarkers={showFrontRowMarkers}
                showEmptySeatDots={false}
                roomBackgroundFill={roomBackgroundFill}
                backgroundFill={backgroundFill}
                fitContents
                classNameLabel={showClassName ? klass.name : undefined}
                classNameLabelSize={classNameSize}
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="btn-secondary">Cancel</button>
            </Dialog.Close>
            <button className="btn-secondary" onClick={handlePrint} title="Open a print dialog with this chart">
              <Icon name="printer" size={14} />
              Print
            </button>
            <button className="btn-primary" onClick={handleDownload}>
              <Icon name="download" size={14} />
              Download PNG
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Compute the room+items camera frame that the preview uses, so the print
 *  page orientation can be picked from the same shape the user sees. */
function computeFitBounds(klass: ClassRoom): { width: number; height: number } {
  let union = { x: 0, y: 0, width: klass.room.width, height: klass.room.height };
  for (const d of klass.room.desks) union = unionAABB(union, rotatedItemAABB(d));
  for (const f of klass.room.furniture ?? []) union = unionAABB(union, rotatedItemAABB(f));
  return { width: union.width, height: union.height };
}

interface SegmentedProps {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}

/** Two-or-three-option segmented control. Used for Color rather than a
 *  native <select> so the choices are always visible. */
function Segmented({ label, options, value, onChange }: SegmentedProps) {
  return (
    <div>
      <div className="label mb-2">{label}</div>
      <div className="inline-flex w-full overflow-hidden rounded-md border border-ink/20">
        {options.map((opt, i) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              className={
                "flex-1 px-2 py-1.5 text-xs font-medium transition " +
                (active
                  ? "bg-ink text-paper"
                  : "bg-paper text-ink hover:bg-ink/5") +
                (i > 0 ? " border-l border-ink/20" : "")
              }
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface CheckboxRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function CheckboxRow({ label, checked, onChange }: CheckboxRowProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
