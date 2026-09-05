import {
  recoveredToolActivityLabel,
  toolActivityRetryKey,
  type RunToolActivity,
} from "./toolActivity";

type ToolActivityMap = Record<string, RunToolActivity>;

export function recoverRetriedToolFailures(
  currentById: ToolActivityMap,
  currentOrder: string[],
) {
  const ordered = currentOrder
    .map((id, index) => {
      const activity = currentById[id];
      return activity ? { activity, index } : null;
    })
    .filter(
      (entry): entry is { activity: RunToolActivity; index: number } =>
        entry !== null,
    )
    .sort(
      (left, right) =>
        (left.activity.sequence ?? left.index) -
          (right.activity.sequence ?? right.index) ||
        left.index - right.index,
    );
  const pendingFailures = new Map<string, string[]>();
  let nextById = currentById;

  for (const { activity } of ordered) {
    const retryKey = toolActivityRetryKey(activity);
    if (!retryKey) continue;
    if (activity.status === "failed") {
      const failures = pendingFailures.get(retryKey) ?? [];
      pendingFailures.set(retryKey, [...failures, activity.id]);
      continue;
    }
    if (activity.status !== "completed") continue;

    const failures = pendingFailures.get(retryKey) ?? [];
    if (failures.length === 0) continue;
    if (nextById === currentById) nextById = { ...currentById };
    for (const id of failures) {
      const failed = nextById[id];
      if (!failed || failed.status !== "failed") continue;
      nextById[id] = {
        ...failed,
        label: recoveredToolActivityLabel(failed.label),
        status: "recovered",
      };
    }
    pendingFailures.delete(retryKey);
  }

  return nextById;
}
