// ─── Griot.js ─────────────────────────────────────────────────────────────────
// Public facade. Import from here only — never from internal modules directly.
//
//   Classes       Editor, Viewer, FormatToolbar, SlashMenu, DropHandler
//   Document      createDocument, createBlock, cloneBlock
//                 updateBlock, insertBlockAfter, insertBlockBefore,
//                 removeBlock, moveBlock, splitBlock, mergeBlockWithPrev,
//                 getBlock, getBlockIndex, getBlockBefore, getBlockAfter,
//                 toJSON, fromJSON
//   Block         anchorId, scrollToBlock, isTextBlock, isValidBlock
//                 TEXT_TYPES, ALL_TYPES
//   Inline        tokenizeInline, renderInlineToDOM, renderInlineToHTML,
//                 escHtml, escAttr, TOKEN
//   Schema        getBlockDef, getAllTypes, getTypesByCategory,
//                 defaultMeta, BlockSchema
//   Keyboard      attachKeyboardHandler, getCursorOffset, getSelectionOffsets,
//                 setCursorOffset, focusAtEnd, focusAtStart
//   URL helpers   resolveYouTube, resolveVimeo, resolveSpotify, resolveSoundCloud
//   Gallery       renderGallery, lightbox
// ─────────────────────────────────────────────────────────────────────────────

export {
  createBlock, cloneBlock, isTextBlock, isValidBlock,
  anchorId, scrollToBlock, TEXT_TYPES, ALL_TYPES,
} from './core/Block.js';

export {
  createDocument, toJSON, fromJSON,
  getBlock, getBlockIndex, getBlockAfter, getBlockBefore,
  updateBlock, insertBlockAfter, insertBlockBefore,
  removeBlock, moveBlock, splitBlock, mergeBlockWithPrev,
} from './core/Document.js';

export { History } from './core/History.js';

export { tokenizeInline, TOKEN }               from './inline/InlineLexer.js';
export { renderInlineToDOM, renderInlineToHTML, escHtml, escAttr } from './inline/InlineRenderer.js';

export { getBlockDef, getAllTypes, getTypesByCategory, defaultMeta } from './blocks/BlockSchema.js';
export { default as BlockSchema }               from './blocks/BlockSchema.js';
export { renderBlock, resolveYouTube, resolveVimeo, resolveSpotify, resolveSoundCloud } from './blocks/BlockRenderer.js';
export { renderGallery }                        from './blocks/GalleryRenderer.js';
export { lightbox }                             from './blocks/Lightbox.js';

export { Editor }         from './editor/Editor.js';
export { FormatToolbar }  from './editor/FormatToolbar.js';
export { SlashMenu }      from './editor/SlashMenu.js';
export { DropHandler }    from './editor/DropHandler.js';
export {
  attachKeyboardHandler,
  getCursorOffset, getSelectionOffsets, setCursorOffset,
  focusAtEnd, focusAtStart,
} from './editor/Keyboard.js';

export { Viewer } from './viewer/Viewer.js';