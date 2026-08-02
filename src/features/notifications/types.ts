import type { TranscriptNotificationFocusRequest } from "../../components/VirtuosoTaskChatTranscript";
import type { AgentNotificationTarget } from "../../lib/agentNotifications";
import type { CodexApprovalRequest } from "../../lib/codexApprovals";

export type AgentNotificationNavigationPhase =
  | "resolving"
  | "opening-chat"
  | "focusing"
  | "complete";

export type AgentNotificationNavigationState = {
  requestId: number;
  target: AgentNotificationTarget;
  phase: AgentNotificationNavigationPhase;
};

export type PendingAgentNotificationFocus = {
  requestId: number;
  timeoutId: number;
  resolve: (found: boolean) => void;
};

export type PendingApprovalAttention = {
  accountId: number;
  request: CodexApprovalRequest;
  target: AgentNotificationTarget;
};

export type EditedPromptNotice = {
  kind: "rerun-error";
  workspaceId: number;
  entryId: string;
  message: string;
};

export type NotificationTranscriptFocusRequest = TranscriptNotificationFocusRequest;
