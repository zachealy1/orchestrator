import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SettingsView,
  type SettingsViewActions,
  type SettingsViewModel,
} from "./SettingsView";

function actions(
  overrides: Partial<SettingsViewActions> = {},
): SettingsViewActions {
  return {
    setComputerUseEnabled: vi.fn(),
    setBrowserAskWhereToSave: vi.fn(),
    chooseBrowserDownloadLocation: vi.fn(),
    resetBrowserDownloadLocation: vi.fn(),
    clearBrowserData: vi.fn().mockResolvedValue(undefined),
    importBrowserProfile: vi.fn(),
    openPlugins: vi.fn(),
    refreshComputerUseStatus: vi.fn(),
    openAccessibilitySettings: vi.fn(),
    openScreenRecordingSettings: vi.fn(),
    revokeAlwaysAllowedApplication: vi.fn(),
    connectGithub: vi.fn(),
    showGithubLogin: vi.fn(),
    disconnectGithub: vi.fn(),
    setNotificationPreference: vi.fn(),
    openNotificationSettings: vi.fn(),
    enableNotifications: vi.fn(),
    renameAccount: vi.fn(),
    selectAccount: vi.fn(),
    cancelLogin: vi.fn(),
    loginAccount: vi.fn(),
    removeAccount: vi.fn(),
    addAccount: vi.fn(),
    connectAccount: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

function model(overrides: Partial<SettingsViewModel> = {}): SettingsViewModel {
  return {
    computerUseEnabled: true,
    browserPreferences: {
      downloadLocation: null,
      askWhereToSave: false,
    },
    browserReadiness: {
      available: true,
      checking: false,
      message: null,
      pluginId: "browser@openai-bundled",
      pluginInstalled: true,
      pluginEnabled: true,
      isolatedProfile: true,
      profileImportAvailable: false,
    },
    desktopRuntimeStatus: {
      available: true,
      message: null,
      version: "1.0.1000816",
      serviceCompatible: true,
      accessibilityTrusted: true,
      screenRecordingTrusted: true,
    },
    pluginCatalog: {
      marketplaces: [],
      plugins: [
        {
          id: "browser@openai-bundled",
          name: "browser",
          displayName: "Browser",
          description: null,
          marketplaceName: "openai-bundled",
          marketplacePath: null,
          version: "26.818.41509",
          installed: true,
          enabled: true,
          installPolicy: "AVAILABLE",
          authPolicy: "ON_INSTALL",
          mustShowInstallationInterstitial: false,
          available: true,
          unavailableReason: null,
          keywords: [],
          capabilities: [],
          logoUrl: null,
          readiness: { skills: 1, apps: 0, mcpServers: 0, hooks: 0 },
        },
        {
          id: "computer-use@openai-bundled",
          name: "computer-use",
          displayName: "Computer Use",
          description: null,
          marketplaceName: "openai-bundled",
          marketplacePath: null,
          version: "1.0.1000816",
          installed: true,
          enabled: true,
          installPolicy: "AVAILABLE",
          authPolicy: "ON_INSTALL",
          mustShowInstallationInterstitial: false,
          available: true,
          unavailableReason: null,
          keywords: [],
          capabilities: [],
          logoUrl: null,
          readiness: { skills: 1, apps: 0, mcpServers: 1, hooks: 0 },
        },
      ],
      featuredPluginIds: [],
      errors: [],
      refreshedAt: "2026-08-29T00:00:00.000Z",
    },
    pluginsLoading: false,
    alwaysAllowedApplications: [],
    githubConnection: null,
    githubConnectionPending: false,
    notificationPreferences: {
      responseCompleted: true,
      approvalRequired: true,
      userInputRequired: true,
      planReady: true,
      externalAction: true,
    },
    notificationPermission: "allowed",
    codexConnected: true,
    accounts: [],
    selectedAccountId: null,
    pendingLoginAccountId: null,
    pendingLoginId: null,
    loginState: "idle",
    activeRunAccountIds: new Set(),
    runIsActive: false,
    authMessage: "No account selected",
    showLogout: false,
    ...overrides,
  };
}

function githubConnection(
  overrides: Partial<NonNullable<SettingsViewModel["githubConnection"]>> = {},
): NonNullable<SettingsViewModel["githubConnection"]> {
  return {
    available: true,
    connected: false,
    login: null,
    displayName: null,
    avatarUrl: null,
    status: "disconnected",
    message: null,
    cliVersion: "2.96.0",
    deviceCode: null,
    verificationUri: null,
    loginGeneration: null,
    browserOpened: false,
    ...overrides,
  };
}

describe("SettingsView", () => {
  it("routes capability changes through settings actions", () => {
    const handlers = actions();
    render(<SettingsView model={model()} actions={handlers} />);

    fireEvent.click(
      screen.getByRole("checkbox", { name: /any approved app/i }),
    );

    expect(handlers.setComputerUseEnabled).toHaveBeenCalledWith(false);
  });

  it("does not render the always-allowed apps section when it is empty", () => {
    render(<SettingsView model={model()} actions={actions()} />);

    expect(screen.queryByText("Always-allowed apps")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No always-allowed apps"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Apps appear here after you choose Always allow during a task.",
      ),
    ).not.toBeInTheDocument();
  });

  it("wires Browser preferences and Computer Use permission management", () => {
    const handlers = actions();
    render(
      <SettingsView
        model={model({
          desktopRuntimeStatus: {
            available: false,
            message: "Grant the required macOS permissions.",
            version: "1.0.1000816",
            serviceCompatible: true,
            accessibilityTrusted: false,
            screenRecordingTrusted: false,
          },
          alwaysAllowedApplications: [
            {
              id: "com.example.editor",
              name: "Editor",
              bundleId: "com.example.editor",
              approvedAt: "2026-08-29T08:00:00.000Z",
            },
          ],
        })}
        actions={handlers}
      />,
    );

    const clearData = screen.getByRole("button", { name: "Clear data" });
    const computerUse = screen.getByRole("region", {
      name: "Computer use settings",
    });
    fireEvent.click(
      within(computerUse).getByRole("button", {
        name: "Computer Use unavailable. Show details",
      }),
    );
    const screenRecordingSettings = within(computerUse).getByRole("button", {
      name: "Open Screen Recording settings",
    });
    expect(clearData).toHaveClass("settings-icon-action");
    expect(screenRecordingSettings).toHaveClass("settings-navigation-row");
    expect(
      screenRecordingSettings.querySelector(".lucide-external-link"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Choose download location" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Ask where to save browser downloads",
      }),
    );
    fireEvent.click(screenRecordingSettings);
    fireEvent.click(
      within(computerUse).getByRole("button", {
        name: "Open Accessibility settings",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Revoke Editor" }));

    expect(handlers.clearBrowserData).not.toHaveBeenCalled();
    expect(handlers.chooseBrowserDownloadLocation).toHaveBeenCalledOnce();
    expect(handlers.setBrowserAskWhereToSave).toHaveBeenCalledWith(true);
    expect(handlers.openScreenRecordingSettings).toHaveBeenCalledOnce();
    expect(handlers.openAccessibilitySettings).toHaveBeenCalledOnce();
    expect(handlers.revokeAlwaysAllowedApplication).toHaveBeenCalledWith(
      "com.example.editor",
    );
  });

  it("confirms Browser data clearing and reports success", async () => {
    let resolveClear: (() => void) | undefined;
    const clearBrowserData = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveClear = resolve;
        }),
    );
    render(
      <SettingsView
        model={model()}
        actions={actions({ clearBrowserData })}
      />,
    );

    const browser = screen.getByRole("region", { name: "Browser settings" });
    const trigger = within(browser).getByRole("button", { name: "Clear data" });

    fireEvent.click(trigger);
    expect(clearBrowserData).not.toHaveBeenCalled();

    let dialog = screen.getByRole("dialog", { name: "Clear browser data?" });
    expect(dialog).toHaveClass(
      "confirmation-dialog",
      "browser-data-clear-dialog",
    );
    expect(dialog.parentElement).toHaveClass("modal-backdrop");
    expect(dialog).toHaveTextContent("signs you out of websites");
    expect(dialog).toHaveTextContent(
      "Downloaded files and data in your regular browsers are not affected",
    );
    expect(
      within(dialog).getByRole("button", { name: "Keep browser data" }),
    ).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(
      within(dialog).getByRole("button", { name: "Clear browser data" }),
    ).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(
      within(dialog).getByRole("button", { name: "Keep browser data" }),
    ).toHaveFocus();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Keep browser data" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Clear browser data?" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(clearBrowserData).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    dialog = screen.getByRole("dialog", { name: "Clear browser data?" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(dialog).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    dialog = screen.getByRole("dialog", { name: "Clear browser data?" });
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(dialog).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    dialog = screen.getByRole("dialog", { name: "Clear browser data?" });
    const confirm = within(dialog).getByRole("button", {
      name: "Clear browser data",
    });
    fireEvent.click(confirm);

    expect(clearBrowserData).toHaveBeenCalledOnce();
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(
      within(dialog).getByRole("button", { name: "Keep browser data" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "Clearing browser data" }),
    ).toBeDisabled();

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(dialog).toBeInTheDocument();
    expect(clearBrowserData).toHaveBeenCalledOnce();

    await act(async () => {
      resolveClear?.();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Clear browser data?" }),
      ).not.toBeInTheDocument(),
    );
    const bubble = await screen.findByRole("complementary", {
      name: "Browser data notification",
    });
    expect(browser).not.toContainElement(bubble);
    const banner = within(bubble).getByRole("status", {
      name: "Browser data cleared",
    });
    expect(banner).toHaveClass("composer-status-notice");
    expect(banner).toHaveAttribute("data-tone", "success");
    expect(banner).toHaveTextContent(
      "Cookies, site data, cache, sign-ins, and task tabs were removed",
    );
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    await waitFor(() =>
      expect(
        screen.queryByRole("status", { name: "Browser data cleared" }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Clear browser data?" }))
        .getByRole("button", { name: "Keep browser data" }),
    );
  });

  it("reports and dismisses Browser data clearing failures", async () => {
    const clearBrowserData = vi
      .fn<SettingsViewActions["clearBrowserData"]>()
      .mockRejectedValue(new Error("  The isolated profile\nis busy.  "));
    render(
      <SettingsView
        model={model()}
        actions={actions({ clearBrowserData })}
      />,
    );

    const browser = screen.getByRole("region", { name: "Browser settings" });
    fireEvent.click(within(browser).getByRole("button", { name: "Clear data" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Clear browser data?" }))
        .getByRole("button", { name: "Clear browser data" }),
    );

    const banner = await screen.findByRole("alert", {
      name: "Couldn’t clear browser data",
    });
    expect(browser).not.toContainElement(banner);
    expect(banner).toHaveClass("composer-status-notice");
    expect(banner).toHaveAttribute("data-tone", "warning");
    expect(banner).toHaveTextContent("The isolated profile is busy.");
    expect(
      screen.queryByRole("dialog", { name: "Clear browser data?" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(banner).getByRole("button", {
        name: "Dismiss Couldn’t clear browser data",
      }),
    );
    expect(
      screen.queryByRole("alert", {
        name: "Couldn’t clear browser data",
      }),
    ).not.toBeInTheDocument();
  });

  it("moves Computer Use permission failures into the header status popover", () => {
    const handlers = actions();
    render(
      <SettingsView
        model={model({
          desktopRuntimeStatus: {
            available: false,
            message:
              "Allow Screen Recording and Accessibility for Computer Use in macOS settings.",
            version: "1.0.1000816",
            serviceCompatible: true,
            accessibilityTrusted: false,
            screenRecordingTrusted: false,
          },
        })}
        actions={handlers}
      />,
    );

    const computerUse = screen.getByRole("region", {
      name: "Computer use settings",
    });
    const trigger = within(computerUse).getByRole("button", {
      name: "Computer Use unavailable. Show details",
    });

    expect(trigger).toHaveClass("settings-status-badge", "negative");
    expect(within(trigger).getByText("Unavailable")).toBeInTheDocument();
    expect(
      trigger.querySelector(".settings-status-badge-dot"),
    ).toBeInTheDocument();
    expect(trigger.querySelector("svg")).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      computerUse.querySelector(".computer-use-runtime-error"),
    ).toBeNull();

    const dialog = within(computerUse).getByRole("dialog", {
      name: "Computer Use unavailable",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(dialog).toHaveTextContent("Grant both permissions to continue.");
    expect(within(dialog).getAllByText("Required")).toHaveLength(2);
    expect(
      within(dialog).getByRole("button", { name: "Check again" }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Open Screen Recording settings",
      }),
    );
    expect(handlers.openScreenRecordingSettings).toHaveBeenCalledOnce();
    expect(within(computerUse).queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(
      within(
        within(computerUse).getByRole("dialog", {
          name: "Computer Use unavailable",
        }),
      ).getByRole("button", { name: "Open Accessibility settings" }),
    );
    expect(handlers.openAccessibilitySettings).toHaveBeenCalledOnce();

    fireEvent.click(trigger);
    fireEvent.click(
      within(
        within(computerUse).getByRole("dialog", {
          name: "Computer Use unavailable",
        }),
      ).getByRole("button", { name: "Check again" }),
    );
    expect(handlers.refreshComputerUseStatus).toHaveBeenCalledOnce();

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(within(computerUse).queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(within(computerUse).queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("surfaces a permission denial when the runtime status changes", () => {
    const { rerender } = render(
      <SettingsView model={model()} actions={actions()} />,
    );

    rerender(
      <SettingsView
        model={model({
          desktopRuntimeStatus: {
            available: true,
            message: null,
            version: "1.0.1000816",
            serviceCompatible: true,
            accessibilityTrusted: false,
            screenRecordingTrusted: true,
          },
        })}
        actions={actions()}
      />,
    );

    const computerUse = screen.getByRole("region", {
      name: "Computer use settings",
    });
    const trigger = within(computerUse).getByRole("button", {
      name: "Computer Use unavailable. Show details",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    expect(
      within(computerUse).getByRole("checkbox", {
        name: /any approved app/i,
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /computer use\s*not available/i }),
    ).toBeInTheDocument();

    const dialog = within(computerUse).getByRole("dialog", {
      name: "Computer Use unavailable",
    });
    expect(dialog).toHaveTextContent("Grant the required permission to continue.");
    expect(within(dialog).getByText("Required")).toBeInTheDocument();
    expect(within(dialog).queryByText("Not verified")).toBeNull();
    expect(
      within(dialog).getByRole("button", {
        name: "Open Accessibility settings",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", {
        name: "Open Screen Recording settings",
      }),
    ).toBeNull();
  });

  it.each([
    {
      accessibilityTrusted: false,
      screenRecordingTrusted: false,
      missingPermissions: ["Screen Recording", "Accessibility"],
    },
    {
      accessibilityTrusted: false,
      screenRecordingTrusted: true,
      missingPermissions: ["Accessibility"],
    },
    {
      accessibilityTrusted: true,
      screenRecordingTrusted: false,
      missingPermissions: ["Screen Recording"],
    },
    {
      accessibilityTrusted: true,
      screenRecordingTrusted: true,
      missingPermissions: [],
    },
  ])(
    "maps Accessibility $accessibilityTrusted and Screen Recording $screenRecordingTrusted independently",
    ({
      accessibilityTrusted,
      screenRecordingTrusted,
      missingPermissions,
    }) => {
      render(
        <SettingsView
          model={model({
            desktopRuntimeStatus: {
              available: true,
              message: null,
              version: "1.0.1000816",
              serviceCompatible: true,
              accessibilityTrusted,
              screenRecordingTrusted,
            },
          })}
          actions={actions()}
        />,
      );

      const computerUse = screen.getByRole("region", {
        name: "Computer use settings",
      });
      if (missingPermissions.length === 0) {
        expect(
          within(computerUse).getByRole("status", { name: "Available" }),
        ).toBeInTheDocument();
        expect(within(computerUse).queryByRole("dialog")).toBeNull();
        return;
      }

      const trigger = within(computerUse).getByRole("button", {
        name: "Computer Use unavailable. Show details",
      });
      if (trigger.getAttribute("aria-expanded") === "false") {
        fireEvent.click(trigger);
      }
      const dialog = within(computerUse).getByRole("dialog", {
        name: "Computer Use unavailable",
      });

      for (const permission of ["Screen Recording", "Accessibility"]) {
        const action = within(dialog).queryByRole("button", {
          name: `Open ${permission} settings`,
        });
        if (missingPermissions.includes(permission)) {
          expect(action).toBeInTheDocument();
        } else {
          expect(action).toBeNull();
        }
      }
      expect(within(dialog).getAllByText("Required")).toHaveLength(
        missingPermissions.length,
      );
    },
  );

  it("does not label helper-owned unverified permissions as required", () => {
    const handlers = actions();
    render(
      <SettingsView
        model={model({
          desktopRuntimeStatus: {
            available: true,
            message: null,
            version: "1.0.1000816",
            serviceCompatible: true,
            accessibilityTrusted: null,
            screenRecordingTrusted: null,
          },
        })}
        actions={handlers}
      />,
    );

    const computerUse = screen.getByRole("region", {
      name: "Computer use settings",
    });
    expect(
      within(computerUse).getByRole("status", { name: "Review access" }),
    ).toHaveClass("sr-only");
    const trigger = within(computerUse).getByRole("button", {
      name: "Computer Use access not verified. Show details",
    });
    expect(trigger).toHaveClass("settings-status-badge", "neutral");
    expect(
      within(computerUse).getByRole("checkbox", {
        name: /any approved app/i,
      }),
    ).toBeEnabled();
    const screenRecordingRow = within(computerUse).getByRole("button", {
      name: "Open Screen Recording settings",
    });
    const accessibilityRow = within(computerUse).getByRole("button", {
      name: "Open Accessibility settings",
    });
    expect(screenRecordingRow).toHaveClass("settings-navigation-row");
    expect(accessibilityRow).toHaveClass("settings-navigation-row");
    expect(within(computerUse).queryByText("Managed")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: /computer use\s*review permissions/i,
      }),
    ).toBeInTheDocument();

    fireEvent.click(trigger);
    const dialog = within(computerUse).getByRole("dialog", {
      name: "Computer Use access not verified",
    });
    expect(dialog).toHaveTextContent(
      "Computer Use verifies access when it starts.",
    );
    expect(within(dialog).queryByText("Required")).toBeNull();
    expect(within(dialog).getAllByText("Not verified")).toHaveLength(2);

    fireEvent.click(screenRecordingRow);
    fireEvent.click(accessibilityRow);
    expect(handlers.openScreenRecordingSettings).toHaveBeenCalledOnce();
    expect(handlers.openAccessibilitySettings).toHaveBeenCalledOnce();
  });

  it("routes a missing Computer Use plugin from the status popover to Plugins", () => {
    const handlers = actions();
    const baseModel = model();
    render(
      <SettingsView
        model={model({
          desktopRuntimeStatus: {
            available: false,
            message: "Computer Use is unavailable.",
            version: null,
            serviceCompatible: false,
            accessibilityTrusted: false,
            screenRecordingTrusted: false,
          },
          pluginCatalog: {
            ...baseModel.pluginCatalog,
            plugins: baseModel.pluginCatalog.plugins.filter(
              (plugin) => plugin.name !== "computer-use",
            ),
          },
        })}
        actions={handlers}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Computer Use unavailable. Show details",
      }),
    );

    const dialog = screen.getByRole("dialog", {
      name: "Computer Use unavailable",
    });
    expect(dialog).toHaveTextContent(
      "Install the Computer Use plugin to continue.",
    );
    expect(
      within(dialog).queryByRole("button", {
        name: "Open Screen Recording settings",
      }),
    ).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: "Open Plugins" }));
    expect(handlers.openPlugins).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders Browser and Computer use as separate status cards", () => {
    const { rerender } = render(
      <SettingsView model={model()} actions={actions()} />,
    );
    const computerUseSection = screen.getByRole("region", {
      name: "Computer use settings",
    });
    computerUseSection.scrollIntoView = vi.fn();

    const browserCard = screen.getByRole("button", {
      name: /browser\s*ready/i,
    });
    const computerUseCard = screen.getByRole("button", {
      name: /computer use\s*ready/i,
    });
    expect(within(browserCard).getByText("Browser")).toBeInTheDocument();
    expect(within(computerUseCard).getByText("Computer use")).toBeInTheDocument();

    fireEvent.click(computerUseCard);
    expect(computerUseSection.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });

    rerender(
      <SettingsView
        model={model({
          browserReadiness: {
            available: false,
            checking: false,
            message: "The browser runtime is unavailable.",
            pluginId: null,
            pluginInstalled: false,
            pluginEnabled: false,
            isolatedProfile: true,
            profileImportAvailable: false,
          },
        })}
        actions={actions()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /browser\s*not available/i }),
    ).toBeInTheDocument();
  });

  it("keeps the Browser skill probe neutral until readiness resolves", () => {
    const checkingMessage =
      "Checking whether this Codex host supports the in-app browser.";
    const { rerender } = render(
      <SettingsView
        model={model({
          browserReadiness: {
            available: false,
            checking: true,
            message: checkingMessage,
            pluginId: "browser@openai-bundled",
            pluginInstalled: true,
            pluginEnabled: true,
            isolatedProfile: true,
            profileImportAvailable: false,
          },
        })}
        actions={actions()}
      />,
    );

    const browser = screen.getByRole("region", { name: "Browser settings" });
    expect(
      within(browser).getAllByRole("status", { name: "Checking" }),
    ).toHaveLength(2);
    expect(within(browser).queryByRole("alert")).toBeNull();
    expect(within(browser).queryByText(checkingMessage)).toBeNull();
    expect(
      screen.getByRole("button", { name: /browser\s*checking/i }),
    ).toBeInTheDocument();

    rerender(
      <SettingsView
        model={model({
          browserReadiness: {
            available: false,
            checking: false,
            message: "The browser runtime is unavailable.",
            pluginId: "browser@openai-bundled",
            pluginInstalled: true,
            pluginEnabled: true,
            isolatedProfile: true,
            profileImportAvailable: false,
          },
        })}
        actions={actions()}
      />,
    );

    expect(within(browser).getByRole("alert")).toHaveTextContent(
      "The browser runtime is unavailable.",
    );
  });

  it("uses one shared status badge across every settings detail header", () => {
    const { rerender } = render(
      <SettingsView
        model={model({
          githubConnection: githubConnection({
            connected: true,
            login: "dev",
            status: "connected",
          }),
        })}
        actions={actions()}
      />,
    );

    [
      "Browser settings",
      "Computer use settings",
      "Notification settings",
      "GitHub settings",
      "Codex settings",
    ].forEach((regionName) => {
      const region = screen.getByRole("region", { name: regionName });
      const statuses = region.querySelectorAll(
        ".settings-detail-header [role='status']",
      );
      expect(statuses).toHaveLength(1);
      expect(statuses[0]).toHaveClass("settings-status-badge");
    });
    expect(
      document.querySelectorAll(".settings-detail-header [role='status']"),
    ).toHaveLength(5);
    screen.getAllByRole("status", { name: "Available" }).forEach((status) => {
      expect(status).toHaveClass("positive");
    });
    screen.getAllByRole("status", { name: "Allowed" }).forEach((status) => {
      expect(status).toHaveClass("positive");
    });
    screen.getAllByRole("status", { name: "Connected" }).forEach((status) => {
      expect(status).toHaveClass("positive");
    });
    expect(
      document.querySelector(
        ".settings-detail-header .run-status, .settings-detail-header .notification-permission-status",
      ),
    ).toBeNull();

    rerender(
      <SettingsView
        model={model({
          pluginsLoading: true,
          githubConnectionPending: true,
          notificationPermission: "not-enabled",
          codexConnected: false,
        })}
        actions={actions()}
      />,
    );

    screen.getAllByRole("status", { name: "Checking" }).forEach((status) => {
      expect(status).toHaveClass("pending");
    });
    expect(screen.getByRole("status", { name: "Connecting" })).toHaveClass(
      "pending",
    );
    expect(screen.getByRole("status", { name: "Not enabled" })).toHaveClass(
      "neutral",
    );
    expect(screen.getByRole("status", { name: "Disconnected" })).toHaveClass(
      "neutral",
    );

    rerender(
      <SettingsView
        model={model({
          browserReadiness: {
            available: false,
            checking: false,
            message: "The browser runtime is unavailable.",
            pluginId: null,
            pluginInstalled: false,
            pluginEnabled: false,
            isolatedProfile: true,
            profileImportAvailable: false,
          },
          githubConnection: githubConnection({
            available: false,
            status: "unavailable",
          }),
          notificationPermission: "unavailable",
          codexConnected: false,
        })}
        actions={actions()}
      />,
    );

    const unavailableStatuses = screen.getAllByRole("status", {
      name: "Unavailable",
    });
    expect(unavailableStatuses).toHaveLength(3);
    unavailableStatuses.forEach((status) => {
      expect(status).toHaveClass("negative");
    });
  });

  it("renders every settings section title without a subtitle", () => {
    render(<SettingsView model={model()} actions={actions()} />);

    const removedSubtitles = [
      "Common controls, available without leaving this page.",
      "Accounts and services available to agent runs.",
      "Control which browser Orchestrator can use for future turns.",
      "Choose which moments deserve your attention.",
      "Connect the bundled GitHub CLI for repository actions.",
    ];

    removedSubtitles.forEach((subtitle) => {
      expect(screen.queryByText(subtitle)).not.toBeInTheDocument();
    });
    screen.getAllByRole("heading", { level: 2 }).forEach((title) => {
      expect(title.nextElementSibling?.tagName).not.toBe("P");
    });
  });

  it("renders the Connections overview header without Quick preferences", () => {
    render(<SettingsView model={model()} actions={actions()} />);

    const panel = screen.getByRole("region", {
      name: "Connections overview",
    });
    const header = panel.querySelector(".settings-overview-panel-header");
    const icon = panel.querySelector(
      ".settings-detail-header-icon .lucide-plug",
    );

    expect(header).toHaveClass("settings-detail-header");
    expect(icon).toBeInTheDocument();
    expect(icon?.closest(".settings-detail-header-icon")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      screen.queryByRole("region", { name: "Quick preferences" }),
    ).toBeNull();
  });

  it("opens connection settings from selectable rows", () => {
    render(<SettingsView model={model()} actions={actions()} />);
    const connections = screen.getByRole("region", {
      name: "Connections overview",
    });
    const codexSettings = screen.getByRole("region", {
      name: "Codex settings",
    });
    const githubSettings = screen.getByRole("region", {
      name: "GitHub settings",
    });
    codexSettings.scrollIntoView = vi.fn();
    githubSettings.scrollIntoView = vi.fn();

    const codexRow = within(connections).getByRole("button", {
      name: /Codex account/i,
    });
    const githubRow = within(connections).getByRole("button", {
      name: /GitHub/i,
    });

    expect(within(connections).queryByText("Manage")).toBeNull();
    expect(within(connections).getByText("Codex account").closest("button")).toBe(
      codexRow,
    );
    expect(within(connections).getByText("GitHub").closest("button")).toBe(
      githubRow,
    );
    fireEvent.click(codexRow);
    expect(codexSettings.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    fireEvent.click(githubRow);
    expect(githubSettings.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("formats Codex plan names in account settings", () => {
    const account: SettingsViewModel["accounts"][number] = {
      id: 7,
      label: "Personal",
      email: "dev@example.com",
      plan_type: "prolite",
      status: "signed_in",
      last_error: null,
      last_used_at: null,
      created_at: "2026-08-29T08:00:00.000Z",
      updated_at: "2026-08-29T08:00:00.000Z",
      deleted_at: null,
    };

    render(
      <SettingsView
        model={model({ accounts: [account], selectedAccountId: account.id })}
        actions={actions()}
      />,
    );

    expect(screen.getByText("Pro Lite")).toBeInTheDocument();
    expect(screen.getByText("dev@example.com · Pro Lite")).toBeInTheDocument();
    expect(screen.queryByText("prolite")).not.toBeInTheDocument();
  });

  it("consolidates Codex account management into the account list", () => {
    const handlers = actions();
    const account: SettingsViewModel["accounts"][number] = {
      id: 7,
      label: "dev@example.com",
      email: "dev@example.com",
      plan_type: "prolite",
      status: "signed_in",
      last_error: null,
      last_used_at: null,
      created_at: "2026-08-29T08:00:00.000Z",
      updated_at: "2026-08-29T08:00:00.000Z",
      deleted_at: null,
    };

    render(
      <SettingsView
        model={model({
          accounts: [account],
          selectedAccountId: account.id,
          showLogout: true,
        })}
        actions={handlers}
      />,
    );

    const codexSettings = screen.getByRole("region", {
      name: "Codex settings",
    });
    const addAccount = within(codexSettings).getByRole("button", {
      name: "Add Codex account",
    });

    expect(within(codexSettings).getByText("Accounts")).toBeInTheDocument();
    expect(
      within(codexSettings).getByText("Choose the account used for new tasks."),
    ).toBeInTheDocument();
    expect(addAccount).toHaveClass("settings-icon-action");
    expect(within(codexSettings).getByRole("status", { name: "Selected" }))
      .toBeInTheDocument();
    expect(within(codexSettings).queryByText("Selected account")).toBeNull();
    expect(within(codexSettings).getByText("Pro Lite")).toBeInTheDocument();
    expect(
      within(codexSettings).queryByText("dev@example.com · Pro Lite"),
    ).toBeNull();

    fireEvent.click(addAccount);
    fireEvent.click(
      within(codexSettings).getByRole("button", {
        name: "Connect dev@example.com",
      }),
    );
    fireEvent.click(
      within(codexSettings).getByRole("button", {
        name: "Log out of dev@example.com",
      }),
    );

    expect(handlers.addAccount).toHaveBeenCalledOnce();
    expect(handlers.connectAccount).toHaveBeenCalledWith(account.id);
    expect(handlers.logout).toHaveBeenCalledOnce();
  });

  it("uses icon-only controls to select an account and cancel sign-in", () => {
    const handlers = actions();
    const signingInAccount: SettingsViewModel["accounts"][number] = {
      id: 7,
      label: "Personal",
      email: "personal@example.com",
      plan_type: null,
      status: "signed_out",
      last_error: null,
      last_used_at: null,
      created_at: "2026-08-29T08:00:00.000Z",
      updated_at: "2026-08-29T08:00:00.000Z",
      deleted_at: null,
    };
    const otherAccount: SettingsViewModel["accounts"][number] = {
      ...signingInAccount,
      id: 8,
      label: "Work",
      email: "work@example.com",
    };

    render(
      <SettingsView
        model={model({
          accounts: [signingInAccount, otherAccount],
          selectedAccountId: signingInAccount.id,
          pendingLoginAccountId: signingInAccount.id,
          pendingLoginId: "login-1",
          loginState: "waiting",
        })}
        actions={handlers}
      />,
    );

    const selectAccount = screen.getByRole("button", { name: "Select Work" });
    const cancelSignIn = screen.getByRole("button", {
      name: "Cancel sign-in for Personal",
    });

    expect(selectAccount).toHaveClass("settings-icon-action");
    expect(selectAccount.querySelector(".lucide-check")).toBeInTheDocument();
    expect(selectAccount).not.toHaveTextContent("Select");
    expect(cancelSignIn).toHaveClass("settings-icon-action");
    expect(cancelSignIn.querySelector(".lucide-x")).toBeInTheDocument();
    expect(cancelSignIn).not.toHaveTextContent("Cancel sign-in");

    fireEvent.click(selectAccount);
    fireEvent.click(cancelSignIn);

    expect(handlers.selectAccount).toHaveBeenCalledWith(otherAccount.id);
    expect(handlers.cancelLogin).toHaveBeenCalledOnce();
  });

  it("omits removed overview, appearance, and product information", () => {
    render(<SettingsView model={model()} actions={actions()} />);

    expect(
      screen.queryByRole("navigation", { name: "Settings sections" }),
    ).toBeNull();
    expect(screen.queryByText("Browser & computer use")).toBeNull();
    expect(screen.queryByText(/Install extension/i)).toBeNull();
    expect(screen.queryByText(/Safari automation/i)).toBeNull();
    expect(screen.queryByText(/default browser/i)).toBeNull();
    expect(screen.queryByText("Notification rules")).toBeNull();
    expect(screen.queryByText("Theme")).not.toBeInTheDocument();
    expect(screen.queryByText("Choose how Orchestrator looks.")).toBeNull();
    expect(screen.queryByText("Use local OSS provider")).toBeNull();
    expect(screen.queryByText("OSS provider")).toBeNull();
    expect(screen.queryByText("Token-aware Codex workspace")).toBeNull();
    expect(
      screen.queryByText("Manage how Orchestrator works for you."),
    ).toBeNull();
  });

  it("updates notification preferences without owning persistence", () => {
    const handlers = actions();
    render(<SettingsView model={model()} actions={handlers} />);

    fireEvent.click(
      screen.getByRole("checkbox", { name: /approval requests/i }),
    );
    expect(handlers.setNotificationPreference).toHaveBeenCalledWith(
      "approvalRequired",
      false,
    );
  });

  it("filters overview and detail sections from settings search", () => {
    render(<SettingsView model={model()} actions={actions()} />);

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search settings" }),
      {
        target: { value: "github" },
      },
    );

    expect(
      screen.getByRole("region", { name: "Connections overview" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "GitHub settings" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Quick preferences" }),
    ).toBeNull();
    expect(
      screen.queryByRole("region", { name: "Computer use settings" }),
    ).toBeNull();
  });

  it("shows bundled CLI availability without requesting app credentials", () => {
    const handlers = actions();
    render(
      <SettingsView
        model={model({
          githubConnection: {
            available: false,
            connected: false,
            login: null,
            displayName: null,
            avatarUrl: null,
            status: "unavailable",
            message: "The bundled GitHub CLI runtime is unavailable.",
            cliVersion: null,
            deviceCode: null,
            verificationUri: null,
            loginGeneration: null,
            browserOpened: false,
          },
        })}
        actions={handlers}
      />,
    );

    const githubSettings = screen.getByRole("region", {
      name: "GitHub settings",
    });
    const connect = within(githubSettings).getByRole("button", {
      name: "Connect GitHub",
    });
    expect(connect).toBeDisabled();
    expect(
      screen.queryByRole("textbox", { name: /github app client id/i }),
    ).toBeNull();
  });

  it("returns an in-progress CLI login to the shared modal", () => {
    const handlers = actions();
    render(
      <SettingsView
        model={model({
          githubConnectionPending: true,
          githubConnection: {
            available: true,
            connected: false,
            login: null,
            displayName: null,
            avatarUrl: null,
            status: "connecting",
            message: "Complete sign-in in your browser.",
            cliVersion: "2.96.0",
            deviceCode: "ABCD-1234",
            verificationUri: "https://github.com/login/device",
            loginGeneration: 4,
            browserOpened: false,
          },
        })}
        actions={handlers}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "View GitHub sign-in" }),
    );
    expect(handlers.showGithubLogin).toHaveBeenCalledOnce();
    expect(screen.queryByText("ABCD-1234")).not.toBeInTheDocument();
  });
});
