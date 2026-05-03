export const GRID = 10;
export const SNAP_THRESHOLD = 6;
/** Looser tolerance for "is this item on the same row/column?" checks used by
 *  distribution guides. Tighter than SNAP_THRESHOLD makes the user have to
 *  align items pixel-perfect before distribution kicks in; this lets the
 *  guide fire as soon as the dragged item is *roughly* in line. */
export const SAME_LINE_TOLERANCE = 14;

export function snapToGrid(value: number): number {
  return Math.round(value / GRID) * GRID;
}

/** Discriminator so the renderer can paint each guide kind differently —
 *  edge/distribution/center each carry a distinct meaning to the user. */
export type GuideKind = "edge" | "distribution" | "roomCenter";

export interface Guide {
  axis: "x" | "y";
  position: number;
  kind: GuideKind;
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

export type ItemKind = "desk" | "furniture";

export interface SnapItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Optional discriminator. When provided, peer-snap can be filtered to
   *  same-kind only (so desks line up with desks and furniture with
   *  furniture). Defaults to undefined which means "snap with anything". */
  kind?: ItemKind;
}

export interface SnapOptions {
  /** Room dimensions; when set, snap also offers the room's vertical and
   *  horizontal centerlines as snap targets. Independent of any kind filter. */
  roomWidth?: number;
  roomHeight?: number;
  /** When false (default), peer-snap only fires between items of the same
   *  `kind`. When true, items snap across kinds — matches the pre-Phase-4
   *  behavior. Hooked up to `Room.advancedAlignment` in RoomStage. */
  crossType?: boolean;
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
 *
 * By default peer-snap only fires between same-kind items (desks ↔ desks,
 * furniture ↔ furniture). Pass `options.crossType: true` to allow
 * cross-type snap. Room-center snap (when room dimensions are given) always
 * fires regardless of kind — it's a property of the room, not the peers.
 */
export function snapPosition(
  item: SnapItem,
  proposedX: number,
  proposedY: number,
  others: SnapItem[],
  options: SnapOptions = {},
): SnapResult {
  const { roomWidth, roomHeight, crossType = false } = options;
  const w = item.width;
  const h = item.height;
  // Filter peers by kind unless crossType is enabled. If the dragged item
  // has no kind, fall back to "snap with anything" (preserves old API).
  const peerFilter = (d: SnapItem) =>
    d.id !== item.id && (crossType || !item.kind || !d.kind || d.kind === item.kind);
  const otherBounds = others.filter(peerFilter).map(itemBounds);

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
          if (Math.abs(target - cand.value) < 0.5) guides.push({ axis: "x", position: target, kind: "edge" });
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
          if (Math.abs(target - cand.value) < 0.5) guides.push({ axis: "y", position: target, kind: "edge" });
        }
      }
    }
  }

  // Room-center snap. Always-on when dimensions are provided — the room's
  // geometric center is a useful anchor regardless of peers or kind. Snaps
  // either the dragged item's center or its own bbox center to the line.
  if (typeof roomWidth === "number") {
    const roomCx = roomWidth / 2;
    const myCenterX = bestX + w / 2;
    const delta = roomCx - myCenterX;
    if (Math.abs(delta) <= SNAP_THRESHOLD) {
      bestX = bestX + delta;
      guides.push({ axis: "x", position: roomCx, kind: "roomCenter" });
    }
  }
  if (typeof roomHeight === "number") {
    const roomCy = roomHeight / 2;
    const myCenterY = bestY + h / 2;
    const delta = roomCy - myCenterY;
    if (Math.abs(delta) <= SNAP_THRESHOLD) {
      bestY = bestY + delta;
      guides.push({ axis: "y", position: roomCy, kind: "roomCenter" });
    }
  }

  // Distribution snaps (Illustrator-style "smart guides"). Two related
  // patterns kick in once you have peer items on the same row or column:
  //
  //   1. BETWEEN: dragged item sits between two others — snap to the exact
  //      midpoint so the inner gaps are equal.
  //   2. CONTINUATION: there are 2+ peers already in a row with equal gaps —
  //      snap so the dragged item extends that pattern (one more "step" to
  //      the right, or to the left of the leftmost).
  //
  // The "same row / column" tolerance is looser than SNAP_THRESHOLD so the
  // guide fires while the user is *approaching* alignment, not only after a
  // pixel-perfect match. The bracketing peers should already be on a common
  // centerline (from Align H / Align V), which is the typical workflow.

  // X-axis distribution.
  const myCenterY = bestY + h / 2;
  const sameRow = otherBounds
    .filter((b) => Math.abs(b.centerY - myCenterY) <= SAME_LINE_TOLERANCE)
    .slice()
    .sort((a, b) => a.left - b.left);
  if (sameRow.length >= 2) {
    // BETWEEN check (one pair).
    let snappedBetween = false;
    for (let i = 0; i + 1 < sameRow.length; i++) {
      const A = sameRow[i];
      const B = sameRow[i + 1];
      if (A.right >= B.left) continue;
      const myLeft = bestX;
      const myRight = bestX + w;
      if (myLeft <= A.right || myRight >= B.left) continue;
      const gapLeft = myLeft - A.right;
      const gapRight = B.left - myRight;
      if (Math.abs(gapLeft - gapRight) <= SNAP_THRESHOLD * 2) {
        const targetCenterX = (A.right + B.left) / 2;
        bestX = Math.round(targetCenterX - w / 2);
        guides.push({ axis: "x", position: targetCenterX, kind: "distribution" });
        snappedBetween = true;
        break;
      }
    }
    // CONTINUATION check — only if we didn't already snap between two peers.
    if (!snappedBetween) {
      const consecutiveGaps: number[] = [];
      for (let i = 0; i + 1 < sameRow.length; i++) {
        const g = sameRow[i + 1].left - sameRow[i].right;
        if (g > 0) consecutiveGaps.push(g);
      }
      const G = consistentGap(consecutiveGaps, SNAP_THRESHOLD);
      if (G != null) {
        const rightmost = sameRow[sameRow.length - 1];
        const leftmost = sameRow[0];
        // Snap to a "next step" position to the right.
        const continueRight = rightmost.right + G;
        if (Math.abs(bestX - continueRight) <= SNAP_THRESHOLD) {
          bestX = Math.round(continueRight);
          guides.push({ axis: "x", position: continueRight, kind: "distribution" });
          // Mark the existing edges so the run reads as a pattern visually.
          for (const b of sameRow) guides.push({ axis: "x", position: b.right, kind: "distribution" });
        } else {
          // Snap to a "previous step" position to the left.
          const continueLeft = leftmost.left - G;
          if (Math.abs((bestX + w) - continueLeft) <= SNAP_THRESHOLD) {
            bestX = Math.round(continueLeft - w);
            guides.push({ axis: "x", position: continueLeft, kind: "distribution" });
            for (const b of sameRow) guides.push({ axis: "x", position: b.left, kind: "distribution" });
          }
        }
      }
    }
  }

  // Y-axis distribution — same idea, transposed.
  const myCenterX = bestX + w / 2;
  const sameCol = otherBounds
    .filter((b) => Math.abs(b.centerX - myCenterX) <= SAME_LINE_TOLERANCE)
    .slice()
    .sort((a, b) => a.top - b.top);
  if (sameCol.length >= 2) {
    let snappedBetween = false;
    for (let i = 0; i + 1 < sameCol.length; i++) {
      const A = sameCol[i];
      const B = sameCol[i + 1];
      if (A.bottom >= B.top) continue;
      const myTop = bestY;
      const myBottom = bestY + h;
      if (myTop <= A.bottom || myBottom >= B.top) continue;
      const gapTop = myTop - A.bottom;
      const gapBottom = B.top - myBottom;
      if (Math.abs(gapTop - gapBottom) <= SNAP_THRESHOLD * 2) {
        const targetCenterY = (A.bottom + B.top) / 2;
        bestY = Math.round(targetCenterY - h / 2);
        guides.push({ axis: "y", position: targetCenterY, kind: "distribution" });
        snappedBetween = true;
        break;
      }
    }
    if (!snappedBetween) {
      const consecutiveGaps: number[] = [];
      for (let i = 0; i + 1 < sameCol.length; i++) {
        const g = sameCol[i + 1].top - sameCol[i].bottom;
        if (g > 0) consecutiveGaps.push(g);
      }
      const G = consistentGap(consecutiveGaps, SNAP_THRESHOLD);
      if (G != null) {
        const bottommost = sameCol[sameCol.length - 1];
        const topmost = sameCol[0];
        const continueDown = bottommost.bottom + G;
        if (Math.abs(bestY - continueDown) <= SNAP_THRESHOLD) {
          bestY = Math.round(continueDown);
          guides.push({ axis: "y", position: continueDown, kind: "distribution" });
          for (const b of sameCol) guides.push({ axis: "y", position: b.bottom, kind: "distribution" });
        } else {
          const continueUp = topmost.top - G;
          if (Math.abs((bestY + h) - continueUp) <= SNAP_THRESHOLD) {
            bestY = Math.round(continueUp - h);
            guides.push({ axis: "y", position: continueUp, kind: "distribution" });
            for (const b of sameCol) guides.push({ axis: "y", position: b.top, kind: "distribution" });
          }
        }
      }
    }
  }

  return { x: bestX, y: bestY, guides };
}

/** Return the shared gap value if every entry in `gaps` agrees within
 *  `tolerance`, or null otherwise. We pick the median entry as the
 *  representative gap to avoid being thrown off by one outlier on either
 *  end of the distribution. */
function consistentGap(gaps: number[], tolerance: number): number | null {
  if (gaps.length === 0) return null;
  const sorted = gaps.slice().sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)];
  for (const g of gaps) {
    if (Math.abs(g - mid) > tolerance) return null;
  }
  return mid;
}

// Backwards-compat aliases (callers passed Desk[] before).
export const snapDeskPosition = snapPosition;
export const deskBounds = itemBounds;
