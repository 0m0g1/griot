// ─── InlineRenderer.js ────────────────────────────────────────────────────────
// Renders inline token arrays to either:
//   a) A DocumentFragment (DOM nodes) — used by Viewer and Editor live preview
//   b) An HTML string                 — used for SSR / export
// ─────────────────────────────────────────────────────────────────────────────

import { tokenizeInline, TOKEN } from './InlineLexer.js';

// ── DOM rendering ─────────────────────────────────────────────────────────────

export function renderInlineToDOM(text = '', { onEventClick, onCiteClick } = {}) {
  const frag = document.createDocumentFragment();
  for (const t of tokenizeInline(text)) {
    frag.appendChild(_toNode(t, { onEventClick, onCiteClick }));
  }
  return frag;
}

function _toNode(t, opts) {
  switch (t.type) {

    case TOKEN.TEXT:
      return document.createTextNode(t.text);

    case TOKEN.BOLD: {
      const el = document.createElement('strong');
      el.textContent = t.text;
      return el;
    }
    case TOKEN.ITALIC: {
      const el = document.createElement('em');
      el.textContent = t.text;
      return el;
    }
    case TOKEN.UNDERLINE: {
      const el = document.createElement('u');
      el.className = 'griot-underline';
      el.textContent = t.text;
      return el;
    }
    case TOKEN.STRIKE: {
      const el = document.createElement('s');
      el.className = 'griot-strike';
      el.textContent = t.text;
      return el;
    }
    case TOKEN.HIGHLIGHT: {
      const el = document.createElement('mark');
      el.className = 'griot-highlight';
      el.textContent = t.text;
      return el;
    }
    case TOKEN.COLOR_MARK: {
      const el = document.createElement('span');
      el.className  = 'griot-color-mark';
      el.style.color = t.color;
      el.textContent = t.text;
      return el;
    }
    case TOKEN.CODE: {
      const el = document.createElement('code');
      el.className = 'griot-inline-code';
      el.textContent = t.code;
      return el;
    }
    case TOKEN.IMAGE: {
      const el = document.createElement('img');
      el.src = t.src;
      el.alt = t.alt ?? '';
      el.className = 'griot-inline-img';
      return el;
    }
    case TOKEN.LINK: {
      const el = document.createElement('a');
      el.href      = t.href;
      el.target    = '_blank';
      el.rel       = 'noopener noreferrer';
      el.className = 'griot-link';
      el.textContent = t.label;
      return el;
    }
    case TOKEN.EVENT_REF: {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'griot-chip griot-chip--event';
      el.dataset.eventId = t.eventId;
      el.innerHTML = `<span class="griot-chip__icon">⏱</span><span class="griot-chip__label">${escHtml(t.label)}</span>`;
      if (opts.onEventClick) el.addEventListener('click', (e) => { e.stopPropagation(); opts.onEventClick(t.eventId); });
      return el;
    }
    case TOKEN.CITE_REF: {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'griot-chip griot-chip--cite';
      el.dataset.blockId = t.blockId;
      el.innerHTML = `<span class="griot-chip__icon">📖</span><span class="griot-chip__label">${escHtml(t.label)}</span>`;
      if (opts.onCiteClick) el.addEventListener('click', (e) => { e.stopPropagation(); opts.onCiteClick(t.blockId); });
      return el;
    }

    default:
      return document.createTextNode(t.text ?? '');
  }
}

// ── HTML string rendering ─────────────────────────────────────────────────────

export function renderInlineToHTML(text = '') {
  return tokenizeInline(text).map(_toHTML).join('');
}

function _toHTML(t) {
  switch (t.type) {
    case TOKEN.TEXT:       return escHtml(t.text);
    case TOKEN.BOLD:       return `<strong>${escHtml(t.text)}</strong>`;
    case TOKEN.ITALIC:     return `<em>${escHtml(t.text)}</em>`;
    case TOKEN.UNDERLINE:  return `<u class="griot-underline">${escHtml(t.text)}</u>`;
    case TOKEN.STRIKE:     return `<s class="griot-strike">${escHtml(t.text)}</s>`;
    case TOKEN.HIGHLIGHT:  return `<mark class="griot-highlight">${escHtml(t.text)}</mark>`;
    case TOKEN.COLOR_MARK: return `<span class="griot-color-mark" style="color:${escAttr(t.color)}">${escHtml(t.text)}</span>`;
    case TOKEN.CODE:       return `<code class="griot-inline-code">${escHtml(t.code)}</code>`;
    case TOKEN.IMAGE:      return `<img class="griot-inline-img" src="${escAttr(t.src)}" alt="${escAttr(t.alt ?? '')}">`;
    case TOKEN.LINK:       return `<a class="griot-link" href="${escAttr(t.href)}" target="_blank" rel="noopener noreferrer">${escHtml(t.label)}</a>`;
    case TOKEN.EVENT_REF:  return `<button type="button" class="griot-chip griot-chip--event" data-event-id="${escAttr(t.eventId)}"><span class="griot-chip__icon">⏱</span><span class="griot-chip__label">${escHtml(t.label)}</span></button>`;
    case TOKEN.CITE_REF:   return `<button type="button" class="griot-chip griot-chip--cite" data-block-id="${escAttr(t.blockId)}"><span class="griot-chip__icon">📖</span><span class="griot-chip__label">${escHtml(t.label)}</span></button>`;
    default:               return escHtml(t.text ?? '');
  }
}

// ── Escape helpers ────────────────────────────────────────────────────────────

export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escAttr(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}