import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useModelCatalog } from "./useModelCatalog";
import type { CodexModel } from "./types";
const model = (id: string): CodexModel => ({ id, model: id, displayName: id, description: "", hidden: false, isDefault: true, supportedReasoningEfforts: [], defaultReasoningEffort: "low" });
function fixture() {
  return { accountId: 1 as number | null, accountIdRef: { current: 1 as number | null }, enabled: true,
    load: vi.fn<(id: number) => Promise<CodexModel[]>>(), setModels: vi.fn(), setSelectedModelId: vi.fn(), setSelectedReasoningEffort: vi.fn(), setModelLoadError: vi.fn() };
}
afterEach(() => vi.useRealTimers());
describe("model discovery", () => {
  it("keeps the current account's working models after an offline refresh", async () => {
    const input = fixture(); input.load.mockResolvedValueOnce([model("available")]).mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useModelCatalog(input));
    await act(() => result.current.refresh(1));
    await act(() => result.current.refresh(1));
    expect(input.setModels).toHaveBeenLastCalledWith([model("available")]);
    expect(input.setModelLoadError).toHaveBeenLastCalledWith(null);
    expect(result.current.notice).toContain("last available list");
  });
  it("ignores stale account responses and never gives another account the cached list", async () => {
    const input = fixture(); let complete!: (models: CodexModel[]) => void;
    input.load.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const { result, rerender } = renderHook(() => useModelCatalog(input));
    let pending!: Promise<void>;
    act(() => { pending = result.current.refresh(1); });
    await act(async () => { await Promise.resolve(); });
    input.accountId = 2; input.accountIdRef.current = 2; rerender();
    await act(async () => { complete([model("account-one")]); await pending; });
    expect(input.setModels).not.toHaveBeenCalled();
    input.load.mockRejectedValueOnce(new Error("offline"));
    await act(() => result.current.refresh(2));
    expect(input.setModels).toHaveBeenLastCalledWith([]);
  });
  it("deduplicates overlapping requests and refreshes on the timer and resumed connectivity", async () => {
    vi.useFakeTimers(); const input = fixture(); input.load.mockResolvedValue([model("first")]);
    const { result, unmount } = renderHook(() => useModelCatalog(input));
    await act(async () => { await Promise.all([result.current.refresh(1), result.current.refresh(1)]); });
    expect(input.load).toHaveBeenCalledTimes(1);
    input.load.mockResolvedValue([model("new-model")]);
    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60_000); });
    expect(input.setModels).toHaveBeenLastCalledWith([model("new-model")]);
    await act(async () => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); });
    expect(input.load).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); window.dispatchEvent(new Event("online")); });
    expect(input.load).toHaveBeenCalledTimes(3);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60_000); window.dispatchEvent(new Event("focus")); });
    expect(input.load).toHaveBeenCalledTimes(3);
  });
});

it("does not repopulate a signed-out account with a late response", async () => {
  const input = fixture(); let complete!: (models: CodexModel[]) => void;
  input.load.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const { result, rerender } = renderHook(() => useModelCatalog(input));
  let pending!: Promise<void>;
  act(() => { pending = result.current.refresh(1); });
  await act(async () => { await Promise.resolve(); });
  input.enabled = false; rerender();
  await act(async () => { complete([model("late")]); await pending; });
  expect(input.setModels).not.toHaveBeenCalled();
});
