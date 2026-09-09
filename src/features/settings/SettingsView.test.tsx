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
    refreshBrowserStatus: vi.fn(),
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
    authError: null,
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

  it("confirms Browser data clearing and leaves feedback to the application host", async () => {
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
    expect(document.querySelector(".settings-screen-status-anchor")).toBeNull();
    expect(
      screen.queryByRole("complementary", {
        name: "Browser data notification",
      }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());

    fireEvent.click(trigger);
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Clear browser data?" }))
        .getByRole("button", { name: "Keep browser data" }),
    );
  });

  it("closes the confirmation after Browser data clearing fails", async () => {
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

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Clear browser data?" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("complementary", {
        name: "Browser data notification",
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
              "Allow Accessibility and Screen Recording for Orchestrator in System Settings. If already enabled, restart the app.",
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
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger);
    expect(
      computerUse.querySelector(".computer-use-runtime-error"),
    ).toBeNull();

    const dialog = screen.getByRole("dialog", {
      name: "Computer Use unavailable",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(dialog).toHaveTextContent("Allow Accessibility and Screen Recording for Orchestrator in System Settings. If already enabled, restart the app.");
    expect(dialog).not.toHaveTextContent("Running executable:");
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
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.click(
      within(
        screen.getByRole("dialog", {
          name: "Computer Use unavailable",
        }),
      ).getByRole("button", { name: "Open Accessibility settings" }),
    );
    expect(handlers.openAccessibilitySettings).toHaveBeenCalledOnce();

    fireEvent.click(trigger);
    fireEvent.click(
      within(
        screen.getByRole("dialog", {
          name: "Computer Use unavailable",
        }),
      ).getByRole("button", { name: "Check again" }),
    );
    expect(handlers.refreshComputerUseStatus).toHaveBeenCalledOnce();

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
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
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger);

    expect(
      within(computerUse).getByRole("checkbox", {
        name: /any approved app/i,
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /computer use\s*not available/i }),
    ).toBeInTheDocument();

    const dialog = screen.getByRole("dialog", {
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
        expect(screen.queryByRole("dialog")).toBeNull();
        return;
      }

      const trigger = within(computerUse).getByRole("button", {
        name: "Computer Use unavailable. Show details",
      });
      if (trigger.getAttribute("aria-expanded") === "false") {
        fireEvent.click(trigger);
      }
      const dialog = screen.getByRole("dialog", {
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
    const dialog = screen.getByRole("dialog", {
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

  it("keeps the Browser runtime probe neutral until readiness resolves", () => {
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

    expect(screen.queryByText("The browser runtime is unavailable.")).toBeNull();
    fireEvent.click(within(browser).getByRole("button", { name: "Browser unavailable. Show details" }));
    expect(screen.getByRole("dialog", { name: "Browser unavailable" })).toHaveTextContent("The browser runtime is unavailable.");
  });

  it("keeps browser import and runtime in the shared divided settings list", () => {
    render(<SettingsView model={model()} actions={actions()} />);
    const browser = screen.getByRole("region", { name: "Browser settings" });
    const importRow = within(browser).getByText("Import browser profile").closest(".setting-row");
    const runtimeRow = within(browser).getByText("Browser runtime").closest(".setting-row");

    expect(importRow?.parentElement).toHaveClass("setting-list");
    expect(runtimeRow?.parentElement).toBe(importRow?.parentElement);
    expect(importRow?.nextElementSibling).toBe(runtimeRow);
    expect(runtimeRow?.parentElement?.lastElementChild).toBe(runtimeRow);
    expect(within(browser).getByRole("button", { name: "Import browser profile" }).closest(".setting-row")).toBe(importRow);
    expect(within(browser).getByRole("button", { name: "Refresh Browser status" }).closest(".setting-row")).toBe(runtimeRow);
  });

  it("shows a failed Browser check neutrally with an accessible retry", () => {
    const handlers = actions();
    render(<SettingsView model={model({ browserReadiness: {
      available: false, checking: false, checkFailed: true,
      message: "Could not check this account’s browser runtime.",
      pluginId: "browser@openai-bundled", pluginInstalled: true, pluginEnabled: true,
      isolatedProfile: true, profileImportAvailable: false,
    } })} actions={handlers} />);
    const browser = screen.getByRole("region", { name: "Browser settings" });
    expect(within(browser).queryByRole("alert")).toBeNull();
    expect(within(browser).getAllByRole("status", { name: "Not checked" })).toHaveLength(1);
    expect(within(browser).queryByRole("button", { name: "Open Plugins for the in-app browser" })).toBeNull();
    fireEvent.click(within(browser).getByRole("button", { name: "Refresh Browser status" }));
    expect(handlers.refreshBrowserStatus).toHaveBeenCalledOnce();
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
    expect(unavailableStatuses).toHaveLength(4);
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

  it.each(["engine", "models"])("does not expose removed %s controls through settings search", (query) => {
    render(<SettingsView model={model()} actions={actions()} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search settings" }), {
      target: { value: query },
    });
    expect(screen.queryByRole("region", { name: "Codex settings" })).not.toBeInTheDocument();
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

describe("Settings warning details", () => {
  it.each([
    { pluginInstalled: false, pluginEnabled: false, checkFailed: false, message: "Install the Browser plugin.", action: "Open Plugins" },
    { pluginInstalled: true, pluginEnabled: false, checkFailed: false, message: "Enable the Browser plugin.", action: "Open Plugins" },
    { pluginInstalled: true, pluginEnabled: true, checkFailed: false, message: "Browser service is unavailable.", action: "Check again" },
    { pluginInstalled: true, pluginEnabled: true, checkFailed: true, message: "Browser check timed out.", action: "Check again" },
  ])("shows Browser details for $message only on click with the appropriate recovery", (readiness) => {
    const handlers = actions();
    render(<SettingsView model={model({ browserReadiness: { ...model().browserReadiness, ...readiness, available: false } })} actions={handlers} />);
    expect(screen.queryByText(readiness.message)).toBeNull();
    const region = screen.getByRole("region", { name: "Browser settings" });
    const title = readiness.checkFailed ? "Browser check failed" : "Browser unavailable";
    const trigger = within(region).getByRole("button", { name: `${title}. Show details` });
    expect(trigger).toHaveClass(readiness.checkFailed ? "neutral" : "negative");
    expect(within(region).getByText("Provides the isolated browser for this account.")).toBeInTheDocument();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: title });
    expect(dialog).toHaveTextContent(readiness.message);
    expect(within(dialog).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: readiness.action }));
    expect(readiness.action === "Open Plugins" ? handlers.openPlugins : handlers.refreshBrowserStatus).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    const refresh = within(region).getByRole("button", { name: "Refresh Browser status" });
    if (readiness.pluginInstalled && readiness.pluginEnabled) expect(refresh).toBeEnabled();
    else expect(refresh).toBeDisabled();
  });

  it("closes Browser details while checking and keeps refreshed failures closed", () => {
    const base = model({ browserReadiness: { ...model().browserReadiness, available: false, message: "Check failed.", checkFailed: true } });
    const handlers = actions();
    const { rerender } = render(<SettingsView model={base} actions={handlers} />);
    fireEvent.click(screen.getByRole("button", { name: "Browser check failed. Show details" }));
    rerender(<SettingsView model={{ ...base, browserReadiness: { ...base.browserReadiness, checking: true } }} actions={handlers} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Browser check failed. Show details" })).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh Browser status" })).toBeDisabled();
    rerender(<SettingsView model={base} actions={handlers} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Browser check failed. Show details" }));
    rerender(<SettingsView model={model()} actions={handlers} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("retains the profile import description and disabled action while disclosing the limitation", () => {
    const { rerender } = render(<SettingsView model={model()} actions={actions()} />);
    expect(screen.getByText("Import supported profile data into the isolated browser.")).toBeInTheDocument();
    expect(screen.queryByText("Profile import is not available on this device.")).toBeNull();
    expect(screen.getByRole("button", { name: "Import browser profile" })).toBeDisabled();
    const trigger = screen.getByRole("button", { name: "Profile import unavailable. Show details" });
    expect(trigger.closest(".setting-row")).toHaveTextContent("Import browser profile");
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toHaveTextContent("Profile import is not available on this device.");
    expect(within(screen.getByRole("dialog")).queryByRole("button")).toBeNull();
    rerender(<SettingsView model={model({ browserReadiness: { ...model().browserReadiness, profileImportAvailable: true } })} actions={actions()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Import browser profile" })).toBeEnabled();
  });

  it.each(["unavailable", "reconnect_required"])("discloses GitHub %s diagnostics without hiding identity/version or sign-in controls", (status) => {
    const handlers = actions();
    render(<SettingsView model={model({ githubConnection: githubConnection({ status, available: status !== "unavailable", message: "GitHub diagnostic detail." }) })} actions={handlers} />);
    expect(screen.queryByText(/GitHub diagnostic detail/)).toBeNull();
    expect(screen.getByText("GitHub CLI 2.96.0")).toBeInTheDocument();
    const title = status === "unavailable" ? "GitHub unavailable" : "GitHub reconnection required";
    fireEvent.click(screen.getByRole("button", { name: `${title}. Show details` }));
    const dialog = screen.getByRole("dialog", { name: title });
    expect(dialog).toHaveTextContent("GitHub diagnostic detail.");
    if (status === "unavailable") {
      expect(screen.getByRole("button", { name: "Connect GitHub" })).toBeDisabled();
      expect(within(dialog).queryByRole("button")).toBeNull();
    } else {
      fireEvent.click(within(dialog).getByRole("button", { name: "Reconnect GitHub" }));
      expect(handlers.connectGithub).toHaveBeenCalledOnce();
    }
  });

  it.each(["denied", "unavailable"] as const)("discloses notification %s details with applicable recovery", (permission) => {
    const handlers = actions();
    render(<SettingsView model={model({ notificationPermission: permission })} actions={handlers} />);
    const title = permission === "denied" ? "Notifications denied" : "Notifications unavailable";
    const trigger = screen.getByRole("button", { name: `${title}. Show details` });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: title });
    expect(dialog.textContent!.length).toBeGreaterThan(title.length);
    if (permission === "denied") {
      fireEvent.click(within(dialog).getByRole("button", { name: "Open System Settings" }));
      expect(handlers.openNotificationSettings).toHaveBeenCalledOnce();
    } else {
      expect(within(dialog).queryByRole("button")).toBeNull();
      expect(screen.getByRole("button", { name: "Enable notifications" })).toBeDisabled();
    }
    expect(screen.getByRole("checkbox", { name: "Completed responses" })).toBeEnabled();
  });

  it("keeps signed-out, disconnected, and notifications-off states non-interactive", () => {
    render(<SettingsView model={model({ codexConnected: false, notificationPermission: "not-enabled", githubConnection: githubConnection({ message: "Connect GitHub CLI to publish." }) })} actions={actions()} />);
    for (const name of ["GitHub settings", "Codex settings", "Notification settings"]) {
      expect(screen.getByRole("region", { name }).querySelector('[aria-haspopup="dialog"]')).toBeNull();
    }
  });

  const account = (id: number, label: string): SettingsViewModel["accounts"][number] => ({
    id, label, email: `${label}@example.com`, plan_type: "pro", status: "signed_in", last_error: null,
    last_used_at: null, created_at: "2026-09-09", updated_at: "2026-09-09", deleted_at: null,
  });

  it("puts errors on their account rows and retains ordinary summaries and active-run restrictions", () => {
    const handlers = actions();
    const first = { ...account(1, "Personal"), status: "error" as const, last_error: "Personal sign-in expired." };
    const second = { ...account(2, "Work"), last_error: "Work connection failed." };
    render(<SettingsView model={model({ accounts: [first, second], selectedAccountId: 2, codexConnected: false,
      authMessage: "Work connection failed.", authError: "Work connection failed.", activeRunAccountIds: new Set([1]), runIsActive: true })} actions={handlers} />);
    expect(screen.queryByText("Personal sign-in expired.")).toBeNull();
    expect(screen.queryByText("Work connection failed.")).toBeNull();
    expect(screen.getByText("Personal@example.com · Pro")).toBeInTheDocument();
    expect(screen.getByText("Work@example.com · Pro")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Codex connection error. Show details" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Personal error. Show details" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Personal sign-in expired.");
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Retry" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Work error. Show details" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toHaveTextContent("Work connection failed.");
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Retry" })).toBeDisabled();
    expect(handlers.connectAccount).not.toHaveBeenCalled();
    expect(handlers.loginAccount).not.toHaveBeenCalled();
  });

  it("uses explicit errors without parsing auth text and updates current diagnostics", () => {
    const base = model({ accounts: [account(1, "Personal")], selectedAccountId: 1, codexConnected: false,
      authMessage: "Disconnected summary", authError: "Explicit diagnostic" });
    const handlers = actions();
    const { rerender } = render(<SettingsView model={base} actions={handlers} />);
    expect(screen.queryByText("Explicit diagnostic")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Personal error. Show details" }));
    rerender(<SettingsView model={{ ...base, authError: "Updated diagnostic" }} actions={handlers} />);
    expect(screen.getByRole("dialog")).toHaveTextContent("Updated diagnostic");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Retry" }));
    expect(handlers.connectAccount).toHaveBeenCalledWith(1);
    rerender(<SettingsView model={{ ...base, authError: null, authMessage: "This normal summary mentions an error" }} actions={handlers} />);
    expect(screen.queryByRole("button", { name: "Personal error. Show details" })).toBeNull();
    expect(screen.getByText("This normal summary mentions an error")).toBeInTheDocument();
  });

  it("uses the connection header for errors without a corresponding account row", () => {
    render(<SettingsView model={model({ accounts: [account(2, "Work")], selectedAccountId: 1, codexConnected: false, authError: "Connection could not start." })} actions={actions()} />);
    const trigger = screen.getByRole("button", { name: "Codex connection error. Show details" });
    expect(trigger.closest(".settings-detail-header")).not.toBeNull();
    expect(screen.queryByText("Connection could not start.")).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toHaveTextContent("Connection could not start.");
  });

  it("keeps pending sign-in instructions, device codes and cancellation visible during retries", () => {
    render(<SettingsView model={model({ accounts: [{ ...account(1, "Personal"), status: "error", last_error: "Previous failure" }], selectedAccountId: 1,
      loginState: "waiting", pendingLoginAccountId: 1, pendingLoginId: "login-1", authMessage: "Enter code ABCD-1234 in the browser." })} actions={actions()} />);
    expect(screen.getByText(/Enter code ABCD-1234 in the browser/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel sign-in for Personal" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Personal error. Show details" })).toBeNull();
  });

  it("closes details when their account changes, their section is filtered or Settings is left", () => {
    const base = model({ accounts: [account(1, "Personal"), account(2, "Work")], selectedAccountId: 1 });
    const handlers = actions();
    const { rerender, unmount } = render(<SettingsView model={base} actions={handlers} />);
    const open = () => fireEvent.click(screen.getByRole("button", { name: "Profile import unavailable. Show details" }));
    open();
    rerender(<SettingsView model={{ ...base, selectedAccountId: 2 }} actions={handlers} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "accounts" } });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    unmount();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("closes portaled details when preloaded Settings becomes inactive", () => {
    const base = model();
    const handlers = actions();
    const { rerender } = render(<SettingsView model={base} actions={handlers} active />);
    fireEvent.click(screen.getByRole("button", { name: "Profile import unavailable. Show details" }));
    rerender(<SettingsView model={base} actions={handlers} active={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<SettingsView model={base} actions={handlers} active />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not offer connection recovery for a different signed-in account", () => {
    render(<SettingsView model={model({ accounts: [account(1, "Personal"), { ...account(2, "Work"), last_error: "Work warning" }], selectedAccountId: 1 })} actions={actions()} />);
    fireEvent.click(screen.getByRole("button", { name: "Work error. Show details" }));
    expect(within(screen.getByRole("dialog")).queryByRole("button")).toBeNull();
  });

});
