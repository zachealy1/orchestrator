import type { TaskChatEntry } from "../../components/TaskChatTurn";
import type { RunViewState } from "../../lib/codexEventReducer";
import { recoverRetriedToolFailures } from "../../lib/toolActivityRecovery";

export function createTaskChatClientId() {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function replaceChatEntries(
  current: TaskChatEntry[],
  workspaceId: number,
  chatId: number,
  entries: TaskChatEntry[],
) {
  return [
    ...current.filter(
      (entry) => entry.workspaceId !== workspaceId || entry.chatId !== chatId,
    ),
    ...entries,
  ];
}

export function mergeCommandActivities(
  current: RunViewState["commands"],
  incoming: RunViewState["commands"],
) {
  const byId = new Map(current.map((command) => [command.id, command]));
  incoming.forEach((command) => {
    const existing = byId.get(command.id);
    if (existing && isTerminalActivityStatus(existing.status) && !isTerminalActivityStatus(command.status)) {
      return;
    }
    byId.set(command.id, command);
  });
  return [...byId.values()];
}

export function mergeEditedFileActivities(
  current: RunViewState["editedFiles"],
  incoming: RunViewState["editedFiles"],
  pathAliases: Array<{ absolutePath: string; relativePath: string }> = [],
) {
  const aliases = pathAliases
    .map((alias) => ({ ...alias, absolutePath: alias.absolutePath.replace(/\/+$/, "") }))
    .sort((left, right) => right.absolutePath.length - left.absolutePath.length);
  const normalize = (file: RunViewState["editedFiles"][number]) => {
    const path = file.path.replace(/^\.\//, "");
    const alias = aliases.find((candidate) => path.startsWith(`${candidate.absolutePath}/`));
    if (!alias) return path === file.path ? file : { ...file, path };
    const relative = [alias.relativePath === "." ? "" : alias.relativePath, path.slice(alias.absolutePath.length + 1)]
      .filter(Boolean).join("/");
    return { ...file, path: relative };
  };
  const byPath = new Map(current.map((file) => {
    const normalized = normalize(file);
    return [normalized.path, normalized];
  }));
  incoming.forEach((file) => {
    const normalized = normalize(file);
    // The persisted final diff is authoritative. Trace-only tool events can
    // describe the same file without line counts; do not erase final totals.
    if (!byPath.has(normalized.path)) byPath.set(normalized.path, normalized);
  });
  return [...byPath.values()];
}

export function mergeToolActivities(
  currentById: RunViewState["toolActivitiesById"],
  currentOrder: RunViewState["toolActivityOrder"],
  incoming: Array<RunViewState["toolActivitiesById"][string]> = [],
) {
  const byId = { ...currentById };
  const order = [...currentOrder];
  for (const activity of incoming) {
    if (!byId[activity.id]) order.push(activity.id);
    const existing = byId[activity.id];
    if (
      existing &&
      isTerminalActivityStatus(existing.status) &&
      !isTerminalActivityStatus(activity.status)
    ) {
      continue;
    }
    byId[activity.id] = activity;
  }
  return { byId: recoverRetriedToolFailures(byId, order), order };
}

function isTerminalActivityStatus(status: string) {
  return (
    status === "completed" ||
    status === "recovered" ||
    status === "failed" ||
    status === "declined" ||
    status === "interrupted"
  );
}
