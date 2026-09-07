import { useMemo } from "react";
import { useStableEvent } from "../../shared/reactRuntime";
import type { SettingsViewActions, SettingsViewModel } from "./SettingsView";

export type SettingsViewBindings = {
  model: SettingsViewModel;
  actions: SettingsViewActions;
};

export function activeAccountMembershipKey(accountIds: ReadonlySet<number>) {
  return [...accountIds].sort((left, right) => left - right).join(",");
}

export function useSettingsViewBindings(input: SettingsViewBindings) {
  const currentModel = input.model;
  const currentActions = input.actions;
  const activeRunAccountMembership = activeAccountMembershipKey(
    currentModel.activeRunAccountIds,
  );
  const activeRunAccountIds = useMemo(
    () => new Set(currentModel.activeRunAccountIds),
    [activeRunAccountMembership],
  );

  const setComputerUseEnabled = useStableEvent(
    currentActions.setComputerUseEnabled,
  );
  const setBrowserAskWhereToSave = useStableEvent(
    currentActions.setBrowserAskWhereToSave,
  );
  const chooseBrowserDownloadLocation = useStableEvent(
    currentActions.chooseBrowserDownloadLocation,
  );
  const resetBrowserDownloadLocation = useStableEvent(
    currentActions.resetBrowserDownloadLocation,
  );
  const clearBrowserData = useStableEvent(currentActions.clearBrowserData);
  const importBrowserProfile = useStableEvent(
    currentActions.importBrowserProfile,
  );
  const openPlugins = useStableEvent(currentActions.openPlugins);
  const refreshComputerUseStatus = useStableEvent(
    currentActions.refreshComputerUseStatus,
  );
  const openAccessibilitySettings = useStableEvent(
    currentActions.openAccessibilitySettings,
  );
  const openScreenRecordingSettings = useStableEvent(
    currentActions.openScreenRecordingSettings,
  );
  const revokeAlwaysAllowedApplication = useStableEvent(
    currentActions.revokeAlwaysAllowedApplication,
  );
  const connectGithub = useStableEvent(currentActions.connectGithub);
  const showGithubLogin = useStableEvent(currentActions.showGithubLogin);
  const disconnectGithub = useStableEvent(currentActions.disconnectGithub);
  const setNotificationPreference = useStableEvent(
    currentActions.setNotificationPreference,
  );
  const openNotificationSettings = useStableEvent(
    currentActions.openNotificationSettings,
  );
  const enableNotifications = useStableEvent(
    currentActions.enableNotifications,
  );
  const renameAccount = useStableEvent(currentActions.renameAccount);
  const selectAccount = useStableEvent(currentActions.selectAccount);
  const cancelLogin = useStableEvent(currentActions.cancelLogin);
  const loginAccount = useStableEvent(currentActions.loginAccount);
  const removeAccount = useStableEvent(currentActions.removeAccount);
  const addAccount = useStableEvent(currentActions.addAccount);
  const connectAccount = useStableEvent(currentActions.connectAccount);
  const logout = useStableEvent(currentActions.logout);

  const model = useMemo<SettingsViewModel>(
    () => ({ ...currentModel, activeRunAccountIds }),
    [
      activeRunAccountIds,
      currentModel.accounts,
      currentModel.engine,
      currentModel.alwaysAllowedApplications,
      currentModel.authMessage,
      currentModel.browserPreferences,
      currentModel.browserReadiness,
      currentModel.codexConnected,
      currentModel.computerUseEnabled,
      currentModel.desktopRuntimeStatus,
      currentModel.dragRegion,
      currentModel.githubConnection,
      currentModel.githubConnectionPending,
      currentModel.loginState,
      currentModel.notificationPermission,
      currentModel.notificationPreferences,
      currentModel.pendingLoginAccountId,
      currentModel.pendingLoginId,
      currentModel.pluginCatalog,
      currentModel.pluginsLoading,
      currentModel.runIsActive,
      currentModel.selectedAccountId,
      currentModel.showLogout,
    ],
  );

  const actions = useMemo<SettingsViewActions>(
    () => ({
      setComputerUseEnabled,
      setBrowserAskWhereToSave,
      chooseBrowserDownloadLocation,
      resetBrowserDownloadLocation,
      clearBrowserData,
      importBrowserProfile,
      openPlugins,
      refreshComputerUseStatus,
      openAccessibilitySettings,
      openScreenRecordingSettings,
      revokeAlwaysAllowedApplication,
      connectGithub,
      showGithubLogin,
      disconnectGithub,
      setNotificationPreference,
      openNotificationSettings,
      enableNotifications,
      renameAccount,
      selectAccount,
      cancelLogin,
      loginAccount,
      removeAccount,
      addAccount,
      connectAccount,
      logout,
    }),
    [
      addAccount,
      cancelLogin,
      chooseBrowserDownloadLocation,
      clearBrowserData,
      connectAccount,
      connectGithub,
      disconnectGithub,
      enableNotifications,
      importBrowserProfile,
      loginAccount,
      logout,
      openAccessibilitySettings,
      openNotificationSettings,
      openPlugins,
      openScreenRecordingSettings,
      refreshComputerUseStatus,
      removeAccount,
      renameAccount,
      resetBrowserDownloadLocation,
      revokeAlwaysAllowedApplication,
      selectAccount,
      setBrowserAskWhereToSave,
      setComputerUseEnabled,
      setNotificationPreference,
      showGithubLogin,
    ],
  );

  return useMemo(() => ({ model, actions }), [actions, model]);
}
