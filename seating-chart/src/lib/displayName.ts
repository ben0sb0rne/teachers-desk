import type { NameDisplay, Student } from "@/types";
import { DEFAULT_NAME_DISPLAY } from "@/types";

/** First names shared by ≥2 students in the class (lower-cased). The
 *  `autoInitial` toggle adds a last initial only for these. Computed from the
 *  whole roster so a name renders the same whether or not its twin is seated. */
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

/** Compose a student's chart label from the class's display toggles. Falls back
 *  to the canonical `name` when the toggles would otherwise produce nothing. */
export function displayName(
  student: Student,
  display: NameDisplay = DEFAULT_NAME_DISPLAY,
  collisions?: Set<string>,
): string {
  const first = (student.firstName ?? "").trim();
  const last = (student.lastName ?? "").trim();
  const full = student.name.trim();
  const initial = last ? `${last[0].toUpperCase()}.` : "";

  // Which last-name piece (if any) — full wins over initial; the auto-initial
  // only kicks in when no explicit last piece is shown and the first name clashes.
  let lastBit = "";
  if (display.lastName && last) lastBit = last;
  else if (display.lastInitial && last) lastBit = initial;
  else if (display.autoInitial && display.firstName && last && (collisions?.has(first.toLowerCase()) ?? false))
    lastBit = initial;

  let namePart = "";
  if (display.firstName && first) namePart = first;
  if (lastBit) namePart = namePart ? `${namePart} ${lastBit}` : lastBit;

  const pieces: string[] = [];
  if (namePart) pieces.push(namePart);
  if (display.studentNumber && student.studentNumber?.trim()) pieces.push(`#${student.studentNumber.trim()}`);

  return pieces.join(" ") || full || first;
}
