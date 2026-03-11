// ─── Griot.js ─────────────────────────────────────────────────────────────────
// Public facade. Import from here — never from internal modules directly.
//
// Named exports cover every public surface:
//
//   Classes
//     Editor, Viewer
//
//   Document model
//     createDocument, createBlock, cloneBlock
//     updateBlock, insertBlockAfter, insertBlockBefore,
//     removeBlock, splitBlock, mergeBlockWithPrev, moveBlock,
//     getBlock, getBlockIndex, toJSON, fromJSON
//
//   Block helpers
//     anchorId, scrollToBlock, isTextBlock
//
//   Inline
//     tokenizeInline, renderInlineToDOM, renderInlineToHTML, TOKEN
//
//   Schema
//     getBlockDef, getAllTypes, defaultMeta, BlockSchema
// ─────────────────────────────────────────────────────────────────────────────

// Core
export {
  createBlock, cloneBlock, isTextBlock, isValidBlock,
  anchorId, scrollToBlock,
  TEXT_TYPES, ALL_TYPES,
} from './core/Block.js';

export {
  createDocument, toJSON, fromJSON,
  getBlock, getBlockIndex, getBlockAfter, getBlockBefore,
  updateBlock, insertBlockAfter, insertBlockBefore,
  removeBlock, moveBlock, splitBlock, mergeBlockWithPrev,
} from './core/Document.js';

export { History } from './core/History.js';

// Inline
export { tokenizeInline, TOKEN } from './inline/InlineLexer.js';
export {
  renderInlineToDOM, renderInlineToHTML, escHtml, escAttr,
} from './inline/InlineRenderer.js';

// Blocks
export { getBlockDef, getAllTypes, defaultMeta }    from './blocks/BlockSchema.js';
export { default as BlockSchema }                  from './blocks/BlockSchema.js';
export { renderBlock }                             from './blocks/BlockRenderer.js';

// Editor / Viewer
export { Editor }  from './editor/Editor.js';
export { Viewer }  from './viewer/Viewer.js';
