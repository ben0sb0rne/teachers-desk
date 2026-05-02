// =============================================================
// shared/components/overlay.js
//
// Modal overlay with the suite's standard chrome — .suite-overlay /
// .suite-panel / .suite-panel-header / .suite-panel-body (defined in
// shared/desk.css). Opens, focuses, handles Esc + click-outside-to-close.
//
//   const handle = openOverlay({ title: 'New class' });
//   handle.body.innerHTML = '<input ...>';
//   ...
//   handle.close();
// =============================================================

/**
 * @typedef {object} OverlayHandle
 * @property {HTMLElement} body — the panel body element to populate
 * @property {() => void} close — closes the overlay and runs onClose
 */

/**
 * Open an overlay. Returns { body, close }. Caller appends content to body.
 * Esc closes. Click on the dimmed backdrop closes. Focus moves to the close
 * button so screen readers and keyboard users land somewhere predictable.
 *
 * @param {object} opts
 * @param {string} opts.title — heading text for the panel header
 * @param {() => void} [opts.onClose] — called after the overlay is removed
 * @returns {OverlayHandle}
 */
export function openOverlay({ title, onClose } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'suite-overlay';

  const panel = document.createElement('div');
  panel.className = 'suite-panel';

  const header = document.createElement('div');
  header.className = 'suite-panel-header';

  const h2 = document.createElement('h2');
  h2.textContent = title || '';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'suite-panel-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×'; // ×

  const body = document.createElement('div');
  body.className = 'suite-panel-body';

  header.appendChild(h2);
  header.appendChild(closeBtn);
  panel.appendChild(header);
  panel.appendChild(body);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  let isClosed = false;

  function close() {
    if (isClosed) return;
    isClosed = true;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    if (typeof onClose === 'function') {
      try { onClose(); } catch (_e) { /* swallow */ }
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);

  setTimeout(() => closeBtn.focus(), 0);

  return { body, close };
}
