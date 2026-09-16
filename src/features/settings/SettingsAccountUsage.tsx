import { Loader2, RefreshCw, RotateCcw, Ticket } from "lucide-react";
import { AnalyticsUsageLimits } from "../../components/AnalyticsUsageLimits";
import type { useCodexUsageLimitsController } from "../analytics/useCodexUsageLimitsController";
import { UsageResetDialog } from "./UsageResetDialog";
import { usageResetExpiry, usageResetTitle } from "./usageResetPresentation";

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
  const available = state.snapshot?.raw.rateLimitResetCredits;
  const count = available?.availableCount;
  const credits = state.status === "ready" && (count ?? 0) > 0
    ? (available?.credits ?? []).filter((credit) => credit.status === "available")
        .sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity))
    : [];
  const missingDetails = state.status === "ready" && (count ?? 0) > credits.length;
  const retryOutsideList = reset.retrying && !credits.some((credit) => credit.id === reset.retryCredit?.id);
  const refreshing = state.refreshing || state.status === "loading";
  return (
    <>
      <section
        className="surface settings-panel settings-account-usage"
        id="settings-account-usage"
        aria-label="Account usage"
      >
        <AnalyticsUsageLimits
          title="Account usage"
          showRefreshingIndicator={false}
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
              className="settings-icon-action"
              type="button"
              aria-label="Refresh account usage"
              aria-busy={refreshing}
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
                size={16}
                className={refreshing ? "spin" : undefined}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
        {credits.length > 0 ? (
          <ul className="settings-usage-reset-list" aria-label="Earned usage resets">
            {credits.map((credit) => {
              const expiry = usageResetExpiry(credit);
              const retrying = reset.retrying && reset.retryCredit?.id === credit.id;
              const pending = reset.pending && reset.confirmation?.credit?.id === credit.id;
              const expired = credit.expiresAt !== null && credit.expiresAt * 1_000 <= Date.now();
              const actionLabel = pending ? "Applying reset" : retrying ? "Retry reset" : "Use reset";
              return <li className="settings-usage-reset-entry" key={credit.id}>
                <span className="settings-usage-reset-icon" aria-hidden="true">
                  <Ticket size={20} />
                </span>
                <div className="settings-usage-reset-copy">
                  <strong>{usageResetTitle(credit)}</strong>
                  <span>{expiry}{expired ? " · Expired" : ""}</span>
                </div>
                <button
                  className="settings-icon-action"
                  type="button"
                  aria-label={`${actionLabel}: ${usageResetTitle(credit)} · ${expiry}`}
                  data-tooltip={actionLabel}
                  disabled={!reset.canReset || (!retrying && (expired || reset.retrying))}
                  onClick={() => actions.requestReset(credit.id)}
                >
                  {pending ? <Loader2 className="spin" size={16} aria-hidden="true" />
                    : <RotateCcw size={16} aria-hidden="true" />}
                </button>
              </li>;
            })}
          </ul>
        ) : null}
        {missingDetails || retryOutsideList ? (
          <div className="setting-row settings-usage-reset-fallback">
            <div>
              <strong>{retryOutsideList ? "Unconfirmed reset" : "Reset details unavailable"}</strong>
              <span>{retryOutsideList
                ? "Retry to check the previous reset request."
                : credits.length > 0
                  ? "Expiry dates are unavailable for the remaining resets."
                  : "Expiry dates are unavailable for this account’s resets."}</span>
            </div>
            <button
              className="settings-icon-action"
              type="button"
              aria-label={retryOutsideList ? "Retry reset" : "Use reset"}
              data-tooltip={retryOutsideList ? "Retry reset" : "Use reset"}
              disabled={!reset.canReset || (reset.retrying && !retryOutsideList)}
              onClick={() => actions.requestReset()}
            >
              <RotateCcw size={16} aria-hidden="true" />
            </button>
          </div>
        ) : null}
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
