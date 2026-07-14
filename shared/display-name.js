// =============================================================
// shared/display-name.js — compose a student's display label from
// name-display toggles.
//
// Vanilla port of seating-chart/src/lib/displayName.ts so pickers
// (Wheel of Names today, Team Maker later) label students the same
// way seating charts do. The two must stay in sync — if the seating
// chart's rules change, change them here too.
//
// Students created outside the seating chart only have a canonical
// name string, so `displayName` falls back to splitting `name` when
// the structured firstName/lastName fields are absent.
// =============================================================

/** Mirror of the seating chart's DEFAULT_NAME_DISPLAY: first name, plus a
 *  last initial only when two students share a first name. */
export const DEFAULT_NAME_DISPLAY = Object.freeze({
  firstName: true,
  lastName: false,
  lastInitial: false,
  studentNumber: false,
  autoInitial: true,
});

/** Split a canonical name string into first/last. First space wins
 *  ("Mary Jo Baker" → "Mary" / "Jo Baker", same as the seating chart's
 *  splitName). Comma form ("Baker, Mary Jo") flips — the seating chart
 *  normalizes commas at paste time, but wheel-created rosters store the
 *  raw line, so display-time parsing has to cope.
 *  @param {string} full
 *  @returns {{ firstName: string, lastName: string }} */
export function splitName(full) {
  const raw = String(full ?? '').trim();
  const comma = raw.indexOf(',');
  if (comma !== -1) {
    return {
      firstName: raw.slice(comma + 1).trim(),
      lastName: raw.slice(0, comma).trim(),
    };
  }
  const sp = raw.indexOf(' ');
  return sp === -1
    ? { firstName: raw, lastName: '' }
    : { firstName: raw.slice(0, sp), lastName: raw.slice(sp + 1).trim() };
}

/** Structured first/last for a student record, parsing the canonical name
 *  when the explicit fields are missing.
 *  @param {{ name: string, firstName?: string, lastName?: string }} student */
function nameParts(student) {
  if (student.firstName != null || student.lastName != null) {
    return {
      firstName: String(student.firstName ?? '').trim(),
      lastName: String(student.lastName ?? '').trim(),
    };
  }
  return splitName(student.name);
}

/** First names shared by ≥2 students in the class (lower-cased). The
 *  `autoInitial` toggle adds a last initial only for these.
 *  @param {Array<{ name: string, firstName?: string, lastName?: string }>} students
 *  @returns {Set<string>} */
export function collisionFirstNames(students) {
  const counts = new Map();
  for (const s of students) {
    const f = nameParts(s).firstName.toLowerCase();
    if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  const dupes = new Set();
  for (const [name, n] of counts) if (n > 1) dupes.add(name);
  return dupes;
}

/** Compose a student's label from display toggles. Falls back to the
 *  canonical `name` when the toggles would otherwise produce nothing.
 *  @param {{ name: string, firstName?: string, lastName?: string, studentNumber?: string }} student
 *  @param {typeof DEFAULT_NAME_DISPLAY} [display]
 *  @param {Set<string>} [collisions] Precomputed via collisionFirstNames().
 *  @returns {string} */
export function displayName(student, display = DEFAULT_NAME_DISPLAY, collisions) {
  const { firstName: first, lastName: last } = nameParts(student);
  const full = String(student.name ?? '').trim();
  const initial = last ? `${last[0].toUpperCase()}.` : '';

  // Which last-name piece (if any) — full wins over initial; the auto-initial
  // only kicks in when no explicit last piece is shown and the first name clashes.
  let lastBit = '';
  if (display.lastName && last) lastBit = last;
  else if (display.lastInitial && last) lastBit = initial;
  else if (
    display.autoInitial &&
    display.firstName &&
    last &&
    (collisions?.has(first.toLowerCase()) ?? false)
  )
    lastBit = initial;

  let namePart = '';
  if (display.firstName && first) namePart = first;
  if (lastBit) namePart = namePart ? `${namePart} ${lastBit}` : lastBit;

  const pieces = [];
  if (namePart) pieces.push(namePart);
  const num = String(student.studentNumber ?? '').trim();
  if (display.studentNumber && num) pieces.push(`#${num}`);

  return pieces.join(' ') || full || first;
}
