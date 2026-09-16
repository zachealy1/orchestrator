import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefreshWorkspaceGitStatusOptions } from "./runtimeState";
import { WorkspaceRefreshController } from "./WorkspaceRefreshController";

const active = { id: 1, path: "/active" };
const inactive = { id: 2, path: "/inactive" };
let visible: boolean;
let controller: WorkspaceRefreshController<typeof active>;
const refresh = vi.fn<(workspace: typeof active, options: RefreshWorkspaceGitStatusOptions) => Promise<void>>(async () => {});
const directories = vi.fn<(workspace: typeof active) => Promise<void>>(async () => {});
const defer = vi.fn(() => false);
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
function hide(hidden: boolean) {
  visible = !hidden;
  document.dispatchEvent(new Event("visibilitychange"));
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  visible = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visible ? "visible" : "hidden");
  refresh.mockReset().mockResolvedValue(undefined);
  directories.mockReset().mockResolvedValue(undefined);
  defer.mockReset().mockReturnValue(false);
  controller = new WorkspaceRefreshController({ refresh, refreshDirectories: directories, shouldDefer: defer });
});
afterEach(() => {
  controller.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("WorkspaceRefreshController", () => {
  it("checks the selected workspace every 5s and others every 30s", async () => {
    controller.update([active, inactive], active.id);
    await advance(0);
    expect(refresh.mock.calls.map(([workspace]) => workspace)).toEqual([active, inactive]);
    refresh.mockClear();
    await advance(29_999);
    expect(refresh).toHaveBeenCalledTimes(5);
    expect(refresh.mock.calls.every(([workspace]) => workspace === active)).toBe(true);
    await advance(1);
    expect(refresh.mock.calls.slice(-2).map(([workspace]) => workspace)).toEqual([active, inactive]);
    expect(directories).toHaveBeenCalledWith(inactive);
  });

  it("switches immediately and recalculates both workspace deadlines", async () => {
    controller.update([active, inactive], active.id);
    await advance(1_000);
    refresh.mockClear();
    controller.update([active, inactive], inactive.id);
    await advance(0);
    expect(refresh).toHaveBeenCalledExactlyOnceWith(inactive, { force: true });
    refresh.mockClear();
    await advance(5_000);
    expect(refresh).toHaveBeenCalledExactlyOnceWith(inactive, { background: true, showLoading: false });
    expect(refresh.mock.calls.some(([workspace]) => workspace === active)).toBe(false);
  });

  it("removes the polling timer while hidden, but accepts explicit invalidations", async () => {
    controller.update([active, inactive], active.id);
    await advance(0);
    hide(true);
    expect(vi.getTimerCount()).toBe(0);
    refresh.mockClear();
    await advance(60_000);
    expect(refresh).not.toHaveBeenCalled();
    await controller.request(inactive, { force: true });
    expect(refresh).toHaveBeenCalledExactlyOnceWith(inactive, { force: true });
    expect(vi.getTimerCount()).toBe(0);
    refresh.mockClear();
    hide(false);
    await advance(0);
    expect(refresh).toHaveBeenCalledExactlyOnceWith(active, { showLoading: false, force: true });
    await advance(5_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("resumes with the selected workspace followed by overdue inactive workspaces", async () => {
    controller.update([active, inactive], active.id);
    await advance(0);
    hide(true);
    await advance(60_000);
    refresh.mockClear();
    hide(false);
    await advance(0);
    expect(refresh.mock.calls.map(([workspace]) => workspace)).toEqual([active, inactive]);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("waits for the selected resume refresh before checking inactive workspaces", async () => {
    controller.update([active, inactive], active.id);
    await advance(0);
    hide(true);
    await advance(60_000);
    refresh.mockClear();
    const blocked = deferred();
    refresh.mockImplementationOnce(() => blocked.promise);
    hide(false);
    await advance(0);
    expect(refresh).toHaveBeenCalledExactlyOnceWith(active, { showLoading: false, force: true });
    expect(vi.getTimerCount()).toBe(0);
    blocked.resolve();
    await advance(0);
    expect(refresh.mock.calls.map(([workspace]) => workspace)).toEqual([active, inactive]);
  });

  it("coalesces invalidations during a poll into one forced follow-up without overlap", async () => {
    const blocked = deferred();
    refresh.mockImplementationOnce(() => blocked.promise);
    controller.update([active], active.id);
    await advance(0);
    const first = controller.request(active, { force: true, showLoading: false });
    const second = controller.request(active, { force: true });
    expect(first).toBe(second);
    expect(refresh).toHaveBeenCalledTimes(1);
    blocked.resolve();
    await first;
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenLastCalledWith(active, { force: true, showLoading: false });
  });

  it("forces a fresh result on resume even with an outstanding pre-hide poll", async () => {
    controller.update([active], active.id);
    await advance(0);
    const blocked = deferred();
    refresh.mockImplementationOnce(() => blocked.promise);
    await advance(5_000);
    hide(true);
    hide(false);
    expect(refresh).toHaveBeenCalledTimes(2);
    blocked.resolve();
    await advance(0);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(refresh).toHaveBeenLastCalledWith(active, { showLoading: false, force: true });
  });

  it("defers only background work during interaction and continues after failures", async () => {
    defer.mockReturnValue(true);
    controller.update([active, inactive], active.id);
    await advance(1_000);
    expect(refresh).toHaveBeenCalledExactlyOnceWith(active, { force: true });
    refresh.mockRejectedValueOnce(new Error("git unavailable"));
    defer.mockReturnValue(false);
    await advance(500);
    expect(refresh).toHaveBeenCalledTimes(2);
    await advance(30_000);
    expect(refresh.mock.calls.filter(([workspace]) => workspace === inactive)).toHaveLength(2);
  });

  it("discards removed locations and does not overlap a relocated workspace's requests", async () => {
    const blocked = deferred();
    refresh.mockImplementationOnce(() => blocked.promise);
    controller.update([active, inactive], active.id);
    await advance(0);
    const relocated = { ...active, path: "/new" };
    controller.update([relocated], active.id);
    expect(refresh).toHaveBeenCalledTimes(2);
    blocked.resolve();
    await advance(0);
    expect(refresh).toHaveBeenLastCalledWith(relocated, { force: true });
    refresh.mockClear();
    await controller.request(active, { force: true });
    await controller.request(inactive, { force: true });
    expect(refresh).not.toHaveBeenCalled();
    controller.dispose();
    hide(true);
    hide(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
