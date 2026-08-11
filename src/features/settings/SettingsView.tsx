import {
  AlertCircle,
  Bell,
  BellOff,
  GitPullRequest,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Plug,
  Settings,
  Sun,
  Trash2,
  UserPlus,
} from "lucide-react";
import { memo, useState } from "react";
import orchestratorMark from "../../assets/brand/orchestrator-mark.png";
import { ComposerSelect } from "../../components/ComposerSelect";
import type {
  AgentNotificationPermissionStatus,
  AgentNotificationPreferences,
} from "../../lib/agentNotifications";
import type { BrowserRuntimeStatus } from "../browser/types";
import type { CodexLoginState, OssProvider } from "../codex/types";
import type { CodexAccountProfile } from "../accounts/types";
import type { ThemePreference } from "../../shared/types";
import type { GithubConnectionStatus } from "../github/api";

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export type SettingsViewModel = {
  dragRegion?: string;
  themePreference: ThemePreference;
  computerUseEnabled: boolean;
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
  setThemePreference: (preference: ThemePreference) => void;
  setComputerUseEnabled: (enabled: boolean) => void;
  connectGithub: (clientId?: string) => void;
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
  const [githubClientId, setGithubClientId] = useState("");
  const requiresGithubClientId =
    model.githubConnection?.available === false &&
    !model.githubConnection.connected;

  return (
    <>
      <section
        className="surface settings-panel appearance-panel"
        aria-label="Appearance settings"
      >
        <div className="surface-header">
          <div>
            <p className="eyebrow">Appearance</p>
            <h2>Theme</h2>
          </div>
        </div>
        <div className="setting-row appearance-setting">
          <div>
            <strong>Interface theme</strong>
            <span>Choose a theme or follow your system appearance.</span>
          </div>
          <div
            className="theme-selector"
            role="radiogroup"
            aria-label="Interface theme"
          >
            {THEME_OPTIONS.map((option) => {
              const ThemeIcon = option.icon;
              const selected = model.themePreference === option.value;
              return (
                <button
                  className={selected ? "active" : ""}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  key={option.value}
                  onClick={() => actions.setThemePreference(option.value)}
                >
                  <ThemeIcon size={16} aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className="surface settings-panel computer-use-settings-panel"
        aria-label="Computer use settings"
      >
        <div className="surface-header">
          <div>
            <p className="eyebrow">Agent capabilities</p>
            <h2>Computer use</h2>
          </div>
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
        </div>
        <div className="setting-list">
          <label className="setting-row checkbox-setting">
            <div>
              <strong>Enable browser computer use</strong>
              <span>
                Give future agent turns an isolated browser that opens only when
                Codex uses it.
              </span>
            </div>
            <input
              type="checkbox"
              checked={model.computerUseEnabled}
              onChange={(event) =>
                actions.setComputerUseEnabled(event.currentTarget.checked)
              }
            />
          </label>
        </div>
        {model.browserRuntimeStatus?.available === false ? (
          <p className="computer-use-runtime-error" role="alert">
            {model.browserRuntimeStatus.message ??
              "The bundled browser runtime is unavailable."}
          </p>
        ) : null}
      </section>

      <NotificationSettings model={model} actions={actions} />

      <section className="surface settings-panel github-settings-panel" aria-label="GitHub settings">
        <div className="surface-header">
          <div>
            <p className="eyebrow">Source control</p>
            <h2>GitHub</h2>
          </div>
          <span
            className={`run-status ${model.githubConnection?.connected ? "completed" : "interrupted"}`}
          >
            {model.githubConnection?.connected ? "connected" : "disconnected"}
          </span>
        </div>
        <div className="setting-list">
          <div className="setting-row">
            <div>
              <strong>
                {model.githubConnection?.connected
                  ? model.githubConnection.displayName ?? model.githubConnection.login
                  : "GitHub App connection"}
              </strong>
              <span>
                {model.githubConnection?.connected
                  ? `${model.githubConnection.repositories.length} accessible ${
                      model.githubConnection.repositories.length === 1
                        ? "repository"
                        : "repositories"
                    }`
                  : model.githubConnection?.message ??
                    "Connect to publish completed Kanban work as draft pull requests."}
              </span>
            </div>
            <div className="button-row compact">
              {model.githubConnection?.connected ? (
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
                  onClick={() =>
                    actions.connectGithub(
                      requiresGithubClientId ? githubClientId : undefined,
                    )
                  }
                  disabled={
                    model.githubConnectionPending ||
                    (requiresGithubClientId && githubClientId.trim().length === 0)
                  }
                >
                  <GitPullRequest size={16} aria-hidden="true" />
                  {model.githubConnectionPending ? "Connecting" : "Connect"}
                </button>
              )}
            </div>
          </div>
          {requiresGithubClientId ? (
            <label className="github-client-id-setting">
              <span>
                <strong>GitHub App client ID</strong>
                <small>
                  Enter the public client ID from your GitHub App. Orchestrator
                  never asks for a PAT or client secret.
                </small>
              </span>
              <input
                type="text"
                value={githubClientId}
                autoComplete="off"
                spellCheck={false}
                placeholder="Iv1.0123456789abcdef"
                onChange={(event) => setGithubClientId(event.currentTarget.value)}
                disabled={model.githubConnectionPending}
              />
            </label>
          ) : null}
          {model.githubConnection?.connected &&
          model.githubConnection.repositories.length > 0 ? (
            <div className="github-repository-list" aria-label="Accessible GitHub repositories">
              {model.githubConnection.repositories.map((repository) => (
                <span key={`${repository.installationId}:${repository.fullName}`}>
                  {repository.fullName}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="surface settings-panel" aria-label="Codex settings">
        <div className="surface-header">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>Codex connection</h2>
          </div>
          <span
            className={`run-status ${model.codexConnected ? "completed" : "interrupted"}`}
          >
            {model.codexConnected ? "connected" : "disconnected"}
          </span>
        </div>
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
                      {(account.email ?? account.label).charAt(0).toUpperCase()}
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
                          : account.plan_type ?? account.status}
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
                disabled={model.selectedAccountId === null || model.runIsActive}
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
            <input
              type="checkbox"
              checked={model.useOss}
              onChange={(event) => actions.setUseOss(event.currentTarget.checked)}
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
              onChange={(value) => actions.setOssProvider(value as OssProvider)}
            />
          </div>
        </div>
      </section>

      <section className="surface brand-panel" aria-label="About Orchestrator">
        <div className="brand-lockup">
          <img src={orchestratorMark} alt="" />
          <div>
            <h2>Orchestrator</h2>
            <span>Token-aware Codex workspace</span>
          </div>
        </div>
        <p>
          A token-aware desktop workspace for Codex runs, advisory preflight,
          context budgeting, and local analytics.
        </p>
      </section>
    </>
  );
});

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
    >
      <div className="surface-header">
        <div>
          <p className="eyebrow">Notifications</p>
          <h2>Agent alerts</h2>
        </div>
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
      </div>
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
        ) : model.notificationPermission !== "allowed" ? (
          <button
            className="secondary"
            type="button"
            onClick={actions.enableNotifications}
            disabled={model.notificationPermission === "unavailable"}
          >
            <Bell size={16} aria-hidden="true" />
            Enable notifications
          </button>
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
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
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
