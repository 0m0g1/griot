// ─── Viewer.js ────────────────────────────────────────────────────────────────
// Read-only renderer. Mounts into a container div (never an iframe).
// Plain div keeps event callbacks working without postMessage.
//
// Usage:
//   const viewer = new Viewer(containerEl, {
//     doc,
//     books,
//     onEventClick(eventId) {},
//     onCiteClick(blockId) {},
//     highlightBlockId: null,
//   });
//   viewer.setHighlight(blockId);  // highlight + scroll to a block
//   viewer.destroy();
// ─────────────────────────────────────────────────────────────────────────────

import { anchorId, scrollToBlock }   from '../core/Block.js';
import { renderBlock }               from '../blocks/BlockRenderer.js';

export class Viewer {
  constructor(container, options = {}) {
    this._container = container;
    this._options   = options;
    this._doc       = options.doc ?? null;
    this._books     = options.books ?? [];
    this._highlighted = options.highlightBlockId ?? null;
    this._hlTimer   = null;

    container.classList.add('griot-viewer');
    if (this._doc) this._render();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setDoc(doc) {
    this._doc = doc;
    this._render();
  }

  setBooks(books) {
    this._books = books;
    this._render();
  }

  /** Scroll to block and briefly highlight it */
  setHighlight(blockId, { scroll = true, behavior = 'smooth' } = {}) {
    // Remove old highlight
    clearTimeout(this._hlTimer);
    if (this._highlighted) {
      document.getElementById(anchorId(this._highlighted))
        ?.classList.remove('griot-block--highlight');
    }

    this._highlighted = blockId;
    const el = document.getElementById(anchorId(blockId));
    if (!el) return;

    el.classList.add('griot-block--highlight');
    if (scroll) scrollToBlock(blockId, behavior);

    this._hlTimer = setTimeout(() => {
      el.classList.remove('griot-block--highlight');
      this._highlighted = null;
    }, 2200);
  }

  destroy() {
    clearTimeout(this._hlTimer);
    this._container.innerHTML = '';
    this._container.classList.remove('griot-viewer');
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  _render() {
    this._container.innerHTML = '';
    if (!this._doc) return;

    const opts = {
      books:        this._books,
      onEventClick: this._options.onEventClick,
      onCiteClick:  this._options.onCiteClick,
    };

    for (const block of this._doc.blocks) {
      const el = renderBlock(block, opts);
      if (!el) continue;
      if (block.id === this._highlighted) el.classList.add('griot-block--highlight');
      this._container.appendChild(el);
    }
  }
}
