import type { RunIntent } from "./nativePlanMode";

export type WorkspaceCommitIntentContext = {
  objective: string | null;
  approvedPlan: string | null;
  implementationOutcome: string | null;
};

type CommitIntentEntry = {
  prompt: string;
  runView: {
    finalMessage: string;
    latestPlan: string;
    nativePlan: {
      intent: RunIntent;
      completedText: string;
    };
  };
};

const MAX_OBJECTIVE_CHARACTERS = 2_000;
const MAX_APPROVED_PLAN_CHARACTERS = 8_000;
const MAX_IMPLEMENTATION_OUTCOME_CHARACTERS = 4_000;

function boundedCommitContext(value: string, limit: number) {
  const normalized = value.trim();
  if (normalized.length <= limit) {
    return normalized || null;
  }
  return `${normalized.slice(0, limit - 3).trimEnd()}...`;
}

function completedPlan(entry: CommitIntentEntry) {
  return entry.runView.nativePlan.completedText.trim() ||
    entry.runView.latestPlan.trim();
}

function findLastEntryIndex(
  entries: CommitIntentEntry[],
  predicate: (entry: CommitIntentEntry, index: number) => boolean,
) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (predicate(entries[index], index)) {
      return index;
    }
  }
  return -1;
}

function findPlanObjectiveIndex(
  entries: CommitIntentEntry[],
  planIndex: number,
) {
  for (let index = planIndex; index >= 0; index -= 1) {
    const intent = entries[index].runView.nativePlan.intent;
    if (intent === "plan") {
      return index;
    }
    if (intent !== "plan-revision") {
      break;
    }
  }
  return -1;
}

export function buildCommitIntentContext(
  entries: CommitIntentEntry[],
): WorkspaceCommitIntentContext | null {
  const latestIndex = findLastEntryIndex(
    entries,
    (entry) =>
      entry.prompt.trim().length > 0 ||
      entry.runView.finalMessage.trim().length > 0 ||
      completedPlan(entry).length > 0,
  );
  if (latestIndex < 0) {
    return null;
  }

  const latestEntry = entries[latestIndex];
  const latestIntent = latestEntry.runView.nativePlan.intent;
  let objective = "";
  let approvedPlan = "";
  let implementationOutcome = latestEntry.runView.finalMessage;

  if (latestIntent === "plan-implementation") {
    const planIndex = findLastEntryIndex(
      entries,
      (entry, index) =>
        index < latestIndex &&
        (entry.runView.nativePlan.intent === "plan" ||
          entry.runView.nativePlan.intent === "plan-revision") &&
        completedPlan(entry).length > 0,
    );
    if (planIndex >= 0) {
      const objectiveIndex = findPlanObjectiveIndex(entries, planIndex);
      objective =
        objectiveIndex >= 0 ? entries[objectiveIndex].prompt : "";
      approvedPlan = completedPlan(entries[planIndex]);
    }
  } else if (latestIntent === "plan" || latestIntent === "plan-revision") {
    const objectiveIndex = findPlanObjectiveIndex(entries, latestIndex);
    objective =
      objectiveIndex >= 0
        ? entries[objectiveIndex].prompt
        : latestIntent === "plan"
          ? latestEntry.prompt
          : "";
    approvedPlan = completedPlan(latestEntry);
    implementationOutcome = "";
  } else {
    objective = latestEntry.prompt;
  }

  const context = {
    objective: boundedCommitContext(objective, MAX_OBJECTIVE_CHARACTERS),
    approvedPlan: boundedCommitContext(
      approvedPlan,
      MAX_APPROVED_PLAN_CHARACTERS,
    ),
    implementationOutcome: boundedCommitContext(
      implementationOutcome,
      MAX_IMPLEMENTATION_OUTCOME_CHARACTERS,
    ),
  };

  return context.objective ||
    context.approvedPlan ||
    context.implementationOutcome
    ? context
    : null;
}
