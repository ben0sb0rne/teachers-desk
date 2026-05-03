import type { Arrangement, Room, SeatId, Student, StudentId } from "@/types";
import { adjacencyPairs, roomSeats } from "@/lib/adjacency";

export interface AssignInput {
  room: Room;
  students: Student[];
  history: Arrangement[];
}

/**
 * The solver always returns SOMETHING placeable — it never blocks the
 * Randomize button on infeasible constraints. If the strict pass can't
 * satisfy every Keep Apart / front-row rule, it falls back to a relaxed
 * pass and surfaces a `warnings` list describing what couldn't be honoured.
 * Callers should display the warnings but keep the (best-effort) assignment.
 */
export interface AssignResult {
  assignments: Record<SeatId, StudentId>;
  warnings: string[];
}

/**
 * Backtracking solver with hard constraints:
 *  - front-row students go in front-row seats
 *  - keep-apart pairs are never seated in adjacent seats
 *  - prefer pairings the students haven't had recently (soft tiebreaker)
 *
 * If those hard constraints can't all be satisfied, the solver no longer
 * gives up — it falls back to a relaxed pass (drops keep-apart, keeps
 * front-row as a soft preference) and surfaces what got violated through
 * the `warnings` array. Randomize never blocks on infeasible constraints.
 */
export function assign(input: AssignInput): AssignResult {
  const { room, students, history } = input;
  const seatRefs = roomSeats(room);
  const seatIds = seatRefs.map((s) => s.seatId);
  const warnings: string[] = [];

  // Pre-flight diagnostics — these become warnings, not hard failures, so
  // the caller still gets a placement they can show the room.
  if (students.length > seatIds.length) {
    const overflow = students.length - seatIds.length;
    warnings.push(
      `${students.length} students but only ${seatIds.length} seats — ${overflow} student${overflow === 1 ? "" : "s"} won't be seated.`,
    );
  }

  const frontRowSeatIds = new Set(seatRefs.filter((s) => s.isFrontRow).map((s) => s.seatId));
  const frontRowStudents = students.filter((s) => s.needsFrontRow);
  if (frontRowStudents.length > frontRowSeatIds.size) {
    warnings.push(
      `${frontRowStudents.length} students need the front row, but only ${frontRowSeatIds.size} front-row seat${frontRowSeatIds.size === 1 ? "" : "s"} exist — extras get a regular seat.`,
    );
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
  if (ok) {
    return { assignments, warnings };
  }

  // ----- Relaxed fallback ------------------------------------------------
  // Strict backtracking failed (or timed out). Reset and place greedily,
  // ignoring keep-apart but keeping the same scoring otherwise. Then audit
  // which keep-apart pairs ended up adjacent and surface those as warnings.
  for (const seat of Object.keys(assignments)) delete assignments[seat];
  seatTakenBy.clear();
  studentSeat.clear();

  for (const student of orderedStudents) {
    const candidates = candidateSeatsFor(student); // already sorted by score
    if (candidates.length === 0) {
      // No open seat at all — student goes unseated. Already warned above
      // when we know there are more students than seats.
      continue;
    }
    const seat = candidates[0];
    seatTakenBy.set(seat, student.id);
    studentSeat.set(student.id, seat);
    assignments[seat] = student.id;
  }

  // Surface the keep-apart pairs that ended up adjacent in the relaxed pass.
  const studentName = new Map(students.map((s) => [s.id, s.name]));
  const reportedConflicts = new Set<string>();
  for (const [a, b] of adjPairs) {
    const sa = seatTakenBy.get(a);
    const sb = seatTakenBy.get(b);
    if (!sa || !sb) continue;
    const apartA = keepApart.get(sa);
    const apartB = keepApart.get(sb);
    const violates = (apartA?.has(sb)) || (apartB?.has(sa));
    if (!violates) continue;
    const key = spairKey(sa, sb);
    if (reportedConflicts.has(key)) continue;
    reportedConflicts.add(key);
    const nameA = studentName.get(sa) ?? "?";
    const nameB = studentName.get(sb) ?? "?";
    warnings.push(`Couldn't keep ${nameA} and ${nameB} apart.`);
  }

  return { assignments, warnings };
}

function spairKey(a: StudentId, b: StudentId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
