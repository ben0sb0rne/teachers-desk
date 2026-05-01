import type Konva from "konva";

export type ExportMode = "transparent" | "print";

/** A node we'll temporarily hide during export. */
type Hideable = { visible: (v?: boolean) => boolean | unknown };

/**
 * Export the Konva stage as a PNG, with editor chrome stripped:
 *   - the selection Transformer (handles, rotation knob, border)
 *   - empty-seat dots (visual placeholders for unassigned seats)
 *   - front-row corner markers (the small amber dots)
 *   - the alignment guide lines (if any are mid-drag)
 * The room background border also temporarily darkens so the room outline
 * reads clearly on both screen and paper.
 *
 * - `transparent` (default): clears the room background fill so the area
 *   outside desks is see-through.
 * - `print`: forces a solid white room background instead, so the result
 *   prints cleanly on paper.
 */
export function exportStageAsPng(
  stage: Konva.Stage,
  filename: string,
  mode: ExportMode = "transparent",
) {
  const roomBg = stage.findOne("#room-bg") as Konva.Rect | null;
  const originalFill = roomBg?.fill();
  const originalStroke = roomBg?.stroke();
  const originalStrokeWidth = roomBg?.strokeWidth();

  // Collect every node we want to hide during the export. `find` accepts both
  // type-name selectors ("Transformer") and `name`-attribute selectors (`.foo`).
  const toHide: Hideable[] = [];
  for (const node of stage.find("Transformer")) toHide.push(node as unknown as Hideable);
  for (const node of stage.find(".empty-seat-dot")) toHide.push(node as unknown as Hideable);
  for (const node of stage.find(".front-row-marker")) toHide.push(node as unknown as Hideable);

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
    const dataUrl = stage.toDataURL({ mimeType: "image/png", pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    const suffix = mode === "print" ? "_print" : "";
    a.download = filename.endsWith(".png") ? filename : `${filename}${suffix}.png`;
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
