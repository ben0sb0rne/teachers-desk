// =============================================================
// shared/settings.js — unified suite settings dialog.
//
// Every tool exposes the same global options (theme, sound, data) via the
// same dialog. Tools can register a tool-specific section that renders
// alongside the global ones.
//
// Usage in a vanilla tool:
//   import { mountSettingsButton } from '../shared/settings.js';
//   mountSettingsButton();        // adds a floating gear + S keyboard shortcut
//
// Usage from a React tool that wants imperative access:
//   import { openSettings } from '../shared/settings.js';
//   <button onClick={openSettings}>…</button>
//
// To inject tool-specific settings into the dialog:
//   import { registerToolSettings } from '../shared/settings.js';
//   registerToolSettings('bingo', 'Math Bingo', (host) => {
//     host.innerHTML = '<div class="suite-settings-row">…</div>';
//     // optionally return a cleanup function
//   });
// =============================================================

import * as storage from './storage.js';

// Feather-style gear glyph; used for the floating button + (optionally) topstrip slots.
const ICON_GEAR = `<svg class="settings-button-icon" viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
</svg>`;

const TOOL_SECTIONS = new Map(); // toolName -> { label, render }

/**
 * Register a tool-specific section to render in the dialog. The render fn
 * receives a host element it can populate. It may return a cleanup function
 * that's invoked when the dialog closes.
 */
export function registerToolSettings(toolName, label, render) {
  TOOL_SECTIONS.set(toolName, { label, render });
}

let _overlay = null;
let _cleanups = [];

export function isOpen() {
  return !!_overlay;
}

export function openSettings() {
  if (_overlay) return;
  _overlay = buildOverlay();
  document.body.appendChild(_overlay);
  document.addEventListener('keydown', _onEsc);
  // Focus the close button so Esc and Tab behave intuitively.
  setTimeout(() => _overlay?.querySelector('.suite-panel-close')?.focus(), 0);
}

export function closeSettings() {
  if (!_overlay) return;
  document.removeEventListener('keydown', _onEsc);
  for (const fn of _cleanups) {
    try { fn(); } catch (e) { /* swallow — tool cleanup shouldn't break close */ }
  }
  _cleanups = [];
  _overlay.remove();
  _overlay = null;
}

function _onEsc(e) {
  if (e.key === 'Escape') closeSettings();
}

function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'suite-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSettings();
  });

  const panel = document.createElement('div');
  panel.className = 'suite-panel';
  panel.appendChild(buildHeader());

  const body = document.createElement('div');
  body.className = 'suite-panel-body';
  body.appendChild(renderAppearance());
  body.appendChild(renderSound());
  body.appendChild(renderData());

  // Tool-specific sections last.
  for (const [, { label, render }] of TOOL_SECTIONS) {
    const section = document.createElement('div');
    section.className = 'suite-settings-section';
    const heading = document.createElement('h3');
    heading.textContent = label;
    section.appendChild(heading);
    const host = document.createElement('div');
    section.appendChild(host);
    body.appendChild(section);
    try {
      const cleanup = render(host);
      if (typeof cleanup === 'function') _cleanups.push(cleanup);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[teachersdesk] tool settings render failed:', e);
    }
  }

  panel.appendChild(body);
  overlay.appendChild(panel);
  return overlay;
}

function buildHeader() {
  const header = document.createElement('div');
  header.className = 'suite-panel-header';
  const h2 = document.createElement('h2');
  h2.textContent = 'Settings';
  const close = document.createElement('button');
  close.className = 'suite-panel-close';
  close.setAttribute('aria-label', 'Close settings');
  close.textContent = '×';
  close.addEventListener('click', closeSettings);
  header.appendChild(h2);
  header.appendChild(close);
  return header;
}

// -------------------------------------------------------------
// Global sections — Appearance, Sound, Data
// -------------------------------------------------------------

function renderAppearance() {
  const section = section_('Appearance');
  const row = row_('Theme');

  const seg = document.createElement('div');
  seg.className = 'suite-seg';
  const current = storage.getTheme() || 'auto';
  for (const value of ['auto', 'light', 'dark']) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.theme = value;
    btn.textContent = value;
    if (current === value) btn.classList.add('is-active');
    btn.addEventListener('click', () => {
      storage.setTheme(value);
      seg.querySelectorAll('button').forEach((b) =>
        b.classList.toggle('is-active', b.dataset.theme === value),
      );
    });
    seg.appendChild(btn);
  }
  row.appendChild(seg);
  section.appendChild(row);
  return section;
}

function renderSound() {
  const section = section_('Sound');

  // Mute checkbox
  const muteId = 'suite-settings-mute';
  const muteRow = row_('Mute all sounds', muteId);
  const muteInput = document.createElement('input');
  muteInput.type = 'checkbox';
  muteInput.id = muteId;
  muteInput.checked = !!storage.getPreference('soundMuted', false);
  muteInput.addEventListener('change', () => {
    storage.setPreference('soundMuted', muteInput.checked);
  });
  muteRow.appendChild(muteInput);
  section.appendChild(muteRow);

  // Volume slider
  const volId = 'suite-settings-volume';
  const volRow = row_('Volume', volId);
  const volInput = document.createElement('input');
  volInput.type = 'range';
  volInput.id = volId;
  volInput.min = '0';
  volInput.max = '1';
  volInput.step = '0.05';
  volInput.value = String(storage.getPreference('soundVolume', 0.6));
  volInput.style.width = '180px';
  volInput.addEventListener('input', () => {
    storage.setPreference('soundVolume', parseFloat(volInput.value));
  });
  volRow.appendChild(volInput);
  section.appendChild(volRow);

  return section;
}

function renderData() {
  const section = section_('Data');
  const row = document.createElement('div');
  row.className = 'suite-settings-row';
  row.style.justifyContent = 'flex-start';
  row.style.gap = 'var(--space-2)';

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'desk-button is-ghost';
  exportBtn.textContent = 'Export classroom';
  exportBtn.addEventListener('click', () => storage.downloadExport());
  row.appendChild(exportBtn);

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'desk-button is-ghost';
  importBtn.textContent = 'Import…';
  importBtn.addEventListener('click', triggerImport);
  row.appendChild(importBtn);

  section.appendChild(row);
  return section;
}

function triggerImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.display = 'none';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const replace = confirm(
        `Import "${file.name}"?\n\nOK = Replace all current data.\nCancel = Merge with current data.`,
      );
      storage.importClassroom(json, replace ? 'replace' : 'merge');
      // Reload so every tool re-hydrates from the new state.
      location.reload();
    } catch (err) {
      alert(`Import failed: ${err && err.message ? err.message : err}`);
    }
  });
  document.body.appendChild(input);
  input.click();
  setTimeout(() => input.remove(), 0);
}

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------

function section_(headingText) {
  const section = document.createElement('div');
  section.className = 'suite-settings-section';
  const h3 = document.createElement('h3');
  h3.textContent = headingText;
  section.appendChild(h3);
  return section;
}

function row_(labelText, htmlFor) {
  const row = document.createElement('div');
  row.className = 'suite-settings-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  if (htmlFor) label.setAttribute('for', htmlFor);
  row.appendChild(label);
  return row;
}

// -------------------------------------------------------------
// Mount: floating gear button + 'S' keyboard shortcut
// -------------------------------------------------------------

/**
 * Mount the floating gear button and 'S' keyboard shortcut. If a button
 * with class `settings-button` already exists in the document (e.g. a tool
 * placed one in its topstrip), only the click handler is wired and no new
 * button is created.
 *
 * Pass `{ shortcut: false }` to skip the keyboard binding (useful in tools
 * that already use 'S' for something else).
 */
export function mountSettingsButton(options = {}) {
  const { shortcut = true } = options;

  let btn = document.querySelector('.settings-button');
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'settings-button';
    btn.setAttribute('aria-label', 'Settings');
    btn.title = 'Settings (S)';
    btn.innerHTML = ICON_GEAR;
    document.body.appendChild(btn);
  }
  btn.addEventListener('click', openSettings);

  if (shortcut) {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 's' && e.key !== 'S') return;
      const t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (t && t.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isOpen()) return; // S inside the dialog shouldn't re-open
      e.preventDefault();
      openSettings();
    });
  }
}
