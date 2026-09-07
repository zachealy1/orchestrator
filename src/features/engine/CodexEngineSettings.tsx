import type { EngineController } from "./useEngineController";

export type EngineSettings = {
  controller: EngineController;
  refreshModels: () => void;
  modelsRefreshing: boolean;
  modelsNotice: string | null;
  canRefreshModels: boolean;
};

export function CodexEngineSettings({ controller, refreshModels, modelsRefreshing, modelsNotice, canRefreshModels }: EngineSettings) {
  const { status, busy, error } = controller;
  const overridden = status?.source === "override";
  return <div className="setting-list" aria-label="Codex engine updates">
    <div className="setting-row">
      <div><strong>Codex engine</strong><p className="muted">
        {status?.installedVersion ? `Version ${status.installedVersion}${overridden ? " · Custom installation" : " · Managed by Orchestrator"}` : busy ? "Preparing the Codex engine…" : "Engine setup required"}
      </p></div>
      <button type="button" className="secondary small" disabled={busy} onClick={() => void controller.check()}>{busy ? "Working…" : "Check for updates"}</button>
    </div>
    {status?.pendingVersion ? <p role="status">Codex {status.pendingVersion} is ready. It will be applied the next time you launch Orchestrator. Active tasks keep their current engine.</p>
      : status?.updateAvailable ? <div className="setting-row"><p>Codex {status.latestVersion} is available. Compatibility will be checked before it is applied.</p>
        {!overridden && <button type="button" className="secondary small" disabled={busy} onClick={() => void controller.install()}>Prepare update</button>}
      </div> : null}
    {overridden && <p className="muted">An explicit engine override is active. Update that installation separately.</p>}
    {status?.lastCheckedAt && <p className="muted">Last checked {new Date(status.lastCheckedAt * 1000).toLocaleString()}.</p>}
    {(error || status?.message) && <p role="status">{error || status?.message}</p>}
    <div className="setting-row"><div><strong>Available models</strong><p className="muted">Models refresh automatically while Orchestrator is open.</p></div>
      <button type="button" className="secondary small" disabled={modelsRefreshing || !canRefreshModels} onClick={refreshModels}>{modelsRefreshing ? "Refreshing…" : "Refresh models"}</button>
    </div>
    {modelsNotice && <p role="status">{modelsNotice}</p>}
  </div>;
}
