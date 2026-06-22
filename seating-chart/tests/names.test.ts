import { describe, it, expect } from "vitest";
import { migrateV9toV10 } from "@/lib/migrations";
import { collisionFirstNames, displayName } from "@/lib/displayName";
import type { Student } from "@/types";

function student(partial: Partial<Student> & { name: string }): Student {
  return { id: partial.name, needsFrontRow: false, keepApart: [], ...partial };
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

    // Single token → first name only.
    expect(cher.firstName).toBe("Cher");
    expect(cher.lastName).toBe("");

    // Multi-word last name stays with `last`.
    expect(mj.firstName).toBe("Mary");
    expect(mj.lastName).toBe("Jane Watson");

    // Lossless: the canonical `name` is unchanged for every student.
    for (const s of out.classes[0].students) {
      const original = v9.classes[0].students.find((x) => x.id === s.id)!;
      expect(s.name).toBe(original.name);
      expect(`${s.firstName} ${s.lastName}`.trim()).toBe(original.name);
    }
  });

  it("preserves other fields and bumps the version", () => {
    const out = migrateV9toV10(v9);
    expect(out.schemaVersion).toBe(10);
    expect(out.classes[0].students[2].needsFrontRow).toBe(true);
    expect(out.classes[0].students[2].keepApart).toEqual(["a"]);
    expect(out.classes[0].seatings).toEqual([]);
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

  it("collision mode adds a last initial only when needed", () => {
    expect(displayName(roster[0], "collision", collisions)).toBe("Chris R.");
    expect(displayName(roster[2], "collision", collisions)).toBe("Alan");
  });

  it("honours the explicit modes", () => {
    expect(displayName(roster[0], "first")).toBe("Chris");
    expect(displayName(roster[0], "first-initial")).toBe("Chris R.");
    expect(displayName(roster[0], "full")).toBe("Chris Redfield");
    expect(displayName(roster[2], "number")).toBe("7");
    // No number set → fall back to the full name.
    expect(displayName(roster[0], "number")).toBe("Chris Redfield");
  });

  it("falls back to the canonical name when structured parts are missing", () => {
    const solo = student({ name: "Madonna" });
    expect(displayName(solo, "collision")).toBe("Madonna");
    expect(displayName(solo, "first-initial")).toBe("Madonna");
  });
});
