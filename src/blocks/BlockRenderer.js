// ─── BlockRenderer.js ─────────────────────────────────────────────────────────
// Renders a single block to a DOM element.
// Used by both Viewer (read-only) and Editor (preview layer).
//
// Options:
//   books         — array of parsed book objects (for book_citation)
//   onEventClick  — (eventId) => void
//   onCiteClick   — (blockId) => void
//   editable      — if true, skips event listeners (Editor manages them)
// ─────────────────────────────────────────────────────────────────────────────

import { anchorId }                             from '../core/Block.js';
import { renderInlineToDOM, renderInlineToHTML, escHtml, escAttr } from '../inline/InlineRenderer.js';
import { getBlockDef }                          from './BlockSchema.js';

// ─── Public entry point ───────────────────────────────────────────────────────
export function renderBlock(block, { books = [], onEventClick, onCiteClick } = {}) {
  const el = _render(block, { books, onEventClick, onCiteClick });
  if (el) {
    el.id = anchorId(block.id);
    el.dataset.blockId = block.id;
    el.dataset.blockType = block.type;
  }
  return el;
}

// ─── Internal ─────────────────────────────────────────────────────────────────
function inlineDOM(text, opts) {
  return renderInlineToDOM(text, {
    onEventClick: opts.onEventClick,
    onCiteClick:  opts.onCiteClick,
  });
}

function _render(block, opts) {
  const { text, meta = {}, type } = block;

  switch (type) {

    case 'paragraph': {
      const el = document.createElement('p');
      el.className = 'griot-block griot-paragraph';
      if (text) el.appendChild(inlineDOM(text, opts));
      return el;
    }

    case 'heading': {
      const level = Math.max(1, Math.min(6, meta.level ?? 2));
      const el = document.createElement(`h${level}`);
      el.className = `griot-block griot-heading griot-heading--${level}`;
      el.textContent = text ?? '';
      return el;
    }

    case 'blockquote': {
      const el = document.createElement('blockquote');
      el.className = 'griot-block griot-blockquote';
      if (text) el.appendChild(inlineDOM(text, opts));
      return el;
    }

    case 'callout': {
      const el    = document.createElement('div');
      const icon  = document.createElement('span');
      const body  = document.createElement('div');
      el.className   = 'griot-block griot-callout';
      icon.className = 'griot-callout__icon';
      body.className = 'griot-callout__body';
      icon.textContent = meta.icon ?? '💡';
      if (text) body.appendChild(inlineDOM(text, opts));
      el.appendChild(icon);
      el.appendChild(body);
      return el;
    }

    case 'code': {
      const pre  = document.createElement('pre');
      const code = document.createElement('code');
      pre.className  = 'griot-block griot-code';
      if (meta.language) code.className = `language-${meta.language}`;
      code.textContent = text ?? '';
      pre.appendChild(code);
      return pre;
    }

    case 'divider': {
      const el = document.createElement('hr');
      el.className = 'griot-block griot-divider';
      return el;
    }

    case 'image': {
      const figure  = document.createElement('figure');
      const img     = document.createElement('img');
      figure.className = 'griot-block griot-image';
      img.src = meta.src ?? '';
      img.alt = meta.alt ?? '';
      figure.appendChild(img);
      if (meta.caption) {
        const cap = document.createElement('figcaption');
        cap.textContent = meta.caption;
        figure.appendChild(cap);
      }
      return figure;
    }

    case 'timeline_ref': {
      const el = document.createElement('div');
      el.className = 'griot-block griot-timeline-ref';
      if (meta.eventId && opts.onEventClick) {
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        el.addEventListener('click', () => opts.onEventClick(meta.eventId));
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') opts.onEventClick(meta.eventId);
        });
      }
      el.innerHTML = `
        <span class="griot-timeline-ref__icon">⏱</span>
        <div class="griot-timeline-ref__body">
          <div class="griot-timeline-ref__title">${escHtml(meta.eventTitle || 'Timeline Event')}</div>
          ${meta.note ? `<div class="griot-timeline-ref__note">${escHtml(meta.note)}</div>` : ''}
        </div>
        ${meta.eventId ? '<span class="griot-timeline-ref__arrow">→</span>' : ''}
      `;
      return el;
    }

    case 'book_citation': {
      return _renderCitation(block, opts);
    }

    default: {
      const el = document.createElement('p');
      el.className = 'griot-block griot-paragraph';
      el.textContent = text ?? '';
      return el;
    }
  }
}

function _renderCitation(block, opts) {
  const { meta = {} } = block;
  const wrap = document.createElement('figure');
  wrap.className = 'griot-block griot-citation';

  if (!meta.bookId) {
    wrap.innerHTML = `<div class="griot-citation__empty">📖 No source selected yet</div>`;
    return wrap;
  }

  const book = (opts.books ?? []).find(b => b.id === meta.bookId);
  const unit = book?.units?.find(u => u.id === meta.unitId);

  if (!book || !unit) {
    wrap.innerHTML = `<div class="griot-citation__missing">📖 Source not found — book may have been removed</div>`;
    return wrap;
  }

  const inner = document.createElement('div');
  inner.className = 'griot-citation__inner';

  // Header
  const hdr = document.createElement('div');
  hdr.className = 'griot-citation__header';
  hdr.innerHTML = `
    <span class="griot-citation__book-icon">📖</span>
    <span class="griot-citation__book-title">${escHtml(book.title)}</span>
    ${book.author ? `<span class="griot-citation__author">${escHtml(book.author)}</span>` : ''}
    <span class="griot-citation__unit">${escHtml(unit.label)}</span>
  `;
  inner.appendChild(hdr);

  // Quote
  if (meta.quote) {
    const q = document.createElement('blockquote');
    q.className = 'griot-citation__quote';
    q.textContent = meta.quote;
    inner.appendChild(q);
  }

  // Note (supports inline syntax)
  if (meta.note) {
    const note = document.createElement('div');
    note.className = 'griot-citation__note';
    note.appendChild(inlineDOM(meta.note, opts));
    inner.appendChild(note);
  }

  wrap.appendChild(inner);

  // Content preview
  if (unit.content) {
    const preview = document.createElement('div');
    preview.className = 'griot-citation__preview';
    preview.textContent = unit.content.slice(0, 180) + (unit.content.length > 180 ? '…' : '');
    wrap.appendChild(preview);
  }

  return wrap;
}
