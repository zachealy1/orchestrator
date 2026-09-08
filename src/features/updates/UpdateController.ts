import type { AppUpdateState } from "../../generated/tauri";
import { reserveUpdateInstallation } from "../../shared/updateInterlock";

export const RELEASE_DOWNLOADS_URL = "https://github.com/zachealy1/orchestrator/releases";
export const BUG_REPORT_URL = "https://github.com/zachealy1/orchestrator/issues/new/choose";
const SIX_HOURS = 6 * 60 * 60 * 1000;
const FOREGROUND_AGE = 15 * 60 * 1000;
const SEEN_KEY = "orchestrator.app-updates.notified.v1";
export const initialUpdateState: AppUpdateState = {
  phase: "idle", version: null, downloadedBytes: 0, totalBytes: null, error: null, manualUrl: RELEASE_DOWNLOADS_URL,
};
type Dependencies = {
  check: () => Promise<AppUpdateState>;
  download: () => Promise<AppUpdateState>;
  install: () => Promise<AppUpdateState>;
  busy: () => boolean;
  flush: () => Promise<void>;
  notify: (version: string) => void;
  storage: Pick<Storage, "getItem" | "setItem">;
  now?: () => number;
};
export type UpdateView = AppUpdateState & { installing: boolean; checking: boolean; message: string | null };
export class UpdateController {
  private snapshot: UpdateView = { ...initialUpdateState, installing: false, checking: false, message: null };
  private listeners = new Set<() => void>();
  private inFlight = false;
  private lastCheck: number | null = null;
  private noticed = new Set<string>();
  constructor(private deps: Dependencies) {
    try { this.noticed = new Set(JSON.parse(deps.storage.getItem(SEEN_KEY) ?? "[]")); } catch { /* optional preference */ }
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private patch(next: Partial<UpdateView>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }
  accept = (state: AppUpdateState) => {
    this.patch(state);
    if (state.version && state.phase === "available" && !this.noticed.has(state.version)) {
      this.noticed.add(state.version);
      try { this.deps.storage.setItem(SEEN_KEY, JSON.stringify([...this.noticed])); } catch { /* session dedup remains */ }
      this.deps.notify(state.version);
    }
  };
  async check(reason: "manual" | "startup" | "timer" | "foreground" = "manual") {
    const now = (this.deps.now ?? Date.now)();
    const maxAge = reason === "foreground" ? FOREGROUND_AGE : SIX_HOURS;
    if (this.inFlight || ["ready", "downloading", "installing"].includes(this.snapshot.phase)) return;
    if (reason !== "manual" && this.lastCheck !== null && now - this.lastCheck < maxAge) return;
    this.inFlight = true;
    this.lastCheck = now;
    this.patch({ checking: true, message: null });
    try {
      const state = await this.deps.check();
      this.accept(state);
      if (reason === "manual") this.patch({ message: state.error ?? (state.version ? null : "Orchestrator is up to date.") });
    } catch (error) {
      if (reason === "manual") this.patch({ message: String(error), error: String(error) });
    } finally { this.inFlight = false; this.patch({ checking: false }); }
  }
  async act() {
    if (this.inFlight || ["checking", "downloading", "installing"].includes(this.snapshot.phase)) return;
    if (!this.snapshot.version && this.snapshot.phase !== "download-error") return this.check();
    this.inFlight = true;
    this.patch({ message: null });
    let release: (() => void) | undefined;
    try {
      if (this.snapshot.phase === "ready") {
        // Reserve before awaiting anything. Native code repeats the idle check under its own interlock.
        release = reserveUpdateInstallation();
        if (this.deps.busy()) throw new Error("Finish active tasks, approvals and repository operations, and pause automatic prompt sending before installing.");
        this.patch({ installing: true });
        await this.deps.flush();
        if (this.deps.busy()) throw new Error("New background activity was detected. Installation was cancelled.");
        const state = await this.deps.install();
        this.accept(state);
        this.patch({ message: state.error });
      } else {
        this.patch({ phase: "downloading", downloadedBytes: 0, totalBytes: null });
        const state = await this.deps.download();
        this.accept(state);
        this.patch({ message: state.error });
      }
    } catch (error) { this.patch({ message: String(error), error: String(error), ...(this.snapshot.phase === "downloading" ? { phase: "download-error" } : {}) }); }
    finally { release?.(); this.inFlight = false; this.patch({ installing: false }); }
  }
}

export function updateActionLabel(state: UpdateView) {
  if (state.installing) return "Installing…";
  if (state.phase === "downloading") return "Downloading…";
  if (state.phase === "ready") return "Install and restart";
  if (state.phase === "download-error") return "Retry download";
  if (state.version) return "Download update";
  return state.checking ? "Checking…" : "Check for updates";
}
