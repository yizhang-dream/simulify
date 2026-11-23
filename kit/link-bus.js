/**
 * Lightweight cross-view highlight, selection, and "Zoom to it" focus bus.
 * Synchronizes 3D meshes, 2D schematics/charts, LiveMathsPanel rows, and inspectors.
 */
export class LinkBus {
  constructor() {
    this.hoveredId = null;
    this.selectedId = null;
    this._hoverListeners = new Set();
    this._selectListeners = new Set();
    this._focusListeners = new Set();
  }

  /**
   * Broadcast hover target id (deduplicates repeated calls).
   * @param {string|null} id
   * @param {string} [source='unknown']
   */
  hover(id, source = 'unknown') {
    const next = id ?? null;
    if (next === this.hoveredId) return false;
    this.hoveredId = next;
    for (const fn of this._hoverListeners) {
      fn(this.hoveredId, source, this.getState());
    }
    return true;
  }

  /**
   * Clear hover state safely (optionally scoped or unconditional).
   * @param {string} [source='unknown']
   */
  clearHover(source = 'unknown') {
    return this.hover(null, source);
  }

  /**
   * Broadcast selected target id.
   * @param {string|null} id
   * @param {string} [source='unknown']
   */
  select(id, source = 'unknown') {
    const next = id ?? null;
    if (next === this.selectedId) return false;
    this.selectedId = next;
    for (const fn of this._selectListeners) {
      fn(this.selectedId, source, this.getState());
    }
    return true;
  }

  /**
   * Broadcast camera focus ("Zoom to it") request for target id.
   * @param {string} id
   * @param {string} [source='unknown']
   */
  focus(id, source = 'unknown') {
    if (!id) return false;
    this.select(id, source);
    for (const fn of this._focusListeners) {
      fn(id, source, this.getState());
    }
    return true;
  }

  getState() {
    return {
      hoveredId: this.hoveredId,
      selectedId: this.selectedId,
    };
  }

  onHover(fn) {
    if (typeof fn !== 'function') return () => {};
    this._hoverListeners.add(fn);
    return () => this._hoverListeners.delete(fn);
  }

  onSelect(fn) {
    if (typeof fn !== 'function') return () => {};
    this._selectListeners.add(fn);
    return () => this._selectListeners.delete(fn);
  }

  onFocus(fn) {
    if (typeof fn !== 'function') return () => {};
    this._focusListeners.add(fn);
    return () => this._focusListeners.delete(fn);
  }

  destroy() {
    this._hoverListeners.clear();
    this._selectListeners.clear();
    this._focusListeners.clear();
    this.hoveredId = null;
    this.selectedId = null;
  }
}
