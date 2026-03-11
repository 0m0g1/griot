// ─── InlineLexer.js ───────────────────────────────────────────────────────────
// Tokenises inline markdown-like syntax into a flat token array.
// Runs on a single text string (the content of one block's text field).
//
// Supported syntax:
//   **bold**                     → { type:'bold',      text }
//   *italic*                     → { type:'italic',    text }
//   `code`                       → { type:'code',      text }
//   [label](url)                 → { type:'link',      text, href }
//   [[event:id|label]]           → { type:'event_ref', eventId, label }
//   [[cite:blockId|label]]       → { type:'cite_ref',  blockId, label }
//   plain text                   → { type:'text',      text }
// ─────────────────────────────────────────────────────────────────────────────

export const TOKEN = Object.freeze({
  TEXT:      'text',
  BOLD:      'bold',
  ITALIC:    'italic',
  CODE:      'code',
  LINK:      'link',
  EVENT_REF: 'event_ref',
  CITE_REF:  'cite_ref',
});

// Combined regex — order matters (longest/most-specific first)
const INLINE_RE = new RegExp(
  [
    /(\*\*(.+?)\*\*)/,                          // bold
    /(\*(.+?)\*)/,                              // italic
    /(`([^`]+)`)/,                              // inline code
    /(\[(.+?)\]\((.+?)\))/,                     // link
    /(\[\[event:([^\]|]+)(?:\|([^\]]*))?\]\])/, // event_ref
    /(\[\[cite:([^\]|]+)(?:\|([^\]]*))?\]\])/,  // cite_ref
  ].map(r => r.source).join('|'),
  'g'
);

export function tokenizeInline(text = '') {
  if (!text) return [];

  const tokens = [];
  let last = 0;
  let m;

  INLINE_RE.lastIndex = 0;

  while ((m = INLINE_RE.exec(text)) !== null) {
    // Flush plain text before this match
    if (m.index > last) {
      tokens.push({ type: TOKEN.TEXT, text: text.slice(last, m.index) });
    }

    if (m[1]) {
      // bold
      tokens.push({ type: TOKEN.BOLD, text: m[2] });
    } else if (m[3]) {
      // italic
      tokens.push({ type: TOKEN.ITALIC, text: m[4] });
    } else if (m[5]) {
      // inline code
      tokens.push({ type: TOKEN.CODE, text: m[6] });
    } else if (m[7]) {
      // link
      tokens.push({ type: TOKEN.LINK, text: m[8], href: m[9] });
    } else if (m[10]) {
      // event_ref
      tokens.push({
        type:    TOKEN.EVENT_REF,
        eventId: m[11],
        label:   m[12] || m[11],
      });
    } else if (m[13]) {
      // cite_ref
      tokens.push({
        type:    TOKEN.CITE_REF,
        blockId: m[14],
        label:   m[15] || m[14],
      });
    }

    last = INLINE_RE.lastIndex;
  }

  // Remaining plain text
  if (last < text.length) {
    tokens.push({ type: TOKEN.TEXT, text: text.slice(last) });
  }

  return tokens.length ? tokens : [{ type: TOKEN.TEXT, text }];
}
