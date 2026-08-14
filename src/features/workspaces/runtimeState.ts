import type { WorkspaceCommitIntentContext } from "../../lib/commitMessage";
import type { WorkspaceGitFileStatus } from "./types";

export type CommitMessageGenerationSnapshot = {
  workspacePath: string;
  repositoryPath: string;
  accountId: number | null;
  includeUnstaged: boolean;
  model: string | null;
  intentContext: WorkspaceCommitIntentContext | null;
  files: WorkspaceGitFileStatus[];
  changeKey: string;
};

export type RefreshWorkspaceGitStatusOptions = {
  showLoading?: boolean;
  background?: boolean;
  force?: boolean;
};

export type OpenWorkspaceFilePreviewOptions = {
  forceRefresh?: boolean;
  mode?: "preview" | "diff";
};
