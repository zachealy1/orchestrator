import type { RunViewState } from "./codexEventReducer";

export type RunPlanStepStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "paused"
  | "blocked"
  | "failed"
  | "cancelled"
  | "unknown";

export type RunPlanStep = {
  step: string;
  status: RunPlanStepStatus;
};

export type RunPlanProgress = {
  steps: RunPlanStep[];
};

export type PlanProgressIndicatorState =
  | "in-progress"
  | "paused"
  | "waiting-approval"
  | "blocked"
  | "failed";

export type PlanProgressIndicatorModel = {
  currentStep: number;
  totalSteps: number;
  completedSteps: number;
  progressPercent: number;
  stepLabel: string;
  state: PlanProgressIndicatorState;
};

export function parseRunPlanProgress(value: unknown): RunPlanProgress | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  return {
    steps: value.map((candidate) => {
      const step = readObject(candidate);
      return {
        step: readString(step.step)?.trim() ?? "",
        status: normalizePlanStepStatus(readString(step.status)),
      };
    }),
  };
}

export function derivePlanProgressIndicator(
  runView: RunViewState | null,
): PlanProgressIndicatorModel | null {
  const steps = runView?.planProgress?.steps ?? [];
  if (!runView || steps.length < 2) return null;
  if (
    runView.nativePlan.phase === "cancelling" ||
    runView.nativePlan.phase === "cancelled" ||
    runView.status === "idle" ||
    runView.status === "completed" ||
    runView.status === "interrupted"
  ) {
    return null;
  }

  const completedSteps = steps.filter(
    (step) => step.status === "completed",
  ).length;
  const unfinishedSteps = steps.filter(
    (step) => step.status !== "completed" && step.status !== "cancelled",
  );
  if (unfinishedSteps.length === 0) return null;

  const currentIndex = findCurrentStepIndex(steps);
  if (currentIndex < 0) return null;

  const state = deriveIndicatorState(runView, steps[currentIndex]?.status);
  if (!state) return null;

  return {
    currentStep: currentIndex + 1,
    totalSteps: steps.length,
    completedSteps,
    progressPercent: Math.round((completedSteps / steps.length) * 100),
    stepLabel: steps[currentIndex]?.step ?? "",
    state,
  };
}

function deriveIndicatorState(
  runView: RunViewState,
  currentStatus: RunPlanStepStatus | undefined,
): PlanProgressIndicatorState | null {
  if (
    runView.status === "failed" ||
    runView.nativePlan.phase === "failed" ||
    currentStatus === "failed"
  ) {
    return "failed";
  }

  const waitingForApproval =
    runView.nativePlan.threadActiveFlags.includes("waitingOnApproval") ||
    runView.approvalRequests.some((request) => request.status !== "stale");
  if (waitingForApproval) return "waiting-approval";

  const blocked =
    currentStatus === "blocked" ||
    runView.nativePlan.phase === "awaiting-clarification" ||
    runView.nativePlan.threadActiveFlags.includes("waitingOnUserInput") ||
    runView.serverRequests.length > 0;
  if (blocked) return "blocked";

  if (currentStatus === "paused") return "paused";
  if (runView.status === "connecting" || runView.status === "running") {
    return "in-progress";
  }
  return null;
}

function findCurrentStepIndex(steps: RunPlanStep[]) {
  const priorities: RunPlanStepStatus[][] = [
    ["in_progress"],
    ["failed", "blocked", "paused"],
    ["pending"],
  ];
  for (const statuses of priorities) {
    const index = steps.findIndex((step) => statuses.includes(step.status));
    if (index >= 0) return index;
  }
  return -1;
}

function normalizePlanStepStatus(value: string | null): RunPlanStepStatus {
  switch (value?.trim().toLowerCase().replace(/-/g, "_")) {
    case "pending":
    case "not_started":
    case "notstarted":
      return "pending";
    case "in_progress":
    case "inprogress":
    case "running":
      return "in_progress";
    case "completed":
    case "complete":
      return "completed";
    case "paused":
      return "paused";
    case "blocked":
      return "blocked";
    case "failed":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "unknown";
  }
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}
