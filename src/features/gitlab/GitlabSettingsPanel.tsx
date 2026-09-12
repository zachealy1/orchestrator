import { useState } from "react";
import { GitPullRequest, Loader2, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cancelGitlabConnection, connectGitlab, disconnectGitlab } from "./api";
import { useGitlabConnections } from "./useGitlabConnections";
import "./gitlab.css";

export function GitlabSettingsPanel() {
  const { connections, error: loadError, refresh } = useGitlabConnections();
  const [host, setHost] = useState("gitlab.com");
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cloud = /^(https:\/\/)?gitlab\.com(?::443)?\/?$/i.test(host.trim());
  const act = async (operation: () => Promise<void>) => {
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
      <header className="gitlab-settings-heading">
        <GitPullRequest size={18} aria-hidden="true" />
        <h2>GitLab</h2>
      </header>
      <p>
        Publish completed cards as draft merge requests on GitLab.com or your
        own GitLab server.
      </p>
      <div className="setting-list">
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
                  <Loader2 size={16} aria-label="Signing in" />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void act(() => cancelGitlabConnection(connection.host))
                    }
                  >
                    Cancel
                  </button>
                </>
              ) : connection.connected ? (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Disconnect ${connection.host}`}
                  onClick={() =>
                    void act(() => disconnectGitlab(connection.host))
                  }
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy || !connection.available}
                  onClick={() => {
                    setHost(connection.host);
                    setToken("");
                    setEditing(true);
                  }}
                >
                  {connection.status === "reconnect_required"
                    ? "Reconnect"
                    : "Connect"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="gitlab-add-host"
        disabled={busy}
        onClick={() => {
          setHost("gitlab.com");
          setToken("");
          setEditing(true);
        }}
      >
        Add GitLab host
      </button>
      {editing ? (
        <form
          className="gitlab-connect-form"
          onSubmit={(event) => {
            event.preventDefault();
            signIn(false);
          }}
        >
          <div className="gitlab-settings-heading">
            <h3>Connect GitLab</h3>
            <button
              type="button"
              aria-label="Close GitLab connection form"
              data-tooltip="Close"
              className="settings-icon-action"
              onClick={() => {
                setEditing(false);
                setToken("");
              }}
            >
              <X size={16} />
            </button>
          </div>
          <label>
            GitLab host
            <input
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
            <button type="button" disabled={busy} onClick={() => signIn(true)}>
              Sign in with browser
            </button>
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
          <p>
            Use a token with the <code>api</code> scope. Your token is stored in
            macOS Keychain.
          </p>
          <div className="button-row">
            <button
              type="submit"
              disabled={busy || !host.trim() || !token.trim()}
            >
              Connect with token
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
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
            >
              Create token
            </button>
          </div>
        </form>
      ) : null}
      {error || loadError ? <p role="alert">{error ?? loadError}</p> : null}
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
