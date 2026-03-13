// ─── GalleryRenderer.js ───────────────────────────────────────────────────────
// Renders a gallery of image items in one of four layouts.
// All layouts open the shared lightbox singleton on click.
//
// Usage:
//   import { renderGallery } from './GalleryRenderer.js';
//   const el = renderGallery(items, 'carousel');
//   container.appendChild(el);
//
// items shape: { src?, url?, alt?, alt_text?, caption? }[]
// layouts: 'grid' | 'masonry' | 'carousel' | 'strip'
// ─────────────────────────────────────────────────────────────────────────────

import { lightbox } from '../viewer/Lightbox.js';

const VALID_LAYOUTS = new Set(['grid', 'masonry', 'carousel', 'strip']);

// ── Public ────────────────────────────────────────────────────────────────────

/**
 * Render a gallery element.
 * @param {object[]} items
 * @param {'grid'|'masonry'|'carousel'|'strip'} layout
 * @returns {HTMLElement}
 */
export function renderGallery(items = [], layout = 'grid') {
  _injectStyles();

  const l    = VALID_LAYOUTS.has(layout) ? layout : 'grid';
  const wrap = document.createElement('div');
  wrap.className      = `griot-gallery griot-gallery--${l}`;
  wrap.dataset.layout = l;

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className   = 'griot-gallery__empty';
    empty.textContent = 'No images yet';
    wrap.appendChild(empty);
    return wrap;
  }

  switch (l) {
    case 'carousel': return _carousel(items, wrap);
    case 'masonry':  return _masonry(items, wrap);
    case 'strip':    return _strip(items, wrap);
    default:         return _grid(items, wrap);
  }
}

// ── Grid ──────────────────────────────────────────────────────────────────────

function _grid(items, wrap) {
  items.forEach((item, i) => {
    const el  = _itemEl(item, i, items);
    el.className = 'griot-gallery__item griot-gallery__item--grid';
    wrap.appendChild(el);
  });
  return wrap;
}

// ── Masonry ───────────────────────────────────────────────────────────────────

function _masonry(items, wrap) {
  items.forEach((item, i) => {
    const el  = _itemEl(item, i, items);
    el.className = 'griot-gallery__item griot-gallery__item--masonry';
    wrap.appendChild(el);
  });
  return wrap;
}

// ── Strip ─────────────────────────────────────────────────────────────────────

function _strip(items, wrap) {
  const inner = document.createElement('div');
  inner.className = 'griot-gallery__strip-inner';

  items.forEach((item, i) => {
    const el = _itemEl(item, i, items);
    el.className = 'griot-gallery__item griot-gallery__item--strip';
    inner.appendChild(el);
  });

  wrap.appendChild(inner);
  return wrap;
}

// ── Shared item element (grid / masonry / strip) ──────────────────────────────

function _itemEl(item, index, allItems) {
  const el  = document.createElement('div');

  const img = document.createElement('img');
  img.src      = item.src  ?? item.url      ?? '';
  img.alt      = item.alt  ?? item.alt_text ?? item.caption ?? '';
  img.loading  = index < 6 ? 'eager' : 'lazy';
  img.decoding = 'async';
  img.draggable = false;

  img.addEventListener('click', () => lightbox.open(allItems, index));

  el.appendChild(img);

  if (item.caption) {
    const cap = document.createElement('p');
    cap.className   = 'griot-gallery__caption';
    cap.textContent = item.caption;
    el.appendChild(cap);
  }

  return el;
}

// ── Carousel ──────────────────────────────────────────────────────────────────

function _carousel(items, wrap) {
  let idx = 0;

  // ── DOM structure ────────────────────────────────────────────────────────
  //  .griot-carousel__viewport  (clips)
  //    .griot-carousel__track   (slides)
  //      .griot-carousel__slide × N
  //  .griot-carousel__controls  (prev · counter · next)
  //  .griot-carousel__dots      (dot buttons, hidden if > 12 items)

  const viewport = document.createElement('div');
  viewport.className = 'griot-carousel__viewport';

  const track = document.createElement('div');
  track.className = 'griot-carousel__track';

  items.forEach((item, i) => {
    const slide = document.createElement('div');
    slide.className = 'griot-carousel__slide';

    const img = document.createElement('img');
    img.src      = item.src  ?? item.url      ?? '';
    img.alt      = item.alt  ?? item.alt_text ?? item.caption ?? '';
    img.loading  = i === 0 ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.draggable = false;

    // Click on carousel image → open lightbox at CURRENT idx (not i, since user
    // may have navigated away from the first image)
    img.addEventListener('click', () => lightbox.open(items, idx));

    slide.appendChild(img);

    if (item.caption) {
      const cap = document.createElement('p');
      cap.className   = 'griot-gallery__caption griot-carousel__caption';
      cap.textContent = item.caption;
      slide.appendChild(cap);
    }

    track.appendChild(slide);
  });

  viewport.appendChild(track);

  // Controls bar
  const controls = document.createElement('div');
  controls.className = 'griot-carousel__controls';

  const prevBtn = _carBtn('‹', 'griot-carousel__btn griot-carousel__btn--prev', 'Previous');
  const nextBtn = _carBtn('›', 'griot-carousel__btn griot-carousel__btn--next', 'Next');
  const counter = document.createElement('span');
  counter.className = 'griot-carousel__counter';

  controls.append(prevBtn, counter, nextBtn);

  // Dot strip
  const dots = document.createElement('div');
  dots.className = 'griot-carousel__dots';

  const dotEls = items.map((_, i) => {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'griot-carousel__dot';
    d.setAttribute('aria-label', `Image ${i + 1}`);
    d.addEventListener('click', () => goTo(i));
    dots.appendChild(d);
    return d;
  });

  // ── Navigation logic ──────────────────────────────────────────────────────

  function goTo(n, animate = true) {
    idx = Math.max(0, Math.min(n, items.length - 1));

    if (!animate) {
      track.style.transition = 'none';
      requestAnimationFrame(() => { track.style.transition = ''; });
    }

    track.style.transform = `translateX(-${idx * 100}%)`;
    counter.textContent   = `${idx + 1} / ${items.length}`;

    prevBtn.disabled = items.length <= 1;
    nextBtn.disabled = items.length <= 1;
    prevBtn.classList.toggle('is-edge', idx === 0);
    nextBtn.classList.toggle('is-edge', idx === items.length - 1);

    dotEls.forEach((d, i) => {
      d.classList.toggle('is-active', i === idx);
      d.setAttribute('aria-pressed', String(i === idx));
    });
  }

  prevBtn.addEventListener('click', () => goTo(idx - 1));
  nextBtn.addEventListener('click', () => goTo(idx + 1));

  // Touch / swipe on the viewport
  let touchX = 0, touchY = 0, isScrolling = null;

  viewport.addEventListener('touchstart', e => {
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
    isScrolling = null;
  }, { passive: true });

  viewport.addEventListener('touchmove', e => {
    if (isScrolling === null) {
      const dx = Math.abs(e.touches[0].clientX - touchX);
      const dy = Math.abs(e.touches[0].clientY - touchY);
      isScrolling = dy > dx;
    }
  }, { passive: true });

  viewport.addEventListener('touchend', e => {
    if (isScrolling) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) goTo(dx < 0 ? idx + 1 : idx - 1);
  }, { passive: true });

  // Keyboard when carousel has focus
  wrap.tabIndex = 0;
  wrap.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); goTo(idx - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(idx + 1); }
  });

  // Accessibility
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-roledescription', 'carousel');
  wrap.setAttribute('aria-label', `Gallery, ${items.length} images`);
  viewport.setAttribute('aria-live', 'polite');

  dots.hidden = items.length < 2 || items.length > 14;

  wrap.append(viewport, controls, dots);

  goTo(0, false); // initial position, no animation
  return wrap;
}

function _carBtn(label, className, ariaLabel) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.setAttribute('aria-label', ariaLabel);
  b.textContent = label;
  return b;
}

// ── Style injection ───────────────────────────────────────────────────────────

let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected || typeof document === 'undefined') return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.id = 'griot-gallery-styles';
  s.textContent = `
/* ── Shared gallery wrapper ─────────────────────────────────────────────── */
.griot-gallery {
  width: 100%;
  box-sizing: border-box;
}
.griot-gallery__empty {
  font-size: 13px; color: #64748b;
  padding: 24px; text-align: center;
  border: 2px dashed rgba(255,255,255,0.10); border-radius: 10px;
}
.griot-gallery__caption {
  font-size: 12px; color: #64748b;
  margin: 5px 0 0; text-align: center; line-height: 1.4;
}

/* ── Grid ───────────────────────────────────────────────────────────────── */
.griot-gallery--grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
}
.griot-gallery__item--grid {
  cursor: zoom-in;
  border-radius: 8px; overflow: hidden;
  background: rgba(255,255,255,0.04);
}
.griot-gallery__item--grid img {
  width: 100%; display: block;
  aspect-ratio: 4/3; object-fit: cover;
  transition: transform 0.22s;
}
.griot-gallery__item--grid:hover img { transform: scale(1.04); }

/* ── Masonry ────────────────────────────────────────────────────────────── */
.griot-gallery--masonry {
  columns: 2 200px; gap: 8px;
}
.griot-gallery__item--masonry {
  break-inside: avoid; margin-bottom: 8px;
  cursor: zoom-in; border-radius: 8px; overflow: hidden;
  background: rgba(255,255,255,0.04);
}
.griot-gallery__item--masonry img {
  width: 100%; display: block;
  transition: transform 0.22s;
}
.griot-gallery__item--masonry:hover img { transform: scale(1.02); }

/* ── Strip ──────────────────────────────────────────────────────────────── */
.griot-gallery--strip { overflow: hidden; }

.griot-gallery__strip-inner {
  display: flex; gap: 8px;
  overflow-x: auto; padding-bottom: 6px;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}
.griot-gallery__strip-inner::-webkit-scrollbar { height: 4px; }
.griot-gallery__strip-inner::-webkit-scrollbar-track { background: transparent; }
.griot-gallery__strip-inner::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

.griot-gallery__item--strip {
  flex-shrink: 0; scroll-snap-align: start;
  width: 180px; height: 120px;
  border-radius: 8px; overflow: hidden; cursor: zoom-in;
  background: rgba(255,255,255,0.04);
}
.griot-gallery__item--strip img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.22s;
}
.griot-gallery__item--strip:hover img { transform: scale(1.04); }

/* ── Carousel ───────────────────────────────────────────────────────────── */
.griot-gallery--carousel { outline: none; }

.griot-carousel__viewport {
  overflow: hidden; border-radius: 10px;
  background: rgba(0,0,0,0.15);
}
.griot-carousel__track {
  display: flex;
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}
.griot-carousel__slide {
  flex: 0 0 100%; min-width: 0;
  display: flex; flex-direction: column; align-items: center;
}
.griot-carousel__slide img {
  width: 100%; max-height: 420px;
  object-fit: contain; display: block;
  cursor: zoom-in; user-select: none;
}
.griot-carousel__caption {
  padding: 8px 16px 10px;
}

/* Controls bar */
.griot-carousel__controls {
  display: flex; align-items: center; justify-content: center;
  gap: 16px; margin-top: 10px;
}
.griot-carousel__btn {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px; color: #94a3b8;
  width: 34px; height: 34px; font-size: 18px; line-height: 1;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s, opacity 0.15s;
}
.griot-carousel__btn:disabled { opacity: 0.3; cursor: not-allowed; }
.griot-carousel__btn:not(:disabled):hover {
  background: rgba(99,102,241,0.20); color: #a5b4fc;
}
.griot-carousel__btn.is-edge { opacity: 0.45; }
.griot-carousel__btn.is-edge:hover { opacity: 1; }
.griot-carousel__counter { font-size: 13px; color: #64748b; min-width: 48px; text-align: center; }

/* Dots */
.griot-carousel__dots {
  display: flex; justify-content: center; gap: 6px; margin-top: 10px;
}
.griot-carousel__dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: rgba(255,255,255,0.18); border: none; padding: 0;
  cursor: pointer; transition: background 0.2s, transform 0.2s;
}
.griot-carousel__dot:hover { background: rgba(255,255,255,0.40); }
.griot-carousel__dot.is-active {
  background: #6366f1; transform: scale(1.3);
}

@media (max-width: 480px) {
  .griot-gallery--grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .griot-gallery--masonry { columns: 2; }
  .griot-gallery__item--strip { width: 140px; height: 96px; }
}
  `;
  document.head.appendChild(s);
}