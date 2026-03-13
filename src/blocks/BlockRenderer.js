// ─── BlockRenderer.js ─────────────────────────────────────────────────────────
// Renders a single block → DOM element.
// Used by Viewer (read-only) and Editor preview layer.
//
// Options:
//   books        — array of book objects
//   onEventClick — (eventId) => void
//   onCiteClick  — (blockId) => void
// ─────────────────────────────────────────────────────────────────────────────

import { anchorId }                                                from '../core/Block.js';
import { renderInlineToDOM, renderInlineToHTML, escHtml, escAttr } from '../inline/InlineRenderer.js';
import { getBlockDef }                                             from './BlockSchema.js';
import { renderGallery }                                           from './GalleryRenderer.js';
import { lightbox }                                                from './Lightbox.js';

// ─── Public ───────────────────────────────────────────────────────────────────

export function renderBlock(block, opts = {}) {
  _injectStyles();
  const el = _render(block, opts);
  if (el) {
    el.id                = anchorId(block.id);
    el.dataset.blockId   = block.id;
    el.dataset.blockType = block.type;
  }
  return el;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

function il(text, opts) {
  return renderInlineToDOM(text, { onEventClick: opts.onEventClick, onCiteClick: opts.onCiteClick });
}

function _render(block, opts) {
  const { text = '', meta = {}, type } = block;

  switch (type) {

    // ── Text ──────────────────────────────────────────────────────────────────

    case 'paragraph': {
      const el = document.createElement('p');
      el.className = 'griot-block griot-paragraph';
      if (text) el.appendChild(il(text, opts));
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
      if (text) el.appendChild(il(text, opts));
      return el;
    }

    case 'callout':
    case 'callout_warning':
    case 'callout_tip':
    case 'callout_danger': {
      const ICONS = { callout:'💡', callout_warning:'⚠️', callout_tip:'✅', callout_danger:'🚨' };
      const el   = document.createElement('div');
      const icon = document.createElement('span');
      const body = document.createElement('div');
      el.className   = `griot-block griot-callout griot-callout--${type.replace('callout_','') || 'info'}`;
      icon.className = 'griot-callout__icon';
      body.className = 'griot-callout__body';
      icon.textContent = meta.icon ?? ICONS[type] ?? '💡';
      if (text) body.appendChild(il(text, opts));
      el.append(icon, body);
      return el;
    }

    case 'code': {
      const pre  = document.createElement('pre');
      const code = document.createElement('code');
      pre.className = 'griot-block griot-code';
      if (meta.language) { pre.dataset.language = meta.language; code.className = `language-${meta.language}`; }
      code.textContent = text ?? '';
      pre.appendChild(code);
      return pre;
    }

    case 'list_ul':
    case 'list_ol': {
      const tag = type === 'list_ul' ? 'ul' : 'ol';
      const el  = document.createElement(tag);
      el.className = `griot-block griot-list griot-list--${tag}`;
      for (const item of (text ?? '').split('\n').filter(l => l.trim())) {
        const li = document.createElement('li');
        li.appendChild(il(item, opts));
        el.appendChild(li);
      }
      return el;
    }

    // ── Checklist ─────────────────────────────────────────────────────────────

    case 'checklist': {
      const items = Array.isArray(meta.items) ? meta.items : [];
      const el = document.createElement('ul');
      el.className = 'griot-block griot-checklist';

      for (const item of items) {
        const li = document.createElement('li');
        li.className = `griot-checklist__item${item.checked ? ' is-checked' : ''}`;

        const cb = document.createElement('input');
        cb.type      = 'checkbox';
        cb.checked   = !!item.checked;
        cb.disabled  = true;
        cb.className = 'griot-checklist__checkbox';
        cb.setAttribute('aria-hidden', 'true');

        const span = document.createElement('span');
        span.className = 'griot-checklist__text';
        if (item.text) span.appendChild(il(item.text, opts));

        li.append(cb, span);
        el.appendChild(li);
      }
      return el;
    }

    // ── Media ─────────────────────────────────────────────────────────────────

    case 'image': {
      const fig = document.createElement('figure');
      fig.className = `griot-block griot-image griot-image--${meta.width ?? 'full'}`;
      if (meta.uploading) {
        const sp = document.createElement('div');
        sp.className = 'griot-media-uploading';
        sp.textContent = 'Uploading…';
        fig.appendChild(sp);
      } else if (meta.src) {
        const img = document.createElement('img');
        img.src          = meta.src;
        img.alt          = meta.alt ?? '';
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () =>
          lightbox.open([{ src: meta.src, alt: meta.alt, caption: meta.caption }], 0)
        );
        fig.appendChild(img);
        if (meta.caption) {
          const cap = document.createElement('figcaption');
          cap.textContent = meta.caption;
          fig.appendChild(cap);
        }
      }
      return fig;
    }

    case 'video': {
      const fig = document.createElement('figure');
      fig.className = 'griot-block griot-video';
      const embed = meta.embedUrl ?? _ytEmbed(meta.src) ?? _vimeoEmbed(meta.src);
      if (embed) {
        const iframe = document.createElement('iframe');
        iframe.src = embed; iframe.className = 'griot-video__iframe';
        iframe.frameBorder = '0';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        fig.appendChild(iframe);
      } else if (meta.src) {
        const v = document.createElement('video');
        v.src = meta.src; v.controls = true; v.className = 'griot-video__native';
        fig.appendChild(v);
      }
      if (meta.caption) { const c = document.createElement('figcaption'); c.textContent = meta.caption; fig.appendChild(c); }
      return fig;
    }

    case 'audio': {
      const fig = document.createElement('figure');
      fig.className = 'griot-block griot-audio';
      const embed = meta.embedUrl ?? _spotifyEmbed(meta.src) ?? _scEmbed(meta.src);
      if (embed) {
        const iframe = document.createElement('iframe');
        iframe.src = embed; iframe.className = 'griot-audio__iframe';
        iframe.frameBorder = '0';
        iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen';
        fig.appendChild(iframe);
      } else if (meta.src) {
        const a = document.createElement('audio');
        a.src = meta.src; a.controls = true; a.className = 'griot-audio__native';
        fig.appendChild(a);
      }
      if (meta.caption) { const c = document.createElement('figcaption'); c.textContent = meta.caption; fig.appendChild(c); }
      return fig;
    }

    case 'gallery': {
      const galleryEl = renderGallery(meta.items ?? [], meta.layout ?? 'grid');
      galleryEl.classList.add('griot-block');
      return galleryEl;
    }

    case 'embed': {
      const fig = document.createElement('figure');
      fig.className = 'griot-block griot-embed';
      if (meta.src) {
        const iframe = document.createElement('iframe');
        iframe.src = meta.src;
        iframe.style.height = `${meta.height ?? 400}px`;
        iframe.className = 'griot-embed__iframe';
        iframe.frameBorder = '0';
        iframe.allow = 'autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media';
        iframe.allowFullscreen = true;
        fig.appendChild(iframe);
      }
      if (meta.caption) { const c = document.createElement('figcaption'); c.textContent = meta.caption; fig.appendChild(c); }
      return fig;
    }

    // ── Structure ─────────────────────────────────────────────────────────────

    case 'columns': {
      const columns = Array.isArray(meta.columns) ? meta.columns : [{ text: '' }, { text: '' }];
      const el = document.createElement('div');
      el.className = 'griot-block griot-columns';
      el.style.setProperty('--griot-col-count', String(columns.length));

      for (const col of columns) {
        const colEl = document.createElement('div');
        colEl.className = 'griot-columns__col';
        if (col.text?.trim()) colEl.appendChild(il(col.text, opts));
        el.appendChild(colEl);
      }
      return el;
    }

    case 'table': {
      const headers  = Array.isArray(meta.headers) ? meta.headers : [];
      const rows     = Array.isArray(meta.rows)    ? meta.rows    : [];
      const colCount = Math.max(headers.length, ...rows.map(r => r.length), 1);
      const wrap  = document.createElement('div');
      wrap.className = 'griot-block griot-table-wrap';
      const table = document.createElement('table');
      table.className = 'griot-table';
      if (headers.length) {
        const thead = document.createElement('thead');
        const tr    = document.createElement('tr');
        for (let ci = 0; ci < colCount; ci++) {
          const th = document.createElement('th');
          th.appendChild(il(headers[ci] ?? '', opts));
          tr.appendChild(th);
        }
        thead.appendChild(tr); table.appendChild(thead);
      }
      const tbody = document.createElement('tbody');
      for (const row of rows) {
        const tr = document.createElement('tr');
        for (let ci = 0; ci < colCount; ci++) {
          const td = document.createElement('td');
          td.appendChild(il(row[ci] ?? '', opts));
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody); wrap.appendChild(table);
      return wrap;
    }

    case 'divider': {
      const el = document.createElement('hr');
      el.className = 'griot-block griot-divider';
      return el;
    }

    case 'timeline_ref': {
      const el = document.createElement('div');
      el.className = 'griot-block griot-timeline-ref';
      if (meta.eventId && opts.onEventClick) {
        el.setAttribute('role','button'); el.tabIndex = 0;
        el.addEventListener('click', () => opts.onEventClick(meta.eventId));
        el.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') opts.onEventClick(meta.eventId); });
      }
      el.innerHTML = `
        <span class="griot-timeline-ref__icon">⏱</span>
        <div class="griot-timeline-ref__body">
          <div class="griot-timeline-ref__title">${escHtml(meta.eventTitle||'Timeline Event')}</div>
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
      if (text) el.appendChild(il(text, opts));
      return el;
    }
  }
}

// ─── Citation renderer ────────────────────────────────────────────────────────

function _renderCitation(block, opts) {
  const { meta = {} } = block;
  const wrap = document.createElement('figure');
  wrap.className = 'griot-block griot-citation';

  if (!meta.bookId) { wrap.innerHTML = `<div class="griot-citation__empty">📖 No source selected yet</div>`; return wrap; }

  const book = (opts.books ?? []).find(b => b.id === meta.bookId);
  const unit = book?.units?.find(u => u.id === meta.unitId);
  if (!book || !unit) { wrap.innerHTML = `<div class="griot-citation__missing">📖 Source not found</div>`; return wrap; }

  const inner = document.createElement('div');
  inner.className = 'griot-citation__inner';
  inner.innerHTML = `
    <div class="griot-citation__header">
      <span class="griot-citation__book-icon">📖</span>
      <span class="griot-citation__book-title">${escHtml(book.title)}</span>
      ${book.author ? `<span class="griot-citation__author">${escHtml(book.author)}</span>` : ''}
      <span class="griot-citation__unit">${escHtml(unit.label)}</span>
    </div>
    ${meta.quote ? `<blockquote class="griot-citation__quote">${escHtml(meta.quote)}</blockquote>` : ''}
  `;
  if (meta.note) {
    const note = document.createElement('div');
    note.className = 'griot-citation__note';
    note.appendChild(renderInlineToDOM(meta.note, opts));
    inner.appendChild(note);
  }
  wrap.appendChild(inner);
  return wrap;
}

// ─── Embed URL helpers ────────────────────────────────────────────────────────

function _ytEmbed(src) {
  if (!src) return null;
  const m = src.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}?rel=0` : null;
}
function _vimeoEmbed(src) {
  if (!src) return null;
  const m = src.match(/vimeo\.com\/(\d+)/);
  return m ? `https://player.vimeo.com/video/${m[1]}` : null;
}
function _spotifyEmbed(src) {
  if (!src) return null;
  const m = src.match(/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}` : null;
}
function _scEmbed(src) {
  if (!src) return null;
  if (src.includes('soundcloud.com/'))
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(src)}&color=%236366f1&auto_play=false&hide_related=true&show_comments=false`;
  return null;
}

export { _ytEmbed as resolveYouTube, _vimeoEmbed as resolveVimeo, _spotifyEmbed as resolveSpotify, _scEmbed as resolveSoundCloud };

// ─── Style injection ──────────────────────────────────────────────────────────

let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected || typeof document === 'undefined') return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.id = 'griot-block-styles';
  s.textContent = `
/* ── Checklist ──────────────────────────────────────────────────────────── */
.griot-checklist { list-style:none; padding:0; margin:0; }
.griot-checklist__item { display:flex; align-items:baseline; gap:10px; padding:3px 0; line-height:1.6; }
.griot-checklist__checkbox { flex-shrink:0; width:15px; height:15px; margin:0; accent-color:#6366f1; cursor:default; position:relative; top:2px; }
.griot-checklist__text { flex:1; }
.griot-checklist__item.is-checked .griot-checklist__text { text-decoration:line-through; opacity:0.45; }

/* ── Columns ─────────────────────────────────────────────────────────────── */
.griot-columns { display:grid; grid-template-columns:repeat(var(--griot-col-count,2),1fr); gap:24px; align-items:start; }
.griot-columns__col { min-width:0; line-height:1.7; }
@media (max-width:640px) { .griot-columns { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(s);
}