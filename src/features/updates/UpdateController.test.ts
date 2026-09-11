import { describe, expect, it, vi } from "vitest";
import { initialUpdateState, UpdateController, updateActionLabel } from "./UpdateController";
import { assertWorkMayStart } from "../../shared/updateInterlock";

function fixture() {
  const storage = new Map<string, string>();
  let time = 0;
  const deps = { check: vi.fn().mockResolvedValue({ ...initialUpdateState, phase: "available", version: "0.2.0-beta.2" }),
    download: vi.fn().mockResolvedValue({ ...initialUpdateState, phase: "ready", version: "0.2.0-beta.2" }),
    install: vi.fn().mockResolvedValue({ ...initialUpdateState, phase: "ready", version: "0.2.0-beta.2" }),
    busy: vi.fn(() => false), flush: vi.fn(async () => {}), notify: vi.fn(), openDownloads: vi.fn(async () => {}),
    storage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } }, now: () => time,
  };
  return { deps, controller: new UpdateController(deps), advance: (ms: number) => { time += ms; } };
}
describe("application updates", () => {
  it("never downloads during detection and announces once across controller remounts", async () => {
    const { deps, controller } = fixture();
    await controller.check("startup"); await controller.check();
    expect(deps.download).not.toHaveBeenCalled(); expect(deps.notify).toHaveBeenCalledTimes(1);
    await new UpdateController(deps).check("startup"); expect(deps.notify).toHaveBeenCalledTimes(1);
  });
  it("throttles foreground checks and refreshes every six hours", async () => {
    const { deps, controller, advance } = fixture();
    await controller.check("startup"); await controller.check("foreground");
    expect(deps.check).toHaveBeenCalledTimes(1);
    advance(15 * 60 * 1000); await controller.check("foreground");
    expect(deps.check).toHaveBeenCalledTimes(2);
    advance(6 * 60 * 60 * 1000); await controller.check("timer");
    expect(deps.check).toHaveBeenCalledTimes(3);
  });
  it("requires separate download and install actions, flushes under an interlock", async () => {
    const { deps, controller } = fixture();
    await controller.check(); await controller.act();
    expect(deps.install).not.toHaveBeenCalled();
    deps.flush.mockImplementation(async () => { expect(assertWorkMayStart).toThrow(); });
    await controller.act(); expect(deps.flush).toHaveBeenCalledOnce(); expect(deps.install).toHaveBeenCalledOnce();
    expect(assertWorkMayStart).not.toThrow();
  });
  it("does not stop or install over hidden work, and releases the barrier after refusal", async () => {
    const { deps, controller } = fixture();
    await controller.check(); await controller.act(); deps.busy.mockReturnValue(true);
    await controller.act(); expect(deps.install).not.toHaveBeenCalled(); expect(deps.flush).not.toHaveBeenCalled();
    expect(controller.getSnapshot().message).toContain("Finish active tasks"); expect(assertWorkMayStart).not.toThrow();
  });
  it("does not install when persistence fails", async () => {
    const { deps, controller } = fixture(); await controller.check(); await controller.act();
    deps.flush.mockRejectedValue(new Error("Disk full")); await controller.act();
    expect(deps.install).not.toHaveBeenCalled(); expect(controller.getSnapshot().message).toContain("Disk full");
    expect(assertWorkMayStart).not.toThrow();
  });
  it("keeps background failures quiet and opens downloads for a manual fallback", async () => {
    const { deps, controller } = fixture(); deps.check.mockRejectedValue(new Error("Offline"));
    await controller.check("startup"); expect(controller.getSnapshot().message).toBeNull();
    expect(deps.openDownloads).not.toHaveBeenCalled();
    expect(updateActionLabel(controller.getSnapshot())).toBe("Download latest version");
    await controller.act(); expect(deps.openDownloads).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().message).toBeNull();
    expect(deps.download).not.toHaveBeenCalled();
  });
  it("allows retry after a failed download and prevents duplicate clicks", async () => {
    const { deps, controller } = fixture(); await controller.check();
    deps.download.mockRejectedValueOnce(new Error("Invalid signature"));
    await Promise.all([controller.act(), controller.act()]); expect(deps.download).toHaveBeenCalledOnce();
    expect(updateActionLabel(controller.getSnapshot())).toBe("Retry download");
    await controller.act(); expect(updateActionLabel(controller.getSnapshot())).toBe("Install and restart");
  });
});
