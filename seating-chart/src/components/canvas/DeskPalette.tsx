import { useState } from "react";
import type { DeskKind, FurnitureKind, Room, Wall } from "@/types";
import { cn } from "@/lib/cn";
import Icon from "@/components/Icon";
import { FURNITURE_DEFAULTS, FURNITURE_KINDS, furnitureLabel } from "@/lib/furniture";
import { SWATCHES } from "@/lib/color";

export type PaletteDragType = "single-desk" | "multi-desk" | "furniture";

interface Props {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onPlaceSingle: (kind: DeskKind) => void;
  onOpenMulti: (kind: DeskKind) => void;
  onPlaceFurniture: (kind: FurnitureKind) => void;
  /** Tells RoomDesigner that the user has started a potential drag from a palette item. */
  onPaletteDragStart: (
    kind: DeskKind | FurnitureKind,
    type: PaletteDragType,
    clientX: number,
    clientY: number,
  ) => void;
  room: Room;
  onUpdateRoom: (patch: Partial<Room>) => void;
  selectionSize: number;
  onAlignVertical: () => void;
  onAlignHorizontal: () => void;
  onDistributeVertical: () => void;
  onDistributeHorizontal: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  /** Per-object color override. Receives a CSS color string from a swatch
   *  or the native color picker. Applied to every selected item. */
  onSetColor: (fill: string) => void;
  /** Reset every selected item's `fill` back to undefined (kind defaults). */
  onResetColor: () => void;
  locked: boolean;
  onToggleLocked: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
}

interface PaletteItem {
  kind: DeskKind;
  label: string;
}

const SINGLE_ITEMS: PaletteItem[] = [
  { kind: "single-rect", label: "Rectangle desk" },
  { kind: "single-triangle", label: "Triangle desk" },
];

const MULTI_ITEMS: PaletteItem[] = [
  { kind: "multi-rect", label: "Rectangle table" },
  { kind: "multi-square", label: "Square table" },
  { kind: "multi-circle", label: "Circle table" },
];

const DEFAULT_ROOM_W = 1000;
const DEFAULT_ROOM_H = 700;

export default function DeskPalette({
  collapsed,
  onToggleCollapsed,
  onPlaceSingle,
  onOpenMulti,
  onPlaceFurniture,
  onPaletteDragStart,
  room,
  onUpdateRoom,
  selectionSize,
  onAlignVertical,
  onAlignHorizontal,
  onDistributeVertical,
  onDistributeHorizontal,
  onFlipHorizontal,
  onFlipVertical,
  onSetColor,
  onResetColor,
  locked,
  onToggleLocked,
  showGrid,
  onToggleGrid,
}: Props) {
  const [singleOpen, setSingleOpen] = useState(true);
  const [multiOpen, setMultiOpen] = useState(true);
  const [furnitureOpen, setFurnitureOpen] = useState(true);
  const [roomOptsOpen, setRoomOptsOpen] = useState(false);

  // Align is now valid with one item (centers it on the room axis) or many
  // items (lines their rotated centers on a shared axis).
  const canAlign = selectionSize >= 1 && !locked;
  const canDistribute = selectionSize >= 3 && !locked;
  // Flip works on a single item (mirror its own seat layout) or any group.
  const canFlip = selectionSize >= 1 && !locked;
  const canColor = selectionSize >= 1 && !locked;
  const isDefaultRoom = room.width === DEFAULT_ROOM_W && room.height === DEFAULT_ROOM_H;

  if (collapsed) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center border-r border-slate-200 bg-white py-2">
        <button
          className="rounded p-1.5 text-ink-muted hover:bg-slate-100"
          onClick={onToggleCollapsed}
          title="Expand palette"
        >
          <Icon name="chevrons-right" size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Palette</span>
        <button
          className="rounded p-1 text-ink-muted hover:bg-slate-100"
          onClick={onToggleCollapsed}
          title="Collapse palette"
        >
          <Icon name="chevrons-left" size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        <SectionHeader label="Single-student" open={singleOpen} onToggle={() => setSingleOpen((o) => !o)} />
        {singleOpen && (
          <ul className="mb-4 space-y-1">
            {SINGLE_ITEMS.map((it) => (
              <li key={it.kind}>
                <button
                  className="btn-secondary w-full justify-start"
                  onClick={() => onPlaceSingle(it.kind)}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    onPaletteDragStart(it.kind, "single-desk", e.clientX, e.clientY);
                  }}
                  title="Click to place at center, or drag onto the canvas"
                >
                  <ShapeIcon kind={it.kind} />
                  <span className="ml-2 truncate">{it.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <SectionHeader label="Multi-student" open={multiOpen} onToggle={() => setMultiOpen((o) => !o)} />
        {multiOpen && (
          <ul className="mb-4 space-y-1">
            {MULTI_ITEMS.map((it) => (
              <li key={it.kind}>
                <button
                  className="btn-secondary w-full justify-start"
                  onClick={() => onOpenMulti(it.kind)}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    onPaletteDragStart(it.kind, "multi-desk", e.clientX, e.clientY);
                  }}
                  title="Click to configure and add, or drag onto the canvas"
                >
                  <ShapeIcon kind={it.kind} />
                  <span className="ml-2 flex-1 truncate text-left">{it.label}</span>
                  <Icon name="chevron-right" size={12} className="ml-1 text-ink-muted" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <SectionHeader
          label="Furniture"
          open={furnitureOpen}
          onToggle={() => setFurnitureOpen((o) => !o)}
        />
        {furnitureOpen && (
          <ul className="mb-4 space-y-1">
            {FURNITURE_KINDS.map((kind) => (
              <li key={kind}>
                <button
                  className="btn-secondary w-full justify-start"
                  onClick={() => onPlaceFurniture(kind)}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    onPaletteDragStart(kind, "furniture", e.clientX, e.clientY);
                  }}
                  title="Click to place at center, or drag onto the canvas"
                >
                  <FurnitureIcon kind={kind} />
                  <span className="ml-2 truncate">{furnitureLabel(kind)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mb-2 flex items-center justify-between">
          <span className="label">Arrange selected</span>
          <span className="text-[10px] text-ink-muted">
            {selectionSize} item{selectionSize === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mb-2 grid grid-cols-2 gap-1">
          <button
            className="btn-secondary justify-center"
            onClick={onAlignVertical}
            disabled={!canAlign}
            title={selectionSize === 1
              ? "Center this item on the room's vertical axis"
              : "Line up the selected items on a shared vertical axis"}
          >
            <Icon name="align-vertical" size={14} />
            <span className="text-xs">Align V</span>
          </button>
          <button
            className="btn-secondary justify-center"
            onClick={onAlignHorizontal}
            disabled={!canAlign}
            title={selectionSize === 1
              ? "Center this item on the room's horizontal axis"
              : "Line up the selected items on a shared horizontal axis"}
          >
            <Icon name="align-horizontal" size={14} />
            <span className="text-xs">Align H</span>
          </button>
          <button className="btn-secondary justify-center" onClick={onDistributeVertical} disabled={!canDistribute} title="Spread items evenly between top and bottom">
            <Icon name="distribute-vertical" size={14} />
            <span className="text-xs">Dist V</span>
          </button>
          <button className="btn-secondary justify-center" onClick={onDistributeHorizontal} disabled={!canDistribute} title="Spread items evenly between left and right">
            <Icon name="distribute-horizontal" size={14} />
            <span className="text-xs">Dist H</span>
          </button>
        </div>
        <div className="mb-2 grid grid-cols-2 gap-1">
          <button className="btn-secondary justify-center" onClick={onFlipHorizontal} disabled={!canFlip} title="Mirror selection across the vertical axis">
            <Icon name="flip-horizontal" size={14} />
            <span className="text-xs">Flip H</span>
          </button>
          <button className="btn-secondary justify-center" onClick={onFlipVertical} disabled={!canFlip} title="Mirror selection across the horizontal axis">
            <Icon name="flip-vertical" size={14} />
            <span className="text-xs">Flip V</span>
          </button>
        </div>
        <p className="mb-3 text-[10px] text-ink-muted">Distribute needs 3+ items selected.</p>

        <div className="mb-2 flex items-center justify-between">
          <span className="label">Color</span>
          <span className="text-[10px] text-ink-muted">
            {selectionSize === 0 ? "no selection" : `${selectionSize} item${selectionSize === 1 ? "" : "s"}`}
          </span>
        </div>
        <ColorPanel
          enabled={canColor}
          onPick={onSetColor}
          onReset={onResetColor}
        />
        <p className="mb-4 mt-1 text-[10px] text-ink-muted">
          Color applies to every selected desk or piece of furniture. The
          stroke and any text inside follow automatically.
        </p>

        <div className="mb-4 grid grid-cols-2 gap-1">
          <button
            className={cn("btn-secondary justify-center", locked && "border-ink bg-ink text-white hover:bg-ink")}
            onClick={onToggleLocked}
            title={locked ? "Unlock layout" : "Lock layout (prevents accidental drag/resize)"}
          >
            <Icon name={locked ? "lock" : "unlock"} size={14} />
            <span className="text-xs">{locked ? "Locked" : "Unlock"}</span>
          </button>
          <button
            className={cn("btn-secondary justify-center", showGrid && "border-ink bg-ink text-white hover:bg-ink")}
            onClick={onToggleGrid}
            title={showGrid ? "Hide grid overlay" : "Show grid overlay"}
          >
            <Icon name="grid" size={14} />
            <span className="text-xs">Grid</span>
          </button>
        </div>

        <button
          className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted hover:bg-slate-100"
          onClick={() => setRoomOptsOpen((o) => !o)}
        >
          <span>Room options</span>
          <Icon name={roomOptsOpen ? "chevron-down" : "chevron-right"} size={14} />
        </button>
        {roomOptsOpen && (
          <div className="mt-2 space-y-3 rounded-md border border-slate-200 p-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="label">Room size</label>
                <button
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-slate-100 disabled:opacity-40"
                  onClick={() => onUpdateRoom({ width: DEFAULT_ROOM_W, height: DEFAULT_ROOM_H })}
                  disabled={isDefaultRoom}
                  title="Reset room size to default"
                >
                  <Icon name="rotate-ccw" size={10} />
                  Reset
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField ariaLabel="Width" value={room.width} min={400} max={3000} step={50} onChange={(v) => onUpdateRoom({ width: v })} />
                <NumberField ariaLabel="Height" value={room.height} min={400} max={3000} step={50} onChange={(v) => onUpdateRoom({ height: v })} />
              </div>
              <p className="mt-1 text-[10px] text-ink-muted">Width × height of the room area.</p>
            </div>
            <div>
              <label className="label">Front of room</label>
              <FrontWallPicker value={room.frontWall ?? "top"} onChange={(wall) => onUpdateRoom({ frontWall: wall })} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="label">Background</label>
                {room.background && (
                  <button
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-slate-100"
                    onClick={() => onUpdateRoom({ background: undefined })}
                    title="Reset background to the default cream"
                  >
                    <Icon name="rotate-ccw" size={10} />
                    Reset
                  </button>
                )}
              </div>
              <ColorPanel
                enabled
                compact
                currentColor={room.background}
                onPick={(fill) => onUpdateRoom({ background: fill })}
                onReset={() => onUpdateRoom({ background: undefined })}
              />
            </div>
            <div>
              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!!room.advancedAlignment}
                  onChange={(e) => onUpdateRoom({ advancedAlignment: e.target.checked })}
                />
                <span>
                  <span className="font-medium text-ink">Advanced alignment</span>
                  <span className="block text-[10px] text-ink-muted">
                    Snap desks to furniture and vice-versa. Off by default — desks
                    only snap to other desks, furniture only to furniture.
                  </span>
                </span>
              </label>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function SectionHeader({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="mb-2 flex w-full items-center justify-between rounded px-1 py-0.5 text-xs font-semibold uppercase tracking-wide text-ink-muted hover:bg-slate-50"
      onClick={onToggle}
    >
      <span>{label}</span>
      <Icon name={open ? "chevron-down" : "chevron-right"} size={12} />
    </button>
  );
}

function FrontWallPicker({ value, onChange }: { value: Wall; onChange: (w: Wall) => void }) {
  return (
    <div className="mt-1 grid grid-cols-3 gap-1">
      <span />
      <WallButton wall="top" current={value} onClick={onChange} />
      <span />
      <WallButton wall="left" current={value} onClick={onChange} />
      <span />
      <WallButton wall="right" current={value} onClick={onChange} />
      <span />
      <WallButton wall="bottom" current={value} onClick={onChange} />
      <span />
    </div>
  );
}

function WallButton({ wall, current, onClick }: { wall: Wall; current: Wall; onClick: (w: Wall) => void }) {
  const active = wall === current;
  return (
    <button
      className={cn(
        "rounded-md border px-2 py-1 text-xs capitalize",
        active ? "border-ink bg-ink text-white" : "border-slate-300 bg-white text-ink hover:bg-slate-50",
      )}
      onClick={() => onClick(wall)}
    >
      {wall}
    </button>
  );
}

/** Tiny color picker: a row of preset suite swatches + a native picker +
 *  an explicit reset. Used twice — once for the per-object color override,
 *  once inside Room Options for the canvas background. The compact layout
 *  works in both spots without taking too much vertical room. */
function ColorPanel({
  enabled,
  currentColor,
  onPick,
  onReset,
  compact,
}: {
  enabled: boolean;
  currentColor?: string;
  onPick: (fill: string) => void;
  onReset: () => void;
  compact?: boolean;
}) {
  const swatchSize = compact ? 18 : 20;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", !enabled && "opacity-50 pointer-events-none")}>
      {SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Set color ${color}`}
          title={color}
          onClick={() => onPick(color)}
          style={{ width: swatchSize, height: swatchSize, background: color }}
          className={cn(
            "rounded border transition",
            currentColor && currentColor.toLowerCase() === color.toLowerCase()
              ? "border-ink shadow-sm"
              : "border-ink/30 hover:border-ink/70",
          )}
        />
      ))}
      <label
        className={cn(
          "flex cursor-pointer items-center justify-center rounded border border-dashed border-ink/40 hover:border-ink",
          "relative overflow-hidden",
        )}
        style={{ width: swatchSize, height: swatchSize }}
        title="Pick any color"
      >
        <Icon name="plus" size={10} />
        <input
          type="color"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={currentColor ?? "#ffffff"}
          onChange={(e) => onPick(e.target.value)}
        />
      </label>
      {!compact && (
        <button
          type="button"
          className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-slate-100"
          onClick={onReset}
          title="Reset to the default color"
        >
          <Icon name="rotate-ccw" size={10} />
          Reset
        </button>
      )}
    </div>
  );
}

function NumberField({ ariaLabel, value, min, max, step, onChange }: {
  ariaLabel: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      className="input"
      aria-label={ariaLabel}
      value={value}
      min={min}
      max={max}
      step={step ?? 1}
      onChange={(e) => {
        const next = Math.max(min, Math.min(max, Number(e.target.value) || min));
        onChange(next);
      }}
    />
  );
}

function FurnitureIcon({ kind }: { kind: FurnitureKind }) {
  const def = FURNITURE_DEFAULTS[kind];
  const stroke = def.stroke;
  const fill = def.fill;
  const size = 18;
  switch (kind) {
    case "teacher-desk":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <rect x="2" y="6" width="16" height="8" fill={fill} stroke={stroke} rx="1" />
          <text x="10" y="12" fontSize="4" textAnchor="middle" fill="#3b2010" fontWeight="bold">T</text>
        </svg>
      );
    case "bookshelf":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <rect x="2" y="7" width="16" height="6" fill={fill} stroke={stroke} />
          <line x1="2" y1="9" x2="18" y2="9" stroke={stroke} strokeWidth="0.5" />
          <line x1="2" y1="11" x2="18" y2="11" stroke={stroke} strokeWidth="0.5" />
        </svg>
      );
    case "window":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <rect x="2" y="9" width="16" height="2" fill={fill} stroke={stroke} />
          <line x1="10" y1="9" x2="10" y2="11" stroke={stroke} strokeWidth="0.5" />
        </svg>
      );
    case "whiteboard":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <rect x="1" y="9" width="18" height="2" fill={fill} stroke={stroke} />
        </svg>
      );
    case "door":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden fill="none">
          <line x1="3" y1="4" x2="14" y2="4" stroke={stroke} strokeWidth="1.5" />
          <path d="M 3 4 A 11 11 0 0 1 14 15 L 3 15 Z" fill="rgba(245,245,245,0.5)" stroke={stroke} strokeWidth="1" />
        </svg>
      );
    case "plant":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <circle cx="10" cy="10" r="6" fill={fill} stroke={stroke} />
        </svg>
      );
    case "tv":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <rect x="2" y="7" width="16" height="6" fill={fill} stroke={stroke} rx="0.5" />
          <rect x="3" y="8" width="14" height="4" fill="#0b1220" />
        </svg>
      );
    case "screen":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <rect x="2" y="9" width="16" height="2" fill={fill} stroke={stroke} />
          <rect x="9" y="11" width="2" height="1.5" fill={stroke} />
        </svg>
      );
    case "box":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <rect x="3" y="3" width="14" height="14" fill={fill} stroke={stroke} rx="1.5" />
        </svg>
      );
    case "circle":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <circle cx="10" cy="10" r="7" fill={fill} stroke={stroke} />
        </svg>
      );
  }
}

function ShapeIcon({ kind }: { kind: DeskKind }) {
  const stroke = "#475569";
  const fill = "#e2e8f0";
  const size = 18;
  switch (kind) {
    case "single-rect":
      // Landscape rectangle (~1.7:1) with rounded corners and a single seat dot.
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <rect x="1.5" y="6" width="17" height="9" fill={fill} stroke={stroke} strokeWidth="1.2" rx="1.5" />
          <circle cx="10" cy="10.5" r="1.4" fill="#ffffff" stroke={stroke} strokeWidth="0.6" />
        </svg>
      );
    case "single-triangle":
      // Wider-than-tall isoceles triangle with rounded joins, single seat dot near the centroid.
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <path
            d="M 10 4 L 17.5 16 L 2.5 16 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx="10" cy="12" r="1.4" fill="#ffffff" stroke={stroke} strokeWidth="0.6" />
        </svg>
      );
    case "multi-rect":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <rect x="2" y="6" width="16" height="8" fill={fill} stroke={stroke} rx="1" />
          <circle cx="6" cy="9" r="1" fill="#fff" stroke={stroke} />
          <circle cx="10" cy="9" r="1" fill="#fff" stroke={stroke} />
          <circle cx="14" cy="9" r="1" fill="#fff" stroke={stroke} />
          <circle cx="6" cy="12" r="1" fill="#fff" stroke={stroke} />
          <circle cx="10" cy="12" r="1" fill="#fff" stroke={stroke} />
          <circle cx="14" cy="12" r="1" fill="#fff" stroke={stroke} />
        </svg>
      );
    case "multi-square":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <rect x="4" y="4" width="12" height="12" fill={fill} stroke={stroke} rx="1" />
          <circle cx="10" cy="5" r="1" fill="#fff" stroke={stroke} />
          <circle cx="15" cy="10" r="1" fill="#fff" stroke={stroke} />
          <circle cx="10" cy="15" r="1" fill="#fff" stroke={stroke} />
          <circle cx="5" cy="10" r="1" fill="#fff" stroke={stroke} />
        </svg>
      );
    case "multi-circle":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          <circle cx="10" cy="10" r="6" fill={fill} stroke={stroke} />
          <circle cx="10" cy="5" r="1" fill="#fff" stroke={stroke} />
          <circle cx="14" cy="10" r="1" fill="#fff" stroke={stroke} />
          <circle cx="10" cy="15" r="1" fill="#fff" stroke={stroke} />
          <circle cx="6" cy="10" r="1" fill="#fff" stroke={stroke} />
        </svg>
      );
  }
}
