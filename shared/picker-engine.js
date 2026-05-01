// =============================================================
// THE TEACHER'S DESK — picker engine (STUB)
//
// Future home for shared name-picker logic: weighted random selection
// that respects per-student call counts (so the same kid doesn't get
// picked five times in a row).
//
// Today this file is a placeholder so consumers can import it without
// breaking. The real implementation lands when the first picker tool
// (Random Student / Random Group) is built.
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
    'picker-engine.pickRandom is not implemented yet. The picker tool ships in a later phase.'
  );
}

/**
 * Pick N groups of K names from a roster. NOT YET IMPLEMENTED.
 * @returns {never}
 */
export function pickGroups(/* classId, groupCount, groupSize, options */) {
  throw new Error('picker-engine.pickGroups is not implemented yet.');
}

// Re-exported for convenience so consumers can read call counts via the picker.
export const _storage = storage;

export default { pickRandom, pickGroups };
