import { describe, expect, it } from "vitest";
import {
  HistoricalTranscriptCache,
  type StableHistoryChatCacheEntry,
} from "./HistoricalTranscriptCache";

const entry = (version: string, sourceCharacters: number) =>
  ({ version, sourceCharacters }) as StableHistoryChatCacheEntry;

describe("HistoricalTranscriptCache", () => {
  it("evicts least-recently-used entries by count", () => {
    const cache = new HistoricalTranscriptCache(2, 100);
    cache.set(1, entry("one", 10));
    cache.set(2, entry("two", 10));
    cache.get(1);
    cache.set(3, entry("three", 10));

    expect(cache.get(1)?.version).toBe("one");
    expect(cache.get(2)).toBeUndefined();
    expect(cache.get(3)?.version).toBe("three");
  });

  it("enforces the source-character budget", () => {
    const cache = new HistoricalTranscriptCache(5, 20);
    cache.set(1, entry("one", 12));
    cache.set(2, entry("two", 12));
    cache.set(3, entry("oversized", 21));

    expect(cache.get(1)).toBeUndefined();
    expect(cache.get(2)?.version).toBe("two");
    expect(cache.get(3)).toBeUndefined();
  });
});
