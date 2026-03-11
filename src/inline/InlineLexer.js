// ─── InlineLexer.js ───────────────────────────────────────────────────────────
// Tokenises a plain-text string that uses lightweight inline markup.
//
// Supported syntax
// ─────────────────────────────────────────────────────────────────────────────
//   **bold**                           → TOKEN.BOLD        { text }
//   *italic*                           → TOKEN.ITALIC      { text }
//   __underline__                      → TOKEN.UNDERLINE   { text }
//   ~~strikethrough~~                  → TOKEN.STRIKE      { text }
//   `inline code`                      → TOKEN.CODE        { code }
//   ==highlight==                      → TOKEN.HIGHLIGHT   { text }
//   {#f00:red text}  {blue:text}       → TOKEN.COLOR_MARK  { color, text }
//   [label](url)                       → TOKEN.LINK        { label, href }
//   ![alt](url)                        → TOKEN.IMAGE       { alt, src }
//   [[event:id|label]]                 → TOKEN.EVENT_REF   { eventId, label }
//   [[cite:blockId|label]]             → TOKEN.CITE_REF    { blockId, label }
//   plain text                         → TOKEN.TEXT        { text }
//
// Stateless and re-entrant. Rules are anchored regexes in priority order.
// ─────────────────────────────────────────────────────────────────────────────

export const TOKEN = Object.freeze({
  TEXT:       'text',
  BOLD:       'bold',
  ITALIC:     'italic',
  UNDERLINE:  'underline',
  STRIKE:     'strike',
  CODE:       'code',
  LINK:       'link',
  IMAGE:      'image',
  HIGHLIGHT:  'highlight',
  COLOR_MARK: 'color_mark',
  EVENT_REF:  'event_ref',
  CITE_REF:   'cite_ref',
});

const RULES = [
  // Inline image ![alt](url) — must precede link rule
  { type: TOKEN.IMAGE,      re: /^!\[([^\]]*)\]\(([^)\s]+)\)/,                      build: m => ({ alt: m[1], src: m[2] }) },
  // Link [label](url)
  { type: TOKEN.LINK,       re: /^\[([^\]]+)\]\(([^)\s]+)\)/,                       build: m => ({ label: m[1], href: m[2] }) },
  // Bold **text** — before italic
  { type: TOKEN.BOLD,       re: /^\*\*((?:[^*]|\*(?!\*))+)\*\*/,                    build: m => ({ text: m[1] }) },
  // Italic *text*
  { type: TOKEN.ITALIC,     re: /^\*((?:[^*])+)\*/,                                 build: m => ({ text: m[1] }) },
  // Underline __text__
  { type: TOKEN.UNDERLINE,  re: /^__((?:[^_])+)__/,                                 build: m => ({ text: m[1] }) },
  // Strikethrough ~~text~~
  { type: TOKEN.STRIKE,     re: /^~~((?:[^~])+)~~/,                                 build: m => ({ text: m[1] }) },
  // Highlight ==text==
  { type: TOKEN.HIGHLIGHT,  re: /^==((?:[^=])+)==/,                                 build: m => ({ text: m[1] }) },
  // Colour mark {#hex:text} or {colorname:text}
  { type: TOKEN.COLOR_MARK, re: /^\{(#[0-9a-fA-F]{3,8}|[a-zA-Z][a-zA-Z0-9_-]*):([^}]+)\}/, build: m => ({ color: m[1], text: m[2] }) },
  // Inline code `code`
  { type: TOKEN.CODE,       re: /^`([^`]+)`/,                                       build: m => ({ code: m[1] }) },
  // Event ref [[event:id|label]]
  { type: TOKEN.EVENT_REF,  re: /^\[\[event:([^\]|]+)(?:\|([^\]]*))?\]\]/,          build: m => ({ eventId: m[1], label: m[2] || m[1] }) },
  // Cite ref [[cite:id|label]]
  { type: TOKEN.CITE_REF,   re: /^\[\[cite:([^\]|]+)(?:\|([^\]]*))?\]\]/,           build: m => ({ blockId: m[1], label: m[2] || m[1] }) },
];

export function tokenizeInline(text = '') {
  if (!text) return [];
  const tokens = [];
  let pos = 0, textStart = 0;

  while (pos < text.length) {
    const remaining = text.slice(pos);
    let matched = false;

    for (const rule of RULES) {
      const m = remaining.match(rule.re);
      if (!m) continue;
      if (pos > textStart) tokens.push({ type: TOKEN.TEXT, text: text.slice(textStart, pos) });
      tokens.push({ type: rule.type, ...rule.build(m) });
      pos += m[0].length;
      textStart = pos;
      matched = true;
      break;
    }

    if (!matched) pos++;
  }

  if (textStart < text.length) tokens.push({ type: TOKEN.TEXT, text: text.slice(textStart) });
  return tokens.length ? tokens : [{ type: TOKEN.TEXT, text }];
}