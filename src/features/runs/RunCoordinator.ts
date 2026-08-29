export type RunLifecyclePhase =
  | "scheduled"
  | "preparing"
  | "connecting"
  | "persisting"
  | "preparing-interactions"
  | "starting-thread"
  | "starting-turn"
  | "active"
  | "completing"
  | "cancelling"
  | "rolling-back"
  | "completed"
  | "cancelled"
  | "failed";

export type RunLifecycleSnapshot = {
  runKey: string;
  phase: RunLifecyclePhase;
  revision: number;
  error: string | null;
  updatedAt: number;
};

const TERMINAL_PHASES = new Set<RunLifecyclePhase>([
  "completed",
  "cancelled",
  "failed",
]);

const ALLOWED_TRANSITIONS: Record<RunLifecyclePhase, ReadonlySet<RunLifecyclePhase>> = {
  scheduled: new Set(["preparing", "cancelling", "cancelled", "failed"]),
  preparing: new Set(["connecting", "persisting", "cancelling", "rolling-back", "failed"]),
  connecting: new Set(["persisting", "cancelling", "rolling-back", "failed"]),
  persisting: new Set(["preparing-interactions", "starting-thread", "cancelling", "rolling-back", "failed"]),
  "preparing-interactions": new Set(["starting-thread", "cancelling", "rolling-back", "failed"]),
  "starting-thread": new Set(["starting-turn", "cancelling", "rolling-back", "failed"]),
  "starting-turn": new Set(["active", "cancelling", "rolling-back", "failed"]),
  active: new Set(["completing", "cancelling", "rolling-back", "failed"]),
  completing: new Set(["completed", "rolling-back", "failed"]),
  cancelling: new Set(["rolling-back", "cancelled", "failed"]),
  "rolling-back": new Set(["cancelled", "failed"]),
  completed: new Set(),
  cancelled: new Set(),
  failed: new Set(),
};

export class RunCoordinator {
  private readonly snapshots = new Map<string, RunLifecycleSnapshot>();
  private readonly listeners = new Set<() => void>();

  begin(runKey: string) {
    const existing = this.snapshots.get(runKey);
    if (existing && !TERMINAL_PHASES.has(existing.phase)) {
      throw new Error(`Run ${runKey} is already coordinated.`);
    }
    return this.publish({
      runKey,
      phase: "scheduled",
      revision: (existing?.revision ?? 0) + 1,
      error: null,
      updatedAt: Date.now(),
    });
  }

  transition(runKey: string, phase: RunLifecyclePhase, error: string | null = null) {
    const current = this.snapshots.get(runKey);
    if (!current) throw new Error(`Run ${runKey} has not been registered.`);
    if (current.phase === phase && current.error === error) return current;
    if (!ALLOWED_TRANSITIONS[current.phase].has(phase)) {
      throw new Error(`Invalid run transition: ${current.phase} -> ${phase}.`);
    }
    return this.publish({
      ...current,
      phase,
      revision: current.revision + 1,
      error,
      updatedAt: Date.now(),
    });
  }

  tryTransition(runKey: string, phase: RunLifecyclePhase, error: string | null = null) {
    try {
      return this.transition(runKey, phase, error);
    } catch {
      return this.snapshots.get(runKey) ?? null;
    }
  }

  get(runKey: string) {
    return this.snapshots.get(runKey) ?? null;
  }

  getSnapshot = () => [...this.snapshots.values()];

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  remove(runKey: string) {
    if (!this.snapshots.delete(runKey)) return;
    this.emit();
  }

  dispose() {
    this.snapshots.clear();
    this.listeners.clear();
  }

  private publish(snapshot: RunLifecycleSnapshot) {
    this.snapshots.set(snapshot.runKey, snapshot);
    this.emit();
    return snapshot;
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}
