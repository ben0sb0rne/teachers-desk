// =============================================================
// THE TEACHER'S DESK — tip jar (STUB)
//
// Future home for an optional, low-key Stripe-backed tip jar that a
// teacher can drop a few dollars into. Today this file is a no-op
// placeholder so the suite has a stable import path for it.
//
// Design intent (when implemented):
// - Stripe Payment Links opened in a new tab — no card data ever
//   touches our code.
// - Lives in a corner of the homepage, never inside a tool's flow.
// - Quiet by default. Visible but never modal.
// =============================================================

/**
 * Mount the tip jar into a host element. NOT YET IMPLEMENTED.
 *
 * @param {HTMLElement} _host
 * @param {object} [_options]
 */
export function mountTipJar(_host, _options) {
  // eslint-disable-next-line no-console
  console.log('[teachersdesk] tip-jar stub: mountTipJar is a no-op until the real implementation lands.');
}

export default { mountTipJar };
