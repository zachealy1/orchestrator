import { describe, expect, it } from "vitest";
import type { CodexPluginCatalog, CodexPluginSummary } from "./types";
import {
  reconcilePluginCatalog,
  replacePluginInCatalog,
} from "./catalogReconciliation";

function plugin(id: string): CodexPluginSummary {
  return {
    id,
    name: id,
    displayName: id,
    description: `${id} description`,
    marketplaceName: "openai-bundled",
    marketplacePath: null,
    version: "1.0.0",
    installed: true,
    enabled: true,
    installPolicy: "AVAILABLE",
    authPolicy: "ON_USE",
    mustShowInstallationInterstitial: false,
    available: true,
    unavailableReason: null,
    keywords: [id],
    capabilities: ["Interactive"],
    logoUrl: `https://example.com/${id}.png`,
    readiness: { skills: 1, apps: 0, mcpServers: 0, hooks: 0 },
  };
}

function catalog(plugins: CodexPluginSummary[]): CodexPluginCatalog {
  return {
    marketplaces: [{ name: "openai-bundled", path: null, plugins }],
    plugins,
    featuredPluginIds: [plugins[0]?.id].filter(Boolean) as string[],
    errors: [],
    refreshedAt: "before",
  };
}

describe("plugin catalog reconciliation", () => {
  it("retains the entire catalog when a refresh has no visible changes", () => {
    const current = catalog([plugin("browser"), plugin("github")]);
    const next = JSON.parse(JSON.stringify(current)) as CodexPluginCatalog;
    next.refreshedAt = "after";

    expect(reconcilePluginCatalog(current, next)).toBe(current);
  });

  it("replaces only the plugin changed by a refresh", () => {
    const current = catalog([plugin("browser"), plugin("github")]);
    const next = JSON.parse(JSON.stringify(current)) as CodexPluginCatalog;
    next.plugins[0].enabled = false;
    next.marketplaces[0].plugins[0].enabled = false;

    const reconciled = reconcilePluginCatalog(current, next);

    expect(reconciled).not.toBe(current);
    expect(reconciled.plugins[0]).not.toBe(current.plugins[0]);
    expect(reconciled.plugins[1]).toBe(current.plugins[1]);
    expect(reconciled.marketplaces[0].plugins[1]).toBe(current.plugins[1]);
  });

  it("preserves unrelated marketplaces when details update one plugin", () => {
    const browser = plugin("browser");
    const github = plugin("github");
    const current = catalog([browser]);
    current.marketplaces.push({
      name: "openai-curated",
      path: null,
      plugins: [github],
    });
    current.plugins.push(github);

    const updated = replacePluginInCatalog(current, {
      ...browser,
      description: "Detailed browser description",
    });

    expect(updated.plugins[1]).toBe(github);
    expect(updated.marketplaces[1]).toBe(current.marketplaces[1]);
  });
});
