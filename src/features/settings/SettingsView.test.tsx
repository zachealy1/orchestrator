import { fireEvent, render, screen } from "@testing-library/react";
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
});
