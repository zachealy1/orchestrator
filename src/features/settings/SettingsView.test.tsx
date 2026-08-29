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
    setDesktopUseEnabled: vi.fn(),
    setDiagnosticsEnabled: vi.fn(),
    setDeveloperModeEnabled: vi.fn(),
    installDefaultBrowserExtension: vi.fn(),
    refreshBrowserRuntimeStatus: vi.fn(),
    openDefaultBrowserAccessibilitySettings: vi.fn(),
    enableSafariAutomation: vi.fn(),
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
    desktopUseEnabled: false,
    diagnosticsEnabled: false,
    developerModeEnabled: false,
    browserRuntimeStatus: {
      available: true,
      message: null,
      defaultBrowser: null,
      browserSkillVersion: "26.818.31338",
      browserServiceCompatible: true,
    },
    desktopRuntimeStatus: {
      available: true,
      message: null,
      version: "1.0.1000816",
      serviceCompatible: true,
      accessibilityTrusted: true,
    },
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
      screen.getByRole("checkbox", { name: /enable browser computer use/i }),
    );

    expect(handlers.setComputerUseEnabled).toHaveBeenCalledWith(false);
  });

  it("labels the browser runtime status card as Computer use", () => {
    const { rerender } = render(
      <SettingsView model={model()} actions={actions()} />,
    );
    const computerUseSection = screen.getByRole("region", {
      name: "Computer use settings",
    });
    computerUseSection.scrollIntoView = vi.fn();

    const readyCard = screen.getByRole("button", {
      name: /computer use\s*browser ready/i,
    });
    expect(within(readyCard).getByText("Computer use")).toBeInTheDocument();
    expect(screen.queryByText("Browser")).toBeNull();

    fireEvent.click(readyCard);
    expect(computerUseSection.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });

    rerender(
      <SettingsView
        model={model({
          browserRuntimeStatus: {
            available: false,
            message: "The browser runtime is unavailable.",
            defaultBrowser: null,
            browserSkillVersion: "26.818.31338",
            browserServiceCompatible: true,
          },
        })}
        actions={actions()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /computer use\s*not available/i }),
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
      "Computer use settings",
      "Notification settings",
      "GitHub settings",
      "Codex settings",
    ].forEach((regionName) => {
      const statuses = within(
        screen.getByRole("region", { name: regionName }),
      ).getAllByRole("status");
      expect(statuses).toHaveLength(1);
      expect(statuses[0]).toHaveClass("settings-status-badge");
    });
    expect(screen.getAllByRole("status")).toHaveLength(4);
    expect(screen.getByRole("status", { name: "Available" })).toHaveClass(
      "positive",
    );
    expect(screen.getByRole("status", { name: "Allowed" })).toHaveClass(
      "positive",
    );
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
          browserRuntimeStatus: null,
          githubConnectionPending: true,
          notificationPermission: "not-enabled",
          codexConnected: false,
        })}
        actions={actions()}
      />,
    );

    expect(screen.getByRole("status", { name: "Checking" })).toHaveClass(
      "pending",
    );
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
          browserRuntimeStatus: {
            available: false,
            message: "The browser runtime is unavailable.",
            defaultBrowser: null,
            browserSkillVersion: "26.818.31338",
            browserServiceCompatible: true,
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

  it("renders matching icons in both settings overview headers", () => {
    render(<SettingsView model={model()} actions={actions()} />);

    [
      { region: "Quick preferences", iconClass: "lucide-settings" },
      { region: "Connections overview", iconClass: "lucide-plug" },
    ].forEach(({ region, iconClass }) => {
      const panel = screen.getByRole("region", { name: region });
      const header = panel.querySelector(".settings-overview-panel-header");
      const icon = panel.querySelector(
        `.settings-detail-header-icon .${iconClass}`,
      );

      expect(header).toHaveClass("settings-detail-header");
      expect(icon).toBeInTheDocument();
      expect(icon?.closest(".settings-detail-header-icon")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    });
  });

  it("opens connection settings from the restored Manage buttons", () => {
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

  it("omits removed overview, appearance, and product information", () => {
    render(<SettingsView model={model()} actions={actions()} />);

    expect(
      screen.queryByRole("navigation", { name: "Settings sections" }),
    ).toBeNull();
    expect(screen.queryByText("Browser & computer use")).toBeNull();
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

  it("routes the agent alerts shortcut through every notification preference", () => {
    const handlers = actions();
    render(<SettingsView model={model()} actions={handlers} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Agent alerts" }));

    expect(handlers.setNotificationPreference).toHaveBeenCalledTimes(5);
    expect(handlers.setNotificationPreference).toHaveBeenCalledWith(
      "responseCompleted",
      false,
    );
    expect(handlers.setNotificationPreference).toHaveBeenCalledWith(
      "externalAction",
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
