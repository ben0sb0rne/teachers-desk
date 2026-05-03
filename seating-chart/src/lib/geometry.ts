/** Geometry helpers shared between the canvas, the snap engine, and the
 *  export pipeline. Kept tiny on purpose. */

export interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RotatableItem {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** Axis-aligned bounding box of an item after applying its rotation around
 *  the local origin (which is what Konva's default rotation does — local
 *  origin == top-left of the item). Match's the math in DeskNode /
 *  FurnitureNode's getClientRect overrides so callers compute the SAME box
 *  the Transformer + render path agree on. */
export function rotatedItemAABB(item: RotatableItem): AABB {
  const rad = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Corners in local frame, before translation by (item.x, item.y).
  const corners: Array<[number, number]> = [
    [0, 0],
    [item.width, 0],
    [item.width, item.height],
    [0, item.height],
  ];
  const xs = corners.map(([lx, ly]) => item.x + lx * cos - ly * sin);
  const ys = corners.map(([lx, ly]) => item.y + lx * sin + ly * cos);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Union of two AABBs. */
export function unionAABB(a: AABB, b: AABB): AABB {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}
