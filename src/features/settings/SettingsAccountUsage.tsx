import { RefreshCw, RotateCcw } from "lucide-react";
import { AnalyticsUsageLimits } from "../../components/AnalyticsUsageLimits";
import type { useCodexUsageLimitsController } from "../analytics/useCodexUsageLimitsController";
import { UsageResetDialog } from "./UsageResetDialog";

type UsageController = ReturnType<typeof useCodexUsageLimitsController>;
export type SettingsAccountUsageModel = UsageController["settingsModel"];
export type SettingsAccountUsageActions = UsageController["settingsActions"];

export function SettingsAccountUsage({
  model,
  actions,
  active,
}: {
  model: SettingsAccountUsageModel;
  actions: SettingsAccountUsageActions;
  active: boolean;
}) {
  const { state, reset } = model;
  const count = state.snapshot?.raw.rateLimitResetCredits?.availableCount;
  return (
    <>
      <section
        className="surface settings-panel settings-account-usage"
        id="settings-account-usage"
        aria-label="Account usage"
      >
        <AnalyticsUsageLimits
          title="Account usage"
          accounts={model.accounts}
          selectedAccountId={model.selectedAccountId}
          state={state}
          onAccountChange={actions.selectAccount}
          onRetry={actions.retry}
        />
        <div className="setting-row settings-usage-reset-row">
          <div>
            <strong>Earned usage resets</strong>
            <span>
              {state.status === "signed-out" || model.accounts.length === 0
                ? "Sign in to view earned resets."
                : state.status === "idle" || state.status === "loading"
                  ? "Loading available resets…"
                  : state.status !== "ready" || count === undefined
                    ? "Earned reset availability is unavailable."
                    : `${count} earned ${count === 1 ? "reset" : "resets"} available${state.stale ? " · Refresh to confirm availability" : ""}`}
            </span>
          </div>
          <div className="settings-usage-reset-actions">
            <button
              className="native-plan-icon-action"
              type="button"
              aria-label="Refresh account usage"
              data-tooltip="Refresh account usage"
              disabled={
                model.accounts.length === 0 ||
                state.status === "loading" ||
                state.refreshing ||
                reset.pending
              }
              onClick={actions.retry}
            >
              <RefreshCw
                size={15}
                className={state.refreshing ? "spin" : undefined}
                aria-hidden="true"
              />
            </button>
            <button
              className="settings-usage-reset-button"
              type="button"
              disabled={!reset.canReset}
              onClick={actions.requestReset}
            >
              <RotateCcw size={15} aria-hidden="true" />
              {reset.pending
                ? "Applying reset…"
                : reset.retrying
                  ? "Retry reset"
                  : "Use 1 reset"}
            </button>
          </div>
        </div>
        {reset.message ? (
          <p className="settings-usage-reset-message" role="status">
            {reset.message}
          </p>
        ) : null}
      </section>
      {active && reset.confirmation ? (
        <UsageResetDialog
          confirmation={reset.confirmation}
          canConfirm={reset.canConfirm}
          onCancel={actions.cancelReset}
          onConfirm={actions.confirmReset}
        />
      ) : null}
    </>
  );
}
