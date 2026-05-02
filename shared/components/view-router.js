// =============================================================
// shared/components/view-router.js
//
// Tiny helper for vanilla tools that have multiple top-level views
// switched by setting `hidden` on each view element. Replaces the
// little `showView(name)` function each tool reinvents.
//
//   const router = createViewRouter({
//     classSelect: document.getElementById('class-select-view'),
//     wheel:       document.getElementById('wheel-view'),
//   });
//   router.show('wheel');
//   router.current(); // → 'wheel'
//   router.onChange((name, prev) => { ... });
// =============================================================

/**
 * @typedef {object} ViewRouter
 * @property {(name: string) => void} show
 * @property {() => string | null} current
 * @property {(cb: (next: string, prev: string | null) => void) => () => void} onChange
 */

/**
 * @param {Record<string, HTMLElement>} views — view name → element
 * @returns {ViewRouter}
 */
export function createViewRouter(views) {
  let active = null;
  const listeners = new Set();

  function show(name) {
    if (!(name in views)) {
      // eslint-disable-next-line no-console
      console.warn(`[view-router] unknown view "${name}"`);
      return;
    }
    if (active === name) return;
    const prev = active;
    for (const [key, el] of Object.entries(views)) {
      el.hidden = key !== name;
    }
    active = name;
    for (const cb of listeners) {
      try { cb(name, prev); } catch (_e) { /* swallow */ }
    }
  }

  function current() {
    return active;
  }

  function onChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  // Initialize: pick the first view that's already visible (hidden=false).
  for (const [name, el] of Object.entries(views)) {
    if (!el.hidden) {
      active = name;
      break;
    }
  }

  return { show, current, onChange };
}
