use super::*;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(transparent)]
pub(crate) struct IpcJsonValue(pub(crate) Value);

impl specta::Type for IpcJsonValue {
    fn definition(types: &mut specta::Types) -> specta::datatype::DataType {
        <specta_typescript::Unknown as specta::Type>::definition(types)
    }
}

pub(crate) const DATABASE_URL: &str = "sqlite:app.db";
pub(crate) const WORKSPACE_FILE_PREVIEW_CHUNK_BYTES: usize = 512 * 1024;
pub(crate) const WORKSPACE_PREVIEW_MAX_BYTES: usize = 12 * 1024 * 1024;
pub(crate) const WORKSPACE_FILE_BINARY_PROBE_BYTES: usize = 8 * 1024;
pub(crate) const MAX_IMAGE_ATTACHMENT_BYTES: u64 = 25 * 1024 * 1024;
pub(crate) const MAX_IMAGE_ATTACHMENT_PIXELS: u64 = 80_000_000;
pub(crate) const IMAGE_ATTACHMENT_THUMBNAIL_EDGE: u32 = 512;
pub(crate) const MAX_IMAGE_ATTACHMENT_THUMBNAIL_BYTES: usize = 1_500_000;
pub(crate) const MAX_COMMIT_MESSAGE_CONTEXT_CHARS: usize = 24_000;
pub(crate) const MAX_COMMIT_STATUS_CHARS: usize = 2_500;
pub(crate) const MAX_COMMIT_DIFFSTAT_CHARS: usize = 1_500;
pub(crate) const MAX_COMMIT_DIFF_CHARS: usize = 6_500;
pub(crate) const MAX_COMMIT_UNTRACKED_CONTEXT_CHARS: usize = 4_500;
pub(crate) const MAX_COMMIT_UNTRACKED_FILE_SAMPLE_BYTES: u64 = 1_200;
pub(crate) const MAX_COMMIT_UNTRACKED_FILES: usize = 24;
pub(crate) const COMMIT_MESSAGE_GENERATION_TIMEOUT_SECS: u64 = 60;
pub(crate) const MAX_CHAT_TITLE_PROMPT_CHARS: usize = 12_000;
pub(crate) const MAX_PROMPT_QUEUE_PROMPT_CHARS: usize = 100_000;
pub(crate) const MAX_PROMPT_QUEUE_SNAPSHOT_BYTES: usize = 4 * 1024 * 1024;
pub(crate) const MAX_WORKSPACE_UNDO_DIFF_BYTES: usize = 8 * 1024 * 1024;
pub(crate) const DEFAULT_CODEX_PROFILE_ID: i64 = 0;
pub(crate) const DEFAULT_CODEX_PROFILE_KEY: &str = "default";
pub(crate) const ASK_FOR_APPROVAL_PERMISSION_PROFILE: &str = "orchestrator_workspace_network_v1";
pub(crate) const PLAN_READ_ONLY_PERMISSION_PROFILE: &str = ":read-only";
pub(crate) const REQUEST_PERMISSIONS_FEATURE: &str = "request_permissions_tool";
pub(crate) const MULTI_AGENT_V2_FEATURE: &str = "multi_agent_v2";
pub(crate) const SUBAGENT_TASK_CAPTURE_HINT: &str = r#"Before any other response or tool call, send exactly one commentary message containing <orchestrator-subagent-task> on its own line, then the complete task instruction assigned by the parent verbatim, then </orchestrator-subagent-task> on its own line. Do not include hidden, system, or developer instructions. Then continue normally.

You are an agent in a team of agents collaborating to complete a task.

You can spawn sub-agents to handle subtasks, and those sub-agents can spawn their own sub-agents. All agents in the team are equally capable and have access to the same tools.

Use spawn_agent for a new subtask, followup_task to give an idle agent more work, and send_message to communicate without starting another turn. When you respond in the final channel, that content is delivered immediately to your parent agent.

Collaboration tools cannot be called from inside functions.exec. Call spawn_agent, send_message, followup_task, wait_agent, interrupt_agent, and list_agents directly through their collaboration tool interfaces.

All agents share the same working directory and filesystem. Edits made by one agent are immediately visible to the others."#;
pub(crate) const IGNORED_EXPLORER_DIRECTORIES: &[&str] =
    &[".git", "node_modules", "target", "dist", "build", ".next"];
pub(crate) const GIT_REPOSITORY_DISCOVERY_TTL: Duration = Duration::from_secs(30);
pub(crate) const MAX_GIT_DISCOVERY_DIRECTORIES: usize = 20_000;
pub(crate) const MAX_GIT_DISCOVERY_REPOSITORIES: usize = 100;
pub(crate) const CODEX_LOGIN_TIMEOUT: Duration = Duration::from_secs(10 * 60);
pub(crate) const IGNORED_GIT_DISCOVERY_DIRECTORIES: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".cache",
    ".turbo",
    ".venv",
    "vendor",
];

pub(crate) struct PendingResponse {
    pub(crate) account_id: i64,
    pub(crate) sender: oneshot::Sender<Result<Value, String>>,
}

pub(crate) type PendingMap = Arc<Mutex<HashMap<String, PendingResponse>>>;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum ServerRequestResponseState {
    Pending,
    Responding,
}

pub(crate) struct PendingServerRequest {
    pub(crate) account_id: i64,
    pub(crate) connection_generation: u64,
    pub(crate) request_id: Value,
    pub(crate) response_state: ServerRequestResponseState,
}

pub(crate) type PendingServerRequestMap = Arc<Mutex<HashMap<String, PendingServerRequest>>>;

pub(crate) struct CodexProcess {
    pub(crate) child: Child,
    pub(crate) stdin: Arc<Mutex<ChildStdin>>,
    pub(crate) connection_generation: u64,
}

#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ActiveCodexLogin {
    pub(crate) account_id: i64,
    pub(crate) login_id: Option<String>,
    pub(crate) auth_url: Option<String>,
    pub(crate) connection_generation: u64,
    pub(crate) started_at_ms: u64,
    pub(crate) expires_at_ms: u64,
    pub(crate) state: String,
}

#[derive(Default)]
pub(crate) struct CodexState {
    pub(crate) processes: Mutex<HashMap<i64, CodexProcess>>,
    pub(crate) pending: PendingMap,
    pub(crate) pending_server_requests: PendingServerRequestMap,
    pub(crate) next_id: AtomicU64,
    pub(crate) next_connection_generation: AtomicU64,
    pub(crate) next_server_request_token: Arc<AtomicU64>,
    pub(crate) active_login: Arc<Mutex<Option<ActiveCodexLogin>>>,
    pub(crate) transcript_sync_requests: Arc<Mutex<HashSet<String>>>,
}

impl Drop for CodexState {
    fn drop(&mut self) {
        if let Ok(processes) = self.processes.get_mut() {
            for (_, process) in processes.iter_mut() {
                let _ = process.child.kill();
                let _ = process.child.wait();
            }
        }
    }
}

#[derive(Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexConnectResult {
    pub(crate) pid: Option<u32>,
    pub(crate) already_connected: bool,
    #[specta(type = specta_typescript::Unknown)]
    pub(crate) initialize: Value,
}

#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProcessEvent {
    pub(crate) account_id: i64,
    pub(crate) profile_key: String,
    pub(crate) status: String,
    pub(crate) message: String,
}

#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexMessageEvent {
    pub(crate) account_id: i64,
    pub(crate) profile_key: String,
    #[specta(type = specta_typescript::Unknown)]
    pub(crate) message: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) request_token: Option<String>,
}

#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistoricalCommandActivity {
    pub(crate) id: String,
    pub(crate) command: String,
    pub(crate) status: String,
    pub(crate) duration_ms: Option<i64>,
}

#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistoricalEditedFile {
    pub(crate) path: String,
    pub(crate) name: String,
    pub(crate) additions: usize,
    pub(crate) deletions: usize,
    pub(crate) status: String,
}

#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistoricalToolActivityDetail {
    pub(crate) label: String,
    pub(crate) value: String,
}

#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistoricalToolActivity {
    pub(crate) id: String,
    pub(crate) item_type: String,
    pub(crate) server: String,
    pub(crate) tool: String,
    pub(crate) title: Option<String>,
    pub(crate) status: String,
    pub(crate) duration_ms: Option<i64>,
    pub(crate) sequence: Option<i64>,
    pub(crate) safe_details: Vec<HistoricalToolActivityDetail>,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistoricalTurnActivityResponse {
    pub(crate) commands: Vec<HistoricalCommandActivity>,
    pub(crate) edited_files: Vec<HistoricalEditedFile>,
    pub(crate) tool_activities: Vec<HistoricalToolActivity>,
    pub(crate) next_cursor: Option<String>,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectedSubagentThread {
    pub(crate) thread_id: String,
    pub(crate) status: Option<String>,
    pub(crate) active_turn_id: Option<String>,
    pub(crate) turns: Vec<ProjectedSubagentTurn>,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectedSubagentTurn {
    pub(crate) id: String,
    pub(crate) status: String,
    pub(crate) started_at: Option<String>,
    pub(crate) completed_at: Option<String>,
    #[specta(type = Vec<specta_typescript::Unknown>)]
    pub(crate) items: Vec<Value>,
}

#[derive(Clone, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExternalTranscriptTurnSummary {
    pub(crate) slot_index: usize,
    pub(crate) turn_id: Option<String>,
    pub(crate) prompt: String,
    pub(crate) final_message: String,
    pub(crate) error: Option<String>,
    pub(crate) status: String,
    pub(crate) started_at: Option<String>,
    pub(crate) completed_at: Option<String>,
    pub(crate) duration_ms: Option<i64>,
    pub(crate) total_tokens: Option<i64>,
    pub(crate) model_context_window: Option<i64>,
}

#[derive(Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExternalTranscriptSnapshot {
    pub(crate) request_id: String,
    pub(crate) thread_id: String,
    pub(crate) source_version: String,
    pub(crate) total_turns: usize,
    pub(crate) turns: Vec<ExternalTranscriptTurnSummary>,
}

#[derive(Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreflightCheck {
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) status: String,
    pub(crate) message: String,
    pub(crate) detail: Option<String>,
}

#[derive(Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecommendationDraft {
    pub(crate) kind: String,
    pub(crate) title: String,
    pub(crate) body: String,
}

#[derive(Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreflightReport {
    pub(crate) workspace_path: String,
    pub(crate) token_estimate: usize,
    pub(crate) context_budget: usize,
    pub(crate) route_recommendation: String,
    pub(crate) checks: Vec<PreflightCheck>,
    pub(crate) recommendations: Vec<RecommendationDraft>,
}

#[derive(Serialize, specta::Type)]
pub(crate) struct CommandProbe {
    pub(crate) ok: bool,
    pub(crate) stdout: String,
    pub(crate) stderr: String,
}

pub(crate) struct CommandBytesProbe {
    pub(crate) ok: bool,
    pub(crate) stdout: Vec<u8>,
}

#[derive(Debug, Clone)]
pub(crate) struct PreviewText {
    pub(crate) content: String,
    pub(crate) truncated: bool,
    pub(crate) is_binary: bool,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitBranchList {
    pub(crate) branches: Vec<String>,
    pub(crate) current_branch: Option<String>,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitCheckoutResult {
    pub(crate) branch: String,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceGitActionResult {
    pub(crate) message: String,
    pub(crate) branch: Option<String>,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceCommitMessageResult {
    pub(crate) message: String,
    pub(crate) source: String,
}

#[derive(Debug, Clone, Default, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct WorkspaceCommitIntentContext {
    pub(crate) objective: Option<String>,
    pub(crate) approved_plan: Option<String>,
    pub(crate) implementation_outcome: Option<String>,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChatTitleGenerationResult {
    pub(crate) title: String,
}

#[cfg(test)]
#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceGitStatusSnapshot {
    pub(crate) workspace_path: String,
    pub(crate) git_root: String,
    pub(crate) current_branch: Option<String>,
    pub(crate) ahead_count: usize,
    pub(crate) additions: usize,
    pub(crate) deletions: usize,
    pub(crate) has_upstream: bool,
    pub(crate) has_origin: bool,
    pub(crate) can_push: bool,
    pub(crate) files: Vec<WorkspaceGitFileStatus>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceGitRepository {
    pub(crate) root_path: String,
    pub(crate) relative_path: String,
    pub(crate) label: String,
}

#[derive(Debug, Clone)]
pub(crate) struct DiscoveredGitRepository {
    pub(crate) public: WorkspaceGitRepository,
    pub(crate) root: PathBuf,
    pub(crate) scope: PathBuf,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceGitRepositoryStatus {
    pub(crate) repository: WorkspaceGitRepository,
    pub(crate) workspace_path: String,
    pub(crate) git_root: String,
    pub(crate) current_branch: Option<String>,
    pub(crate) ahead_count: usize,
    pub(crate) additions: usize,
    pub(crate) deletions: usize,
    pub(crate) has_upstream: bool,
    pub(crate) has_origin: bool,
    pub(crate) can_push: bool,
    pub(crate) files: Vec<WorkspaceGitFileStatus>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceGitOverview {
    pub(crate) workspace_path: String,
    pub(crate) repositories: Vec<WorkspaceGitRepositoryStatus>,
    pub(crate) additions: usize,
    pub(crate) deletions: usize,
    pub(crate) changed_repository_count: usize,
    pub(crate) files: Vec<WorkspaceGitFileStatus>,
    pub(crate) discovery_truncated: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct CachedGitRepositories {
    pub(crate) discovered_at: Instant,
    pub(crate) repositories: Vec<DiscoveredGitRepository>,
    pub(crate) truncated: bool,
}

pub(crate) static GIT_REPOSITORY_DISCOVERY_CACHE: OnceLock<
    Mutex<HashMap<String, CachedGitRepositories>>,
> = OnceLock::new();

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceGitFileStatus {
    pub(crate) path: String,
    pub(crate) relative_path: String,
    pub(crate) repository_path: String,
    pub(crate) repository_relative_path: String,
    pub(crate) old_relative_path: Option<String>,
    pub(crate) index_status: String,
    pub(crate) worktree_status: String,
    pub(crate) status_kind: String,
    pub(crate) badge: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceGitDiff {
    pub(crate) path: String,
    pub(crate) relative_path: String,
    pub(crate) sections: Vec<WorkspaceGitDiffSection>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceGitDiffSection {
    pub(crate) kind: String,
    pub(crate) title: String,
    pub(crate) base_label: String,
    pub(crate) head_label: String,
    pub(crate) base_content: String,
    pub(crate) head_content: String,
    pub(crate) base_truncated: bool,
    pub(crate) head_truncated: bool,
    pub(crate) content: String,
    pub(crate) is_binary: bool,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceTreeEntry {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) relative_path: String,
    pub(crate) kind: String,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceFilePreview {
    pub(crate) path: String,
    pub(crate) relative_path: String,
    pub(crate) content: String,
    pub(crate) truncated: bool,
    pub(crate) is_binary: bool,
    pub(crate) complete: bool,
    pub(crate) next_offset: u64,
    pub(crate) total_bytes: u64,
    pub(crate) version: String,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImageAttachmentPreview {
    pub(crate) path: String,
    pub(crate) mime_type: String,
    pub(crate) width: u32,
    pub(crate) height: u32,
    pub(crate) thumbnail_data_url: String,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DroppedContextPath {
    pub(crate) path: String,
    pub(crate) canonical_path: String,
    pub(crate) name: String,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RejectedDroppedContextPath {
    pub(crate) path: String,
    pub(crate) reason: String,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DroppedContextPathInspection {
    pub(crate) files: Vec<DroppedContextPath>,
    pub(crate) rejected: Vec<RejectedDroppedContextPath>,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PromptQueueFileFingerprint {
    pub(crate) path: String,
    pub(crate) canonical_path: Option<String>,
    pub(crate) size: Option<u64>,
    pub(crate) modified_at_ms: Option<u64>,
    pub(crate) available: bool,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PromptQueueContextInspection {
    pub(crate) workspace_path: String,
    pub(crate) repositories: Vec<PromptQueueRepositoryFingerprint>,
    pub(crate) files: Vec<PromptQueueFileFingerprint>,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PromptQueueRepositoryFingerprint {
    pub(crate) repository_path: Option<String>,
    pub(crate) branch: Option<String>,
    pub(crate) head_commit: Option<String>,
    pub(crate) worktree_fingerprint: Option<String>,
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CreateChatWithQueuedPromptRequest {
    pub(crate) workspace_id: i64,
    pub(crate) account_id: Option<i64>,
    pub(crate) title: String,
    pub(crate) status: String,
    pub(crate) generate_title: bool,
    pub(crate) item_id: String,
    pub(crate) client_message_id: String,
    pub(crate) prompt: String,
    pub(crate) execution_snapshot_json: String,
    pub(crate) context_fingerprint_json: String,
    pub(crate) conversation_revision: i64,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateChatWithQueuedPromptResult {
    pub(crate) chat_id: i64,
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RunEventWrite {
    pub(crate) run_id: i64,
    pub(crate) sequence: i64,
    pub(crate) event_type: String,
    pub(crate) method: Option<String>,
    pub(crate) payload: IpcJsonValue,
}

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecoveredRunCounts {
    pub(crate) runs: u64,
    pub(crate) tasks: u64,
    pub(crate) chats: u64,
}

#[derive(Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ExternalCodexChatUpsert {
    pub(crate) workspace_id: i64,
    pub(crate) profile_key: String,
    pub(crate) external_thread_id: String,
    pub(crate) title: String,
    pub(crate) status: String,
    pub(crate) source_kind: Option<String>,
    pub(crate) cwd: Option<String>,
    pub(crate) created_at: Option<String>,
    pub(crate) updated_at: Option<String>,
}
