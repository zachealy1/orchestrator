import { isDocumentVisible, subscribeDocumentVisibility } from "../../shared/documentVisibility";
import type { RefreshWorkspaceGitStatusOptions } from "./runtimeState";

export const ACTIVE_WORKSPACE_REFRESH_MS = 5_000;
export const INACTIVE_WORKSPACE_REFRESH_MS = 30_000;
const INTERACTION_RETRY_MS = 500;

type WorkspaceLocation = { id: number; path: string };
type Entry<W> = { workspace: W; lastRefresh: number | null; dueAt: number };
type Request<W> = { workspace: W; options: RefreshWorkspaceGitStatusOptions };
type InFlight<W> = { promise: Promise<void>; pending: Request<W> | null };

type Options<W> = {
  refresh: (workspace: W, options: RefreshWorkspaceGitStatusOptions) => Promise<void>;
  refreshDirectories: (workspace: W) => Promise<void>;
  shouldDefer: () => boolean;
};

/** One polling clock; explicit invalidations remain available while hidden. */
export class WorkspaceRefreshController<W extends WorkspaceLocation> {
  private readonly entries = new Map<number, Entry<W>>();
  private readonly inFlight = new Map<number, InFlight<W>>();
  private selectedId: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private resuming = false;
  private visibilityGeneration = 0;
  private disposed = false;
  private visible = isDocumentVisible();
  private readonly unsubscribe: () => void;

  constructor(private readonly options: Options<W>) {
    this.unsubscribe = subscribeDocumentVisibility(() => {
      const visible = isDocumentVisible();
      if (visible === this.visible) return;
      this.visible = visible;
      this.clearTimer();
      const generation = ++this.visibilityGeneration;
      this.resuming = visible;
      if (visible) void this.resume(generation);
    });
  }

  update(workspaces: readonly W[], selectedId: number | null) {
    if (this.disposed) return;
    const previousSelectedId = this.selectedId;
    const previousSelectedPath = this.entries.get(selectedId ?? -1)?.workspace.path;
    this.selectedId = selectedId;
    const ids = new Set(workspaces.map((workspace) => workspace.id));
    for (const id of this.entries.keys()) {
      if (!ids.has(id)) this.entries.delete(id);
    }
    for (const workspace of workspaces) {
      const previous = this.entries.get(workspace.id);
      const lastRefresh = previous?.workspace.path === workspace.path ? previous.lastRefresh : null;
      this.entries.set(workspace.id, {
        workspace,
        lastRefresh,
        dueAt: lastRefresh === null ? Date.now() : lastRefresh + this.interval(workspace.id),
      });
    }
    const selected = this.entries.get(selectedId ?? -1);
    if (selected && (previousSelectedId !== selectedId || previousSelectedPath !== selected.workspace.path)) {
      void this.request(selected.workspace, { force: true }).catch(() => undefined);
    }
    this.schedule();
  }

  /** Shared entry point for operations, completion, and future file watchers. */
  request(workspace: W, options: RefreshWorkspaceGitStatusOptions = {}): Promise<void> {
    if (this.disposed || !this.isCurrent(workspace)) return Promise.resolve();
    const existing = this.inFlight.get(workspace.id);
    if (existing) {
      if (options.force) {
        existing.pending = { workspace, options: { ...existing.pending?.options, ...options, force: true } };
      }
      return existing.promise;
    }
    const flight: InFlight<W> = { promise: Promise.resolve(), pending: null };
    this.inFlight.set(workspace.id, flight);
    flight.promise = Promise.resolve().then(async () => {
      let next: Request<W> | null = { workspace, options };
      let failure: unknown;
      while (next && !this.disposed) {
        const request = next;
        if (this.isCurrent(request.workspace)) {
          try {
            await this.options.refresh(request.workspace, request.options);
            failure = undefined;
          } catch (error) {
            failure = error;
          }
          const entry = this.entries.get(workspace.id);
          if (entry?.workspace.path === request.workspace.path) {
            entry.lastRefresh = Date.now();
            entry.dueAt = Date.now() + this.interval(workspace.id);
          }
        }
        next = flight.pending;
        flight.pending = null;
      }
      if (failure !== undefined) throw failure;
    }).finally(() => {
      this.inFlight.delete(workspace.id);
      this.schedule();
    });
    this.schedule();
    return flight.promise;
  }

  dispose() {
    this.disposed = true;
    this.clearTimer();
    this.unsubscribe();
    this.entries.clear();
    for (const flight of this.inFlight.values()) flight.pending = null;
  }

  private async resume(generation: number) {
    try {
      const selected = this.entries.get(this.selectedId ?? -1);
      // Explicitly invalidate even if a pre-hide poll is still in flight.
      if (selected) {
        await this.request(selected.workspace, { showLoading: false, force: true }).catch(() => undefined);
        if (this.disposed || !this.visible || generation !== this.visibilityGeneration) return;
        if (this.isCurrent(selected.workspace) && !this.options.shouldDefer()) {
          await this.options.refreshDirectories(selected.workspace).catch(() => undefined);
        }
      }
    } finally {
      if (generation === this.visibilityGeneration) {
        this.resuming = false;
        await this.poll();
      }
    }
  }

  private interval(id: number) {
    return id === this.selectedId ? ACTIVE_WORKSPACE_REFRESH_MS : INACTIVE_WORKSPACE_REFRESH_MS;
  }

  private isCurrent(workspace: W) {
    return this.entries.get(workspace.id)?.workspace.path === workspace.path;
  }

  private async poll() {
    if (this.polling || this.resuming || this.disposed || !this.visible) return;
    this.polling = true;
    try {
      const entries = [...this.entries.values()].sort((a, b) =>
        Number(b.workspace.id === this.selectedId) - Number(a.workspace.id === this.selectedId));
      for (const candidate of entries) {
        if (this.disposed || !this.visible || this.resuming) break;
        const entry = this.entries.get(candidate.workspace.id);
        if (!entry) continue;
        if (entry.dueAt > Date.now() || !this.isCurrent(entry.workspace)) continue;
        if (this.options.shouldDefer()) break;
        if (this.inFlight.has(entry.workspace.id)) continue;
        await this.request(entry.workspace, {
          showLoading: false,
          background: true,
        }).catch(() => undefined);
        if (!this.disposed && this.visible && this.isCurrent(entry.workspace) && !this.options.shouldDefer()) {
          await this.options.refreshDirectories(entry.workspace).catch(() => undefined);
        }
      }
    } finally {
      this.polling = false;
      this.schedule();
    }
  }

  private schedule() {
    this.clearTimer();
    if (this.disposed || !this.visible || this.polling || this.resuming) return;
    const due = [...this.entries.values()]
      .filter((entry) => !this.inFlight.has(entry.workspace.id))
      .map((entry) => entry.dueAt);
    if (due.length === 0) return;
    const delay = Math.max(0, Math.min(...due) - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.poll();
    }, delay === 0 && this.options.shouldDefer() ? INTERACTION_RETRY_MS : delay);
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
