// ─── Block.js ─────────────────────────────────────────────────────────────────
// Pure data. No DOM, no rendering. A block is a plain serialisable object.
//
// Shape:
//   { id, type, text?, meta:{} }
//
// meta holds type-specific fields:
//   heading  → meta.level (1-6)
//   callout  → meta.icon
//   code     → meta.language
//   image    → meta.src, meta.alt, meta.caption
//   divider  → (no extra fields)
//   timeline_ref  → meta.eventId, meta.eventTitle
//   book_citation → meta.bookId, meta.unitId, meta.quote, meta.note
// ─────────────────────────────────────────────────────────────────────────────

let _seq = 0;
const uid = (prefix = 'b') => `${prefix}_${Date.now()}_${(++_seq).toString(36)}`;

// TEXT_TYPES — block types that carry a user-editable `text` field
export const TEXT_TYPES = new Set([
  'paragraph', 'heading', 'blockquote', 'callout', 'code',
]);

// ALL_TYPES — exhaustive list for validation
export const ALL_TYPES = new Set([
  'paragraph', 'heading', 'blockquote', 'callout', 'code',
  'divider', 'image', 'timeline_ref', 'book_citation',
]);

// ─── Factory ──────────────────────────────────────────────────────────────────
export function createBlock(type = 'paragraph', overrides = {}) {
  if (!ALL_TYPES.has(type)) {
    console.warn(`[Griot] Unknown block type "${type}", defaulting to paragraph`);
    type = 'paragraph';
  }
  return {
    id:   uid('b'),
    type,
    text: TEXT_TYPES.has(type) ? '' : null,
    meta: {},
    ...overrides,
  };
}

export function cloneBlock(block) {
  return {
    ...block,
    id:   uid('b'),
    meta: { ...block.meta },
  };
}

// ─── Predicates ───────────────────────────────────────────────────────────────
export const isTextBlock  = (b) => TEXT_TYPES.has(b?.type);
export const isValidBlock = (b) => b && typeof b.id === 'string' && ALL_TYPES.has(b.type);

// ─── Anchor ID (stable DOM id for deep-linking) ───────────────────────────────
export const anchorId     = (blockId) => `griot-${blockId}`;
export const scrollToBlock = (blockId, behavior = 'smooth') => {
  document.getElementById(anchorId(blockId))
    ?.scrollIntoView({ behavior, block: 'center' });
};
