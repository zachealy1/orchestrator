import { describe, expect, it, vi } from "vitest";
import type { CodexPluginCatalog, CodexPluginSummary } from "./types";
import { createPluginLogoPreloader } from "./pluginLogoPreloader";

function plugin(index: number, installed = false): CodexPluginSummary {
  return {
    id: `plugin-${index}`,
    name: `plugin-${index}`,
    displayName: `Plugin ${index}`,
    description: null,
    marketplaceName: "openai-bundled",
    marketplacePath: null,
    version: null,
    installed,
    enabled: installed,
    installPolicy: "AVAILABLE",
    authPolicy: "ON_USE",
    mustShowInstallationInterstitial: false,
    available: true,
    unavailableReason: null,
    keywords: [],
    capabilities: [],
    logoUrl: `https://example.com/plugin-${index}.png`,
    readiness: { skills: 0, apps: 0, mcpServers: 0, hooks: 0 },
  };
}

function catalog(plugins: CodexPluginSummary[]): CodexPluginCatalog {
  return {
    marketplaces: [{ name: "openai-bundled", path: null, plugins }],
    plugins,
    featuredPluginIds: ["plugin-20"],
    errors: [],
    refreshedAt: "now",
  };
}

describe("plugin logo preloader", () => {
  it("requests priority logos immediately and every remaining logo without scrolling", () => {
    const requested: string[] = [];
    const scheduled: Array<() => void> = [];
    const decode = vi.fn(() => Promise.resolve());
    const preload = createPluginLogoPreloader({
      createImage: () => {
        let source = "";
        return {
          decoding: "auto",
          loading: "lazy",
          get src() {
            return source;
          },
          set src(value: string) {
            source = value;
            requested.push(value);
          },
          onload: null,
          onerror: null,
          decode,
        };
      },
      schedule: (callback) => scheduled.push(callback),
    });
    const plugins = Array.from({ length: 30 }, (_, index) =>
      plugin(index, index === 25),
    );

    preload(catalog(plugins));
    expect(requested).toHaveLength(18);
    expect(requested[0]).toContain("plugin-25.png");
    expect(requested[1]).toContain("plugin-20.png");
    while (scheduled.length > 0) scheduled.shift()?.();

    expect(requested).toHaveLength(30);
    expect(new Set(requested)).toHaveLength(30);
    expect(decode).toHaveBeenCalledTimes(30);
  });

  it("deduplicates logo requests across catalog refreshes", () => {
    const requested: string[] = [];
    const preload = createPluginLogoPreloader({
      createImage: () => ({
        decoding: "auto",
        loading: "lazy",
        set src(value: string) {
          requested.push(value);
        },
        get src() {
          return "";
        },
        onload: null,
        onerror: null,
      }),
      schedule: (callback) => callback(),
    });
    const plugins = [plugin(1, true), plugin(2)];

    preload(catalog(plugins));
    preload(catalog(plugins.map((entry) => ({ ...entry }))));

    expect(requested).toHaveLength(2);
  });
});
