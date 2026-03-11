# Griot

A self-contained block-based rich text editor and renderer.  
Built for structured historical document authoring — works standalone or embedded inside a larger app.

---

## Install

```bash
# Copy src/ into your project, or:
npm install griot   # (once published)
```

```js
import '@0m0g1/griot/css';                         // styles
import { Editor, Viewer, createDocument } from 'griot';
```

---

## Quick start

### Editor

```js
import { Editor, createDocument } from 'griot';
import '@0m0g1/griot/css';

const doc = createDocument('My Article');

const editor = new Editor(document.querySelector('#editor'), {
  doc,
  books: [],                         // optional: parsed books for citations
  onChange(updatedDoc) {
    localStorage.setItem('draft', JSON.stringify(updatedDoc));
  },
  onEventClick(eventId) {
    // e.g. AppShell.handleSelectItemById(eventId)
    console.log('Open timeline event:', eventId);
  },
  onCiteClick(blockId) {
    // scroll viewer to that block
    viewer.setHighlight(blockId);
  },
  onRequestBookPicker(blockId, callback) {
    // Open your SourcePicker UI, then call:
    // callback({ bookId, unitId, quote, note })
  },
});
```

### Viewer

```js
import { Viewer } from 'griot';

const viewer = new Viewer(document.querySelector('#viewer'), {
  doc,
  books: [],
  onEventClick(eventId) {
    console.log('Open event:', eventId);
  },
});

// Jump to a block (e.g. from a timeline citation)
viewer.setHighlight('b_abc123');
```

---

## Block types

| Type | Icon | Text field | Notes |
|---|---|---|---|
| `paragraph` | ¶ | ✓ | Inline syntax supported |
| `heading` | H | ✓ | `meta.level` 1–6 |
| `blockquote` | ❝ | ✓ | Inline syntax supported |
| `callout` | 💡 | ✓ | `meta.icon` for the emoji |
| `code` | </> | ✓ | No inline parsing. `meta.language` for highlight |
| `divider` | — | — | Horizontal rule |
| `image` | 🖼 | — | `meta.src`, `meta.alt`, `meta.caption` |
| `timeline_ref` | ⏱ | — | `meta.eventId`, `meta.eventTitle`, `meta.note` |
| `book_citation` | 📖 | — | `meta.bookId`, `meta.unitId`, `meta.quote`, `meta.note` |

---

## Inline syntax

Works inside any block with `hasInline: true` (paragraph, blockquote, callout, note fields):

```
**bold**
*italic*
`inline code`
[link text](https://example.com)
[[event:rome_founding|The Founding of Rome]]   → timeline event chip
[[cite:b_abc123|See Chapter 2]]                → citation cross-reference
```

---

## Document format (`.griot.json`)

```json
{
  "version": 1,
  "id": "doc_abc",
  "title": "The Fall of Rome",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z",
  "blocks": [
    { "id": "b_1", "type": "heading",   "text": "The Fall of Rome",  "meta": { "level": 1 } },
    { "id": "b_2", "type": "paragraph", "text": "In **476 CE** the last emperor [[event:fall_of_rome|was deposed]].", "meta": {} },
    { "id": "b_3", "type": "book_citation", "text": null, "meta": {
        "bookId": "book_xyz", "unitId": "unit_abc",
        "quote": "The barbarians had long served in Roman armies.",
        "note": "Essential context for understanding the transition."
    }}
  ]
}
```

---

## Deep-link anchors

Every rendered block gets `id="griot-{blockId}"` in the DOM.

```js
import { anchorId, scrollToBlock } from 'griot';

// Get the DOM id for a block
anchorId('b_abc123')          // → "griot-b_abc123"

// Scroll to a block (viewer or editor)
scrollToBlock('b_abc123');
scrollToBlock('b_abc123', 'instant');
```

This is the contract for timeline → article navigation:  
store `{ docId, blockId }` on a citation, then call `scrollToBlock(blockId)` when the timeline jumps to it.

---

## API reference

### `Editor`
| Method | Description |
|---|---|
| `new Editor(el, options)` | Mount editor into `el` |
| `editor.doc` | Current document (read-only) |
| `editor.setDoc(doc)` | Replace document |
| `editor.setBooks(books)` | Update available books |
| `editor.focus(blockId)` | Focus a specific block |
| `editor.destroy()` | Unmount and clean up |

### `Viewer`
| Method | Description |
|---|---|
| `new Viewer(el, options)` | Mount viewer into `el` |
| `viewer.setDoc(doc)` | Replace document |
| `viewer.setBooks(books)` | Update available books |
| `viewer.setHighlight(blockId)` | Scroll to + briefly highlight a block |
| `viewer.destroy()` | Unmount and clean up |

### Document helpers
```js
createDocument(title)
createBlock(type, overrides)
updateBlock(doc, blockId, patch)
insertBlockAfter(doc, blockId, newBlock)
removeBlock(doc, blockId)
splitBlock(doc, blockId, offset)         // returns [newDoc, newBlockId]
mergeBlockWithPrev(doc, blockId)         // returns [newDoc, prevId, offset]
moveBlock(doc, fromIndex, toIndex)
toJSON(doc)
fromJSON(jsonStringOrObject)
```
