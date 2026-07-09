import { describe, it, expect } from "vitest";
import { migrateV9toV10, migrateV10toV11, runMigrations } from "@/lib/migrations";
import { collisionFirstNames, displayName } from "@/lib/displayName";
import { DEFAULT_NAME_DISPLAY, SCHEMA_VERSION } from "@/types";
import type { NameDisplay, Student } from "@/types";

function student(partial: Partial<Student> & { name: string }): Student {
  return { id: partial.name, needsFrontRow: false, keepApart: [], ...partial };
}

/** Build a NameDisplay from a partial (everything off by default). */
function nd(p: Partial<NameDisplay>): NameDisplay {
  return { firstName: false, lastName: false, lastInitial: false, studentNumber: false, autoInitial: false, ...p };
}

describe("migrateV9toV10", () => {
  const v9 = {
    rooms: [],
    classes: [
      {
        id: "c1",
        name: "Period 1",
        students: [
          { id: "a", name: "Ada Lovelace", needsFrontRow: false, keepApart: [] },
          { id: "b", name: "Cher", needsFrontRow: false, keepApart: [] },
          { id: "c", name: "Mary Jane Watson", needsFrontRow: true, keepApart: ["a"] },
        ],
        seatings: [],
      },
    ],
    activeClassId: null,
    schemaVersion: 9,
  };

  it("splits names on the first space, losslessly", () => {
    const out = migrateV9toV10(v9);
    const [ada, cher, mj] = out.classes[0].students;
    expect(ada.firstName).toBe("Ada");
    expect(ada.lastName).toBe("Lovelace");
    expect(cher.firstName).toBe("Cher");
    expect(cher.lastName).toBe("");
    expect(mj.firstName).toBe("Mary");
    expect(mj.lastName).toBe("Jane Watson");
    for (const s of out.classes[0].students) {
      const original = v9.classes[0].students.find((x) => x.id === s.id)!;
      expect(s.name).toBe(original.name);
      expect(`${s.firstName} ${s.lastName}`.trim()).toBe(original.name);
    }
  });
});

describe("migrateV10toV11", () => {
  const v10 = {
    rooms: [],
    classes: [
      { id: "c1", name: "P1", students: [], seatings: [], nameDisplay: "full" },
      { id: "c2", name: "P2", students: [], seatings: [] },
      { id: "c3", name: "P3", students: [], seatings: [], nameDisplay: "number" },
    ],
    activeClassId: null,
    schemaVersion: 10,
  };

  it("maps the old enum to toggles and leaves unset modes unset", () => {
    const out = migrateV10toV11(v10);
    // Migration steps stamp the CURRENT schema version, not their own.
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.classes[0].nameDisplay).toEqual(nd({ firstName: true, lastName: true }));
    expect(out.classes[1].nameDisplay).toBeUndefined();
    expect(out.classes[2].nameDisplay).toEqual(nd({ studentNumber: true }));
  });

  it("v11 → v12 is a pass-through (autoOrder stays unset)", () => {
    const v11 = { rooms: [], classes: [{ id: "c1", name: "P1", students: [], seatings: [] }], activeClassId: null, schemaVersion: 11 };
    const out = runMigrations(v11, 11);
    expect(out.classes[0].autoOrder).toBeUndefined();
    expect(out.classes[0].name).toBe("P1");
  });
});

describe("displayName", () => {
  const roster = [
    student({ name: "Chris Redfield", firstName: "Chris", lastName: "Redfield" }),
    student({ name: "Chris Fields", firstName: "Chris", lastName: "Fields" }),
    student({ name: "Alan Wake", firstName: "Alan", lastName: "Wake", studentNumber: "7" }),
  ];
  const collisions = collisionFirstNames(roster);

  it("flags only shared first names as collisions", () => {
    expect(collisions.has("chris")).toBe(true);
    expect(collisions.has("alan")).toBe(false);
  });

  it("default adds a last initial only when first names clash", () => {
    expect(displayName(roster[0], DEFAULT_NAME_DISPLAY, collisions)).toBe("Chris R.");
    expect(displayName(roster[2], DEFAULT_NAME_DISPLAY, collisions)).toBe("Alan");
  });

  it("composes the toggled pieces", () => {
    expect(displayName(roster[0], nd({ firstName: true }))).toBe("Chris");
    expect(displayName(roster[0], nd({ firstName: true, lastInitial: true }))).toBe("Chris R.");
    expect(displayName(roster[0], nd({ firstName: true, lastName: true }))).toBe("Chris Redfield");
    expect(displayName(roster[2], nd({ studentNumber: true }))).toBe("#7");
    expect(displayName(roster[2], nd({ firstName: true, studentNumber: true }))).toBe("Alan #7");
    // full last name wins over the initial when both are on.
    expect(displayName(roster[0], nd({ firstName: true, lastName: true, lastInitial: true }))).toBe("Chris Redfield");
  });

  it("falls back to the canonical name when toggles yield nothing", () => {
    const solo = student({ name: "Madonna" });
    expect(displayName(solo, nd({ firstName: true }))).toBe("Madonna");
    expect(displayName(roster[0], nd({ studentNumber: true }))).toBe("Chris Redfield");
  });
});
