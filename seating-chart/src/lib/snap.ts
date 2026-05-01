export const GRID = 10;
export const SNAP_THRESHOLD = 6;

export function snapToGrid(value: number): number {
  return Math.round(value / GRID) * GRID;
}

export interface Guide {
  axis: "x" | "y";
  position: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: Guide[];
}

export interface BoundingBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

export interface SnapItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function itemBounds(item: SnapItem): BoundingBox {
  return {
    left: item.x,
    right: item.x + item.width,
    top: item.y,
    bottom: item.y + item.height,
    centerX: item.x + item.width / 2,
    centerY: item.y + item.height / 2,
  };
}

/**
 * Snap an item's proposed (x, y) to the grid AND to the edges/centers of any
 * other items in the same room. Used by both desks and furniture so they line
 * up against each other.
 */
export function snapPosition(
  item: SnapItem,
  proposedX: number,
  proposedY: number,
  others: SnapItem[],
): SnapResult {
  const w = item.width;
  const h = item.height;
  const otherBounds = others.filter((d) => d.id !== item.id).map(itemBounds);

  let bestX = snapToGrid(proposedX);
  let bestY = snapToGrid(proposedY);
  const guides: Guide[] = [];

  const myXCandidates = (x: number) => [{ value: x }, { value: x + w / 2 }, { value: x + w }];

  let bestDx = SNAP_THRESHOLD + 1;
  for (const cand of myXCandidates(proposedX)) {
    for (const b of otherBounds) {
      for (const target of [b.left, b.centerX, b.right]) {
        const delta = target - cand.value;
        if (Math.abs(delta) < Math.abs(bestDx)) bestDx = delta;
      }
    }
  }
  if (Math.abs(bestDx) <= SNAP_THRESHOLD) {
    bestX = proposedX + bestDx;
    for (const cand of myXCandidates(bestX)) {
      for (const b of otherBounds) {
        for (const target of [b.left, b.centerX, b.right]) {
          if (Math.abs(target - cand.value) < 0.5) guides.push({ axis: "x", position: target });
        }
      }
    }
  }

  const myYCandidates = (y: number) => [{ value: y }, { value: y + h / 2 }, { value: y + h }];

  let bestDy = SNAP_THRESHOLD + 1;
  for (const cand of myYCandidates(proposedY)) {
    for (const b of otherBounds) {
      for (const target of [b.top, b.centerY, b.bottom]) {
        const delta = target - cand.value;
        if (Math.abs(delta) < Math.abs(bestDy)) bestDy = delta;
      }
    }
  }
  if (Math.abs(bestDy) <= SNAP_THRESHOLD) {
    bestY = proposedY + bestDy;
    for (const cand of myYCandidates(bestY)) {
      for (const b of otherBounds) {
        for (const target of [b.top, b.centerY, b.bottom]) {
          if (Math.abs(target - cand.value) < 0.5) guides.push({ axis: "y", position: target });
        }
      }
    }
  }

  return { x: bestX, y: bestY, guides };
}

// Backwards-compat aliases (callers passed Desk[] before).
export const snapDeskPosition = snapPosition;
export const deskBounds = itemBounds;
