// ─── History.js ───────────────────────────────────────────────────────────────
// Linear undo/redo stack. Stores immutable document snapshots.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_HISTORY = 200;

export class History {
  constructor(initialDoc) {
    this._stack  = initialDoc ? [initialDoc] : [];
    this._cursor = this._stack.length - 1;
  }

  get current() { return this._stack[this._cursor] ?? null; }
  canUndo()     { return this._cursor > 0; }
  canRedo()     { return this._cursor < this._stack.length - 1; }

  /** Push a new snapshot, discarding any redo future. */
  push(doc) {
    this._stack = this._stack.slice(0, this._cursor + 1);
    this._stack.push(doc);
    if (this._stack.length > MAX_HISTORY) this._stack.shift();
    this._cursor = this._stack.length - 1;
  }

  /** Replace the current snapshot in-place (no new undo point). */
  replace(doc) {
    if (this._cursor >= 0) this._stack[this._cursor] = doc;
    else this.push(doc);
  }

  undo() { if (this.canUndo()) this._cursor--; return this.current; }
  redo() { if (this.canRedo()) this._cursor++; return this.current; }
}