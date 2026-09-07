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
  return <div className="setting-list" aria-label="Codex engine and models">
    <div className="setting-row">
      <div><strong>Codex engine</strong><p className="muted">
        {status?.installedVersion ? `Version ${status.installedVersion}${overridden ? " · Custom installation" : " · Managed by Orchestrator"}` : busy ? "Preparing the Codex engine…" : "Engine setup required"}
      </p></div>
      {!status?.installedVersion && !busy && <button type="button" className="secondary small" onClick={() => void controller.retry()}>Retry engine setup</button>}
    </div>
    {overridden && <p className="muted">An explicit engine override is active.</p>}
    {(error || status?.message) && <p role="status">{error || status?.message}</p>}
    <div className="setting-row"><div><strong>Available models</strong><p className="muted">Models refresh automatically while Orchestrator is open.</p></div>
      <button type="button" className="secondary small" disabled={modelsRefreshing || !canRefreshModels} onClick={refreshModels}>{modelsRefreshing ? "Refreshing…" : "Refresh models"}</button>
    </div>
    {modelsNotice && <p role="status">{modelsNotice}</p>}
  </div>;
}
