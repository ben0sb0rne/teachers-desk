import { describe, expect, it } from "vitest";
import { assign } from "@/lib/assign";
import type { Desk, Room, Seat, Student } from "@/types";

let counter = 0;
const sid = () => `s-${counter++}`;

function seat(opts?: Partial<Seat>): Seat {
  return { id: sid(), offsetX: 30, offsetY: 25, isFrontRow: false, ...opts };
}

/** Build a single-student rectangle desk for tests. */
function singleDesk(x: number, y: number, s: Seat = seat()): Desk {
  return { id: sid(), kind: "single-rect", x, y, rotation: 0, width: 60, height: 50, seats: [s] };
}

/** Build a multi-rect desk with given seats (positions provided by caller). */
function multiDesk(x: number, y: number, seats: Seat[], rows = 1, cols = 2): Desk {
  return {
    id: sid(),
    kind: "multi-rect",
    x,
    y,
    rotation: 0,
    width: cols * 50,
    height: rows * 40,
    rows,
    cols,
    seats,
  };
}

function student(name: string, opts?: Partial<Student>): Student {
  return { id: sid(), name, needsFrontRow: false, keepApart: [], ...opts };
}

function room(desks: Desk[]): Room {
  return { width: 1000, height: 700, frontWall: "top", desks, furniture: [] };
}

describe("assign", () => {
  it("assigns when there are exactly enough seats", () => {
    counter = 0;
    const s1 = seat();
    const s2 = seat();
    const r = room([singleDesk(0, 0, s1), singleDesk(100, 0, s2)]);
    const a = student("A");
    const b = student("B");
    const result = assign({ room: r, students: [a, b], history: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.keys(result.assignments).sort()).toEqual([s1.id, s2.id].sort());
  });

  it("fails when too many students", () => {
    counter = 0;
    const r = room([singleDesk(0, 0)]);
    const result = assign({ room: r, students: [student("A"), student("B")], history: [] });
    expect(result.ok).toBe(false);
  });

  it("places front-row students in front-row seats only", () => {
    counter = 0;
    const front1 = seat({ isFrontRow: true });
    const front2 = seat({ isFrontRow: true });
    const back1 = seat();
    const back2 = seat();
    const r = room([
      singleDesk(0, 0, front1),
      singleDesk(100, 0, front2),
      singleDesk(0, 200, back1),
      singleDesk(100, 200, back2),
    ]);
    const f = student("F", { needsFrontRow: true });
    const x = student("X");
    const y = student("Y");
    const z = student("Z");
    const result = assign({ room: r, students: [f, x, y, z], history: [] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const fSeat = Object.entries(result.assignments).find(([, sid]) => sid === f.id)?.[0];
      expect([front1.id, front2.id]).toContain(fSeat);
    }
  });

  it("fails when more front-row students than front-row seats", () => {
    counter = 0;
    const front = seat({ isFrontRow: true });
    const back = seat();
    const r = room([singleDesk(0, 0, front), singleDesk(0, 200, back)]);
    const result = assign({
      room: r,
      students: [student("F1", { needsFrontRow: true }), student("F2", { needsFrontRow: true })],
      history: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/front/i);
  });

  it("never seats Keep Apart pair in same multi-seat desk", () => {
    counter = 0;
    const s1 = seat({ offsetX: 12, offsetY: 20 });
    const s2 = seat({ offsetX: 38, offsetY: 20 });
    const s3 = seat();
    const s4 = seat();
    const s5 = seat();
    // Two-seat multi-rect plus three single desks spread far enough apart
    // that under K-nearest adjacency, the two ends of the room (s1/s2 vs s5)
    // are NOT mutually adjacent — leaving room for a Keep Apart pair.
    const r = room([
      multiDesk(0, 0, [s1, s2], 1, 2),
      singleDesk(500, 500, s3),
      singleDesk(1000, 1000, s4),
      singleDesk(1500, 1500, s5),
    ]);
    const a = student("A");
    const b = student("B");
    a.keepApart = [b.id];
    b.keepApart = [a.id];
    const c = student("C");
    const result = assign({ room: r, students: [a, b, c], history: [] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const seatA = Object.entries(result.assignments).find(([, id]) => id === a.id)?.[0];
      const seatB = Object.entries(result.assignments).find(([, id]) => id === b.id)?.[0];
      // Same-desk seats are always neighbors, so A and B should never both end up there.
      const sameDesk = (seatA === s1.id && seatB === s2.id) || (seatA === s2.id && seatB === s1.id);
      expect(sameDesk).toBe(false);
    }
  });

  it("fails when keep-apart graph is unsatisfiable for a single-desk room", () => {
    counter = 0;
    const s1 = seat({ offsetX: 12, offsetY: 20 });
    const s2 = seat({ offsetX: 38, offsetY: 20 });
    const r = room([multiDesk(0, 0, [s1, s2], 1, 2)]);
    const a = student("A");
    const b = student("B");
    a.keepApart = [b.id];
    b.keepApart = [a.id];
    const result = assign({ room: r, students: [a, b], history: [] });
    expect(result.ok).toBe(false);
  });

  it("works with empty roster", () => {
    counter = 0;
    const r = room([singleDesk(0, 0)]);
    const result = assign({ room: r, students: [], history: [] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.keys(result.assignments)).toHaveLength(0);
  });
});
