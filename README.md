# Griot

A lightweight, extensible block editor and viewer for the web. Inspired by Notion, built with plain JavaScript and zero dependencies. Griot ships a complete dark-themed CSS file, an immutable document model, and a fully keyboard-driven editing experience.

---

## Features

- **19 block types** across four categories: text, media, embed, and structure
- **Inline markup** — 12 token types parsed by a standalone lexer
- **Markdown shortcuts** — type `# `, `> `, `- `, ` ``` ` etc. to convert a block on the fly
- **Floating format toolbar** — appears on text selection; wraps with bold, italic, underline, strikethrough, inline code, highlight, link, or color
- **Slash command palette** — type `/` in any empty block; searchable, keyboard-navigable, grouped by category
- **Undo / redo** — linear history stack, up to 200 snapshots
- **Live inline preview** — rendered below every text block that supports inline syntax
- **Read-only viewer** — same document, no editing controls; supports highlight + scroll-to-block
- **Immutable document operations** — every mutation returns a new document object
- **Schema-driven** — all block types live in `BlockSchema.js`; easy to extend
- **Default CSS** — ships with `griot.css`; dark theme with CSS variables scoped to `.griot-editor` / `.griot-viewer`
- **Zero dependencies** — pure ES modules, no framework, no bundler required

---

## Installation

```bash
npm install griot
```

Or via ES module directly:

```html
<script type="module">
  import { Editor, Viewer } from './path/to/griot.js';
</script>
```

---

## Styling

Griot ships a complete default stylesheet (`griot.css`). Import it once:

```html
<link rel="stylesheet" href="node_modules/griot/griot.css">
```

All styles are scoped to `.griot-editor` and `.griot-viewer`. Every value is a CSS variable — override any of them to theme Griot to your app:

```css
:root {
  --griot-bg:            #060918;
  --griot-surface:       rgba(255,255,255,0.03);
  --griot-surface-hover: rgba(255,255,255,0.055);
  --griot-border:        rgba(255,255,255,0.07);
  --griot-border-focus:  rgba(99,102,241,0.5);
  --griot-accent:        #6366f1;
  --griot-accent-soft:   rgba(99,102,241,0.12);
  --griot-accent-text:   #a5b4fc;
  --griot-text:          #e2e8f0;
  --griot-text-muted:    #64748b;
  --griot-text-faint:    #334155;
  --griot-code-bg:       rgba(0,0,0,0.45);
  --griot-code-color:    #a5f3fc;
  --griot-font-body:     system-ui, -apple-system, sans-serif;
  --griot-font-mono:     'Fira Code', 'Cascadia Code', monospace;
  --griot-font-serif:    'Georgia', 'Times New Roman', serif;
  --griot-radius:        8px;
}
```

---

## Quick Start

### Editor

```html
<link rel="stylesheet" href="griot.css">
<div id="editor"></div>

<script type="module">
  import { Editor, createDocument } from 'griot';

  const editor = new Editor(document.getElementById('editor'), {
    doc: createDocument([
      { id: 'b1', type: 'heading', text: 'Hello World', meta: { level: 1 } },
      { id: 'b2', type: 'paragraph', text: 'Start writing…' },
    ]),
    books: [],
    onChange:             (doc)         => console.log('changed', doc),
    onEventClick:         (eventId)     => console.log('event', eventId),
    onCiteClick:          (blockId)     => console.log('cite', blockId),
    onRequestBookPicker:  (blockId, cb) => cb({ bookId: 'b1', unitId: 'u1', quote: '', note: '' }),
  });
</script>
```

### Viewer

```html
<div id="viewer"></div>

<script type="module">
  import { Viewer } from 'griot';

  const viewer = new Viewer(document.getElementById('viewer'), {
    doc:              myDocument,
    books:            myBooks,
    onEventClick:     (eventId) => { /* … */ },
    onCiteClick:      (blockId) => { /* … */ },
    highlightBlockId: 'b2',
  });

  viewer.setHighlight('b1');   // scroll to + 2.2s pulse-highlight
</script>
```

---

## Block Types

All 19 block types are defined in `BlockSchema.js`.

### Text (10 types)

| Type | Slash label | Notes |
|---|---|---|
| `paragraph` | Text | Supports full inline markup; live preview strip below input |
| `heading` | Heading | Levels 1–6; level picker in editor toolbar |
| `blockquote` | Quote | Supports inline markup |
| `callout` | Callout | 💡 Customisable icon |
| `callout_warning` | Warning | ⚠️ |
| `callout_tip` | Tip | ✅ |
| `callout_danger` | Danger | 🚨 |
| `code` | Code block | Language input in toolbar; `pre` white-space; monospace |
| `list_ul` | Bullet list | One item per line; Enter inserts newline |
| `list_ol` | Numbered list | One item per line; Enter inserts newline |

### Media (4 types)

| Type | Slash label | Notes |
|---|---|---|
| `image` | Image | `src`, `alt`, `caption`, `width` (`full` etc.) |
| `video` | Video | Auto-embeds YouTube (incl. Shorts) and Vimeo; falls back to native `<video>` |
| `audio` | Audio | Auto-embeds Spotify (track/album/playlist/episode) and SoundCloud; falls back to native `<audio>` |
| `gallery` | Gallery | Multiple items; layout: `grid`, `masonry`, `carousel`, or `strip` |

### Embed (1 type)

| Type | Slash label | Notes |
|---|---|---|
| `embed` | Embed / iframe | Generic `<iframe>` with configurable `height` and optional `caption` |

### Structure (4 types)

| Type | Slash label | Notes |
|---|---|---|
| `table` | Table | Full WYSIWYG editor with add/remove rows and columns; inline markup in cells |
| `divider` | Divider | `<hr>` |
| `timeline_ref` | Timeline event | `eventId`, `eventTitle`, `note`; clickable in viewer → `onEventClick` |
| `book_citation` | Book citation | `bookId`, `unitId`, `quote`, `note`; triggers `onRequestBookPicker` |

---

## Inline Markup

The inline parser (`InlineLexer.js`) is fully independent and can be used standalone. Twelve token types are supported, evaluated in priority order:

| Syntax | Token | Renders as |
|---|---|---|
| `**bold**` | `BOLD` | `<strong>` |
| `*italic*` | `ITALIC` | `<em>` |
| `__underline__` | `UNDERLINE` | `<u>` |
| `~~strikethrough~~` | `STRIKE` | `<s>` |
| `` `code` `` | `CODE` | `<code class="griot-inline-code">` |
| `==highlight==` | `HIGHLIGHT` | `<mark class="griot-highlight">` |
| `{#f00:red}` or `{tomato:text}` | `COLOR_MARK` | `<span style="color:…">` |
| `[label](url)` | `LINK` | `<a class="griot-link" target="_blank">` |
| `![alt](url)` | `IMAGE` | `<img class="griot-inline-img">` |
| `[[event:id\|label]]` | `EVENT_REF` | Clickable chip → `onEventClick` |
| `[[cite:id\|label]]` | `CITE_REF` | Clickable chip → `onCiteClick` |

---

## Markdown Block Shortcuts

Typing these at the **start** of a block converts it instantly:

| Pattern | Converts to |
|---|---|
| `# ` | Heading H1 |
| `## ` through `###### ` | Heading H2–H6 |
| `> ` | Blockquote |
| `- ` or `* ` | Bullet list |
| `1. ` | Numbered list |
| `--- ` | Divider (text cleared) |
| ` ``` ` or ` ``` ` + space | Code block |

---

## Editor Keyboard Shortcuts

| Key | Action |
|---|---|
| `Enter` | Split block at cursor (newline in list blocks) |
| `Backspace` at offset 0 | Merge block with previous; cursor placed at merge point |
| `Delete` at end | Merge next block into current |
| `↑` on first visual line | Move focus to previous block |
| `↓` on last visual line | Move focus to next block |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Y` or `Ctrl/Cmd+Shift+Z` | Redo |
| `Ctrl/Cmd+B` | Wrap selection in `**…**` |
| `Ctrl/Cmd+I` | Wrap selection in `*…*` |
| `Ctrl/Cmd+U` | Wrap selection in `__…__` |

---

## Concepts

### Document

```typescript
interface Document {
  id: string;
  blocks: Block[];
}
```

### Block

```typescript
interface Block {
  id: string;
  type: string;
  text: string | null;   // only present when hasText: true in schema
  meta: Record<string, any>;
}
```

---

## API Reference

### Core

| Export | Description |
|---|---|
| `createBlock(type, overrides?)` | New block with unique id |
| `cloneBlock(block, newId?)` | Deep clone; `newId` defaults to `true` |
| `isTextBlock(block)` | `true` if block has a text field |
| `isValidBlock(block)` | Minimal structural check |
| `anchorId(blockId)` | DOM `id` string for a block element |
| `scrollToBlock(blockId, behavior?)` | `scrollIntoView` wrapper |
| `TEXT_TYPES` | `Set<string>` of types that carry a text field |
| `ALL_TYPES` | `string[]` of all known types |

### Document Operations

All functions are immutable — they return a new document object.

| Export | Description |
|---|---|
| `createDocument(blocks?)` | New document; falls back to a single empty paragraph |
| `toJSON(doc)` / `fromJSON(json)` | Serialize / deserialize |
| `getBlock(doc, id)` | Find a block by id |
| `getBlockIndex(doc, id)` | Index of a block |
| `getBlockBefore(doc, id)` / `getBlockAfter(doc, id)` | Adjacent blocks |
| `updateBlock(doc, id, patch)` | Patch `text`, `type`, and/or `meta` (meta is shallow-merged) |
| `insertBlockAfter(doc, afterId, block)` | Insert a block |
| `insertBlockBefore(doc, beforeId, block)` | Insert a block |
| `removeBlock(doc, id)` | Delete a block |
| `moveBlock(doc, fromIdx, toIdx)` | Reorder blocks |
| `splitBlock(doc, blockId, offset)` | Split at cursor offset; headings become paragraphs. Returns `[newDoc, newBlockId]` |
| `mergeBlockWithPrev(doc, blockId)` | Concatenate text with previous block. Returns `[newDoc, prevId, mergeOffset]` |

### Inline Parsing & Rendering

| Export | Description |
|---|---|
| `tokenizeInline(text)` | Returns `Token[]` |
| `renderInlineToDOM(text, callbacks?)` | Returns a `DocumentFragment` |
| `renderInlineToHTML(text)` | Returns an HTML string |
| `escHtml(str)` / `escAttr(str)` | Escape helpers |
| `TOKEN` | Frozen enum of all token type strings |

### Block Rendering

| Export | Description |
|---|---|
| `renderBlock(block, options)` | Renders a single block to a DOM element |
| `getBlockDef(type)` | Schema definition for a type |
| `getAllTypes()` | All registered type names |
| `getTypesByCategory(category)` | Types filtered by `'text'`, `'media'`, `'embed'`, or `'structure'` |
| `defaultMeta(type)` | Default meta object for a type |
| `resolveYouTube(src)` | Extracts YouTube embed URL |
| `resolveVimeo(src)` | Extracts Vimeo embed URL |
| `resolveSpotify(src)` | Extracts Spotify embed URL |
| `resolveSoundCloud(src)` | Builds SoundCloud player URL |

### Editor

```typescript
new Editor(container: HTMLElement, options: {
  doc: Document;
  books?: Book[];
  onChange?: (doc: Document) => void;       // debounced 400 ms while typing
  onEventClick?: (eventId: string) => void;
  onCiteClick?: (blockId: string) => void;
  onRequestBookPicker?: (
    blockId: string,
    callback: (selection: { bookId: string; unitId: string; quote: string; note: string }) => void
  ) => void;
})
```

**Methods:** `setDoc(doc)`, `setBooks(books)`, `focus(blockId)`, `destroy()`

**Per-block toolbar:** type switcher (all 19 types), heading level selector (H1–H6), code language input, move up/down, add below, delete.

**`onChange` debouncing:** while the user types, intermediate state is captured via `history.replace()`. A new undo point is committed 400 ms after the last keystroke.

### Viewer

```typescript
new Viewer(container: HTMLElement, options: {
  doc?: Document;
  books?: Book[];
  onEventClick?: (eventId: string) => void;
  onCiteClick?: (blockId: string) => void;
  highlightBlockId?: string;
})
```

**Methods:** `setDoc(doc)`, `setBooks(books)`, `setHighlight(blockId, options?)`, `destroy()`

`setHighlight` scrolls to the block and applies a 2.2-second CSS pulse animation, then removes the highlight class automatically.

### History

```javascript
import { History } from 'griot';

const history = new History(initialDoc);  // max 200 snapshots
history.push(doc);      // new undo point (discards redo future)
history.replace(doc);   // overwrite current snapshot without a new undo point
history.undo();         // returns previous document
history.redo();         // returns next document
history.current;        // current document
history.canUndo();      // boolean
history.canRedo();      // boolean
```

### Keyboard Helpers

| Export | Description |
|---|---|
| `attachKeyboardHandler(el, blockId, callbacks)` | Attach all editor key bindings to a `contenteditable` |
| `getCursorOffset(el)` | Character offset of caret |
| `setCursorOffset(el, offset)` | Move caret to character offset |
| `getSelectionOffsets(el)` | `{ start, end }` of current selection |
| `focusAtEnd(el)` / `focusAtStart(el)` | Move caret to end / start |

---

## Multimedia

### Gallery layouts

```javascript
{ type: 'gallery', meta: { items: [{ src, alt, caption }, …], layout: 'grid' } }
// layout: 'grid' | 'masonry' | 'carousel' | 'strip'
```

### Auto-embed detection

Setting `meta.src` on a `video` or `audio` block automatically produces the right embed:

| URL pattern | Result |
|---|---|
| `youtube.com/watch?v=…`, `youtu.be/…`, `/shorts/…` | YouTube iframe |
| `vimeo.com/…` | Vimeo iframe |
| `open.spotify.com/track/…` (album/playlist/episode too) | Spotify iframe |
| `soundcloud.com/…` | SoundCloud widget |
| Anything else | Native `<video>` / `<audio>` |

---

## Extending

### Adding a Block Type

1. Add an entry to `BlockSchema.js` (or patch the schema at runtime).
2. Add a rendering case to `BlockRenderer.js`.
3. If it needs an editor UI, add a case to `Editor._buildSpecialBlockUI()`.
4. The slash menu reads from the schema — no changes needed there.

### Custom Inline Syntax

Add a rule to `InlineLexer.js`, then handle the new token type in both `InlineRenderer._toNode()` (DOM) and `InlineRenderer._toHTML()` (HTML string).

---

## Project Structure

```
src/
  core/
    Block.js          — block primitives, TEXT_TYPES, uid, anchorId
    Document.js       — immutable document operations
    History.js        — undo/redo stack (max 200)
  blocks/
    BlockSchema.js    — single source of truth for all 19 block types
    BlockRenderer.js  — block → DOM element (used by Viewer)
  inline/
    InlineLexer.js    — tokenizer (12 token types)
    InlineRenderer.js — tokens → DOM fragment or HTML string
  editor/
    Editor.js         — full editing lifecycle
    FormatToolbar.js  — floating selection toolbar
    SlashMenu.js      — slash command palette
    Keyboard.js       — key bindings and cursor helpers
  viewer/
    Viewer.js         — read-only renderer
  griot.js            — public entry point
griot.css             — default dark theme (CSS variables)
```

---

## Development

```bash
git clone https://github.com/yourname/griot.git
cd griot
npm install
npm run dev   # dev server at localhost:5000
```

---

## License

MIT