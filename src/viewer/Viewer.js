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
//   viewer.setHighlight(blockId);          // highlight + scroll to a block
//   viewer.setGalleryLayout(blockId, layout); // switch a gallery's layout
//   viewer.destroy();
// ─────────────────────────────────────────────────────────────────────────────

import { anchorId, scrollToBlock }   from '../core/Block.js';
import { renderBlock }               from '../blocks/BlockRenderer.js';
import { renderGallery }             from '../blocks/GalleryRenderer.js';

export class Viewer {
  constructor(container, options = {}) {
    this._container  = container;
    this._options    = options;
    this._doc        = options.doc ?? null;
    this._books      = options.books ?? [];
    this._highlighted = options.highlightBlockId ?? null;
    this._hlTimer    = null;

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

  /**
   * Switch the layout of a gallery block without re-rendering the whole doc.
   * Finds the rendered gallery element by blockId, swaps it with a freshly
   * rendered gallery using the new layout, and updates block.meta in-place
   * so any subsequent full re-render preserves the user's choice.
   *
   * @param {string} blockId
   * @param {'grid'|'masonry'|'carousel'|'strip'} layout
   */
  setGalleryLayout(blockId, layout) {
    if (!this._doc) return;

    // Find the block in the document
    const block = this._doc.blocks.find(b => b.id === blockId);
    if (!block || block.type !== 'gallery') return;

    // Update meta so a future setDoc() call preserves the layout
    block.meta = { ...block.meta, layout };

    // Find the rendered DOM element
    const existing = document.getElementById(anchorId(blockId));
    if (!existing) return;

    // Render a fresh gallery with the new layout
    const fresh = renderGallery(block.meta.items ?? [], layout);
    fresh.classList.add('griot-block');
    fresh.id                = anchorId(blockId);
    fresh.dataset.blockId   = blockId;
    fresh.dataset.blockType = 'gallery';

    // Preserve highlight state
    if (existing.classList.contains('griot-block--highlight')) {
      fresh.classList.add('griot-block--highlight');
    }

    existing.replaceWith(fresh);
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