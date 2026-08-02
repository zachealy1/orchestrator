import type { ComposerContextFile, SelectedComposerSkill } from "../composer/types";
import type {
  CodexAccessMode,
  CodexProfileKey,
  OssProvider,
} from "../codex/types";
import type { CheckStatus } from "../../shared/types";

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
  chat_id: number | null;
  turn_index: number | null;
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
  chat_id: number | null;
  turn_index: number | null;
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
  collaboration_mode: "plan" | "default" | null;
  run_intent: "normal" | "plan" | "plan-revision" | "plan-implementation";
  client_user_message_id: string | null;
  completed_plan_item_id: string | null;
  completed_plan_text: string | null;
  plan_review_state: "none" | "available" | "superseded" | "approved" | "cancelled";
  execution_settings_json: string | null;
  web_preview_json: string | null;
};

export type RunListItem = RunRecord & {
  original_prompt: string;
  improved_prompt: string;
  route_recommendation: RouteRecommendation;
  budget_tokens: number;
  latest_total_tokens: number | null;
  latest_cached_input_tokens: number | null;
  latest_run_tokens: number | null;
  latest_run_cached_input_tokens: number | null;
  latest_context_tokens: number | null;
  latest_model_context_window: number | null;
};

export type RunExecutionSettings = {
  version: 2;
  accountId: number;
  profileKey: CodexProfileKey;
  selectedRepositoryPath: string | null;
  selectedBranch: string | null;
  mode: "plan" | "run";
  intent: "normal" | "plan" | "plan-revision" | "plan-implementation";
  accessMode: CodexAccessMode;
  computerUseEnabled: boolean;
  model: string | null;
  reasoningEffort: string | null;
  useOss: boolean;
  ossProvider: OssProvider;
  contextFiles: ComposerContextFile[];
  selectedSkills: SelectedComposerSkill[];
  goalMode: boolean;
};

export type RunExecutionSettingsSource = "captured" | "legacy";

export type ResolvedRunExecutionSettings = {
  settings: RunExecutionSettings;
  source: RunExecutionSettingsSource;
};

export type AdditionalContextEntry = {
  value: string;
  kind: "untrusted" | "application";
};
