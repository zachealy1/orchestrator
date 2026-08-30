import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  installCodexPlugin,
  listCodexPlugins,
  readCachedCodexPlugins,
  readCodexPlugin,
  setCodexPluginEnabled,
  uninstallCodexPlugin,
} from "./api";
import type { CodexPluginCatalog } from "./types";
import { usePluginsController } from "./usePluginsController";

vi.mock("./api", () => ({
  installCodexPlugin: vi.fn(),
  listCodexPlugins: vi.fn(),
  readCachedCodexPlugins: vi.fn(),
  readCodexPlugin: vi.fn(),
  setCodexPluginEnabled: vi.fn(),
  uninstallCodexPlugin: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function catalog(id: string): CodexPluginCatalog {
  const plugin = {
    id: `${id}@openai-bundled`,
    name: id,
    displayName: id,
    description: null,
    marketplaceName: "openai-bundled",
    marketplacePath: null,
    version: "1.0.0",
    installed: true,
    enabled: true,
    installPolicy: "AVAILABLE" as const,
    authPolicy: "ON_USE" as const,
    mustShowInstallationInterstitial: false,
    available: true,
    unavailableReason: null,
    keywords: [],
    capabilities: [],
    logoUrl: null,
    readiness: { skills: 1, apps: 0, mcpServers: 0, hooks: 0 },
  };
  return {
    marketplaces: [{ name: "openai-bundled", path: null, plugins: [plugin] }],
    plugins: [plugin],
    featuredPluginIds: [],
    errors: [],
    refreshedAt: id,
  };
}

describe("usePluginsController", () => {
  beforeEach(() => {
    vi.mocked(installCodexPlugin).mockReset();
    vi.mocked(listCodexPlugins).mockReset();
    vi.mocked(readCachedCodexPlugins).mockReset();
    vi.mocked(readCodexPlugin).mockReset();
    vi.mocked(setCodexPluginEnabled).mockReset();
    vi.mocked(uninstallCodexPlugin).mockReset();
  });

  it("hydrates from cache synchronously while refreshing in the background", async () => {
    const cached = catalog("cached");
    const fresh = catalog("fresh");
    const liveRequest = deferred<CodexPluginCatalog>();
    vi.mocked(readCachedCodexPlugins).mockReturnValue(cached);
    vi.mocked(listCodexPlugins).mockReturnValue(liveRequest.promise);

    const { result } = renderHook(() =>
      usePluginsController({ enabled: true }),
    );

    expect(result.current.catalog).toBe(cached);
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(listCodexPlugins).toHaveBeenCalledWith({ forceRefetch: false });

    act(() => liveRequest.resolve(fresh));
    await waitFor(() => {
      expect(result.current.catalog.plugins[0].id).toBe(
        "fresh@openai-bundled",
      );
      expect(result.current.loading).toBe(false);
    });
  });

  it("retains cached references when the live catalog is unchanged", async () => {
    const cached = catalog("stable");
    const fresh = JSON.parse(JSON.stringify(cached)) as CodexPluginCatalog;
    fresh.refreshedAt = "fresh timestamp";
    vi.mocked(readCachedCodexPlugins).mockReturnValue(cached);
    vi.mocked(listCodexPlugins).mockResolvedValue(fresh);

    const { result } = renderHook(() =>
      usePluginsController({ enabled: true }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.catalog).toBe(cached);
    expect(result.current.catalog.plugins[0]).toBe(cached.plugins[0]);
  });
});
