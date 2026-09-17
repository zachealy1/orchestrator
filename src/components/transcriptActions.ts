import type { HistoricalChatOpenRequest, TranscriptViewportSnapshot } from "../features/conversations/types";
import type { TaskChatEntry } from "../features/conversations/types";
import type { ApprovalResolutionHandler } from "../lib/codexApprovals";
import type { NativeUserInputRequest, UserInputResponse } from "../lib/nativePlanMode";
import type { RunEditedFile } from "../lib/codexEventReducer";
import type { RunWebPreview } from "../lib/webPreview";


export type TranscriptActions = {
  onViewportSnapshotChange?: (snapshot: TranscriptViewportSnapshot) => void;
  onOpenAtLatestApplied?: (request: HistoricalChatOpenRequest) => void;
  onOpenAtLatestCancelled?: (request: HistoricalChatOpenRequest) => void;
  onResolveRequest: ApprovalResolutionHandler;
  onAnswerUserInput?: (
    entry: TaskChatEntry,
    request: NativeUserInputRequest,
    response: UserInputResponse,
  ) => void;
  onImplementPlan?: (entry: TaskChatEntry) => void;
  onRevisePlan?: (
    entry: TaskChatEntry,
    revision: string,
  ) => boolean | void | Promise<boolean | void>;
  onCancelPlan?: (entry: TaskChatEntry) => void;
  onDraftToolMessage?: (text: string) => void;
  onInspectActivitySubagent?: (profileKey: string, threadId: string) => void;
  onOpenTranscriptLink?: (href: string) => boolean;
  onOpenWebPreview?: (
    entry: TaskChatEntry,
    preview: RunWebPreview,
  ) => Promise<void> | void;
  onReviewEditedFile?: (
    entry: TaskChatEntry,
    file: RunEditedFile,
  ) => Promise<void> | void;
  onUndoEditedFiles?: (entry: TaskChatEntry) => Promise<void> | void;
  onEditPrompt?: (entry: TaskChatEntry, prompt: string) => void;
  onLoadHistoricalActivity?: (entry: TaskChatEntry) => void;
  onScrollActivityChange?: (active: boolean) => void;
  onNotificationFocusApplied?: (
    request: TranscriptNotificationFocusRequest,
    found: boolean,
  ) => void;
};

export type TranscriptNotificationFocusRequest = {
  requestId: number;
  kind: "response" | "prompt" | "approval" | "user-input" | "plan";
  entryClientId?: string | null;
  runId?: number | null;
  turnId?: string | null;
  targetId?: string | null;
};
