import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { useAppStore } from "@/store/appStore";
import { FURNITURE_DEFAULTS } from "@/lib/furniture";
import ConfirmDialog from "@/components/ConfirmDialog";
import Icon from "@/components/Icon";
import type { Arrangement, ClassRoom, Desk, Furniture } from "@/types";
import { lightTokens, useThemeTokens } from "@/lib/theme-tokens";

/** Discriminated state for the History route's confirm dialog. `restore` is
 *  only triggered when the live arrangement isn't empty (else we just restore
 *  silently). `delete` is always confirmed. */
type PendingConfirm =
  | { kind: "restore"; arrangementId: string }
  | { kind: "delete"; arrangementId: string };

// accent-blue stays the same in light + dark, so a static reference is fine.
const ACCENT_BLUE = lightTokens.accentBlue;

export default function History() {
  const { id } = useParams();
  const navigate = useNavigate();
  const klass = useAppStore((s) => (id ? s.classes.find((c) => c.id === id) : undefined));
  const deleteArrangement = useAppStore((s) => s.deleteArrangement);
  const restoreArrangement = useAppStore((s) => s.restoreArrangement);
  const [viewing, setViewing] = useState<Arrangement | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  if (!klass) return <div className="p-6 text-paper-on-wood/70">Class not found.</div>;

  function handleRestoreClick(arrangementId: string) {
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
        Previous seating arrangements. View opens a read-only preview; Restore reloads the layout
        on the room canvas.
      </p>
      {klass.arrangements.length === 0 ? (
        <div className="card p-8 text-center text-ink-muted">
          No arrangements saved yet. Use Randomize on the room screen, then click Save.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {klass.arrangements.map((arr) => (
            <li key={arr.id} className="card overflow-hidden">
              <div className="aspect-[4/3] bg-slate-50">
                <Thumbnail klass={klass} arrangement={arr} />
              </div>
              <div className="p-3">
                <div className="mb-2">
                  <div className="text-sm font-medium">{arr.label || "(untitled)"}</div>
                  <div className="text-xs text-ink-muted">{new Date(arr.createdAt).toLocaleString()}</div>
                  <div className="text-xs text-ink-muted">
                    {Object.keys(arr.assignments).length} students seated
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    className="btn-secondary"
                    onClick={() => setViewing(arr)}
                    title="View this arrangement read-only"
                  >
                    <Icon name="eye" size={14} />
                    View
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => handleRestoreClick(arr.id)}
                  >
                    Restore
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

      <ViewArrangementDialog
        klass={klass}
        arrangement={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
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

function Thumbnail({ klass, arrangement }: { klass: ClassRoom; arrangement: Arrangement }) {
  const tokens = useThemeTokens();
  const w = klass.room.width;
  const h = klass.room.height;
  const frontWall = klass.room.frontWall ?? "top";
  const frontLine =
    frontWall === "top" ? { x1: 0, y1: 0, x2: w, y2: 0 } :
    frontWall === "right" ? { x1: w, y1: 0, x2: w, y2: h } :
    frontWall === "bottom" ? { x1: 0, y1: h, x2: w, y2: h } :
    { x1: 0, y1: 0, x2: 0, y2: h };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full">
      <rect x={0} y={0} width={w} height={h} fill={tokens.paperCream} />
      <line {...frontLine} stroke={tokens.paperEdge} strokeWidth={6} strokeDasharray="14 8" />
      {(klass.room.furniture ?? []).map((f) => (
        <g
          key={f.id}
          transform={`translate(${f.x} ${f.y}) rotate(${f.rotation} ${f.width / 2} ${f.height / 2})`}
        >
          <FurnitureOutline furniture={f} />
        </g>
      ))}
      {klass.room.desks.map((desk) => {
        const transform = `translate(${desk.x} ${desk.y}) rotate(${desk.rotation} ${desk.width / 2} ${desk.height / 2})`;
        return (
          <g key={desk.id} transform={transform}>
            <DeskOutline desk={desk} />
            {desk.seats.map((seat) => {
              const studentId = arrangement.assignments[seat.id];
              const occupied = !!studentId;
              return (
                <circle
                  key={seat.id}
                  cx={seat.offsetX}
                  cy={seat.offsetY}
                  r={10}
                  fill={occupied ? ACCENT_BLUE : "#ffffff"}
                  stroke="#94a3b8"
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function ViewArrangementDialog({
  klass,
  arrangement,
  onOpenChange,
}: {
  klass: ClassRoom;
  arrangement: Arrangement | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (!arrangement) return null;
  const studentCount = Object.keys(arrangement.assignments).length;

  function downloadPng() {
    if (!arrangement) return;
    const svg = document.getElementById("view-arrangement-svg") as unknown as SVGSVGElement | null;
    if (!svg) return;
    const w = klass.room.width;
    const h = klass.room.height;
    const xml = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const date = new Date(arrangement.createdAt).toISOString().slice(0, 10);
      const safeLabel = (arrangement.label || "arrangement").replace(/\s+/g, "_");
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${klass.name.replace(/\s+/g, "_")}_${safeLabel}_${date}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
    img.src = url;
  }

  return (
    <Dialog.Root open={!!arrangement} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[92vw] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-white shadow-2xl focus:outline-none">
          <div className="flex items-start justify-between border-b border-slate-200 px-5 py-3">
            <div>
              <Dialog.Title className="text-base font-semibold">
                {arrangement.label || "(untitled arrangement)"}
              </Dialog.Title>
              <Dialog.Description className="text-xs text-ink-muted">
                {new Date(arrangement.createdAt).toLocaleString()} · {studentCount} students seated · read-only
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-secondary" onClick={downloadPng}>
                <Icon name="download" size={14} />
                Download PNG
              </button>
              <Dialog.Close asChild>
                <button className="rounded p-1 text-ink-muted hover:bg-slate-100 hover:text-ink" aria-label="Close">
                  <Icon name="x" size={16} />
                </button>
              </Dialog.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4">
            <div className="mx-auto max-w-full">
              <ViewSvg id="view-arrangement-svg" klass={klass} arrangement={arrangement} />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Same as Thumbnail but renders student names on assigned seats. */
function ViewSvg({
  id,
  klass,
  arrangement,
}: {
  id: string;
  klass: ClassRoom;
  arrangement: Arrangement;
}) {
  const tokens = useThemeTokens();
  const w = klass.room.width;
  const h = klass.room.height;
  const frontWall = klass.room.frontWall ?? "top";
  const frontLine =
    frontWall === "top" ? { x1: 0, y1: 0, x2: w, y2: 0 } :
    frontWall === "right" ? { x1: w, y1: 0, x2: w, y2: h } :
    frontWall === "bottom" ? { x1: 0, y1: h, x2: w, y2: h } :
    { x1: 0, y1: 0, x2: 0, y2: h };
  return (
    <svg
      id={id}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${w} ${h}`}
      className="h-auto w-full bg-paper"
      style={{ maxHeight: "70vh" }}
    >
      <rect x={0} y={0} width={w} height={h} fill={tokens.paperCream} />
      <line {...frontLine} stroke={tokens.paperEdge} strokeWidth={5} strokeDasharray="12 8" />
      {(klass.room.furniture ?? []).map((f) => (
        <g
          key={f.id}
          transform={`translate(${f.x} ${f.y}) rotate(${f.rotation} ${f.width / 2} ${f.height / 2})`}
        >
          <FurnitureOutline furniture={f} />
        </g>
      ))}
      {klass.room.desks.map((desk) => {
        const transform = `translate(${desk.x} ${desk.y}) rotate(${desk.rotation} ${desk.width / 2} ${desk.height / 2})`;
        return (
          <g key={desk.id} transform={transform}>
            <DeskOutline desk={desk} />
            {desk.seats.map((seat) => {
              const studentId = arrangement.assignments[seat.id];
              const student = studentId ? klass.students.find((x) => x.id === studentId) : undefined;
              return (
                <g key={seat.id} transform={`translate(${seat.offsetX} ${seat.offsetY})`}>
                  {!student ? (
                    <circle r={8} fill="#ffffff" stroke="#94a3b8" />
                  ) : (
                    <text
                      x={0}
                      y={4}
                      textAnchor="middle"
                      fontSize={13}
                      fontWeight="bold"
                      fill={tokens.paperEdge}
                    >
                      {student.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

function DeskOutline({ desk }: { desk: Desk }) {
  switch (desk.kind) {
    case "single-rect":
    case "multi-rect":
    case "multi-square":
      return (
        <rect x={0} y={0} width={desk.width} height={desk.height} fill="#f8fafc" stroke="#334155" strokeWidth={2} rx={4} />
      );
    case "multi-circle":
      return (
        <circle cx={desk.width / 2} cy={desk.height / 2} r={desk.width / 2} fill="#f8fafc" stroke="#334155" strokeWidth={2} />
      );
    case "single-triangle": {
      const apexX = desk.width / 2;
      const apexY = 0;
      const baseLeftX = 0;
      const baseRightX = desk.width;
      const baseY = desk.height;
      return (
        <polygon
          points={`${apexX},${apexY} ${baseRightX},${baseY} ${baseLeftX},${baseY}`}
          fill="#f8fafc"
          stroke="#334155"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      );
    }
  }
}

function FurnitureOutline({ furniture }: { furniture: Furniture }) {
  const def = FURNITURE_DEFAULTS[furniture.kind];
  const w = furniture.width;
  const h = furniture.height;
  switch (furniture.kind) {
    case "teacher-desk":
      return (
        <>
          <rect x={0} y={0} width={w} height={h} fill={def.fill} stroke={def.stroke} strokeWidth={2} rx={6} />
          <text
            x={w / 2}
            y={h / 2 + 5}
            textAnchor="middle"
            fontSize={13}
            fontWeight="bold"
            fill="#3b2010"
          >
            TEACHER
          </text>
        </>
      );
    case "bookshelf":
      return (
        <>
          <rect x={0} y={0} width={w} height={h} fill={def.fill} stroke={def.stroke} strokeWidth={2} />
          <line x1={0} y1={h * 0.33} x2={w} y2={h * 0.33} stroke={def.stroke} strokeWidth={1} />
          <line x1={0} y1={h * 0.66} x2={w} y2={h * 0.66} stroke={def.stroke} strokeWidth={1} />
        </>
      );
    case "window":
      return (
        <>
          <rect x={0} y={0} width={w} height={h} fill={def.fill} stroke={def.stroke} strokeWidth={2} />
          <line x1={w / 2} y1={0} x2={w / 2} y2={h} stroke={def.stroke} strokeWidth={1.5} />
        </>
      );
    case "whiteboard":
      return (
        <rect x={0} y={0} width={w} height={h} fill={def.fill} stroke={def.stroke} strokeWidth={2} />
      );
    case "door":
      return (
        <>
          <line x1={0} y1={0} x2={w} y2={0} stroke={def.stroke} strokeWidth={3} />
          <path
            d={`M 0 0 L ${w} 0 A ${w} ${w} 0 0 1 0 ${w} Z`}
            fill="rgba(245,245,245,0.5)"
            stroke={def.stroke}
            strokeWidth={2}
          />
        </>
      );
    case "plant": {
      const radius = Math.min(w, h) / 2;
      return (
        <circle cx={w / 2} cy={h / 2} r={radius} fill={def.fill} stroke={def.stroke} strokeWidth={2} />
      );
    }
  }
}
