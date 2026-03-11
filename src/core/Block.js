// ─── Block.js ─────────────────────────────────────────────────────────────────
// Pure block primitives. No schema dependency, no document awareness.
// ─────────────────────────────────────────────────────────────────────────────

let _seq = 0;
const uid = () => `b_${Date.now().toString(36)}_${(++_seq).toString(36)}`;

/** Block types that carry a text field (editable as plain text). */
export const TEXT_TYPES = new Set([
  'paragraph', 'heading', 'blockquote',
  'callout', 'callout_warning', 'callout_tip', 'callout_danger',
  'code', 'list_ul', 'list_ol',
]);

/** All known block types (informational; canonical list is BlockSchema). */
export const ALL_TYPES = [
  'paragraph', 'heading', 'blockquote',
  'callout', 'callout_warning', 'callout_tip', 'callout_danger',
  'code', 'list_ul', 'list_ol', 'table',
  'divider', 'image', 'video', 'timeline_ref', 'book_citation',
];

/**
 * Create a new block with a fresh unique id.
 * @param {string} type
 * @param {{ id?, text?, meta? }} [overrides]
 */
export function createBlock(type = 'paragraph', overrides = {}) {
  return {
    id:   overrides.id   ?? uid(),
    type,
    text: TEXT_TYPES.has(type) ? (overrides.text ?? '') : null,
    meta: overrides.meta ?? {},
  };
}

/** Deep-clone a block. Pass newId=false to keep the same id. */
export function cloneBlock(block, newId = true) {
  return { ...block, id: newId ? uid() : block.id, meta: { ...block.meta } };
}

/** True if this block type stores a text string. */
export function isTextBlock(block) {
  return TEXT_TYPES.has(block?.type);
}

/** Minimal structural validity check. */
export function isValidBlock(block) {
  return Boolean(block && typeof block.id === 'string' && typeof block.type === 'string');
}

/** DOM id attribute used to anchor/locate a block element. */
export function anchorId(blockId) {
  return `griot-block-${blockId}`;
}

/** Smooth-scroll (or jump) to a block's DOM element. */
export function scrollToBlock(blockId, behavior = 'smooth') {
  document.getElementById(anchorId(blockId))?.scrollIntoView({ behavior, block: 'center' });
}