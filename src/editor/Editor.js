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
  getBlock, getBlockBefore, getBlockAfter, moveBlock,
} from '../core/Document.js';
import { History }                                        from '../core/History.js';
import { getBlockDef, getAllTypes, defaultMeta }          from '../blocks/BlockSchema.js';
import {
  attachKeyboardHandler,
  getCursorOffset, getSelectionOffsets, setCursorOffset,
  focusAtEnd, focusAtStart,
} from './Keyboard.js';
import { FormatToolbar }                                  from './FormatToolbar.js';
import { DropHandler }                                   from './DropHandler.js';
import { renderInlineToDOM }                             from '../inline/InlineRenderer.js';

const TYPING_DEBOUNCE_MS = 400;
const UPLOAD_URL_DEFAULT  = '/api/upload/insight-media';

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
  { re: /^\[\] /,   type: 'checklist', strip: 3, clearText: true },
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

    // Drag-and-drop file handler
    this._drop = new DropHandler(container, {
      getDoc:    ()    => this._doc,
      onCommit:  (doc) => this._commit(doc),
      onUpload:  options.onUpload  ?? undefined,
      uploadUrl: options.uploadUrl ?? undefined,
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
    this._drop.destroy();
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

      editable.addEventListener('input',  () => this._onInput(block.id, editable));
      editable.addEventListener('paste',  (e) => this._onPaste(block.id, editable, e));
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
          img.src = block.meta.src; img.alt = block.meta.alt ?? '';
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

      case 'gallery': {
        const items  = Array.isArray(block.meta?.items)  ? block.meta.items  : [];
        const layout = block.meta?.layout ?? 'grid';

        if (items.length) {
          const thumbs = document.createElement('div');
          thumbs.className = 'griot-editor-gallery__thumbs';
          items.forEach((item, i) => {
            const thumb = document.createElement('div');
            thumb.className = `griot-editor-gallery__thumb${item._uploading ? ' is-uploading' : ''}`;
            if (item._uploading) {
              thumb.innerHTML = `<div class="griot-editor-gallery__thumb-spinner"></div>`;
            } else {
              const img = document.createElement('img');
              img.src = item.src ?? item.url ?? ''; img.alt = item.alt ?? item.alt_text ?? '';
              thumb.appendChild(img);
              const cap = document.createElement('input');
              cap.type = 'text'; cap.className = 'griot-editor-gallery__thumb-caption';
              cap.placeholder = 'Caption…'; cap.value = item.caption ?? '';
              cap.addEventListener('input', () => {
                const b = getBlock(this._doc, block.id);
                const its = Array.isArray(b?.meta?.items) ? b.meta.items : [];
                const next = its.map((it, j) => j === i ? { ...it, caption: cap.value } : it);
                this._doc = updateBlock(this._doc, block.id, { meta: { items: next } });
                this._history.replace(this._doc);
                clearTimeout(this._typingTimer);
                this._typingTimer = setTimeout(() => { this._history.push(this._doc); this._emit(); }, TYPING_DEBOUNCE_MS);
              });
              thumb.appendChild(cap);
              const remove = document.createElement('button');
              remove.type = 'button'; remove.className = 'griot-editor-gallery__thumb-remove';
              remove.textContent = '×'; remove.title = 'Remove';
              remove.addEventListener('click', () => {
                const b = getBlock(this._doc, block.id);
                const next = (b?.meta?.items ?? []).filter((_, j) => j !== i);
                this._commit(updateBlock(this._doc, block.id, { meta: { items: next } }));
              });
              thumb.appendChild(remove);
            }
            thumbs.appendChild(thumb);
          });
          wrap.appendChild(thumbs);
        }

        const addRow = document.createElement('div');
        addRow.className = 'griot-editor-gallery__add-row';
        const fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.multiple = true; fileInput.style.display = 'none';
        fileInput.addEventListener('change', async (e) => {
          const files = [...(e.target.files ?? [])]; e.target.value = '';
          if (files.length) await this._galleryUpload(block.id, files);
        });
        const addBtn = document.createElement('button');
        addBtn.type = 'button'; addBtn.className = 'griot-editor-block__pick-btn';
        addBtn.textContent = '+ Upload images'; addBtn.addEventListener('click', () => fileInput.click());
        const urlInput = document.createElement('input');
        urlInput.type = 'url'; urlInput.className = 'griot-editor-block__meta-input';
        urlInput.placeholder = 'Image URL…'; urlInput.style.flex = '1';
        const addUrlBtn = document.createElement('button');
        addUrlBtn.type = 'button'; addUrlBtn.className = 'griot-editor-block__pick-btn';
        addUrlBtn.textContent = '+ Add URL';
        addUrlBtn.addEventListener('click', () => {
          const url = urlInput.value.trim(); if (!url) return;
          const b = getBlock(this._doc, block.id);
          const next = [...(b?.meta?.items ?? []), { src: url, url, alt: '', caption: '' }];
          this._commit(updateBlock(this._doc, block.id, { meta: { items: next } }));
          urlInput.value = '';
        });
        urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addUrlBtn.click(); });
        addRow.append(fileInput, addBtn, urlInput, addUrlBtn);
        wrap.appendChild(addRow);

        const layoutRow = document.createElement('div');
        layoutRow.className = 'griot-editor-gallery__layout-row';
        const lbl = document.createElement('span');
        lbl.className = 'griot-editor-gallery__layout-label'; lbl.textContent = 'Layout:';
        layoutRow.appendChild(lbl);
        for (const l of ['grid', 'masonry', 'carousel', 'strip']) {
          const btn = document.createElement('button');
          btn.type = 'button'; btn.textContent = l;
          btn.className = `griot-editor-gallery__layout-btn${layout === l ? ' is-active' : ''}`;
          btn.addEventListener('click', () => this._commit(updateBlock(this._doc, block.id, { meta: { layout: l } })));
          layoutRow.appendChild(btn);
        }
        wrap.appendChild(layoutRow);
        break;
      }

      case 'video': {
        const { src = '' } = block.meta ?? {};
        if (src) {
          const yt = src.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/);
          const vm = src.match(/vimeo\.com\/(\d+)/);
          if (yt || vm) {
            const embedSrc = yt ? `https://www.youtube.com/embed/${yt[1]}` : `https://player.vimeo.com/video/${vm[1]}`;
            const iframe = document.createElement('iframe');
            iframe.src = embedSrc; iframe.className = 'griot-editor-block__video-preview';
            iframe.frameBorder = '0';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            wrap.appendChild(iframe);
          }
        }
        const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
        [this._metaInput(block, 'src', 'YouTube / Vimeo / video URL…', { style: 'flex:2' }), this._metaInput(block, 'caption', 'Caption…', {})].forEach(el => row.appendChild(el));
        wrap.appendChild(row);
        break;
      }

      case 'audio': {
        const { src = '' } = block.meta ?? {};
        if (src) {
          const sp = src.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
          const sc = src.includes('soundcloud.com/');
          if (sp) {
            const iframe = document.createElement('iframe');
            iframe.src = `https://open.spotify.com/embed/${sp[1]}/${sp[2]}`;
            iframe.className = 'griot-editor-block__audio-preview'; iframe.frameBorder = '0';
            iframe.allow = 'autoplay; clipboard-write; encrypted-media'; wrap.appendChild(iframe);
          } else if (sc) {
            const iframe = document.createElement('iframe');
            iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(src)}&color=%236366f1&auto_play=false`;
            iframe.className = 'griot-editor-block__audio-preview'; iframe.frameBorder = '0'; wrap.appendChild(iframe);
          } else if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(src)) {
            const audio = document.createElement('audio');
            audio.src = src; audio.controls = true; audio.className = 'griot-editor-block__audio-native'; wrap.appendChild(audio);
          }
        }
        const fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = 'audio/*'; fileInput.style.display = 'none';
        fileInput.addEventListener('change', async (e) => {
          const files = [...(e.target.files ?? [])]; e.target.value = '';
          if (!files.length) return;
          const results = await this._uploadFiles(files.slice(0, 1));
          if (results[0]) this._commit(updateBlock(this._doc, block.id, { meta: { src: results[0].url ?? results[0].src ?? '', caption: block.meta?.caption ?? '' } }));
        });
        const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
        const uploadBtn = document.createElement('button');
        uploadBtn.type = 'button'; uploadBtn.className = 'griot-editor-block__pick-btn';
        uploadBtn.textContent = '⬆ Upload audio'; uploadBtn.addEventListener('click', () => fileInput.click());
        row.append(fileInput, uploadBtn, this._metaInput(block, 'src', 'SoundCloud / Spotify / audio URL…', { style: 'flex:2' }), this._metaInput(block, 'caption', 'Caption…', {}));
        wrap.appendChild(row);
        break;
      }

      case 'embed': {
        const { src = '', height = 400 } = block.meta ?? {};
        if (src) {
          const preview = document.createElement('iframe');
          preview.src = src; preview.style.height = `${height}px`;
          preview.className = 'griot-editor-block__embed-preview'; preview.frameBorder = '0';
          preview.allow = 'autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media';
          preview.allowFullscreen = true; wrap.appendChild(preview);
        }
        const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center';
        const heightInput = document.createElement('input');
        heightInput.type = 'number'; heightInput.className = 'griot-editor-block__meta-input';
        heightInput.placeholder = 'Height px'; heightInput.value = String(height);
        heightInput.min = '100'; heightInput.max = '1200'; heightInput.style.width = '90px';
        heightInput.addEventListener('change', () => {
          const h = Math.max(100, Math.min(1200, Number(heightInput.value) || 400));
          this._commit(updateBlock(this._doc, block.id, { meta: { height: h } }));
        });
        row.append(this._metaInput(block, 'src', 'Embed URL or iframe src…', { style: 'flex:3' }), heightInput, this._metaInput(block, 'caption', 'Caption…', {}));
        wrap.appendChild(row);
        break;
      }

      case 'columns': {
        const columns = Array.isArray(block.meta?.columns) ? block.meta.columns : [{ text: '' }, { text: '' }];
        const grid = document.createElement('div');
        grid.className = 'griot-editor-columns';
        grid.style.setProperty('--griot-col-count', String(columns.length));
        columns.forEach((col, i) => {
          const colWrap = document.createElement('div'); colWrap.className = 'griot-editor-columns__col';
          const ed = document.createElement('div');
          ed.contentEditable = 'plaintext-only'; ed.className = 'griot-editor-columns__editable';
          ed.dataset.placeholder = 'Column text…'; ed.spellcheck = true; ed.textContent = col.text ?? '';
          const preview = document.createElement('div'); preview.className = 'griot-editor-columns__preview';
          const refreshPreview = (text) => {
            preview.innerHTML = '';
            if (text?.trim()) preview.appendChild(renderInlineToDOM(text, { onEventClick: this._options.onEventClick, onCiteClick: this._options.onCiteClick }));
          };
          refreshPreview(col.text ?? '');
          ed.addEventListener('input', () => {
            const text = ed.textContent;
            const b = getBlock(this._doc, block.id);
            const cols = Array.isArray(b?.meta?.columns) ? b.meta.columns : columns;
            const next = cols.map((c, j) => j === i ? { ...c, text } : c);
            this._doc = updateBlock(this._doc, block.id, { meta: { columns: next } });
            this._history.replace(this._doc); refreshPreview(text);
            clearTimeout(this._typingTimer);
            this._typingTimer = setTimeout(() => { this._history.push(this._doc); this._emit(); }, TYPING_DEBOUNCE_MS);
          });
          colWrap.append(ed, preview); grid.appendChild(colWrap);
        });
        const ctrlRow = document.createElement('div'); ctrlRow.className = 'griot-editor-columns__controls';
        if (columns.length < 4) {
          ctrlRow.appendChild(this._mkSmallBtn('+ col', 'Add column', () => {
            const b = getBlock(this._doc, block.id);
            const cols = Array.isArray(b?.meta?.columns) ? b.meta.columns : columns;
            this._commit(updateBlock(this._doc, block.id, { meta: { columns: [...cols, { text: '' }] } }));
          }));
        }
        if (columns.length > 2) {
          ctrlRow.appendChild(this._mkSmallBtn('- col', 'Remove last column', () => {
            const b = getBlock(this._doc, block.id);
            const cols = Array.isArray(b?.meta?.columns) ? b.meta.columns : columns;
            this._commit(updateBlock(this._doc, block.id, { meta: { columns: cols.slice(0, -1) } }));
          }, 'is-del'));
        }
        wrap.append(grid, ctrlRow);
        break;
      }

      case 'checklist': {
        const items = Array.isArray(block.meta?.items) ? block.meta.items : [];
        const list = document.createElement('div'); list.className = 'griot-editor-checklist';
        const renderRows = () => {
          list.innerHTML = '';
          const b = getBlock(this._doc, block.id);
          const current = Array.isArray(b?.meta?.items) ? b.meta.items : items;
          current.forEach((item, i) => {
            const row = document.createElement('div'); row.className = 'griot-editor-checklist__row';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.checked = !!item.checked; cb.className = 'griot-editor-checklist__cb';
            cb.addEventListener('change', () => {
              const b2 = getBlock(this._doc, block.id);
              const its = Array.isArray(b2?.meta?.items) ? b2.meta.items : [];
              this._commit(updateBlock(this._doc, block.id, { meta: { items: its.map((it, j) => j === i ? { ...it, checked: cb.checked } : it) } }));
            });
            const textInput = document.createElement('input');
            textInput.type = 'text'; textInput.className = 'griot-editor-block__meta-input griot-editor-checklist__text';
            textInput.value = item.text ?? ''; textInput.placeholder = 'List item…';
            textInput.addEventListener('input', () => {
              const b2 = getBlock(this._doc, block.id);
              const its = Array.isArray(b2?.meta?.items) ? b2.meta.items : [];
              this._doc = updateBlock(this._doc, block.id, { meta: { items: its.map((it, j) => j === i ? { ...it, text: textInput.value } : it) } });
              this._history.replace(this._doc);
              clearTimeout(this._typingTimer);
              this._typingTimer = setTimeout(() => { this._history.push(this._doc); this._emit(); }, TYPING_DEBOUNCE_MS);
            });
            textInput.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const b2 = getBlock(this._doc, block.id);
                const its = [...(Array.isArray(b2?.meta?.items) ? b2.meta.items : [])];
                its.splice(i + 1, 0, { text: '', checked: false });
                this._commit(updateBlock(this._doc, block.id, { meta: { items: its } }));
                requestAnimationFrame(() => { const el = this._container.querySelector(`[data-block-id="${block.id}"]`); el?.querySelectorAll('.griot-editor-checklist__text')?.[i + 1]?.focus(); });
              }
              if (e.key === 'Backspace' && textInput.value === '') {
                e.preventDefault();
                const b2 = getBlock(this._doc, block.id);
                const its = Array.isArray(b2?.meta?.items) ? b2.meta.items : [];
                if (its.length <= 1) return;
                this._commit(updateBlock(this._doc, block.id, { meta: { items: its.filter((_, j) => j !== i) } }));
                requestAnimationFrame(() => { const el = this._container.querySelector(`[data-block-id="${block.id}"]`); const ins = el?.querySelectorAll('.griot-editor-checklist__text'); ins?.[Math.min(i, ins.length - 1)]?.focus(); });
              }
            });
            const delBtn = this._mkSmallBtn('×', 'Remove item', () => {
              const b2 = getBlock(this._doc, block.id);
              const its = Array.isArray(b2?.meta?.items) ? b2.meta.items : [];
              if (its.length <= 1) return;
              this._commit(updateBlock(this._doc, block.id, { meta: { items: its.filter((_, j) => j !== i) } }));
            }, 'is-del');
            row.append(cb, textInput, delBtn); list.appendChild(row);
          });
          const addBtn = document.createElement('button');
          addBtn.type = 'button'; addBtn.className = 'griot-editor-block__pick-btn'; addBtn.style.marginTop = '6px';
          addBtn.textContent = '+ Add item';
          addBtn.addEventListener('click', () => {
            const b2 = getBlock(this._doc, block.id);
            const its = Array.isArray(b2?.meta?.items) ? b2.meta.items : [];
            this._commit(updateBlock(this._doc, block.id, { meta: { items: [...its, { text: '', checked: false }] } }));
            requestAnimationFrame(() => { const el = this._container.querySelector(`[data-block-id="${block.id}"]`); const ins = el?.querySelectorAll('.griot-editor-checklist__text'); ins?.[ins.length - 1]?.focus(); });
          });
          list.appendChild(addBtn);
        };
        renderRows(); wrap.appendChild(list);
        break;
      }

      case 'table': {
        wrap.appendChild(this._buildTableUI(block));
        break;
      }

      case 'timeline_ref': {
        const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
        [this._metaInput(block, 'eventId', 'Event ID…', { style: 'flex:1;font-family:monospace' }), this._metaInput(block, 'eventTitle', 'Display title…', { style: 'flex:2' }), this._metaInput(block, 'note', 'Note (inline ok)…', { style: 'flex:3' })].forEach(el => row.appendChild(el));
        wrap.appendChild(row);
        break;
      }

      case 'book_citation': {
        const { bookId, unitId } = block.meta ?? {};
        if (bookId) {
          const book = this._books.find(b => b.id === bookId);
          const unit = book?.units?.find(u => u.id === unitId);
          const label = document.createElement('div'); label.className = 'griot-editor-block__citation-label';
          label.textContent = book ? `📖 ${book.title} · ${unit?.label ?? '—'}` : '📖 Book not found';
          wrap.appendChild(label);
        }
        wrap.appendChild(this._metaTextarea(block, 'quote', 'Quoted passage…', { rows: 2 }));
        wrap.appendChild(this._metaTextarea(block, 'note', 'Commentary (inline syntax ok)…', { rows: 2 }));
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

      // Checklist shortcut creates a checklist block (text=null)
      if (sc.type === 'checklist') {
        this._commit(updateBlock(this._doc, blockId, { type: 'checklist', meta: { items: [{ text: '', checked: false }] } }));
        requestAnimationFrame(() => {
          const el = this._container.querySelector(`[data-block-id="${blockId}"]`);
          el?.querySelector('.griot-editor-checklist__text')?.focus();
        });
        return;
      }

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

  // ── URL paste detection ──────────────────────────────────────────────────────

  _onPaste(blockId, editable, e) {
    const pasted = e.clipboardData?.getData('text/plain')?.trim();
    if (!pasted || !/^https?:\/\/[^\s]{4,}$/.test(pasted)) return;
    const current = editable.textContent.trim();
    if (current !== '' && current !== pasted) return;
    const block = getBlock(this._doc, blockId);
    if (!block) return;

    if (/\.(jpe?g|png|webp|gif|avif|svg|bmp|tiff?)(\?[^#]*)?$/i.test(pasted)) {
      e.preventDefault();
      this._commit(updateBlock(this._doc, blockId, { type: 'image', meta: { src: pasted, alt: '', caption: '', width: 'full' } }));
      return;
    }
    const yt = pasted.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (yt) {
      e.preventDefault();
      this._commit(updateBlock(this._doc, blockId, { type: 'video', meta: { src: pasted, embedUrl: `https://www.youtube.com/embed/${yt[1]}?rel=0`, caption: '' } }));
      return;
    }
    const vm = pasted.match(/vimeo\.com\/(\d+)/);
    if (vm) {
      e.preventDefault();
      this._commit(updateBlock(this._doc, blockId, { type: 'video', meta: { src: pasted, embedUrl: `https://player.vimeo.com/video/${vm[1]}`, caption: '' } }));
      return;
    }
    const sp = pasted.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
    if (sp) {
      e.preventDefault();
      this._commit(updateBlock(this._doc, blockId, { type: 'audio', meta: { src: pasted, embedUrl: `https://open.spotify.com/embed/${sp[1]}/${sp[2]}`, caption: '' } }));
      return;
    }
    if (pasted.includes('soundcloud.com/')) {
      e.preventDefault();
      this._commit(updateBlock(this._doc, blockId, { type: 'audio', meta: { src: pasted, embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(pasted)}&color=%236366f1&auto_play=false`, caption: '' } }));
      return;
    }
    if (/\.(mp4|webm|mov|ogv)(\?[^#]*)?$/i.test(pasted)) {
      e.preventDefault();
      this._commit(updateBlock(this._doc, blockId, { type: 'video', meta: { src: pasted, caption: '' } }));
      return;
    }
    if (/\.(mp3|wav|ogg|m4a|aac|flac)(\?[^#]*)?$/i.test(pasted)) {
      e.preventDefault();
      this._commit(updateBlock(this._doc, blockId, { type: 'audio', meta: { src: pasted, caption: '' } }));
      return;
    }
    if (block.type === 'paragraph' && current === '') {
      e.preventDefault();
      this._commit(updateBlock(this._doc, blockId, { type: 'embed', meta: { src: pasted, height: 400, caption: '' } }));
    }
  }

  // ── Upload helpers ────────────────────────────────────────────────────────────

  async _uploadFiles(files) {
    if (!files.length) return [];
    if (typeof this._options.onUpload === 'function') {
      const results = await Promise.allSettled(files.map(f => this._options.onUpload(f)));
      return results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    }
    const url = this._options.uploadUrl ?? UPLOAD_URL_DEFAULT;
    const fd  = new FormData();
    files.forEach(f => fd.append('file', f));
    try {
      const res  = await fetch(url, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Upload failed');
      return (data.files ?? []).filter(f => !f.error);
    } catch (err) {
      console.error('[Editor] upload failed:', err);
      return [];
    }
  }

  async _galleryUpload(blockId, files) {
    const b = getBlock(this._doc, blockId);
    if (!b) return;
    const placeholders = files.map(() => ({ _uploading: true }));
    this._commit(updateBlock(this._doc, blockId, { meta: { items: [...(b.meta?.items ?? []), ...placeholders] } }));
    try {
      const results = await this._uploadFiles(files);
      const b2 = getBlock(this._doc, blockId);
      if (!b2) return;
      const cleaned  = (b2.meta?.items ?? []).filter(it => !it._uploading);
      const newItems = results.map(r => ({ src: r.url ?? r.src ?? '', url: r.url ?? r.src ?? '', alt: r.alt_text ?? '', caption: r.caption ?? '' }));
      this._commit(updateBlock(this._doc, blockId, { meta: { items: [...cleaned, ...newItems] } }));
    } catch {
      const b2 = getBlock(this._doc, blockId);
      if (!b2) return;
      this._commit(updateBlock(this._doc, blockId, { meta: { items: (b2.meta?.items ?? []).filter(it => !it._uploading) } }));
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

// ─── Editor style injection ───────────────────────────────────────────────────
// Styles for gallery editor UI, columns editor, checklist editor, audio preview.
// Injected once; the base editor styles (griot-editor-block, etc.) live in
// the project's griot.css.

let _editorStylesInjected = false;
function _injectEditorStyles() {
  if (_editorStylesInjected || typeof document === 'undefined') return;
  _editorStylesInjected = true;
  const s = document.createElement('style');
  s.id = 'griot-editor-extra-styles';
  s.textContent = `
/* ── Gallery editor ─────────────────────────────────────────────────────── */
.griot-editor-gallery__thumbs { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:8px; margin-bottom:10px; }
.griot-editor-gallery__thumb { position:relative; border-radius:8px; overflow:hidden; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); }
.griot-editor-gallery__thumb img { width:100%; aspect-ratio:4/3; object-fit:cover; display:block; }
.griot-editor-gallery__thumb-caption { width:100%; box-sizing:border-box; background:none; border:none; border-top:1px solid rgba(255,255,255,0.08); color:#94a3b8; font-size:11px; padding:4px 6px; font-family:inherit; }
.griot-editor-gallery__thumb-caption:focus { outline:none; color:#e2e8f0; }
.griot-editor-gallery__thumb-remove { position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.6); border:none; color:#f87171; font-size:13px; width:22px; height:22px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity 0.15s; }
.griot-editor-gallery__thumb:hover .griot-editor-gallery__thumb-remove { opacity:1; }
.griot-editor-gallery__thumb.is-uploading { display:flex; align-items:center; justify-content:center; min-height:80px; }
.griot-editor-gallery__thumb-spinner { width:20px; height:20px; border:2px solid rgba(99,102,241,0.25); border-top-color:#6366f1; border-radius:50%; animation:griotSpin 0.7s linear infinite; }
@keyframes griotSpin { to { transform:rotate(360deg); } }
.griot-editor-gallery__add-row { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px; align-items:center; }
.griot-editor-gallery__layout-row { display:flex; align-items:center; gap:6px; }
.griot-editor-gallery__layout-label { font-size:11px; color:#475569; }
.griot-editor-gallery__layout-btn { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.10); border-radius:5px; color:#64748b; padding:3px 10px; font-size:12px; cursor:pointer; font-family:inherit; transition:background 0.15s,color 0.15s; }
.griot-editor-gallery__layout-btn:hover { background:rgba(99,102,241,0.10); color:#a5b4fc; }
.griot-editor-gallery__layout-btn.is-active { background:rgba(99,102,241,0.18); border-color:rgba(99,102,241,0.5); color:#a5b4fc; }

/* ── Audio editor ───────────────────────────────────────────────────────── */
.griot-editor-block__audio-preview { width:100%; height:80px; border:none; display:block; margin-bottom:8px; border-radius:8px; }
.griot-editor-block__audio-native { width:100%; display:block; margin-bottom:8px; }

/* ── Embed editor ───────────────────────────────────────────────────────── */
.griot-editor-block__embed-preview { width:100%; display:block; margin-bottom:8px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); }

/* ── Columns editor ─────────────────────────────────────────────────────── */
.griot-editor-columns { display:grid; grid-template-columns:repeat(var(--griot-col-count,2),1fr); gap:12px; margin-bottom:8px; }
.griot-editor-columns__col { display:flex; flex-direction:column; gap:4px; }
.griot-editor-columns__editable { min-height:60px; padding:8px 10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.10); border-radius:6px; color:#e2e8f0; font-size:13px; line-height:1.6; outline:none; }
.griot-editor-columns__editable:empty::before { content:attr(data-placeholder); color:#334155; pointer-events:none; }
.griot-editor-columns__editable:focus { border-color:rgba(99,102,241,0.45); }
.griot-editor-columns__preview { font-size:12px; color:#64748b; padding:4px 2px; min-height:0; line-height:1.5; }
.griot-editor-columns__preview:empty { display:none; }
.griot-editor-columns__controls { display:flex; gap:6px; margin-top:4px; }

/* ── Checklist editor ───────────────────────────────────────────────────── */
.griot-editor-checklist { display:flex; flex-direction:column; gap:4px; }
.griot-editor-checklist__row { display:flex; align-items:center; gap:6px; }
.griot-editor-checklist__cb { flex-shrink:0; width:15px; height:15px; accent-color:#6366f1; cursor:pointer; }
.griot-editor-checklist__text { flex:1; }
  `;
  document.head.appendChild(s);
}