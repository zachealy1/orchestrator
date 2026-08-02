import { describe, expect, it, vi } from "vitest";
import { AsyncResourceCache } from "./AsyncResourceCache";

describe("AsyncResourceCache", () => {
  it("coalesces concurrent requests and reuses the loaded value", async () => {
    const load = vi.fn(async () => ({ value: 1 }));
    const cache = new AsyncResourceCache<string, { value: number }>(2);

    const [first, second] = await Promise.all([
      cache.getOrLoad("one", load),
      cache.getOrLoad("one", load),
    ]);
    const third = await cache.getOrLoad("one", load);

    expect(first).toBe(second);
    expect(third).toBe(first);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not retain failed requests", async () => {
    const cache = new AsyncResourceCache<string, string>(2);
    await expect(
      cache.getOrLoad("one", async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");

    await expect(cache.getOrLoad("one", async () => "ok")).resolves.toBe("ok");
  });
});
