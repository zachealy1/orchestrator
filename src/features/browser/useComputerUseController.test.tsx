import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readDesktopRuntimeStatus } from "../../codexClient";
import type { CodexPluginCatalog } from "../plugins/types";
import type { BrowserRuntimeStatus } from "./runtimeStatus";
import { useComputerUseController } from "./useComputerUseController";

vi.mock("../../codexClient", () => ({ readDesktopRuntimeStatus: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function catalog(refreshedAt: string, enabled = true): CodexPluginCatalog {
  const browser = {
    id: "browser@openai-bundled", name: "browser", displayName: "Browser",
    description: null, marketplaceName: "openai-bundled", marketplacePath: null,
    version: "26.901.51231", installed: true, enabled,
    installPolicy: "AVAILABLE" as const, authPolicy: "ON_USE" as const,
    mustShowInstallationInterstitial: false, available: true, unavailableReason: null,
    keywords: [], capabilities: ["Interactive"], logoUrl: null,
    readiness: { skills: 0, apps: 0, mcpServers: 0, hooks: 1 },
  };
  return {
    marketplaces: [{ name: "openai-bundled", path: null, plugins: [browser] }],
    plugins: [browser], featuredPluginIds: [], errors: [], refreshedAt,
  };
}

const available: BrowserRuntimeStatus = { status: "available", message: "Browser tools available." };
const unavailable: BrowserRuntimeStatus = { status: "unavailable", message: "Runtime failed." };

describe("useComputerUseController", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(readDesktopRuntimeStatus).mockResolvedValue({
      available: true, version: "1.0.1000816", serviceCompatible: true,
      accessibilityTrusted: true, screenRecordingTrusted: true, message: null,
    });
  });

  it("uses runtime availability without requiring any Browser skills", async () => {
    const { result } = renderHook(() => useComputerUseController({
      pluginCatalog: catalog("first"), browserProfileKey: "default",
      loadBrowserRuntimeStatus: async () => available,
    }));
    expect(result.current.browserReadiness.checking).toBe(true);
    await waitFor(() => expect(result.current.browserReadiness.available).toBe(true));
  });

  it("invalidates probes on account and catalog changes and ignores out-of-order results", async () => {
    const old = deferred<BrowserRuntimeStatus>();
    const current = deferred<BrowserRuntimeStatus>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise).mockResolvedValue(available);
    const { result, rerender } = renderHook(
      ({ profile, revision }) => useComputerUseController({
        pluginCatalog: catalog(revision), browserProfileKey: profile, loadBrowserRuntimeStatus: load,
      }), { initialProps: { profile: "default", revision: "first" } },
    );
    rerender({ profile: "account:2", revision: "first" });
    await act(async () => { current.resolve(unavailable); });
    await waitFor(() => expect(result.current.browserReadiness.message).toBe("Runtime failed."));
    await act(async () => { old.resolve(available); });
    expect(result.current.browserReadiness.available).toBe(false);
    rerender({ profile: "account:2", revision: "refreshed" });
    await waitFor(() => expect(result.current.browserReadiness.available).toBe(true));
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("treats failed checks as unknown and retries explicitly and on focus", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("Disconnected")).mockResolvedValue(available);
    const { result } = renderHook(() => useComputerUseController({
      pluginCatalog: catalog("first"), browserProfileKey: "default", loadBrowserRuntimeStatus: load,
    }));
    await waitFor(() => expect(result.current.browserReadiness.checkFailed).toBe(true));
    expect(result.current.browserReadiness.message).toContain("does not mean browsing is unavailable");
    await act(async () => { await result.current.refreshBrowserRuntimeStatus(); });
    expect(result.current.browserReadiness.available).toBe(true);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("does not probe a disabled plugin or accept its pending result", async () => {
    const pending = deferred<BrowserRuntimeStatus>();
    const load = vi.fn().mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(({ enabled }) => useComputerUseController({
      pluginCatalog: catalog("first", enabled), browserProfileKey: "default", loadBrowserRuntimeStatus: load,
    }), { initialProps: { enabled: true } });
    rerender({ enabled: false });
    await act(async () => { pending.resolve(available); });
    expect(result.current.browserReadiness).toMatchObject({ available: false, checking: false });
    expect(result.current.browserReadiness.message).toContain("Enable the Browser plugin");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("refreshes on becoming visible and removes listeners on unmount", async () => {
    const load = vi.fn().mockResolvedValue(available);
    const visibility = vi.spyOn(document, "visibilityState", "get");
    try {
      const { result, unmount } = renderHook(() => useComputerUseController({
        pluginCatalog: catalog("first"), browserProfileKey: "default", loadBrowserRuntimeStatus: load,
      }));
      await waitFor(() => expect(result.current.browserReadiness.available).toBe(true));
      visibility.mockReturnValue("hidden");
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        window.dispatchEvent(new Event("focus"));
      });
      expect(load).toHaveBeenCalledTimes(1);
      visibility.mockReturnValue("visible");
      await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
      expect(load).toHaveBeenCalledTimes(2);
      unmount();
      window.dispatchEvent(new Event("focus"));
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      visibility.mockRestore();
    }
  });
});
