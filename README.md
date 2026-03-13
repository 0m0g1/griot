# Griot

A lightweight, extensible block editor and viewer for the web. Inspired by Notion, but built with plain JavaScript and zero dependencies. Griot provides a rich editing experience with:

- **Block-based editing** – paragraphs, headings, lists, callouts, code blocks, images, video, audio, tables, dividers, timeline references, book citations, and more.
- **Inline formatting** – bold, italic, underline, strikethrough, inline code, highlights, colored text, links, images, and custom event/cite chips.
- **Slash commands** – type `/` to insert any block.
- **Floating format toolbar** – appears when you select text.
- **Undo/redo** – with a built‑in history stack.
- **Read‑only viewer** – render the same document without editing controls.
- **Immutable document operations** – every change produces a new document object.
- **Schema‑driven** – all block types are defined in a single schema; easy to extend.

---

## Installation

```bash
npm install griot
```

Or include it directly via ES module:

```html
<script type="module">
  import { Editor, Viewer } from './path/to/griot.js';
  // ...
</script>
```

---

## Quick Start

### Editor

```html
<div id="editor-container"></div>
<script type="module">
  import { Editor, createDocument } from 'griot';

  const container = document.getElementById('editor-container');
  const doc = createDocument([
    { id: 'b1', type: 'heading', text: 'Hello World', meta: { level: 1 } },
    { id: 'b2', type: 'paragraph', text: 'This is **editable** content.' },
  ]);

  const editor = new Editor(container, {
    doc,
    books: [],                     // optional, for book citations
    onChange: (newDoc) => {
      console.log('Document changed:', newDoc);
    },
    onEventClick: (eventId) => {
      console.log('Event clicked:', eventId);
    },
    onCiteClick: (blockId) => {
      console.log('Citation clicked:', blockId);
    },
    onRequestBookPicker: (blockId, callback) => {
      // Open your own book picker UI, then call callback with selection
      callback({ bookId: 'book1', unitId: 'unit1', quote: '', note: '' });
    }
  });

  // Later, if you need to replace the document:
  editor.setDoc(newDoc);
</script>
```

### Viewer

```html
<div id="viewer-container"></div>
<script type="module">
  import { Viewer } from 'griot';

  const container = document.getElementById('viewer-container');
  const viewer = new Viewer(container, {
    doc: myDocument,
    books: myBooks,
    onEventClick: (eventId) => { /* ... */ },
    onCiteClick: (blockId) => { /* ... */ },
    highlightBlockId: 'b2'      // optional initial highlight
  });

  // Highlight and scroll to a block
  viewer.setHighlight('b1');
</script>
```

---

## Concepts

### Document

A Griot document is a plain object with an `id` and an array of blocks:

```typescript
interface Document {
  id: string;
  blocks: Block[];
}
```

### Block

Every block has at least `id`, `type`, and optionally `text` and `meta`. The `text` field is only present for block types that contain editable text (e.g. paragraphs, headings). All other block types store their data in `meta`.

```typescript
interface Block {
  id: string;
  type: string;
  text?: string | null;
  meta: Record<string, any>;
}
```

### Inline Markup

Within text blocks, you can use lightweight syntax:

| Syntax | Result |
|---|---|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `__underline__` | underline |
| `~~strikethrough~~` | ~~strikethrough~~ |
| `` `code` `` | `code` |
| `==highlight==` | highlight |
| `{#ff0000:red text}` or `{blue:text}` | colored text |
| `[link text](https://example.com)` | link |
| `![alt text](image.jpg)` | image |
| `[[event:eventId\|label]]` | clickable chip → `onEventClick` |
| `[[cite:blockId\|label]]` | clickable chip → `onCiteClick` |

The inline parser is fully independent and can be used separately: `tokenizeInline()`, `renderInlineToDOM()`, `renderInlineToHTML()`.

### Block Schema

All block types are defined in `BlockSchema.js`. Each definition includes category, label, icon, slash label, whether it has text, default meta, and placeholder. You can extend the schema by adding new entries.

### History

The `History` class provides a simple linear undo/redo stack. The editor uses it internally; you can also use it standalone.

---

## API Reference

The public API is exposed through the main entry point (`griot.js`). Below are the most important exports.

### Core

| Export | Description |
|---|---|
| `createBlock(type, overrides?)` | Create a new block with a unique id. |
| `cloneBlock(block, newId = true)` | Deep clone a block. |
| `isTextBlock(block)` | Check if a block stores a text string. |
| `isValidBlock(block)` | Minimal structural check. |
| `anchorId(blockId)` | Generate the DOM id used for a block element. |
| `scrollToBlock(blockId, behavior = 'smooth')` | Scroll to a block's element. |
| `TEXT_TYPES` | Set of block types that have a text field. |
| `ALL_TYPES` | Array of all known block type names. |

### Document Operations

All functions are immutable – they return a new document.

| Export | Description |
|---|---|
| `createDocument(blocks?)` | Create a new document (with at least one paragraph). |
| `toJSON(doc)` / `fromJSON(json)` | Serialize / deserialize. |
| `getBlock(doc, id)` | Find a block by id. |
| `getBlockIndex(doc, id)` | Get index of a block. |
| `getBlockBefore(doc, id)` / `getBlockAfter(doc, id)` | Adjacent blocks. |
| `updateBlock(doc, id, patch)` | Update text and/or meta. |
| `insertBlockAfter(doc, afterId, newBlock)` | Insert block. |
| `insertBlockBefore(doc, beforeId, newBlock)` | Insert block. |
| `removeBlock(doc, id)` | Delete a block. |
| `moveBlock(doc, fromIdx, toIdx)` | Reorder blocks. |
| `splitBlock(doc, blockId, offset)` | Split a text block at offset. |
| `mergeBlockWithPrev(doc, blockId)` | Merge block into previous one. |

### Inline Parsing & Rendering

| Export | Description |
|---|---|
| `tokenizeInline(text)` | Return an array of token objects. |
| `renderInlineToDOM(text, callbacks?)` | Render tokens into a DocumentFragment. |
| `renderInlineToHTML(text)` | Render tokens into an HTML string. |
| `escHtml(str)` / `escAttr(str)` | Escape helpers. |
| `TOKEN` | Enum of token types. |

### Block Rendering (for Viewer or custom use)

| Export | Description |
|---|---|
| `renderBlock(block, options)` | Render a single block to a DOM element. Used by Viewer. |
| `getBlockDef(type)` | Get the schema definition for a block type. |
| `getAllTypes()` | All registered block type names. |
| `getTypesByCategory(category)` | Filter types by category. |
| `defaultMeta(type)` | Get default meta for a type. |
| `resolveYouTube(src)` / `resolveVimeo` / `resolveSpotify` / `resolveSoundCloud` | Extract embed URLs from various sources. |

### Editor Classes

| Export | Description |
|---|---|
| `Editor` | Main editor class. See constructor options below. |
| `FormatToolbar` | Floating formatting toolbar (used internally, but can be used standalone). |
| `SlashMenu` | Slash command menu (used internally). |
| `DropHandler` | Handles drag & drop of files/images (not yet shown, but exported). |

**Editor constructor options:**

```typescript
{
  doc: Document;                       // initial document
  books?: Book[];                      // array of book objects for citations
  onChange?: (doc: Document) => void;  // called after every change (debounced)
  onEventClick?: (eventId: string) => void;
  onCiteClick?: (blockId: string) => void;
  onRequestBookPicker?: (blockId: string, callback: (selection) => void) => void;
}
```

**Editor methods:**

- `setDoc(doc)` – replace the document.
- `setBooks(books)` – update the book list.
- `focus(blockId)` – focus a specific block.
- `destroy()` – clean up.

### Viewer

| Export | Description |
|---|---|
| `Viewer` | Read‑only renderer. |

**Viewer constructor options:**

```typescript
{
  doc?: Document;
  books?: Book[];
  onEventClick?: (eventId: string) => void;
  onCiteClick?: (blockId: string) => void;
  highlightBlockId?: string;           // initial highlight
}
```

**Viewer methods:**

- `setDoc(doc)`
- `setBooks(books)`
- `setHighlight(blockId, options?)` – scroll to and briefly highlight a block.
- `destroy()`

### Keyboard Helpers

| Export | Description |
|---|---|
| `attachKeyboardHandler(el, blockId, callbacks)` | Attach editor keyboard shortcuts to a contenteditable element. |
| `getCursorOffset(el)` / `setCursorOffset(el, offset)` | Get/set caret position by character offset. |
| `getSelectionOffsets(el)` | Get start/end offsets of current selection. |
| `focusAtEnd(el)` / `focusAtStart(el)` | Move caret to end/start. |

### History

```javascript
import { History } from 'griot';

const history = new History(initialDoc);
history.push(newDoc);
history.undo();  // returns previous document
history.redo();
history.current; // current document
```

---

## Styling

Griot includes no CSS by design – you can style it to match your application. All elements have semantic class names prefixed with `griot-`. For a quick start, you can copy the example styles from the test page or browse the class names used in the source.

**Minimal recommended styles:**

- Make `.griot-editor-block__input[contenteditable]` look like a normal block.
- Add basic spacing and borders.
- Style the floating toolbar and slash menu as floating cards.

---

## Examples

### Basic Editor with Slash Menu and Toolbar

The editor includes the slash menu and format toolbar automatically. Just instantiate it.

### Using the Viewer with Highlight

```javascript
const viewer = new Viewer(container, { doc });
viewer.setHighlight('some-block-id');
```

### Custom Book Picker

When a `book_citation` block is added, the editor calls `onRequestBookPicker`. Implement your own modal or dropdown:

```javascript
onRequestBookPicker: (blockId, callback) => {
  const book = prompt('Enter book ID:');
  const unit = prompt('Enter unit ID:');
  callback({ bookId: book, unitId: unit, quote: '', note: '' });
}
```

### Using Inline Renderer Standalone

```javascript
import { renderInlineToDOM } from 'griot';

const text = 'This is **bold** and [a link](https://example.com).';
const fragment = renderInlineToDOM(text, {
  onEventClick: (id) => console.log(id),
  onCiteClick: (id) => console.log(id)
});
document.getElementById('output').appendChild(fragment);
```

---

## Extending

### Adding a New Block Type

1. Add an entry in `BlockSchema.js` (or patch the schema at runtime).
2. Add a rendering case in `BlockRenderer.js`.
3. If the block has a special editor UI, add a case in `Editor._buildSpecialBlockUI()`.
4. (Optional) Add support in the slash menu – it reads from the schema automatically.

### Custom Inline Syntax

Modify `InlineLexer.js` by adding a new rule. Then update `InlineRenderer.js` to render the new token type.

---

## Development

```bash
git clone https://github.com/yourname/griot.git  
cd griot
npm install
npm run dev   # serves test page at localhost:5000 (or similar)
```

The source is organised as:

- `src/core/` – block primitives, document operations, history.
- `src/blocks/` – block schema and renderer.
- `src/inline/` – inline lexer and renderer.
- `src/editor/` – editor UI, keyboard handling, slash menu, toolbar.
- `src/viewer/` – read-only renderer.

All public exports are aggregated in `src/griot.js`.

---

## License

MIT