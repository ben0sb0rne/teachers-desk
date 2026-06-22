import type { NameDisplayMode, Student } from "@/types";

/** First names shared by ≥2 students in the class (lower-cased). The
 *  "collision" display mode adds a last initial only for these. Computed from
 *  the whole roster so a name renders the same whether or not its twin is
 *  currently seated. */
export function collisionFirstNames(students: Student[]): Set<string> {
  const counts = new Map<string, number>();
  for (const s of students) {
    const f = (s.firstName ?? s.name).trim().toLowerCase();
    if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  const dupes = new Set<string>();
  for (const [name, n] of counts) if (n > 1) dupes.add(name);
  return dupes;
}

/** How a student's name reads on the chart, per the class's display mode.
 *  Falls back to the canonical `name` whenever structured parts are missing. */
export function displayName(
  student: Student,
  mode: NameDisplayMode = "collision",
  collisions?: Set<string>,
): string {
  const first = (student.firstName ?? "").trim();
  const last = (student.lastName ?? "").trim();
  const full = student.name.trim();

  if (mode === "number") return student.studentNumber?.trim() || full;
  if (!first && !last) return full;

  const lastInitial = last ? `${last[0].toUpperCase()}.` : "";
  switch (mode) {
    case "full":
      return full || [first, last].filter(Boolean).join(" ");
    case "first":
      return first || full;
    case "first-initial":
      return [first, lastInitial].filter(Boolean).join(" ") || full;
    case "collision":
    default: {
      const collides = collisions?.has(first.toLowerCase()) ?? false;
      return collides && lastInitial ? `${first} ${lastInitial}` : first || full;
    }
  }
}
