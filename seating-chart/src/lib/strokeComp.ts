import type Konva from "konva";

/**
 * Keep stroke widths visually constant while the Transformer scales a node.
 *
 * Konva scales strokes with the node (strokeScaleEnabled defaults to true),
 * so outlines fatten mid-drag until transformend bakes the scale back to 1.
 * Turning strokeScaleEnabled off globally is wrong here — it would also
 * ignore the camera layer's scale and hi-res export pixelRatio. Instead,
 * divide each shape's strokeWidth by the live scale factor during the drag
 * and restore the original on transformend (the React re-render then owns
 * the declarative value again).
 */
export function compensateStrokes(group: Konva.Group) {
  const f = (group.scaleX() + group.scaleY()) / 2 || 1;
  group
    .find((n: Konva.Node) => typeof (n as Konva.Shape).strokeWidth === "function")
    .forEach((node) => {
      const s = node as Konva.Shape;
      // Seat groups are counter-scaled to 1/scale already — skip them.
      if (s.findAncestor(".seat-group")) return;
      let base = s.getAttr("_baseStroke");
      if (base == null) {
        base = s.strokeWidth();
        s.setAttr("_baseStroke", base);
      }
      s.strokeWidth(base / f);
    });
}

export function restoreStrokes(group: Konva.Group) {
  group
    .find((n: Konva.Node) => typeof (n as Konva.Shape).strokeWidth === "function")
    .forEach((node) => {
      const s = node as Konva.Shape;
      const base = s.getAttr("_baseStroke");
      if (base != null) {
        s.strokeWidth(base);
        s.setAttr("_baseStroke", undefined);
      }
    });
}
