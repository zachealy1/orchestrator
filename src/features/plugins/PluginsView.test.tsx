import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Profiler, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  PluginsView,
  type PluginsViewActions,
  type PluginsViewModel,
} from "./PluginsView";
import type { CodexPluginCatalog, CodexPluginSummary } from "./types";

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

function catalog(plugins: CodexPluginSummary[]): CodexPluginCatalog {
  return {
    marketplaces: [{ name: "openai-bundled", path: null, plugins }],
    plugins,
    featuredPluginIds: plugins.slice(0, 1).map((entry) => entry.id),
    errors: [],
    refreshedAt: "2026-08-29T00:00:00.000Z",
  };
}

function model(
  plugins: CodexPluginSummary[],
  overrides: Partial<PluginsViewModel> = {},
): PluginsViewModel {
  return {
    selectedPluginId: null,
    catalog: catalog(plugins),
    loading: false,
    error: null,
    notice: null,
    mutation: null,
    detailsLoadingPluginId: null,
    ...overrides,
  };
}

function actions(overrides: Partial<PluginsViewActions> = {}): PluginsViewActions {
  return {
    refresh: vi.fn(),
    openPlugin: vi.fn(),
    backToCatalog: vi.fn(),
    install: vi.fn(),
    uninstall: vi.fn(),
    setEnabled: vi.fn(),
    ...overrides,
  };
}

function ControlledPlugins({
  plugins,
  actionOverrides,
  modelOverrides,
}: {
  plugins: CodexPluginSummary[];
  actionOverrides?: Partial<PluginsViewActions>;
  modelOverrides?: Partial<PluginsViewModel>;
}) {
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  return (
    <div className="main" data-testid="plugins-scroll-container">
      <PluginsView
        model={model(plugins, { ...modelOverrides, selectedPluginId })}
        actions={actions({
          ...actionOverrides,
          openPlugin: (selectedPlugin) => {
            actionOverrides?.openPlugin?.(selectedPlugin);
            setSelectedPluginId(selectedPlugin.id);
          },
          backToCatalog: () => {
            actionOverrides?.backToCatalog?.();
            setSelectedPluginId(null);
          },
        })}
      />
    </div>
  );
}

describe("PluginsView", () => {
  it("renders a hydrated catalog while a background refresh is pending", () => {
    const browser = plugin({ installed: true, enabled: true });
    render(
      <PluginsView
        model={model([browser], { loading: true })}
        actions={actions()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "View Browser details" }),
    ).toBeVisible();
    expect(screen.queryByText("Loading plugins")).toBeNull();
  });

  it("opens a full-page overview and keeps interstitial installs on that page", () => {
    const browser = plugin();
    const install = vi.fn();
    const openPlugin = vi.fn();
    render(
      <ControlledPlugins
        plugins={[browser]}
        actionOverrides={{ install, openPlugin }}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Explore" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search plugins" }), {
      target: { value: "web" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "View Browser details" }),
    );

    expect(openPlugin).toHaveBeenCalledWith(browser);
    expect(
      screen.getByRole("heading", { name: "Browser", level: 1 }),
    ).toBeVisible();
    const overview = screen.getByRole("region", { name: "Browser" });
    expect(screen.queryByRole("dialog", { name: "Browser details" })).toBeNull();
    expect(within(overview).getByText("26.818.41509")).toBeVisible();
    expect(within(overview).getByText("openai-bundled")).toBeVisible();
    expect(within(overview).getByText("Interactive")).toBeVisible();
    expect(within(overview).getByText("1 component reported ready.")).toBeVisible();
    expect(
      overview.querySelectorAll(".plugin-component-summary > div"),
    ).toHaveLength(4);
    expect(overview.querySelector(".plugin-overview-main")).toContainElement(
      screen.getByRole("heading", { name: "Overview" }),
    );
    expect(overview.querySelector(".plugin-overview-main")).toContainElement(
      screen.getByRole("heading", { name: "Component readiness" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Install plugin" }));
    const dialog = screen.getByRole("dialog", { name: "Install Browser?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("heading", { name: "Browser", level: 1 }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Install plugin" }));
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Install Browser?" }),
      ).getByRole("button", { name: "Install plugin" }),
    );
    expect(install).toHaveBeenCalledWith(browser);
    expect(
      screen.getByRole("heading", { name: "Browser", level: 1 }),
    ).toBeVisible();
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
        model={model([restricted], { selectedPluginId: restricted.id })}
        actions={actions({ setEnabled, uninstall })}
      />,
    );

    const overview = screen.getByRole("region", { name: "Browser" });
    expect(overview.querySelector(".plugin-card-status")).toHaveTextContent(
      "Enabled",
    );
    expect(within(overview).getByText("Disabled by admin")).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Enabled" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Uninstall plugin" }));
    expect(uninstall).toHaveBeenCalledWith(restricted);
    expect(setEnabled).not.toHaveBeenCalled();
  });

  it("enables and disables installed plugins from the overview", () => {
    const disabled = plugin({
      installed: true,
      enabled: false,
      mustShowInstallationInterstitial: false,
    });
    const setEnabled = vi.fn();
    const viewActions = actions({ setEnabled });
    const { rerender } = render(
      <PluginsView
        model={model([disabled], { selectedPluginId: disabled.id })}
        actions={viewActions}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Enabled" }));
    expect(setEnabled).toHaveBeenLastCalledWith(disabled, true);

    const enabled = { ...disabled, enabled: true };
    rerender(
      <PluginsView
        model={model([enabled], { selectedPluginId: enabled.id })}
        actions={viewActions}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Enabled" }));
    expect(setEnabled).toHaveBeenLastCalledWith(enabled, false);
  });

  it("defaults to Installed on the left and separates it from discovery", () => {
    const browser = plugin();
    const github = plugin({
      id: "github@openai-curated",
      name: "github",
      displayName: "GitHub",
      description: "Work with repositories and pull requests.",
      marketplaceName: "openai-curated",
      logoUrl: "https://example.com/github.png",
      installed: true,
      enabled: true,
      mustShowInstallationInterstitial: false,
    });
    render(
      <PluginsView model={model([browser, github])} actions={actions()} />,
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
    const preRenderedBrowserCard = screen.getByRole("button", {
      name: "View Browser details",
      hidden: true,
    });

    fireEvent.click(screen.getByRole("tab", { name: "Explore" }));

    expect(screen.getByRole("heading", { name: "Featured" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "All plugins" })).toBeVisible();
    expect(screen.queryByText("Extend what Orchestrator can do.")).toBeNull();
    expect(
      screen.queryByRole("combobox", { name: "Plugin marketplace" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "View Browser details" }),
    ).toBe(preRenderedBrowserCard);
    expect(screen.queryByText("View details")).toBeNull();
    expect(screen.getAllByText("1 capability")).not.toHaveLength(0);
    const logo = document.querySelector(".plugin-card img");
    expect(logo).not.toHaveAttribute("loading");
    expect(logo).toHaveAttribute("decoding", "async");
  });

  it("does not commit React work while scrolling or hovering cards", () => {
    const browser = plugin({ installed: true, enabled: true });
    let commits = 0;
    render(
      <div className="main" data-testid="plugin-performance-scroll">
        <Profiler id="plugins" onRender={() => commits++}>
          <PluginsView model={model([browser])} actions={actions()} />
        </Profiler>
      </div>,
    );
    commits = 0;

    const card = screen
      .getByRole("button", { name: "View Browser details" })
      .closest(".plugin-card");
    fireEvent.mouseEnter(card!);
    fireEvent.mouseLeave(card!);
    fireEvent.scroll(screen.getByTestId("plugin-performance-scroll"), {
      target: { scrollTop: 120 },
    });

    expect(commits).toBe(0);
  });

  it("restores catalog filters, scroll, and originating-card focus", async () => {
    const browser = plugin({ installed: true, enabled: true });
    render(<ControlledPlugins plugins={[browser]} />);
    const scrollContainer = screen.getByTestId("plugins-scroll-container");
    scrollContainer.scrollTop = 184;
    fireEvent.change(screen.getByRole("textbox", { name: "Search plugins" }), {
      target: { value: "web" },
    });
    const card = screen.getByRole("button", { name: "View Browser details" });

    fireEvent.click(card);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Back to Plugins" }),
      ).toHaveFocus(),
    );
    expect(scrollContainer.scrollTop).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Back to Plugins" }));

    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBe(184);
      expect(card).toHaveFocus();
    });
    expect(screen.getByRole("textbox", { name: "Search plugins" })).toHaveValue(
      "web",
    );
    expect(screen.getByRole("tab", { name: /Installed/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("supports keyboard card activation", async () => {
    const browser = plugin({ installed: true, enabled: true });
    const openPlugin = vi.fn();
    const user = userEvent.setup();
    render(
      <ControlledPlugins
        plugins={[browser]}
        actionOverrides={{ openPlugin }}
      />,
    );
    const card = screen.getByRole("button", { name: "View Browser details" });
    card.focus();
    await user.keyboard("{Enter}");
    expect(openPlugin).toHaveBeenCalledWith(browser);

    await user.click(screen.getByRole("button", { name: "Back to Plugins" }));
    await waitFor(() => expect(card).toHaveFocus());
    await user.keyboard(" ");
    expect(openPlugin).toHaveBeenCalledTimes(2);
  });

  it("keeps detail loading unobtrusive and failures inline", () => {
    const browser = plugin({ installed: true, enabled: true });
    render(
      <PluginsView
        model={model([browser], {
          selectedPluginId: browser.id,
          detailsLoadingPluginId: browser.id,
          error: "Could not read plugin details",
        })}
        actions={actions()}
      />,
    );

    expect(screen.queryByText("Loading latest plugin details")).toBeNull();
    expect(screen.getByRole("region", { name: "Browser" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not read plugin details",
    );
    expect(
      screen.getByRole("heading", { name: "Browser", level: 1 }),
    ).toBeVisible();
  });

  it("shows a recoverable state when a selected plugin disappears", () => {
    const backToCatalog = vi.fn();
    render(
      <PluginsView
        model={model([], { selectedPluginId: "missing@marketplace" })}
        actions={actions({ backToCatalog })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Plugin no longer available" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back to Plugins" }));
    expect(backToCatalog).toHaveBeenCalledOnce();
  });
});
