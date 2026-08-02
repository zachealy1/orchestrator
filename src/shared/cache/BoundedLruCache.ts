export class BoundedLruCache<Key, Value> {
  readonly #entries = new Map<Key, Value>();

  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("A bounded cache requires a positive integer limit.");
    }
  }

  get size() {
    return this.#entries.size;
  }

  get(key: Key) {
    const value = this.#entries.get(key);
    if (value === undefined) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, value);
    return value;
  }

  peek(key: Key) {
    return this.#entries.get(key);
  }

  set(key: Key, value: Value) {
    this.#entries.delete(key);
    this.#entries.set(key, value);
    while (this.#entries.size > this.limit) {
      const oldestKey = this.#entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.#entries.delete(oldestKey);
    }
    return this;
  }

  delete(key: Key) {
    return this.#entries.delete(key);
  }

  deleteWhere(predicate: (key: Key, value: Value) => boolean) {
    for (const [key, value] of this.#entries) {
      if (predicate(key, value)) this.#entries.delete(key);
    }
  }

  keys() {
    return this.#entries.keys();
  }

  clear() {
    this.#entries.clear();
  }
}
