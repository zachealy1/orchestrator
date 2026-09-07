import { describe, expect, it, vi } from "vitest";
import { loadBrowserRuntimeStatus } from "./runtimeStatus";

const runtime = {
  name: "cua_repl", pluginId: "unified-computer-use@openai-bundled",
  runtimeStatus: null, tools: { js: { name: "js" }, js_reset: { name: "js_reset" } },
};

describe("browser runtime status", () => {
  it("recognizes the current Unified Computer Use inventory without claiming a backend connection", async () => {
    const result = await loadBrowserRuntimeStatus(async () => ({ data: [runtime] }));
    expect(result.status).toBe("available");
    expect(result.message).toContain("connection is checked when a task uses it");
  });

  it("follows pagination to find the browser runtime", async () => {
    const read = vi.fn().mockResolvedValueOnce({ data: [], nextCursor: "next" })
      .mockResolvedValueOnce({ data: [runtime], nextCursor: null });
    expect((await loadBrowserRuntimeStatus(read)).status).toBe("available");
    expect(read.mock.calls).toEqual([[null], ["next"]]);
  });

  it.each(["failed", "disabled", "authenticationRequired", "cancelled"])("does not hide a %s runtime behind cached tools", async (runtimeStatus) => {
    const result = await loadBrowserRuntimeStatus(async () => ({ data: [{ ...runtime, runtimeStatus }] }));
    expect(result.status).toBe("unavailable");
    expect(result.message).toContain(runtimeStatus);
  });

  it.each(["starting", "notStarted"])("does not label a %s runtime ready", async (runtimeStatus) => {
    expect((await loadBrowserRuntimeStatus(async () => ({ data: [{ ...runtime, runtimeStatus }] }))).status).toBe("unknown");
  });

  it("does not infer browser support from unrelated JavaScript tools or a missing runtime", async () => {
    expect((await loadBrowserRuntimeStatus(async () => ({ data: [{ ...runtime, name: "node_repl" }] }))).status).toBe("unknown");
    expect((await loadBrowserRuntimeStatus(async () => ({ data: [] }))).status).toBe("unknown");
    expect((await loadBrowserRuntimeStatus(async () => ({ data: [{ ...runtime, tools: {} }] }))).status).toBe("unknown");
  });

  it("fails a malformed or cyclic status response instead of silently saying unavailable", async () => {
    await expect(loadBrowserRuntimeStatus(async () => ({ data: [], nextCursor: "repeat" }))).rejects.toThrow("incomplete");
    await expect(loadBrowserRuntimeStatus(async () => null as never)).rejects.toThrow("invalid");
  });
});
