// =============================================================
// THE TEACHER'S DESK — wheel/picker engine (STUB)
//
// Future home for shared name-picking logic: weighted random selection
// that respects per-student call counts (so the same kid doesn't get
// picked five times in a row). Used by the Wheel of Names today, and
// by future pickers (group-maker, around-the-world challenger order).
//
// Today this file is a placeholder so consumers can import it without
// breaking. The real implementation lands when fairness-weighted picks
// are needed.
// =============================================================

import * as storage from './storage.js';

/**
 * Pick one name from a roster. NOT YET IMPLEMENTED.
 *
 * Planned signature:
 *   pickRandom(classId, options?: { weighted?: boolean, exclude?: string[] })
 *   - weighted=true uses storage.getCallCount to bias toward less-called names.
 *   - exclude omits absent students.
 *
 * @param {string} _classId
 * @param {object} [_options]
 * @returns {never}
 */
export function pickRandom(_classId, _options) {
  throw new Error(
    'wheel-engine.pickRandom is not implemented yet. Fairness-weighted picks ship in a later phase.'
  );
}

/**
 * Pick N groups of K names from a roster. NOT YET IMPLEMENTED.
 * @returns {never}
 */
export function pickGroups(/* classId, groupCount, groupSize, options */) {
  throw new Error('wheel-engine.pickGroups is not implemented yet.');
}

// Re-exported for convenience so consumers can read call counts via this engine.
export const _storage = storage;

export default { pickRandom, pickGroups };
