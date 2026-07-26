export type ThreadGoalStatus =
  | "active"
  | "paused"
  | "blocked"
  | "usageLimited"
  | "budgetLimited"
  | "complete";

export type ThreadGoalState = {
  threadId: string;
  objective: string;
  status: ThreadGoalStatus;
  timeUsedSeconds: number;
  observedAtMs: number;
};

export type GoalProgressAction =
  | "pausing"
  | "resuming"
  | "stopping"
  | "editing";

export type GoalProgressIndicatorModel = ThreadGoalState & {
  actionPending: GoalProgressAction | null;
};

export type ThreadGoalSetResponse = {
  goal: unknown;
};

export function parseThreadGoal(
  value: unknown,
  options: {
    observedAtMs?: number;
    fallbackThreadId?: string | null;
  } = {},
): ThreadGoalState | null {
  const goal = readObject(value);
  const threadId =
    readString(goal.threadId) ?? options.fallbackThreadId?.trim() ?? "";
  const objective = readString(goal.objective)?.trim() ?? "";
  const status = parseThreadGoalStatus(goal.status);
  const timeUsedSeconds = readFiniteNumber(goal.timeUsedSeconds);

  if (
    !threadId ||
    !objective ||
    !status ||
    timeUsedSeconds === null ||
    timeUsedSeconds < 0
  ) {
    return null;
  }

  return {
    threadId,
    objective,
    status,
    timeUsedSeconds,
    observedAtMs: options.observedAtMs ?? Date.now(),
  };
}

export function parseThreadGoalStatus(value: unknown): ThreadGoalStatus | null {
  return value === "active" ||
    value === "paused" ||
    value === "blocked" ||
    value === "usageLimited" ||
    value === "budgetLimited" ||
    value === "complete"
    ? value
    : null;
}

export function deriveGoalProgressIndicator(
  goal: ThreadGoalState | null,
  actionPending: GoalProgressAction | null,
): GoalProgressIndicatorModel | null {
  if (!goal || goal.status === "complete") return null;
  return { ...goal, actionPending };
}

export function goalKeepsRunOpen(goal: ThreadGoalState | null) {
  return Boolean(goal && goal.status !== "complete");
}

export function goalElapsedSeconds(
  goal: ThreadGoalState,
  nowMs: number,
) {
  if (goal.status !== "active") {
    return Math.floor(goal.timeUsedSeconds);
  }
  return Math.floor(
    goal.timeUsedSeconds + Math.max(0, nowMs - goal.observedAtMs) / 1000,
  );
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
