// ─── History.js ───────────────────────────────────────────────────────────────
// Linear undo/redo stack.
// Works with immutable document snapshots — just push the whole doc each time.
// ─────────────────────────────────────────────────────────────────────────────

export class History {
  constructor(initialDoc, { maxDepth = 100 } = {}) {
    this._stack    = [initialDoc];
    this._cursor   = 0;
    this._maxDepth = maxDepth;
  }

  // Current document
  get current() { return this._stack[this._cursor]; }

  get canUndo() { return this._cursor > 0; }
  get canRedo() { return this._cursor < this._stack.length - 1; }

  // Push a new state (truncates any redo branch)
  push(doc) {
    // Truncate future if we're not at the top
    this._stack = this._stack.slice(0, this._cursor + 1);
    this._stack.push(doc);

    // Enforce max depth
    if (this._stack.length > this._maxDepth) {
      this._stack = this._stack.slice(this._stack.length - this._maxDepth);
    }

    this._cursor = this._stack.length - 1;
    return this;
  }

  undo() {
    if (!this.canUndo) return this.current;
    this._cursor--;
    return this.current;
  }

  redo() {
    if (!this.canRedo) return this.current;
    this._cursor++;
    return this.current;
  }

  // Replace current snapshot without branching (for transient changes
  // like typing individual characters — debounce the push externally)
  replace(doc) {
    this._stack[this._cursor] = doc;
    return this;
  }

  clear(doc) {
    this._stack  = [doc];
    this._cursor = 0;
    return this;
  }
}
