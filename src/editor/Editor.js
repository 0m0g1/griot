// ─── Editor.js ────────────────────────────────────────────────────────────────
// Block editor. Manages the full editing lifecycle: rendering, keyboard,
// focus, undo/redo, inline formatting toolbar, and markdown shortcuts.
//
// Usage:
//   const editor = new Editor(containerEl, {
//     doc,
//     books,
//     onChange(doc) {},
//     onEventClick(eventId) {},
//     onCiteClick(blockId) {},
//     onRequestBookPicker(blockId, cb) {},
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
  getCursorOffset, getSelectionOffsets, setCursorOffset,
  focusAtEnd, focusAtStart,
} from './Keyboard.js';
import { FormatToolbar }                                  from './FormatToolbar.js';
import { renderInlineToDOM }                             from '../inline/InlineRenderer.js';

const TYPING_DEBOUNCE_MS = 400;

// Block types where Enter inserts a newline instead of splitting the block
const LIST_TYPES = new Set(['list_ul', 'list_ol']);

// Markdown block shortcuts: pattern (anchored) → { type, meta?, stripPrefix }
const BLOCK_SHORTCUTS = [
  { re: /^###### /, type: 'heading', meta: { level: 6 }, strip: 7 },
  { re: /^##### /,  type: 'heading', meta: { level: 5 }, strip: 6 },
  { re: /^#### /,   type: 'heading', meta: { level: 4 }, strip: 5 },
  { re: /^### /,    type: 'heading', meta: { level: 3 }, strip: 4 },
  { re: /^## /,     type: 'heading', meta: { level: 2 }, strip: 3 },
  { re: /^# /,      type: 'heading', meta: { level: 1 }, strip: 2 },
  { re: /^> /,      type: 'blockquote', strip: 2 },
  { re: /^- /,      type: 'list_ul',   strip: 2 },
  { re: /^\* /,     type: 'list_ul',   strip: 2 },
  { re: /^1\. /,    type: 'list_ol',   strip: 3 },
  { re: /^--- /,    type: 'divider',   strip: 4, clearText: true },
  { re: /^``` /,    type: 'code',      strip: 4 },
  { re: /^```$/,    type: 'code',      strip: 3 },
];

// Inline format-key → markdown syntax
const FORMAT_SYNTAX = { b: '**', i: '*', u: '__' };

export class Editor {
  constructor(container, options = {}) {
    this._container   = container;
    this._options     = options;
    this._history     = new History(options.doc);
    this._doc         = options.doc;
    this._books       = options.books ?? [];
    this._focusedId   = null;
    this._focusedEl   = null; // the active editable element
    this._blockEls    = new Map(); // blockId → { wrap, editable, preview }
    this._typingTimer = null;

    container.classList.add('griot-editor');
    this._render();

    // Floating format toolbar
    this._toolbar = new FormatToolbar(container, {
      onWrap:  (syntax) => this._wrapSelection(syntax),
      onLink:  ()       => this._insertLink(),
      onColor: ()       => this._insertColor(),
    });
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
    this._toolbar.destroy();
    this._container.innerHTML = '';
    this._container.classList.remove('griot-editor');
    this._blockEls.clear();
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  _render() {
    const prevFocused = this._focusedId;

    this._container.innerHTML = '';
    this._blockEls.clear();

    for (const block of this._doc.blocks) {
      this._container.appendChild(this._renderBlock(block));
    }

    if (prevFocused && this._blockEls.has(prevFocused)) {
      const els = this._blockEls.get(prevFocused);
      if (els.editable) requestAnimationFrame(() => focusAtEnd(els.editable));
    }
  }

  _renderBlock(block) {
    const def  = getBlockDef(block.type);
    const wrap = document.createElement('div');
    wrap.className = 'griot-editor-block';
    wrap.id        = anchorId(block.id);
    wrap.dataset.blockId   = block.id;
    wrap.dataset.blockType = block.type;

    wrap.appendChild(this._buildToolbar(block));

    let editable = null;

    if (def.hasText) {
      // ── Callout / callout variants: icon input above editable ──────────────
      if (block.type.startsWith('callout')) {
        wrap.appendChild(this._buildCalloutMeta(block));
      }

      editable = document.createElement('div');
      editable.contentEditable = 'plaintext-only';
      editable.spellcheck = true;
      editable.className  = `griot-editor-block__input griot-input--${block.type}`;
      editable.dataset.placeholder = def.placeholder ?? '';

      if (block.type === 'heading') editable.dataset.level = block.meta?.level ?? 2;
      if (block.type === 'code') {
        editable.style.fontFamily = 'monospace';
        editable.style.whiteSpace = 'pre';
      }
      if (LIST_TYPES.has(block.type)) {
        editable.style.whiteSpace = 'pre-wrap';
      }

      editable.textContent = block.text ?? '';

      editable.addEventListener('input', () => this._onInput(block.id, editable));
      editable.addEventListener('focus', () => {
        this._focusedId = block.id;
        this._focusedEl = editable;
        wrap.classList.add('is-focused');
      });
      editable.addEventListener('blur', () => {
        wrap.classList.remove('is-focused');
        if (this._focusedEl === editable) this._focusedEl = null;
      });

      attachKeyboardHandler(editable, block.id, {
        onEnter:            (id, offset) => this._onEnter(id, offset),
        onBackspaceAtStart: (id)         => this._onBackspaceAtStart(id),
        onDeleteAtEnd:      (id)         => this._onDeleteAtEnd(id),
        onTab:              (id, shift)  => this._onTab(id, shift),
        onArrowUp:          (id)         => this._focusPrev(id),
        onArrowDown:        (id)         => this._focusNext(id),
        onUndo:             ()           => this._undo(),
        onRedo:             ()           => this._redo(),
        onFormatKey:        (key)        => this._wrapSelection(FORMAT_SYNTAX[key] ?? ''),
      });

      wrap.appendChild(editable);

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
      wrap.appendChild(this._buildSpecialBlockUI(block));
      this._blockEls.set(block.id, { wrap, editable: null, preview: null });
    }

    return wrap;
  }

  // ── Toolbar ─────────────────────────────────────────────────────────────────

  _buildToolbar(block) {
    const bar = document.createElement('div');
    bar.className = 'griot-editor-block__toolbar';

    // Type selector
    const sel = document.createElement('select');
    sel.className = 'griot-editor-block__type-sel';
    for (const type of getAllTypes()) {
      const d   = getBlockDef(type);
      const opt = document.createElement('option');
      opt.value       = type;
      opt.textContent = `${d.icon} ${d.label}`;
      if (type === block.type) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => this._changeType(block.id, sel.value));
    bar.appendChild(sel);

    // Heading level selector
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
        this._commit(updateBlock(this._doc, block.id, { meta: { level: Number(lvlSel.value) } }));
      });
      bar.appendChild(lvlSel);
    }

    // Code language selector
    if (block.type === 'code') {
      const langInput = document.createElement('input');
      langInput.type = 'text';
      langInput.className = 'griot-editor-block__lang-input';
      langInput.placeholder = 'language…';
      langInput.value = block.meta?.language ?? '';
      langInput.style.cssText = 'width:90px;';
      langInput.addEventListener('change', () => {
        this._commit(updateBlock(this._doc, block.id, { meta: { language: langInput.value } }));
      });
      bar.appendChild(langInput);
    }

    // Book picker
    if (block.type === 'book_citation') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'griot-editor-block__pick-btn';
      btn.textContent = block.meta?.bookId ? '✎ Change source' : '📖 Pick source…';
      btn.addEventListener('click', () => {
        this._options.onRequestBookPicker?.(block.id, ({ bookId, unitId, quote, note }) => {
          this._commit(updateBlock(this._doc, block.id, { meta: { ...block.meta, bookId, unitId, quote, note } }));
        });
      });
      bar.appendChild(btn);
    }

    // Move / add / delete actions
    const actions = document.createElement('div');
    actions.className = 'griot-editor-block__actions';
    const idx   = getBlockIndex(this._doc, block.id);
    const total = this._doc.blocks.length;

    const mkBtn = (label, title, onClick, disabled = false) => {
      const b = document.createElement('button');
      b.type = 'button'; b.title = title;
      b.className = `griot-editor-block__action-btn${disabled ? ' is-disabled' : ''}`;
      b.textContent = label;
      if (!disabled) b.addEventListener('click', onClick);
      return b;
    };

    actions.appendChild(mkBtn('↑', 'Move up',        () => this._move(block.id, -1), idx === 0));
    actions.appendChild(mkBtn('↓', 'Move down',       () => this._move(block.id,  1), idx === total - 1));
    actions.appendChild(mkBtn('+', 'Add block below', () => this._addAfter(block.id)));
    actions.appendChild(mkBtn('×', 'Delete block',    () => this._delete(block.id)));

    bar.appendChild(actions);
    return bar;
  }

  // ── Callout meta (icon picker) ───────────────────────────────────────────────

  _buildCalloutMeta(block) {
    const row = document.createElement('div');
    row.className = 'griot-editor-block__callout-meta';
    row.appendChild(this._metaInput(block, 'icon', '💡', { style: 'width:46px;text-align:center;font-size:18px' }));
    return row;
  }

  // ── Special (non-text) block UIs ─────────────────────────────────────────────

  _buildSpecialBlockUI(block) {
    const wrap = document.createElement('div');
    wrap.className = 'griot-editor-block__special';

    switch (block.type) {

      case 'divider':
        wrap.innerHTML = `<hr class="griot-divider">`;
        break;

      case 'image': {
        if (block.meta?.src) {
          const img = document.createElement('img');
          img.src = block.meta.src;
          img.alt = block.meta.alt ?? '';
          img.className = 'griot-editor-block__img-preview';
          wrap.appendChild(img);
        }
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
        [
          this._metaInput(block, 'src',     'Image URL…',  { style: 'flex:2' }),
          this._metaInput(block, 'alt',     'Alt text…',   {}),
          this._metaInput(block, 'caption', 'Caption…',    {}),
        ].forEach(el => row.appendChild(el));
        wrap.appendChild(row);
        break;
      }

      case 'video': {
        const { src = '' } = block.meta ?? {};
        if (src) {
          const yt = src.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/);
          const vm = src.match(/vimeo\.com\/(\d+)/);
          if (yt || vm) {
            const embedSrc = yt
              ? `https://www.youtube.com/embed/${yt[1]}`
              : `https://player.vimeo.com/video/${vm[1]}`;
            const iframe = document.createElement('iframe');
            iframe.src = embedSrc;
            iframe.className = 'griot-editor-block__video-preview';
            iframe.frameBorder = '0';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            wrap.appendChild(iframe);
          }
        }
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
        [
          this._metaInput(block, 'src',     'YouTube / Vimeo / video URL…', { style: 'flex:2' }),
          this._metaInput(block, 'caption', 'Caption…', {}),
        ].forEach(el => row.appendChild(el));
        wrap.appendChild(row);
        break;
      }

      case 'table': {
        wrap.appendChild(this._buildTableUI(block));
        break;
      }

      case 'timeline_ref': {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
        [
          this._metaInput(block, 'eventId',    'Event ID…',         { style: 'flex:1;font-family:monospace' }),
          this._metaInput(block, 'eventTitle', 'Display title…',    { style: 'flex:2' }),
          this._metaInput(block, 'note',       'Note (inline ok)…', { style: 'flex:3' }),
        ].forEach(el => row.appendChild(el));
        wrap.appendChild(row);
        break;
      }

      case 'book_citation': {
        const { bookId, unitId } = block.meta ?? {};
        if (bookId) {
          const book = this._books.find(b => b.id === bookId);
          const unit = book?.units?.find(u => u.id === unitId);
          const label = document.createElement('div');
          label.className = 'griot-editor-block__citation-label';
          label.textContent = book ? `📖 ${book.title} · ${unit?.label ?? '—'}` : '📖 Book not found';
          wrap.appendChild(label);
        }
        wrap.appendChild(this._metaTextarea(block, 'quote', 'Quoted passage…',                  { rows: 2 }));
        wrap.appendChild(this._metaTextarea(block, 'note',  'Commentary (inline syntax ok)…', { rows: 2 }));
        break;
      }
    }

    return wrap;
  }

  // ── Table editor UI ──────────────────────────────────────────────────────────

  _buildTableUI(block) {
    const headers  = Array.isArray(block.meta?.headers) ? block.meta.headers : ['Column 1', 'Column 2'];
    const rows     = Array.isArray(block.meta?.rows)    ? block.meta.rows    : [['', '']];
    const colCount = headers.length;

    const container = document.createElement('div');
    container.className = 'griot-editor-table';

    const table = document.createElement('table');
    table.className = 'griot-editor-table__grid';

    // ── Header row ──
    const thead    = document.createElement('thead');
    const headerTr = document.createElement('tr');

    for (let ci = 0; ci < colCount; ci++) {
      const th    = document.createElement('th');
      const input = document.createElement('input');
      input.type        = 'text';
      input.value       = headers[ci] ?? '';
      input.placeholder = `Column ${ci + 1}`;
      input.className   = 'griot-editor-table__cell griot-editor-table__cell--header';
      const colIdx = ci;
      input.addEventListener('change', () => {
        const h = [...headers]; h[colIdx] = input.value;
        this._commit(updateBlock(this._doc, block.id, { meta: { headers: h } }));
      });
      th.appendChild(input);
      headerTr.appendChild(th);
    }

    // Column controls
    const thCtrl = document.createElement('th');
    thCtrl.className = 'griot-editor-table__ctrl-cell';
    const addColBtn = this._mkSmallBtn('+col', 'Add column', () => {
      this._commit(updateBlock(this._doc, block.id, {
        meta: { headers: [...headers, `Column ${colCount + 1}`], rows: rows.map(r => [...r, '']) },
      }));
    });
    thCtrl.appendChild(addColBtn);
    if (colCount > 1) {
      const delColBtn = this._mkSmallBtn('-col', 'Remove last column', () => {
        this._commit(updateBlock(this._doc, block.id, {
          meta: { headers: headers.slice(0, -1), rows: rows.map(r => r.slice(0, -1)) },
        }));
      }, 'is-del');
      thCtrl.appendChild(delColBtn);
    }
    headerTr.appendChild(thCtrl);
    thead.appendChild(headerTr);
    table.appendChild(thead);

    // ── Data rows ──
    const tbody = document.createElement('tbody');

    for (let ri = 0; ri < rows.length; ri++) {
      const tr = document.createElement('tr');
      for (let ci = 0; ci < colCount; ci++) {
        const td    = document.createElement('td');
        const input = document.createElement('input');
        input.type        = 'text';
        input.value       = rows[ri][ci] ?? '';
        input.placeholder = '…';
        input.className   = 'griot-editor-table__cell';
        const rowIdx = ri, colIdx = ci;
        input.addEventListener('change', () => {
          const r = rows.map(row => [...row]);
          r[rowIdx][colIdx] = input.value;
          this._commit(updateBlock(this._doc, block.id, { meta: { rows: r } }));
        });
        td.appendChild(input);
        tr.appendChild(td);
      }
      // Delete row button
      const tdDel  = document.createElement('td');
      const rowIdx = ri;
      tdDel.appendChild(this._mkSmallBtn('×', 'Delete row', () => {
        if (rows.length <= 1) return;
        this._commit(updateBlock(this._doc, block.id, {
          meta: { rows: rows.filter((_, i) => i !== rowIdx) },
        }));
      }, 'is-del'));
      tr.appendChild(tdDel);
      tbody.appendChild(tr);
    }

    // Add row
    const addRowTr = document.createElement('tr');
    const addRowTd = document.createElement('td');
    addRowTd.colSpan = colCount + 1;
    addRowTd.appendChild(this._mkSmallBtn('+ Add row', 'Add row', () => {
      this._commit(updateBlock(this._doc, block.id, {
        meta: { rows: [...rows, new Array(colCount).fill('')] },
      }));
    }, 'is-add-row'));
    addRowTr.appendChild(addRowTd);
    tbody.appendChild(addRowTr);

    table.appendChild(tbody);
    container.appendChild(table);
    return container;
  }

  _mkSmallBtn(label, title, onClick, extraClass = '') {
    const b = document.createElement('button');
    b.type = 'button'; b.title = title;
    b.className = `griot-editor-table__btn ${extraClass}`.trim();
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  // ── Meta input helpers ───────────────────────────────────────────────────────

  _metaInput(block, key, placeholder, { style = '' } = {}) {
    const el = document.createElement('input');
    el.type = 'text';
    el.className = 'griot-editor-block__meta-input';
    el.placeholder = placeholder;
    el.value = block.meta?.[key] ?? '';
    if (style) el.style.cssText = style;
    el.addEventListener('input', () => {
      this._commit(updateBlock(this._doc, block.id, { meta: { [key]: el.value } }));
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
      this._commit(updateBlock(this._doc, block.id, { meta: { [key]: el.value } }));
    });
    return el;
  }

  // ── Live preview ─────────────────────────────────────────────────────────────

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

  // ── Input handler (typing + markdown shortcuts) ───────────────────────────────

  _onInput(blockId, editable) {
    const text = editable.textContent;

    // ── Markdown block shortcuts ────────────────────────────────────────────
    for (const sc of BLOCK_SHORTCUTS) {
      if (!sc.re.test(text)) continue;

      const newText = sc.clearText ? '' : text.slice(sc.strip);
      const patch   = { type: sc.type, meta: { ...defaultMeta(sc.type), ...(sc.meta ?? {}) } };
      if (sc.clearText || sc.type !== 'divider') patch.text = newText;

      const doc = updateBlock(this._doc, blockId, patch);
      this._commit(doc);

      // Restore cursor after re-render
      requestAnimationFrame(() => {
        const els = this._blockEls.get(blockId);
        if (els?.editable) focusAtStart(els.editable);
      });
      return;
    }

    // ── Normal typing ───────────────────────────────────────────────────────
    const updated = updateBlock(this._doc, blockId, { text });
    this._doc = updated;
    this._history.replace(updated);

    clearTimeout(this._typingTimer);
    this._typingTimer = setTimeout(() => {
      this._history.push(this._doc);
      this._emit();
    }, TYPING_DEBOUNCE_MS);

    this._updatePreview(blockId, text);
  }

  // ── Inline formatting ─────────────────────────────────────────────────────────

  _wrapSelection(syntax) {
    const el = this._focusedEl;
    if (!el || !syntax) return;

    const { start, end } = getSelectionOffsets(el);
    const text     = el.textContent;
    const selected = text.slice(start, end);
    if (!selected) return;

    const newText = text.slice(0, start) + syntax + selected + syntax + text.slice(end);
    el.textContent = newText;
    setCursorOffset(el, end + syntax.length * 2);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  _insertLink() {
    const el = this._focusedEl;
    if (!el) return;
    const { start, end } = getSelectionOffsets(el);
    const text     = el.textContent;
    const selected = text.slice(start, end).trim();
    const url      = window.prompt('Link URL:', 'https://');
    if (!url) return;
    const label  = selected || 'Link';
    const md     = `[${label}](${url})`;
    const newText = text.slice(0, start) + md + text.slice(end);
    el.textContent = newText;
    setCursorOffset(el, start + md.length);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  _insertColor() {
    const el = this._focusedEl;
    if (!el) return;
    const { start, end } = getSelectionOffsets(el);
    const text     = el.textContent;
    const selected = text.slice(start, end).trim();
    if (!selected) return;
    const color = window.prompt('Color (hex or name, e.g. #e05 or tomato):', '#e05');
    if (!color) return;
    const md      = `{${color}:${selected}}`;
    const newText = text.slice(0, start) + md + text.slice(end);
    el.textContent = newText;
    setCursorOffset(el, start + md.length);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ── Mutations ─────────────────────────────────────────────────────────────────

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
    const block = this._doc.blocks.find(b => b.id === blockId);
    const patch = { type, meta: defaultMeta(type) };
    if (getBlockDef(type).hasText  && block?.text === null) patch.text = '';
    if (!getBlockDef(type).hasText && block?.text !== null) patch.text = null;
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
    const prev = getBlockBefore(this._doc, blockId);
    this._commit(removeBlock(this._doc, blockId));
    if (prev) requestAnimationFrame(() => {
      const els = this._blockEls.get(prev.id);
      if (els?.editable) focusAtEnd(els.editable);
    });
  }

  _move(blockId, direction) {
    const idx   = getBlockIndex(this._doc, blockId);
    const toIdx = idx + direction;
    if (toIdx < 0 || toIdx >= this._doc.blocks.length) return;
    this._commit(moveBlock(this._doc, idx, toIdx));
  }

  // ── Keyboard actions ──────────────────────────────────────────────────────────

  _onEnter(blockId, offset) {
    const block = this._doc.blocks.find(b => b.id === blockId);

    // In list blocks, Enter inserts a newline (new list item)
    if (block && LIST_TYPES.has(block.type)) {
      const el = this._blockEls.get(blockId)?.editable;
      if (el) {
        const text    = el.textContent;
        const newText = text.slice(0, offset) + '\n' + text.slice(offset);
        el.textContent = newText;
        setCursorOffset(el, offset + 1);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }

    const [doc, newId] = splitBlock(this._doc, blockId, offset);
    this._commit(doc);
    if (newId) requestAnimationFrame(() => {
      const els = this._blockEls.get(newId);
      if (els?.editable) focusAtStart(els.editable);
    });
  }

  _onBackspaceAtStart(blockId) {
    const [doc, prevId, mergeOffset] = mergeBlockWithPrev(this._doc, blockId);
    if (!prevId) return;
    this._commit(doc);
    requestAnimationFrame(() => {
      const els = this._blockEls.get(prevId);
      if (els?.editable) { els.editable.focus(); setCursorOffset(els.editable, mergeOffset); }
    });
  }

  _onDeleteAtEnd(blockId) {
    const next = getBlockAfter(this._doc, blockId);
    if (next) this._onBackspaceAtStart(next.id);
  }

  _onTab(blockId, isShift) {
    // Future: indent/outdent list items
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