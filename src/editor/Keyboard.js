// ─── Keyboard.js ─────────────────────────────────────────────────────────────
// Keyboard event handling for contenteditable editor blocks.
// Also exports cursor position helpers shared by Editor and FormatToolbar.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attach all editor keyboard shortcuts to a contenteditable element.
 *
 * Callbacks:
 *   onEnter(id, offset)       — Enter (no shift)
 *   onBackspaceAtStart(id)    — Backspace at offset 0 with no selection
 *   onDeleteAtEnd(id)         — Delete at end with no selection
 *   onTab(id, isShift)        — Tab / Shift+Tab
 *   onArrowUp(id)             — ↑ on first visual line
 *   onArrowDown(id)           — ↓ on last visual line
 *   onUndo()                  — Ctrl/Cmd+Z
 *   onRedo()                  — Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z
 *   onFormatKey(key)          — Ctrl/Cmd+B/I/U
 */
export function attachKeyboardHandler(el, blockId, callbacks = {}) {
  const {
    onEnter, onBackspaceAtStart, onDeleteAtEnd,
    onTab, onArrowUp, onArrowDown,
    onUndo, onRedo, onFormatKey,
  } = callbacks;

  el.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;

    // ── Undo / Redo ───────────────────────────────────────────────────────────
    if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); onUndo?.();  return; }
    if (ctrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); onRedo?.(); return; }

    // ── Inline format shortcuts ───────────────────────────────────────────────
    if (ctrl && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      onFormatKey?.(e.key.toLowerCase());
      return;
    }

    // ── Enter ─────────────────────────────────────────────────────────────────
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onEnter?.(blockId, getCursorOffset(el));
      return;
    }

    // ── Backspace at start ────────────────────────────────────────────────────
    if (e.key === 'Backspace' && getCursorOffset(el) === 0 && selLen(el) === 0) {
      e.preventDefault();
      onBackspaceAtStart?.(blockId);
      return;
    }

    // ── Delete at end ─────────────────────────────────────────────────────────
    if (e.key === 'Delete' && isAtEnd(el) && selLen(el) === 0) {
      e.preventDefault();
      onDeleteAtEnd?.(blockId);
      return;
    }

    // ── Tab ───────────────────────────────────────────────────────────────────
    if (e.key === 'Tab') {
      e.preventDefault();
      onTab?.(blockId, e.shiftKey);
      return;
    }

    // ── Arrow navigation between blocks ──────────────────────────────────────
    if (e.key === 'ArrowUp'   && isOnFirstLine(el)) { e.preventDefault(); onArrowUp?.(blockId); }
    if (e.key === 'ArrowDown' && isOnLastLine(el))  { e.preventDefault(); onArrowDown?.(blockId); }
  });
}

// ── Cursor offset helpers ─────────────────────────────────────────────────────

/** Character offset of the caret within `el`. */
export function getCursorOffset(el) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return 0;
  const r   = sel.getRangeAt(0);
  const pre = r.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length;
}

/** { start, end } character offsets of the current selection within `el`. */
export function getSelectionOffsets(el) {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return { start: 0, end: 0 };
  const r   = sel.getRangeAt(0);
  const pre = r.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  const start = pre.toString().length;
  const end   = start + r.toString().length;
  return { start, end };
}

/** Move the caret to `offset` characters from the start of `el`. */
export function setCursorOffset(el, offset) {
  const sel   = window.getSelection();
  const range = document.createRange();
  let rem = offset, found = false;

  (function walk(node) {
    if (found) return;
    if (node.nodeType === Node.TEXT_NODE) {
      if (rem <= node.length) {
        range.setStart(node, rem);
        range.setEnd(node, rem);
        found = true;
      } else {
        rem -= node.length;
      }
    } else {
      node.childNodes.forEach(walk);
    }
  })(el);

  if (!found) { range.selectNodeContents(el); range.collapse(false); }
  sel.removeAllRanges();
  sel.addRange(range);
}

export function focusAtEnd(el)   { el.focus(); setCursorOffset(el, el.textContent?.length ?? 0); }
export function focusAtStart(el) { el.focus(); setCursorOffset(el, 0); }

// ── Internal helpers ──────────────────────────────────────────────────────────

function selLen(el) {
  try { return window.getSelection()?.getRangeAt(0)?.toString().length ?? 0; }
  catch { return 0; }
}

function isAtEnd(el) {
  return getCursorOffset(el) >= (el.textContent?.length ?? 0);
}

function isOnFirstLine(el) {
  try {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return true;
    return sel.getRangeAt(0).getBoundingClientRect().top < el.getBoundingClientRect().top + 10;
  } catch { return true; }
}

function isOnLastLine(el) {
  try {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return true;
    return sel.getRangeAt(0).getBoundingClientRect().bottom > el.getBoundingClientRect().bottom - 10;
  } catch { return true; }
}