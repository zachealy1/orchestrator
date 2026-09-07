import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useEngineController } from "./useEngineController";
import { readEngineStatus } from "./api";
import type { CodexEngineStatus } from "../../generated/tauri";

vi.mock("./api", () => ({ readEngineStatus: vi.fn() }));
const current: CodexEngineStatus = {
  source: "managed", installedVersion: "0.153.4", message: null,
};
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

it("reads the engine once without polling or checking on focus, reconnect, or visibility", async () => {
  vi.useFakeTimers();
  vi.mocked(readEngineStatus).mockResolvedValue(current);
  const { result, unmount } = renderHook(() => useEngineController(true));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(result.current.status).toEqual(current);
  expect(result.current.busy).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(readEngineStatus).toHaveBeenCalledTimes(1);
  expect(result.current).not.toHaveProperty("check");
  expect(result.current).not.toHaveProperty("install");
  expect(result.current).not.toHaveProperty("announcement");
  expect(vi.getTimerCount()).toBe(0);
  unmount();
});

it("allows retrying failed initial provisioning without checking for releases", async () => {
  vi.mocked(readEngineStatus)
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue(current);
  const { result } = renderHook(() => useEngineController(true));
  await act(async () => { await Promise.resolve(); });
  expect(result.current.error).toBe("Offline");
  await act(() => result.current.retry());
  expect(result.current.error).toBeNull();
  expect(result.current.status).toEqual(current);
  expect(readEngineStatus).toHaveBeenCalledTimes(2);
});

it("does not run when disabled", async () => {
  const { result } = renderHook(() => useEngineController(false));
  await act(() => result.current.retry());
  expect(readEngineStatus).not.toHaveBeenCalled();
  expect(result.current.busy).toBe(false);
});

it("ignores stale setup responses after disabling and re-enabling", async () => {
  let resolveFirst!: (value: CodexEngineStatus) => void;
  vi.mocked(readEngineStatus)
    .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
    .mockResolvedValue(current);
  const { result, rerender } = renderHook(({ enabled }) => useEngineController(enabled), {
    initialProps: { enabled: true },
  });
  rerender({ enabled: false });
  expect(result.current.busy).toBe(false);
  rerender({ enabled: true });
  await act(async () => { await Promise.resolve(); });
  await act(async () => { resolveFirst({ ...current, installedVersion: "0.100.0" }); });
  expect(result.current.status).toEqual(current);
});

it("does not start duplicate setup requests while busy", async () => {
  let resolveStatus!: (value: CodexEngineStatus) => void;
  vi.mocked(readEngineStatus).mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }));
  const { result } = renderHook(() => useEngineController(true));
  expect(result.current.busy).toBe(true);
  await act(() => result.current.retry());
  expect(readEngineStatus).toHaveBeenCalledTimes(1);
  await act(async () => { resolveStatus(current); });
  expect(result.current.busy).toBe(false);
});
