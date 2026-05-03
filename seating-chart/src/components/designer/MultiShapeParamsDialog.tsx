import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { DeskKind } from "@/types";
import {
  defaultParamsFor,
  layoutDesk,
  type MultiCircleParams,
  type MultiRectParams,
  type MultiSquareParams,
  type ShapeParams,
} from "@/lib/shapes";

/** Kinds that need a pre-placement config dialog. The set has grown beyond
 *  multi-* desks to include configurable furniture (windows). */
export type ConfigKind = DeskKind | "window";

/** Discriminated payload returned by `onConfirm`. Consumers switch on
 *  `kind` to access the right params shape. */
export type ConfigPayload =
  | { kind: DeskKind; params: ShapeParams }
  | { kind: "window"; paneCount: number };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ConfigKind | null;
  /** Optional drop point in room coords. When set, the placed item lands here instead of room center. */
  dropPoint?: { x: number; y: number } | null;
  onConfirm: (payload: ConfigPayload, dropPoint: { x: number; y: number } | null) => void;
}

const WINDOW_DEFAULT_PANES = 2;

export default function MultiShapeParamsDialog({ open, onOpenChange, kind, dropPoint, onConfirm }: Props) {
  const [rect, setRect] = useState<MultiRectParams>({ rows: 2, cols: 3 });
  const [square, setSquare] = useState<MultiSquareParams>({ perSide: 2 });
  const [circle, setCircle] = useState<MultiCircleParams>({ seatCount: 6 });
  const [paneCount, setPaneCount] = useState<number>(WINDOW_DEFAULT_PANES);

  // Reset to defaults when the dialog opens for a new kind.
  useEffect(() => {
    if (!open || !kind) return;
    if (kind === "window") {
      setPaneCount(WINDOW_DEFAULT_PANES);
      return;
    }
    const def = defaultParamsFor(kind);
    if (kind === "multi-rect" && def) setRect(def as MultiRectParams);
    if (kind === "multi-square" && def) setSquare(def as MultiSquareParams);
    if (kind === "multi-circle" && def) setCircle(def as MultiCircleParams);
  }, [open, kind]);

  const params: ShapeParams = useMemo(() => {
    if (kind === "multi-rect") return rect;
    if (kind === "multi-square") return square;
    if (kind === "multi-circle") return circle;
    return undefined;
  }, [kind, rect, square, circle]);

  const layout = useMemo(() => {
    if (!kind || kind === "window") return null;
    return layoutDesk(kind, params);
  }, [kind, params]);

  if (!kind) return null;

  const title =
    kind === "multi-rect" ? "Rectangle table" :
    kind === "multi-square" ? "Square table" :
    kind === "multi-circle" ? "Circle table" :
    "Window";

  function handleConfirm() {
    if (!kind) return;
    if (kind === "window") {
      onConfirm({ kind: "window", paneCount }, dropPoint ?? null);
    } else {
      onConfirm({ kind, params }, dropPoint ?? null);
    }
    onOpenChange(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl focus:outline-none">
          <Dialog.Title className="mb-1 text-lg font-semibold">Configure {title.toLowerCase()}</Dialog.Title>
          <Dialog.Description className="mb-4 text-sm text-ink-muted">
            Pick how many students sit at this table. You can re-place it later if you change your mind.
          </Dialog.Description>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-3">
              {kind === "multi-rect" && (
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Rows"
                    value={rect.rows}
                    min={1}
                    max={10}
                    onChange={(v) => setRect({ ...rect, rows: v })}
                  />
                  <NumberField
                    label="Columns"
                    value={rect.cols}
                    min={1}
                    max={10}
                    onChange={(v) => setRect({ ...rect, cols: v })}
                  />
                  <p className="col-span-2 text-sm text-ink-muted">
                    Total: <strong className="text-ink">{rect.rows * rect.cols}</strong> student
                    {rect.rows * rect.cols === 1 ? "" : "s"} in a {rect.rows} × {rect.cols} grid.
                  </p>
                </div>
              )}
              {kind === "multi-square" && (
                <div className="space-y-2">
                  <NumberField
                    label="Seats per side"
                    value={square.perSide}
                    min={1}
                    max={6}
                    onChange={(v) => setSquare({ perSide: v })}
                  />
                  <p className="text-sm text-ink-muted">
                    Total: <strong className="text-ink">{square.perSide * 4}</strong> student
                    {square.perSide * 4 === 1 ? "" : "s"} around the perimeter.
                  </p>
                </div>
              )}
              {kind === "multi-circle" && (
                <div className="space-y-2">
                  <NumberField
                    label="Number of seats"
                    value={circle.seatCount}
                    min={3}
                    max={20}
                    onChange={(v) => setCircle({ seatCount: v })}
                  />
                  <p className="text-sm text-ink-muted">
                    Students sit evenly around the circumference.
                  </p>
                </div>
              )}
              {kind === "window" && (
                <div className="space-y-2">
                  <NumberField
                    label="Number of panes"
                    value={paneCount}
                    min={1}
                    max={8}
                    onChange={(v) => setPaneCount(v)}
                  />
                  <p className="text-sm text-ink-muted">
                    The window is drawn with {paneCount === 1 ? "no" : paneCount - 1} divider
                    {paneCount - 1 === 1 ? "" : "s"} along its long axis.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="label">Preview</label>
              <div className="mt-1 flex h-56 items-center justify-center rounded-md border border-slate-200 bg-slate-50">
                {layout && kind !== "window" && <ShapePreview kind={kind as DeskKind} layout={layout} />}
                {kind === "window" && <WindowPreview paneCount={paneCount} />}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="btn-secondary">Cancel</button>
            </Dialog.Close>
            <button className="btn-primary" onClick={handleConfirm}>
              Add to room
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number"
        className="input mt-1"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const next = Math.max(min, Math.min(max, Number(e.target.value) || min));
          onChange(next);
        }}
      />
    </div>
  );
}

function WindowPreview({ paneCount }: { paneCount: number }) {
  // Mirrors FurnitureNode's window rendering at preview-scale: a thin rect
  // with paneCount-1 vertical dividers. Uses the suite-friendly bluish fill
  // from FURNITURE_DEFAULTS so the preview matches the canvas appearance.
  const w = 220;
  const h = 22;
  const dividers: number[] = [];
  for (let i = 1; i < paneCount; i++) dividers.push((i / paneCount) * w);
  return (
    <svg width={w} height={h * 2} viewBox={`0 0 ${w} ${h * 2}`}>
      <g transform={`translate(0 ${h / 2})`}>
        <rect x={0} y={0} width={w} height={h} fill="#bfdcec" stroke="#5a8aa9" strokeWidth={2} />
        {dividers.map((dx, i) => (
          <line key={i} x1={dx} y1={0} x2={dx} y2={h} stroke="#5a8aa9" strokeWidth={1.5} />
        ))}
      </g>
    </svg>
  );
}

function ShapePreview({ kind, layout }: { kind: DeskKind; layout: { width: number; height: number; seats: { id: string; offsetX: number; offsetY: number }[] } }) {
  const scale = Math.min(220 / layout.width, 220 / layout.height);
  return (
    <svg width={layout.width * scale} height={layout.height * scale} viewBox={`0 0 ${layout.width} ${layout.height}`}>
      {kind === "multi-rect" && (
        <rect x={0} y={0} width={layout.width} height={layout.height} fill="#f1f5f9" stroke="#475569" rx={4} />
      )}
      {kind === "multi-square" && (
        <rect x={0} y={0} width={layout.width} height={layout.height} fill="#f1f5f9" stroke="#475569" rx={4} />
      )}
      {kind === "multi-circle" && (
        <circle cx={layout.width / 2} cy={layout.height / 2} r={layout.width / 2} fill="#f1f5f9" stroke="#475569" />
      )}
      {layout.seats.map((s) => (
        <circle key={s.id} cx={s.offsetX} cy={s.offsetY} r={8} fill="#ffffff" stroke="#94a3b8" />
      ))}
    </svg>
  );
}
