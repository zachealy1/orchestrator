import {
  AlertCircle,
  Gauge,
  RefreshCw,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useId } from "react";
import { formatCodexPlanType } from "../lib/codexAuth";
import type {
  AnalyticsUsageAccount,
  CodexUsageLimitBucket,
  CodexUsageLimitsAccountState,
} from "../features/analytics/usageLimits";
import { isManagedCodexPlan } from "../features/analytics/usageLimits";
import { ComposerSelect } from "./ComposerSelect";

type Props = {
  title?: string;
  accounts: AnalyticsUsageAccount[];
  selectedAccountId: number | null;
  state: CodexUsageLimitsAccountState;
  onAccountChange: (accountId: number) => void;
  onRetry: () => void;
};

export function AnalyticsUsageLimits({
  accounts,
  selectedAccountId,
  state,
  onAccountChange,
  onRetry,
  title = "Usage limits",
}: Props) {
  const titleId = useId();
  const selectedAccount =
    accounts.find((account) => account.accountId === selectedAccountId) ?? null;
  const snapshot = state.snapshot;
  const planType = snapshot?.planType ?? selectedAccount?.planType ?? null;
  const managedPlan =
    snapshot?.managedPlan ?? isManagedCodexPlan(selectedAccount?.planType ?? null);
  const sectionTitle = managedPlan ? "Plan limits" : "General usage limits";
  const options = accounts.map((account) => ({
    value: String(account.accountId),
    label: account.label,
  }));

  return (
    <article
      className="analytics-card analytics-usage-card"
      aria-labelledby={titleId}
      aria-busy={state.status === "loading" || state.refreshing}
    >
      <div className="analytics-usage-header">
        <div className="analytics-card-header">
          <span className="analytics-usage-heading-icon" aria-hidden="true">
            <Gauge size={20} />
          </span>
          <div>
            <div className="analytics-usage-title-line">
              <h2 id={titleId}>{title}</h2>
              {planType ? (
                <span className="analytics-usage-plan-badge">
                  {formatCodexPlanType(planType)}
                </span>
              ) : null}
            </div>
            <p>Account-level usage reported directly by Codex</p>
          </div>
        </div>
        <ComposerSelect
          ariaLabel="Usage account"
          className="analytics-usage-account-select analytics-date-select"
          menuClassName="analytics-usage-account-menu"
          value={selectedAccountId === null ? "" : String(selectedAccountId)}
          options={options}
          placeholder="Choose an account"
          icon={<UserRound size={17} />}
          disabled={accounts.length === 0}
          onChange={(value) => onAccountChange(Number(value))}
        />
      </div>

      <div className="analytics-usage-content">
        {accounts.length === 0 ? (
          <UsageMessage
            title="No Codex account is signed in"
            detail="Sign in from Settings to view usage limits."
          />
        ) : state.status === "loading" || state.status === "idle" ? (
          <UsageLoading />
        ) : state.status === "signed-out" ? (
          <UsageMessage
            title="This account is signed out"
            detail="Sign in again from Settings to refresh its usage limits."
          />
        ) : state.status === "unsupported" ? (
          <UsageMessage
            title="Usage limits are unavailable for this account"
            detail="Codex usage limits require a ChatGPT-backed Codex account."
          />
        ) : state.status === "error" ? (
          <UsageError message={state.error} onRetry={onRetry} />
        ) : snapshot ? (
          <>
            <h3 className="analytics-usage-section-title">{sectionTitle}</h3>
            {snapshot.rateLimitReachedType ||
            snapshot.buckets.some((bucket) => bucket.reached) ? (
              <div className="analytics-usage-warning" role="status">
                <AlertCircle size={16} aria-hidden="true" />
                <span>A Codex usage limit has been reached for this account.</span>
              </div>
            ) : null}
            {managedPlan && !snapshot.hasIndividualLimit ? (
              <div className="analytics-usage-admin-note">
                Your admin hasn’t set a usage limit.
              </div>
            ) : null}
            {snapshot.buckets.length > 0 ? (
              <div className="analytics-usage-rows">
                {snapshot.buckets.map((bucket) => (
                  <UsageLimitRow bucket={bucket} key={bucket.id} />
                ))}
              </div>
            ) : (
              <UsageMessage
                title="No usage limits reported"
                detail="Codex did not return a usage window for this account."
              />
            )}
            <UsageFooter state={state} onRetry={onRetry} />
          </>
        ) : null}
      </div>
    </article>
  );
}

function UsageLimitRow({ bucket }: { bucket: CodexUsageLimitBucket }) {
  const exactUsage =
    bucket.usedCredits !== null && bucket.limitCredits !== null
      ? `${formatCredits(bucket.usedCredits)} of ${formatCredits(bucket.limitCredits)} credits used`
      : null;
  const resetLabel = formatResetTime(bucket.resetsAt, bucket.period);
  return (
    <div
      className={`analytics-usage-row${bucket.reached ? " limit-reached" : ""}`}
    >
      <div className="analytics-usage-row-copy">
        <strong>{bucket.label}</strong>
        {exactUsage || resetLabel ? (
          <span>
            {[exactUsage, resetLabel].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </div>
      <div className="analytics-usage-progress-wrap">
        <progress
          max={100}
          value={bucket.usedPercent}
          aria-label={`${bucket.label}: ${Math.round(bucket.remainingPercent)}% remaining`}
          aria-valuetext={`${Math.round(bucket.remainingPercent)}% remaining`}
        />
        <span>{Math.round(bucket.remainingPercent)}% remaining</span>
      </div>
    </div>
  );
}

function UsageLoading() {
  return (
    <div className="analytics-usage-loading" aria-label="Loading usage limits">
      <span />
      <span />
    </div>
  );
}

function UsageMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="analytics-usage-message">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function UsageError({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="analytics-usage-error" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <strong>Could not load usage limits</strong>
        <span>{message ?? "Try again in a moment."}</span>
      </div>
      <button type="button" onClick={onRetry}>
        <RefreshCw size={15} aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}

function UsageFooter({
  state,
  onRetry,
}: {
  state: CodexUsageLimitsAccountState;
  onRetry: () => void;
}) {
  const credits = state.snapshot?.credits;
  if (!credits && !state.stale && !state.refreshing) return null;
  return (
    <div className="analytics-usage-footer">
      {credits ? (
        <span className="analytics-usage-credits">
          <WalletCards size={15} aria-hidden="true" />
          {credits.unlimited
            ? "Unlimited credits"
            : credits.hasCredits && credits.balance !== null
              ? `${formatCredits(credits.balance)} credits available`
              : "No additional credits available"}
        </span>
      ) : (
        <span />
      )}
      {state.stale ? (
        <button type="button" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" />
          Refresh failed — retry
        </button>
      ) : state.refreshing ? (
        <span className="analytics-usage-refreshing">
          <RefreshCw size={14} aria-hidden="true" />
          Refreshing
        </span>
      ) : null}
    </div>
  );
}

function formatCredits(value: string) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? numericValue.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : value;
}

function formatResetTime(
  resetsAt: number | null,
  period: CodexUsageLimitBucket["period"],
) {
  if (resetsAt === null) return null;
  const resetDate = new Date(resetsAt * 1_000);
  if (Number.isNaN(resetDate.getTime())) return null;
  if (period === "weekly" || period === "monthly") {
    return `Resets ${resetDate.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    })}`;
  }
  const remainingMs = resetDate.getTime() - Date.now();
  if (remainingMs <= 0) return "Reset due now";
  const remainingMinutes = Math.ceil(remainingMs / 60_000);
  if (remainingMinutes < 60) return `Resets in ${remainingMinutes} min`;
  const remainingHours = Math.ceil(remainingMinutes / 60);
  return `Resets in ${remainingHours} hr`;
}
