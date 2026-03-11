// ─── BlockSchema.js ───────────────────────────────────────────────────────────
// The single source of truth for what block types exist, their labels,
// icons, whether they have text, and any default meta values.
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA = {
  paragraph: {
    label:     'Paragraph',
    icon:      '¶',
    hasText:   true,
    hasInline: true,
    defaultMeta: {},
    placeholder: 'Write something… **bold** *italic* `code` [[event:id|label]]',
  },
  heading: {
    label:     'Heading',
    icon:      'H',
    hasText:   true,
    hasInline: false, // headings render as plain text, no inline chips
    defaultMeta: { level: 2 },
    placeholder: 'Heading…',
  },
  blockquote: {
    label:     'Quote',
    icon:      '❝',
    hasText:   true,
    hasInline: true,
    defaultMeta: {},
    placeholder: 'Quote…',
  },
  callout: {
    label:     'Callout',
    icon:      '💡',
    hasText:   true,
    hasInline: true,
    defaultMeta: { icon: '💡' },
    placeholder: 'Callout text…',
  },
  code: {
    label:     'Code',
    icon:      '</>',
    hasText:   true,
    hasInline: false, // code blocks are raw, no inline parsing
    defaultMeta: { language: '' },
    placeholder: '// code…',
  },
  divider: {
    label:     'Divider',
    icon:      '—',
    hasText:   false,
    hasInline: false,
    defaultMeta: {},
    placeholder: null,
  },
  image: {
    label:     'Image',
    icon:      '🖼',
    hasText:   false,
    hasInline: false,
    defaultMeta: { src: '', alt: '', caption: '' },
    placeholder: null,
  },
  timeline_ref: {
    label:     'Timeline Event',
    icon:      '⏱',
    hasText:   false,
    hasInline: false,
    defaultMeta: { eventId: '', eventTitle: '', note: '' },
    placeholder: null,
  },
  book_citation: {
    label:     'Book Citation',
    icon:      '📖',
    hasText:   false,
    hasInline: false,
    defaultMeta: { bookId: '', unitId: '', quote: '', note: '' },
    placeholder: null,
  },
};

export function getBlockDef(type) {
  return SCHEMA[type] ?? SCHEMA.paragraph;
}

export function getAllTypes() {
  return Object.keys(SCHEMA);
}

// Returns default meta for a type (shallow copy)
export function defaultMeta(type) {
  return { ...(SCHEMA[type]?.defaultMeta ?? {}) };
}

export default SCHEMA;
