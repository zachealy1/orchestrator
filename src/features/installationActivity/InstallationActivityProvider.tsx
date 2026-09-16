import { Shield } from "lucide-react";
import { createContext, useContext, useEffect, useSyncExternalStore, type PropsWithChildren } from "react";
import type { InstallationActivityController } from "./InstallationActivityController";

const ActivityContext = createContext<InstallationActivityController | null>(null);

export function InstallationActivityProvider({
  controller, children,
}: PropsWithChildren<{ controller: InstallationActivityController }>) {
  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);
  return <ActivityContext.Provider value={controller}>{children}</ActivityContext.Provider>;
}

export function InstallationActivitySettings() {
  const controller = useContext(ActivityContext);
  return controller ? <ActivitySettings controller={controller} /> : null;
}

function ActivitySettings({ controller }: { controller: InstallationActivityController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return (
    <section className="surface settings-panel" aria-label="Privacy settings" id="settings-privacy">
      <div className="surface-header settings-detail-header">
        <div className="settings-detail-heading">
          <span className="settings-detail-header-icon" aria-hidden="true"><Shield size={20} /></span>
          <div className="settings-detail-header-copy"><h2>Privacy</h2></div>
        </div>
      </div>
      <div className="setting-list">
        <div className="setting-row">
          <div>
            <strong>Share installation activity</strong>
            <span id="installation-activity-description">
              Send a random installation ID, app version, and the first activity date each day to PostHog.
              Prompts, files, and account details are never included. Turning this off stops future sharing;
              previously shared events remain.
            </span>
            {!state.loading && !state.available ? <span>Activity sharing is unavailable in this build.</span> : null}
          </div>
          <label className="settings-switch">
            <input type="checkbox" aria-label="Share installation activity"
              aria-describedby="installation-activity-description"
              checked={state.available && state.enabled}
              disabled={state.loading || state.saving || !state.available}
              onChange={(event) => void controller.setEnabled(event.currentTarget.checked)} />
            <span aria-hidden="true" />
          </label>
        </div>
        {state.error ? <p role="alert">{state.error}</p> : null}
      </div>
    </section>
  );
}
