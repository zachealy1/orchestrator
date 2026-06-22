export type CheckStatus = "pass" | "warn" | "fail" | "info";

export type Workspace = {
  id: number;
  path: string;
  label: string;
  last_opened_at: string;
  created_at: string;
};

export type GitBranchList = {
  branches: string[];
  currentBranch: string | null;
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

export type CodexMessage = {
  method?: string;
  id?: string | number;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
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
  source: "picker" | "search";
  status?: "ready" | "error";
  error?: string | null;
};

export type ComposerModeState = {
  goalMode: boolean;
  planMode: boolean;
};

export type AdditionalContextEntry = {
  value: string;
  kind: "untrusted" | "application";
};
