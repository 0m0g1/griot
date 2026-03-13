// ─── SlashMenu.js ─────────────────────────────────────────────────────────────
// Slash-command palette. Triggered when '/' is typed at the very start of
// an empty block editable. Shows a searchable list of block types grouped
// by category.  Selecting an item calls onSelect(type).
//
// Usage (inside Editor):
//   const menu = new SlashMenu(editorContainerEl, onSelect);
//   menu.show(anchorEl);   // position near anchorEl
//   menu.hide();
//   menu.destroy();
// ─────────────────────────────────────────────────────────────────────────────

import { getAllTypes, getBlockDef, getTypesByCategory } from '../blocks/BlockSchema.js';

const CATEGORIES = [
  { key: 'text',      label: 'Text'      },
  { key: 'media',     label: 'Media'     },
  { key: 'embed',     label: 'Embed'     },
  { key: 'structure', label: 'Structure' },
];

export class SlashMenu {
  constructor(container, onSelect) {
    this._container = container;
    this._onSelect  = onSelect;
    this._el        = null;
    this._query     = '';
    this._idx       = 0;
    this._items     = [];   // filtered list of type strings
    this._visible   = false;

    this._build();
  }

  // ── Public ────────────────────────────────────────────────────────────────

  /** Show menu anchored below anchorEl. */
  show(anchorEl) {
    this._query = '';
    this._refresh();
    this._visible = true;
    this._el.style.display = 'block';
    this._reposition(anchorEl);
    this._el.querySelector('.griot-slash__search')?.focus();
  }

  /** Filter list to items matching query string (the text after '/'). */
  filter(query) {
    this._query = query;
    this._refresh();
    if (!this._items.length) { this.hide(); return; }
    this._reposition(this._anchorEl);
  }

  hide() {
    this._visible = false;
    if (this._el) this._el.style.display = 'none';
  }

  get visible() { return this._visible; }

  /** Handle keydown while slash menu is open. Returns true if consumed. */
  handleKey(e) {
    if (!this._visible) return false;
    if (e.key === 'ArrowDown')  { e.preventDefault(); this._move(1);  return true; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); this._move(-1); return true; }
    if (e.key === 'Enter')      { e.preventDefault(); this._select(); return true; }
    if (e.key === 'Escape')     { e.preventDefault(); this.hide();    return true; }
    return false;
  }

  destroy() {
    this._el?.remove();
    this._el = null;
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  _build() {
    const el = document.createElement('div');
    el.className = 'griot-slash';
    el.setAttribute('role', 'listbox');
    el.setAttribute('aria-label', 'Block type');

    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'griot-slash__search';
    search.placeholder = 'Search blocks…';
    search.addEventListener('input', () => { this._query = search.value; this._refresh(); });
    search.addEventListener('keydown', e => { this.handleKey(e); });

    const list = document.createElement('div');
    list.className = 'griot-slash__list';

    el.append(search, list);
    document.body.appendChild(el);
    this._el    = el;
    this._list  = list;
    this._search = search;

    // Hide on outside click
    this._onDocClick = (e) => { if (this._visible && !el.contains(e.target)) this.hide(); };
    document.addEventListener('mousedown', this._onDocClick);
  }

  _refresh() {
    const q      = this._query.toLowerCase().trim();
    this._list.innerHTML = '';
    this._items  = [];
    this._idx    = 0;

    const all    = getAllTypes();
    const filtered = q
      ? all.filter(t => {
          const d = getBlockDef(t);
          return d.slashLabel?.toLowerCase().includes(q) || t.includes(q) || d.label.toLowerCase().includes(q);
        })
      : all;

    // Group by category when not searching
    const groups = q
      ? [{ key: 'results', label: 'Results', types: filtered }]
      : CATEGORIES.map(c => ({ ...c, types: filtered.filter(t => getBlockDef(t).category === c.key) })).filter(g => g.types.length);

    for (const group of groups) {
      const hdr = document.createElement('div');
      hdr.className = 'griot-slash__group';
      hdr.textContent = group.label;
      this._list.appendChild(hdr);

      for (const type of group.types) {
        const def = getBlockDef(type);
        const idx = this._items.length;
        this._items.push(type);

        const item = document.createElement('div');
        item.className = 'griot-slash__item';
        item.setAttribute('role', 'option');
        item.dataset.idx = idx;
        item.innerHTML = `<span class="griot-slash__item-icon">${def.icon}</span><span class="griot-slash__item-label">${def.slashLabel ?? def.label}</span>`;

        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this._idx = idx;
          this._select();
        });
        item.addEventListener('mouseover', () => { this._idx = idx; this._highlight(); });

        this._list.appendChild(item);
      }
    }

    this._highlight();
  }

  _highlight() {
    for (const el of this._list.querySelectorAll('.griot-slash__item')) {
      el.classList.toggle('is-active', Number(el.dataset.idx) === this._idx);
    }
    // Scroll into view
    const active = this._list.querySelector('.griot-slash__item.is-active');
    active?.scrollIntoView({ block: 'nearest' });
  }

  _move(dir) {
    this._idx = Math.max(0, Math.min(this._items.length - 1, this._idx + dir));
    this._highlight();
  }

  _select() {
    const type = this._items[this._idx];
    if (type) { this.hide(); this._onSelect(type); }
  }

  _reposition(anchorEl) {
    this._anchorEl = anchorEl;
    if (!anchorEl || !this._el) return;

    requestAnimationFrame(() => {
      const rect  = anchorEl.getBoundingClientRect();
      const menuH = this._el.offsetHeight || 280;
      let top  = rect.bottom + window.scrollY + 4;
      let left = rect.left   + window.scrollX;

      // Flip above if too close to bottom
      if (rect.bottom + menuH + 8 > window.innerHeight) {
        top = rect.top + window.scrollY - menuH - 4;
      }
      // Clamp left
      left = Math.min(left, window.scrollX + window.innerWidth - 280 - 8);
      left = Math.max(left, window.scrollX + 8);

      this._el.style.top  = `${top}px`;
      this._el.style.left = `${left}px`;
    });
  }
}