// =============================================================
// shared/problem-sets.js — the suite's problem-set machinery.
//
// First slice of the cross-tool problem-set store (full brief still
// pending — see CLAUDE.md): the pure pieces both Math Bingo and
// Around the World need. CSV parsing, a parametrized row validator,
// set fetching, and the KaTeX render cache. No tool state in here,
// ever; per-tool wiring (bingo's B/I/N/G/O columns, AtW's flashcard
// pool) stays in each tool.
//
// KaTeX: consumers load the pinned CDN build (0.16.11) themselves;
// everything here degrades to escaped plain text when `katex` is
// absent.
// =============================================================

/* ── CSV ────────────────────────────────────────────────────────
   Handles quoted fields (RFC-4180 "" escaping), CRLF/CR/LF, field
   trimming, and Excel's UTF-8 BOM (without stripping it, the first
   header parses as "﻿column" and validation reports a spurious
   missing-header error). */
export function parseCSVText(text) {
  const rows = [];
  const raw = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let i = 0;
  while (i <= raw.length) {
    const row = [];
    while (true) {
      let field = '';
      if (i < raw.length && raw[i] === '"') {
        i++; // skip opening quote
        while (i < raw.length) {
          if (raw[i] === '"' && raw[i + 1] === '"') { field += '"'; i += 2; }
          else if (raw[i] === '"') { i++; break; }
          else { field += raw[i++]; }
        }
        // skip to comma or newline
        while (i < raw.length && raw[i] !== ',' && raw[i] !== '\n') i++;
      } else {
        while (i < raw.length && raw[i] !== ',' && raw[i] !== '\n') {
          field += raw[i++];
        }
      }
      row.push(field.trim());
      if (i >= raw.length || raw[i] === '\n') { i++; break; }
      i++; // skip comma
    }
    if (row.length === 1 && row[0] === '') {
      if (i > raw.length) break;
      continue;
    }
    rows.push(row);
    if (i > raw.length) break;
  }
  return rows;
}

/**
 * Parse + validate a problem-set CSV into row objects.
 * Header names are matched case-insensitively; `required` names must
 * all be present. Rows shorter than the header are padded with ''.
 *
 * @param {string} csvText
 * @param {{ required?: string[] }} [opts] default ['problem', 'answer']
 * @returns {{ rows: Array<Record<string, string>>, errors: string[] }}
 */
export function loadProblemRows(csvText, opts = {}) {
  const required = (opts.required ?? ['problem', 'answer']).map((h) => h.toLowerCase());
  const errors = [];
  const parsed = parseCSVText(csvText);
  if (parsed.length === 0) return { rows: [], errors: ['Empty file.'] };

  const header = parsed[0].map((h) => h.toLowerCase());
  for (const req of required) {
    if (!header.includes(req)) errors.push(`Missing required header: "${req}"`);
  }
  if (errors.length) return { rows: [], errors };

  const rows = [];
  for (let r = 1; r < parsed.length; r++) {
    const cells = parsed[r];
    if (cells.every((c) => c === '')) continue;
    const row = {};
    header.forEach((h, c) => { row[h] = cells[c] ?? ''; });
    const missing = required.filter((req) => !row[req]);
    if (missing.length) {
      errors.push(`Row ${r + 1}: missing ${missing.join(', ')}`);
      continue;
    }
    rows.push(row);
  }
  if (rows.length === 0) errors.push('No usable rows.');
  return { rows, errors };
}

/** Fetch a set's CSV text. Rejects with a friendly message on the
 *  file:// protocol (tools need HTTP for local CSVs — see CLAUDE.md). */
export async function fetchSetText(path) {
  if (typeof location !== 'undefined' && location.protocol === 'file:') {
    throw new Error('Problem sets need a local server (file:// cannot fetch). See "Running locally" in the README.');
  }
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.text();
}

/* ── KaTeX render cache ─────────────────────────────────────────
   In-memory HTML cache keyed by the raw LaTeX string, so hot paths
   (bingo's Next click, AtW's card flip) never block on
   katex.renderToString — warm it during a view transition. A null
   value means KaTeX threw; renderers fall back to plain text. */
const mathHtmlCache = new Map();

export function clearMathCache() { mathHtmlCache.clear(); }

/** Cached KaTeX HTML for a string, or null if KaTeX is absent/threw. */
export function mathHtmlOrNull(text) {
  if (typeof katex === 'undefined') return null;
  if (mathHtmlCache.has(text)) return mathHtmlCache.get(text);
  let html = null;
  try { html = katex.renderToString(text, { throwOnError: false, displayMode: false }); }
  catch (e) { void e; html = null; }
  mathHtmlCache.set(text, html);
  return html;
}

export function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** HTML for a problem/answer string: KaTeX when it contains a `\`,
 *  escaped plain text otherwise. Always safe to innerHTML. */
export function renderMathHtml(text) {
  const s = String(text ?? '');
  if (s.includes('\\')) {
    const html = mathHtmlOrNull(s);
    if (html) return html;
  }
  return escHtml(s);
}

/** Write a problem/answer string into an element (KaTeX-aware). */
export function renderMathInto(el, text) {
  const s = String(text ?? '');
  if (s.includes('\\')) {
    const html = mathHtmlOrNull(s);
    if (html) { el.innerHTML = html; return; }
  }
  el.textContent = s;
}

/** Pre-render a batch of LaTeX strings into the cache. */
export function warmMath(strings) {
  if (typeof katex === 'undefined') return;
  for (const s of strings) {
    if (s && s.includes('\\') && !mathHtmlCache.has(s)) mathHtmlOrNull(s);
  }
}
