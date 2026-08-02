export type Workspace = {
  id: number;
  path: string;
  label: string;
  default_account_id: number | null;
  selected_git_repository_path: string | null;
  last_opened_at: string;
  created_at: string;
};

export type GitBranchList = {
  branches: string[];
  currentBranch: string | null;
};

export type WorkspaceTreeEntry = {
  name: string;
  path: string;
  relativePath: string;
  kind: "directory" | "file";
  gitGhost?: boolean;
};

export type WorkspaceDirectoryState = {
  status: "loading" | "loaded" | "error";
  entries: WorkspaceTreeEntry[];
  error: string | null;
};

export type WorkspaceContextMenuState = {
  workspace: Workspace;
  x: number;
  y: number;
};

export type WorkspaceFilePreview = {
  path: string;
  relativePath: string;
  content: string;
  truncated: boolean;
  isBinary: boolean;
  /** False only while a bounded large-file transfer is still in progress. */
  complete?: boolean;
  /** UTF-8 byte offset for the next bounded chunk. */
  nextOffset?: number;
  totalBytes?: number;
  /** Native size/mtime identity used to reject mixed-version chunk reads. */
  version?: string;
  /** Frontend-only line index used to avoid assembling very large source strings. */
  lines?: string[];
  /** Character budget represented by content or lines, for bounded caching. */
  sourceCharacters?: number;
};

export type WorkspaceGitStatusKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted";

export type WorkspaceGitFileStatus = {
  path: string;
  relativePath: string;
  repositoryPath: string;
  repositoryRelativePath: string;
  oldRelativePath: string | null;
  indexStatus: string;
  worktreeStatus: string;
  statusKind: WorkspaceGitStatusKind;
  badge: string;
};

export type WorkspaceGitRepository = {
  rootPath: string;
  relativePath: string;
  label: string;
};

export type WorkspaceGitStatusSnapshot = {
  workspacePath: string;
  gitRoot: string;
  currentBranch?: string | null;
  aheadCount?: number;
  additions?: number;
  deletions?: number;
  hasUpstream?: boolean;
  hasOrigin?: boolean;
  canPush?: boolean;
  files: WorkspaceGitFileStatus[];
};

export type WorkspaceGitRepositoryStatus = WorkspaceGitStatusSnapshot & {
  repository: WorkspaceGitRepository;
};

export type WorkspaceGitOverview = {
  workspacePath: string;
  repositories: WorkspaceGitRepositoryStatus[];
  additions: number;
  deletions: number;
  changedRepositoryCount: number;
  files: WorkspaceGitFileStatus[];
  discoveryTruncated: boolean;
};

export type WorkspaceGitActionResult = {
  message: string;
  branch: string | null;
};

export type WorkspaceGitDiffSection = {
  kind: "staged" | "unstaged" | "untracked";
  title: string;
  baseLabel: string;
  headLabel: string;
  baseContent: string;
  headContent: string;
  baseTruncated: boolean;
  headTruncated: boolean;
  content: string;
  isBinary: boolean;
};

export type WorkspaceGitDiff = {
  path: string;
  relativePath: string;
  sections: WorkspaceGitDiffSection[];
};

export type WorkspacePreviewState = {
  status: "idle" | "loading" | "loaded" | "error";
  mode: "preview" | "diff";
  file: WorkspaceTreeEntry | null;
  preview: WorkspaceFilePreview | null;
  error: string | null;
  diffStatus: "idle" | "loading" | "loaded" | "error";
  diff: WorkspaceGitDiff | null;
  diffError: string | null;
};
