// ─── Editor.js ────────────────────────────────────────────────────────────────
// The block editor. Mounts into a container element and manages the full
// editing lifecycle: rendering, keyboard, focus, undo/redo.
//
// Usage:
//   const editor = new Editor(containerEl, {
//     doc,
//     books,
//     onChange(doc) {},          // called after every change (debounced for typing)
//     onEventClick(eventId) {},
//     onCiteClick(blockId) {},
//     onRequestBookPicker(blockId, cb) {},  // open your SourcePicker UI
//   });
//   editor.destroy();
// ─────────────────────────────────────────────────────────────────────────────

import { createBlock, isTextBlock, anchorId }            from '../core/Block.js';
import {
  updateBlock, splitBlock, mergeBlockWithPrev,
  insertBlockAfter, removeBlock, getBlockIndex,
  getBlockBefore, getBlockAfter, moveBlock,
} from '../core/Document.js';
import { History }                                        from '../core/History.js';
import { getBlockDef, getAllTypes, defaultMeta }          from '../blocks/BlockSchema.js';
import {
  attachKeyboardHandler,
  getCursorOffset, setCursorOffset,
  focusAtEnd, focusAtStart,
}                                                         from './Keyboard.js';
import { renderInlineToDOM } from '../inline/InlineRenderer.js';

const TYPING_DEBOUNCE_MS = 400;

export class Editor {
  constructor(container, options = {}) {
    this._container = container;
    this._options   = options;
    this._history   = new History(options.doc);
    this._doc       = options.doc;
    this._books     = options.books ?? [];
    this._focusedId = null;
    this._blockEls  = new Map(); // blockId → { wrap, editable, preview }
    this._typingTimer = null;

    container.classList.add('griot-editor');
    this._render();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  get doc() { return this._doc; }

  setDoc(doc) {
    this._history.push(doc);
    this._doc = doc;
    this._render();
  }

  setBooks(books) {
    this._books = books;
    this._render();
  }

  focus(blockId) {
    const els = this._blockEls.get(blockId);
    if (els?.editable) focusAtEnd(els.editable);
  }

  destroy() {
    clearTimeout(this._typingTimer);
    this._container.innerHTML = '';
    this._container.classList.remove('griot-editor');
    this._blockEls.clear();
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  _render() {
    const container = this._container;
    const doc = this._doc;

    // Preserve focused block id across re-renders
    const prevFocused = this._focusedId;

    container.innerHTML = '';
    this._blockEls.clear();

    for (const block of doc.blocks) {
      const wrap = this._renderBlock(block);
      container.appendChild(wrap);
    }

    // Restore focus
    if (prevFocused && this._blockEls.has(prevFocused)) {
      const els = this._blockEls.get(prevFocused);
      if (els.editable) {
        requestAnimationFrame(() => focusAtEnd(els.editable));
      }
    }
  }

  _renderBlock(block) {
    const def = getBlockDef(block.type);

    // ── Outer wrapper ────────────────────────────────────────────
    const wrap = document.createElement('div');
    wrap.className = 'griot-editor-block';
    wrap.id = anchorId(block.id);
    wrap.dataset.blockId   = block.id;
    wrap.dataset.blockType = block.type;

    // ── Toolbar ──────────────────────────────────────────────────
    wrap.appendChild(this._buildToolbar(block));

    // ── Editable area ────────────────────────────────────────────
    let editable = null;

    if (def.hasText) {
      editable = document.createElement('div');
      editable.contentEditable = 'plaintext-only';
      editable.spellcheck = true;
      editable.className  = `griot-editor-block__input griot-input--${block.type}`;
      editable.dataset.placeholder = def.placeholder ?? '';

      if (block.type === 'heading') {
        editable.dataset.level = block.meta?.level ?? 2;
      }
      if (block.type === 'code') {
        editable.style.fontFamily = 'monospace';
        editable.style.whiteSpace = 'pre';
      }

      editable.textContent = block.text ?? '';

      // Typing → update doc (debounced history push)
      editable.addEventListener('input', () => {
        const text = editable.textContent;
        const updated = updateBlock(this._doc, block.id, { text });
        this._doc = updated;
        this._history.replace(updated);

        clearTimeout(this._typingTimer);
        this._typingTimer = setTimeout(() => {
          this._history.push(this._doc);
          this._emit();
        }, TYPING_DEBOUNCE_MS);

        // Refresh live preview if present
        this._updatePreview(block.id, text);
      });

      editable.addEventListener('focus', () => {
        this._focusedId = block.id;
        wrap.classList.add('is-focused');
      });
      editable.addEventListener('blur', () => {
        wrap.classList.remove('is-focused');
      });

      attachKeyboardHandler(editable, block.id, {
        onEnter:           (id, offset) => this._onEnter(id, offset),
        onBackspaceAtStart:(id)         => this._onBackspaceAtStart(id),
        onDeleteAtEnd:     (id)         => this._onDeleteAtEnd(id),
        onTab:             (id, shift)  => this._onTab(id, shift),
        onArrowUp:         (id)         => this._focusPrev(id),
        onArrowDown:       (id)         => this._focusNext(id),
        onUndo:            ()           => this._undo(),
        onRedo:            ()           => this._redo(),
      });

      wrap.appendChild(editable);

      // Live inline preview (for paragraph, blockquote, callout)
      if (def.hasInline) {
        const preview = document.createElement('div');
        preview.className = 'griot-editor-block__preview';
        wrap.appendChild(preview);
        this._updatePreview(block.id, block.text ?? '', preview);
        this._blockEls.set(block.id, { wrap, editable, preview });
      } else {
        this._blockEls.set(block.id, { wrap, editable, preview: null });
      }

    } else {
      // Non-text blocks: render their special UI
      wrap.appendChild(this._buildSpecialBlockUI(block));
      this._blockEls.set(block.id, { wrap, editable: null, preview: null });
    }

    return wrap;
  }

  _buildToolbar(block) {
    const def = getBlockDef(block.type);
    const bar = document.createElement('div');
    bar.className = 'griot-editor-block__toolbar';

    // Type selector
    const sel = document.createElement('select');
    sel.className = 'griot-editor-block__type-sel';
    for (const type of getAllTypes()) {
      const d   = getBlockDef(type);
      const opt = document.createElement('option');
      opt.value = type; opt.textContent = `${d.icon} ${d.label}`;
      if (type === block.type) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => this._changeType(block.id, sel.value));
    bar.appendChild(sel);

    // Heading level selector (only for heading type)
    if (block.type === 'heading') {
      const lvlSel = document.createElement('select');
      lvlSel.className = 'griot-editor-block__lvl-sel';
      for (let i = 1; i <= 6; i++) {
        const opt = document.createElement('option');
        opt.value = i; opt.textContent = `H${i}`;
        if (i === (block.meta?.level ?? 2)) opt.selected = true;
        lvlSel.appendChild(opt);
      }
      lvlSel.addEventListener('change', () => {
        const doc = updateBlock(this._doc, block.id, { meta: { level: Number(lvlSel.value) } });
        this._commit(doc);
      });
      bar.appendChild(lvlSel);
    }

    // Book picker button (only for book_citation)
    if (block.type === 'book_citation') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'griot-editor-block__pick-btn';
      btn.textContent = block.meta?.bookId ? '✎ Change source' : '📖 Pick source…';
      btn.addEventListener('click', () => {
        this._options.onRequestBookPicker?.(block.id, ({ bookId, unitId, quote, note }) => {
          const doc = updateBlock(this._doc, block.id, {
            meta: { ...block.meta, bookId, unitId, quote, note },
          });
          this._commit(doc);
        });
      });
      bar.appendChild(btn);
    }

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'griot-editor-block__actions';

    const mkBtn = (label, title, onClick, extraClass = '') => {
      const b = document.createElement('button');
      b.type = 'button'; b.title = title;
      b.className = `griot-editor-block__action-btn ${extraClass}`.trim();
      b.textContent = label;
      b.addEventListener('click', onClick);
      return b;
    };

    const idx   = getBlockIndex(this._doc, block.id);
    const total = this._doc.blocks.length;

    actions.appendChild(mkBtn('↑', 'Move up',   () => this._move(block.id, -1), idx === 0 ? 'is-disabled' : ''));
    actions.appendChild(mkBtn('↓', 'Move down',  () => this._move(block.id,  1), idx === total - 1 ? 'is-disabled' : ''));
    actions.appendChild(mkBtn('+', 'Add block below', () => this._addAfter(block.id), 'is-add'));
    actions.appendChild(mkBtn('×', 'Delete block',    () => this._delete(block.id), 'is-delete'));

    bar.appendChild(actions);
    return bar;
  }

  _buildSpecialBlockUI(block) {
    const wrap = document.createElement('div');
    wrap.className = 'griot-editor-block__special';

    switch (block.type) {
      case 'divider':
        wrap.innerHTML = `<hr class="griot-divider">`;
        break;

      case 'image': {
        const srcInput = this._metaInput(block, 'src',     'Image URL…',  { style: 'flex:2' });
        const altInput = this._metaInput(block, 'alt',     'Alt text…',   {});
        const capInput = this._metaInput(block, 'caption', 'Caption…',    {});
        if (block.meta?.src) {
          const img = document.createElement('img');
          img.src = block.meta.src;
          img.alt = block.meta.alt ?? '';
          img.className = 'griot-editor-block__img-preview';
          wrap.appendChild(img);
        }
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
        [srcInput, altInput, capInput].forEach(el => row.appendChild(el));
        wrap.appendChild(row);
        break;
      }

      case 'timeline_ref': {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
        row.appendChild(this._metaInput(block, 'eventId',    'Event ID…',          { style: 'flex:1;font-family:monospace' }));
        row.appendChild(this._metaInput(block, 'eventTitle', 'Display title…',     { style: 'flex:2' }));
        row.appendChild(this._metaInput(block, 'note',       'Note (inline ok)…',  { style: 'flex:3' }));
        wrap.appendChild(row);
        break;
      }

      case 'book_citation': {
        const { bookId, unitId, quote = '', note = '' } = block.meta ?? {};
        if (bookId) {
          const book = this._books.find(b => b.id === bookId);
          const unit = book?.units?.find(u => u.id === unitId);
          const label = document.createElement('div');
          label.className = 'griot-editor-block__citation-label';
          label.textContent = book ? `📖 ${book.title} · ${unit?.label ?? '—'}` : '📖 Book not found';
          wrap.appendChild(label);
        }
        const quoteArea = this._metaTextarea(block, 'quote', 'Quoted passage…', { rows: 2 });
        const noteArea  = this._metaTextarea(block, 'note',  'Commentary (inline syntax ok)…', { rows: 2 });
        wrap.appendChild(quoteArea);
        wrap.appendChild(noteArea);
        break;
      }

      case 'callout': {
        const iconInput = this._metaInput(block, 'icon', '💡', { style: 'width:46px;text-align:center;font-size:18px' });
        wrap.appendChild(iconInput);
        break;
      }
    }

    return wrap;
  }

  // ─── Meta input helpers ─────────────────────────────────────────────────────

  _metaInput(block, key, placeholder, attrs = {}) {
    const el = document.createElement('input');
    el.type = 'text';
    el.className = 'griot-editor-block__meta-input';
    el.placeholder = placeholder;
    el.value = block.meta?.[key] ?? '';
    if (attrs.style) el.style.cssText = attrs.style;
    el.addEventListener('input', () => {
      const doc = updateBlock(this._doc, block.id, { meta: { [key]: el.value } });
      this._commit(doc);
    });
    return el;
  }

  _metaTextarea(block, key, placeholder, { rows = 2 } = {}) {
    const el = document.createElement('textarea');
    el.className = 'griot-editor-block__meta-input griot-editor-block__meta-textarea';
    el.rows = rows;
    el.placeholder = placeholder;
    el.value = block.meta?.[key] ?? '';
    el.addEventListener('input', () => {
      const doc = updateBlock(this._doc, block.id, { meta: { [key]: el.value } });
      this._commit(doc);
    });
    return el;
  }

  // ─── Live preview ────────────────────────────────────────────────────────────

  _updatePreview(blockId, text, previewEl) {
    const el = previewEl ?? this._blockEls.get(blockId)?.preview;
    if (!el) return;
    el.innerHTML = '';
    if (!text?.trim()) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.appendChild(renderInlineToDOM(text, {
      onEventClick: this._options.onEventClick,
      onCiteClick:  this._options.onCiteClick,
    }));
  }

  // ─── Mutations ───────────────────────────────────────────────────────────────

  _commit(doc) {
    this._doc = doc;
    this._history.push(doc);
    this._render();
    this._emit();
  }

  _emit() {
    this._options.onChange?.(this._doc);
  }

  _changeType(blockId, type) {
    const block  = this._doc.blocks.find(b => b.id === blockId);
    const patch  = { type, meta: defaultMeta(type) };
    if (getBlockDef(type).hasText && block?.text === null) patch.text = '';
    if (!getBlockDef(type).hasText) patch.text = null;
    this._commit(updateBlock(this._doc, blockId, patch));
  }

  _addAfter(blockId) {
    const nb  = createBlock('paragraph');
    const doc = insertBlockAfter(this._doc, blockId, nb);
    this._commit(doc);
    requestAnimationFrame(() => {
      const els = this._blockEls.get(nb.id);
      if (els?.editable) focusAtStart(els.editable);
    });
  }

  _delete(blockId) {
    if (this._doc.blocks.length <= 1) return;
    const prevBlock = getBlockBefore(this._doc, blockId);
    this._commit(removeBlock(this._doc, blockId));
    if (prevBlock) {
      requestAnimationFrame(() => {
        const els = this._blockEls.get(prevBlock.id);
        if (els?.editable) focusAtEnd(els.editable);
      });
    }
  }

  _move(blockId, direction) {
    const idx = getBlockIndex(this._doc, blockId);
    if (idx < 0) return;
    const toIdx = idx + direction;
    if (toIdx < 0 || toIdx >= this._doc.blocks.length) return;
    this._commit(moveBlock(this._doc, idx, toIdx));
  }

  // ─── Keyboard actions ────────────────────────────────────────────────────────

  _onEnter(blockId, offset) {
    const [doc, newId] = splitBlock(this._doc, blockId, offset);
    this._commit(doc);
    if (newId) {
      requestAnimationFrame(() => {
        const els = this._blockEls.get(newId);
        if (els?.editable) focusAtStart(els.editable);
      });
    }
  }

  _onBackspaceAtStart(blockId) {
    const [doc, prevId, mergeOffset] = mergeBlockWithPrev(this._doc, blockId);
    if (!prevId) return;
    this._commit(doc);
    requestAnimationFrame(() => {
      const els = this._blockEls.get(prevId);
      if (els?.editable) {
        els.editable.focus();
        setCursorOffset(els.editable, mergeOffset);
      }
    });
  }

  _onDeleteAtEnd(blockId) {
    const nextBlock = getBlockAfter(this._doc, blockId);
    if (!nextBlock) return;
    this._onBackspaceAtStart(nextBlock.id);
  }

  _onTab(blockId, isShift) {
    // Placeholder: indent/outdent for list blocks in future
  }

  _focusPrev(blockId) {
    const prev = getBlockBefore(this._doc, blockId);
    if (prev) {
      const els = this._blockEls.get(prev.id);
      if (els?.editable) focusAtEnd(els.editable);
    }
  }

  _focusNext(blockId) {
    const next = getBlockAfter(this._doc, blockId);
    if (next) {
      const els = this._blockEls.get(next.id);
      if (els?.editable) focusAtStart(els.editable);
    }
  }

  _undo() {
    this._doc = this._history.undo();
    this._render();
    this._emit();
  }

  _redo() {
    this._doc = this._history.redo();
    this._render();
    this._emit();
  }
}
