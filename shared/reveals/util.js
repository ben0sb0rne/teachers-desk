// =============================================================
// shared/reveals/util.js — plumbing shared by the reveal modules.
//
// THE REVEAL CONTRACT
// A reveal module default-exports:
//   { id, label, glyph, create(host, ctx) }
// create() builds its DOM/canvas inside `host` (an empty positioned
// div) and returns { start(), destroy() }.
//
//   ctx = {
//     assignments: [{ name, initials, color, binIndex }]  reveal order,
//     bins:        [{ label, size }],
//     onAssign(i): called as assignments[i] lands (host UI fills its
//                  team column),
//     onDone():    called once after the last assignment,
//     reducedMotion: honor prefers-reduced-motion — assign everything
//                  immediately, no animation.
//   }
//
// Modules are self-contained (own styles, own cleanup) so any tool —
// Team Maker today, single-student pickers later — can mount them.
// =============================================================

/** Install a module's stylesheet once per document. */
export function ensureStyles(id, cssText) {
  if (document.getElementById(`rv-style-${id}`)) return;
  const el = document.createElement('style');
  el.id = `rv-style-${id}`;
  el.textContent = cssText;
  document.head.appendChild(el);
}

/** setTimeout that registers into a Set so destroy() can flush. */
export function makeTimers() {
  const pending = new Set();
  return {
    after(ms, fn) {
      const t = setTimeout(() => { pending.delete(t); fn(); }, ms);
      pending.add(t);
      return t;
    },
    every(ms, fn) {
      const t = setInterval(fn, ms);
      pending.add(t);
      return t;
    },
    clear() {
      for (const t of pending) { clearTimeout(t); clearInterval(t); }
      pending.clear();
    },
  };
}

/** Reduced-motion path shared by every module: land everything now. */
export function assignAllInstantly(ctx) {
  for (let i = 0; i < ctx.assignments.length; i++) ctx.onAssign(i);
  ctx.onDone();
}
