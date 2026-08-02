import { BoundedLruCache } from "./BoundedLruCache";

export class AsyncResourceCache<Key, Value> {
  private readonly values: BoundedLruCache<Key, Value>;
  private readonly requests = new Map<Key, Promise<Value>>();

  constructor(limit: number) {
    this.values = new BoundedLruCache(limit);
  }

  async getOrLoad(key: Key, load: () => Promise<Value>): Promise<Value> {
    const cached = this.values.get(key);
    if (cached !== undefined) return cached;
    const existing = this.requests.get(key);
    if (existing) return existing;

    const request = load();
    this.requests.set(key, request);
    try {
      const value = await request;
      this.values.set(key, value);
      return value;
    } finally {
      if (this.requests.get(key) === request) this.requests.delete(key);
    }
  }

  delete(key: Key): void {
    this.values.delete(key);
    this.requests.delete(key);
  }

  clear(): void {
    this.values.clear();
    this.requests.clear();
  }
}
