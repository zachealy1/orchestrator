import type { TaskChatEntry } from "../../components/TaskChatTurn";
import {
  createAgentNotificationEventKey,
} from "../../lib/agentNotifications";
import type { CodexApprovalRequest } from "../../lib/codexApprovals";
import { requestKey, type NativeUserInputRequest } from "../../lib/nativePlanMode";
import type { CodexProfileKey } from "../codex/types";

export function approvalNotificationEventKey(request: CodexApprovalRequest) {
  return createAgentNotificationEventKey("approval-required", request.profileKey, request.key);
}

export function userInputNotificationEventKey(
  profileKey: CodexProfileKey,
  request: NativeUserInputRequest,
) {
  return createAgentNotificationEventKey(
    "user-input-required",
    profileKey,
    request.params.threadId,
    request.params.turnId,
    requestKey(request),
  );
}

export function planNotificationEventKey(
  profileKey: CodexProfileKey | null,
  entry: Pick<TaskChatEntry, "runId" | "runView">,
) {
  return createAgentNotificationEventKey(
    "plan-ready",
    profileKey,
    entry.runView.threadId,
    entry.runView.turnId,
    entry.runView.nativePlan.planItemId,
    entry.runId,
  );
}

export function externalActionNotificationEventKey(accountId: number, loginId: string) {
  return createAgentNotificationEventKey("external-action", accountId, loginId);
}
