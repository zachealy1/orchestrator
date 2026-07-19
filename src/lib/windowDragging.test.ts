import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fullscreen: false,
  resizedHandler: null as (() => void) | null,
  focusHandler: null as (() => void) | null,
  resizeUnlisten: vi.fn(),
  focusUnlisten: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isFullscreen: vi.fn(async () => mocks.fullscreen),
    onResized: vi.fn(async (handler: () => void) => {
      mocks.resizedHandler = handler;
      return mocks.resizeUnlisten;
    }),
    onFocusChanged: vi.fn(async (handler: () => void) => {
      mocks.focusHandler = handler;
      return mocks.focusUnlisten;
    }),
  }),
}));

import {
  supportsMacOsWindowDragging,
  useMacOsWindowDragRegionsEnabled,
  windowDragRegionValue,
} from "./windowDragging";

describe("macOS window dragging", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.fullscreen = false;
    mocks.resizedHandler = null;
    mocks.focusHandler = null;
    mocks.resizeUnlisten.mockReset();
    mocks.focusUnlisten.mockReset();
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "MacIntel",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("enables custom regions only for the macOS Tauri runtime", () => {
    expect(
      supportsMacOsWindowDragging(true, "MacIntel", "AppleWebKit"),
    ).toBe(true);
    expect(
      supportsMacOsWindowDragging(false, "MacIntel", "AppleWebKit"),
    ).toBe(false);
    expect(
      supportsMacOsWindowDragging(true, "Win32", "AppleWebKit"),
    ).toBe(false);
  });

  it("explicitly blocks drag regions while disabled or fullscreen", () => {
    expect(windowDragRegionValue(false, "deep")).toBe("false");
    expect(windowDragRegionValue(false, "true")).toBe("false");
    expect(windowDragRegionValue(true, "deep")).toBe("deep");
    expect(windowDragRegionValue(true, "true")).toBe("true");
  });

  it("disables drag regions for native fullscreen and restores them afterward", async () => {
    const { result, unmount } = renderHook(() =>
      useMacOsWindowDragRegionsEnabled(),
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(true);

    mocks.fullscreen = true;
    act(() => mocks.resizedHandler?.());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current).toBe(false);

    mocks.fullscreen = false;
    act(() => mocks.focusHandler?.());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result.current).toBe(true);

    unmount();
    expect(mocks.resizeUnlisten).toHaveBeenCalledOnce();
    expect(mocks.focusUnlisten).toHaveBeenCalledOnce();
  });
});
