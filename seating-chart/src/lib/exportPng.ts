import type Konva from "konva";

/** Background mode of the exported PNG.
 *  - `transparent`: room background is cleared so the area outside desks is
 *    see-through. Good for layering into other documents.
 *  - `white`: solid white fill. Prints cleanly.
 *  Legacy alias `print` resolves to `white`. */
export type ExportMode = "transparent" | "white";

export interface ExportOptions {
  /** Background mode. Default `transparent`. */
  mode?: ExportMode;
  /** When true the resulting PNG is desaturated to grayscale via a 2D-canvas
   *  pass after Konva rasterizes the stage. Default false. */
  blackAndWhite?: boolean;
  /** Hide student names on seated desks before snapshotting. The exported
   *  PNG shows blank desks — useful for blank seating charts. Default false. */
  hideNames?: boolean;
  /** Hide the per-desk amber front-row marker dots. Default false. */
  hideFrontRowMarkers?: boolean;
  /** Hide empty-seat placeholder dots (the small circles where no student is
   *  placed yet). Default true to match the historical export behaviour. */
  hideEmptySeatDots?: boolean;
  /** PixelRatio passed to Konva's toDataURL. Default 2 (retina-ish). */
  pixelRatio?: number;
}

/** A node we'll temporarily hide during export. */
type Hideable = { visible: (v?: boolean) => boolean | unknown };

/**
 * Export the Konva stage as a PNG, with editor chrome stripped:
 *   - the selection Transformer (handles, rotation knob, border)
 *   - empty-seat dots (placeholders for unassigned seats; toggleable)
 *   - front-row corner markers (the small amber dots; toggleable)
 *   - the alignment guide lines (if any are mid-drag)
 *   - student name labels (toggleable, for blank-chart exports)
 * The room background border also temporarily darkens so the room outline
 * reads clearly on both screen and paper.
 */
export function exportStageAsPng(
  stage: Konva.Stage,
  filename: string,
  options: ExportOptions = {},
) {
  const {
    mode = "transparent",
    blackAndWhite = false,
    hideNames = false,
    hideFrontRowMarkers = false,
    hideEmptySeatDots = true,
    pixelRatio = 2,
  } = options;

  const roomBg = stage.findOne("#room-bg") as Konva.Rect | null;
  const originalFill = roomBg?.fill();
  const originalStroke = roomBg?.stroke();
  const originalStrokeWidth = roomBg?.strokeWidth();

  // Collect every node we want to hide during the export. `find` accepts both
  // type-name selectors ("Transformer") and `name`-attribute selectors (`.foo`).
  const toHide: Hideable[] = [];
  for (const node of stage.find("Transformer")) toHide.push(node as unknown as Hideable);
  if (hideEmptySeatDots) {
    for (const node of stage.find(".empty-seat-dot")) toHide.push(node as unknown as Hideable);
  }
  if (hideFrontRowMarkers) {
    for (const node of stage.find(".front-row-marker")) toHide.push(node as unknown as Hideable);
  }
  if (hideNames) {
    for (const node of stage.find(".seat-name-label")) toHide.push(node as unknown as Hideable);
  }

  // Snapshot each node's current visibility, then hide.
  const previousVisibility = new Map<Hideable, boolean>();
  for (const node of toHide) {
    previousVisibility.set(node, Boolean(node.visible()));
    node.visible(false);
  }

  // Apply export-mode styling to the room background.
  if (roomBg) {
    if (mode === "transparent") roomBg.fill("rgba(0,0,0,0)");
    else roomBg.fill("#ffffff");
    roomBg.stroke("#1e293b");
    if (typeof originalStrokeWidth === "number") {
      roomBg.strokeWidth(originalStrokeWidth * 1.5);
    }
  }

  // Force the changes to render before we snapshot.
  stage.draw();

  try {
    const dataUrl = blackAndWhite
      ? grayscaleStageDataUrl(stage, pixelRatio)
      : stage.toDataURL({ mimeType: "image/png", pixelRatio });
    const a = document.createElement("a");
    a.href = dataUrl;
    const suffix = mode === "white" ? "_print" : "";
    const bwSuffix = blackAndWhite ? "_bw" : "";
    a.download = filename.endsWith(".png") ? filename : `${filename}${suffix}${bwSuffix}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Restore visibility.
    for (const [node, vis] of previousVisibility) node.visible(vis);
    if (roomBg) {
      if (originalFill !== undefined) roomBg.fill(originalFill);
      if (originalStroke !== undefined) roomBg.stroke(originalStroke);
      if (typeof originalStrokeWidth === "number") roomBg.strokeWidth(originalStrokeWidth);
    }
    stage.draw();
  }
}

/** Render the stage to a 2D canvas, copy through a fresh canvas with
 *  `filter: grayscale(1)` set, then export as PNG dataURL. Avoids the async
 *  `Image.onload` round-trip needed by a dataURL-only path. */
function grayscaleStageDataUrl(stage: Konva.Stage, pixelRatio: number): string {
  const src = stage.toCanvas({ pixelRatio });
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return stage.toDataURL({ mimeType: "image/png", pixelRatio });
  ctx.filter = "grayscale(1)";
  ctx.drawImage(src, 0, 0);
  return out.toDataURL("image/png");
}
