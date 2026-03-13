// ─── Lightbox.js ─────────────────────────────────────────────────────────────
// Singleton full-screen image viewer.
//
// Usage:
//   import { lightbox } from './Lightbox.js';
//   lightbox.open(items, startIndex);
//
// items shape: { src?, url?, alt?, alt_text?, caption? }[]
// Keyboard: ← → Escape  |  Touch: swipe left/right  |  Click backdrop: close
// ─────────────────────────────────────────────────────────────────────────────

export class Lightbox {
  constructor() {
    this._el          = null;
    this._img         = null;
    this._cap         = null;
    this._ctr         = null;
    this._prev        = null;
    this._next        = null;
    this._items       = [];
    this._idx         = 0;
    this._isOpen      = false;
    this._touchStartX = 0;
    this._onKey       = this._onKey.bind(this);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Open the lightbox at a given index into items[]. */
  open(items, startIndex = 0) {
    if (!items?.length) return;
    this._items = items;
    this._idx   = Math.max(0, Math.min(startIndex, items.length - 1));
    if (!this._el) this._build();
    this._show();
  }

  close() {
    if (!this._isOpen) return;
    document.removeEventListener('keydown', this._onKey);
    this._el.classList.remove('griot-lb--open');
    document.body.style.overflow = '';
    this._isOpen = false;
    // Wait for CSS fade-out before hiding from layout
    setTimeout(() => {
      if (!this._isOpen && this._el) this._el.hidden = true;
    }, 270);
  }

  // ── Build DOM ───────────────────────────────────────────────────────────────

  _build() {
    const el = document.createElement('div');
    el.className = 'griot-lb';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Image viewer');

    // Backdrop click
    el.addEventListener('click', e => { if (e.target === el) this.close(); });

    // Close button
    const close = _mkBtn('✕', 'griot-lb__close', 'Close');
    close.addEventListener('click', () => this.close());

    // Prev / Next
    const prev = _mkBtn('‹', 'griot-lb__nav griot-lb__nav--prev', 'Previous image');
    const next = _mkBtn('›', 'griot-lb__nav griot-lb__nav--next', 'Next image');
    prev.addEventListener('click', e => { e.stopPropagation(); this._move(-1); });
    next.addEventListener('click', e => { e.stopPropagation(); this._move(1);  });

    // Stage: image + caption
    const stage = document.createElement('div');
    stage.className = 'griot-lb__stage';
    stage.addEventListener('click', e => e.stopPropagation());

    const img = document.createElement('img');
    img.className = 'griot-lb__img';
    img.alt = '';
    img.draggable = false;

    const cap = document.createElement('p');
    cap.className = 'griot-lb__caption';

    stage.append(img, cap);

    // Counter
    const ctr = document.createElement('div');
    ctr.className = 'griot-lb__counter';

    // Thumbnail strip (hidden until > 1 item)
    const strip = document.createElement('div');
    strip.className = 'griot-lb__strip';

    el.append(close, prev, next, stage, ctr, strip);

    // Touch swipe
    el.addEventListener('touchstart', e => {
      this._touchStartX = e.touches[0].clientX;
    }, { passive: true });
    el.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - this._touchStartX;
      if (Math.abs(dx) > 50) this._move(dx < 0 ? 1 : -1);
    }, { passive: true });

    document.body.appendChild(el);

    this._el    = el;
    this._img   = img;
    this._cap   = cap;
    this._ctr   = ctr;
    this._prev  = prev;
    this._next  = next;
    this._strip = strip;

    // Inject styles once
    _injectStyles();
  }

  // ── Visibility ──────────────────────────────────────────────────────────────

  _show() {
    this._isOpen = true;
    this._el.hidden = false;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', this._onKey);

    // Double rAF ensures the hidden→visible transition actually runs
    requestAnimationFrame(() =>
      requestAnimationFrame(() => this._el.classList.add('griot-lb--open'))
    );

    this._buildStrip();
    this._update();
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  _move(dir) {
    if (this._items.length <= 1) return;
    this._idx = (this._idx + dir + this._items.length) % this._items.length;
    this._update();
  }

  // ── Render current item ─────────────────────────────────────────────────────

  _update() {
    const item = this._items[this._idx];
    if (!item) return;

    const src = item.src ?? item.url ?? '';
    const alt = item.alt ?? item.alt_text ?? '';
    const cap = item.caption ?? '';

    // Fade-swap: fade out → preload → set src → fade in
    this._img.style.opacity = '0';
    this._img.alt = alt;

    const done = () => { this._img.src = src; this._img.style.opacity = '1'; };
    const tmp  = new Image();
    tmp.onload  = done;
    tmp.onerror = done;
    tmp.src = src;

    this._cap.textContent = cap;
    this._cap.hidden = !cap;

    const single = this._items.length <= 1;
    this._prev.hidden = single;
    this._next.hidden = single;
    this._ctr.textContent = single ? '' : `${this._idx + 1} / ${this._items.length}`;

    // Sync strip active thumb
    this._strip.querySelectorAll('.griot-lb__thumb').forEach((th, i) => {
      th.classList.toggle('is-active', i === this._idx);
    });
  }

  // ── Thumbnail strip (built once per open() call) ────────────────────────────

  _buildStrip() {
    this._strip.innerHTML = '';
    if (this._items.length < 2 || this._items.length > 24) {
      this._strip.hidden = true;
      return;
    }
    this._strip.hidden = false;

    this._items.forEach((item, i) => {
      const th  = document.createElement('button');
      th.type = 'button';
      th.className = `griot-lb__thumb${i === this._idx ? ' is-active' : ''}`;
      th.setAttribute('aria-label', `Image ${i + 1}`);

      const img = document.createElement('img');
      img.src = item.src ?? item.url ?? '';
      img.alt = '';
      img.loading = 'lazy';
      img.draggable = false;

      th.appendChild(img);
      th.addEventListener('click', e => { e.stopPropagation(); this._idx = i; this._update(); });
      this._strip.appendChild(th);
    });
  }

  // ── Keyboard ────────────────────────────────────────────────────────────────

  _onKey(e) {
    if      (e.key === 'Escape')     { e.preventDefault(); this.close(); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); this._move(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); this._move(1); }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _mkBtn(label, className, ariaLabel) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.setAttribute('aria-label', ariaLabel);
  b.textContent = label;
  return b;
}

let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected || typeof document === 'undefined') return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.id = 'griot-lightbox-styles';
  s.textContent = `
/* ── Lightbox overlay ───────────────────────────────────────────────────── */
.griot-lb {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0,0,0,0);
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  transition: background 0.25s;
  overscroll-behavior: none;
}
.griot-lb--open { background: rgba(0,0,0,0.92); }

/* Stage */
.griot-lb__stage {
  position: relative; display: flex; flex-direction: column;
  align-items: center; max-width: 92vw; max-height: 80vh;
}
.griot-lb__img {
  max-width: 92vw; max-height: 80vh;
  object-fit: contain; border-radius: 6px;
  transition: opacity 0.18s;
  user-select: none; -webkit-user-drag: none;
}
.griot-lb__caption {
  font-size: 13px; color: #94a3b8;
  margin: 10px 0 0; text-align: center;
  max-width: 70ch; line-height: 1.5;
}

/* Nav buttons */
.griot-lb__nav {
  position: fixed; top: 50%; transform: translateY(-50%);
  background: rgba(255,255,255,0.10); border: none;
  color: #e2e8f0; font-size: 32px; line-height: 1;
  cursor: pointer; width: 52px; height: 88px;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s; z-index: 1;
}
.griot-lb__nav:hover { background: rgba(255,255,255,0.22); }
.griot-lb__nav--prev { left: 0; border-radius: 0 8px 8px 0; }
.griot-lb__nav--next { right: 0; border-radius: 8px 0 0 8px; }

/* Close */
.griot-lb__close {
  position: fixed; top: 14px; right: 18px;
  background: rgba(255,255,255,0.10); border: none;
  color: #e2e8f0; font-size: 18px; line-height: 1;
  cursor: pointer; width: 38px; height: 38px;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  transition: background 0.15s; z-index: 2;
}
.griot-lb__close:hover { background: rgba(255,255,255,0.22); }

/* Counter */
.griot-lb__counter {
  position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
  font-size: 13px; color: #64748b; letter-spacing: 0.04em;
  pointer-events: none;
}

/* Thumbnail strip */
.griot-lb__strip {
  position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 6px; max-width: 90vw;
  overflow-x: auto; padding: 4px;
}
.griot-lb__thumb {
  flex-shrink: 0; width: 52px; height: 38px;
  border: 2px solid transparent; border-radius: 4px;
  overflow: hidden; cursor: pointer; padding: 0;
  background: transparent; transition: border-color 0.15s, opacity 0.15s;
  opacity: 0.55;
}
.griot-lb__thumb:hover { opacity: 0.85; }
.griot-lb__thumb.is-active { border-color: #6366f1; opacity: 1; }
.griot-lb__thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

@media (max-width: 600px) {
  .griot-lb__nav { width: 40px; height: 64px; font-size: 24px; }
  .griot-lb__strip { display: none; }
}
  `;
  document.head.appendChild(s);
}

/** Shared singleton — import and use directly everywhere. */
export const lightbox = new Lightbox();