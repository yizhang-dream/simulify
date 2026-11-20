/**
 * Storage adapters & mastery progress store decoupled for both Web static hosting
 * and offline Desktop Software wrappers (Tauri / Electron / WebView2 IPC).
 */

export function createMemoryStorage() {
  const store = new Map();
  return {
    get(key, fallback = null) {
      return store.has(key) ? store.get(key) : fallback;
    },
    set(key, value) {
      store.set(key, value);
    },
    remove(key) {
      store.delete(key);
    },
  };
}

export function createLocalStorage(prefix = 'simulify:') {
  return {
    get(key, fallback = null) {
      try {
        const raw = globalThis.localStorage?.getItem(`${prefix}${key}`);
        return raw !== null && raw !== undefined ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        globalThis.localStorage?.setItem(`${prefix}${key}`, JSON.stringify(value));
      } catch {
        // Ignore quota / sandbox restrictions cleanly
      }
    },
    remove(key) {
      try {
        globalThis.localStorage?.removeItem(`${prefix}${key}`);
      } catch {
        // Ignore
      }
    },
  };
}

export function createCustomStorage(bridge) {
  if (!bridge || typeof bridge.get !== 'function' || typeof bridge.set !== 'function') {
    throw new Error('createCustomStorage requires { get, set, remove? } bridge.');
  }
  return {
    get: (k, fb = null) => bridge.get(k, fb),
    set: (k, v) => bridge.set(k, v),
    remove: (k) => bridge.remove?.(k),
  };
}

export class MasteryStore {
  /**
   * @param {{ get: Function, set: Function, remove?: Function }} storage
   * @param {string[]} itemIds
   * @param {string} [storageKey='mastery']
   */
  constructor(storage, itemIds = [], storageKey = 'mastery') {
    this.storage = storage || createMemoryStorage();
    this.itemIds = [...new Set(itemIds)];
    this.storageKey = storageKey;
    const saved = this.storage.get(this.storageKey, []);
    this.done = new Set(Array.isArray(saved) ? saved : []);
    this._subs = new Set();
  }

  markDone(id) {
    if (!id || this.done.has(id)) return false;
    this.done.add(id);
    this.#persist();
    return true;
  }

  unmark(id) {
    if (!this.done.has(id)) return false;
    this.done.delete(id);
    this.#persist();
    return true;
  }

  isDone(id) {
    return this.done.has(id);
  }

  setItems(itemIds) {
    this.itemIds = [...new Set(itemIds)];
    this.#notify();
  }

  getProgress() {
    const total = this.itemIds.length;
    const done = this.itemIds.filter((id) => this.done.has(id)).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { done, total, pct };
  }

  reset() {
    this.done.clear();
    this.storage.remove?.(this.storageKey);
    this.#notify();
  }

  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    this._subs.add(fn);
    fn(this.getProgress());
    return () => this._subs.delete(fn);
  }

  #persist() {
    this.storage.set(this.storageKey, [...this.done]);
    this.#notify();
  }

  #notify() {
    const progress = this.getProgress();
    for (const fn of this._subs) {
      fn(progress);
    }
  }
}
