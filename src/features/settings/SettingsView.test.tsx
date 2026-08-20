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
    setBrowserExecutionTarget: vi.fn(),
    installDefaultBrowserExtension: vi.fn(),
    refreshBrowserRuntimeStatus: vi.fn(),
    openDefaultBrowserAccessibilitySettings: vi.fn(),
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
    browserExecutionTarget: "default-browser",
    browserRuntimeStatus: {
      available: true,
      message: null,
      defaultBrowser: null,
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

describe("SettingsView", () => {
  it("routes capability changes through settings actions", () => {
    const handlers = actions();
    render(<SettingsView model={model()} actions={handlers} />);

    fireEvent.click(
      screen.getByRole("checkbox", { name: /enable browser computer use/i }),
    );

    expect(handlers.setComputerUseEnabled).toHaveBeenCalledWith(false);
  });

  it("omits removed overview, appearance, and product information", () => {
    render(<SettingsView model={model()} actions={actions()} />);

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
