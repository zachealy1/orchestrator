import { GitlabSettingsPanel, GitlabConnectionSummary } from "../gitlab/GitlabSettingsPanel";
import {
  Bell,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  GitPullRequest,
  FolderOpen,
  Info,
  LogIn,
  LogOut,
  Loader2,
  Monitor,
  Plug,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
  UserPlus,
  X,
} from "lucide-react";
import {
  memo,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { version as appVersion } from "../../../package.json";
import { OrchestratorMark } from "../../components/OrchestratorMark";
import type {
  AgentNotificationPermissionStatus,
  AgentNotificationPreferences,
} from "../../lib/agentNotifications";
import { formatCodexPlanType } from "../../lib/codexAuth";
import { trapDialogFocus } from "../../shared/dialogFocus";
import type { BrowserPreferences, BrowserReadiness } from "../browser/types";
import type {
  AlwaysAllowedApplication,
  DesktopRuntimeStatus,
} from "../interaction/types";
import {
  findPlugin,
  pluginIsReady,
  type CodexPluginCatalog,
} from "../plugins/types";
import type { CodexLoginState } from "../codex/types";
import type { CodexAccountProfile } from "../accounts/types";
import type { GithubConnectionStatus } from "../github/api";

import {
  SettingsStatusBadge,
  SettingsStatusPopover,
  SettingsStatusProvider,
  type SettingsDetailStatus,
} from "./SettingsStatusPopover";
import {
  accountStatusDetails,
  browserStatusDetails,
  computerUseStatusDetails,
  githubStatusDetails,
  notificationStatusDetails,
} from "./settingsStatusDetails";

type ComputerUsePermissionState = "verified" | "denied" | "unverified";

function computerUseRuntimeCanRun(status: DesktopRuntimeStatus | null) {
  return (
    status?.available === true &&
    status.serviceCompatible === true &&
    status.accessibilityTrusted !== false &&
    status.screenRecordingTrusted !== false
  );
}

function computerUsePermissionState(
  status: DesktopRuntimeStatus,
): ComputerUsePermissionState {
  if (
    status.accessibilityTrusted === false ||
    status.screenRecordingTrusted === false
  ) {
    return "denied";
  }
  if (
    status.accessibilityTrusted === true &&
    status.screenRecordingTrusted === true
  ) {
    return "verified";
  }
  return "unverified";
}

function computerUseDetailStatus(
  pluginReady: boolean,
  pluginsLoading: boolean,
  runtimeStatus: DesktopRuntimeStatus | null,
): SettingsDetailStatus {
  if (pluginsLoading || runtimeStatus === null) {
    return { label: "Checking", tone: "pending" };
  }
  if (
    !pluginReady ||
    runtimeStatus.available !== true ||
    runtimeStatus.serviceCompatible !== true ||
    computerUsePermissionState(runtimeStatus) === "denied"
  ) {
    return { label: "Unavailable", tone: "negative" };
  }
  if (computerUsePermissionState(runtimeStatus) === "unverified") {
    return { label: "Review access", tone: "neutral" };
  }
  return { label: "Available", tone: "positive" };
}

export type SettingsViewModel = {
  dragRegion?: string;
  computerUseEnabled: boolean;
  browserPreferences: BrowserPreferences;
  browserReadiness: BrowserReadiness;
  desktopRuntimeStatus: DesktopRuntimeStatus | null;
  pluginCatalog: CodexPluginCatalog;
  pluginsLoading: boolean;
  alwaysAllowedApplications: AlwaysAllowedApplication[];
  githubConnection: GithubConnectionStatus | null;
  githubConnectionPending: boolean;
  notificationPreferences: AgentNotificationPreferences;
  notificationPermission: AgentNotificationPermissionStatus;
  codexConnected: boolean;
  accounts: CodexAccountProfile[];
  selectedAccountId: number | null;
  pendingLoginAccountId: number | null;
  pendingLoginId: string | null;
  loginState: CodexLoginState;
  activeRunAccountIds: ReadonlySet<number>;
  runIsActive: boolean;
  authMessage: string;
  authError: string | null;
  showLogout: boolean;
};

export type SettingsViewActions = {
  setComputerUseEnabled: (enabled: boolean) => void;
  setBrowserAskWhereToSave: (enabled: boolean) => void;
  chooseBrowserDownloadLocation: () => void;
  resetBrowserDownloadLocation: () => void;
  clearBrowserData: () => Promise<void>;
  importBrowserProfile: () => void;
  openPlugins: () => void;
  refreshComputerUseStatus: () => void;
  refreshBrowserStatus: () => void;
  openAccessibilitySettings: () => void;
  openScreenRecordingSettings: () => void;
  revokeAlwaysAllowedApplication: (applicationId: string) => void;
  connectGithub: () => void;
  showGithubLogin: () => void;
  disconnectGithub: () => void;
  setNotificationPreference: (
    key: keyof AgentNotificationPreferences,
    enabled: boolean,
  ) => void;
  openNotificationSettings: () => void;
  enableNotifications: () => void;
  renameAccount: (accountId: number, label: string) => void;
  selectAccount: (accountId: number) => void;
  cancelLogin: () => void;
  loginAccount: (account: CodexAccountProfile) => void;
  removeAccount: (accountId: number) => void;
  addAccount: () => void;
  connectAccount: (accountId: number) => void;
  logout: () => void;
};

export const SettingsView = memo(function SettingsView({
  model,
  actions,
  active = true,
}: {
  model: SettingsViewModel;
  actions: SettingsViewActions;
  active?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [browserDataConfirmationOpen, setBrowserDataConfirmationOpen] =
    useState(false);
  const [browserDataClearPending, setBrowserDataClearPending] = useState(false);
  const clearBrowserDataButtonRef = useRef<HTMLButtonElement>(null);
  const matchesSettings = (...terms: string[]) => {
    const query = searchQuery.trim().toLowerCase();
    return query.length === 0 || terms.some((term) => term.includes(query));
  };
  const computerUsePlugin = findPlugin(
    model.pluginCatalog,
    "computer-use@openai-bundled",
    "computer-use",
  );
  const computerUseReady =
    pluginIsReady(computerUsePlugin) &&
    computerUseRuntimeCanRun(model.desktopRuntimeStatus);
  const computerUseStatus = computerUseDetailStatus(
    pluginIsReady(computerUsePlugin),
    model.pluginsLoading,
    model.desktopRuntimeStatus,
  );
  const browserReadinessChecking =
    model.pluginsLoading || model.browserReadiness.checking;
  const browserStatus = browserStatusDetails(
    model.browserReadiness,
    browserReadinessChecking,
    actions.openPlugins,
    actions.refreshBrowserStatus,
  );
  const githubStatus = githubStatusDetails(
    model.githubConnection,
    model.githubConnectionPending,
    actions.connectGithub,
  );
  const authErrorHasAccount = model.accounts.some(
    (account) => account.id === model.selectedAccountId,
  );
  const connectionError = !authErrorHasAccount ? model.authError : null;
  const browserPluginUnavailable =
    !browserReadinessChecking &&
    !model.browserReadiness.checkFailed &&
    (!model.browserReadiness.pluginInstalled ||
      !model.browserReadiness.pluginEnabled);
  const externalBrowserPlugins = ["chrome", "edge", "brave", "opera", "vivaldi"]
    .map((name) => findPlugin(model.pluginCatalog, name))
    .filter((plugin) => plugin !== null);

  const restoreClearBrowserDataFocus = () => {
    window.requestAnimationFrame(() => {
      clearBrowserDataButtonRef.current?.focus({ preventScroll: true });
    });
  };

  const requestBrowserDataClear = () => {
    if (browserDataClearPending) return;
    setBrowserDataConfirmationOpen(true);
  };

  const cancelBrowserDataClear = () => {
    if (browserDataClearPending) return;
    setBrowserDataConfirmationOpen(false);
    restoreClearBrowserDataFocus();
  };

  const confirmBrowserDataClear = async () => {
    if (browserDataClearPending) return;
    setBrowserDataClearPending(true);
    try {
      await actions.clearBrowserData();
    } catch {
      // ApplicationRuntime reports failures through the persistent notification host.
    } finally {
      setBrowserDataClearPending(false);
      setBrowserDataConfirmationOpen(false);
      restoreClearBrowserDataFocus();
    }
  };

  return (
    <SettingsStatusProvider scope={model.selectedAccountId} active={active}>
      <SettingsOverview
        model={model}
        actions={actions}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />

      {matchesSettings(
        "browser",
        "in-app browser",
        "browser data",
        "downloads",
        "profile import",
        "plugins",
      ) ? (
        <section
          className="surface settings-panel browser-settings-panel"
          aria-label="Browser settings"
          id="settings-browser"
        >
          <SettingsDetailHeader
            icon={Monitor}
            title="Browser"
            status={browserStatus.status}
            statusContent={<SettingsStatusPopover {...browserStatus} />}
          />
          <div className="setting-list">
            {browserReadinessChecking ? (
              <div className="setting-row">
                <div>
                  <strong>In-app browser</strong>
                  <span>
                    Uses a persistent profile that is isolated from your regular
                    browser.
                  </span>
                </div>
                <SettingsStatusBadge label="Checking" tone="pending" />
              </div>
            ) : browserPluginUnavailable ? (
              <SettingsNavigationRow
                label="In-app browser"
                description="Uses a persistent profile that is isolated from your regular browser."
                ariaLabel="Open Plugins for the in-app browser"
                onActivate={actions.openPlugins}
              />
            ) : (
              <div className="setting-row">
                <div>
                  <strong>In-app browser</strong>
                  <span>
                    Uses a persistent profile that is isolated from your regular
                    browser.
                  </span>
                </div>
                {model.browserReadiness.available && (
                  <SettingsStatusBadge label="Ready" tone="positive" />
                )}
              </div>
            )}
            <div className="setting-row">
              <div>
                <strong>Browser data</strong>
                <span>
                  Clear cookies, site data, cache, and task tabs from the
                  isolated profile.
                </span>
              </div>
              <SettingsIconAction
                icon={Trash2}
                ariaLabel="Clear data"
                tooltip="Clear browser data"
                danger
                buttonRef={clearBrowserDataButtonRef}
                disabled={browserDataClearPending}
                onActivate={requestBrowserDataClear}
              />
            </div>
            <div className="setting-row">
              <div>
                <strong>Download location</strong>
                <span>
                  {model.browserPreferences.downloadLocation ??
                    "System Downloads folder"}
                </span>
              </div>
              <div className="button-row compact">
                {model.browserPreferences.downloadLocation ? (
                  <SettingsIconAction
                    icon={RotateCcw}
                    ariaLabel="Reset download location"
                    tooltip="Reset download location"
                    onActivate={actions.resetBrowserDownloadLocation}
                  />
                ) : null}
                <SettingsIconAction
                  icon={FolderOpen}
                  ariaLabel="Choose download location"
                  tooltip="Choose download location"
                  onActivate={actions.chooseBrowserDownloadLocation}
                />
              </div>
            </div>
            <label className="setting-row checkbox-setting">
              <div>
                <strong>Ask where to save downloads</strong>
                <span>
                  Choose a location each time the in-app browser downloads a
                  file.
                </span>
              </div>
              <SettingsSwitch
                ariaLabel="Ask where to save browser downloads"
                checked={model.browserPreferences.askWhereToSave}
                onChange={actions.setBrowserAskWhereToSave}
              />
            </label>
            <div className="setting-row">
              <div>
                <strong>Import browser profile</strong>
                <span>
                  Import supported profile data into the isolated browser.
                </span>
              </div>
              <div className="button-row compact">
                {!model.browserReadiness.profileImportAvailable && (
                  <SettingsStatusPopover
                    status={{ label: "Unavailable", tone: "negative" }}
                    details={{
                      title: "Profile import unavailable",
                      description:
                        "Profile import is not available on this device.",
                    }}
                  />
                )}
                <SettingsIconAction
                  icon={Download}
                  ariaLabel="Import browser profile"
                  tooltip="Import browser profile"
                  disabled={!model.browserReadiness.profileImportAvailable}
                  onActivate={actions.importBrowserProfile}
                />
              </div>
            </div>
            <div className="setting-row">
              <div>
                <strong>Browser runtime</strong>
                <span>Provides the isolated browser for this account.</span>
              </div>
              <SettingsIconAction
                icon={RefreshCw}
                ariaLabel="Refresh Browser status"
                tooltip="Refresh Browser status"
                disabled={
                  browserReadinessChecking ||
                  !model.browserReadiness.pluginInstalled ||
                  !model.browserReadiness.pluginEnabled
                }
                onActivate={actions.refreshBrowserStatus}
              />
            </div>
          </div>
        </section>
      ) : null}

      {matchesSettings(
        "computer use",
        "any app",
        "desktop apps",
        "accessibility",
        "screen recording",
        "always allowed apps",
        "connected controls",
      ) ? (
        <section
          className="surface settings-panel computer-use-settings-panel"
          aria-label="Computer use settings"
          id="settings-computer-use"
        >
          <SettingsDetailHeader
            icon={Monitor}
            title="Computer use"
            status={computerUseStatus}
            statusContent={
              <SettingsStatusPopover
                status={computerUseStatus}
                details={computerUseStatusDetails(
                  computerUseStatus,
                  computerUsePlugin !== null,
                  pluginIsReady(computerUsePlugin),
                  model.desktopRuntimeStatus,
                  actions,
                )}
              />
            }
          />
          <div className="setting-list">
            <label className="setting-row checkbox-setting">
              <div>
                <strong>Any App</strong>
                <span>
                  Let Codex control applications you approve on this Mac.
                </span>
              </div>
              <SettingsSwitch
                ariaLabel="Allow Computer Use with any approved app"
                checked={model.computerUseEnabled}
                disabled={!computerUseReady}
                onChange={actions.setComputerUseEnabled}
              />
            </label>
            <div className="settings-subsection-heading">
              <div>
                <strong>Connected controls</strong>
                <span>
                  Additional application controls supplied by installed plugins.
                </span>
              </div>
            </div>
            {externalBrowserPlugins.length > 0 ? (
              externalBrowserPlugins.map((plugin) => (
                <SettingsNavigationRow
                  className="computer-use-control-row"
                  key={plugin.id}
                  label={plugin.displayName}
                  description={
                    pluginIsReady(plugin)
                      ? "Connected through its official browser plugin."
                      : "This browser control is not connected."
                  }
                  ariaLabel={`Open Plugins for ${plugin.displayName}`}
                  onActivate={actions.openPlugins}
                />
              ))
            ) : (
              <SettingsNavigationRow
                className="computer-use-empty-row"
                label="No connected controls"
                description="Install an external-browser plugin from Plugins when you need an existing browser profile."
                ariaLabel="Open Plugins for connected controls"
                onActivate={actions.openPlugins}
              />
            )}
            <div className="settings-subsection-heading">
              <div>
                <strong>macOS permissions</strong>
                <span>
                  Access is checked for this running copy of Orchestrator. The
                  Computer Use helper may also request access.
                </span>
              </div>
              <SettingsIconAction
                icon={RefreshCw}
                ariaLabel="Check Computer Use permissions again"
                tooltip="Check again"
                onActivate={actions.refreshComputerUseStatus}
              />
            </div>
            <PermissionRow
              label="Screen Recording"
              description="Allows Computer Use to see approved applications."
              granted={
                model.desktopRuntimeStatus?.screenRecordingTrusted ?? null
              }
              onOpen={actions.openScreenRecordingSettings}
            />
            <PermissionRow
              label="Accessibility"
              description="Allows Computer Use to click, type, and navigate."
              granted={model.desktopRuntimeStatus?.accessibilityTrusted ?? null}
              onOpen={actions.openAccessibilitySettings}
            />
            {model.alwaysAllowedApplications.length > 0 ? (
              <>
                <div className="settings-subsection-heading">
                  <div>
                    <strong>Always-allowed apps</strong>
                    <span>
                      Apps Codex may use in future tasks without asking again.
                    </span>
                  </div>
                </div>
                {model.alwaysAllowedApplications.map((application) => (
                  <div className="setting-row" key={application.id}>
                    <div>
                      <strong>{application.name}</strong>
                      <span>{application.bundleId}</span>
                    </div>
                    <SettingsIconAction
                      icon={Trash2}
                      ariaLabel={`Revoke ${application.name}`}
                      tooltip={`Revoke ${application.name}`}
                      danger
                      onActivate={() =>
                        actions.revokeAlwaysAllowedApplication(application.id)
                      }
                    />
                  </div>
                ))}
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {matchesSettings(
        "notifications",
        "agent alerts",
        "completed responses",
        "approval requests",
        "agent questions",
        "plans ready",
        "external actions",
      ) ? (
        <NotificationSettings model={model} actions={actions} />
      ) : null}

      {matchesSettings("connections", "github", "github cli") ? (
        <section
          className="surface settings-panel github-settings-panel"
          aria-label="GitHub settings"
          id="settings-github"
        >
          <SettingsDetailHeader
            icon={GitPullRequest}
            title="GitHub"
            status={githubStatus.status}
            statusContent={<SettingsStatusPopover {...githubStatus} />}
          />
          <div className="setting-list">
            <div className="setting-row">
              <div>
                <strong>
                  {model.githubConnection?.connected
                    ? (model.githubConnection.displayName ??
                      model.githubConnection.login)
                    : "Bundled GitHub CLI"}
                </strong>
                <span>
                  {model.githubConnection?.cliVersion
                    ? `GitHub CLI ${model.githubConnection.cliVersion}`
                    : "Publish pull requests through the bundled GitHub CLI."}
                  {model.githubConnectionPending &&
                  model.githubConnection?.message
                    ? ` · ${model.githubConnection.message}`
                    : ""}
                </span>
              </div>
              <div className="button-row compact">
                {model.githubConnectionPending ? (
                  <SettingsIconAction
                    icon={LogIn}
                    ariaLabel="View GitHub sign-in"
                    tooltip="View sign-in"
                    onActivate={actions.showGithubLogin}
                  />
                ) : model.githubConnection?.connected ? (
                  <SettingsIconAction
                    icon={LogOut}
                    ariaLabel="Disconnect GitHub"
                    tooltip="Disconnect"
                    danger
                    disabled={model.githubConnectionPending}
                    onActivate={actions.disconnectGithub}
                  />
                ) : (
                  <SettingsIconAction
                    icon={GitPullRequest}
                    ariaLabel={
                      model.githubConnection?.status === "reconnect_required"
                        ? "Reconnect GitHub"
                        : "Connect GitHub"
                    }
                    tooltip={
                      model.githubConnection?.status === "reconnect_required"
                        ? "Reconnect"
                        : "Connect"
                    }
                    disabled={model.githubConnection?.available === false}
                    onActivate={actions.connectGithub}
                  />
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {matchesSettings("connections", "gitlab", "merge requests", "self-managed") ? <GitlabSettingsPanel /> : null}

      {matchesSettings("accounts", "codex", "codex connection") ? (
        <section
          className="surface settings-panel codex-settings-panel"
          aria-label="Codex settings"
          id="settings-accounts"
        >
          <SettingsDetailHeader
            icon={UserRound}
            title="Codex connection"
            status={
              model.codexConnected
                ? { label: "Connected", tone: "positive" }
                : { label: "Disconnected", tone: "neutral" }
            }
            statusContent={
              <SettingsStatusPopover
                status={
                  connectionError
                    ? { label: "Error", tone: "negative" }
                    : model.codexConnected
                      ? { label: "Connected", tone: "positive" }
                      : { label: "Disconnected", tone: "neutral" }
                }
                details={accountStatusDetails(
                  "Codex connection",
                  connectionError,
                )}
              />
            }
          />
          <div className="setting-list">
            <div className="settings-subsection-heading codex-accounts-heading">
              <div>
                <strong>Accounts</strong>
                <span>Choose the account used for new tasks.</span>
              </div>
              <SettingsIconAction
                icon={UserPlus}
                ariaLabel="Add Codex account"
                tooltip="Add account"
                onActivate={actions.addAccount}
                disabled={
                  model.loginState === "starting" ||
                  model.loginState === "waiting"
                }
              />
            </div>
            <div className="account-management">
              {model.accounts.length === 0 ? (
                <p className="muted">No Codex accounts added.</p>
              ) : (
                model.accounts.map((account) => {
                  const accountSigningIn =
                    model.pendingLoginAccountId === account.id &&
                    (model.loginState === "starting" ||
                      model.loginState === "waiting");
                  const accountHasActiveRun = model.activeRunAccountIds.has(
                    account.id,
                  );
                  const accountSelected =
                    account.id === model.selectedAccountId;
                  const accountStateLabel = accountSigningIn
                    ? "Signing in"
                    : account.plan_type
                      ? formatCodexPlanType(account.plan_type)
                      : account.status;
                  const accountSummary =
                    account.email && account.email !== account.label
                      ? `${account.email} · ${accountStateLabel}`
                      : accountStateLabel;
                  const accountError = !accountSigningIn
                    ? ((accountSelected ? model.authError : null) ??
                      account.last_error ??
                      (account.status === "error"
                        ? "Could not sign in to this account. Try again."
                        : null))
                    : null;
                  const accountDetail = accountSigningIn
                    ? `${accountSummary} · ${model.authMessage}`
                    : accountSelected &&
                        !accountError &&
                        (model.loginState !== "idle" || !model.codexConnected)
                      ? model.authMessage
                      : accountSummary;
                  return (
                    <article
                      className="managed-account-row"
                      key={account.id}
                      data-managed-account-id={account.id}
                      tabIndex={-1}
                    >
                      <span className="account-mini-avatar" aria-hidden="true">
                        {(account.email ?? account.label)
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                      <div>
                        <input
                          defaultValue={account.label}
                          spellCheck={true}
                          onBlur={(event) =>
                            actions.renameAccount(
                              account.id,
                              event.currentTarget.value,
                            )
                          }
                          aria-label={`Account label for ${account.label}`}
                        />
                        <span>{accountDetail}</span>
                      </div>
                      <div className="button-row compact">
                        {accountError && (
                          <SettingsStatusPopover
                            status={{ label: "Error", tone: "negative" }}
                            details={accountStatusDetails(
                              account.label,
                              accountError,
                              account.status !== "signed_in" || accountSelected
                                ? {
                                    onActivate: () =>
                                      account.status !== "signed_in"
                                        ? actions.loginAccount(account)
                                        : actions.connectAccount(account.id),
                                    disabled:
                                      account.status !== "signed_in"
                                        ? accountHasActiveRun ||
                                          model.loginState === "starting" ||
                                          model.loginState === "waiting"
                                        : model.runIsActive,
                                  }
                                : undefined,
                            )}
                          />
                        )}
                        {accountSelected ? (
                          <SettingsStatusBadge
                            label="Selected"
                            tone="positive"
                          />
                        ) : (
                          <SettingsIconAction
                            icon={Check}
                            ariaLabel={`Select ${account.label}`}
                            tooltip="Select account"
                            onActivate={() => actions.selectAccount(account.id)}
                            disabled={model.runIsActive}
                          />
                        )}
                        {accountSigningIn && model.pendingLoginId ? (
                          <SettingsIconAction
                            icon={X}
                            ariaLabel={`Cancel sign-in for ${account.label}`}
                            tooltip="Cancel sign-in"
                            onActivate={actions.cancelLogin}
                          />
                        ) : account.status !== "signed_in" ? (
                          <button
                            className="secondary small"
                            type="button"
                            onClick={() => actions.loginAccount(account)}
                            disabled={
                              accountHasActiveRun ||
                              model.loginState === "starting" ||
                              model.loginState === "waiting"
                            }
                          >
                            <LogIn size={14} />
                            {account.status === "error" ? "Retry" : "Sign in"}
                          </button>
                        ) : null}
                        {accountSelected ? (
                          <SettingsIconAction
                            icon={Plug}
                            ariaLabel={`Connect ${account.label}`}
                            tooltip="Connect"
                            onActivate={() =>
                              actions.connectAccount(account.id)
                            }
                            disabled={model.runIsActive}
                          />
                        ) : null}
                        {accountSelected && model.showLogout ? (
                          <SettingsIconAction
                            icon={LogOut}
                            ariaLabel={`Log out of ${account.label}`}
                            tooltip="Log out"
                            danger
                            onActivate={actions.logout}
                            disabled={accountHasActiveRun}
                          />
                        ) : null}
                        <SettingsIconAction
                          icon={Trash2}
                          ariaLabel={`Remove ${account.label}`}
                          tooltip={`Remove ${account.label}`}
                          danger
                          onActivate={() => actions.removeAccount(account.id)}
                          disabled={accountHasActiveRun || accountSigningIn}
                        />
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </section>
      ) : null}

      {matchesSettings("about", "orchestrator", "app version", appVersion.toLowerCase()) ? (
        <section
          className="surface settings-panel"
          aria-label="About Orchestrator"
          id="settings-about"
        >
          <SettingsDetailHeader icon={Info} title="About Orchestrator" />
          <div className="setting-list">
            <div className="setting-row">
              <div>
                <strong>App version</strong>
                <span>{appVersion}</span>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {browserDataConfirmationOpen ? (
        <BrowserDataClearDialog
          busy={browserDataClearPending}
          onCancel={cancelBrowserDataClear}
          onConfirm={() => void confirmBrowserDataClear()}
        />
      ) : null}
    </SettingsStatusProvider>
  );
});

function BrowserDataClearDialog({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel]);

  useEffect(() => {
    cancelButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        className="confirmation-dialog browser-data-clear-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
        tabIndex={-1}
        onKeyDown={trapDialogFocus}
      >
        <div>
          <h2 id={titleId}>Clear browser data?</h2>
          <p id={descriptionId}>
            This signs you out of websites in the isolated in-app browser and
            removes cookies, site data, cache, and task tabs. Downloaded files
            and data in your regular browsers are not affected.
          </p>
        </div>
        <div className="confirmation-actions">
          <button
            className="native-plan-icon-action"
            ref={cancelButtonRef}
            type="button"
            aria-label="Keep browser data"
            data-tooltip="Keep browser data"
            disabled={busy}
            onClick={onCancel}
          >
            <X size={15} aria-hidden="true" />
          </button>
          <button
            className="native-plan-icon-action cancel"
            type="button"
            aria-label={busy ? "Clearing browser data" : "Clear browser data"}
            data-tooltip={busy ? "Clearing browser data" : "Clear browser data"}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? (
              <Loader2 className="spin" size={15} aria-hidden="true" />
            ) : (
              <Trash2 size={15} aria-hidden="true" />
            )}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function SettingsOverview({
  model,
  actions,
  searchQuery,
  onSearchQueryChange,
}: {
  model: SettingsViewModel;
  actions: SettingsViewActions;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}) {
  const query = searchQuery.trim().toLowerCase();
  const queryMatches = (...terms: string[]) =>
    query.length === 0 || terms.some((term) => term.includes(query));
  const selectedAccount =
    model.accounts.find((account) => account.id === model.selectedAccountId) ??
    null;
  const computerUsePlugin = findPlugin(
    model.pluginCatalog,
    "computer-use@openai-bundled",
    "computer-use",
  );
  const computerUseStatus = computerUseDetailStatus(
    pluginIsReady(computerUsePlugin),
    model.pluginsLoading,
    model.desktopRuntimeStatus,
  );
  const browserReadinessChecking =
    model.pluginsLoading || model.browserReadiness.checking;
  const showConnections = queryMatches(
    "connections",
    "codex",
    "accounts",
    "github",
    "gitlab",
  );

  return (
    <div className="settings-overview">
      <header
        className="settings-page-header"
        data-tauri-drag-region={model.dragRegion}
      >
        <h1 data-tauri-drag-region="false">Settings</h1>
        <label className="settings-search" data-tauri-drag-region="false">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search settings</span>
          <input
            type="search"
            value={searchQuery}
            placeholder="Search settings"
            aria-label="Search settings"
            spellCheck={false}
            onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
          />
        </label>
      </header>

      {query.length === 0 ? (
        <section
          className="settings-status-grid"
          aria-label="Connection status"
        >
          <SettingsStatusCard
            icon="codex"
            label="Codex"
            value={
              model.codexConnected ? "Account connected" : "Sign-in required"
            }
            healthy={model.codexConnected}
            targetId="settings-accounts"
          />
          <SettingsStatusCard
            icon={GitPullRequest}
            label="GitHub"
            value={
              model.githubConnectionPending
                ? "Connecting"
                : model.githubConnection?.connected
                  ? "CLI connected"
                  : model.githubConnection?.available === false
                    ? "CLI unavailable"
                    : "Not connected"
            }
            healthy={model.githubConnection?.connected === true}
            targetId="settings-github"
          />
          <SettingsStatusCard
            icon={Monitor}
            label="Browser"
            value={
              browserReadinessChecking
                ? "Checking"
                : model.browserReadiness.available
                  ? "Ready"
                  : model.browserReadiness.checkFailed
                    ? "Not checked"
                    : "Not available"
            }
            tone={
              browserReadinessChecking
                ? "pending"
                : model.browserReadiness.available
                  ? "positive"
                  : model.browserReadiness.checkFailed
                    ? "neutral"
                    : "negative"
            }
            targetId="settings-browser"
          />
          <SettingsStatusCard
            icon={Monitor}
            label="Computer use"
            value={
              computerUseStatus.label === "Available"
                ? "Ready"
                : computerUseStatus.label === "Review access"
                  ? "Review permissions"
                  : computerUseStatus.label === "Checking"
                    ? "Checking"
                    : "Not available"
            }
            tone={computerUseStatus.tone}
            targetId="settings-computer-use"
          />
          <SettingsStatusCard
            icon={Bell}
            label="Notifications"
            value={notificationOverviewLabel(model.notificationPermission)}
            healthy={model.notificationPermission === "allowed"}
            targetId="settings-notifications"
          />
          <SettingsStatusCard
            icon={Puzzle}
            label="Plugins"
            value={`${model.pluginCatalog.plugins.filter((plugin) => plugin.installed).length} installed`}
            healthy={model.pluginCatalog.errors.length === 0}
            onActivate={actions.openPlugins}
          />
        </section>
      ) : (
        <p className="settings-search-summary" role="status">
          Showing settings matching <strong>{searchQuery.trim()}</strong>
        </p>
      )}

      {showConnections ? (
        <div className="settings-overview-grid">
          <section
            className="surface settings-overview-panel"
            aria-label="Connections overview"
          >
            <SettingsOverviewHeader icon={Plug} title="Connections" />
            <div className="settings-overview-rows">
              <button
                className="settings-overview-row settings-connection-row"
                type="button"
                onClick={() => scrollToSettingsSection("settings-accounts")}
              >
                <span className="account-mini-avatar" aria-hidden="true">
                  {(selectedAccount?.email ?? selectedAccount?.label ?? "C")
                    .charAt(0)
                    .toUpperCase()}
                </span>
                <div>
                  <strong>Codex account</strong>
                  <span>
                    {selectedAccount?.email ??
                      selectedAccount?.label ??
                      "No account selected"}
                  </span>
                </div>
                <span className="settings-connection-value">
                  {selectedAccount?.plan_type
                    ? formatCodexPlanType(selectedAccount.plan_type)
                    : model.codexConnected
                      ? "Connected"
                      : "Not connected"}
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              <button
                className="settings-overview-row settings-connection-row"
                type="button"
                onClick={() => scrollToSettingsSection("settings-github")}
              >
                <span className="settings-row-icon" aria-hidden="true">
                  <GitPullRequest size={18} />
                </span>
                <div>
                  <strong>GitHub</strong>
                  <span>
                    {model.githubConnection?.connected
                      ? `@${model.githubConnection.login}`
                      : "Not connected"}
                  </span>
                </div>
                <span className="settings-connection-value">
                  {model.githubConnection?.connected ? "Connected" : "Off"}
                </span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              <button type="button" className="settings-overview-row settings-connection-row" onClick={() => scrollToSettingsSection("settings-gitlab")}>
                <span className="settings-row-icon" aria-hidden="true"><GitPullRequest size={18} /></span>
                <div><strong>GitLab</strong><span>GitLab.com and self-managed hosts</span></div>
                <GitlabConnectionSummary />
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SettingsStatusCard({
  icon,
  label,
  value,
  healthy,
  tone,
  targetId,
  onActivate,
}: {
  icon: typeof Monitor | "codex";
  label: string;
  value: string;
  healthy?: boolean;
  tone?: SettingsDetailStatus["tone"];
  targetId?: string;
  onActivate?: () => void;
}) {
  const StatusIcon = icon === "codex" ? null : icon;
  return (
    <button
      className="settings-status-card"
      type="button"
      onClick={() => {
        if (onActivate) onActivate();
        else if (targetId) scrollToSettingsSection(targetId);
      }}
    >
      <span className="settings-status-card-icon" aria-hidden="true">
        {StatusIcon ? (
          <StatusIcon size={22} />
        ) : (
          <OrchestratorMark className="settings-status-brand-mark" />
        )}
      </span>
      <span>
        <strong>{label}</strong>
        <small className={tone ?? (healthy ? "healthy" : "attention")}>
          <span aria-hidden="true" />
          {value}
        </small>
      </span>
      <ChevronRight size={16} aria-hidden="true" />
    </button>
  );
}

function SettingsOverviewHeader({
  icon: Icon,
  title,
}: {
  icon: typeof Monitor;
  title: string;
}) {
  return (
    <div className="surface-header settings-detail-header settings-overview-panel-header">
      <div className="settings-detail-heading">
        <span className="settings-detail-header-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div className="settings-detail-header-copy">
          <h2>{title}</h2>
        </div>
      </div>
    </div>
  );
}

function PermissionRow({
  label,
  description,
  granted,
  onOpen,
}: {
  label: string;
  description: string;
  granted: boolean | null;
  onOpen: () => void;
}) {
  if (granted === null) {
    return (
      <SettingsNavigationRow
        className="computer-use-permission-row"
        label={label}
        description={`${description} Verified by the official Computer Use helper when it starts.`}
        ariaLabel={`Open ${label} settings`}
        external
        onActivate={onOpen}
      />
    );
  }

  if (!granted) {
    return (
      <SettingsNavigationRow
        className="computer-use-permission-row"
        label={label}
        description={description}
        ariaLabel={`Open ${label} settings`}
        external
        onActivate={onOpen}
      />
    );
  }

  return (
    <div className="setting-row computer-use-permission-row">
      <div>
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <SettingsStatusBadge label="Allowed" tone="positive" />
    </div>
  );
}

function SettingsNavigationRow({
  label,
  description,
  ariaLabel,
  className,
  external = false,
  onActivate,
}: {
  label: string;
  description: string;
  ariaLabel?: string;
  className?: string;
  external?: boolean;
  onActivate: () => void;
}) {
  const EndIcon = external ? ExternalLink : ChevronRight;
  return (
    <button
      className={`setting-row settings-navigation-row${className ? ` ${className}` : ""}`}
      type="button"
      aria-label={ariaLabel}
      onClick={onActivate}
    >
      <div>
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <EndIcon
        className="settings-navigation-row-indicator"
        size={16}
        aria-hidden="true"
      />
    </button>
  );
}

function SettingsIconAction({
  icon: Icon,
  ariaLabel,
  tooltip,
  buttonRef,
  danger = false,
  disabled = false,
  onActivate,
}: {
  icon: typeof Monitor;
  ariaLabel: string;
  tooltip: string;
  buttonRef?: Ref<HTMLButtonElement>;
  danger?: boolean;
  disabled?: boolean;
  onActivate: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      className={`settings-icon-action${danger ? " danger" : ""}`}
      type="button"
      aria-label={ariaLabel}
      data-tooltip={tooltip}
      disabled={disabled}
      onClick={onActivate}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

function SettingsSwitch({
  ariaLabel,
  checked,
  disabled = false,
  onChange,
}: {
  ariaLabel: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span className="settings-switch">
      <input
        type="checkbox"
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span aria-hidden="true" />
    </span>
  );
}

function scrollToSettingsSection(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function SettingsDetailHeader({
  icon: Icon,
  title,
  status,
  statusContent,
}: {
  icon: typeof Monitor;
  title: string;
  status?: SettingsDetailStatus;
  statusContent?: ReactNode;
}) {
  return (
    <div className="surface-header settings-detail-header">
      <div className="settings-detail-heading">
        <span className="settings-detail-header-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div className="settings-detail-header-copy">
          <h2>{title}</h2>
        </div>
      </div>
      {statusContent ?? (status ? <SettingsStatusBadge {...status} /> : null)}
    </div>
  );
}

function NotificationSettings({
  model,
  actions,
}: {
  model: SettingsViewModel;
  actions: SettingsViewActions;
}) {
  return (
    <section
      className="surface settings-panel notification-settings-panel"
      aria-label="Notification settings"
      id="settings-notifications"
    >
      <SettingsDetailHeader
        icon={Bell}
        title="Agent alerts"
        status={notificationSettingsStatus(model.notificationPermission)}
        statusContent={
          <SettingsStatusPopover
            status={notificationSettingsStatus(model.notificationPermission)}
            details={notificationStatusDetails(
              model.notificationPermission,
              actions.openNotificationSettings,
            )}
          />
        }
      />
      <div className="setting-list">
        <NotificationToggle
          label="Completed responses"
          description="Notify when a response finishes while Orchestrator is not focused."
          checked={model.notificationPreferences.responseCompleted}
          onChange={(enabled) =>
            actions.setNotificationPreference("responseCompleted", enabled)
          }
        />
        <NotificationToggle
          label="Approval requests"
          description="Notify when Codex needs permission to continue."
          checked={model.notificationPreferences.approvalRequired}
          onChange={(enabled) =>
            actions.setNotificationPreference("approvalRequired", enabled)
          }
        />
        <NotificationToggle
          label="Agent questions"
          description="Notify when Codex needs your answer to continue."
          checked={model.notificationPreferences.userInputRequired}
          onChange={(enabled) =>
            actions.setNotificationPreference("userInputRequired", enabled)
          }
        />
        <NotificationToggle
          label="Plans ready"
          description="Notify when a plan is ready to implement or revise."
          checked={model.notificationPreferences.planReady}
          onChange={(enabled) =>
            actions.setNotificationPreference("planReady", enabled)
          }
        />
        <NotificationToggle
          label="External actions"
          description="Notify when browser sign-in or another external step is required."
          checked={model.notificationPreferences.externalAction}
          onChange={(enabled) =>
            actions.setNotificationPreference("externalAction", enabled)
          }
        />
        {model.notificationPermission !== "allowed" ? (
          model.notificationPermission === "denied" ? (
            <SettingsNavigationRow
              label="macOS notification settings"
              description="Review notification permission in System Settings."
              ariaLabel="Open macOS notification settings"
              external
              onActivate={actions.openNotificationSettings}
            />
          ) : (
            <div className="setting-row notification-permission-row">
              <div>
                <strong>System notifications</strong>
                <span>
                  Allow Orchestrator to deliver the selected agent alerts.
                </span>
              </div>
              <SettingsIconAction
                icon={Bell}
                ariaLabel="Enable notifications"
                tooltip="Enable notifications"
                disabled={model.notificationPermission === "unavailable"}
                onActivate={actions.enableNotifications}
              />
            </div>
          )
        ) : null}
      </div>
    </section>
  );
}

function NotificationToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="setting-row checkbox-setting">
      <div>
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <SettingsSwitch ariaLabel={label} checked={checked} onChange={onChange} />
    </label>
  );
}

function notificationOverviewLabel(
  permission: AgentNotificationPermissionStatus,
) {
  switch (permission) {
    case "allowed":
      return "Alerts allowed";
    case "not-enabled":
      return "Alerts off";
    case "denied":
      return "Permission denied";
    case "unavailable":
      return "Not available";
  }
}

function notificationSettingsStatus(
  permission: AgentNotificationPermissionStatus,
): SettingsDetailStatus {
  switch (permission) {
    case "allowed":
      return { label: "Allowed", tone: "positive" };
    case "not-enabled":
      return { label: "Not enabled", tone: "neutral" };
    case "denied":
      return { label: "Denied", tone: "negative" };
    case "unavailable":
      return { label: "Unavailable", tone: "negative" };
  }
}
