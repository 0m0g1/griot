// ─── FormatToolbar.js ─────────────────────────────────────────────────────────
// Floating toolbar that appears above a text selection inside the editor.
// Provides one-click inline formatting (bold, italic, underline, etc.) and
// link / color-mark insertion.
//
// Usage:
//   const tb = new FormatToolbar(editorContainerEl, {
//     onWrap(syntax)  {},  // wrap selection with syntax chars e.g. '**'
//     onLink()        {},  // open link insertion prompt
//     onColor()       {},  // open color-mark prompt
//   });
//   tb.destroy();
// ─────────────────────────────────────────────────────────────────────────────

const FORMATS = [
  { key: 'bold',      label: 'B',  title: 'Bold (Ctrl+B)',      syntax: '**'  },
  { key: 'italic',    label: 'I',  title: 'Italic (Ctrl+I)',    syntax: '*'   },
  { key: 'underline', label: 'U',  title: 'Underline (Ctrl+U)', syntax: '__'  },
  { key: 'strike',    label: 'S̶',  title: 'Strikethrough',      syntax: '~~'  },
  { key: 'code',      label: '`',  title: 'Inline Code',        syntax: '`'   },
  { key: 'highlight', label: '▐',  title: 'Highlight',          syntax: '=='  },
  { key: 'link',      label: '🔗', title: 'Link',               action: 'link'  },
  { key: 'color',     label: '🎨', title: 'Color',              action: 'color' },
];

export class FormatToolbar {
  constructor(container, callbacks = {}) {
    this._container = container;
    this._cb        = callbacks;
    this._el        = null;
    this._visible   = false;

    this._build();
    this._attach();
  }

  // ── Build DOM ────────────────────────────────────────────────────────────────

  _build() {
    const el = document.createElement('div');
    el.className  = 'griot-format-toolbar';
    el.setAttribute('role', 'toolbar');
    el.setAttribute('aria-label', 'Inline formatting');

    for (const fmt of FORMATS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `griot-format-toolbar__btn griot-ftb--${fmt.key}`;
      btn.title     = fmt.title;
      btn.textContent = fmt.label;

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); // preserve selection before acting
        if (fmt.syntax)         this._cb.onWrap?.(fmt.syntax);
        else if (fmt.action === 'link')  this._cb.onLink?.();
        else if (fmt.action === 'color') this._cb.onColor?.();
        this._hide();
      });

      el.appendChild(btn);
    }

    document.body.appendChild(el);
    this._el = el;
  }

  // ── Event listeners ──────────────────────────────────────────────────────────

  _attach() {
    // Show after mouse release inside editor
    this._onMouseUp = () => setTimeout(() => this._checkAndShow(), 20);
    this._container.addEventListener('mouseup', this._onMouseUp);

    // Show after Shift+arrow / Ctrl+A keyboard selection
    this._onKeyUp = (e) => {
      if (e.shiftKey || ((e.ctrlKey || e.metaKey) && e.key === 'a')) {
        setTimeout(() => this._checkAndShow(), 20);
      }
    };
    this._container.addEventListener('keyup', this._onKeyUp);

    // Hide when clicking anywhere outside the toolbar
    this._onDocDown = (e) => {
      if (this._visible && !this._el.contains(e.target)) this._hide();
    };
    document.addEventListener('mousedown', this._onDocDown);
  }

  // ── Visibility ───────────────────────────────────────────────────────────────

  _checkAndShow() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { this._hide(); return; }

    const range = sel.getRangeAt(0);
    if (!this._container.contains(range.commonAncestorContainer)) { this._hide(); return; }
    if (!range.toString().trim()) { this._hide(); return; }

    this._show(range.getBoundingClientRect());
  }

  _show(rect) {
    const el = this._el;
    el.style.display = 'flex';

    requestAnimationFrame(() => {
      const tbW = el.offsetWidth  || 280;
      const tbH = el.offsetHeight || 36;

      let left = rect.left + rect.width / 2 - tbW / 2 + window.scrollX;
      let top  = rect.top  - tbH - 10 + window.scrollY;

      // Clamp horizontally
      left = Math.max(8 + window.scrollX, Math.min(left, window.scrollX + window.innerWidth - tbW - 8));
      // Flip below if too close to top
      if (top < window.scrollY + 8) top = rect.bottom + 8 + window.scrollY;

      el.style.left = `${left}px`;
      el.style.top  = `${top}px`;
      this._visible = true;
    });
  }

  _hide() {
    if (this._el) this._el.style.display = 'none';
    this._visible = false;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  destroy() {
    this._container.removeEventListener('mouseup', this._onMouseUp);
    this._container.removeEventListener('keyup',   this._onKeyUp);
    document.removeEventListener('mousedown', this._onDocDown);
    this._el?.remove();
    this._el = null;
  }
}