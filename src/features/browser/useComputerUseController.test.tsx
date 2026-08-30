import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listDefaultCodexSkills,
  readDesktopRuntimeStatus,
} from "../../codexClient";
import type { CodexSkillSummary } from "../composer/types";
import type { CodexPluginCatalog } from "../plugins/types";
import { useComputerUseController } from "./useComputerUseController";

vi.mock("../../codexClient", () => ({
  listDefaultCodexSkills: vi.fn(),
  readDesktopRuntimeStatus: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function catalog(refreshedAt: string): CodexPluginCatalog {
  const browser = {
    id: "browser@openai-bundled",
    name: "browser",
    displayName: "Browser",
    description: null,
    marketplaceName: "openai-bundled",
    marketplacePath: null,
    version: "26.818.41509",
    installed: true,
    enabled: true,
    installPolicy: "AVAILABLE" as const,
    authPolicy: "ON_USE" as const,
    mustShowInstallationInterstitial: false,
    available: true,
    unavailableReason: null,
    keywords: [],
    capabilities: ["Interactive"],
    logoUrl: null,
    readiness: { skills: 1, apps: 0, mcpServers: 0, hooks: 0 },
  };
  return {
    marketplaces: [{ name: "openai-bundled", path: null, plugins: [browser] }],
    plugins: [browser],
    featuredPluginIds: [],
    errors: [],
    refreshedAt,
  };
}

describe("useComputerUseController", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(listDefaultCodexSkills).mockReset();
    vi.mocked(readDesktopRuntimeStatus).mockResolvedValue({
      available: true,
      version: "1.0.1000816",
      serviceCompatible: true,
      accessibilityTrusted: true,
      screenRecordingTrusted: true,
      message: null,
    });
  });

  it("keeps each Browser skill probe pending without reusing a stale result", async () => {
    const firstProbe = deferred<CodexSkillSummary[]>();
    const refreshedProbe = deferred<CodexSkillSummary[]>();
    vi.mocked(listDefaultCodexSkills)
      .mockReturnValueOnce(firstProbe.promise)
      .mockReturnValueOnce(refreshedProbe.promise);

    const { result, rerender } = renderHook(
      ({ pluginCatalog }) => useComputerUseController({ pluginCatalog }),
      { initialProps: { pluginCatalog: catalog("first") } },
    );

    expect(result.current.browserReadiness).toMatchObject({
      available: false,
      checking: true,
    });

    act(() => {
      firstProbe.resolve([
        {
          id: "browser:control-in-app-browser",
          name: "browser:control-in-app-browser",
          description: "Control the in-app Browser",
        },
      ]);
    });
    await waitFor(() =>
      expect(result.current.browserReadiness).toMatchObject({
        available: true,
        checking: false,
      }),
    );

    rerender({ pluginCatalog: catalog("refreshed") });
    expect(result.current.browserReadiness).toMatchObject({
      available: false,
      checking: true,
    });

    act(() => {
      refreshedProbe.resolve([
        {
          id: "browser:control-in-app-browser",
          name: "browser:control-in-app-browser",
          description: "Control the in-app Browser",
        },
      ]);
    });
    await waitFor(() =>
      expect(result.current.browserReadiness).toMatchObject({
        available: true,
        checking: false,
      }),
    );
  });
});
