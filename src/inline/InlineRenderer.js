// ─── InlineRenderer.js ────────────────────────────────────────────────────────
// Renders inline token arrays to either:
//   a) A DocumentFragment (DOM nodes) — used by Viewer and Editor live preview
//   b) An HTML string                 — used for SSR / export
//
// Callbacks:
//   onEventClick(eventId)  — called when an [[event:]] chip is clicked
//   onCiteClick(blockId)   — called when a [[cite:]] chip is clicked
// ─────────────────────────────────────────────────────────────────────────────

import { tokenizeInline, TOKEN } from './InlineLexer.js';

// ─── DOM rendering ────────────────────────────────────────────────────────────
export function renderInlineToDOM(text = '', { onEventClick, onCiteClick } = {}) {
  const frag = document.createDocumentFragment();
  const tokens = tokenizeInline(text);

  for (const t of tokens) {
    let node;

    switch (t.type) {
      case TOKEN.TEXT:
        node = document.createTextNode(t.text);
        break;

      case TOKEN.BOLD:
        node = document.createElement('strong');
        node.textContent = t.text;
        break;

      case TOKEN.ITALIC:
        node = document.createElement('em');
        node.textContent = t.text;
        break;

      case TOKEN.CODE: {
        node = document.createElement('code');
        node.className = 'griot-inline-code';
        node.textContent = t.text;
        break;
      }

      case TOKEN.LINK: {
        node = document.createElement('a');
        node.href   = t.href;
        node.target = '_blank';
        node.rel    = 'noopener noreferrer';
        node.className = 'griot-link';
        node.textContent = t.text;
        break;
      }

      case TOKEN.EVENT_REF: {
        node = document.createElement('button');
        node.type      = 'button';
        node.className = 'griot-chip griot-chip--event';
        node.dataset.eventId = t.eventId;
        node.innerHTML = `<span class="griot-chip__icon">⏱</span><span class="griot-chip__label">${escHtml(t.label)}</span>`;
        if (onEventClick) {
          node.addEventListener('click', (e) => {
            e.stopPropagation();
            onEventClick(t.eventId);
          });
        }
        break;
      }

      case TOKEN.CITE_REF: {
        node = document.createElement('button');
        node.type      = 'button';
        node.className = 'griot-chip griot-chip--cite';
        node.dataset.blockId = t.blockId;
        node.innerHTML = `<span class="griot-chip__icon">📖</span><span class="griot-chip__label">${escHtml(t.label)}</span>`;
        if (onCiteClick) {
          node.addEventListener('click', (e) => {
            e.stopPropagation();
            onCiteClick(t.blockId);
          });
        }
        break;
      }

      default:
        node = document.createTextNode(t.text ?? '');
    }

    frag.appendChild(node);
  }

  return frag;
}

// ─── HTML string rendering ────────────────────────────────────────────────────
export function renderInlineToHTML(text = '') {
  const tokens = tokenizeInline(text);
  let html = '';

  for (const t of tokens) {
    switch (t.type) {
      case TOKEN.TEXT:      html += escHtml(t.text);                                                   break;
      case TOKEN.BOLD:      html += `<strong>${escHtml(t.text)}</strong>`;                             break;
      case TOKEN.ITALIC:    html += `<em>${escHtml(t.text)}</em>`;                                     break;
      case TOKEN.CODE:      html += `<code class="griot-inline-code">${escHtml(t.text)}</code>`;       break;
      case TOKEN.LINK:      html += `<a class="griot-link" href="${escAttr(t.href)}" target="_blank" rel="noopener noreferrer">${escHtml(t.text)}</a>`; break;
      case TOKEN.EVENT_REF: html += `<button type="button" class="griot-chip griot-chip--event" data-event-id="${escAttr(t.eventId)}"><span class="griot-chip__icon">⏱</span><span class="griot-chip__label">${escHtml(t.label)}</span></button>`; break;
      case TOKEN.CITE_REF:  html += `<button type="button" class="griot-chip griot-chip--cite"  data-block-id="${escAttr(t.blockId)}"><span class="griot-chip__icon">📖</span><span class="griot-chip__label">${escHtml(t.label)}</span></button>`;  break;
      default:              html += escHtml(t.text ?? '');
    }
  }

  return html;
}

// ─── Escape helpers ───────────────────────────────────────────────────────────
export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}
