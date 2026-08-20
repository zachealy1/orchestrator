import {
  AlertCircle,
  Bell,
  BellOff,
  ChevronRight,
  GitPullRequest,
  Accessibility,
  ExternalLink,
  LogIn,
  LogOut,
  Monitor,
  Plug,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  UserRound,
  UserPlus,
} from "lucide-react";
import { memo, useState, type ReactNode } from "react";
import { ComposerSelect } from "../../components/ComposerSelect";
import { OrchestratorMark } from "../../components/OrchestratorMark";
import type {
  AgentNotificationPermissionStatus,
  AgentNotificationPreferences,
} from "../../lib/agentNotifications";
import type {
  BrowserExecutionTarget,
  BrowserRuntimeStatus,
} from "../browser/types";
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

export type SettingsViewModel = {
  dragRegion?: string;
  computerUseEnabled: boolean;
  browserExecutionTarget: BrowserExecutionTarget;
  browserRuntimeStatus: BrowserRuntimeStatus | null;
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
  setBrowserExecutionTarget: (target: BrowserExecutionTarget) => void;
  installDefaultBrowserExtension: () => void;
  refreshBrowserRuntimeStatus: () => void;
  openDefaultBrowserAccessibilitySettings: () => void;
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

  return (
    <>
      <SettingsOverview
        model={model}
        actions={actions}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
      />

      {matchesSettings(
        "computer use",
        "browser",
        "default browser",
        "isolated chromium",
        "browser bridge",
      ) ? (
        <section
          className="surface settings-panel computer-use-settings-panel"
          aria-label="Computer use settings"
          id="settings-computer-use"
        >
          <SettingsDetailHeader
            icon={Monitor}
            title="Computer use"
            description="Control which browser Orchestrator can use for future turns."
            status={
              <span
                className={`notification-permission-status ${
                  model.browserRuntimeStatus === null
                    ? ""
                    : model.browserRuntimeStatus.available
                      ? "permission-allowed"
                      : "permission-denied"
                }`}
              >
                {model.browserRuntimeStatus?.available === false ? (
                  <AlertCircle size={14} aria-hidden="true" />
                ) : (
                  <Monitor size={14} aria-hidden="true" />
                )}
                {model.browserRuntimeStatus === null
                  ? "Checking"
                  : model.browserRuntimeStatus.available
                    ? "Available"
                    : "Unavailable"}
              </span>
            }
          />
          <div className="setting-list">
            <label className="setting-row checkbox-setting">
              <div>
                <strong>Enable browser computer use</strong>
                <span>
                  Give future agent turns a browser that opens only when Codex
                  uses it.
                </span>
              </div>
              <SettingsSwitch
                ariaLabel="Enable browser computer use"
                checked={model.computerUseEnabled}
                onChange={actions.setComputerUseEnabled}
              />
            </label>
            <div className="setting-row computer-use-target-setting">
              <div>
                <strong>Browser</strong>
                <span>Changing this applies to future turns only.</span>
              </div>
              <div
                className="theme-selector computer-use-target-selector"
                role="radiogroup"
                aria-label="Computer use browser"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={
                    model.browserExecutionTarget === "default-browser"
                  }
                  className={
                    model.browserExecutionTarget === "default-browser"
                      ? "active"
                      : ""
                  }
                  onClick={() =>
                    actions.setBrowserExecutionTarget("default-browser")
                  }
                >
                  <ExternalLink size={16} aria-hidden="true" />
                  Default browser
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={model.browserExecutionTarget === "isolated"}
                  className={
                    model.browserExecutionTarget === "isolated" ? "active" : ""
                  }
                  onClick={() => actions.setBrowserExecutionTarget("isolated")}
                >
                  <Monitor size={16} aria-hidden="true" />
                  Isolated Chromium
                </button>
              </div>
            </div>
            {model.browserExecutionTarget === "default-browser" ? (
              <div className="setting-row default-browser-status-row">
                <div>
                  <strong>
                    {model.browserRuntimeStatus?.defaultBrowser?.browser
                      ?.name ?? "Default browser"}
                  </strong>
                  <span>
                    {model.browserRuntimeStatus?.defaultBrowser
                      ?.extensionConnected
                      ? "Browser Bridge connected"
                      : (model.browserRuntimeStatus?.defaultBrowser?.message ??
                        "Checking the Browser Bridge extension")}
                  </span>
                </div>
                <div className="button-row compact">
                  {!model.browserRuntimeStatus?.defaultBrowser
                    ?.extensionConnected ? (
                    <button
                      className="secondary"
                      type="button"
                      onClick={actions.installDefaultBrowserExtension}
                    >
                      <ExternalLink size={16} aria-hidden="true" />
                      Install extension
                    </button>
                  ) : null}
                  <button
                    className="native-plan-icon-action"
                    type="button"
                    aria-label="Check browser connection again"
                    data-tooltip="Check again"
                    onClick={actions.refreshBrowserRuntimeStatus}
                  >
                    <RefreshCw size={16} aria-hidden="true" />
                  </button>
                  {!model.browserRuntimeStatus?.defaultBrowser
                    ?.accessibilityTrusted ? (
                    <button
                      className="native-plan-icon-action"
                      type="button"
                      aria-label="Open Accessibility settings"
                      data-tooltip="Accessibility settings"
                      onClick={actions.openDefaultBrowserAccessibilitySettings}
                    >
                      <Accessibility size={16} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          {model.browserRuntimeStatus?.available === false ? (
            <p className="computer-use-runtime-error" role="alert">
              {model.browserRuntimeStatus.message ??
                "The bundled browser runtime is unavailable."}
            </p>
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
            description="Connect the bundled GitHub CLI for repository actions."
            status={
              <span
                className={`run-status ${
                  model.githubConnectionPending
                    ? "running"
                    : model.githubConnection?.connected
                      ? "completed"
                      : "interrupted"
                }`}
              >
                {model.githubConnectionPending
                  ? "connecting"
                  : model.githubConnection?.connected
                    ? "connected"
                    : model.githubConnection?.available === false
                      ? "unavailable"
                      : "disconnected"}
              </span>
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
            description="Manage Codex accounts and optional OSS providers used for runs."
            status={
              <span
                className={`run-status ${model.codexConnected ? "completed" : "interrupted"}`}
              >
                {model.codexConnected ? "connected" : "disconnected"}
              </span>
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
                            : (account.plan_type ?? account.status)}
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
  const browserReady = model.browserRuntimeStatus?.available === true;
  const showQuickPreferences = queryMatches(
    "quick preferences",
    "computer use",
    "browser",
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
            value={
              model.browserRuntimeStatus === null
                ? "Checking"
                : browserReady
                  ? "Browser ready"
                  : "Not available"
            }
            healthy={browserReady}
            targetId="settings-computer-use"
          />
          <SettingsStatusCard
            icon={Bell}
            label="Notifications"
            value={notificationOverviewLabel(model.notificationPermission)}
            healthy={model.notificationPermission === "allowed"}
            targetId="settings-notifications"
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
              <div className="surface-header settings-overview-panel-header">
                <div>
                  <h2>Quick preferences</h2>
                  <p>Common controls, available without leaving this page.</p>
                </div>
              </div>
              <div className="settings-overview-rows">
                <label className="settings-overview-row">
                  <span className="settings-row-icon" aria-hidden="true">
                    <Monitor size={18} />
                  </span>
                  <span className="settings-overview-row-copy">
                    <strong>Computer use</strong>
                    <span>Allow browser interactions for future turns.</span>
                  </span>
                  <SettingsSwitch
                    ariaLabel="Computer use"
                    checked={model.computerUseEnabled}
                    onChange={actions.setComputerUseEnabled}
                  />
                </label>
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
              <div className="surface-header settings-overview-panel-header">
                <div>
                  <h2>Connections</h2>
                  <p>Accounts and services available to agent runs.</p>
                </div>
              </div>
              <div className="settings-overview-rows">
                <div className="settings-overview-row settings-connection-row">
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
                    {selectedAccount?.plan_type ??
                      (model.codexConnected ? "Connected" : "Not connected")}
                  </span>
                  <button
                    className="settings-manage-button"
                    type="button"
                    onClick={() => scrollToSettingsSection("settings-accounts")}
                  >
                    Manage
                  </button>
                </div>
                <div className="settings-overview-row settings-connection-row">
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
                  <button
                    className="settings-manage-button"
                    type="button"
                    onClick={() => scrollToSettingsSection("settings-github")}
                  >
                    Manage
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {query.length === 0 ? (
        <nav
          className="settings-section-navigation"
          aria-label="Settings sections"
        >
          <SettingsSectionLink
            icon={Monitor}
            title="Browser & computer use"
            description="Configure browser and computer automation."
            targetId="settings-computer-use"
          />
          <SettingsSectionLink
            icon={Bell}
            title="Notification rules"
            description="Customize when and how you are notified."
            targetId="settings-notifications"
          />
          <SettingsSectionLink
            icon={UserRound}
            title="Accounts"
            description="Manage Codex accounts and run providers."
            targetId="settings-accounts"
          />
        </nav>
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
}: {
  icon: typeof Monitor | "codex";
  label: string;
  value: string;
  healthy: boolean;
  targetId: string;
}) {
  const StatusIcon = icon === "codex" ? null : icon;
  return (
    <button
      className="settings-status-card"
      type="button"
      onClick={() => scrollToSettingsSection(targetId)}
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

function SettingsSectionLink({
  icon: Icon,
  title,
  description,
  targetId,
}: {
  icon: typeof Monitor;
  title: string;
  description: string;
  targetId: string;
}) {
  return (
    <button
      className="settings-section-link"
      type="button"
      onClick={() => scrollToSettingsSection(targetId)}
    >
      <Icon size={21} aria-hidden="true" />
      <strong>{title}</strong>
      <span>{description}</span>
      <ChevronRight size={17} aria-hidden="true" />
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
  description,
  status,
}: {
  icon: typeof Monitor;
  title: string;
  description: string;
  status: ReactNode;
}) {
  return (
    <div className="surface-header settings-detail-header">
      <div className="settings-detail-heading">
        <span className="settings-detail-header-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <div className="settings-detail-header-copy">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {status}
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
        description="Choose which moments deserve your attention."
        status={
          <span
            className={`notification-permission-status permission-${model.notificationPermission}`}
          >
            {model.notificationPermission === "allowed" ? (
              <Bell size={14} aria-hidden="true" />
            ) : (
              <BellOff size={14} aria-hidden="true" />
            )}
            {permissionLabel(model.notificationPermission)}
          </span>
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

function permissionLabel(permission: AgentNotificationPermissionStatus) {
  switch (permission) {
    case "allowed":
      return "Allowed";
    case "not-enabled":
      return "Not enabled";
    case "denied":
      return "Denied";
    case "unavailable":
      return "Unavailable";
  }
}
