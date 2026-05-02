// =============================================================
// shared/components/class-card-grid.js
//
// Render a grid of class cards keyed by canonical class id. Auto-refreshes
// when the canonical class list or any roster changes (counts update too).
// Each card surfaces:
//   - class name
//   - student count (configurable)
//   - source badge ('From Seating Chart') for non-canonical entries
//   - optional Delete action (canonical-source classes only)
// Clicking the card calls onSelect(classId).
//
//   const ctl = mountClassCardGrid(host, {
//     onSelect: (id) => goToClass(id),
//     onDelete: (id, name) => confirmAndDelete(id, name),
//   });
//   ctl.refresh();
//   ctl.destroy();
// =============================================================

import * as bridge from '../roster-bridge.js';

/**
 * @typedef {object} ClassCardGridController
 * @property {() => void} refresh
 * @property {() => void} destroy
 */

/**
 * @param {HTMLElement} host — element that will receive a `.class-grid` child
 * @param {object} opts
 * @param {(classId: string) => void} [opts.onSelect]
 * @param {(classId: string, name: string) => void} [opts.onDelete]
 * @param {boolean} [opts.showCount=true]
 * @param {boolean} [opts.showSource=true]
 * @param {string} [opts.emptyMessage='No classes yet.']
 * @returns {ClassCardGridController}
 */
export function mountClassCardGrid(host, opts = {}) {
  const {
    onSelect,
    onDelete,
    showCount = true,
    showSource = true,
    emptyMessage = 'No classes yet.',
  } = opts;

  const grid = document.createElement('div');
  grid.className = 'class-grid';
  host.appendChild(grid);

  function render() {
    const classes = bridge.getClasses().slice();
    classes.sort((a, b) => a.name.localeCompare(b.name));

    grid.innerHTML = '';

    if (classes.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = emptyMessage;
      grid.appendChild(empty);
      return;
    }

    for (const c of classes) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'class-card';
      card.dataset.classId = c.id;

      const nameEl = document.createElement('div');
      nameEl.className = 'class-card-name';
      nameEl.textContent = c.name;
      card.appendChild(nameEl);

      if (showCount || (showSource && c.source === 'seating-chart')) {
        const meta = document.createElement('div');
        meta.className = 'class-card-meta';
        if (showCount) {
          const count = bridge.getRoster(c.id).length;
          const span = document.createElement('span');
          span.textContent = `${count} student${count === 1 ? '' : 's'}`;
          meta.appendChild(span);
        }
        if (showSource && c.source === 'seating-chart') {
          const tag = document.createElement('span');
          tag.className = 'tag';
          tag.textContent = 'From Seating Chart';
          meta.appendChild(tag);
        }
        card.appendChild(meta);
      }

      if (onDelete && c.source === 'canonical') {
        const actions = document.createElement('div');
        actions.className = 'class-card-actions';
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'is-danger';
        del.textContent = 'Delete';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          onDelete(c.id, c.name);
        });
        actions.appendChild(del);
        card.appendChild(actions);
      }

      card.addEventListener('click', () => {
        if (onSelect) onSelect(c.id);
      });

      grid.appendChild(card);
    }
  }

  render();

  const offClasses = bridge.onClassesChange(render);
  const offRoster = bridge.onRosterChange(null, render);

  return {
    refresh: render,
    destroy() {
      offClasses();
      offRoster();
      grid.remove();
    },
  };
}
