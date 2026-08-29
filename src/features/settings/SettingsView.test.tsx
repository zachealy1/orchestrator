import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SettingsView,
  type SettingsViewActions,
  type SettingsViewModel,
} from "./SettingsView";

function actions(): SettingsViewActions {
  return {
    setComputerUseEnabled: vi.fn(),
    setBrowserAskWhereToSave: vi.fn(),
    chooseBrowserDownloadLocation: vi.fn(),
    resetBrowserDownloadLocation: vi.fn(),
    clearBrowserData: vi.fn(),
    importBrowserProfile: vi.fn(),
    openPlugins: vi.fn(),
    refreshComputerUseStatus: vi.fn(),
    openAccessibilitySettings: vi.fn(),
    openScreenRecordingSettings: vi.fn(),
    revokeAlwaysAllowedApplication: vi.fn(),
    dismissLegacyBrowserMigrationNotice: vi.fn(),
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
    setUseOss: vi.fn(),
    setOssProvider: vi.fn(),
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
    legacyBrowserMigrationNotice: false,
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
    useOss: false,
    ossProvider: "ollama",
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

    fireEvent.click(screen.getByRole("button", { name: "Clear data" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose" }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Ask where to save browser downloads",
      }),
    );
    const permissionButtons = screen.getAllByRole("button", {
      name: "Open settings",
    });
    fireEvent.click(permissionButtons[0]);
    fireEvent.click(permissionButtons[1]);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));

    expect(handlers.clearBrowserData).toHaveBeenCalledOnce();
    expect(handlers.chooseBrowserDownloadLocation).toHaveBeenCalledOnce();
    expect(handlers.setBrowserAskWhereToSave).toHaveBeenCalledWith(true);
    expect(handlers.openScreenRecordingSettings).toHaveBeenCalledOnce();
    expect(handlers.openAccessibilitySettings).toHaveBeenCalledOnce();
    expect(handlers.revokeAlwaysAllowedApplication).toHaveBeenCalledWith(
      "com.example.editor",
    );
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
      "Manage Codex accounts and optional OSS providers used for runs.",
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

  it("opens connection settings from dedicated Manage buttons", () => {
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

    const manageButtons = within(connections).getAllByRole("button", {
      name: "Manage",
    });

    expect(manageButtons).toHaveLength(2);
    expect(
      within(connections).getByText("Codex account").closest("button"),
    ).toBeNull();
    expect(within(connections).getByText("GitHub").closest("button")).toBeNull();
    fireEvent.click(manageButtons[0]);
    expect(codexSettings.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    fireEvent.click(manageButtons[1]);
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
    expect(screen.queryByText("Local models")).toBeNull();
    expect(screen.queryByText("Ollama or LM Studio.")).toBeNull();
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
      name: "Connect",
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

    fireEvent.click(screen.getByRole("button", { name: "View sign-in" }));
    expect(handlers.showGithubLogin).toHaveBeenCalledOnce();
    expect(screen.queryByText("ABCD-1234")).not.toBeInTheDocument();
  });
});
