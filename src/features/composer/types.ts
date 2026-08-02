import type { Workspace, WorkspaceTreeEntry } from "../workspaces/types";

export const ORCHESTRATOR_CONTEXT_FILE_MIME =
  "application/x-orchestrator-context-file";

export const ORCHESTRATOR_PROMPT_CONTEXT_MIME =
  "application/x-orchestrator-prompt-context";

export type ComposerContextFile = {
  path: string;
  canonicalPath?: string;
  name: string;
  source: "picker" | "search" | "explorer";
  relativePath?: string;
  mediaKind?: "file" | "image";
  mimeType?: string;
  width?: number;
  height?: number;
  status?: "loading" | "ready" | "error";
  error?: string | null;
};

export type ImageAttachmentPreview = {
  path: string;
  mimeType: string;
  width: number;
  height: number;
  thumbnailDataUrl: string;
};

export type DroppedContextPath = {
  path: string;
  canonicalPath: string;
  name: string;
};

export type RejectedDroppedContextPath = {
  path: string;
  reason: "unavailable" | "directory" | "not-file" | "unreadable";
};

export type DroppedContextPathInspection = {
  files: DroppedContextPath[];
  rejected: RejectedDroppedContextPath[];
};

export type ComposerMentionSearchStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "error"
  | "disabled";

export type SlashCommandKind =
  | "plan"
  | "goal"
  | "reasoning"
  | "compact"
  | "status"
  | "review"
  | "mcp"
  | "init";

export type CodexSkillSummary = {
  id: string;
  name: string;
  description: string | null;
};

export type SlashCommandItem =
  | {
      kind: "builtin";
      command: SlashCommandKind;
      title: string;
      description: string;
    }
  | {
      kind: "skill";
      skill: CodexSkillSummary;
      title: string;
      description: string;
    };

export type SlashCommandSearchStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "error"
  | "disabled";

export type SelectedComposerSkill = CodexSkillSummary;

export type ComposerModeState = {
  goalMode: boolean;
  planMode: boolean;
};

export type ExplorerPointerDrag = {
  active: boolean;
  workspace: Workspace;
  entry: WorkspaceTreeEntry;
  file: ComposerContextFile;
  pointerId: number;
  startX: number;
  startY: number;
};

export type ExplorerDragPreview = {
  fileName: string;
  x: number;
  y: number;
  overDropSurface: boolean;
};
