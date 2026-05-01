import type { Desk, Room, Seat, SeatId } from "@/types";

/**
 * How many of each seat's closest other seats count as "neighbors" for
 * Keep Apart purposes. Plus same-desk seats, which are always neighbors.
 *
 * Using a relative measure (K nearest) instead of a fixed pixel distance
 * keeps "next to each other" meaningful regardless of how tight or spread
 * the room layout is.
 */
export const K_NEAREST = 3;

export interface SeatRef {
  seatId: SeatId;
  deskId: string;
  x: number;
  y: number;
  isFrontRow: boolean;
}

/** Convert all seats in the room into world-space references. */
export function roomSeats(room: Room): SeatRef[] {
  const out: SeatRef[] = [];
  for (const desk of room.desks) {
    for (const seat of desk.seats) {
      const { x, y } = transformSeat(desk, seat);
      out.push({ seatId: seat.id, deskId: desk.id, x, y, isFrontRow: seat.isFrontRow });
    }
  }
  return out;
}

export function transformSeat(desk: Desk, seat: Seat): { x: number; y: number } {
  const cos = Math.cos((desk.rotation * Math.PI) / 180);
  const sin = Math.sin((desk.rotation * Math.PI) / 180);
  return {
    x: desk.x + seat.offsetX * cos - seat.offsetY * sin,
    y: desk.y + seat.offsetX * sin + seat.offsetY * cos,
  };
}

/**
 * Build the unordered set of adjacent seat-pairs for the current room.
 *
 * Two seats are adjacent if EITHER:
 * - they belong to the same multi-seat desk (always), OR
 * - one of them is among the other's K closest seats (by world-space
 *   Euclidean distance). The relation is symmetric: we take A and B as
 *   adjacent if A is in B's K-nearest **or** B is in A's K-nearest.
 *
 * This means the constraint scales naturally with desk density. In a tight
 * grid your "neighbors" really are right beside you; in a spread room your
 * "neighbors" are still your closest, even if absolute distances are large.
 */
export function adjacencyPairs(room: Room, k: number = K_NEAREST): Array<[SeatId, SeatId]> {
  const seats = roomSeats(room);
  const seatsByDesk = new Map<string, SeatRef[]>();
  for (const s of seats) {
    const arr = seatsByDesk.get(s.deskId) ?? [];
    arr.push(s);
    seatsByDesk.set(s.deskId, arr);
  }

  const seen = new Set<string>();
  const pairs: Array<[SeatId, SeatId]> = [];

  function addPair(a: SeatId, b: SeatId) {
    const key = pairKey(a, b);
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push([a, b]);
  }

  // 1. Same-desk seats are always adjacent.
  for (const arr of seatsByDesk.values()) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        addPair(arr[i].seatId, arr[j].seatId);
      }
    }
  }

  // 2. K-nearest from each seat's perspective. Because we add pairs in both
  // walks (any pair where A∈knn(B) OR B∈knn(A)), the relation ends up
  // symmetric even though K-nearest by itself isn't.
  for (const seat of seats) {
    const ranked = seats
      .filter((other) => other.seatId !== seat.seatId)
      .map((other) => {
        const dx = seat.x - other.x;
        const dy = seat.y - other.y;
        return { id: other.seatId, distSq: dx * dx + dy * dy };
      })
      .sort((a, b) => a.distSq - b.distSq)
      .slice(0, k);
    for (const { id } of ranked) addPair(seat.seatId, id);
  }

  return pairs;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
