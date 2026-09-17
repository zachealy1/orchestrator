import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ExternalLink,
  GitPullRequest,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  X,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cancelGitlabConnection, connectGitlab, disconnectGitlab } from "./api";
import { useGitlabConnections } from "./useGitlabConnections";
import { trapDialogFocus } from "../../shared/dialogFocus";
import {
  SettingsDetailHeader,
  SettingsIconAction,
} from "../settings/SettingsPanel";
import {
  SettingsStatusBadge,
  type SettingsDetailStatus,
} from "../settings/SettingsStatusPopover";
import "./gitlab.css";

export function GitlabSettingsPanel() {
  const { connections, error: loadError, refresh } = useGitlabConnections();
  const [host, setHost] = useState("gitlab.com");
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLFormElement>(null);
  const hostInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (editing) hostInputRef.current?.focus({ preventScroll: true });
  }, [editing]);

  useEffect(() => {
    if (!editing && !busy) {
      triggerRef.current?.focus({ preventScroll: true });
      triggerRef.current = null;
    }
  }, [editing, busy]);

  const cloud = /^(https:\/\/)?gitlab\.com(?::443)?\/?$/i.test(host.trim());
  const connectedCount = connections.filter(
    (connection) => connection.connected,
  ).length;
  const headerStatus: SettingsDetailStatus = connections.some(
    (connection) => !connection.available,
  )
    ? { label: "Unavailable", tone: "negative" }
    : connections.some(connection => connection.status === "connecting")
      ? { label: "Connecting", tone: "pending" }
      : connections.some(connection => connection.status === "reconnect_required")
        ? { label: "Review access", tone: "negative" }
        : connectedCount
          ? {
              label: connections.length === 1 ? "Connected" : `${connectedCount} connected`,
              tone: "positive",
            }
          : { label: "Not connected", tone: "neutral" };
  const editHost = (nextHost: string) => {
    triggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setHost(nextHost);
    setToken("");
    setError(null);
    setEditing(true);
  };
  const closeForm = () => {
    if (busy) return;
    setEditing(false);
    setToken("");
    setError(null);
  };
  const act = async (operation: () => Promise<void>) => {
    // Keep focus in the popup while its controls are disabled for the request.
    if (editing) dialogRef.current?.focus({ preventScroll: true });
    setBusy(true);
    setError(null);
    try {
      await operation();
      await refresh();
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  const signIn = (browser: boolean) =>
    void act(async () => {
      const suppliedToken = browser ? null : token;
      setToken("");
      await connectGitlab(host, suppliedToken);
      setEditing(false);
    });
  return (
    <section
      className="surface settings-panel gitlab-settings-panel"
      aria-label="GitLab settings"
      id="settings-gitlab"
    >
      <SettingsDetailHeader
        icon={GitPullRequest}
        title="GitLab"
        status={headerStatus}
      />
      <div className="setting-list">
        <div className="setting-row">
          <div>
            <strong>Hosts</strong>
            <span>
              Publish draft merge requests on GitLab.com or your own GitLab server.
            </span>
          </div>
          <SettingsIconAction
            icon={Plus}
            ariaLabel="Add GitLab host"
            tooltip="Add host"
            disabled={busy}
            onActivate={() => editHost("gitlab.com")}
          />
        </div>
        {connections.map((connection) => (
          <div className="setting-row" key={connection.host}>
            <div>
              <strong>{connection.host}</strong>
              <span>
                {connection.connected
                  ? `@${connection.login}${connection.displayName ? ` · ${connection.displayName}` : ""}`
                  : connection.status === "connecting"
                    ? "Complete sign-in in your browser, or wait for token verification."
                    : connection.status === "reconnect_required"
                      ? "Reconnect required"
                      : "Not connected"}
              </span>
              {connection.message ? (
                <span role="status">{connection.message}</span>
              ) : null}
            </div>
            <div className="button-row compact">
              {connection.status === "connecting" ? (
                <>
                  <Loader2
                    className="gitlab-connection-spinner"
                    size={16}
                    aria-label="Signing in"
                  />
                  <SettingsIconAction
                    icon={X}
                    ariaLabel={`Cancel sign-in to ${connection.host}`}
                    tooltip="Cancel sign-in"
                    disabled={busy}
                    onActivate={() => void act(() => cancelGitlabConnection(connection.host))}
                  />
                </>
              ) : connection.connected ? (
                <SettingsIconAction
                  icon={LogOut}
                  ariaLabel={`Disconnect ${connection.host}`}
                  tooltip="Disconnect"
                  danger
                  disabled={busy}
                  onActivate={() => void act(() => disconnectGitlab(connection.host))}
                />
              ) : (
                <>
                  {!connection.available ? (
                    <SettingsStatusBadge label="Unavailable" tone="negative" />
                  ) : null}
                  <SettingsIconAction
                    icon={LogIn}
                    ariaLabel={`${connection.status === "reconnect_required" ? "Reconnect" : "Connect"} ${connection.host}`}
                    tooltip={connection.status === "reconnect_required" ? "Reconnect" : "Connect"}
                    disabled={busy || !connection.available}
                    onActivate={() => editHost(connection.host)}
                  />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {editing ? createPortal(
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              event.preventDefault();
              closeForm();
            }
          }}
        >
          <form
            ref={dialogRef}
            className="confirmation-dialog gitlab-connect-form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gitlab-connect-title"
            aria-busy={busy}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeForm();
                return;
              }
              trapDialogFocus(event);
            }}
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && host.trim() && token.trim()) signIn(false);
            }}
          >
            <div className="gitlab-connect-heading">
              <h2 id="gitlab-connect-title">Connect GitLab</h2>
              <SettingsIconAction
                icon={X}
                ariaLabel="Close GitLab connection form"
                tooltip="Close"
                disabled={busy}
                onActivate={closeForm}
              />
            </div>
            <label>
              GitLab host
              <input
                ref={hostInputRef}
                aria-label="GitLab host"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="gitlab.example.com"
                autoCapitalize="none"
                autoCorrect="off"
                disabled={busy}
              />
            </label>
            {cloud ? (
              <div className="gitlab-sign-in-row">
                <div>
                  <strong>Browser sign-in</strong>
                  <span>Sign in with your GitLab.com account.</span>
                </div>
                <SettingsIconAction
                  icon={ExternalLink}
                  ariaLabel="Sign in with browser"
                  tooltip="Sign in with browser"
                  disabled={busy}
                  onActivate={() => signIn(true)}
                />
              </div>
            ) : null}
            <label>
              Personal access token
              <input
                aria-label="GitLab personal access token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="off"
                disabled={busy}
              />
            </label>
            <p className="gitlab-token-help">
              Use a token with the <code>api</code> scope. Your token is stored in
              macOS Keychain.
            </p>
            <div className="gitlab-token-actions">
              <span>Token sign-in</span>
              <div className="button-row compact">
                <SettingsIconAction
                  icon={ExternalLink}
                  ariaLabel="Create token"
                  tooltip="Create token"
                  disabled={busy}
                  onActivate={() =>
                    void act(async () => {
                      const url = new URL(
                        host.includes("://") ? host : `https://${host}`,
                      );
                      if (
                        url.protocol !== "https:" ||
                        url.username ||
                        url.password ||
                        url.pathname !== "/" ||
                        url.search ||
                        url.hash
                      )
                        throw new Error(
                          "Enter an HTTPS GitLab host without a subpath.",
                        );
                      await openUrl(
                        `${url.origin}/-/user_settings/personal_access_tokens?scopes=api&name=Orchestrator`,
                      );
                    })
                  }
                />
                <SettingsIconAction
                  icon={LogIn}
                  type="submit"
                  ariaLabel="Connect with token"
                  tooltip="Connect with token"
                  disabled={busy || !host.trim() || !token.trim()}
                />
              </div>
            </div>
            {error || loadError ? (
              <p className="gitlab-connection-error" role="alert">{error ?? loadError}</p>
            ) : null}
          </form>
        </div>,
        document.body,
      ) : null}
      {!editing && (error || loadError) ? (
        <p className="gitlab-connection-error" role="alert">{error ?? loadError}</p>
      ) : null}
    </section>
  );
}

export function GitlabConnectionSummary() {
  const { connections } = useGitlabConnections();
  const count = connections.filter((connection) => connection.connected).length;
  return (
    <span className="settings-connection-value">
      {count ? `${count} connected` : "Off"}
    </span>
  );
}
