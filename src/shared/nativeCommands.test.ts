import { describe, expect, it, vi, afterEach } from "vitest";
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
import { applicationInvoke, flushNativeCommands } from "./nativeCommands";
import { reserveUpdateInstallation } from "./updateInterlock";
afterEach(() => vi.clearAllMocks());
describe("generated native command transport", () => {
  it("rejects new work during installation but allows the final event flush and updater", async () => {
    invokeMock.mockResolvedValue(null);
    const release = reserveUpdateInstallation();
    try {
      await expect(applicationInvoke("codex_rpc", { method: "turn/start" })).rejects.toThrow("update is being installed");
      await expect(applicationInvoke("commit_workspace")).rejects.toThrow();
      await applicationInvoke("append_run_events_transaction"); await applicationInvoke("app_update_install");
      expect(invokeMock).toHaveBeenCalledTimes(2);
    } finally { release(); }
  });
  it("waits for in-flight native persistence before installation", async () => {
    let finish!: () => void;
    invokeMock.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const request = applicationInvoke("save_run"); const flushed = vi.fn();
    const flush = flushNativeCommands().then(flushed); await Promise.resolve(); expect(flushed).not.toHaveBeenCalled();
    finish(); await request; await flush; expect(flushed).toHaveBeenCalledOnce();
  });
});
