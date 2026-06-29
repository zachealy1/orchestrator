export type CheckStatus = "pass" | "warn" | "fail" | "info";

export type ThemePreference = "light" | "dark" | "system";

export type ResolvedTheme = "light" | "dark";

export type Workspace = {
  id: number;
  path: string;
  label: string;
  default_account_id: number | null;
  last_opened_at: string;
  created_at: string;
};

export type CodexAccountStatus = "pending" | "signed_in" | "signed_out" | "error";

export type CodexAccountProfile = {
  id: number;
  label: string;
  email: string | null;
  plan_type: CodexPlanType | null;
  status: CodexAccountStatus;
  last_error: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type GitBranchList = {
  branches: string[];
  currentBranch: string | null;
};

export const ORCHESTRATOR_CONTEXT_FILE_MIME =
  "application/x-orchestrator-context-file";

export type WorkspaceTreeEntry = {
  name: string;
  path: string;
  relativePath: string;
  kind: "directory" | "file";
  gitGhost?: boolean;
};

export type WorkspaceFilePreview = {
  path: string;
  relativePath: string;
  content: string;
  truncated: boolean;
  isBinary: boolean;
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
  oldRelativePath: string | null;
  indexStatus: string;
  worktreeStatus: string;
  statusKind: WorkspaceGitStatusKind;
  badge: string;
};

export type WorkspaceGitStatusSnapshot = {
  workspacePath: string;
  gitRoot: string;
  files: WorkspaceGitFileStatus[];
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

export type PreflightCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  detail: string | null;
};

export type RecommendationDraft = {
  kind: string;
  title: string;
  body: string;
};

export type PreflightReport = {
  workspacePath: string;
  tokenEstimate: number;
  contextBudget: number;
  routeRecommendation: RouteRecommendation;
  improvedPrompt: string;
  checks: PreflightCheck[];
  recommendations: RecommendationDraft[];
};

export type RouteRecommendation = "plan-first" | "direct-run";

export type TaskRecord = {
  id: number;
  workspace_id: number;
  original_prompt: string;
  improved_prompt: string;
  route_recommendation: RouteRecommendation;
  budget_tokens: number;
  status: string;
  created_at: string;
};

export type RunRecord = {
  id: number;
  task_id: number;
  workspace_id: number;
  account_id: number | null;
  account_label: string | null;
  account_email: string | null;
  codex_thread_id: string | null;
  codex_turn_id: string | null;
  model: string | null;
  model_provider: string | null;
  sandbox: string;
  approval_policy: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  final_message: string | null;
  error: string | null;
};

export type RunListItem = RunRecord & {
  original_prompt: string;
  improved_prompt: string;
  route_recommendation: RouteRecommendation;
  budget_tokens: number;
};

export type TokenUsageSnapshot = {
  id: number;
  run_id: number;
  thread_id: string | null;
  turn_id: string | null;
  total_tokens: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  model_context_window: number | null;
  created_at: string;
};

export type AnalyticsSummary = {
  run_count: number;
  completed_count: number;
  failed_count: number;
  total_tokens: number;
  cached_tokens: number;
  avg_duration_ms: number | null;
};

export type CodexConnectResult = {
  pid: number | null;
  alreadyConnected: boolean;
  initialize: unknown;
};

export type CodexPlanType =
  | "free"
  | "go"
  | "plus"
  | "pro"
  | "prolite"
  | "team"
  | "self_serve_business_usage_based"
  | "business"
  | "enterprise_cbp_usage_based"
  | "enterprise"
  | "edu"
  | "unknown";

export type CodexAuthMode =
  | "apikey"
  | "chatgpt"
  | "chatgptAuthTokens"
  | "agentIdentity"
  | "personalAccessToken"
  | "bedrockApiKey";

export type CodexAccount =
  | { type: "apiKey" }
  | { type: "chatgpt"; email: string | null; planType: CodexPlanType }
  | {
      type: "amazonBedrock";
      credentialSource: "codexManaged" | "awsManaged";
    };

export type CodexAccountResponse = {
  account: CodexAccount | null;
  requiresOpenaiAuth: boolean;
};

export type CodexLoginResponse =
  | { type: "apiKey" }
  | { type: "chatgpt"; loginId: string; authUrl: string }
  | {
      type: "chatgptDeviceCode";
      loginId: string;
      verificationUrl: string;
      userCode: string;
    }
  | { type: "chatgptAuthTokens" };

export type CodexLoginState = "idle" | "starting" | "waiting" | "failed";

export type AccountLoginCompletedNotification = {
  success: boolean;
  error: string | null;
  loginId: string | null;
};

export type AccountUpdatedNotification = {
  authMode?: CodexAuthMode | null;
  planType?: CodexPlanType | null;
};

export type CodexMessage = {
  method?: string;
  id?: string | number;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
};

export type CodexMessageEvent = {
  accountId: number;
  message: CodexMessage;
};

export type CodexProcessEvent = {
  accountId: number;
  status: string;
  message: string;
};

export type OssProvider = "ollama" | "lmstudio";

export type AccessLevel = "ask" | "full";

export type ReasoningEffortOption = {
  reasoningEffort: string;
  description: string;
};

export type CodexModel = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  supportedReasoningEfforts: ReasoningEffortOption[];
  defaultReasoningEffort: string;
  isDefault: boolean;
};

export type ModelListResponse = {
  data: CodexModel[];
  nextCursor: string | null;
};

export type ComposerContextFile = {
  path: string;
  name: string;
  source: "picker" | "search" | "explorer";
  relativePath?: string;
  status?: "ready" | "error";
  error?: string | null;
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

export type AdditionalContextEntry = {
  value: string;
  kind: "untrusted" | "application";
};
