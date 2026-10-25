export class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }

  has(key) {
    return this.values.has(key);
  }

  // The real `localStorage` can be enumerated, and the data-portability code
  // depends on it: an export lists every app-owned key, and a wipe removes
  // them. The double implements the same two members so the tests exercise
  // the real enumeration path rather than a stubbed list.
  get length() {
    return this.values.size;
  }

  key(index) {
    const keys = [...this.values.keys()];
    const position = Number(index);
    if (!Number.isInteger(position) || position < 0 || position >= keys.length) {
      return null;
    }
    return keys[position];
  }
}
