// ─── DropHandler.js ───────────────────────────────────────────────────────────
// Drag-and-drop file handler for the Griot editor.
//
// Attaches to the editor container and intercepts file drops. Shows a visual
// insertion indicator between blocks while dragging, then uploads the files
// and inserts the appropriate block type(s) at the drop position.
//
// Drop rules:
//   Multiple images          → one gallery block
//   Single image             → image block
//   Video file / URL         → video block
//   Audio file / URL         → audio block
//   Drop onto image block    → convert to gallery (or append to existing gallery)
//   Drop onto gallery block  → append images to that gallery
//
// Usage:
//   const handler = new DropHandler(editorContainerEl, {
//     getDoc()               // returns the current document
//     onCommit(doc)          // called with the updated document
//     onUpload(file)         // async fn → { url, src?, alt_text?, caption? }
//                            // falls back to uploadUrl if not provided
//     uploadUrl              // POST endpoint if onUpload is not provided
//                            // default: '/api/upload/insight-media'
//   });
//   handler.destroy();
// ─────────────────────────────────────────────────────────────────────────────

import { createBlock }                               from '../core/Block.js';
import { insertBlockAfter, insertBlockBefore,
         updateBlock, getBlock }                     from '../core/Document.js';

const UPLOAD_URL_DEFAULT = '/api/upload/insight-media';

// Accepted MIME type groups
const MIME = {
  image: /^image\//,
  video: /^video\//,
  audio: /^audio\//,
};

export class DropHandler {
  /**
   * @param {HTMLElement} container  — the .griot-editor element
   * @param {{
   *   getDoc: () => object,
   *   onCommit: (doc: object) => void,
   *   onUpload?: (file: File) => Promise<object>,
   *   uploadUrl?: string,
   * }} options
   */
  constructor(container, options = {}) {
    this._container  = container;
    this._opts       = options;
    this._indicator  = null;   // the visual drop-line element
    this._targetInfo = null;   // { blockId, position: 'before'|'after' } | { blockId, position: 'onto' }
    this._dragDepth  = 0;      // tracks nested dragenter/dragleave pairs

    this._onDragEnter = this._onDragEnter.bind(this);
    this._onDragOver  = this._onDragOver.bind(this);
    this._onDragLeave = this._onDragLeave.bind(this);
    this._onDrop      = this._onDrop.bind(this);

    container.addEventListener('dragenter', this._onDragEnter);
    container.addEventListener('dragover',  this._onDragOver);
    container.addEventListener('dragleave', this._onDragLeave);
    container.addEventListener('drop',      this._onDrop);

    _injectStyles();
  }

  destroy() {
    this._container.removeEventListener('dragenter', this._onDragEnter);
    this._container.removeEventListener('dragover',  this._onDragOver);
    this._container.removeEventListener('dragleave', this._onDragLeave);
    this._container.removeEventListener('drop',      this._onDrop);
    this._removeIndicator();
  }

  // ── Drag enter / leave / over ─────────────────────────────────────────────

  _onDragEnter(e) {
    if (!_hasFiles(e)) return;
    e.preventDefault();
    this._dragDepth++;
    if (this._dragDepth === 1) this._buildIndicator();
  }

  _onDragOver(e) {
    if (!_hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    this._updateIndicator(e.clientY);
  }

  _onDragLeave(e) {
    if (!_hasFiles(e)) return;
    this._dragDepth--;
    if (this._dragDepth <= 0) {
      this._dragDepth = 0;
      this._removeIndicator();
    }
  }

  // ── Drop ──────────────────────────────────────────────────────────────────

  async _onDrop(e) {
    e.preventDefault();
    this._dragDepth = 0;
    this._removeIndicator();

    const files = _extractFiles(e);
    if (!files.length) return;

    // Partition by media type; ignore unsupported types silently
    const images = files.filter(f => MIME.image.test(f.type));
    const videos = files.filter(f => MIME.video.test(f.type));
    const audios = files.filter(f => MIME.audio.test(f.type));

    // Upload all files in parallel (images as a batch, av one at a time)
    const [imageResults, videoResults, audioResults] = await Promise.all([
      images.length ? this._uploadBatch(images) : Promise.resolve([]),
      videos.length ? this._uploadBatch(videos) : Promise.resolve([]),
      audios.length ? this._uploadBatch(audios) : Promise.resolve([]),
    ]);

    const target = this._targetInfo;
    let doc      = this._opts.getDoc();

    // ── Drop onto an existing image or gallery block ────────────────────────
    if (target?.position === 'onto' && imageResults.length) {
      const block = getBlock(doc, target.blockId);
      if (block?.type === 'image' && block.meta?.src) {
        // Promote the existing image + new images into a gallery
        const existingItem = {
          src:     block.meta.src,
          url:     block.meta.src,
          alt:     block.meta.alt     ?? '',
          caption: block.meta.caption ?? '',
        };
        const newItems = [existingItem, ...imageResults];
        doc = updateBlock(doc, target.blockId, {
          type: 'gallery',
          meta: { items: newItems, layout: 'grid' },
        });
        this._opts.onCommit(doc);
        return;
      }
      if (block?.type === 'gallery') {
        const existing = Array.isArray(block.meta?.items) ? block.meta.items : [];
        doc = updateBlock(doc, target.blockId, {
          meta: { items: [...existing, ...imageResults] },
        });
        this._opts.onCommit(doc);
        return;
      }
    }

    // ── Insert new blocks at drop position ─────────────────────────────────
    // Build a list of blocks to insert in order: images first, then video, then audio
    const newBlocks = [];

    if (imageResults.length === 1) {
      newBlocks.push(createBlock('image', {
        meta: {
          src:     imageResults[0].url ?? imageResults[0].src ?? '',
          alt:     imageResults[0].alt_text ?? '',
          caption: imageResults[0].caption  ?? '',
          width:   'full',
        },
      }));
    } else if (imageResults.length > 1) {
      newBlocks.push(createBlock('gallery', {
        meta: {
          items:  imageResults.map(r => ({
            src:     r.url ?? r.src ?? '',
            url:     r.url ?? r.src ?? '',
            alt:     r.alt_text ?? '',
            caption: r.caption  ?? '',
          })),
          layout: 'grid',
        },
      }));
    }

    for (const r of videoResults) {
      newBlocks.push(createBlock('video', {
        meta: { src: r.url ?? r.src ?? '', caption: r.caption ?? '' },
      }));
    }

    for (const r of audioResults) {
      newBlocks.push(createBlock('audio', {
        meta: { src: r.url ?? r.src ?? '', caption: r.caption ?? '' },
      }));
    }

    if (!newBlocks.length) return;

    // Insert at target position
    if (!target) {
      // No target resolved — append after last block
      const lastId = doc.blocks[doc.blocks.length - 1]?.id;
      for (const nb of newBlocks) {
        doc = lastId ? insertBlockAfter(doc, lastId, nb) : doc;
      }
    } else if (target.position === 'before') {
      // Insert before target block (reversed so order is preserved)
      for (const nb of [...newBlocks].reverse()) {
        doc = insertBlockBefore(doc, target.blockId, nb);
      }
    } else {
      // 'after' or 'onto' fallback
      let anchorId = target.blockId;
      for (const nb of newBlocks) {
        doc = insertBlockAfter(doc, anchorId, nb);
        anchorId = nb.id;
      }
    }

    this._opts.onCommit(doc);
  }

  // ── Upload helpers ────────────────────────────────────────────────────────

  async _uploadBatch(files) {
    if (!files.length) return [];

    // Use provided onUpload if available
    if (typeof this._opts.onUpload === 'function') {
      const results = await Promise.allSettled(files.map(f => this._opts.onUpload(f)));
      return results
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);
    }

    // Otherwise POST to uploadUrl
    const url = this._opts.uploadUrl ?? UPLOAD_URL_DEFAULT;
    const fd  = new FormData();
    files.forEach(f => fd.append('file', f));

    try {
      const res  = await fetch(url, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Upload failed');
      return (data.files ?? []).filter(f => !f.error);
    } catch (err) {
      console.error('[DropHandler] upload failed:', err);
      return [];
    }
  }

  // ── Indicator DOM ─────────────────────────────────────────────────────────

  _buildIndicator() {
    if (this._indicator) return;
    const el = document.createElement('div');
    el.className = 'griot-drop-indicator';
    this._container.appendChild(el);
    this._indicator = el;
  }

  _removeIndicator() {
    this._indicator?.remove();
    this._indicator  = null;
    this._targetInfo = null;

    // Remove 'onto' highlight from any block
    this._container.querySelectorAll('.griot-drop-onto')
      .forEach(el => el.classList.remove('griot-drop-onto'));
  }

  /**
   * Given the current mouse Y coordinate, find the nearest block boundary
   * and position the visual drop indicator there.
   */
  _updateIndicator(clientY) {
    const blockEls = [
      ...this._container.querySelectorAll('[data-block-id]'),
    ];
    if (!blockEls.length) return;

    // Remove previous 'onto' highlight
    blockEls.forEach(el => el.classList.remove('griot-drop-onto'));

    let best       = null; // { el, position, dist }
    const scrollTop = this._container.scrollTop ?? 0;

    for (const el of blockEls) {
      const rect     = el.getBoundingClientRect();
      const midY     = rect.top + rect.height / 2;
      const isImage  = el.dataset.blockType === 'image' || el.dataset.blockType === 'gallery';

      // If the cursor is squarely over an image/gallery block (within its rect)
      // AND we're dragging images, offer an 'onto' drop
      if (isImage && clientY >= rect.top && clientY <= rect.bottom) {
        // Only count as 'onto' if dragging only images (not mixed with video/audio)
        best = { el, position: 'onto', dist: 0 };
        break;
      }

      const distToTop = Math.abs(clientY - rect.top);
      const distToBot = Math.abs(clientY - rect.bottom);

      if (!best || distToTop < best.dist) best = { el, position: 'before', dist: distToTop };
      if (!best || distToBot < best.dist) best = { el, position: 'after',  dist: distToBot };
    }

    if (!best) return;

    this._targetInfo = { blockId: best.el.dataset.blockId, position: best.position };

    if (best.position === 'onto') {
      // Show highlight ring on the target block instead of a line
      best.el.classList.add('griot-drop-onto');
      if (this._indicator) this._indicator.style.display = 'none';
      return;
    }

    if (this._indicator) this._indicator.style.display = '';

    // Position the indicator line
    const rect        = best.el.getBoundingClientRect();
    const containerR  = this._container.getBoundingClientRect();
    const y = (best.position === 'before' ? rect.top : rect.bottom)
              - containerR.top + this._container.scrollTop;

    if (this._indicator) {
      this._indicator.style.top  = `${y}px`;
      this._indicator.style.left = `${rect.left  - containerR.left}px`;
      this._indicator.style.width = `${rect.width}px`;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** True if the drag event carries files (not just text / DOM nodes). */
function _hasFiles(e) {
  const dt = e.dataTransfer;
  if (!dt) return false;
  // During dragover types is available; during drop files is available
  return dt.types && (dt.types.includes('Files') || dt.types.includes('application/x-moz-file'));
}

/** Extract File objects from a drop event, ignoring directories. */
function _extractFiles(e) {
  const items = e.dataTransfer?.items;
  if (items) {
    return [...items]
      .filter(i => i.kind === 'file')
      .map(i => i.getAsFile())
      .filter(Boolean)
      .filter(f => MIME.image.test(f.type) || MIME.video.test(f.type) || MIME.audio.test(f.type));
  }
  return [...(e.dataTransfer?.files ?? [])]
    .filter(f => MIME.image.test(f.type) || MIME.video.test(f.type) || MIME.audio.test(f.type));
}

// ── Style injection ───────────────────────────────────────────────────────────

let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected || typeof document === 'undefined') return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.id = 'griot-drophandler-styles';
  s.textContent = `
/* Drop insertion line */
.griot-drop-indicator {
  position: absolute;
  height: 2px;
  background: #6366f1;
  border-radius: 2px;
  pointer-events: none;
  z-index: 100;
  transition: top 0.08s, left 0.08s, width 0.08s;
}
.griot-drop-indicator::before,
.griot-drop-indicator::after {
  content: '';
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #6366f1;
}
.griot-drop-indicator::before { left:  -4px; }
.griot-drop-indicator::after  { right: -4px; }

/* Highlight ring when dropping onto an existing image/gallery block */
.griot-drop-onto {
  outline: 2px solid #6366f1 !important;
  outline-offset: 2px;
  border-radius: 8px;
}

/* Keep the editor container positioned so the absolute indicator works */
.griot-editor {
  position: relative;
}
  `;
  document.head.appendChild(s);
}