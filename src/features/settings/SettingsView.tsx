import {
  Bell,
  CircleHelp,
  ChevronRight,
  Download,
  GitPullRequest,
  FolderOpen,
  LogIn,
  LogOut,
  Monitor,
  Plug,
  Puzzle,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  UserRound,
  UserPlus,
} from "lucide-react";
import { memo, useState } from "react";
import { ComposerSelect } from "../../components/ComposerSelect";
import { OrchestratorMark } from "../../components/OrchestratorMark";
import type {
  AgentNotificationPermissionStatus,
  AgentNotificationPreferences,
} from "../../lib/agentNotifications";
import { formatCodexPlanType } from "../../lib/codexAuth";
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
import type { CodexLoginState, OssProvider } from "../codex/types";
import type { CodexAccountProfile } from "../accounts/types";
import type { GithubConnectionStatus } from "../github/api";

const NOTIFICATION_PREFERENCE_KEYS: Array<keyof AgentNotificationPreferences> =
  [
    "responseCompleted",
    "approvalRequired",
    "userInputRequired",
    "planReady",
    "externalAction",
  ];

type SettingsStatusTone = "positive" | "negative" | "neutral" | "pending";

type SettingsDetailStatus = {
  label: string;
  tone: SettingsStatusTone;
};

export type SettingsViewModel = {
  dragRegion?: string;
  computerUseEnabled: boolean;
  browserPreferences: BrowserPreferences;
  browserReadiness: BrowserReadiness;
  desktopRuntimeStatus: DesktopRuntimeStatus | null;
  pluginCatalog: CodexPluginCatalog;
  pluginsLoading: boolean;
  alwaysAllowedApplications: AlwaysAllowedApplication[];
  legacyBrowserMigrationNotice: boolean;
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
  showLogout: boolean;
  useOss: boolean;
  ossProvider: OssProvider;
};

export type SettingsViewActions = {
  setComputerUseEnabled: (enabled: boolean) => void;
  setBrowserAskWhereToSave: (enabled: boolean) => void;
  chooseBrowserDownloadLocation: () => void;
  resetBrowserDownloadLocation: () => void;
  clearBrowserData: () => void;
  importBrowserProfile: () => void;
  openPlugins: () => void;
  refreshComputerUseStatus: () => void;
  openAccessibilitySettings: () => void;
  openScreenRecordingSettings: () => void;
  revokeAlwaysAllowedApplication: (applicationId: string) => void;
  dismissLegacyBrowserMigrationNotice: () => void;
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
  setUseOss: (enabled: boolean) => void;
  setOssProvider: (provider: OssProvider) => void;
};

export const SettingsView = memo(function SettingsView({
  model,
  actions,
}: {
  model: SettingsViewModel;
  actions: SettingsViewActions;
}) {
  const [searchQuery, setSearchQuery] = useState("");
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
    model.desktopRuntimeStatus?.available === true &&
    model.desktopRuntimeStatus?.serviceCompatible === true;
  const externalBrowserPlugins = ["chrome", "edge", "brave", "opera", "vivaldi"]
    .map((name) => findPlugin(model.pluginCatalog, name))
    .filter((plugin) => plugin !== null);

  return (
    <>
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
            status={
              model.pluginsLoading
                ? { label: "Checking", tone: "pending" }
                : model.browserReadiness.available
                  ? { label: "Available", tone: "positive" }
                  : { label: "Unavailable", tone: "negative" }
            }
          />
          <div className="setting-list">
            <div className="setting-row">
              <div>
                <strong>In-app browser</strong>
                <span>
                  Uses a persistent profile that is isolated from your regular browser.
                </span>
              </div>
              {!model.browserReadiness.available ? (
                <button className="secondary" type="button" onClick={actions.openPlugins}>
                  <Puzzle size={16} aria-hidden="true" />
                  Open Plugins
                </button>
              ) : (
                <SettingsStatusBadge label="Ready" tone="positive" />
              )}
            </div>
            <div className="setting-row">
              <div>
                <strong>Browser data</strong>
                <span>Clear cookies, site data, cache, and task tabs from the isolated profile.</span>
              </div>
              <button className="secondary" type="button" onClick={actions.clearBrowserData}>
                <Trash2 size={16} aria-hidden="true" />
                Clear data
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>Download location</strong>
                <span>{model.browserPreferences.downloadLocation ?? "System Downloads folder"}</span>
              </div>
              <div className="button-row compact">
                {model.browserPreferences.downloadLocation ? (
                  <button className="secondary small" type="button" onClick={actions.resetBrowserDownloadLocation}>
                    Reset
                  </button>
                ) : null}
                <button className="secondary" type="button" onClick={actions.chooseBrowserDownloadLocation}>
                  <FolderOpen size={16} aria-hidden="true" />
                  Choose
                </button>
              </div>
            </div>
            <label className="setting-row checkbox-setting">
              <div>
                <strong>Ask where to save downloads</strong>
                <span>Choose a location each time the in-app browser downloads a file.</span>
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
                  {model.browserReadiness.profileImportAvailable
                    ? "Import supported profile data into the isolated browser."
                    : "Profile import is not available on this device."}
                </span>
              </div>
              <button
                className="secondary"
                type="button"
                disabled={!model.browserReadiness.profileImportAvailable}
                onClick={actions.importBrowserProfile}
              >
                <Download size={16} aria-hidden="true" />
                Import
              </button>
            </div>
          </div>
          {!model.browserReadiness.available ? (
            <p className="computer-use-runtime-error" role="alert">
              {model.browserReadiness.message}
            </p>
          ) : null}
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
            status={
              model.pluginsLoading || model.desktopRuntimeStatus === null
                ? { label: "Checking", tone: "pending" }
                : computerUseReady
                  ? { label: "Available", tone: "positive" }
                  : { label: "Unavailable", tone: "negative" }
            }
          />
          <div className="setting-list">
            <label className="setting-row checkbox-setting">
              <div>
                <strong>Any App</strong>
                <span>Let Codex control applications you approve on this Mac.</span>
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
                <span>Additional application controls supplied by installed plugins.</span>
              </div>
            </div>
            {externalBrowserPlugins.length > 0 ? (
              externalBrowserPlugins.map((plugin) => (
                <div className="setting-row computer-use-control-row" key={plugin.id}>
                  <div>
                    <strong>{plugin.displayName}</strong>
                    <span>
                      {pluginIsReady(plugin)
                        ? "Connected through its official browser plugin."
                        : "This browser control is not connected."}
                    </span>
                  </div>
                  <button className="secondary" type="button" onClick={actions.openPlugins}>
                    {pluginIsReady(plugin) ? "Manage" : "Open Plugins"}
                  </button>
                </div>
              ))
            ) : (
              <div className="setting-row computer-use-empty-row">
                <div>
                  <strong>No connected controls</strong>
                  <span>Install an external-browser plugin from Plugins when you need an existing browser profile.</span>
                </div>
                <button className="secondary" type="button" onClick={actions.openPlugins}>
                  <Puzzle size={16} aria-hidden="true" />
                  Open Plugins
                </button>
              </div>
            )}
            <div className="settings-subsection-heading">
              <div>
                <strong>macOS permissions</strong>
                <span>Both permissions are required to see and operate desktop apps.</span>
              </div>
              <button
                className="native-plan-icon-action"
                type="button"
                aria-label="Check Computer Use permissions again"
                data-tooltip="Check again"
                onClick={actions.refreshComputerUseStatus}
              >
                <RefreshCw size={16} aria-hidden="true" />
              </button>
            </div>
            <PermissionRow
              label="Screen Recording"
              description="Allows Computer Use to see approved applications."
              granted={model.desktopRuntimeStatus?.screenRecordingTrusted === true}
              onOpen={actions.openScreenRecordingSettings}
            />
            <PermissionRow
              label="Accessibility"
              description="Allows Computer Use to click, type, and navigate."
              granted={model.desktopRuntimeStatus?.accessibilityTrusted === true}
              onOpen={actions.openAccessibilitySettings}
            />
            <div className="settings-subsection-heading">
              <div>
                <strong>Always-allowed apps</strong>
                <span>Apps Codex may use in future tasks without asking again.</span>
              </div>
            </div>
            {model.alwaysAllowedApplications.length > 0 ? (
              model.alwaysAllowedApplications.map((application) => (
                <div className="setting-row" key={application.id}>
                  <div>
                    <strong>{application.name}</strong>
                    <span>{application.bundleId}</span>
                  </div>
                  <button
                    className="secondary danger"
                    type="button"
                    onClick={() => actions.revokeAlwaysAllowedApplication(application.id)}
                  >
                    Revoke
                  </button>
                </div>
              ))
            ) : (
              <div className="settings-empty-state">
                <CircleHelp size={20} aria-hidden="true" />
                <div>
                  <strong>No always-allowed apps</strong>
                  <span>Apps appear here after you choose Always allow during a task.</span>
                </div>
              </div>
            )}
          </div>
          {!computerUseReady ? (
            <p className="computer-use-runtime-error" role="alert">
              {computerUsePlugin
                ? model.desktopRuntimeStatus?.message ??
                  "Enable the Computer Use plugin and grant the required macOS permissions."
                : "Computer Use is unavailable. Open Plugins to install the official Computer Use plugin."}
              <button className="link-button" type="button" onClick={actions.openPlugins}>
                Open Plugins
              </button>
            </p>
          ) : null}
          {model.legacyBrowserMigrationNotice ? (
            <div className="settings-migration-notice" role="status">
              <p>
                Orchestrator no longer uses its Browser Bridge. Remove the obsolete
                Orchestrator browser extension from your browser when convenient.
              </p>
              <button className="secondary small" type="button" onClick={actions.dismissLegacyBrowserMigrationNotice}>
                Dismiss
              </button>
            </div>
          ) : null}
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
            status={
              model.githubConnectionPending
                ? { label: "Connecting", tone: "pending" }
                : model.githubConnection?.connected
                  ? { label: "Connected", tone: "positive" }
                  : model.githubConnection?.available === false
                    ? { label: "Unavailable", tone: "negative" }
                    : { label: "Disconnected", tone: "neutral" }
            }
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
                    : "GitHub CLI runtime not detected"}
                  {model.githubConnection?.message
                    ? ` · ${model.githubConnection.message}`
                    : ""}
                </span>
              </div>
              <div className="button-row compact">
                {model.githubConnectionPending ? (
                  <button
                    className="secondary"
                    type="button"
                    onClick={actions.showGithubLogin}
                  >
                    <LogIn size={16} aria-hidden="true" />
                    View sign-in
                  </button>
                ) : model.githubConnection?.connected ? (
                  <button
                    className="secondary"
                    type="button"
                    onClick={actions.disconnectGithub}
                    disabled={model.githubConnectionPending}
                  >
                    <LogOut size={16} aria-hidden="true" />
                    Disconnect
                  </button>
                ) : (
                  <button
                    className="secondary"
                    type="button"
                    onClick={actions.connectGithub}
                    disabled={model.githubConnection?.available === false}
                  >
                    <GitPullRequest size={16} aria-hidden="true" />
                    {model.githubConnection?.status === "reconnect_required"
                      ? "Reconnect"
                      : "Connect"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {matchesSettings(
        "accounts",
        "codex",
        "codex connection",
        "local models",
        "oss provider",
        "ollama",
        "lm studio",
      ) ? (
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
          />
          <div className="setting-list">
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
                          onBlur={(event) =>
                            actions.renameAccount(
                              account.id,
                              event.currentTarget.value,
                            )
                          }
                          aria-label={`Account label for ${account.label}`}
                        />
                        <span>
                          {account.email ?? "Not signed in"} ·{" "}
                          {accountSigningIn
                            ? "Signing in"
                            : account.plan_type
                              ? formatCodexPlanType(account.plan_type)
                              : account.status}
                        </span>
                      </div>
                      <div className="button-row compact">
                        {account.id !== model.selectedAccountId ? (
                          <button
                            className="secondary small"
                            type="button"
                            onClick={() => actions.selectAccount(account.id)}
                            disabled={model.runIsActive}
                          >
                            Select
                          </button>
                        ) : null}
                        {accountSigningIn && model.pendingLoginId ? (
                          <button
                            className="secondary small"
                            type="button"
                            onClick={actions.cancelLogin}
                          >
                            Cancel sign-in
                          </button>
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
                        <button
                          className="danger icon-button"
                          type="button"
                          onClick={() => actions.removeAccount(account.id)}
                          disabled={accountHasActiveRun || accountSigningIn}
                          title={`Remove ${account.label}`}
                          aria-label={`Remove ${account.label}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
              <button
                className="secondary"
                type="button"
                onClick={actions.addAccount}
                disabled={
                  model.loginState === "starting" ||
                  model.loginState === "waiting"
                }
              >
                <UserPlus size={16} />
                Add Codex account
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>Selected account</strong>
                <span>{model.authMessage}</span>
              </div>
              <div className="button-row compact">
                <button
                  className="secondary"
                  type="button"
                  onClick={() =>
                    model.selectedAccountId !== null &&
                    actions.connectAccount(model.selectedAccountId)
                  }
                  disabled={
                    model.selectedAccountId === null || model.runIsActive
                  }
                >
                  <Plug size={16} />
                  Connect
                </button>
                {model.showLogout ? (
                  <button
                    className="secondary"
                    type="button"
                    onClick={actions.logout}
                    disabled={
                      model.selectedAccountId !== null &&
                      model.activeRunAccountIds.has(model.selectedAccountId)
                    }
                  >
                    <LogOut size={16} />
                    Log out
                  </button>
                ) : null}
              </div>
            </div>
            <label className="setting-row checkbox-setting">
              <div>
                <strong>Use local OSS provider</strong>
                <span>
                  Pass Codex config overrides for OSS mode when launching runs.
                </span>
              </div>
              <SettingsSwitch
                ariaLabel="Use local OSS provider"
                checked={model.useOss}
                onChange={actions.setUseOss}
              />
            </label>
            <div className="setting-row">
              <div>
                <strong>OSS provider</strong>
                <span>Used only when local OSS mode is enabled.</span>
              </div>
              <ComposerSelect
                ariaLabel="Settings OSS provider"
                value={model.ossProvider}
                options={[
                  { value: "ollama", label: "Ollama" },
                  { value: "lmstudio", label: "LM Studio" },
                ]}
                placeholder="Select provider"
                icon={<Plug size={16} />}
                className="settings-provider-select"
                disabled={!model.useOss}
                onChange={(value) =>
                  actions.setOssProvider(value as OssProvider)
                }
              />
            </div>
          </div>
        </section>
      ) : null}

    </>
  );
});

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
  const agentAlertsEnabled = NOTIFICATION_PREFERENCE_KEYS.some(
    (key) => model.notificationPreferences[key],
  );
  const computerUsePlugin = findPlugin(
    model.pluginCatalog,
    "computer-use@openai-bundled",
    "computer-use",
  );
  const computerUseReady =
    pluginIsReady(computerUsePlugin) &&
    model.desktopRuntimeStatus?.available === true &&
    model.desktopRuntimeStatus?.serviceCompatible === true;
  const showQuickPreferences = queryMatches(
    "quick preferences",
    "notifications",
    "agent alerts",
  );
  const showConnections = queryMatches(
    "connections",
    "codex",
    "accounts",
    "github",
    "oss provider",
    "ollama",
    "lm studio",
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
            value={model.browserReadiness.available ? "Ready" : "Not available"}
            healthy={model.browserReadiness.available}
            targetId="settings-browser"
          />
          <SettingsStatusCard
            icon={Monitor}
            label="Computer use"
            value={computerUseReady ? "Ready" : "Not available"}
            healthy={computerUseReady}
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

      {showQuickPreferences || showConnections ? (
        <div
          className={`settings-overview-grid ${
            showQuickPreferences !== showConnections ? "single-column" : ""
          }`}
        >
          {showQuickPreferences ? (
            <section
              className="surface settings-overview-panel"
              aria-label="Quick preferences"
            >
              <SettingsOverviewHeader
                icon={Settings}
                title="Quick preferences"
              />
              <div className="settings-overview-rows">
                <label className="settings-overview-row">
                  <span className="settings-row-icon" aria-hidden="true">
                    <Bell size={18} />
                  </span>
                  <span className="settings-overview-row-copy">
                    <strong>Agent alerts</strong>
                    <span>
                      Turn all configured agent notifications on or off.
                    </span>
                  </span>
                  <SettingsSwitch
                    ariaLabel="Agent alerts"
                    checked={agentAlertsEnabled}
                    onChange={(enabled) => {
                      NOTIFICATION_PREFERENCE_KEYS.forEach((key) =>
                        actions.setNotificationPreference(key, enabled),
                      );
                    }}
                  />
                </label>
              </div>
            </section>
          ) : null}

          {showConnections ? (
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
                </button>
              </div>
            </section>
          ) : null}
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
  targetId,
  onActivate,
}: {
  icon: typeof Monitor | "codex";
  label: string;
  value: string;
  healthy: boolean;
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
        <small className={healthy ? "healthy" : "attention"}>
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
  granted: boolean;
  onOpen: () => void;
}) {
  return (
    <div className="setting-row computer-use-permission-row">
      <div>
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      {granted ? (
        <SettingsStatusBadge label="Allowed" tone="positive" />
      ) : (
        <button className="secondary" type="button" onClick={onOpen}>
          Open settings
        </button>
      )}
    </div>
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
}: {
  icon: typeof Monitor;
  title: string;
  status: SettingsDetailStatus;
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
      <SettingsStatusBadge {...status} />
    </div>
  );
}

function SettingsStatusBadge({ label, tone }: SettingsDetailStatus) {
  return (
    <span
      className={`settings-status-badge ${tone}`}
      role="status"
      aria-label={label}
    >
      <span className="settings-status-badge-dot" aria-hidden="true" />
      {label}
    </span>
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
      </div>
      {model.notificationPermission !== "allowed" ? (
        <div className="notification-settings-actions">
          {model.notificationPermission === "denied" ? (
            <button
              className="secondary"
              type="button"
              onClick={actions.openNotificationSettings}
            >
              <Settings size={16} aria-hidden="true" />
              Open macOS settings
            </button>
          ) : (
            <button
              className="secondary"
              type="button"
              onClick={actions.enableNotifications}
              disabled={model.notificationPermission === "unavailable"}
            >
              <Bell size={16} aria-hidden="true" />
              Enable notifications
            </button>
          )}
        </div>
      ) : null}
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
