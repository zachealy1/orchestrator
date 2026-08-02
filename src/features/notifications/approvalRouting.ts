import type { TaskChatEntry } from "../../components/TaskChatTurn";
import type { CodexApprovalRequest } from "../../lib/codexApprovals";
import type { SubagentStore } from "../../lib/subagents";
import type { ActiveRunControl } from "../runs/runtimeTypes";
import { isActiveRunControl } from "../runs/runtimeTypes";
import type { CodexProfileKey } from "../codex/types";
import type { PendingApprovalAttention } from "./types";

export function pendingApprovalMatchesEntry(
  attention: PendingApprovalAttention,
  entry: TaskChatEntry,
) {
  const { request, target } = attention;
  if (target.workspaceId != null && target.workspaceId !== entry.workspaceId) return false;
  if (target.chatId != null && target.chatId !== entry.chatId) return false;
  if (target.runId != null) return target.runId === entry.runId;
  if (request.threadId && entry.runView.threadId && request.threadId !== entry.runView.threadId) return false;
  if (request.turnId && entry.runView.turnId && request.turnId !== entry.runView.turnId) return false;
  return Boolean(
    (request.threadId && entry.runView.threadId) ||
      (request.turnId && entry.runView.turnId),
  );
}

export function pendingApprovalCouldBelongToControl(
  attention: PendingApprovalAttention,
  control: ActiveRunControl,
  subagentStore: SubagentStore,
) {
  const { request, target } = attention;
  const child =
    request.threadId && request.profileKey === control.profileKey
      ? subagentStore.findByThread(request.profileKey, request.threadId)
      : null;
  const belongsToChild = child?.ownerClientId === control.clientId;
  if (!isActiveRunControl(control) || request.profileKey !== control.profileKey) return false;
  if (target.entryClientId && target.entryClientId !== control.clientId) return false;
  if (target.runId != null && target.runId !== control.runId) return false;
  if (target.workspaceId != null && target.workspaceId !== control.workspaceId) return false;
  if (target.chatId != null && target.chatId !== control.chatId) return false;
  if (
    request.threadId && control.threadId && request.threadId !== control.threadId &&
    !belongsToChild
  ) return false;
  if (request.turnId && belongsToChild && child?.childTurnId) {
    if (request.turnId !== child.childTurnId) return false;
  } else if (
    request.turnId && control.turnId && request.turnId !== control.turnId &&
    !control.acceptsThreadContinuation
  ) return false;
  const requestReceivedAt = Date.parse(request.receivedAt);
  const runStartedAt = control.runView.startedAt
    ? Date.parse(control.runView.startedAt)
    : Number.NaN;
  return !(
    Number.isFinite(requestReceivedAt) &&
    Number.isFinite(runStartedAt) &&
    requestReceivedAt < runStartedAt
  );
}

export function approvalRequestMatchesRun(
  request: CodexApprovalRequest,
  profileKey: CodexProfileKey,
  threadId: string | null,
  turnId: string | null,
) {
  if (request.profileKey !== profileKey) return false;
  if (turnId && request.turnId) {
    return (
      request.turnId === turnId &&
      (!threadId || !request.threadId || request.threadId === threadId)
    );
  }
  return Boolean(threadId && request.threadId && request.threadId === threadId);
}
