import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PluginsView } from "./PluginsView";
import type { CodexPluginSummary } from "./types";

function plugin(
  overrides: Partial<CodexPluginSummary> = {},
): CodexPluginSummary {
  return {
    id: "browser@openai-bundled",
    name: "browser",
    displayName: "Browser",
    description: "Control the isolated in-app browser.",
    marketplaceName: "openai-bundled",
    marketplacePath: null,
    version: "26.818.41509",
    installed: false,
    enabled: false,
    installPolicy: "AVAILABLE",
    authPolicy: "ON_USE",
    mustShowInstallationInterstitial: true,
    available: true,
    unavailableReason: null,
    keywords: ["web"],
    capabilities: ["Interactive"],
    logoUrl: null,
    readiness: { skills: 1, apps: 0, mcpServers: 0, hooks: 0 },
    ...overrides,
  };
}

describe("PluginsView", () => {
  it("searches, loads details, and confirms interstitial installations", () => {
    const browser = plugin();
    const install = vi.fn();
    const loadDetails = vi.fn();
    render(
      <PluginsView
        model={{
          catalog: {
            marketplaces: [
              { name: "openai-bundled", path: null, plugins: [browser] },
            ],
            plugins: [browser],
            featuredPluginIds: [browser.id],
            errors: [],
            refreshedAt: "2026-08-29T00:00:00.000Z",
          },
          loading: false,
          error: null,
          notice: null,
          mutation: null,
          detailsLoadingPluginId: null,
        }}
        actions={{
          refresh: vi.fn(),
          loadDetails,
          install,
          uninstall: vi.fn(),
          setEnabled: vi.fn(),
        }}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Explore" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search plugins" }), {
      target: { value: "web" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "View Browser details" }),
    );
    expect(loadDetails).toHaveBeenCalledWith(browser);
    const details = screen.getByRole("dialog", {
      name: "Browser details",
    });
    fireEvent.click(
      within(details).getByRole("button", { name: "Install plugin" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Install Browser?" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Install plugin" }),
    );
    expect(install).toHaveBeenCalledWith(browser);
  });

  it("honors policy restrictions and exposes installed lifecycle actions", () => {
    const restricted = plugin({
      installed: true,
      enabled: true,
      available: false,
      unavailableReason: "Disabled by admin",
    });
    const setEnabled = vi.fn();
    const uninstall = vi.fn();
    render(
      <PluginsView
        model={{
          catalog: {
            marketplaces: [
              { name: "openai-bundled", path: null, plugins: [restricted] },
            ],
            plugins: [restricted],
            featuredPluginIds: [],
            errors: [],
            refreshedAt: "2026-08-29T00:00:00.000Z",
          },
          loading: false,
          error: null,
          notice: null,
          mutation: null,
          detailsLoadingPluginId: null,
        }}
        actions={{
          refresh: vi.fn(),
          loadDetails: vi.fn(),
          install: vi.fn(),
          uninstall,
          setEnabled,
        }}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "View Browser details" }),
    );
    expect(screen.getByRole("checkbox", { name: "Enabled" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));
    expect(uninstall).toHaveBeenCalledWith(restricted);
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it("defaults to Installed on the left and separates it from discovery", () => {
    const browser = plugin();
    const github = plugin({
      id: "github@openai-curated",
      name: "github",
      displayName: "GitHub",
      description: "Work with repositories and pull requests.",
      marketplaceName: "openai-curated",
      installed: true,
      enabled: true,
      mustShowInstallationInterstitial: false,
    });
    render(
      <PluginsView
        model={{
          catalog: {
            marketplaces: [
              { name: "openai-bundled", path: null, plugins: [browser] },
              { name: "openai-curated", path: null, plugins: [github] },
            ],
            plugins: [browser, github],
            featuredPluginIds: [browser.id],
            errors: [],
            refreshedAt: "2026-08-29T00:00:00.000Z",
          },
          loading: false,
          error: null,
          notice: null,
          mutation: null,
          detailsLoadingPluginId: null,
        }}
        actions={{
          refresh: vi.fn(),
          loadDetails: vi.fn(),
          install: vi.fn(),
          uninstall: vi.fn(),
          setEnabled: vi.fn(),
        }}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAccessibleName(/Installed/);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAccessibleName("Explore");
    expect(
      screen.getByRole("heading", { name: "Installed plugins" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "View Browser details" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Explore" }));

    expect(screen.getByRole("heading", { name: "Featured" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "All plugins" })).toBeVisible();
    expect(
      screen.queryByText("Extend what Orchestrator can do."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Plugin marketplace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View Browser details" }),
    ).toBeVisible();
    expect(screen.queryByText("View details")).not.toBeInTheDocument();
    expect(screen.getAllByText("1 capability")).not.toHaveLength(0);
  });
});
