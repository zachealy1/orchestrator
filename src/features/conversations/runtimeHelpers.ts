import type { TaskChatEntry } from "../../components/TaskChatTurn";
import type { RunViewState } from "../../lib/codexEventReducer";

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
) {
  const byPath = new Map(current.map((file) => [file.path, file]));
  incoming.forEach((file) => byPath.set(file.path, file));
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
  return { byId, order };
}

function isTerminalActivityStatus(status: string) {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "declined" ||
    status === "interrupted"
  );
}
