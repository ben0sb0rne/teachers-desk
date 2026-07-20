// =============================================================
// shared/nav-levels.js — browser history for in-tool levels.
//
// The vanilla tools render their levels (class select → setup →
// game) as JS state, so by default the browser's Back button EXITS
// the tool instead of walking up a level — breaking the most
// tried-and-true navigation behavior on the web. This helper tags
// a history entry per level so Back/Forward walk the hierarchy.
//
//   const nav = initLevels({
//     onNavigate(levelId) {
//       // Render `levelId` WITHOUT touching history. Return true if
//       // handled; return false to veto (the helper silently restores
//       // the previous entry — used for dirty-guards and for Forward
//       // into a level whose state no longer exists).
//     },
//   });
//   nav.setRoot('select');   // once at boot (replaceState)
//   nav.push('game');        // on drill-down (after rendering it)
//   nav.pop();               // user asked to go up one level
//   nav.popTo('select');     // jump up to an ancestor
//
// pop()/popTo() drive history.back()/go(), so the SAME onNavigate
// path renders the level whether the user clicked a crumb, pressed
// Esc, or hit the browser's Back button. URLs are untouched
// (pushState with state objects only).
// =============================================================

export function initLevels({ onNavigate }) {
  let stack = [];
  let reverting = false;

  function stateFor() {
    return { suiteStack: stack.slice() };
  }

  window.addEventListener('popstate', (e) => {
    const incoming = e.state && e.state.suiteStack;
    if (!incoming || incoming.length === 0) return; // beyond our root — browser's business
    if (reverting) { reverting = false; return; }   // our own restore hop
    const prevDepth = stack.length;
    const target = incoming[incoming.length - 1];
    const handled = onNavigate(target) !== false;
    if (handled) {
      stack = incoming.slice();
    } else {
      // Veto: silently walk history back to where we were.
      reverting = true;
      const delta = prevDepth - incoming.length;
      if (delta !== 0) history.go(delta);
      else reverting = false;
    }
  });

  return {
    /** Tag the tool's top level. Call once at boot. */
    setRoot(levelId) {
      stack = [levelId];
      history.replaceState(stateFor(), '');
    },
    /** Record a drill-down (render first, then push). */
    push(levelId) {
      stack.push(levelId);
      history.pushState(stateFor(), '');
    },
    /** Swap the current level in place (lateral moves — e.g. bingo's
     *  caller → designer when the designer wasn't on the way in). */
    replace(levelId) {
      stack[stack.length - 1] = levelId;
      history.replaceState(stateFor(), '');
    },
    /** One level up — renders via onNavigate through popstate. */
    pop() {
      if (stack.length > 1) history.back();
    },
    /** Up to a specific ancestor in one hop. */
    popTo(levelId) {
      const idx = stack.indexOf(levelId);
      if (idx >= 0 && idx < stack.length - 1) history.go(idx - (stack.length - 1));
    },
    /** Current depth (1 = at the root level; 0 = before setRoot). */
    depth() {
      return stack.length;
    },
    /** Whether a level id is anywhere in the current stack. */
    contains(levelId) {
      return stack.includes(levelId);
    },
    /** The current level id. */
    current() {
      return stack[stack.length - 1];
    },
  };
}
