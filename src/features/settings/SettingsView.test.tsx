import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SettingsView,
  type SettingsViewActions,
  type SettingsViewModel,
} from "./SettingsView";

function actions(): SettingsViewActions {
  return {
    setThemePreference: vi.fn(),
    setComputerUseEnabled: vi.fn(),
    connectGithub: vi.fn(),
    cancelGithubConnection: vi.fn(),
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
    themePreference: "system",
    computerUseEnabled: true,
    browserRuntimeStatus: { available: true, message: null },
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
  it("routes theme and capability changes through settings actions", () => {
    const handlers = actions();
    render(<SettingsView model={model()} actions={handlers} />);

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: /enable browser computer use/i }),
    );

    expect(handlers.setThemePreference).toHaveBeenCalledWith("dark");
    expect(handlers.setComputerUseEnabled).toHaveBeenCalledWith(false);
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
          },
        })}
        actions={handlers}
      />,
    );

    const githubSettings = screen.getByRole("region", { name: "GitHub settings" });
    const connect = within(githubSettings).getByRole("button", { name: "Connect" });
    expect(connect).toBeDisabled();
    expect(screen.queryByRole("textbox", { name: /github app client id/i })).toBeNull();
  });

  it("allows an in-progress CLI login to be cancelled", () => {
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
          },
        })}
        actions={handlers}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(handlers.cancelGithubConnection).toHaveBeenCalledOnce();
    expect(screen.getByText("ABCD-1234")).toBeInTheDocument();
  });
});
