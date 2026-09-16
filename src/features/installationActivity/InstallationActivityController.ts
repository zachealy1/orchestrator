import { isTauri } from "@tauri-apps/api/core";
import { commands, type AnalyticsPreferences } from "../../generated/tauri";

type ActivityState = {
  enabled: boolean;
  available: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

type Dependencies = {
  available: () => boolean;
  preferences: () => Promise<AnalyticsPreferences>;
  setEnabled: (enabled: boolean) => Promise<AnalyticsPreferences>;
  record: () => Promise<void>;
  now: () => number;
  window: Window;
  document: Document;
};

export class InstallationActivityController {
  private state: ActivityState = {
    enabled: false, available: false, loading: true, saving: false, error: null,
  };
  private readonly listeners = new Set<() => void>();
  private started = false;
  private lastRecordedDay: string | null = null;
  private lastAttempt = -Infinity;
  private lastAttemptDay: string | null = null;
  private inFlight = false;
  private generation = 0;
  private initialization: Promise<void> | null = null;
  private readonly dependencies: Dependencies;

  constructor(dependencies: Partial<Dependencies> = {}) {
    this.dependencies = {
      available: isTauri,
      preferences: () => commands.analyticsGetPreferences(),
      setEnabled: (enabled) => commands.analyticsSetEnabled(enabled),
      record: async () => { await commands.analyticsRecordActivity(); },
      now: Date.now,
      window, document,
      ...dependencies,
    };
  }

  readonly getSnapshot = () => this.state;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(change: Partial<ActivityState>) {
    this.state = { ...this.state, ...change };
    this.listeners.forEach((listener) => listener());
  }

  start() {
    if (this.started) return;
    this.started = true;
    if (!this.dependencies.available()) {
      this.update({ loading: false });
      return;
    }
    const { window: target } = this.dependencies;
    target.addEventListener("focus", this.onFocus);
    for (const name of ["pointerdown", "keydown", "wheel"]) {
      target.addEventListener(name, this.onInteraction, { capture: true, passive: true });
    }
    // Reuse initialization during React Strict Mode's setup/cleanup/setup cycle.
    this.initialization ??= this.dependencies.preferences()
      .then((preferences) => { this.update({ ...preferences, loading: false, error: null }); })
      .catch(() => {
        this.initialization = null;
        this.update({ loading: false, error: "Activity settings could not be loaded." });
      });
    void this.initialization.then(() => { if (this.started) this.recordActivity(true); });
  }

  stop() {
    this.started = false;
    const { window: target } = this.dependencies;
    target.removeEventListener("focus", this.onFocus);
    for (const name of ["pointerdown", "keydown", "wheel"]) {
      target.removeEventListener(name, this.onInteraction, true);
    }
  }

  dispose() {
    this.stop();
    this.listeners.clear();
  }

  private readonly onFocus = (event: Event) => {
    if (event.isTrusted) this.recordActivity();
  };

  private readonly onInteraction = (event: Event) => {
    // Wheel represents user scrolling; DOM scroll can also be caused by transcript updates.
    if (event.isTrusted) this.recordActivity();
  };

  private recordActivity(initialOpening = false) {
    const { document: page, now, record } = this.dependencies;
    if (!this.started || !this.state.available || !this.state.enabled
        || this.state.loading || this.state.saving || page.visibilityState !== "visible"
        || (!initialOpening && !page.hasFocus()) || this.inFlight) return;
    const timestamp = now();
    const day = new Date(timestamp).toISOString().slice(0, 10);
    if (day === this.lastRecordedDay
        || (day === this.lastAttemptDay && timestamp >= this.lastAttempt && timestamp - this.lastAttempt < 60_000)) return;
    this.lastAttemptDay = day;
    this.lastAttempt = timestamp;
    this.inFlight = true;
    const generation = this.generation;
    void record().then(() => {
      if (generation === this.generation) this.lastRecordedDay = day;
    }).catch(() => {
      // The next user interaction can retry; telemetry never raises an application error.
    }).finally(() => { this.inFlight = false; });
  }

  readonly setEnabled = async (enabled: boolean) => {
    if (this.state.saving || !this.state.available) return;
    this.update({ saving: true, error: null });
    this.generation += 1;
    try {
      const preferences = await this.dependencies.setEnabled(enabled);
      this.lastRecordedDay = null;
      this.lastAttempt = -Infinity;
      this.update({ ...preferences, saving: false });
      if (enabled) this.recordActivity();
    } catch {
      this.update({ saving: false, error: "The activity setting could not be saved. Please try again." });
    }
  };
}
