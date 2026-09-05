import type {
  CodexPlanType,
  CodexProfileKey,
} from "../codex/types";

export type CodexRateLimitWindow = {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
};

export type CodexCreditsSnapshot = {
  hasCredits: boolean;
  unlimited: boolean;
  balance: string | null;
};

export type CodexSpendControlLimitSnapshot = {
  limit: string;
  used: string;
  remainingPercent: number;
  resetsAt: number;
};

export type CodexRateLimitReachedType =
  | "rate_limit_reached"
  | "workspace_owner_credits_depleted"
  | "workspace_member_credits_depleted"
  | "workspace_owner_usage_limit_reached"
  | "workspace_member_usage_limit_reached";

export type CodexRateLimitSnapshot = {
  limitId: string | null;
  limitName: string | null;
  primary: CodexRateLimitWindow | null;
  secondary: CodexRateLimitWindow | null;
  credits: CodexCreditsSnapshot | null;
  individualLimit: CodexSpendControlLimitSnapshot | null;
  spendControlReached: boolean | null;
  planType: CodexPlanType | null;
  rateLimitReachedType: CodexRateLimitReachedType | null;
};

export type CodexAccountRateLimitsResponse = {
  rateLimits: CodexRateLimitSnapshot;
  rateLimitsByLimitId: Record<string, CodexRateLimitSnapshot> | null;
  rateLimitResetCredits: unknown | null;
};

export type CodexUsageLimitPeriod =
  | "five-hour"
  | "daily"
  | "weekly"
  | "monthly"
  | "generic";

export type CodexUsageLimitBucket = {
  id: string;
  label: string;
  periodLabel: string;
  limitId: string | null;
  limitName: string | null;
  period: CodexUsageLimitPeriod;
  usedPercent: number;
  remainingPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
  usedCredits: string | null;
  limitCredits: string | null;
  reached: boolean;
};

export type CodexUsageLimitsSnapshot = {
  planType: CodexPlanType | null;
  managedPlan: boolean;
  hasIndividualLimit: boolean;
  buckets: CodexUsageLimitBucket[];
  credits: CodexCreditsSnapshot | null;
  rateLimitReachedType: CodexRateLimitReachedType | null;
  fetchedAt: number;
  raw: CodexAccountRateLimitsResponse;
};

export type AnalyticsUsageAccount = {
  accountId: number;
  profileKey: CodexProfileKey;
  label: string;
  planType: CodexPlanType | null;
};

export type CodexUsageLimitsLoadResult =
  | {
      kind: "ready";
      response: CodexAccountRateLimitsResponse;
      planType: CodexPlanType | null;
    }
  | { kind: "signed-out" }
  | { kind: "unsupported" };

export type CodexUsageLimitsAccountState = {
  status:
    | "idle"
    | "loading"
    | "ready"
    | "error"
    | "signed-out"
    | "unsupported";
  snapshot: CodexUsageLimitsSnapshot | null;
  refreshing: boolean;
  stale: boolean;
  error: string | null;
};

export const EMPTY_USAGE_LIMITS_STATE: CodexUsageLimitsAccountState = {
  status: "idle",
  snapshot: null,
  refreshing: false,
  stale: false,
  error: null,
};

const PLAN_TYPES = new Set<CodexPlanType>([
  "free",
  "go",
  "plus",
  "pro",
  "prolite",
  "team",
  "self_serve_business_prolite",
  "self_serve_business_usage_based",
  "business",
  "ent26",
  "enterprise_cbp_automation",
  "enterprise_cbp_usage_based",
  "enterprise",
  "edu",
  "edu_plus",
  "edu_pro",
  "unknown",
]);

const MANAGED_PLAN_TYPES = new Set<CodexPlanType>([
  "team",
  "self_serve_business_prolite",
  "self_serve_business_usage_based",
  "business",
  "ent26",
  "enterprise_cbp_automation",
  "enterprise_cbp_usage_based",
  "enterprise",
  "edu",
  "edu_plus",
  "edu_pro",
]);

const FIVE_HOURS_MINUTES = 300;
const DAY_MINUTES = 1_440;
const WEEK_MINUTES = 10_080;
const MONTH_MINUTES = 43_200;
const WINDOW_TOLERANCE = 0.05;
const RATE_LIMIT_REACHED_TYPES = new Set<CodexRateLimitReachedType>([
  "rate_limit_reached",
  "workspace_owner_credits_depleted",
  "workspace_member_credits_depleted",
  "workspace_owner_usage_limit_reached",
  "workspace_member_usage_limit_reached",
]);

export function isManagedCodexPlan(planType: CodexPlanType | null) {
  return planType !== null && MANAGED_PLAN_TYPES.has(planType);
}

export function readCodexAccountRateLimitsResponse(
  value: unknown,
): CodexAccountRateLimitsResponse | null {
  const object = readObject(value);
  const rateLimits = readCodexRateLimitSnapshot(object.rateLimits);
  if (!rateLimits) return null;

  const rawByLimitId = readObjectOrNull(object.rateLimitsByLimitId);
  const rateLimitsByLimitId = rawByLimitId
    ? Object.fromEntries(
        Object.entries(rawByLimitId).flatMap(([key, candidate]) => {
          const snapshot = readCodexRateLimitSnapshot(candidate);
          return snapshot ? [[key, snapshot]] : [];
        }),
      )
    : null;

  return {
    rateLimits,
    rateLimitsByLimitId,
    rateLimitResetCredits: object.rateLimitResetCredits ?? null,
  };
}

export function readCodexRateLimitSnapshot(
  value: unknown,
): CodexRateLimitSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as Record<string, unknown>;
  const planType = readString(object.planType);
  return {
    limitId: readString(object.limitId),
    limitName: readString(object.limitName),
    primary: readRateLimitWindow(object.primary),
    secondary: readRateLimitWindow(object.secondary),
    credits: readCreditsSnapshot(object.credits),
    individualLimit: readSpendControlLimit(object.individualLimit),
    spendControlReached:
      typeof object.spendControlReached === "boolean"
        ? object.spendControlReached
        : null,
    planType:
      planType && PLAN_TYPES.has(planType as CodexPlanType)
        ? (planType as CodexPlanType)
        : null,
    rateLimitReachedType: readRateLimitReachedType(
      object.rateLimitReachedType,
    ),
  };
}

export function mergeCodexRateLimitUpdate(
  current: CodexAccountRateLimitsResponse | null,
  update: CodexRateLimitSnapshot,
): CodexAccountRateLimitsResponse {
  if (!current) {
    return {
      rateLimits: update,
      rateLimitsByLimitId: update.limitId
        ? { [update.limitId]: update }
        : null,
      rateLimitResetCredits: null,
    };
  }

  const matchesDefault =
    !update.limitId ||
    !current.rateLimits.limitId ||
    update.limitId === current.rateLimits.limitId;
  const rateLimits = matchesDefault
    ? mergeRateLimitSnapshot(current.rateLimits, update)
    : current.rateLimits;
  const rateLimitsByLimitId = current.rateLimitsByLimitId
    ? { ...current.rateLimitsByLimitId }
    : {};

  if (update.limitId) {
    rateLimitsByLimitId[update.limitId] = mergeRateLimitSnapshot(
      rateLimitsByLimitId[update.limitId] ?? null,
      update,
    );
  }

  return {
    ...current,
    rateLimits,
    rateLimitsByLimitId:
      Object.keys(rateLimitsByLimitId).length > 0
        ? rateLimitsByLimitId
        : current.rateLimitsByLimitId,
  };
}

export function normalizeCodexUsageLimits(
  response: CodexAccountRateLimitsResponse,
  fallbackPlanType: CodexPlanType | null = null,
  fetchedAt = Date.now(),
): CodexUsageLimitsSnapshot {
  const snapshots = collectSnapshots(response);
  const planType =
    snapshots.find((snapshot) => snapshot.planType)?.planType ??
    fallbackPlanType;
  const credits =
    response.rateLimits.credits ??
    snapshots.find((snapshot) => snapshot.credits)?.credits ??
    null;
  const rateLimitReachedType =
    snapshots.find((snapshot) => snapshot.rateLimitReachedType)
      ?.rateLimitReachedType ?? null;

  let monthlyBucket: CodexUsageLimitBucket | null = null;
  const rollingBuckets: CodexUsageLimitBucket[] = [];

  snapshots.forEach((snapshot, snapshotIndex) => {
    const snapshotKey = snapshot.limitId ?? `default-${snapshotIndex}`;
    if (snapshot.individualLimit && monthlyBucket === null) {
      const limit = snapshot.individualLimit;
      const remainingPercent = clampPercent(limit.remainingPercent);
      monthlyBucket = {
        id: `${snapshotKey}:individual-monthly`,
        label: "Monthly usage limit",
        periodLabel: "Monthly usage limit",
        limitId: snapshot.limitId,
        limitName: snapshot.limitName,
        period: "monthly",
        usedPercent: clampPercent(100 - remainingPercent),
        remainingPercent,
        windowDurationMins: MONTH_MINUTES,
        resetsAt: limit.resetsAt,
        usedCredits: limit.used,
        limitCredits: limit.limit,
        reached:
          snapshot.spendControlReached === true || remainingPercent <= 0,
      };
    }

    (["primary", "secondary"] as const).forEach((source) => {
      const window = snapshot[source];
      if (!window) return;
      const period = classifyUsageLimitPeriod(window.windowDurationMins);
      if (period === "monthly" && monthlyBucket !== null) return;

      const usedPercent = clampPercent(window.usedPercent);
      const periodLabel = usageLimitPeriodLabel(
        period,
        window.windowDurationMins,
      );
      const label = snapshot.limitName
        ? `${snapshot.limitName} · ${periodLabel}`
        : periodLabel;
      rollingBuckets.push({
        id: `${snapshotKey}:${source}:${window.windowDurationMins ?? "unknown"}`,
        label,
        periodLabel,
        limitId: snapshot.limitId,
        limitName: snapshot.limitName,
        period,
        usedPercent,
        remainingPercent: clampPercent(100 - usedPercent),
        windowDurationMins: window.windowDurationMins,
        resetsAt: window.resetsAt,
        usedCredits: null,
        limitCredits: null,
        reached:
          usedPercent >= 100 ||
          snapshot.rateLimitReachedType !== null ||
          snapshot.spendControlReached === true,
      });
    });
  });

  const deduplicatedRollingBuckets = rollingBuckets.filter(
    (bucket, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.limitId === bucket.limitId &&
          candidate.period === bucket.period &&
          candidate.usedPercent === bucket.usedPercent &&
          candidate.resetsAt === bucket.resetsAt,
      ) === index,
  );

  return {
    planType,
    managedPlan: isManagedCodexPlan(planType),
    hasIndividualLimit: snapshots.some(
      (snapshot) => snapshot.individualLimit !== null,
    ),
    buckets: [
      ...(monthlyBucket ? [monthlyBucket] : []),
      ...deduplicatedRollingBuckets,
    ],
    credits,
    rateLimitReachedType,
    fetchedAt,
    raw: response,
  };
}

export function classifyUsageLimitPeriod(
  windowDurationMins: number | null,
): CodexUsageLimitPeriod {
  if (approximately(windowDurationMins, MONTH_MINUTES)) return "monthly";
  if (approximately(windowDurationMins, FIVE_HOURS_MINUTES)) return "five-hour";
  if (approximately(windowDurationMins, WEEK_MINUTES)) return "weekly";
  if (approximately(windowDurationMins, DAY_MINUTES)) return "daily";
  return "generic";
}

function usageLimitPeriodLabel(
  period: CodexUsageLimitPeriod,
  windowDurationMins: number | null,
) {
  switch (period) {
    case "monthly":
      return "Monthly usage limit";
    case "five-hour":
      return "5-hour usage limit";
    case "daily":
      return "Daily usage limit";
    case "weekly":
      return "Weekly usage limit";
    default:
      return windowDurationMins && windowDurationMins > 0
        ? `${formatWindowDuration(windowDurationMins)} usage limit`
        : "Usage limit";
  }
}

function formatWindowDuration(minutes: number) {
  if (minutes % DAY_MINUTES === 0) {
    const days = minutes / DAY_MINUTES;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function collectSnapshots(response: CodexAccountRateLimitsResponse) {
  const byLimitId = Object.entries(response.rateLimitsByLimitId ?? {}).map(
    ([key, snapshot]) => ({
      ...snapshot,
      limitId: snapshot.limitId ?? key,
    }),
  );
  const defaultLimitId = response.rateLimits.limitId;
  const includesDefault = byLimitId.some(
    (snapshot) =>
      (defaultLimitId !== null && snapshot.limitId === defaultLimitId) ||
      rateLimitSnapshotsEquivalent(snapshot, response.rateLimits),
  );
  const snapshots = includesDefault
    ? byLimitId
    : [response.rateLimits, ...byLimitId];
  return snapshots.sort((left, right) => {
    const leftNamed = left.limitName ? 1 : 0;
    const rightNamed = right.limitName ? 1 : 0;
    return leftNamed - rightNamed;
  });
}

function rateLimitSnapshotsEquivalent(
  left: CodexRateLimitSnapshot,
  right: CodexRateLimitSnapshot,
) {
  return JSON.stringify({ ...left, limitId: null }) ===
    JSON.stringify({ ...right, limitId: null });
}

function mergeRateLimitSnapshot(
  current: CodexRateLimitSnapshot | null,
  update: CodexRateLimitSnapshot,
): CodexRateLimitSnapshot {
  if (!current) return update;
  return {
    limitId: update.limitId ?? current.limitId,
    limitName: update.limitName ?? current.limitName,
    primary: update.primary ?? current.primary,
    secondary: update.secondary ?? current.secondary,
    credits: update.credits ?? current.credits,
    individualLimit: update.individualLimit ?? current.individualLimit,
    spendControlReached:
      update.spendControlReached ?? current.spendControlReached,
    planType: update.planType ?? current.planType,
    rateLimitReachedType:
      update.rateLimitReachedType ?? current.rateLimitReachedType,
  };
}

function readRateLimitWindow(value: unknown): CodexRateLimitWindow | null {
  const object = readObjectOrNull(value);
  if (!object) return null;
  const usedPercent = readFiniteNumber(object.usedPercent);
  if (usedPercent === null) return null;
  return {
    usedPercent,
    windowDurationMins: readFiniteNumber(object.windowDurationMins),
    resetsAt: readFiniteNumber(object.resetsAt),
  };
}

function readCreditsSnapshot(value: unknown): CodexCreditsSnapshot | null {
  const object = readObjectOrNull(value);
  if (!object) return null;
  return {
    hasCredits: object.hasCredits === true,
    unlimited: object.unlimited === true,
    balance: readString(object.balance),
  };
}

function readSpendControlLimit(
  value: unknown,
): CodexSpendControlLimitSnapshot | null {
  const object = readObjectOrNull(value);
  if (!object) return null;
  const limit = readString(object.limit);
  const used = readString(object.used);
  const remainingPercent = readFiniteNumber(object.remainingPercent);
  const resetsAt = readFiniteNumber(object.resetsAt);
  if (
    limit === null ||
    used === null ||
    remainingPercent === null ||
    resetsAt === null
  ) {
    return null;
  }
  return { limit, used, remainingPercent, resetsAt };
}

function approximately(value: number | null, target: number) {
  return (
    value !== null &&
    value > 0 &&
    Math.abs(value - target) <= target * WINDOW_TOLERANCE
  );
}

function clampPercent(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function readObject(value: unknown): Record<string, unknown> {
  return readObjectOrNull(value) ?? {};
}

function readObjectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readRateLimitReachedType(value: unknown) {
  return typeof value === "string" &&
    RATE_LIMIT_REACHED_TYPES.has(value as CodexRateLimitReachedType)
    ? (value as CodexRateLimitReachedType)
    : null;
}

function readFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
