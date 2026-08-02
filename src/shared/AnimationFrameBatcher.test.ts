import { describe, expect, it, vi } from "vitest";
import { AnimationFrameBatcher } from "./AnimationFrameBatcher";

describe("AnimationFrameBatcher", () => {
  it("schedules one frame and drains values in insertion order", () => {
    const callbacks: FrameRequestCallback[] = [];
    const ready = vi.fn();
    const batcher = new AnimationFrameBatcher<number>((next) => {
      callbacks.push(next);
      return 7;
    }, vi.fn());

    batcher.enqueue(1, ready);
    batcher.enqueue(2, ready);
    expect(ready).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(1);
    callbacks[0]?.(0);

    expect(ready).toHaveBeenCalledTimes(1);
    expect(batcher.drain()).toEqual([1, 2]);
  });

  it("cancels pending work on dispose", () => {
    const cancel = vi.fn();
    const batcher = new AnimationFrameBatcher<number>(() => 11, cancel);
    batcher.enqueue(1, vi.fn());

    batcher.dispose();

    expect(cancel).toHaveBeenCalledWith(11);
    expect(batcher.drain()).toEqual([]);
  });
});
