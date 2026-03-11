// ─── BlockSchema.js ───────────────────────────────────────────────────────────
const SCHEMA = {
  paragraph:       { label: 'Paragraph',      icon: '¶',   hasText: true,  hasInline: true,  defaultMeta: {},                                              placeholder: 'Write something… **bold** *italic* `code` ==highlight== [[event:id|label]]' },
  heading:         { label: 'Heading',         icon: 'H',   hasText: true,  hasInline: false, defaultMeta: { level: 2 },                                    placeholder: 'Heading…' },
  blockquote:      { label: 'Quote',           icon: '❝',   hasText: true,  hasInline: true,  defaultMeta: {},                                              placeholder: 'Quote…' },
  callout:         { label: 'Callout',         icon: '💡',  hasText: true,  hasInline: true,  defaultMeta: { icon: '💡' },                                  placeholder: 'Callout text…' },
  callout_warning: { label: 'Warning',         icon: '⚠️',  hasText: true,  hasInline: true,  defaultMeta: { icon: '⚠️' },                                  placeholder: 'Warning message…' },
  callout_tip:     { label: 'Tip',             icon: '✅',  hasText: true,  hasInline: true,  defaultMeta: { icon: '✅' },                                  placeholder: 'Tip or note…' },
  callout_danger:  { label: 'Danger',          icon: '🚨',  hasText: true,  hasInline: true,  defaultMeta: { icon: '🚨' },                                  placeholder: 'Critical warning…' },
  code:            { label: 'Code',            icon: '</>',  hasText: true,  hasInline: false, defaultMeta: { language: '' },                               placeholder: '// code…' },
  list_ul:         { label: 'Bullet List',     icon: '•',   hasText: true,  hasInline: false, defaultMeta: {},                                              placeholder: 'Item 1\nItem 2\nItem 3' },
  list_ol:         { label: 'Numbered List',   icon: '1.',  hasText: true,  hasInline: false, defaultMeta: {},                                              placeholder: 'First item\nSecond item' },
  table:           { label: 'Table',           icon: '⊞',   hasText: false, hasInline: false, defaultMeta: { headers: ['Column 1', 'Column 2'], rows: [['', '']] }, placeholder: null },
  divider:         { label: 'Divider',         icon: '—',   hasText: false, hasInline: false, defaultMeta: {},                                              placeholder: null },
  image:           { label: 'Image',           icon: '🖼',  hasText: false, hasInline: false, defaultMeta: { src: '', alt: '', caption: '' },               placeholder: null },
  video:           { label: 'Video',           icon: '▶',   hasText: false, hasInline: false, defaultMeta: { src: '', caption: '' },                        placeholder: null },
  timeline_ref:    { label: 'Timeline Event',  icon: '⏱',  hasText: false, hasInline: false, defaultMeta: { eventId: '', eventTitle: '', note: '' },        placeholder: null },
  book_citation:   { label: 'Book Citation',   icon: '📖',  hasText: false, hasInline: false, defaultMeta: { bookId: '', unitId: '', quote: '', note: '' }, placeholder: null },
};

export function getBlockDef(type) { return SCHEMA[type] ?? SCHEMA.paragraph; }
export function getAllTypes()      { return Object.keys(SCHEMA); }
export function defaultMeta(type) { return { ...(SCHEMA[type]?.defaultMeta ?? {}) }; }
export default SCHEMA;