import type { ComposerContextFile, SelectedComposerSkill } from "../composer/types";
import type {
  ChatListItem,
  HistoricalTranscriptState,
  TranscriptViewportSnapshot,
  WorkspaceChatSession,
} from "./types";
import type { Workspace } from "../workspaces/types";

export type LoadWorkspaceHistoryOptions = {
  syncExternal?: boolean;
  showLoading?: boolean;
};

export type SelectHistoryChatOptions = {
  source?: "drawer" | "notification" | "workspace" | "kanban";
  workspace?: Workspace;
  positionIntent?: HistoricalTranscriptState["positionIntent"];
  kanbanCardId?: string;
  kanbanInteractionPending?: boolean;
};

export type WorkspaceTaskSelection =
  | { kind: "new" }
  | { kind: "draft"; clientId: string }
  | { kind: "chat"; session: WorkspaceChatSession };

export type WorkspaceTaskMemory = {
  selection: WorkspaceTaskSelection;
  prompt: string;
  contextFiles: ComposerContextFile[];
  selectedSkills: SelectedComposerSkill[];
  historicalTranscript: HistoricalTranscriptState | null;
  transcriptViewportSnapshot: TranscriptViewportSnapshot | null;
};

export type ChatNavigationTarget = ChatListItem;
