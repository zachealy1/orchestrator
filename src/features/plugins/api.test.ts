import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  codexDefaultProfileRpc,
  listDefaultCodexSkills,
} from "../../codexClient";
import {
  installCodexPlugin,
  listCodexPlugins,
  readCodexPlugin,
  setCodexPluginEnabled,
  uninstallCodexPlugin,
} from "./api";

vi.mock("../../codexClient", () => ({
  codexDefaultProfileRpc: vi.fn(),
  listDefaultCodexSkills: vi.fn(),
}));

const summary = {
  id: "browser@openai-bundled",
  remotePluginId: "browser",
  version: "26.818.41509",
  localVersion: null,
  name: "browser",
  installed: false,
  enabled: false,
  installPolicy: "AVAILABLE",
  mustShowInstallationInterstitial: true,
  authPolicy: "ON_USE",
  availability: "AVAILABLE",
  disabledReason: null,
  interface: {
    displayName: "Browser",
    shortDescription: "Use an isolated in-app browser.",
    capabilities: ["Web navigation"],
    logoUrl: null,
    composerIconUrl: null,
  },
  keywords: ["web"],
};

describe("Codex plugin API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listDefaultCodexSkills).mockResolvedValue([]);
  });

  it("normalizes marketplace policy and availability state", async () => {
    vi.mocked(codexDefaultProfileRpc).mockResolvedValue({
      marketplaces: [
        {
          name: "openai-bundled",
          path: null,
          plugins: [summary],
        },
      ],
      marketplaceLoadErrors: [],
      featuredPluginIds: [summary.id],
    });

    const catalog = await listCodexPlugins({ forceRefetch: true });

    expect(codexDefaultProfileRpc).toHaveBeenCalledWith("plugin/list", {
      cwds: [],
      forceRefetch: true,
    });
    expect(catalog.plugins[0]).toMatchObject({
      id: summary.id,
      displayName: "Browser",
      available: true,
      installPolicy: "AVAILABLE",
      authPolicy: "ON_USE",
    });
  });

  it("loads component readiness from plugin details", async () => {
    vi.mocked(codexDefaultProfileRpc).mockResolvedValue({
      plugin: {
        marketplaceName: "openai-bundled",
        marketplacePath: null,
        summary,
        description: "Browser detail",
        skills: [{ name: "control-in-app-browser" }],
        apps: [],
        mcpServers: ["browser"],
        hooks: [{ event: "start" }],
      },
    });
    const plugin = (await readCodexPlugin({
      id: summary.id,
      name: summary.name,
      displayName: "Browser",
      description: null,
      marketplaceName: "openai-bundled",
      marketplacePath: null,
      version: null,
      installed: false,
      enabled: false,
      installPolicy: "AVAILABLE",
      authPolicy: "ON_USE",
      mustShowInstallationInterstitial: true,
      available: true,
      unavailableReason: null,
      keywords: [],
      capabilities: [],
      logoUrl: null,
      readiness: { skills: 0, apps: 0, mcpServers: 0, hooks: 0 },
    }));

    expect(plugin).toMatchObject({
      description: "Browser detail",
      readiness: { skills: 1, apps: 0, mcpServers: 1, hooks: 1 },
    });
  });

  it("installs, enables, disables, and uninstalls through app-server", async () => {
    const plugin = {
      id: summary.id,
      name: summary.name,
      displayName: "Browser",
      description: null,
      marketplaceName: "openai-bundled",
      marketplacePath: null,
      version: null,
      installed: false,
      enabled: false,
      installPolicy: "AVAILABLE" as const,
      authPolicy: "ON_USE" as const,
      mustShowInstallationInterstitial: true,
      available: true,
      unavailableReason: null,
      keywords: [],
      capabilities: [],
      logoUrl: null,
      readiness: { skills: 0, apps: 0, mcpServers: 0, hooks: 0 },
    };
    vi.mocked(codexDefaultProfileRpc).mockResolvedValue({ appsNeedingAuth: [] });

    await installCodexPlugin(plugin);
    await setCodexPluginEnabled(plugin.id, true);
    await setCodexPluginEnabled(plugin.id, false);
    await uninstallCodexPlugin(plugin.id);

    expect(codexDefaultProfileRpc).toHaveBeenCalledWith(
      "plugin/install",
      expect.objectContaining({
        remoteMarketplaceName: "openai-bundled",
        pluginName: "browser",
      }),
    );
    expect(codexDefaultProfileRpc).toHaveBeenCalledWith(
      "config/value/write",
      expect.objectContaining({ value: true }),
    );
    expect(codexDefaultProfileRpc).toHaveBeenCalledWith(
      "config/value/write",
      expect.objectContaining({ value: false }),
    );
    expect(codexDefaultProfileRpc).toHaveBeenCalledWith("plugin/uninstall", {
      pluginId: plugin.id,
    });
    expect(listDefaultCodexSkills).toHaveBeenCalledTimes(4);
  });
});
