import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EMPTY_PLUGIN_CATALOG } from "../plugins/types";
import type { SettingsViewActions, SettingsViewModel } from "./SettingsView";
import {
  activeAccountMembershipKey,
  useSettingsViewBindings,
} from "./useSettingsViewBindings";

function model(): SettingsViewModel {
  return {
    computerUseEnabled: true,
    browserPreferences: {
      downloadLocation: null,
      askWhereToSave: false,
    },
    browserReadiness: {
      available: false,
      message: null,
      pluginId: null,
      pluginInstalled: false,
      pluginEnabled: false,
      isolatedProfile: true,
      profileImportAvailable: false,
    },
    desktopRuntimeStatus: null,
    pluginCatalog: EMPTY_PLUGIN_CATALOG,
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
    codexConnected: false,
    accounts: [],
    selectedAccountId: null,
    pendingLoginAccountId: null,
    pendingLoginId: null,
    loginState: "idle",
    activeRunAccountIds: new Set([2, 1]),
    runIsActive: false,
    authMessage: "No account selected",
    showLogout: false,
  };
}

function actions(
  overrides: Partial<SettingsViewActions> = {},
): SettingsViewActions {
  return {
    setComputerUseEnabled: () => undefined,
    setBrowserAskWhereToSave: () => undefined,
    chooseBrowserDownloadLocation: () => undefined,
    resetBrowserDownloadLocation: () => undefined,
    clearBrowserData: async () => undefined,
    importBrowserProfile: () => undefined,
    openPlugins: () => undefined,
    refreshComputerUseStatus: () => undefined,
    openAccessibilitySettings: () => undefined,
    openScreenRecordingSettings: () => undefined,
    revokeAlwaysAllowedApplication: () => undefined,
    dismissLegacyBrowserMigrationNotice: () => undefined,
    connectGithub: () => undefined,
    showGithubLogin: () => undefined,
    disconnectGithub: () => undefined,
    setNotificationPreference: () => undefined,
    openNotificationSettings: () => undefined,
    enableNotifications: () => undefined,
    renameAccount: () => undefined,
    selectAccount: () => undefined,
    cancelLogin: () => undefined,
    loginAccount: () => undefined,
    removeAccount: () => undefined,
    addAccount: () => undefined,
    connectAccount: () => undefined,
    logout: () => undefined,
    ...overrides,
  };
}

describe("useSettingsViewBindings", () => {
  it("normalizes active account membership independently of insertion order", () => {
    expect(activeAccountMembershipKey(new Set([9, 2, 4]))).toBe("2,4,9");
    expect(activeAccountMembershipKey(new Set([4, 9, 2]))).toBe("2,4,9");
  });

  it("keeps bindings stable across unrelated parent renders and invokes the latest actions", () => {
    const firstOpenPlugins = vi.fn();
    const latestOpenPlugins = vi.fn();
    const baseModel = model();
    const { result, rerender } = renderHook(
      ({ currentModel, currentActions, unrelatedRevision }) => ({
        unrelatedRevision,
        bindings: useSettingsViewBindings({
          model: currentModel,
          actions: currentActions,
        }),
      }),
      {
        initialProps: {
          currentModel: baseModel,
          currentActions: actions({ openPlugins: firstOpenPlugins }),
          unrelatedRevision: 0,
        },
      },
    );
    const initialBindings = result.current.bindings;
    const initialModel = initialBindings.model;
    const initialActions = initialBindings.actions;

    rerender({
      currentModel: {
        ...baseModel,
        activeRunAccountIds: new Set([1, 2]),
      },
      currentActions: actions({ openPlugins: latestOpenPlugins }),
      unrelatedRevision: 1,
    });

    expect(result.current.bindings).toBe(initialBindings);
    expect(result.current.bindings.model).toBe(initialModel);
    expect(result.current.bindings.actions).toBe(initialActions);
    act(() => result.current.bindings.actions.openPlugins());
    expect(firstOpenPlugins).not.toHaveBeenCalled();
    expect(latestOpenPlugins).toHaveBeenCalledOnce();
  });

  it("updates the model only when settings data or active membership changes", () => {
    const baseModel = model();
    const baseActions = actions();
    const { result, rerender } = renderHook(
      ({ currentModel }) =>
        useSettingsViewBindings({ model: currentModel, actions: baseActions }),
      { initialProps: { currentModel: baseModel } },
    );
    const initialActions = result.current.actions;
    const initialModel = result.current.model;

    rerender({ currentModel: { ...baseModel, pluginsLoading: true } });
    expect(result.current.model).not.toBe(initialModel);
    expect(result.current.model.pluginsLoading).toBe(true);
    expect(result.current.actions).toBe(initialActions);

    const loadingModel = result.current.model;
    rerender({
      currentModel: {
        ...baseModel,
        pluginsLoading: true,
        activeRunAccountIds: new Set([1, 3]),
      },
    });
    expect(result.current.model).not.toBe(loadingModel);
    expect(result.current.model.activeRunAccountIds).toEqual(new Set([1, 3]));
  });
});
