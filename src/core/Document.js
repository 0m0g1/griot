// ─── Document.js ──────────────────────────────────────────────────────────────
// Immutable document operations. Every function returns a NEW document object.
// Document shape: { id: string, blocks: Block[] }
// ─────────────────────────────────────────────────────────────────────────────

import { createBlock } from './Block.js';

let _docSeq = 0;
const docUid   = () => `doc_${Date.now().toString(36)}_${++_docSeq}`;
const withBlks = (doc, blocks) => ({ ...doc, blocks });

// ── Constructors ──────────────────────────────────────────────────────────────

export function createDocument(blocks = []) {
  return { id: docUid(), blocks: blocks.length ? blocks : [createBlock('paragraph')] };
}

export const toJSON   = (doc) => JSON.stringify(doc);
export const fromJSON = (j)   => (typeof j === 'string' ? JSON.parse(j) : j);

// ── Queries ───────────────────────────────────────────────────────────────────

export const getBlock       = (doc, id) => doc.blocks.find(b => b.id === id) ?? null;
export const getBlockIndex  = (doc, id) => doc.blocks.findIndex(b => b.id === id);
export const getBlockBefore = (doc, id) => { const i = getBlockIndex(doc, id); return i > 0 ? doc.blocks[i - 1] : null; };
export const getBlockAfter  = (doc, id) => { const i = getBlockIndex(doc, id); return (i >= 0 && i < doc.blocks.length - 1) ? doc.blocks[i + 1] : null; };

// ── Mutations (always return a new doc) ───────────────────────────────────────

export function updateBlock(doc, id, patch) {
  return withBlks(doc, doc.blocks.map(b => {
    if (b.id !== id) return b;
    const u = { ...b };
    if ('text' in patch) u.text = patch.text;
    if ('type' in patch) u.type = patch.type;
    if ('meta' in patch) u.meta = { ...b.meta, ...patch.meta };
    return u;
  }));
}

export function insertBlockAfter(doc, afterId, newBlock) {
  const i = getBlockIndex(doc, afterId);
  const blocks = [...doc.blocks];
  blocks.splice(i < 0 ? blocks.length : i + 1, 0, newBlock);
  return withBlks(doc, blocks);
}

export function insertBlockBefore(doc, beforeId, newBlock) {
  const i = getBlockIndex(doc, beforeId);
  const blocks = [...doc.blocks];
  blocks.splice(i < 0 ? 0 : i, 0, newBlock);
  return withBlks(doc, blocks);
}

export function removeBlock(doc, id) {
  return withBlks(doc, doc.blocks.filter(b => b.id !== id));
}

export function moveBlock(doc, fromIdx, toIdx) {
  const blocks = [...doc.blocks];
  const [item] = blocks.splice(fromIdx, 1);
  blocks.splice(toIdx, 0, item);
  return withBlks(doc, blocks);
}

/**
 * Split a text block at `offset`.
 * Headings split into a paragraph for the new block.
 * @returns {[newDoc, newBlockId | null]}
 */
export function splitBlock(doc, blockId, offset) {
  const block = getBlock(doc, blockId);
  if (!block || block.text === null) return [doc, null];

  const before  = block.text.slice(0, offset);
  const after   = block.text.slice(offset);
  const newType = block.type === 'heading' ? 'paragraph' : block.type;
  const nb      = createBlock(newType, { text: after, meta: { ...block.meta } });
  return [insertBlockAfter(updateBlock(doc, blockId, { text: before }), blockId, nb), nb.id];
}

/**
 * Merge a block into the previous one.
 * @returns {[newDoc, prevBlockId | null, mergeOffset]}
 */
export function mergeBlockWithPrev(doc, blockId) {
  const block = getBlock(doc, blockId);
  const prev  = getBlockBefore(doc, blockId);
  if (!prev || prev.text === null || block?.text === null) return [doc, null, 0];
  const offset = prev.text.length;
  const merged = updateBlock(doc, prev.id, { text: prev.text + (block.text ?? '') });
  return [removeBlock(merged, blockId), prev.id, offset];
}