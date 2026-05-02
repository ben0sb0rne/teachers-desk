// =============================================================
// shared/components/paste-bulk.js
//
// Textarea + submit button. On submit, splits the pasted text into
// trimmed lines, dedupes case-insensitively, calls onSubmit(names[])
// with the cleaned list, and clears the textarea.
//
//   const ctl = mountPasteBulk(host, {
//     placeholder: 'Alice\nBob',
//     buttonLabel: 'Add to class',
//     onSubmit: (names) => addStudents(names),
//   });
//   ctl.setDisabled(true);
//   ctl.destroy();
// =============================================================

/**
 * @typedef {object} PasteBulkController
 * @property {(disabled: boolean) => void} setDisabled
 * @property {() => void} reset
 * @property {() => void} destroy
 * @property {() => void} focus
 */

/**
 * Mount a paste-bulk textarea + button into `host`.
 *
 * @param {HTMLElement} host
 * @param {object} opts
 * @param {string} [opts.placeholder]
 * @param {number} [opts.rows]
 * @param {string} [opts.buttonLabel]
 * @param {string} [opts.hint] — leading muted paragraph; pass '' to omit
 * @param {(names: string[]) => void} opts.onSubmit
 * @returns {PasteBulkController}
 */
export function mountPasteBulk(host, opts = {}) {
  const {
    placeholder = 'Alice\nBob\nCharlie',
    rows = 6,
    buttonLabel = 'Add',
    hint = 'Paste names — one per line. Duplicates within the input are skipped.',
    onSubmit,
  } = opts;

  const wrap = document.createElement('div');
  wrap.className = 'paste-bulk';

  if (hint) {
    const hintEl = document.createElement('p');
    hintEl.className = 'muted';
    hintEl.textContent = hint;
    hintEl.style.margin = '0 0 8px';
    wrap.appendChild(hintEl);
  }

  const textarea = document.createElement('textarea');
  textarea.className = 'modal-textarea';
  textarea.rows = rows;
  textarea.placeholder = placeholder;
  textarea.style.width = '100%';
  wrap.appendChild(textarea);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.justifyContent = 'flex-end';
  actions.style.gap = '8px';
  actions.style.marginTop = '8px';

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'desk-button is-ghost';
  submit.textContent = buttonLabel;

  function flush() {
    const lines = textarea.value
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set();
    const dedup = [];
    for (const line of lines) {
      const key = line.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        dedup.push(line);
      }
    }
    if (dedup.length === 0) return;
    if (typeof onSubmit === 'function') onSubmit(dedup);
    textarea.value = '';
  }

  submit.addEventListener('click', flush);
  // Cmd/Ctrl + Enter inside the textarea also submits.
  textarea.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      flush();
    }
  });

  actions.appendChild(submit);
  wrap.appendChild(actions);
  host.appendChild(wrap);

  return {
    setDisabled(disabled) {
      textarea.disabled = !!disabled;
      submit.disabled = !!disabled;
    },
    reset() {
      textarea.value = '';
    },
    focus() {
      textarea.focus();
    },
    destroy() {
      wrap.remove();
    },
  };
}
