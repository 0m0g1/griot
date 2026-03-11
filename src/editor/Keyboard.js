// ─── Keyboard.js ──────────────────────────────────────────────────────────────
// All keyboard behaviour for the block editor.
// Pure logic — receives the current doc + focused block ID, returns events
// the Editor class acts on.
//
// Exported: attachKeyboardHandler(el, callbacks)
//   Attaches a keydown listener to a contenteditable element for one block.
//   Calls back into Editor which owns the document state.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {HTMLElement}  el         The contenteditable element
 * @param {object}       callbacks
 *   onEnter(blockId, offset)       — Enter pressed: split at cursor offset
 *   onBackspaceAtStart(blockId)    — Backspace at offset 0: merge with prev
 *   onDeleteAtEnd(blockId)         — Delete at end: merge next into this
 *   onTab(blockId, shift)          — Tab / Shift+Tab
 *   onArrowUp(blockId)             — Arrow up at first line → move focus to prev block
 *   onArrowDown(blockId)           — Arrow down at last line → move focus to next block
 *   onUndo()                       — Ctrl/Cmd+Z
 *   onRedo()                       — Ctrl/Cmd+Shift+Z or Ctrl+Y
 */
export function attachKeyboardHandler(el, blockId, callbacks) {
  el.addEventListener('keydown', (e) => {
    const {
      onEnter, onBackspaceAtStart, onDeleteAtEnd,
      onTab, onArrowUp, onArrowDown, onUndo, onRedo,
    } = callbacks;

    const ctrl = e.ctrlKey || e.metaKey;

    // ── Undo / Redo ──────────────────────────────────────────────
    if (ctrl && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      onUndo?.();
      return;
    }
    if ((ctrl && e.key === 'z' && e.shiftKey) || (ctrl && e.key === 'y')) {
      e.preventDefault();
      onRedo?.();
      return;
    }

    // ── Enter → split block ──────────────────────────────────────
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onEnter?.(blockId, getCursorOffset(el));
      return;
    }

    // ── Backspace at start → merge with previous ─────────────────
    if (e.key === 'Backspace' && getCursorOffset(el) === 0 && !hasSelection()) {
      e.preventDefault();
      onBackspaceAtStart?.(blockId);
      return;
    }

    // ── Delete at end → merge next into this ─────────────────────
    if (e.key === 'Delete' && getCursorOffset(el) === el.textContent.length && !hasSelection()) {
      e.preventDefault();
      onDeleteAtEnd?.(blockId);
      return;
    }

    // ── Tab ───────────────────────────────────────────────────────
    if (e.key === 'Tab') {
      e.preventDefault();
      onTab?.(blockId, e.shiftKey);
      return;
    }

    // ── Arrow navigation across blocks ───────────────────────────
    if (e.key === 'ArrowUp' && isAtFirstLine(el)) {
      e.preventDefault();
      onArrowUp?.(blockId);
      return;
    }
    if (e.key === 'ArrowDown' && isAtLastLine(el)) {
      e.preventDefault();
      onArrowDown?.(blockId);
      return;
    }
  });
}

// ─── Cursor helpers ───────────────────────────────────────────────────────────

/** Returns the character offset of the caret within el.textContent */
export function getCursorOffset(el) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(el);
  range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
  return range.toString().length;
}

/** Place the caret at a specific character offset within el */
export function setCursorOffset(el, offset) {
  const range = document.createRange();
  const sel   = window.getSelection();
  if (!sel) return;

  let remaining = offset;
  let found = false;

  function walk(node) {
    if (found) return;
    if (node.nodeType === Node.TEXT_NODE) {
      if (remaining <= node.textContent.length) {
        range.setStart(node, remaining);
        range.setEnd(node, remaining);
        found = true;
      } else {
        remaining -= node.textContent.length;
      }
    } else {
      for (const child of node.childNodes) walk(child);
    }
  }

  walk(el);

  if (!found) {
    // Clamp to end
    range.selectNodeContents(el);
    range.collapse(false);
  }

  sel.removeAllRanges();
  sel.addRange(range);
}

/** Focus el and place caret at end */
export function focusAtEnd(el) {
  el.focus();
  setCursorOffset(el, el.textContent.length);
}

/** Focus el and place caret at start */
export function focusAtStart(el) {
  el.focus();
  setCursorOffset(el, 0);
}

// ─── Line detection ───────────────────────────────────────────────────────────
function hasSelection() {
  const sel = window.getSelection();
  return sel && sel.type === 'Range';
}

function isAtFirstLine(el) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  const rect  = range.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  // Within 1.5x line-height from top
  return Math.abs(rect.top - elRect.top) < 30;
}

function isAtLastLine(el) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  const rect  = range.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return Math.abs(rect.bottom - elRect.bottom) < 30;
}
