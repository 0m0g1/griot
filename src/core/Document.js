// ─── Document.js ──────────────────────────────────────────────────────────────
// An ordered list of blocks with CRUD operations.
// All mutating methods return a NEW document (immutable updates) so History
// can cheaply snapshot the state.
// ─────────────────────────────────────────────────────────────────────────────

import { createBlock, cloneBlock, isValidBlock } from './Block.js';

let _docSeq = 0;
const docUid = () => `doc_${Date.now()}_${(++_docSeq).toString(36)}`;

// ─── Factory ──────────────────────────────────────────────────────────────────
export function createDocument(title = 'Untitled', blocks = null) {
  return {
    id:        docUid(),
    version:   1,
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    blocks:    blocks ?? [createBlock('heading', { text: title, meta: { level: 1 } })],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function touch(doc) {
  return { ...doc, updatedAt: new Date().toISOString() };
}

function withBlocks(doc, blocks) {
  return touch({ ...doc, blocks });
}

// ─── Reads ────────────────────────────────────────────────────────────────────
export function getBlock(doc, blockId) {
  return doc.blocks.find(b => b.id === blockId) ?? null;
}

export function getBlockIndex(doc, blockId) {
  return doc.blocks.findIndex(b => b.id === blockId);
}

export function getBlockAfter(doc, blockId) {
  const i = getBlockIndex(doc, blockId);
  return i >= 0 && i < doc.blocks.length - 1 ? doc.blocks[i + 1] : null;
}

export function getBlockBefore(doc, blockId) {
  const i = getBlockIndex(doc, blockId);
  return i > 0 ? doc.blocks[i - 1] : null;
}

// ─── Writes ───────────────────────────────────────────────────────────────────
export function updateBlock(doc, blockId, patch) {
  return withBlocks(doc, doc.blocks.map(b =>
    b.id === blockId ? { ...b, ...patch, meta: { ...b.meta, ...(patch.meta ?? {}) } } : b
  ));
}

export function insertBlockAfter(doc, blockId, newBlock) {
  const i = getBlockIndex(doc, blockId);
  if (i < 0) return withBlocks(doc, [...doc.blocks, newBlock]);
  const next = [...doc.blocks];
  next.splice(i + 1, 0, newBlock);
  return withBlocks(doc, next);
}

export function insertBlockBefore(doc, blockId, newBlock) {
  const i = getBlockIndex(doc, blockId);
  if (i < 0) return withBlocks(doc, [newBlock, ...doc.blocks]);
  const next = [...doc.blocks];
  next.splice(i, 0, newBlock);
  return withBlocks(doc, next);
}

export function removeBlock(doc, blockId) {
  if (doc.blocks.length <= 1) return doc; // never empty
  return withBlocks(doc, doc.blocks.filter(b => b.id !== blockId));
}

export function moveBlock(doc, fromIndex, toIndex) {
  if (fromIndex === toIndex) return doc;
  const next = [...doc.blocks];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return withBlocks(doc, next);
}

// Split a text block at a cursor offset — returns [docWithSplit, newBlockId]
export function splitBlock(doc, blockId, offset) {
  const block = getBlock(doc, blockId);
  if (!block || block.text === null) return [doc, null];

  const before = block.text.slice(0, offset);
  const after  = block.text.slice(offset);

  const newBlock = createBlock('paragraph', { text: after });
  const updated  = updateBlock(doc, blockId, { text: before });
  const final    = insertBlockAfter(updated, blockId, newBlock);

  return [final, newBlock.id];
}

// Merge block into the one before it — returns [docWithMerge, prevBlockId, mergeOffset]
export function mergeBlockWithPrev(doc, blockId) {
  const prev = getBlockBefore(doc, blockId);
  const curr = getBlock(doc, blockId);
  if (!prev || !curr) return [doc, null, 0];
  if (prev.text === null || curr.text === null) return [doc, null, 0];

  const mergeOffset = prev.text.length;
  const merged      = updateBlock(doc, prev.id, { text: prev.text + curr.text });
  const removed     = removeBlock(merged, blockId);

  return [removed, prev.id, mergeOffset];
}

// ─── Serialise / deserialise ──────────────────────────────────────────────────
export function toJSON(doc) {
  return JSON.stringify(doc, null, 2);
}

export function fromJSON(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data?.blocks || !Array.isArray(data.blocks)) {
    throw new Error('[Griot] fromJSON: invalid document — missing blocks array');
  }
  return data;
}
