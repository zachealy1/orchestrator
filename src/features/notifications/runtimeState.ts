import type { CodexMessage, CodexProfileKey } from "../codex/types";

export type AgentNotificationNavigationResult =
  | "complete"
  | "terminal"
  | "retryable";

export type PendingFrameCodexNotification = {
  message: CodexMessage;
  profileKey: CodexProfileKey;
};

export type PendingRunBindingNotification = {
  accountId: number;
  profileKey: CodexProfileKey;
  message: CodexMessage;
  receivedAt: number;
};
