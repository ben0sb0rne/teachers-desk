import type { Arrangement, Room, SeatId, Student, StudentId } from "@/types";
import { adjacencyPairs, roomSeats } from "@/lib/adjacency";

export interface AssignInput {
  room: Room;
  students: Student[];
  history: Arrangement[];
}

export type AssignResult =
  | { ok: true; assignments: Record<SeatId, StudentId> }
  | { ok: false; reason: string };

/**
 * Backtracking solver with hard constraints:
 *  - front-row students go in front-row seats
 *  - keep-apart pairs are never seated in adjacent seats
 *  - prefer pairings the students haven't had recently (soft tiebreaker)
 */
export function assign(input: AssignInput): AssignResult {
  const { room, students, history } = input;
  const seatRefs = roomSeats(room);
  const seatIds = seatRefs.map((s) => s.seatId);

  if (students.length > seatIds.length) {
    return { ok: false, reason: `${students.length} students but only ${seatIds.length} seats.` };
  }

  const frontRowSeatIds = new Set(seatRefs.filter((s) => s.isFrontRow).map((s) => s.seatId));
  const frontRowStudents = students.filter((s) => s.needsFrontRow);
  if (frontRowStudents.length > frontRowSeatIds.size) {
    return {
      ok: false,
      reason: `${frontRowStudents.length} students need the front row, but only ${frontRowSeatIds.size} front-row seat${frontRowSeatIds.size === 1 ? "" : "s"} exist.`,
    };
  }

  const adjPairs = adjacencyPairs(room);
  const adjBySeat = new Map<SeatId, Set<SeatId>>();
  for (const [a, b] of adjPairs) {
    if (!adjBySeat.has(a)) adjBySeat.set(a, new Set());
    if (!adjBySeat.has(b)) adjBySeat.set(b, new Set());
    adjBySeat.get(a)!.add(b);
    adjBySeat.get(b)!.add(a);
  }

  // Lookup table for the soft "push apart" score below — given a seat id,
  // where is that seat in the room?
  const seatPosBy = new Map<SeatId, { x: number; y: number }>();
  for (const s of seatRefs) seatPosBy.set(s.seatId, { x: s.x, y: s.y });

  const keepApart = new Map<StudentId, Set<StudentId>>();
  for (const s of students) keepApart.set(s.id, new Set(s.keepApart));

  // Recency: pair-key -> weight (more recent = higher weight)
  const pairWeight = new Map<string, number>();
  history.forEach((arr, idx) => {
    const decay = 1 / (idx + 1);
    const studentBySeat = arr.assignments;
    for (const [a, b] of adjPairs) {
      const sa = studentBySeat[a];
      const sb = studentBySeat[b];
      if (sa && sb) {
        pairWeight.set(spairKey(sa, sb), (pairWeight.get(spairKey(sa, sb)) ?? 0) + decay);
      }
    }
  });

  // Order: hardest students first (front-row + many keep-apart relations).
  const orderedStudents = [...students].sort((a, b) => {
    const ascore = (a.needsFrontRow ? 1000 : 0) + a.keepApart.length;
    const bscore = (b.needsFrontRow ? 1000 : 0) + b.keepApart.length;
    return bscore - ascore;
  });

  const assignments: Record<SeatId, StudentId> = {};
  const seatTakenBy = new Map<SeatId, StudentId>();
  const studentSeat = new Map<StudentId, SeatId>();

  function candidateSeatsFor(student: Student): SeatId[] {
    const open = seatIds.filter((s) => !seatTakenBy.has(s));
    const constrained = student.needsFrontRow ? open.filter((s) => frontRowSeatIds.has(s)) : open;

    // Score: lower = better. Prefer not-front-row seats for non-front-row students (saves them for who needs them).
    const apart = keepApart.get(student.id) ?? new Set();

    return constrained
      .map((seat) => {
        let score = 0;
        // Front-row seats are PRIORITY fill: front-row-flagged students get
        // them first (handled by ordering), then non-front-row students prefer
        // them over regular seats — so empty seats end up in the back, not
        // up front where the teacher is looking.
        if (!student.needsFrontRow && frontRowSeatIds.has(seat)) score -= 50;
        // Recency penalty: sum of recent-pair weights with whoever already sits in adjacent seats.
        const neighbors = adjBySeat.get(seat) ?? new Set();
        for (const n of neighbors) {
          const occupant = seatTakenBy.get(n);
          if (occupant) score += (pairWeight.get(spairKey(student.id, occupant)) ?? 0) * 100;
        }
        // Soft "push apart" pass: even when a seat is technically not
        // adjacent to a Keep Apart partner, prefer placements that put them
        // physically further away. The penalty falls linearly to zero at
        // ~600 px so it only nudges decisions when there's a meaningful
        // closer-vs-further choice; max ~150 score units, comparable to the
        // recency term so neither dominates.
        const candidatePos = seatPosBy.get(seat);
        if (candidatePos) {
          for (const partnerId of apart) {
            const partnerSeatId = studentSeat.get(partnerId);
            if (!partnerSeatId) continue;
            const partnerPos = seatPosBy.get(partnerSeatId);
            if (!partnerPos) continue;
            const dx = candidatePos.x - partnerPos.x;
            const dy = candidatePos.y - partnerPos.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 600) score += (600 - dist) * 0.25;
          }
        }
        // Light randomness for variety on equal scores.
        score += Math.random() * 0.1;
        return { seat, score };
      })
      .sort((a, b) => a.score - b.score)
      .map((x) => x.seat);
  }

  function violates(seat: SeatId, student: Student): boolean {
    const neighbors = adjBySeat.get(seat) ?? new Set();
    const apart = keepApart.get(student.id) ?? new Set();
    for (const n of neighbors) {
      const occupant = seatTakenBy.get(n);
      if (occupant && apart.has(occupant)) return true;
      if (occupant) {
        const occupantApart = keepApart.get(occupant) ?? new Set();
        if (occupantApart.has(student.id)) return true;
      }
    }
    return false;
  }

  function backtrack(idx: number, deadline: number): boolean {
    if (idx >= orderedStudents.length) return true;
    if (performance.now() > deadline) return false;
    const student = orderedStudents[idx];
    for (const seat of candidateSeatsFor(student)) {
      if (violates(seat, student)) continue;
      seatTakenBy.set(seat, student.id);
      studentSeat.set(student.id, seat);
      assignments[seat] = student.id;
      if (backtrack(idx + 1, deadline)) return true;
      seatTakenBy.delete(seat);
      studentSeat.delete(student.id);
      delete assignments[seat];
    }
    return false;
  }

  const ok = backtrack(0, performance.now() + 2000);
  if (!ok) {
    return {
      ok: false,
      reason:
        "Couldn't satisfy all Keep Apart and front-row constraints. Try removing a Keep Apart pair, marking more desks as front row, or reducing the number of front-row students.",
    };
  }
  return { ok: true, assignments };
}

function spairKey(a: StudentId, b: StudentId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
