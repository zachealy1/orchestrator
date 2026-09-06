import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleAfterNextPaint, waitForNextPaint } from "./reactRuntime";

describe("paint scheduling", () => {
  let frame: FrameRequestCallback;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("lets the optimistic UI paint before starting work", () => {
    const work = vi.fn();
    scheduleAfterNextPaint(work);
    expect(work).not.toHaveBeenCalled();
    frame(0);
    vi.advanceTimersByTime(0);
    expect(work).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("starts once when WebKit suspends frames, including a late frame", () => {
    const work = vi.fn();
    scheduleAfterNextPaint(work);
    vi.advanceTimersByTime(100);
    expect(work).toHaveBeenCalledTimes(1);
    frame(100);
    vi.runAllTimers();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("cancels both the frame and fallback when a preparing task is stopped", () => {
    const work = vi.fn();
    const cancel = scheduleAfterNextPaint(work);
    cancel();
    frame(100);
    vi.runAllTimers();
    expect(work).not.toHaveBeenCalled();
  });

  it("also releases transcript paint waits without animation frames", async () => {
    const painted = waitForNextPaint();
    await vi.advanceTimersByTimeAsync(100);
    await expect(painted).resolves.toBeUndefined();
  });
});
