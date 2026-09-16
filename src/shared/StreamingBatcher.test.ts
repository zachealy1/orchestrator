import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamingBatcher } from "./StreamingBatcher";

let visible = true;
let batcher: StreamingBatcher<number>;
let batches: number[][];
let ready: () => void;
function hide(hidden: boolean) {
  visible = !hidden;
  document.dispatchEvent(new Event("visibilitychange"));
}
beforeEach(() => {
  vi.useFakeTimers();
  visible = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible ? "visible" : "hidden");
  batcher = new StreamingBatcher();
  batches = [];
  ready = () => batches.push(batcher.drain());
});
afterEach(() => {
  batcher.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("StreamingBatcher", () => {
  it("coalesces rapid output in order at 50ms without requesting frames", () => {
    const frames = vi.spyOn(window, "requestAnimationFrame");
    for (let i = 0; i < 100; i++) batcher.enqueue(i, ready);
    vi.advanceTimersByTime(49);
    expect(batches).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(batches).toEqual([Array.from({ length: 100 }, (_, i) => i)]);
    expect(frames).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reduces hidden output at 100ms and reschedules on visibility changes", () => {
    batcher.enqueue(1, ready);
    hide(true);
    vi.advanceTimersByTime(99);
    expect(batches).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(batches).toEqual([[1]]);
    batcher.enqueue(2, ready);
    hide(false);
    vi.advanceTimersByTime(50);
    expect(batches).toEqual([[1], [2]]);
  });

  it("bounds the pending queue at 500 events, including while hidden", () => {
    hide(true);
    for (let i = 0; i < 1_001; i++) batcher.enqueue(i, ready);
    expect(batches.map((batch) => batch.length)).toEqual([500, 500]);
    vi.advanceTimersByTime(100);
    expect(batches.flat()).toEqual(Array.from({ length: 1_001 }, (_, i) => i));
  });

  it("drains synchronously before lifecycle events and cancels work on dispose", () => {
    batcher.enqueue(1, ready);
    expect(batcher.drain()).toEqual([1]);
    vi.advanceTimersByTime(100);
    expect(batches).toEqual([]);
    batcher.enqueue(2, ready);
    batcher.dispose();
    hide(true);
    batcher.enqueue(3, ready);
    expect(batcher.drain()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
