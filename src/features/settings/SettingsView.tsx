import {
  Bell,
  CircleHelp,
  ChevronRight,
  Download,
  ExternalLink,
  GitPullRequest,
  FolderOpen,
  LogIn,
  LogOut,
  Monitor,
  Plug,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
  UserPlus,
} from "lucide-react";
import { memo, useState } from "react";
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
import type { CodexLoginState } from "../codex/types";
import type { CodexAccountProfile } from "../accounts/types";
import type { GithubConnectionStatus } from "../github/api";

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
            {!model.browserReadiness.available ? (
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
                    Uses a persistent profile that is isolated from your regular browser.
                  </span>
                </div>
                <SettingsStatusBadge label="Ready" tone="positive" />
              </div>
            )}
            <div className="setting-row">
              <div>
                <strong>Browser data</strong>
                <span>Clear cookies, site data, cache, and task tabs from the isolated profile.</span>
              </div>
              <SettingsIconAction
                icon={Trash2}
                ariaLabel="Clear data"
                tooltip="Clear browser data"
                danger
                onActivate={actions.clearBrowserData}
              />
            </div>
            <div className="setting-row">
              <div>
                <strong>Download location</strong>
                <span>{model.browserPreferences.downloadLocation ?? "System Downloads folder"}</span>
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
              <SettingsIconAction
                icon={Download}
                ariaLabel="Import browser profile"
                tooltip="Import browser profile"
                disabled={!model.browserReadiness.profileImportAvailable}
                onActivate={actions.importBrowserProfile}
              />
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
                <span>Both permissions are required to see and operate desktop apps.</span>
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
              <SettingsIconAction
                icon={Trash2}
                ariaLabel="Dismiss browser migration notice"
                tooltip="Dismiss"
                onActivate={actions.dismissLegacyBrowserMigrationNotice}
              />
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

      {matchesSettings(
        "accounts",
        "codex",
        "codex connection",
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
                <SettingsIconAction
                  icon={Plug}
                  ariaLabel="Connect selected Codex account"
                  tooltip="Connect"
                  onActivate={() =>
                    model.selectedAccountId !== null &&
                    actions.connectAccount(model.selectedAccountId)
                  }
                  disabled={
                    model.selectedAccountId === null || model.runIsActive
                  }
                />
                {model.showLogout ? (
                  <SettingsIconAction
                    icon={LogOut}
                    ariaLabel="Log out of selected Codex account"
                    tooltip="Log out"
                    danger
                    onActivate={actions.logout}
                    disabled={
                      model.selectedAccountId !== null &&
                      model.activeRunAccountIds.has(model.selectedAccountId)
                    }
                  />
                ) : null}
              </div>
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
  const computerUsePlugin = findPlugin(
    model.pluginCatalog,
    "computer-use@openai-bundled",
    "computer-use",
  );
  const computerUseReady =
    pluginIsReady(computerUsePlugin) &&
    model.desktopRuntimeStatus?.available === true &&
    model.desktopRuntimeStatus?.serviceCompatible === true;
  const showConnections = queryMatches(
    "connections",
    "codex",
    "accounts",
    "github",
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
  danger = false,
  disabled = false,
  onActivate,
}: {
  icon: typeof Monitor;
  ariaLabel: string;
  tooltip: string;
  danger?: boolean;
  disabled?: boolean;
  onActivate: () => void;
}) {
  return (
    <button
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
                <span>Allow Orchestrator to deliver the selected agent alerts.</span>
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
