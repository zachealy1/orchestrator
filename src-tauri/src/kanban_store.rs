use crate::{
    git::generate_workspace_repository_commit_message_blocking,
    kanban_git::{
        kanban_git_commit, kanban_git_diff, kanban_git_merge, kanban_git_status,
        KanbanGitBindingRequest, KanbanGitCommitRequest, KanbanGitDiffRequest,
        KanbanGitMergeRequest, KanbanGitRepositoryBinding,
    },
    models::WorkspaceCommitIntentContext,
    DatabaseState,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{pool::PoolConnection, sqlite::SqliteConnection, Connection, Row, Sqlite};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

const POSITION_STEP: i64 = 1_024;
const MAX_TITLE_CHARS: usize = 240;
const MAX_DESCRIPTION_CHARS: usize = 100_000;
const ACTIVE_ATTEMPT_STATES: &[&str] = &[
    "provisioning",
    "starting",
    "running",
    "paused",
    "blocked",
    "waiting_user",
    "waiting_approval",
    "pause_requested",
    "stop_requested",
];

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct KanbanColumnDto {
    pub key: String,
    pub position: i64,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct KanbanRepositorySelectionDto {
    pub repository_path: String,
    pub relative_path: String,
    pub label: String,
    pub include_dirty_changes: bool,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct KanbanCardDto {
    pub id: String,
    pub workspace_id: i64,
    pub chat_id: i64,
    pub title: String,
    pub description: String,
    pub account_id: Option<i64>,
    pub access_mode: String,
    pub model: Option<String>,
    pub reasoning_level: Option<String>,
    pub execution_settings_json: Option<String>,
    pub repository_scope: String,
    pub stage: String,
    pub sort_position: i64,
    pub execution_state: String,
    pub review_state: String,
    pub review_channel: Option<String>,
    pub current_attempt_id: Option<String>,
    pub state_version: i64,
    pub archived_at: Option<String>,
    pub deleted_at: Option<String>,
    pub approved_at: Option<String>,
    pub last_error: Option<String>,
    pub has_inherited_context: bool,
    pub has_started_turn: bool,
    pub created_at: String,
    pub updated_at: String,
    pub repositories: Vec<KanbanRepositorySelectionDto>,
    pub pull_requests: Vec<crate::github::KanbanPullRequestDto>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct KanbanLocalReviewRepositoryDto {
    pub source_repository_path: String,
    pub relative_path: String,
    pub base_branch: String,
    pub card_branch: String,
    pub status: String,
    pub error: Option<String>,
    pub additions: u64,
    pub deletions: u64,
    pub files: Vec<String>,
    pub diff: String,
    pub is_empty: bool,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct KanbanLocalReviewDto {
    pub card_id: String,
    pub title: String,
    pub objective: String,
    pub summary: Option<String>,
    pub review_channel: String,
    pub can_publish_github: bool,
    pub repositories: Vec<KanbanLocalReviewRepositoryDto>,
}

#[derive(Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ApproveKanbanLocalReviewRequest {
    pub card_id: String,
    pub operation_id: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct KanbanBoardSnapshotDto {
    pub workspace_id: i64,
    pub revision: i64,
    pub preferences_json: String,
    pub columns: Vec<KanbanColumnDto>,
    pub cards: Vec<KanbanCardDto>,
}

#[derive(Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct KanbanRepositorySelectionInput {
    pub repository_path: String,
    #[serde(default)]
    pub relative_path: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub include_dirty_changes: bool,
}

#[derive(Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateKanbanCardRequest {
    pub id: String,
    pub workspace_id: i64,
    pub title: String,
    pub description: String,
    pub account_id: Option<i64>,
    pub access_mode: String,
    pub model: Option<String>,
    pub reasoning_level: Option<String>,
    #[serde(default)]
    pub execution_settings_json: Option<String>,
    #[serde(default)]
    pub generate_title: bool,
    #[serde(default)]
    pub title_fallback: Option<String>,
    pub repository_scope: String,
    #[serde(default)]
    pub repositories: Vec<KanbanRepositorySelectionInput>,
    pub operation_id: String,
}

#[derive(Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateKanbanCardRequest {
    pub card_id: String,
    pub expected_version: i64,
    pub title: String,
    pub description: String,
    pub account_id: Option<i64>,
    pub access_mode: String,
    pub model: Option<String>,
    pub reasoning_level: Option<String>,
    #[serde(default)]
    pub execution_settings_json: Option<String>,
    pub repository_scope: String,
    #[serde(default)]
    pub repositories: Vec<KanbanRepositorySelectionInput>,
    pub operation_id: String,
}

#[derive(Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MoveKanbanCardRequest {
    pub card_id: String,
    pub expected_version: i64,
    pub target_stage: String,
    pub before_card_id: Option<String>,
    pub after_card_id: Option<String>,
    pub operation_id: String,
}

#[derive(Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClaimKanbanAttemptRequest {
    pub card_id: String,
    pub attempt_id: String,
    pub expected_version: i64,
    pub kind: String,
    pub prompt: String,
    pub config_snapshot_json: String,
    #[serde(default)]
    pub execution_settings_json: Option<String>,
    pub operation_id: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct KanbanAttemptDto {
    pub id: String,
    pub card_id: String,
    pub generation: i64,
    pub kind: String,
    pub status: String,
    pub prompt: String,
    pub run_id: Option<i64>,
    pub task_id: Option<i64>,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub execution_root: Option<String>,
    pub last_event_sequence: i64,
    pub error: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClaimKanbanAttemptResult {
    pub card: KanbanCardDto,
    pub attempt: KanbanAttemptDto,
}

#[derive(Debug, Clone, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CompletedKanbanPlanInput {
    pub item_id: String,
    pub text: String,
}

#[derive(Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateKanbanAttemptRequest {
    pub card_id: String,
    pub attempt_id: String,
    pub generation: i64,
    pub sequence: i64,
    pub status: String,
    pub run_id: Option<i64>,
    pub task_id: Option<i64>,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub execution_root: Option<String>,
    pub error: Option<String>,
    #[serde(default)]
    pub completed_plan: Option<CompletedKanbanPlanInput>,
    pub operation_id: String,
}

#[derive(Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RejectKanbanPlanRequest {
    pub card_id: String,
    pub attempt_id: String,
    pub expected_version: i64,
    pub operation_id: String,
}

#[derive(Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct VersionedKanbanCardRequest {
    pub card_id: String,
    pub expected_version: i64,
    pub operation_id: String,
}

#[derive(Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveKanbanCardRequest {
    pub card_id: String,
    pub expected_version: i64,
    pub archived: bool,
    pub operation_id: String,
}

#[derive(Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DeleteKanbanCardRequest {
    pub card_id: String,
    pub expected_version: i64,
    pub operation_id: String,
}

#[derive(Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UpdateKanbanPreferencesRequest {
    pub workspace_id: i64,
    pub expected_revision: i64,
    pub preferences_json: String,
    pub column_order: Vec<String>,
    pub operation_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PersistedKanbanGitBinding {
    pub source_repository_path: String,
    pub relative_path: String,
    pub execution_root: String,
    pub source_branch: String,
    pub base_branch: String,
    pub base_commit: String,
    pub card_branch: String,
    pub worktree_path: String,
    pub status: String,
    #[specta(type = Option<specta_typescript::Unknown>)]
    pub error: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveKanbanGitBindingsRequest {
    pub card_id: String,
    pub expected_version: i64,
    pub operation_id: String,
    pub bindings: Vec<PersistedKanbanGitBinding>,
}

#[derive(Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SetKanbanInheritedContextRequest {
    pub card_id: String,
    pub source_card_id: String,
    pub context: String,
    pub expected_version: i64,
    pub operation_id: String,
}

async fn open_database(app: &AppHandle) -> Result<PoolConnection<Sqlite>, String> {
    app.state::<DatabaseState>().acquire().await
}

fn validate_identifier(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty() || value.len() > 200 {
        return Err(format!("The {label} identifier is invalid."));
    }
    Ok(())
}

fn operation_fingerprint<T: Serialize>(request: &T) -> Result<String, String> {
    let encoded = serde_json::to_vec(request)
        .map_err(|_| "The Kanban operation could not be encoded.".to_string())?;
    let digest = Sha256::digest(encoded);
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn validate_stage(value: &str) -> Result<(), String> {
    if matches!(value, "todo" | "in_progress" | "in_review" | "done") {
        Ok(())
    } else {
        Err("The Kanban stage is invalid.".to_string())
    }
}

fn validate_access(value: &str) -> Result<(), String> {
    if matches!(value, "ask-for-approval" | "full-access") {
        Ok(())
    } else {
        Err("The access mode is invalid.".to_string())
    }
}

fn validate_repository_scope(value: &str) -> Result<(), String> {
    if matches!(value, "all" | "selected") {
        Ok(())
    } else {
        Err("The repository scope is invalid.".to_string())
    }
}

fn validate_card_content(title: &str, description: &str) -> Result<(), String> {
    if title.trim().is_empty() || title.chars().count() > MAX_TITLE_CHARS {
        return Err(format!(
            "Card titles must be between 1 and {MAX_TITLE_CHARS} characters."
        ));
    }
    if description.trim().is_empty() || description.chars().count() > MAX_DESCRIPTION_CHARS {
        return Err(format!(
            "Card descriptions must be between 1 and {MAX_DESCRIPTION_CHARS} characters."
        ));
    }
    Ok(())
}

fn execution_settings_are_plan_mode(value: Option<&str>) -> bool {
    value
        .and_then(|settings| serde_json::from_str::<serde_json::Value>(settings).ok())
        .and_then(|settings| {
            settings
                .get("mode")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        })
        .is_some_and(|mode| mode == "plan")
}

fn execution_settings_are_plan_implementation(value: Option<&str>) -> bool {
    value
        .and_then(|settings| serde_json::from_str::<serde_json::Value>(settings).ok())
        .and_then(|settings| {
            settings
                .get("intent")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
        })
        .is_some_and(|intent| intent == "plan-implementation")
}

struct ImplementationExecutionSettings {
    encoded: String,
    account_id: Option<i64>,
    access_mode: String,
    model: Option<String>,
    reasoning_level: Option<String>,
}

fn implementation_execution_settings(
    value: Option<&str>,
) -> Result<ImplementationExecutionSettings, String> {
    let encoded = value
        .ok_or_else(|| "Choose implementation settings before accepting this plan.".to_string())?;
    let settings = serde_json::from_str::<serde_json::Value>(encoded)
        .map_err(|_| "The implementation settings are invalid.".to_string())?;
    let object = settings
        .as_object()
        .ok_or_else(|| "The implementation settings are invalid.".to_string())?;
    if object.get("mode").and_then(serde_json::Value::as_str) != Some("run")
        || object.get("intent").and_then(serde_json::Value::as_str) != Some("plan-implementation")
        || object.get("goalMode").and_then(serde_json::Value::as_bool) != Some(false)
    {
        return Err("The accepted plan requires implementation-mode settings.".to_string());
    }
    let access_mode = object
        .get("accessMode")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "The implementation access mode is missing.".to_string())?
        .to_string();
    validate_access(&access_mode)?;
    let profile_key = object
        .get("profileKey")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "The implementation account profile is missing.".to_string())?;
    let captured_account_id = object
        .get("accountId")
        .and_then(serde_json::Value::as_i64)
        .ok_or_else(|| "The implementation account is invalid.".to_string())?;
    let account_id = if profile_key == "default" {
        if captured_account_id != 0 {
            return Err("The shared Codex profile has invalid account settings.".to_string());
        }
        None
    } else {
        let expected = profile_key
            .strip_prefix("account:")
            .and_then(|value| value.parse::<i64>().ok())
            .filter(|value| *value > 0)
            .ok_or_else(|| "The implementation account profile is invalid.".to_string())?;
        if captured_account_id != expected {
            return Err("The implementation account does not match its profile.".to_string());
        }
        Some(expected)
    };
    let optional_string = |key: &str| -> Result<Option<String>, String> {
        match object.get(key) {
            None | Some(serde_json::Value::Null) => Ok(None),
            Some(serde_json::Value::String(value)) if !value.trim().is_empty() => {
                Ok(Some(value.clone()))
            }
            _ => Err(format!("The implementation {key} value is invalid.")),
        }
    };
    Ok(ImplementationExecutionSettings {
        encoded: encoded.to_string(),
        account_id,
        access_mode,
        model: optional_string("model")?,
        reasoning_level: optional_string("reasoningEffort")?,
    })
}

fn validate_completed_plan(plan: &CompletedKanbanPlanInput) -> Result<(), String> {
    validate_identifier(&plan.item_id, "plan item")?;
    if plan.text.trim().is_empty() || plan.text.chars().count() > MAX_DESCRIPTION_CHARS {
        return Err(format!(
            "Completed plans must be between 1 and {MAX_DESCRIPTION_CHARS} characters."
        ));
    }
    Ok(())
}

fn validate_repositories(
    scope: &str,
    repositories: &[KanbanRepositorySelectionInput],
) -> Result<(), String> {
    if scope == "selected" && repositories.is_empty() {
        return Err("Select at least one repository or use all repositories.".to_string());
    }
    let mut paths = std::collections::HashSet::new();
    for repository in repositories {
        if repository.repository_path.trim().is_empty()
            || !paths.insert(repository.repository_path.trim())
        {
            return Err("The repository selection is invalid.".to_string());
        }
    }
    Ok(())
}

fn move_transition_allowed(current_stage: &str, execution_state: &str, target_stage: &str) -> bool {
    current_stage == target_stage
        || (current_stage == "in_progress"
            && target_stage == "todo"
            && matches!(execution_state, "failed" | "stopped" | "interrupted"))
        || (current_stage == "in_progress"
            && target_stage == "in_review"
            && matches!(execution_state, "completed" | "stopped"))
}

fn claim_transition_allowed(
    kind: &str,
    stage: &str,
    execution_state: &str,
    review_state: &str,
) -> bool {
    match kind {
        "start" => stage == "todo" && execution_state == "idle",
        "retry" => matches!(execution_state, "failed" | "stopped"),
        "resume" => matches!(execution_state, "paused" | "blocked" | "interrupted"),
        "request_changes" | "implement_plan" => {
            stage == "in_review"
                && execution_state == "completed"
                && review_state == "awaiting_review"
        }
        _ => false,
    }
}

async fn ensure_board(connection: &mut SqliteConnection, workspace_id: i64) -> Result<(), String> {
    sqlx::query(
        "INSERT OR IGNORE INTO kanban_boards (workspace_id, preferences_json)
         VALUES (?1, '{}')",
    )
    .bind(workspace_id)
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("The Kanban board could not be prepared: {error}"))?;
    for (key, position) in [
        ("todo", 0_i64),
        ("in_progress", 1_i64),
        ("in_review", 2_i64),
        ("done", 3_i64),
    ] {
        sqlx::query(
            "INSERT OR IGNORE INTO kanban_columns (workspace_id, column_key, position)
             VALUES (?1, ?2, ?3)",
        )
        .bind(workspace_id)
        .bind(key)
        .bind(position)
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("The Kanban columns could not be prepared: {error}"))?;
    }
    Ok(())
}

async fn insert_operation(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    operation_id: &str,
    card_id: Option<&str>,
    workspace_id: i64,
    kind: &str,
    request_fingerprint: &str,
) -> Result<bool, String> {
    validate_identifier(operation_id, "operation")?;
    let result = sqlx::query(
        "INSERT OR IGNORE INTO kanban_operations (
            operation_id, workspace_id, card_id, operation_kind, status,
            request_fingerprint
         ) VALUES (?1, ?2, ?3, ?4, 'applying', ?5)",
    )
    .bind(operation_id)
    .bind(workspace_id)
    .bind(card_id)
    .bind(kind)
    .bind(request_fingerprint)
    .execute(&mut **transaction)
    .await
    .map_err(|error| format!("The Kanban operation could not be recorded: {error}"))?;
    if result.rows_affected() == 1 {
        return Ok(true);
    }
    let existing = sqlx::query(
        "SELECT workspace_id, card_id, operation_kind, request_fingerprint, status
         FROM kanban_operations WHERE operation_id = ?1",
    )
    .bind(operation_id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| format!("The Kanban operation could not be verified: {error}"))?
    .ok_or_else(|| "The Kanban operation could not be verified.".to_string())?;
    let existing_card_id = existing.get::<Option<String>, _>("card_id");
    let existing_fingerprint = existing.get::<String, _>("request_fingerprint");
    let card_matches = card_id.is_none() || existing_card_id.as_deref() == card_id;
    // Operations written before migration 30 have no recoverable request body
    // from which to derive a fingerprint. Treat an otherwise matching,
    // completed legacy receipt as a replay. The receipt still cannot apply a
    // second mutation, and card-scoped operations must match their owner.
    let fingerprint_matches =
        existing_fingerprint.is_empty() || existing_fingerprint == request_fingerprint;
    if existing.get::<i64, _>("workspace_id") != workspace_id
        || !card_matches
        || existing.get::<String, _>("operation_kind") != kind
        || !fingerprint_matches
    {
        return Err(
            "This Kanban operation identifier was already used for a different request."
                .to_string(),
        );
    }
    if existing.get::<String, _>("status") != "completed" {
        return Err(
            "The prior Kanban operation did not complete and cannot be replayed.".to_string(),
        );
    }
    Ok(false)
}

async fn complete_operation(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    operation_id: &str,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE kanban_operations
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP
         WHERE operation_id = ?1",
    )
    .bind(operation_id)
    .execute(&mut **transaction)
    .await
    .map_err(|error| format!("The Kanban operation could not be completed: {error}"))?;
    Ok(())
}

async fn load_repositories(
    connection: &mut SqliteConnection,
    card_id: &str,
) -> Result<Vec<KanbanRepositorySelectionDto>, String> {
    let rows = sqlx::query(
        "SELECT repository_path, relative_path, label, include_dirty
         FROM kanban_card_repository_selections
         WHERE card_id = ?1
         ORDER BY relative_path, repository_path",
    )
    .bind(card_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("The card repositories could not be loaded: {error}"))?;
    Ok(rows
        .into_iter()
        .map(|row| KanbanRepositorySelectionDto {
            repository_path: row.get("repository_path"),
            relative_path: row.get("relative_path"),
            label: row.get("label"),
            include_dirty_changes: row.get::<i64, _>("include_dirty") != 0,
        })
        .collect())
}

async fn load_card(
    connection: &mut SqliteConnection,
    card_id: &str,
) -> Result<KanbanCardDto, String> {
    let row = sqlx::query(
        "SELECT id, workspace_id, chat_id, title, description, account_id,
            access_mode, model, reasoning_level, execution_settings_json,
            repository_scope, stage,
            sort_position, execution_state, review_state, review_channel, current_attempt_id,
            state_version, archived_at, deleted_at, approved_at, last_error,
            created_at, updated_at, inherited_context,
            EXISTS(
                SELECT 1 FROM kanban_attempts
                WHERE kanban_attempts.card_id = kanban_cards.id
                  AND kanban_attempts.turn_id IS NOT NULL
            ) AS has_started_turn
         FROM kanban_cards WHERE id = ?1",
    )
    .bind(card_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|error| format!("The Kanban card could not be loaded: {error}"))?
    .ok_or_else(|| "The Kanban card no longer exists.".to_string())?;
    let repositories = load_repositories(connection, card_id).await?;
    let pull_requests = crate::github::load_card_pull_requests(connection, card_id).await?;
    Ok(KanbanCardDto {
        id: row.get("id"),
        workspace_id: row.get("workspace_id"),
        chat_id: row.get("chat_id"),
        title: row.get("title"),
        description: row.get("description"),
        account_id: row.get("account_id"),
        access_mode: row.get("access_mode"),
        model: row.get("model"),
        reasoning_level: row.get("reasoning_level"),
        execution_settings_json: row.get("execution_settings_json"),
        repository_scope: row.get("repository_scope"),
        stage: row.get("stage"),
        sort_position: row.get("sort_position"),
        execution_state: row.get("execution_state"),
        review_state: row.get("review_state"),
        review_channel: row.get("review_channel"),
        current_attempt_id: row.get("current_attempt_id"),
        state_version: row.get("state_version"),
        archived_at: row.get("archived_at"),
        deleted_at: row.get("deleted_at"),
        approved_at: row.get("approved_at"),
        last_error: row.get("last_error"),
        has_inherited_context: row
            .get::<Option<String>, _>("inherited_context")
            .is_some_and(|context| !context.trim().is_empty()),
        has_started_turn: row.get::<i64, _>("has_started_turn") != 0,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        repositories,
        pull_requests,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_card_for_chat(
    app: AppHandle,
    chat_id: i64,
) -> Result<Option<KanbanCardDto>, String> {
    if chat_id <= 0 {
        return Err("The Kanban chat identifier is invalid.".to_string());
    }
    let mut connection = open_database(&app).await?;
    let card_id = sqlx::query_scalar::<_, String>(
        "SELECT id FROM kanban_cards
         WHERE chat_id = ?1 AND deleted_at IS NULL
         ORDER BY created_at DESC, id DESC
         LIMIT 1",
    )
    .bind(chat_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|error| format!("The Kanban card conversation could not be loaded: {error}"))?;
    match card_id {
        Some(card_id) => load_card(&mut *connection, &card_id).await.map(Some),
        None => Ok(None),
    }
}

async fn load_attempt(
    connection: &mut SqliteConnection,
    attempt_id: &str,
) -> Result<KanbanAttemptDto, String> {
    let row = sqlx::query(
        "SELECT id, card_id, generation, attempt_kind, status, prompt, run_id,
            task_id, thread_id, turn_id, execution_root, last_event_sequence,
            error, started_at, completed_at
         FROM kanban_attempts WHERE id = ?1",
    )
    .bind(attempt_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|error| format!("The card attempt could not be loaded: {error}"))?
    .ok_or_else(|| "The card attempt no longer exists.".to_string())?;
    Ok(KanbanAttemptDto {
        id: row.get("id"),
        card_id: row.get("card_id"),
        generation: row.get("generation"),
        kind: row.get("attempt_kind"),
        status: row.get("status"),
        prompt: row.get("prompt"),
        run_id: row.get("run_id"),
        task_id: row.get("task_id"),
        thread_id: row.get("thread_id"),
        turn_id: row.get("turn_id"),
        execution_root: row.get("execution_root"),
        last_event_sequence: row.get("last_event_sequence"),
        error: row.get("error"),
        started_at: row.get("started_at"),
        completed_at: row.get("completed_at"),
    })
}

async fn replace_repositories(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    card_id: &str,
    repositories: &[KanbanRepositorySelectionInput],
) -> Result<(), String> {
    sqlx::query("DELETE FROM kanban_card_repository_selections WHERE card_id = ?1")
        .bind(card_id)
        .execute(&mut **transaction)
        .await
        .map_err(|error| format!("The repository selection could not be updated: {error}"))?;
    for repository in repositories {
        let path = repository.repository_path.trim();
        let relative_path = if repository.relative_path.trim().is_empty() {
            "."
        } else {
            repository.relative_path.trim()
        };
        let label = if repository.label.trim().is_empty() {
            relative_path
        } else {
            repository.label.trim()
        };
        sqlx::query(
            "INSERT INTO kanban_card_repository_selections (
                card_id, repository_path, relative_path, label, include_dirty
             ) VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(card_id)
        .bind(path)
        .bind(relative_path)
        .bind(label)
        .bind(repository.include_dirty_changes)
        .execute(&mut **transaction)
        .await
        .map_err(|error| format!("The repository selection could not be saved: {error}"))?;
    }
    Ok(())
}

fn execution_state_for_attempt_status(status: &str) -> Option<&'static str> {
    match status {
        "provisioning" | "starting" => Some("starting"),
        "running" => Some("running"),
        "waiting_user" => Some("waiting_user"),
        "waiting_approval" => Some("waiting_approval"),
        "pause_requested" => Some("running"),
        "paused" => Some("paused"),
        "stop_requested" => Some("running"),
        "stopped" => Some("stopped"),
        "blocked" => Some("blocked"),
        "failed" => Some("failed"),
        "interrupted" => Some("interrupted"),
        "completed" => Some("completed"),
        _ => None,
    }
}

fn attempt_status_transition_allowed(current: &str, next: &str) -> bool {
    if current == next {
        return !matches!(current, "completed" | "failed" | "stopped" | "interrupted");
    }
    match current {
        "provisioning" | "starting" => matches!(
            next,
            "running"
                | "waiting_user"
                | "waiting_approval"
                | "pause_requested"
                | "stop_requested"
                | "paused"
                | "blocked"
                | "failed"
                | "stopped"
                | "interrupted"
                | "completed"
        ),
        "running" | "waiting_user" | "waiting_approval" => matches!(
            next,
            "running"
                | "waiting_user"
                | "waiting_approval"
                | "pause_requested"
                | "stop_requested"
                | "paused"
                | "blocked"
                | "failed"
                | "stopped"
                | "interrupted"
                | "completed"
        ),
        "pause_requested" => matches!(
            next,
            "running" | "paused" | "blocked" | "failed" | "stopped" | "interrupted" | "completed"
        ),
        "stop_requested" => {
            matches!(
                next,
                "running" | "blocked" | "failed" | "stopped" | "interrupted" | "completed"
            )
        }
        "paused" | "blocked" => matches!(next, "failed" | "stopped" | "interrupted"),
        "completed" | "failed" | "stopped" | "interrupted" => false,
        _ => false,
    }
}

async fn card_workspace_id(
    connection: &mut SqliteConnection,
    card_id: &str,
) -> Result<i64, String> {
    sqlx::query_scalar("SELECT workspace_id FROM kanban_cards WHERE id = ?1")
        .bind(card_id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(|error| format!("The Kanban card could not be loaded: {error}"))?
        .ok_or_else(|| "The Kanban card no longer exists.".to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_board_snapshot(
    app: AppHandle,
    workspace_id: i64,
    include_archived: Option<bool>,
) -> Result<KanbanBoardSnapshotDto, String> {
    let mut connection = open_database(&app).await?;
    ensure_board(&mut connection, workspace_id).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("The Kanban board snapshot could not start: {error}"))?;
    let board =
        sqlx::query("SELECT revision, preferences_json FROM kanban_boards WHERE workspace_id = ?1")
            .bind(workspace_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|error| format!("The Kanban board could not be loaded: {error}"))?;
    let column_rows = sqlx::query(
        "SELECT column_key, position FROM kanban_columns
         WHERE workspace_id = ?1 ORDER BY position, column_key",
    )
    .bind(workspace_id)
    .fetch_all(&mut *transaction)
    .await
    .map_err(|error| format!("The Kanban columns could not be loaded: {error}"))?;
    let card_rows = sqlx::query(
        "SELECT id FROM kanban_cards
         WHERE workspace_id = ?1 AND deleted_at IS NULL
           AND (?2 = 1 OR archived_at IS NULL)
         ORDER BY stage, sort_position, created_at, id",
    )
    .bind(workspace_id)
    .bind(include_archived.unwrap_or(false))
    .fetch_all(&mut *transaction)
    .await
    .map_err(|error| format!("The Kanban cards could not be loaded: {error}"))?;
    let mut cards = Vec::with_capacity(card_rows.len());
    for row in card_rows {
        let card_id: String = row.get("id");
        cards.push(load_card(&mut transaction, &card_id).await?);
    }
    let snapshot = KanbanBoardSnapshotDto {
        workspace_id,
        revision: board.get("revision"),
        preferences_json: board.get("preferences_json"),
        columns: column_rows
            .into_iter()
            .map(|row| KanbanColumnDto {
                key: row.get("column_key"),
                position: row.get("position"),
            })
            .collect(),
        cards,
    };
    transaction
        .commit()
        .await
        .map_err(|error| format!("The Kanban board snapshot could not finish: {error}"))?;
    Ok(snapshot)
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_create_card(
    app: AppHandle,
    request: CreateKanbanCardRequest,
) -> Result<KanbanCardDto, String> {
    validate_identifier(&request.id, "card")?;
    validate_card_content(&request.title, &request.description)?;
    validate_access(&request.access_mode)?;
    validate_repository_scope(&request.repository_scope)?;
    validate_repositories(&request.repository_scope, &request.repositories)?;
    if let Some(settings) = request.execution_settings_json.as_deref() {
        let value: serde_json::Value = serde_json::from_str(settings)
            .map_err(|_| "The card execution settings are not valid JSON.".to_string())?;
        if !value.is_object() {
            return Err("The card execution settings must be a JSON object.".to_string());
        }
    }
    let fallback_title = request
        .title_fallback
        .as_deref()
        .map(str::trim)
        .filter(|title| !title.is_empty());
    if request.generate_title && fallback_title.is_none() {
        return Err("A fallback title is required while generating a card title.".to_string());
    }
    let request_fingerprint = operation_fingerprint(&request)?;
    let mut connection = open_database(&app).await?;
    ensure_board(&mut connection, request.workspace_id).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("The Kanban card could not be created: {error}"))?;
    if !insert_operation(
        &mut transaction,
        &request.operation_id,
        None,
        request.workspace_id,
        "create_card",
        &request_fingerprint,
    )
    .await?
    {
        transaction
            .rollback()
            .await
            .map_err(|error| format!("The Kanban operation could not be restored: {error}"))?;
        return load_card(&mut connection, &request.id).await;
    }
    let profile_key = request
        .account_id
        .map(|account_id| format!("account:{account_id}"))
        .unwrap_or_else(|| "default".to_string());
    let chat = sqlx::query(
        "INSERT INTO chats (
            workspace_id, account_id, title, status, origin, profile_key, surface,
            title_generation_state, title_fallback
         ) VALUES (?1, ?2, ?3, 'draft', 'orchestrator', ?4, 'kanban', ?5, ?6)",
    )
    .bind(request.workspace_id)
    .bind(request.account_id)
    .bind(request.title.trim())
    .bind(profile_key)
    .bind(if request.generate_title {
        "pending"
    } else {
        "complete"
    })
    .bind(if request.generate_title {
        fallback_title
    } else {
        None
    })
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The card conversation could not be created: {error}"))?;
    let chat_id = chat.last_insert_rowid();
    let next_position: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(sort_position), 0) + ?2
         FROM kanban_cards
         WHERE workspace_id = ?1 AND stage = 'todo' AND deleted_at IS NULL",
    )
    .bind(request.workspace_id)
    .bind(POSITION_STEP)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| format!("The card position could not be allocated: {error}"))?;
    sqlx::query(
        "INSERT INTO kanban_cards (
            id, workspace_id, chat_id, title, description, account_id,
            access_mode, model, reasoning_level, execution_settings_json,
            repository_scope, stage,
            sort_position, execution_state, review_state
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
            'todo', ?12, 'idle', 'none'
         )",
    )
    .bind(&request.id)
    .bind(request.workspace_id)
    .bind(chat_id)
    .bind(request.title.trim())
    .bind(request.description.trim())
    .bind(request.account_id)
    .bind(&request.access_mode)
    .bind(request.model.as_deref())
    .bind(request.reasoning_level.as_deref())
    .bind(request.execution_settings_json.as_deref())
    .bind(&request.repository_scope)
    .bind(next_position)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The Kanban card could not be saved: {error}"))?;
    replace_repositories(&mut transaction, &request.id, &request.repositories).await?;
    sqlx::query("UPDATE kanban_operations SET card_id = ?1 WHERE operation_id = ?2")
        .bind(&request.id)
        .bind(&request.operation_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The Kanban operation could not be linked: {error}"))?;
    sqlx::query(
        "UPDATE kanban_boards SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
         WHERE workspace_id = ?1",
    )
    .bind(request.workspace_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
    complete_operation(&mut transaction, &request.operation_id).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("The Kanban card could not be created: {error}"))?;
    load_card(&mut connection, &request.id).await
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_update_card(
    app: AppHandle,
    request: UpdateKanbanCardRequest,
) -> Result<KanbanCardDto, String> {
    validate_card_content(&request.title, &request.description)?;
    validate_access(&request.access_mode)?;
    validate_repository_scope(&request.repository_scope)?;
    validate_repositories(&request.repository_scope, &request.repositories)?;
    if let Some(settings) = request.execution_settings_json.as_deref() {
        let value: serde_json::Value = serde_json::from_str(settings)
            .map_err(|_| "The card execution settings are not valid JSON.".to_string())?;
        if !value.is_object() {
            return Err("The card execution settings must be a JSON object.".to_string());
        }
    }
    let request_fingerprint = operation_fingerprint(&request)?;
    let mut connection = open_database(&app).await?;
    let workspace_id = card_workspace_id(&mut connection, &request.card_id).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("The Kanban card could not be updated: {error}"))?;
    if !insert_operation(
        &mut transaction,
        &request.operation_id,
        Some(&request.card_id),
        workspace_id,
        "update_card",
        &request_fingerprint,
    )
    .await?
    {
        transaction.rollback().await.ok();
        return load_card(&mut connection, &request.card_id).await;
    }
    let bound_configuration = sqlx::query(
        "SELECT account_id, access_mode, model, reasoning_level, execution_settings_json,
                repository_scope
         FROM kanban_cards
         WHERE id = ?1 AND EXISTS (
           SELECT 1 FROM kanban_repository_bindings binding
           WHERE binding.card_id = kanban_cards.id AND binding.state != 'removed'
         )",
    )
    .bind(&request.card_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| format!("The card execution settings could not be checked: {error}"))?;
    if let Some(configuration) = bound_configuration {
        let settings_match = configuration.get::<Option<i64>, _>("account_id")
            == request.account_id
            && configuration.get::<String, _>("access_mode") == request.access_mode
            && configuration.get::<Option<String>, _>("model") == request.model
            && configuration.get::<Option<String>, _>("reasoning_level") == request.reasoning_level
            && configuration.get::<Option<String>, _>("execution_settings_json")
                == request.execution_settings_json
            && configuration.get::<String, _>("repository_scope") == request.repository_scope;
        let existing_repositories = sqlx::query(
            "SELECT repository_path, relative_path, label, include_dirty
             FROM kanban_card_repository_selections WHERE card_id = ?1
             ORDER BY repository_path",
        )
        .bind(&request.card_id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(|error| format!("The repository selection could not be checked: {error}"))?
        .into_iter()
        .map(|row| {
            (
                row.get::<String, _>("repository_path"),
                row.get::<String, _>("relative_path"),
                row.get::<String, _>("label"),
                row.get::<bool, _>("include_dirty"),
            )
        })
        .collect::<Vec<_>>();
        let mut requested_repositories = request
            .repositories
            .iter()
            .map(|repository| {
                let relative_path = if repository.relative_path.trim().is_empty() {
                    "."
                } else {
                    repository.relative_path.trim()
                };
                let label = if repository.label.trim().is_empty() {
                    relative_path
                } else {
                    repository.label.trim()
                };
                (
                    repository.repository_path.trim().to_string(),
                    relative_path.to_string(),
                    label.to_string(),
                    repository.include_dirty_changes,
                )
            })
            .collect::<Vec<_>>();
        requested_repositories.sort_by(|left, right| left.0.cmp(&right.0));
        if !settings_match || existing_repositories != requested_repositories {
            transaction.rollback().await.ok();
            return Err(
                "Execution settings and repositories are locked after this card first starts."
                    .to_string(),
            );
        }
    }
    let active_states = ACTIVE_ATTEMPT_STATES
        .iter()
        .map(|value| format!("'{value}'"))
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!(
        "UPDATE kanban_cards
         SET title = ?1, description = ?2, account_id = ?3, access_mode = ?4,
             model = ?5, reasoning_level = ?6, execution_settings_json = ?7,
             repository_scope = ?8,
             state_version = state_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?9 AND state_version = ?10 AND archived_at IS NULL AND deleted_at IS NULL
           AND execution_state NOT IN ({active_states})"
    );
    let result = sqlx::query(&sql)
        .bind(request.title.trim())
        .bind(request.description.trim())
        .bind(request.account_id)
        .bind(&request.access_mode)
        .bind(request.model.as_deref())
        .bind(request.reasoning_level.as_deref())
        .bind(request.execution_settings_json.as_deref())
        .bind(&request.repository_scope)
        .bind(&request.card_id)
        .bind(request.expected_version)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The Kanban card could not be updated: {error}"))?;
    if result.rows_affected() != 1 {
        transaction.rollback().await.ok();
        return Err("The card changed or is active. Refresh it and try again.".to_string());
    }
    replace_repositories(&mut transaction, &request.card_id, &request.repositories).await?;
    let profile_key = request
        .account_id
        .map(|account_id| format!("account:{account_id}"))
        .unwrap_or_else(|| "default".to_string());
    sqlx::query(
        "UPDATE chats SET title = ?1, account_id = ?2, profile_key = ?3,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = (SELECT chat_id FROM kanban_cards WHERE id = ?4)",
    )
    .bind(request.title.trim())
    .bind(request.account_id)
    .bind(profile_key)
    .bind(&request.card_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The card conversation could not be renamed: {error}"))?;
    sqlx::query("UPDATE kanban_boards SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1")
        .bind(workspace_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
    complete_operation(&mut transaction, &request.operation_id).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("The Kanban card could not be updated: {error}"))?;
    load_card(&mut connection, &request.card_id).await
}

async fn ordered_stage_positions(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    workspace_id: i64,
    stage: &str,
    excluded_card_id: &str,
) -> Result<Vec<(String, i64)>, String> {
    let rows = sqlx::query(
        "SELECT id, sort_position FROM kanban_cards
         WHERE workspace_id = ?1 AND stage = ?2 AND id != ?3
           AND archived_at IS NULL AND deleted_at IS NULL
         ORDER BY sort_position, id",
    )
    .bind(workspace_id)
    .bind(stage)
    .bind(excluded_card_id)
    .fetch_all(&mut **transaction)
    .await
    .map_err(|error| format!("The card positions could not be resolved: {error}"))?;
    Ok(rows
        .into_iter()
        .map(|row| (row.get("id"), row.get("sort_position")))
        .collect())
}

fn validated_anchor_positions(
    cards: &[(String, i64)],
    before_card_id: Option<&str>,
    after_card_id: Option<&str>,
) -> Result<(Option<i64>, Option<i64>), String> {
    let before = before_card_id
        .map(|card_id| {
            cards
                .iter()
                .position(|(id, _)| id == card_id)
                .ok_or_else(|| {
                    "A card move anchor changed columns or no longer exists. Refresh and try again."
                        .to_string()
                })
        })
        .transpose()?;
    let after = after_card_id
        .map(|card_id| {
            cards
                .iter()
                .position(|(id, _)| id == card_id)
                .ok_or_else(|| {
                    "A card move anchor changed columns or no longer exists. Refresh and try again."
                        .to_string()
                })
        })
        .transpose()?;

    let adjacent = match (before, after) {
        (Some(before), Some(after)) => after.checked_add(1) == Some(before),
        (Some(before), None) => before == 0,
        (None, Some(after)) => after.checked_add(1) == Some(cards.len()),
        (None, None) => true,
    };
    if !adjacent {
        return Err(
            "The card move anchors are no longer adjacent. Refresh or clear filters and try again."
                .to_string(),
        );
    }

    Ok((
        before.map(|index| cards[index].1),
        after.map(|index| cards[index].1),
    ))
}

async fn rebalance_stage_positions(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    workspace_id: i64,
    stage: &str,
) -> Result<(), String> {
    let card_ids: Vec<String> = sqlx::query_scalar(
        "SELECT id FROM kanban_cards
         WHERE workspace_id = ?1 AND stage = ?2
           AND archived_at IS NULL AND deleted_at IS NULL
         ORDER BY sort_position, id",
    )
    .bind(workspace_id)
    .bind(stage)
    .fetch_all(&mut **transaction)
    .await
    .map_err(|error| format!("The card positions could not be rebalanced: {error}"))?;
    for (index, card_id) in card_ids.iter().enumerate() {
        sqlx::query("UPDATE kanban_cards SET sort_position = ?1 WHERE id = ?2")
            .bind((index as i64 + 1) * POSITION_STEP)
            .bind(card_id)
            .execute(&mut **transaction)
            .await
            .map_err(|error| format!("The card positions could not be rebalanced: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_move_card(
    app: AppHandle,
    request: MoveKanbanCardRequest,
) -> Result<KanbanCardDto, String> {
    validate_stage(&request.target_stage)?;
    if request.before_card_id.as_deref() == Some(request.card_id.as_str())
        || request.after_card_id.as_deref() == Some(request.card_id.as_str())
        || (request.before_card_id.is_some()
            && request.before_card_id.as_deref() == request.after_card_id.as_deref())
    {
        return Err("The card move anchors are invalid.".to_string());
    }
    let request_fingerprint = operation_fingerprint(&request)?;
    let mut connection = open_database(&app).await?;
    let workspace_id = card_workspace_id(&mut connection, &request.card_id).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("The card could not be moved: {error}"))?;
    if !insert_operation(
        &mut transaction,
        &request.operation_id,
        Some(&request.card_id),
        workspace_id,
        "move_card",
        &request_fingerprint,
    )
    .await?
    {
        transaction.rollback().await.ok();
        return load_card(&mut connection, &request.card_id).await;
    }
    let lifecycle = sqlx::query(
        "SELECT stage, execution_state FROM kanban_cards
         WHERE id = ?1 AND state_version = ?2
           AND archived_at IS NULL AND deleted_at IS NULL",
    )
    .bind(&request.card_id)
    .bind(request.expected_version)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| format!("The card lifecycle could not be checked: {error}"))?
    .ok_or_else(|| {
        "The card changed while it was being moved. Refresh and try again.".to_string()
    })?;
    let current_stage: String = lifecycle.get("stage");
    let execution_state: String = lifecycle.get("execution_state");
    let transition_allowed =
        move_transition_allowed(&current_stage, &execution_state, &request.target_stage);
    if !transition_allowed {
        transaction.rollback().await.ok();
        return Err(
            "That move requires the card's explicit start, review, or approval action.".to_string(),
        );
    }
    let mut stage_positions = ordered_stage_positions(
        &mut transaction,
        workspace_id,
        &request.target_stage,
        &request.card_id,
    )
    .await?;
    let (mut before, mut after) = validated_anchor_positions(
        &stage_positions,
        request.before_card_id.as_deref(),
        request.after_card_id.as_deref(),
    )?;
    let needs_rebalance = match (before, after) {
        (Some(before), Some(after)) => before.checked_sub(after).map_or(true, |gap| gap <= 1),
        (Some(before), None) => before.checked_sub(POSITION_STEP).is_none(),
        (None, Some(after)) => after.checked_add(POSITION_STEP).is_none(),
        (None, None) => stage_positions
            .last()
            .is_some_and(|(_, position)| position.checked_add(POSITION_STEP).is_none()),
    };
    if needs_rebalance {
        rebalance_stage_positions(&mut transaction, workspace_id, &request.target_stage).await?;
        stage_positions = ordered_stage_positions(
            &mut transaction,
            workspace_id,
            &request.target_stage,
            &request.card_id,
        )
        .await?;
        (before, after) = validated_anchor_positions(
            &stage_positions,
            request.before_card_id.as_deref(),
            request.after_card_id.as_deref(),
        )?;
    }
    let position = match (before, after) {
        (Some(before), Some(after)) if after < before => after + ((before - after) / 2),
        (Some(before), None) => before
            .checked_sub(POSITION_STEP)
            .ok_or_else(|| "The card position could not be allocated.".to_string())?,
        (None, Some(after)) => after
            .checked_add(POSITION_STEP)
            .ok_or_else(|| "The card position could not be allocated.".to_string())?,
        (None, None) => stage_positions
            .last()
            .map(|(_, position)| *position)
            .unwrap_or(0)
            .checked_add(POSITION_STEP)
            .ok_or_else(|| "The card position could not be allocated.".to_string())?,
        _ => {
            transaction.rollback().await.ok();
            return Err(
                "The card move anchors are out of order. Refresh and try again.".to_string(),
            );
        }
    };
    let result = sqlx::query(
        "UPDATE kanban_cards
         SET stage = ?1, sort_position = ?2, state_version = state_version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?3 AND state_version = ?4 AND archived_at IS NULL AND deleted_at IS NULL",
    )
    .bind(&request.target_stage)
    .bind(position)
    .bind(&request.card_id)
    .bind(request.expected_version)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The card could not be moved: {error}"))?;
    if result.rows_affected() != 1 {
        transaction.rollback().await.ok();
        return Err(
            "The card changed while it was being moved. Refresh and try again.".to_string(),
        );
    }
    sqlx::query("UPDATE kanban_boards SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1")
        .bind(workspace_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
    complete_operation(&mut transaction, &request.operation_id).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("The card move could not be saved: {error}"))?;
    load_card(&mut connection, &request.card_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_claim_attempt(
    app: AppHandle,
    request: ClaimKanbanAttemptRequest,
) -> Result<ClaimKanbanAttemptResult, String> {
    validate_identifier(&request.attempt_id, "attempt")?;
    validate_identifier(&request.operation_id, "operation")?;
    if !matches!(
        request.kind.as_str(),
        "start" | "retry" | "resume" | "request_changes" | "implement_plan"
    ) {
        return Err("The card attempt kind is invalid.".to_string());
    }
    if request.prompt.trim().is_empty() || request.prompt.chars().count() > MAX_DESCRIPTION_CHARS {
        return Err("The card attempt requires valid instructions.".to_string());
    }
    serde_json::from_str::<serde_json::Value>(&request.config_snapshot_json)
        .map_err(|_| "The card execution settings are invalid.".to_string())?;
    let implementation_settings = if request.kind == "implement_plan" {
        Some(implementation_execution_settings(
            request.execution_settings_json.as_deref(),
        )?)
    } else {
        if request.execution_settings_json.is_some() {
            return Err(
                "Only an accepted Plan can replace the card execution settings.".to_string(),
            );
        }
        None
    };
    let request_fingerprint = operation_fingerprint(&request)?;
    let mut connection = open_database(&app).await?;
    let workspace_id = card_workspace_id(&mut connection, &request.card_id).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("The card could not start: {error}"))?;
    if !insert_operation(
        &mut transaction,
        &request.operation_id,
        Some(&request.card_id),
        workspace_id,
        "claim_attempt",
        &request_fingerprint,
    )
    .await?
    {
        transaction.rollback().await.ok();
        return Ok(ClaimKanbanAttemptResult {
            card: load_card(&mut connection, &request.card_id).await?,
            attempt: load_attempt(&mut connection, &request.attempt_id).await?,
        });
    }
    let lifecycle = sqlx::query(
        "SELECT stage, execution_state, review_state, current_attempt_id,
                execution_settings_json
         FROM kanban_cards
         WHERE id = ?1 AND state_version = ?2
           AND archived_at IS NULL AND deleted_at IS NULL",
    )
    .bind(&request.card_id)
    .bind(request.expected_version)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| format!("The card lifecycle could not be checked: {error}"))?
    .ok_or_else(|| "The card changed before it could start. Refresh and try again.".to_string())?;
    if !claim_transition_allowed(
        &request.kind,
        lifecycle.get::<String, _>("stage").as_str(),
        lifecycle.get::<String, _>("execution_state").as_str(),
        lifecycle.get::<String, _>("review_state").as_str(),
    ) {
        transaction.rollback().await.ok();
        return Err(
            "This card cannot start that kind of attempt from its current state.".to_string(),
        );
    }
    let reviewed_attempt_id = lifecycle.get::<Option<String>, _>("current_attempt_id");
    let implementation_plan = if request.kind == "implement_plan" {
        let reviewed_attempt_id = reviewed_attempt_id
            .as_deref()
            .ok_or_else(|| "This Plan card has no completed attempt to accept.".to_string())?;
        let plan = sqlx::query(
            "SELECT result.plan_text, result.run_id, card.execution_settings_json
             FROM kanban_plan_results AS result
             JOIN kanban_cards AS card ON card.id = result.card_id
             WHERE result.card_id = ?1 AND result.attempt_id = ?2
               AND result.decision = 'awaiting_review'",
        )
        .bind(&request.card_id)
        .bind(reviewed_attempt_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| format!("The approved plan could not be loaded: {error}"))?
        .ok_or_else(|| {
            "Only the latest Plan result awaiting review can be accepted.".to_string()
        })?;
        let source_settings = plan.get::<Option<String>, _>("execution_settings_json");
        if !execution_settings_are_plan_mode(source_settings.as_deref()) {
            transaction.rollback().await.ok();
            return Err("Only a Plan-mode card can start plan implementation.".to_string());
        }
        Some((
            plan.get::<String, _>("plan_text"),
            plan.get::<i64, _>("run_id"),
        ))
    } else {
        None
    };
    let retry_prompt = if matches!(request.kind.as_str(), "retry" | "resume")
        && execution_settings_are_plan_implementation(
            lifecycle
                .get::<Option<String>, _>("execution_settings_json")
                .as_deref(),
        ) {
        match reviewed_attempt_id.as_deref() {
            Some(attempt_id) => sqlx::query_scalar::<_, String>(
                "SELECT prompt FROM kanban_attempts WHERE id = ?1 AND card_id = ?2",
            )
            .bind(attempt_id)
            .bind(&request.card_id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(|error| {
                format!("The implementation retry prompt could not be loaded: {error}")
            })?,
            None => None,
        }
    } else {
        None
    };
    let attempt_prompt = implementation_plan
        .as_ref()
        .map(|(plan_text, _)| format!("Implement this approved plan:\n\n{}", plan_text.trim()))
        .or(retry_prompt)
        .unwrap_or_else(|| request.prompt.trim().to_string());
    let generation: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(generation), 0) + 1 FROM kanban_attempts WHERE card_id = ?1",
    )
    .bind(&request.card_id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| format!("The card attempt could not be allocated: {error}"))?;
    sqlx::query(
        "INSERT INTO kanban_attempts (
            id, card_id, generation, attempt_kind, status, prompt,
            config_snapshot_json
         ) VALUES (?1, ?2, ?3, ?4, 'provisioning', ?5, ?6)",
    )
    .bind(&request.attempt_id)
    .bind(&request.card_id)
    .bind(generation)
    .bind(&request.kind)
    .bind(&attempt_prompt)
    .bind(&request.config_snapshot_json)
    .execute(&mut *transaction)
    .await
    .map_err(|error| {
        if error.to_string().contains("UNIQUE") {
            "This card already has an active attempt.".to_string()
        } else {
            format!("The card attempt could not be created: {error}")
        }
    })?;
    let result = if let Some(settings) = implementation_settings.as_ref() {
        sqlx::query(
            "UPDATE kanban_cards
             SET stage = 'in_progress', execution_state = 'starting', review_state = 'none',
                 review_channel = NULL, current_attempt_id = ?1, last_error = NULL,
                 approved_at = NULL, account_id = ?2, access_mode = ?3, model = ?4,
                 reasoning_level = ?5, execution_settings_json = ?6,
                 state_version = state_version + 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?7 AND state_version = ?8 AND current_attempt_id = ?9
               AND stage = 'in_review' AND execution_state = 'completed'
               AND review_state = 'awaiting_review'
               AND archived_at IS NULL AND deleted_at IS NULL",
        )
        .bind(&request.attempt_id)
        .bind(settings.account_id)
        .bind(&settings.access_mode)
        .bind(settings.model.as_deref())
        .bind(settings.reasoning_level.as_deref())
        .bind(&settings.encoded)
        .bind(&request.card_id)
        .bind(request.expected_version)
        .bind(reviewed_attempt_id.as_deref())
        .execute(&mut *transaction)
        .await
    } else {
        sqlx::query(
            "UPDATE kanban_cards
             SET stage = 'in_progress', execution_state = 'starting', review_state =
                   CASE WHEN ?1 = 'request_changes' THEN 'changes_requested' ELSE review_state END,
                 current_attempt_id = ?2, last_error = NULL,
                 state_version = state_version + 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?3 AND state_version = ?4 AND archived_at IS NULL AND deleted_at IS NULL
               AND (
                 (?1 = 'start' AND stage = 'todo' AND execution_state = 'idle')
                 OR (?1 = 'retry' AND execution_state IN ('failed','stopped'))
                 OR (?1 = 'resume' AND execution_state IN ('paused','blocked','interrupted'))
                 OR (?1 = 'request_changes' AND stage = 'in_review'
                     AND execution_state = 'completed' AND review_state = 'awaiting_review')
               )",
        )
        .bind(&request.kind)
        .bind(&request.attempt_id)
        .bind(&request.card_id)
        .bind(request.expected_version)
        .execute(&mut *transaction)
        .await
    }
    .map_err(|error| format!("The card could not be claimed: {error}"))?;
    if result.rows_affected() != 1 {
        transaction.rollback().await.ok();
        return Err("The card changed before it could start. Refresh and try again.".to_string());
    }
    if request.kind == "request_changes" {
        sqlx::query(
            "UPDATE runs SET plan_review_state = 'superseded'
             WHERE id = (
                 SELECT run_id FROM kanban_plan_results
                 WHERE attempt_id = ?1 AND card_id = ?2 AND decision = 'awaiting_review'
             )",
        )
        .bind(reviewed_attempt_id.as_deref())
        .bind(&request.card_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The prior plan run could not be superseded: {error}"))?;
        sqlx::query(
            "UPDATE kanban_plan_results
             SET decision = 'superseded', updated_at = CURRENT_TIMESTAMP
             WHERE attempt_id = ?1 AND card_id = ?2 AND decision = 'awaiting_review'",
        )
        .bind(reviewed_attempt_id.as_deref())
        .bind(&request.card_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The prior plan could not be superseded: {error}"))?;
        sqlx::query(
            "INSERT INTO kanban_review_decisions (card_id, attempt_id, decision, message)
             VALUES (?1, ?2, 'changes_requested', ?3)",
        )
        .bind(&request.card_id)
        .bind(reviewed_attempt_id.as_deref())
        .bind(request.prompt.trim())
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The review decision could not be saved: {error}"))?;
    } else if let Some((_, run_id)) = implementation_plan {
        let reviewed_attempt_id = reviewed_attempt_id
            .as_deref()
            .ok_or_else(|| "The approved Plan attempt is no longer available.".to_string())?;
        let plan_update = sqlx::query(
            "UPDATE kanban_plan_results
             SET decision = 'accepted', decided_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE card_id = ?1 AND attempt_id = ?2 AND decision = 'awaiting_review'",
        )
        .bind(&request.card_id)
        .bind(reviewed_attempt_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The accepted plan result could not be saved: {error}"))?;
        if plan_update.rows_affected() != 1 {
            transaction.rollback().await.ok();
            return Err("The Plan result changed while it was being accepted.".to_string());
        }
        sqlx::query("UPDATE runs SET plan_review_state = 'approved' WHERE id = ?1")
            .bind(run_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("The accepted plan run could not be saved: {error}"))?;
        sqlx::query(
            "INSERT INTO kanban_review_decisions (card_id, attempt_id, decision)
             VALUES (?1, ?2, 'approved')",
        )
        .bind(&request.card_id)
        .bind(reviewed_attempt_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The plan review decision could not be saved: {error}"))?;
    }
    sqlx::query("UPDATE kanban_boards SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1")
        .bind(workspace_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
    complete_operation(&mut transaction, &request.operation_id).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("The card start could not be saved: {error}"))?;
    Ok(ClaimKanbanAttemptResult {
        card: load_card(&mut connection, &request.card_id).await?,
        attempt: load_attempt(&mut connection, &request.attempt_id).await?,
    })
}

async fn card_has_pending_follow_up(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    card_id: &str,
    current_run_id: Option<i64>,
    current_turn_id: Option<&str>,
) -> Result<bool, String> {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(
            SELECT 1
            FROM prompt_queue_items AS queue
            JOIN kanban_cards AS queued_card ON queued_card.chat_id = queue.chat_id
            WHERE queued_card.id = ?1
              AND queue.status IN (
                'queued','scheduled-next','starting','steering','active','stale'
              )
              AND (queue.auto_send_enabled = 1 OR queue.send_now_priority IS NOT NULL)
              AND NOT (
                (?2 IS NOT NULL AND COALESCE(queue.linked_run_id = ?2, 0))
                OR (?3 IS NOT NULL AND COALESCE(queue.linked_turn_id = ?3, 0))
              )
        )",
    )
    .bind(card_id)
    .bind(current_run_id)
    .bind(current_turn_id)
    .fetch_one(&mut **transaction)
    .await
    .map_err(|error| format!("The card follow-up queue could not be checked: {error}"))
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_update_attempt(
    app: AppHandle,
    mut request: UpdateKanbanAttemptRequest,
) -> Result<ClaimKanbanAttemptResult, String> {
    if request.sequence <= 0 {
        return Err("The card attempt event sequence is invalid.".to_string());
    }
    let mut connection = open_database(&app).await?;
    let workspace_id = card_workspace_id(&mut connection, &request.card_id).await?;
    let execution_settings_json: Option<String> =
        sqlx::query_scalar("SELECT execution_settings_json FROM kanban_cards WHERE id = ?1")
            .bind(&request.card_id)
            .fetch_one(&mut *connection)
            .await
            .map_err(|error| format!("The card execution settings could not be loaded: {error}"))?;
    let requested_plan_completion = request.status == "completed"
        && execution_settings_are_plan_mode(execution_settings_json.as_deref());
    if requested_plan_completion {
        let invalid_plan = request
            .completed_plan
            .as_ref()
            .map(validate_completed_plan)
            .unwrap_or_else(|| {
                Err("The Plan-mode attempt completed without a reviewable plan.".to_string())
            })
            .err();
        if let Some(error) = invalid_plan {
            request.status = "failed".to_string();
            request.error = Some(error);
            request.completed_plan = None;
        }
    }
    if request.completed_plan.is_some() && !requested_plan_completion {
        return Err("Only a completed Plan-mode card can save a plan result.".to_string());
    }
    let plan_completion = requested_plan_completion && request.status == "completed";
    let execution_state = execution_state_for_attempt_status(&request.status)
        .ok_or_else(|| "The card execution state is invalid.".to_string())?;
    let terminal = matches!(
        request.status.as_str(),
        "completed" | "failed" | "stopped" | "interrupted"
    );
    let request_fingerprint = operation_fingerprint(&request)?;
    let github_review_available = request.status == "completed"
        && !plan_completion
        && crate::github::github_review_available(&app).await;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("The card attempt could not be updated: {error}"))?;
    if !insert_operation(
        &mut transaction,
        &request.operation_id,
        Some(&request.card_id),
        workspace_id,
        "update_attempt",
        &request_fingerprint,
    )
    .await?
    {
        transaction.rollback().await.ok();
        return Ok(ClaimKanbanAttemptResult {
            card: load_card(&mut connection, &request.card_id).await?,
            attempt: load_attempt(&mut connection, &request.attempt_id).await?,
        });
    }
    let current_attempt = sqlx::query(
        "SELECT status, last_event_sequence FROM kanban_attempts
         WHERE id = ?1 AND card_id = ?2 AND generation = ?3",
    )
    .bind(&request.attempt_id)
    .bind(&request.card_id)
    .bind(request.generation)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|error| format!("The card attempt could not be checked: {error}"))?
    .ok_or_else(|| "A stale card attempt tried to update this card.".to_string())?;
    let current_status: String = current_attempt.get("status");
    let last_event_sequence: i64 = current_attempt.get("last_event_sequence");
    if request.sequence <= last_event_sequence
        || !attempt_status_transition_allowed(&current_status, &request.status)
    {
        transaction.rollback().await.ok();
        return Err("A stale card attempt event was ignored.".to_string());
    }
    let attempt = sqlx::query(
        "UPDATE kanban_attempts
         SET status = ?1, run_id = COALESCE(?2, run_id), task_id = COALESCE(?3, task_id),
             thread_id = COALESCE(?4, thread_id), turn_id = COALESCE(?5, turn_id),
             execution_root = COALESCE(?6, execution_root), error = ?7,
             completed_at = CASE WHEN ?8 = 1 THEN CURRENT_TIMESTAMP ELSE completed_at END,
             last_event_sequence = ?9,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?10 AND card_id = ?11 AND generation = ?12
           AND last_event_sequence < ?9
           AND status NOT IN ('completed','failed','stopped','interrupted')",
    )
    .bind(&request.status)
    .bind(request.run_id)
    .bind(request.task_id)
    .bind(request.thread_id.as_deref())
    .bind(request.turn_id.as_deref())
    .bind(request.execution_root.as_deref())
    .bind(request.error.as_deref())
    .bind(terminal)
    .bind(request.sequence)
    .bind(&request.attempt_id)
    .bind(&request.card_id)
    .bind(request.generation)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The card attempt could not be updated: {error}"))?;
    if attempt.rows_affected() != 1 {
        transaction.rollback().await.ok();
        return Err("A stale card attempt tried to update this card.".to_string());
    }
    let review_channel = if request.status == "completed" && !plan_completion {
        Some(if github_review_available {
            "github"
        } else {
            "local"
        })
    } else {
        None
    };
    let card = sqlx::query(
        "UPDATE kanban_cards
         SET execution_state = ?1,
             stage = CASE WHEN ?2 = 'completed' THEN 'in_review' ELSE stage END,
             review_state = CASE WHEN ?2 = 'completed' THEN 'awaiting_review' ELSE review_state END,
             review_channel = CASE WHEN ?2 = 'completed' THEN ?3 ELSE review_channel END,
             last_error = ?4, state_version = state_version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?5 AND current_attempt_id = ?6 AND deleted_at IS NULL",
    )
    .bind(execution_state)
    .bind(&request.status)
    .bind(review_channel)
    .bind(request.error.as_deref())
    .bind(&request.card_id)
    .bind(&request.attempt_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The card execution state could not be updated: {error}"))?;
    if card.rows_affected() != 1 {
        transaction.rollback().await.ok();
        return Err("A stale card attempt was ignored.".to_string());
    }
    if let Some(plan) = request.completed_plan.as_ref() {
        let run_id = request
            .run_id
            .ok_or_else(|| "The completed plan has no persisted run.".to_string())?;
        sqlx::query(
            "INSERT INTO kanban_plan_results (
                attempt_id, card_id, run_id, plan_item_id, plan_text, decision
             ) VALUES (?1, ?2, ?3, ?4, ?5, 'awaiting_review')",
        )
        .bind(&request.attempt_id)
        .bind(&request.card_id)
        .bind(run_id)
        .bind(plan.item_id.trim())
        .bind(&plan.text)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The completed plan could not be saved: {error}"))?;
        let run_update = sqlx::query(
            "UPDATE runs
             SET collaboration_mode = 'plan', run_intent = 'plan',
                 completed_plan_item_id = ?1, completed_plan_text = ?2,
                 plan_review_state = 'available'
             WHERE id = ?3 AND chat_id = (
                 SELECT chat_id FROM kanban_cards WHERE id = ?4
             )",
        )
        .bind(plan.item_id.trim())
        .bind(&plan.text)
        .bind(run_id)
        .bind(&request.card_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The completed plan run could not be saved: {error}"))?;
        if run_update.rows_affected() != 1 {
            transaction.rollback().await.ok();
            return Err("The completed plan does not belong to this card's run.".to_string());
        }
    }
    let event_payload = serde_json::to_string(&request)
        .map_err(|_| "The card attempt event could not be encoded.".to_string())?;
    sqlx::query(
        "INSERT INTO kanban_runtime_events (
            card_id, attempt_id, generation, sequence, event_key,
            event_type, payload_json, applied
         ) VALUES (?1, ?2, ?3, ?4, ?5, 'attempt_status', ?6, 1)",
    )
    .bind(&request.card_id)
    .bind(&request.attempt_id)
    .bind(request.generation)
    .bind(request.sequence)
    .bind(&request.operation_id)
    .bind(event_payload)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The card attempt event could not be saved: {error}"))?;
    let publication_deferred = request.status == "completed"
        && !plan_completion
        && card_has_pending_follow_up(
            &mut transaction,
            &request.card_id,
            request.run_id,
            request.turn_id.as_deref(),
        )
        .await?;
    sqlx::query("UPDATE kanban_boards SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1")
        .bind(workspace_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
    complete_operation(&mut transaction, &request.operation_id).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("The card attempt could not be saved: {error}"))?;
    if request.status == "completed"
        && !plan_completion
        && review_channel == Some("github")
        && !publication_deferred
    {
        let app_for_publication = app.clone();
        let card_id = request.card_id.clone();
        tauri::async_runtime::spawn(async move {
            let _ = crate::github::enqueue_card_publication(app_for_publication, card_id).await;
        });
    }
    Ok(ClaimKanbanAttemptResult {
        card: load_card(&mut connection, &request.card_id).await?,
        attempt: load_attempt(&mut connection, &request.attempt_id).await?,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_reject_plan(
    app: AppHandle,
    request: RejectKanbanPlanRequest,
) -> Result<KanbanCardDto, String> {
    validate_identifier(&request.card_id, "card")?;
    validate_identifier(&request.attempt_id, "attempt")?;
    validate_identifier(&request.operation_id, "operation")?;
    let request_fingerprint = operation_fingerprint(&request)?;
    let mut connection = open_database(&app).await?;
    let existing_decision = sqlx::query_scalar::<_, String>(
        "SELECT decision FROM kanban_plan_results
         WHERE card_id = ?1 AND attempt_id = ?2",
    )
    .bind(&request.card_id)
    .bind(&request.attempt_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|error| format!("The plan decision could not be loaded: {error}"))?;
    if existing_decision.as_deref() == Some("rejected") {
        return load_card(&mut connection, &request.card_id).await;
    }
    if existing_decision.as_deref() == Some("accepted") {
        return Err("An accepted plan cannot be rejected.".to_string());
    }
    let workspace_id = card_workspace_id(&mut connection, &request.card_id).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("The plan rejection could not start: {error}"))?;
    if !insert_operation(
        &mut transaction,
        &request.operation_id,
        Some(&request.card_id),
        workspace_id,
        "reject_plan",
        &request_fingerprint,
    )
    .await?
    {
        transaction.rollback().await.ok();
        return load_card(&mut connection, &request.card_id).await;
    }
    let result = sqlx::query(
        "UPDATE kanban_cards
         SET stage = 'done', review_state = 'none', review_channel = NULL,
             approved_at = NULL, state_version = state_version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND state_version = ?2 AND current_attempt_id = ?3
           AND stage = 'in_review' AND execution_state = 'completed'
           AND review_state = 'awaiting_review'
           AND EXISTS (
               SELECT 1 FROM kanban_plan_results
               WHERE card_id = ?1 AND attempt_id = ?3 AND decision = 'awaiting_review'
           )",
    )
    .bind(&request.card_id)
    .bind(request.expected_version)
    .bind(&request.attempt_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The planning card could not be rejected: {error}"))?;
    if result.rows_affected() != 1 {
        transaction.rollback().await.ok();
        let decision = sqlx::query_scalar::<_, String>(
            "SELECT decision FROM kanban_plan_results
             WHERE card_id = ?1 AND attempt_id = ?2",
        )
        .bind(&request.card_id)
        .bind(&request.attempt_id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(|error| format!("The plan decision could not be restored: {error}"))?;
        if decision.as_deref() == Some("rejected") {
            return load_card(&mut connection, &request.card_id).await;
        }
        if decision.as_deref() == Some("accepted") {
            return Err("An accepted plan cannot be rejected.".to_string());
        }
        return Err(
            "Only the latest Plan card result awaiting review can be rejected.".to_string(),
        );
    }
    sqlx::query(
        "UPDATE runs SET plan_review_state = 'cancelled'
         WHERE id = (
             SELECT run_id FROM kanban_plan_results
             WHERE card_id = ?1 AND attempt_id = ?2
         )",
    )
    .bind(&request.card_id)
    .bind(&request.attempt_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The rejected plan run could not be saved: {error}"))?;
    sqlx::query(
        "UPDATE kanban_plan_results
         SET decision = 'rejected', decided_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE card_id = ?1 AND attempt_id = ?2 AND decision = 'awaiting_review'",
    )
    .bind(&request.card_id)
    .bind(&request.attempt_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The rejected plan result could not be saved: {error}"))?;
    sqlx::query(
        "UPDATE kanban_boards SET revision = revision + 1,
             updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1",
    )
    .bind(workspace_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
    complete_operation(&mut transaction, &request.operation_id).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("The plan rejection could not be saved: {error}"))?;
    load_card(&mut connection, &request.card_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_approve_card(
    app: AppHandle,
    request: VersionedKanbanCardRequest,
) -> Result<KanbanCardDto, String> {
    let request_fingerprint = operation_fingerprint(&request)?;
    let mut connection = open_database(&app).await?;
    let workspace_id = card_workspace_id(&mut connection, &request.card_id).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("The card could not be approved: {error}"))?;
    if !insert_operation(
        &mut transaction,
        &request.operation_id,
        Some(&request.card_id),
        workspace_id,
        "approve_card",
        &request_fingerprint,
    )
    .await?
    {
        transaction.rollback().await.ok();
        return load_card(&mut connection, &request.card_id).await;
    }
    let result = sqlx::query(
        "UPDATE kanban_cards SET stage = 'done', review_state = 'approved',
            approved_at = CURRENT_TIMESTAMP, state_version = state_version + 1,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND state_version = ?2 AND stage = 'in_review'
           AND execution_state = 'completed' AND review_state = 'awaiting_review'
           AND archived_at IS NULL AND deleted_at IS NULL",
    )
    .bind(&request.card_id)
    .bind(request.expected_version)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The card could not be approved: {error}"))?;
    if result.rows_affected() != 1 {
        transaction.rollback().await.ok();
        return Err("Only a completed card in review can be approved.".to_string());
    }
    sqlx::query(
        "INSERT INTO kanban_review_decisions (card_id, attempt_id, decision)
         VALUES (?1, (SELECT current_attempt_id FROM kanban_cards WHERE id = ?1), 'approved')",
    )
    .bind(&request.card_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The review decision could not be recorded: {error}"))?;
    sqlx::query("UPDATE kanban_boards SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1")
        .bind(workspace_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
    complete_operation(&mut transaction, &request.operation_id).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("The card approval could not be saved: {error}"))?;
    load_card(&mut connection, &request.card_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_reopen_card(
    app: AppHandle,
    request: VersionedKanbanCardRequest,
) -> Result<KanbanCardDto, String> {
    let request_fingerprint = operation_fingerprint(&request)?;
    let mut connection = open_database(&app).await?;
    let workspace_id = card_workspace_id(&mut connection, &request.card_id).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("The card could not be reopened: {error}"))?;
    if !insert_operation(
        &mut transaction,
        &request.operation_id,
        Some(&request.card_id),
        workspace_id,
        "reopen_card",
        &request_fingerprint,
    )
    .await?
    {
        transaction.rollback().await.ok();
        return load_card(&mut connection, &request.card_id).await;
    }
    let result = sqlx::query(
        "UPDATE kanban_cards
         SET stage = 'in_review', review_state = 'awaiting_review',
             approved_at = NULL, state_version = state_version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND state_version = ?2 AND stage = 'done'
           AND review_state = 'approved' AND archived_at IS NULL AND deleted_at IS NULL",
    )
    .bind(&request.card_id)
    .bind(request.expected_version)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The card could not be reopened: {error}"))?;
    if result.rows_affected() != 1 {
        transaction.rollback().await.ok();
        return Err("Only an unchanged, approved Done card can be reopened.".to_string());
    }
    sqlx::query(
        "INSERT INTO kanban_review_decisions (card_id, attempt_id, decision)
         VALUES (?1, (SELECT current_attempt_id FROM kanban_cards WHERE id = ?1), 'reopened')",
    )
    .bind(&request.card_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The review decision could not be saved: {error}"))?;
    sqlx::query(
        "UPDATE kanban_boards SET revision = revision + 1,
            updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1",
    )
    .bind(workspace_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
    complete_operation(&mut transaction, &request.operation_id).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("The card reopen could not be saved: {error}"))?;
    load_card(&mut connection, &request.card_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_stop_inactive_card(
    app: AppHandle,
    request: VersionedKanbanCardRequest,
) -> Result<KanbanCardDto, String> {
    let request_fingerprint = operation_fingerprint(&request)?;
    let mut connection = open_database(&app).await?;
    let workspace_id = card_workspace_id(&mut connection, &request.card_id).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("The card could not be stopped: {error}"))?;
    if !insert_operation(
        &mut transaction,
        &request.operation_id,
        Some(&request.card_id),
        workspace_id,
        "stop_inactive_card",
        &request_fingerprint,
    )
    .await?
    {
        transaction.rollback().await.ok();
        return load_card(&mut connection, &request.card_id).await;
    }
    let result = sqlx::query(
        "UPDATE kanban_cards
         SET execution_state = 'stopped', state_version = state_version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND state_version = ?2
           AND execution_state IN ('paused','blocked','interrupted')
           AND archived_at IS NULL AND deleted_at IS NULL",
    )
    .bind(&request.card_id)
    .bind(request.expected_version)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The card could not be stopped: {error}"))?;
    if result.rows_affected() != 1 {
        transaction.rollback().await.ok();
        return Err("This card no longer has an inactive attempt to stop.".to_string());
    }
    sqlx::query(
        "UPDATE kanban_attempts SET status = 'stopped', recoverable = 0,
            completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
         WHERE id = (SELECT current_attempt_id FROM kanban_cards WHERE id = ?1)
           AND status IN ('paused','blocked','interrupted')",
    )
    .bind(&request.card_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The card attempt could not be stopped: {error}"))?;
    sqlx::query(
        "UPDATE kanban_boards SET revision = revision + 1,
            updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1",
    )
    .bind(workspace_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
    complete_operation(&mut transaction, &request.operation_id).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("The card stop could not be saved: {error}"))?;
    load_card(&mut connection, &request.card_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_archive_card(
    app: AppHandle,
    request: ArchiveKanbanCardRequest,
) -> Result<KanbanCardDto, String> {
    let request_fingerprint = operation_fingerprint(&request)?;
    let mut connection = open_database(&app).await?;
    let workspace_id = card_workspace_id(&mut connection, &request.card_id).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("The card archive state could not be changed: {error}"))?;
    if !insert_operation(
        &mut transaction,
        &request.operation_id,
        Some(&request.card_id),
        workspace_id,
        "archive_card",
        &request_fingerprint,
    )
    .await?
    {
        transaction.rollback().await.ok();
        return load_card(&mut connection, &request.card_id).await;
    }
    let result = sqlx::query(
        "UPDATE kanban_cards SET archived_at = CASE WHEN ?1 = 1 THEN CURRENT_TIMESTAMP ELSE NULL END,
            state_version = state_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?2 AND state_version = ?3 AND deleted_at IS NULL
           AND execution_state NOT IN (
             'starting','running','paused','blocked','waiting_user','waiting_approval'
           )",
    )
    .bind(request.archived)
    .bind(&request.card_id)
    .bind(request.expected_version)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The card archive state could not be changed: {error}"))?;
    if result.rows_affected() != 1 {
        transaction.rollback().await.ok();
        return Err("Stop the active card before archiving it, then try again.".to_string());
    }
    sqlx::query("UPDATE kanban_boards SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1")
        .bind(workspace_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
    complete_operation(&mut transaction, &request.operation_id).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("The card archive state could not be saved: {error}"))?;
    load_card(&mut connection, &request.card_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_delete_card(
    app: AppHandle,
    request: DeleteKanbanCardRequest,
) -> Result<(), String> {
    let request_fingerprint = operation_fingerprint(&request)?;
    let mut connection = open_database(&app).await?;
    let workspace_id = card_workspace_id(&mut connection, &request.card_id).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("The card could not be deleted: {error}"))?;
    if !insert_operation(
        &mut transaction,
        &request.operation_id,
        Some(&request.card_id),
        workspace_id,
        "delete_card",
        &request_fingerprint,
    )
    .await?
    {
        transaction.rollback().await.ok();
        return Ok(());
    }
    let result = sqlx::query(
        "UPDATE kanban_cards SET deleted_at = CURRENT_TIMESTAMP,
            state_version = state_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND state_version = ?2 AND deleted_at IS NULL
           AND execution_state NOT IN (
             'starting','running','paused','blocked','waiting_user','waiting_approval'
           )",
    )
    .bind(&request.card_id)
    .bind(request.expected_version)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The card could not be deleted: {error}"))?;
    if result.rows_affected() != 1 {
        transaction.rollback().await.ok();
        return Err("Stop the active card before deleting it, then try again.".to_string());
    }
    sqlx::query(
        "UPDATE chats SET deleted_at = CURRENT_TIMESTAMP, status = 'deleted',
            updated_at = CURRENT_TIMESTAMP
         WHERE id = (SELECT chat_id FROM kanban_cards WHERE id = ?1)",
    )
    .bind(&request.card_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The card conversation could not be deleted: {error}"))?;
    sqlx::query("UPDATE kanban_boards SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1")
        .bind(workspace_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
    complete_operation(&mut transaction, &request.operation_id).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("The card deletion could not be saved: {error}"))?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_update_preferences(
    app: AppHandle,
    request: UpdateKanbanPreferencesRequest,
) -> Result<KanbanBoardSnapshotDto, String> {
    if request.column_order.len() != 4 {
        return Err("The Kanban column order is invalid.".to_string());
    }
    let expected = std::collections::HashSet::from(["todo", "in_progress", "in_review", "done"]);
    let actual = request
        .column_order
        .iter()
        .map(String::as_str)
        .collect::<std::collections::HashSet<_>>();
    if actual != expected {
        return Err("The Kanban column order is invalid.".to_string());
    }
    let preferences: serde_json::Value = serde_json::from_str(&request.preferences_json)
        .map_err(|_| "The Kanban preferences are invalid.".to_string())?;
    if !preferences.is_object() || request.preferences_json.len() > 64 * 1024 {
        return Err("The Kanban preferences are invalid.".to_string());
    }
    let request_fingerprint = operation_fingerprint(&request)?;
    let mut connection = open_database(&app).await?;
    ensure_board(&mut connection, request.workspace_id).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("The Kanban preferences could not be saved: {error}"))?;
    if !insert_operation(
        &mut transaction,
        &request.operation_id,
        None,
        request.workspace_id,
        "update_preferences",
        &request_fingerprint,
    )
    .await?
    {
        transaction.rollback().await.ok();
        return kanban_board_snapshot(app, request.workspace_id, Some(true)).await;
    }
    let result = sqlx::query(
        "UPDATE kanban_boards SET preferences_json = ?1, revision = revision + 1,
            updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?2 AND revision = ?3",
    )
    .bind(&request.preferences_json)
    .bind(request.workspace_id)
    .bind(request.expected_revision)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The Kanban preferences could not be saved: {error}"))?;
    if result.rows_affected() != 1 {
        transaction.rollback().await.ok();
        return Err("The Kanban board changed. Refresh it and try again.".to_string());
    }
    // Move the existing positions out of the constrained range first. Updating
    // a unique (workspace_id, position) key one row at a time would otherwise
    // fail for ordinary swaps such as Todo <-> In progress.
    sqlx::query(
        "UPDATE kanban_columns SET position = position + 100
         WHERE workspace_id = ?1",
    )
    .bind(request.workspace_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The Kanban column order could not be saved: {error}"))?;
    for (position, key) in request.column_order.iter().enumerate() {
        sqlx::query(
            "UPDATE kanban_columns SET position = ?1 WHERE workspace_id = ?2 AND column_key = ?3",
        )
        .bind(position as i64)
        .bind(request.workspace_id)
        .bind(key)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The Kanban column order could not be saved: {error}"))?;
    }
    complete_operation(&mut transaction, &request.operation_id).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("The Kanban preferences could not be saved: {error}"))?;
    kanban_board_snapshot(app, request.workspace_id, Some(true)).await
}

fn persisted_binding_state(status: &str) -> &'static str {
    match status {
        "conflicted" => "conflicted",
        "error" | "sourceMissing" | "worktreeMissing" | "targetMissing" | "missing"
        | "repositoryMismatch" | "branchMismatch" => "missing",
        "cleanupRequired" => "cleanup_pending",
        "cleanupFailed" => "cleanup_failed",
        "cleaned" | "removed" | "rolledBack" => "removed",
        _ => "ready",
    }
}

fn validate_persisted_binding(binding: &PersistedKanbanGitBinding) -> Result<(), String> {
    for (label, value) in [
        ("source repository", binding.source_repository_path.as_str()),
        ("execution root", binding.execution_root.as_str()),
        ("base branch", binding.base_branch.as_str()),
        ("base commit", binding.base_commit.as_str()),
        ("card branch", binding.card_branch.as_str()),
        ("worktree", binding.worktree_path.as_str()),
    ] {
        if value.trim().is_empty() || value.len() > 16_384 {
            return Err(format!("The Kanban {label} binding is invalid."));
        }
    }
    if binding.relative_path.len() > 4_096 || binding.source_branch.len() > 1_024 {
        return Err("The Kanban repository binding is invalid.".to_string());
    }
    Ok(())
}

async fn advance_git_binding_owner_version(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    card_id: &str,
    expected_version: i64,
) -> Result<bool, String> {
    let card = sqlx::query(
        "UPDATE kanban_cards
         SET state_version = state_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND state_version = ?2 AND deleted_at IS NULL",
    )
    .bind(card_id)
    .bind(expected_version)
    .execute(&mut **transaction)
    .await
    .map_err(|error| format!("The Kanban Git binding owner could not be updated: {error}"))?;
    Ok(card.rows_affected() == 1)
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_save_git_bindings(
    app: AppHandle,
    request: SaveKanbanGitBindingsRequest,
) -> Result<Vec<PersistedKanbanGitBinding>, String> {
    validate_identifier(&request.card_id, "card")?;
    if request.bindings.len() > 64 {
        return Err("Too many Kanban repository bindings were provided.".to_string());
    }
    let mut repository_paths = std::collections::HashSet::new();
    let mut worktree_paths = std::collections::HashSet::new();
    for binding in &request.bindings {
        validate_persisted_binding(binding)?;
        if !repository_paths.insert(binding.source_repository_path.as_str())
            || !worktree_paths.insert(binding.worktree_path.as_str())
        {
            return Err("The Kanban repository bindings contain duplicates.".to_string());
        }
    }
    let request_fingerprint = operation_fingerprint(&request)?;

    let mut connection = open_database(&app).await?;
    let workspace_id = card_workspace_id(&mut connection, &request.card_id).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("The Kanban Git bindings could not be saved: {error}"))?;
    if !insert_operation(
        &mut transaction,
        &request.operation_id,
        Some(&request.card_id),
        workspace_id,
        "save_git_bindings",
        &request_fingerprint,
    )
    .await?
    {
        transaction.rollback().await.ok();
        return Ok(request.bindings);
    }
    if !advance_git_binding_owner_version(
        &mut transaction,
        &request.card_id,
        request.expected_version,
    )
    .await?
    {
        transaction.rollback().await.ok();
        return Err("The card changed before its Git state could be saved.".to_string());
    }
    sqlx::query("DELETE FROM kanban_repository_bindings WHERE card_id = ?1")
        .bind(&request.card_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The Kanban Git bindings could not be replaced: {error}"))?;
    for binding in &request.bindings {
        let binding_json = serde_json::to_string(binding)
            .map_err(|_| "The Kanban Git binding could not be encoded.".to_string())?;
        let error_message = binding
            .error
            .as_ref()
            .and_then(|error| error.get("message"))
            .and_then(serde_json::Value::as_str);
        sqlx::query(
            "INSERT INTO kanban_repository_bindings (
                id, card_id, repository_path, relative_path, base_branch,
                base_commit, card_branch, worktree_path, state, last_error,
                binding_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&request.card_id)
        .bind(&binding.source_repository_path)
        .bind(&binding.relative_path)
        .bind(&binding.base_branch)
        .bind(&binding.base_commit)
        .bind(&binding.card_branch)
        .bind(&binding.worktree_path)
        .bind(persisted_binding_state(&binding.status))
        .bind(error_message)
        .bind(binding_json)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The Kanban Git binding could not be saved: {error}"))?;
    }
    sqlx::query(
        "UPDATE kanban_boards SET revision = revision + 1,
            updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1",
    )
    .bind(workspace_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
    complete_operation(&mut transaction, &request.operation_id).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("The Kanban Git bindings could not be saved: {error}"))?;
    Ok(request.bindings)
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_list_git_bindings(
    app: AppHandle,
    card_id: String,
) -> Result<Vec<PersistedKanbanGitBinding>, String> {
    validate_identifier(&card_id, "card")?;
    let mut connection = open_database(&app).await?;
    card_workspace_id(&mut connection, &card_id).await?;
    let rows: Vec<String> = sqlx::query_scalar(
        "SELECT binding_json FROM kanban_repository_bindings
         WHERE card_id = ?1 AND state != 'removed' ORDER BY repository_path",
    )
    .bind(card_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("The Kanban Git bindings could not be loaded: {error}"))?;
    rows.into_iter()
        .map(|value| {
            serde_json::from_str(&value)
                .map_err(|_| "A persisted Kanban Git binding is invalid.".to_string())
        })
        .collect()
}

fn runtime_git_binding(
    binding: PersistedKanbanGitBinding,
) -> Result<KanbanGitRepositoryBinding, String> {
    serde_json::from_value(
        serde_json::to_value(binding)
            .map_err(|_| "The saved Kanban Git binding could not be read.".to_string())?,
    )
    .map_err(|_| "The saved Kanban Git binding is incompatible with local review.".to_string())
}

async fn upsert_local_review_state(
    app: &AppHandle,
    card_id: &str,
    binding: &KanbanGitRepositoryBinding,
    status: &str,
    error: Option<&str>,
) -> Result<(), String> {
    let mut connection = open_database(app).await?;
    let binding_json = serde_json::to_string(binding)
        .map_err(|_| "The Kanban Git binding could not be saved.".to_string())?;
    let binding_error = binding.error.as_ref().map(|value| value.message.as_str());
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("Local review state could not be saved: {error}"))?;
    sqlx::query(
        "INSERT INTO kanban_local_reviews (
             card_id, source_repository_path, relative_path, status, merge_started, last_error
         ) VALUES (?1, ?2, ?3, ?4,
             CASE WHEN ?4 IN ('merging','merged') THEN 1 ELSE 0 END, ?5)
         ON CONFLICT(card_id, source_repository_path) DO UPDATE SET
             relative_path = excluded.relative_path, status = excluded.status,
             merge_started = CASE
                 WHEN excluded.status IN ('merging','merged') THEN 1
                 ELSE kanban_local_reviews.merge_started
             END,
             last_error = excluded.last_error, updated_at = CURRENT_TIMESTAMP",
    )
    .bind(card_id)
    .bind(&binding.source_repository_path)
    .bind(&binding.relative_path)
    .bind(status)
    .bind(error)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Local review state could not be saved: {error}"))?;
    sqlx::query(
        "UPDATE kanban_repository_bindings
         SET base_commit = ?1, state = ?2, last_error = ?3,
             binding_json = ?4, updated_at = CURRENT_TIMESTAMP
         WHERE card_id = ?5 AND repository_path = ?6",
    )
    .bind(&binding.base_commit)
    .bind(persisted_binding_state(&binding.status))
    .bind(binding_error)
    .bind(binding_json)
    .bind(card_id)
    .bind(&binding.source_repository_path)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The Kanban Git binding could not be saved: {error}"))?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("Local review state could not be saved: {error}"))
}

fn diff_totals(content: &str) -> (u64, u64) {
    content
        .lines()
        .fold((0, 0), |(additions, deletions), line| {
            if line.starts_with('+') && !line.starts_with("+++") {
                (additions + 1, deletions)
            } else if line.starts_with('-') && !line.starts_with("---") {
                (additions, deletions + 1)
            } else {
                (additions, deletions)
            }
        })
}

async fn local_review_projection(
    app: &AppHandle,
    card_id: &str,
) -> Result<KanbanLocalReviewDto, String> {
    let mut connection = open_database(app).await?;
    let card = sqlx::query(
        "SELECT card.title, card.description, card.chat_id, card.review_channel,
                EXISTS(SELECT 1 FROM github_connections
                       WHERE id = 1 AND status = 'connected') AS github_connected,
                EXISTS(SELECT 1 FROM kanban_pull_requests
                       WHERE card_id = card.id AND pull_request_number IS NOT NULL) AS has_pr,
                EXISTS(SELECT 1 FROM kanban_local_reviews
                       WHERE card_id = card.id AND merge_started = 1)
                    AS local_started
         FROM kanban_cards card
         WHERE card.id = ?1 AND card.deleted_at IS NULL",
    )
    .bind(card_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|error| format!("Local review could not be loaded: {error}"))?
    .ok_or_else(|| "The Kanban card no longer exists.".to_string())?;
    let title: String = card.get("title");
    let objective: String = card.get("description");
    let chat_id: i64 = card.get("chat_id");
    let review_channel: Option<String> = card.get("review_channel");
    let github_connected = card.get::<i64, _>("github_connected") != 0;
    let has_pr = card.get::<i64, _>("has_pr") != 0;
    let local_started = card.get::<i64, _>("local_started") != 0;
    let summary: Option<String> = sqlx::query_scalar(
        "SELECT final_message FROM runs WHERE chat_id = ?1 AND final_message IS NOT NULL
         ORDER BY turn_index DESC, id DESC LIMIT 1",
    )
    .bind(chat_id)
    .fetch_optional(&mut *connection)
    .await
    .unwrap_or(None);
    let state_rows = sqlx::query(
        "SELECT source_repository_path, status, last_error
         FROM kanban_local_reviews WHERE card_id = ?1",
    )
    .bind(card_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Local review state could not be loaded: {error}"))?;
    let states = state_rows
        .into_iter()
        .map(|row| {
            (
                row.get::<String, _>("source_repository_path"),
                (
                    row.get::<String, _>("status"),
                    row.get::<Option<String>, _>("last_error"),
                ),
            )
        })
        .collect::<std::collections::HashMap<_, _>>();
    let binding_rows: Vec<String> = sqlx::query_scalar(
        "SELECT binding_json FROM kanban_repository_bindings
         WHERE card_id = ?1 AND state != 'removed' ORDER BY relative_path, repository_path",
    )
    .bind(card_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Local review repositories could not be loaded: {error}"))?;
    drop(connection);

    let mut repositories = Vec::with_capacity(binding_rows.len());
    for value in binding_rows {
        let persisted: PersistedKanbanGitBinding = serde_json::from_str(&value)
            .map_err(|_| "A persisted Kanban Git binding is invalid.".to_string())?;
        let binding = runtime_git_binding(persisted)?;
        let stored = states.get(&binding.source_repository_path);
        let status = stored
            .map(|state| state.0.clone())
            .unwrap_or_else(|| "pending".to_string());
        let error = stored.and_then(|state| state.1.clone());
        let result = kanban_git_diff(
            app.clone(),
            KanbanGitDiffRequest {
                binding: binding.clone(),
                include_binary: true,
            },
        )
        .await;
        match result {
            Ok(diff) => {
                let (additions, deletions) = diff_totals(&diff.content);
                let files = kanban_git_status(
                    app.clone(),
                    KanbanGitBindingRequest {
                        binding: binding.clone(),
                    },
                )
                .await
                .map(|value| value.files.into_iter().map(|file| file.path).collect())
                .unwrap_or_default();
                let mut content = diff.content;
                if content.chars().count() > 2_000_000 {
                    content = content.chars().take(2_000_000).collect();
                    content.push_str("\n\nDiff truncated by Orchestrator.\n");
                }
                repositories.push(KanbanLocalReviewRepositoryDto {
                    source_repository_path: binding.source_repository_path,
                    relative_path: binding.relative_path,
                    base_branch: binding.base_branch,
                    card_branch: binding.card_branch,
                    status,
                    error,
                    additions,
                    deletions,
                    files,
                    diff: content,
                    is_empty: diff.is_empty,
                });
            }
            Err(load_error) => repositories.push(KanbanLocalReviewRepositoryDto {
                source_repository_path: binding.source_repository_path,
                relative_path: binding.relative_path,
                base_branch: binding.base_branch,
                card_branch: binding.card_branch,
                status: "failed".to_string(),
                error: Some(load_error),
                additions: 0,
                deletions: 0,
                files: Vec::new(),
                diff: String::new(),
                is_empty: true,
            }),
        }
    }
    Ok(KanbanLocalReviewDto {
        card_id: card_id.to_string(),
        title,
        objective,
        summary,
        review_channel: review_channel.unwrap_or_else(|| "local".to_string()),
        can_publish_github: github_connected && !has_pr && !local_started,
        repositories,
    })
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_local_review(
    app: AppHandle,
    card_id: String,
) -> Result<KanbanLocalReviewDto, String> {
    validate_identifier(&card_id, "card")?;
    local_review_projection(&app, &card_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_use_local_review(
    app: AppHandle,
    card_id: String,
) -> Result<KanbanLocalReviewDto, String> {
    validate_identifier(&card_id, "card")?;
    let mut connection = open_database(&app).await?;
    let actual_pull_requests: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM kanban_pull_requests
         WHERE card_id = ?1 AND pull_request_number IS NOT NULL",
    )
    .bind(&card_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(|error| format!("Pull request state could not be checked: {error}"))?;
    if actual_pull_requests > 0 {
        return Err(
            "This card already has a GitHub pull request and must remain in GitHub review."
                .to_string(),
        );
    }
    let review_channel: Option<String> = sqlx::query_scalar(
        "SELECT review_channel FROM kanban_cards
         WHERE id = ?1 AND stage = 'in_review' AND deleted_at IS NULL",
    )
    .bind(&card_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|error| format!("The review destination could not be checked: {error}"))?
    .flatten();
    let failed_publications: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM kanban_pull_requests
         WHERE card_id = ?1 AND pull_request_number IS NULL
           AND publication_status = 'failed'",
    )
    .bind(&card_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(|error| format!("Failed publication state could not be checked: {error}"))?;
    let pending_publications: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM kanban_pull_requests
         WHERE card_id = ?1 AND pull_request_number IS NULL
           AND publication_status IN ('queued', 'publishing')",
    )
    .bind(&card_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(|error| format!("Active publication state could not be checked: {error}"))?;
    if review_channel.as_deref() != Some("local") {
        if pending_publications > 0 {
            return Err(
                "GitHub publication is still running. Wait for it to finish before switching to local review."
                    .to_string(),
            );
        }
        if failed_publications == 0 && crate::github::github_review_available(&app).await {
            return Err(
                "Local review is available after GitHub publication fails or while GitHub is disconnected."
                    .to_string(),
            );
        }
    }
    let updated = sqlx::query(
        "UPDATE kanban_cards SET review_channel = 'local',
             state_version = state_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND stage = 'in_review' AND deleted_at IS NULL",
    )
    .bind(&card_id)
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("The local review could not be selected: {error}"))?;
    if updated.rows_affected() != 1 {
        return Err("Only a completed card in review can use local review.".to_string());
    }
    sqlx::query(
        "DELETE FROM kanban_pull_requests
         WHERE card_id = ?1 AND pull_request_number IS NULL",
    )
    .bind(&card_id)
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("Failed publication state could not be cleared: {error}"))?;
    let workspace_id = card_workspace_id(&mut connection, &card_id).await?;
    sqlx::query(
        "UPDATE kanban_boards SET revision = revision + 1,
         updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1",
    )
    .bind(workspace_id)
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
    drop(connection);
    local_review_projection(&app, &card_id).await
}

async fn mark_local_review_failure(
    app: &AppHandle,
    card_id: &str,
    binding: &KanbanGitRepositoryBinding,
    error: &str,
) {
    let _ = upsert_local_review_state(app, card_id, binding, "failed", Some(error)).await;
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_approve_local_review(
    app: AppHandle,
    request: ApproveKanbanLocalReviewRequest,
) -> Result<KanbanLocalReviewDto, String> {
    validate_identifier(&request.card_id, "card")?;
    validate_identifier(&request.operation_id, "operation")?;
    let mut connection = open_database(&app).await?;
    let card = sqlx::query(
        "SELECT workspace_id, chat_id, description, account_id, model, stage,
                execution_state, review_channel, review_state
         FROM kanban_cards WHERE id = ?1 AND deleted_at IS NULL",
    )
    .bind(&request.card_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|error| format!("Local review could not start: {error}"))?
    .ok_or_else(|| "The Kanban card no longer exists.".to_string())?;
    let stage: String = card.get("stage");
    if stage == "done" && card.get::<String, _>("review_state") == "approved" {
        drop(connection);
        return local_review_projection(&app, &request.card_id).await;
    }
    if stage != "in_review"
        || card.get::<String, _>("execution_state") != "completed"
        || card.get::<Option<String>, _>("review_channel").as_deref() != Some("local")
    {
        return Err("Only a completed card in local review can be approved.".to_string());
    }
    let existing: Option<String> =
        sqlx::query_scalar("SELECT status FROM kanban_operations WHERE operation_id = ?1")
            .bind(&request.operation_id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(|error| format!("Local review state could not be checked: {error}"))?;
    if existing.as_deref() == Some("completed") {
        drop(connection);
        return local_review_projection(&app, &request.card_id).await;
    }
    if existing.is_some() {
        return Err("This local review operation is already running.".to_string());
    }
    let workspace_id: i64 = card.get("workspace_id");
    let objective: String = card.get("description");
    let account_id: Option<i64> = card.get("account_id");
    let model: Option<String> = card.get("model");
    let chat_id: i64 = card.get("chat_id");
    let summary: Option<String> = sqlx::query_scalar(
        "SELECT final_message FROM runs WHERE chat_id = ?1 AND final_message IS NOT NULL
         ORDER BY turn_index DESC, id DESC LIMIT 1",
    )
    .bind(chat_id)
    .fetch_optional(&mut *connection)
    .await
    .unwrap_or(None);
    sqlx::query(
        "INSERT INTO kanban_operations (
             operation_id, card_id, workspace_id, action, request_hash, status
         ) VALUES (?1, ?2, ?3, 'approve_local_review', ?1, 'pending')",
    )
    .bind(&request.operation_id)
    .bind(&request.card_id)
    .bind(workspace_id)
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("Local review state could not be saved: {error}"))?;
    let binding_rows: Vec<String> = sqlx::query_scalar(
        "SELECT binding_json FROM kanban_repository_bindings
         WHERE card_id = ?1 AND state != 'removed' ORDER BY relative_path, repository_path",
    )
    .bind(&request.card_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Local review repositories could not be loaded: {error}"))?;
    drop(connection);
    if binding_rows.is_empty() {
        return Err("This card has no repository worktrees to review.".to_string());
    }

    let mut merged_count = 0_usize;
    let mut nothing_count = 0_usize;
    let mut failures = Vec::new();
    for value in binding_rows {
        let persisted: PersistedKanbanGitBinding = serde_json::from_str(&value)
            .map_err(|_| "A persisted Kanban Git binding is invalid.".to_string())?;
        let mut binding = runtime_git_binding(persisted)?;
        let existing_status: Option<String> = {
            let mut connection = open_database(&app).await?;
            sqlx::query_scalar(
                "SELECT status FROM kanban_local_reviews
                 WHERE card_id = ?1 AND source_repository_path = ?2",
            )
            .bind(&request.card_id)
            .bind(&binding.source_repository_path)
            .fetch_optional(&mut *connection)
            .await
            .unwrap_or(None)
        };
        if existing_status.as_deref() == Some("merged") {
            merged_count += 1;
            continue;
        }
        upsert_local_review_state(&app, &request.card_id, &binding, "committing", None).await?;
        let status = match kanban_git_status(
            app.clone(),
            KanbanGitBindingRequest {
                binding: binding.clone(),
            },
        )
        .await
        {
            Ok(status) => status,
            Err(error) => {
                mark_local_review_failure(&app, &request.card_id, &binding, &error).await;
                failures.push(format!("{}: {error}", binding.relative_path));
                continue;
            }
        };
        if status.has_changes {
            let context = WorkspaceCommitIntentContext {
                objective: Some(objective.clone()),
                approved_plan: None,
                implementation_outcome: summary.clone(),
            };
            let app_for_generation = app.clone();
            let worktree = binding.worktree_path.clone();
            let generation_model = model.clone();
            let generated = tauri::async_runtime::spawn_blocking(move || {
                generate_workspace_repository_commit_message_blocking(
                    app_for_generation,
                    worktree.clone(),
                    Some(worktree),
                    account_id,
                    Some(true),
                    generation_model,
                    Some(context),
                )
            })
            .await
            .map_err(|_| "Commit message generation stopped unexpectedly.".to_string())?;
            let message = match generated {
                Ok(message) => message.message,
                Err(error) => {
                    mark_local_review_failure(&app, &request.card_id, &binding, &error).await;
                    failures.push(format!("{}: {error}", binding.relative_path));
                    continue;
                }
            };
            match kanban_git_commit(
                app.clone(),
                KanbanGitCommitRequest {
                    binding,
                    message,
                    stage_all: true,
                },
            )
            .await
            {
                Ok(result) => binding = result.binding,
                Err(error) => {
                    mark_local_review_failure(&app, &request.card_id, &status.binding, &error)
                        .await;
                    failures.push(format!("{}: {error}", status.binding.relative_path));
                    continue;
                }
            }
        }
        let refreshed = match kanban_git_status(
            app.clone(),
            KanbanGitBindingRequest {
                binding: binding.clone(),
            },
        )
        .await
        {
            Ok(status) => status,
            Err(error) => {
                mark_local_review_failure(&app, &request.card_id, &binding, &error).await;
                failures.push(format!("{}: {error}", binding.relative_path));
                continue;
            }
        };
        if refreshed.ahead_of_base == 0 {
            upsert_local_review_state(&app, &request.card_id, &binding, "nothing_to_merge", None)
                .await?;
            nothing_count += 1;
            continue;
        }
        upsert_local_review_state(&app, &request.card_id, &binding, "merging", None).await?;
        match kanban_git_merge(
            app.clone(),
            KanbanGitMergeRequest {
                binding: binding.clone(),
                message: None,
            },
        )
        .await
        {
            Ok(result) if result.status == "merged" => {
                binding = result.binding;
                upsert_local_review_state(&app, &request.card_id, &binding, "merged", None).await?;
                merged_count += 1;
            }
            Ok(result) => {
                let error = result.message;
                mark_local_review_failure(&app, &request.card_id, &result.binding, &error).await;
                failures.push(format!("{}: {error}", result.binding.relative_path));
            }
            Err(error) => {
                mark_local_review_failure(&app, &request.card_id, &binding, &error).await;
                failures.push(format!("{}: {error}", binding.relative_path));
            }
        }
    }

    let mut connection = open_database(&app).await?;
    if failures.is_empty() && merged_count > 0 {
        let mut transaction = connection
            .begin()
            .await
            .map_err(|error| format!("The local review could not be completed: {error}"))?;
        sqlx::query(
            "UPDATE kanban_cards SET stage = 'done', review_state = 'approved',
                 approved_at = CURRENT_TIMESTAMP, state_version = state_version + 1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1 AND stage = 'in_review' AND review_channel = 'local'",
        )
        .bind(&request.card_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The card could not be approved: {error}"))?;
        sqlx::query(
            "INSERT INTO kanban_review_decisions (card_id, attempt_id, decision)
             VALUES (?1, (SELECT current_attempt_id FROM kanban_cards WHERE id = ?1), 'approved')",
        )
        .bind(&request.card_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The review decision could not be recorded: {error}"))?;
        sqlx::query(
            "UPDATE kanban_boards SET revision = revision + 1,
             updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1",
        )
        .bind(workspace_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
        sqlx::query(
            "UPDATE kanban_operations SET status = 'completed', completed_at = CURRENT_TIMESTAMP
             WHERE operation_id = ?1",
        )
        .bind(&request.operation_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Local review state could not be completed: {error}"))?;
        transaction
            .commit()
            .await
            .map_err(|error| format!("The local review could not be completed: {error}"))?;
    } else {
        sqlx::query(
            "UPDATE kanban_operations SET status = 'failed', completed_at = CURRENT_TIMESTAMP
             WHERE operation_id = ?1",
        )
        .bind(&request.operation_id)
        .execute(&mut *connection)
        .await
        .ok();
    }
    drop(connection);
    if !failures.is_empty() {
        return Err(format!(
            "Some repositories could not be merged: {}",
            failures.join(" ")
        ));
    }
    if merged_count == 0 && nothing_count > 0 {
        return Err("No repository changes are available to merge. Complete this card without changes instead.".to_string());
    }
    local_review_projection(&app, &request.card_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_complete_local_review_without_changes(
    app: AppHandle,
    card_id: String,
) -> Result<KanbanCardDto, String> {
    validate_identifier(&card_id, "card")?;
    let projection = local_review_projection(&app, &card_id).await?;
    if projection.repositories.is_empty()
        || projection
            .repositories
            .iter()
            .any(|repository| !repository.is_empty && repository.status != "nothing_to_merge")
    {
        return Err("This card still has repository changes to review.".to_string());
    }
    let mut connection = open_database(&app).await?;
    let workspace_id = card_workspace_id(&mut connection, &card_id).await?;
    sqlx::query(
        "UPDATE kanban_cards SET stage = 'done', review_state = 'approved',
             approved_at = CURRENT_TIMESTAMP, state_version = state_version + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND stage = 'in_review' AND review_channel = 'local'",
    )
    .bind(&card_id)
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("The card could not be completed: {error}"))?;
    sqlx::query(
        "UPDATE kanban_boards SET revision = revision + 1,
         updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1",
    )
    .bind(workspace_id)
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
    load_card(&mut connection, &card_id).await
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_set_inherited_context(
    app: AppHandle,
    request: SetKanbanInheritedContextRequest,
) -> Result<(), String> {
    validate_identifier(&request.card_id, "card")?;
    validate_identifier(&request.source_card_id, "source card")?;
    if request.context.trim().is_empty() || request.context.chars().count() > 200_000 {
        return Err("The inherited card conversation context is invalid.".to_string());
    }
    let request_fingerprint = operation_fingerprint(&request)?;
    let mut connection = open_database(&app).await?;
    let workspace_id = card_workspace_id(&mut connection, &request.card_id).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("The inherited card context could not be saved: {error}"))?;
    if !insert_operation(
        &mut transaction,
        &request.operation_id,
        Some(&request.card_id),
        workspace_id,
        "set_inherited_context",
        &request_fingerprint,
    )
    .await?
    {
        transaction.rollback().await.ok();
        return Ok(());
    }
    let result = sqlx::query(
        "UPDATE kanban_cards
         SET inherited_context = ?1, inherited_from_card_id = ?2,
             state_version = state_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?3 AND state_version = ?4
           AND archived_at IS NULL AND deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM kanban_attempts WHERE card_id = ?3)
           AND workspace_id = (
             SELECT workspace_id FROM kanban_cards
             WHERE id = ?2 AND deleted_at IS NULL
           )",
    )
    .bind(request.context.trim())
    .bind(&request.source_card_id)
    .bind(&request.card_id)
    .bind(request.expected_version)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The inherited card context could not be saved: {error}"))?;
    if result.rows_affected() != 1 {
        transaction.rollback().await.ok();
        return Err(
            "Conversation context can only be copied between unchanged cards in one workspace."
                .to_string(),
        );
    }
    sqlx::query(
        "UPDATE kanban_boards SET revision = revision + 1,
            updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1",
    )
    .bind(workspace_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("The Kanban board could not be updated: {error}"))?;
    complete_operation(&mut transaction, &request.operation_id).await?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("The inherited card context could not be saved: {error}"))?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_get_inherited_context(
    app: AppHandle,
    card_id: String,
) -> Result<Option<String>, String> {
    validate_identifier(&card_id, "card")?;
    let mut connection = open_database(&app).await?;
    sqlx::query_scalar(
        "SELECT inherited_context FROM kanban_cards
         WHERE id = ?1 AND deleted_at IS NULL",
    )
    .bind(card_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|error| format!("The inherited card context could not be loaded: {error}"))?
    .ok_or_else(|| "The Kanban card no longer exists.".to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn kanban_recover_interrupted(app: AppHandle) -> Result<u64, String> {
    let mut connection = open_database(&app).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("Kanban recovery could not start: {error}"))?;
    let affected_workspace_ids: Vec<i64> = sqlx::query_scalar(
        "SELECT DISTINCT card.workspace_id
         FROM kanban_cards card
         JOIN kanban_attempts attempt ON attempt.id = card.current_attempt_id
         WHERE attempt.status IN (
           'provisioning','starting','running','waiting_user','waiting_approval',
           'pause_requested','stop_requested'
         )",
    )
    .fetch_all(&mut *transaction)
    .await
    .map_err(|error| format!("Kanban recovery scope could not be loaded: {error}"))?;
    let attempts = sqlx::query(
        "UPDATE kanban_attempts SET status = 'interrupted', recoverable = 1,
            error = COALESCE(error, 'The app closed while this card was active.'),
            completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE status IN ('provisioning','starting','running','waiting_user','waiting_approval','pause_requested','stop_requested')",
    )
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Kanban attempts could not be recovered: {error}"))?;
    sqlx::query(
        "UPDATE kanban_cards SET execution_state = 'interrupted',
            last_error = COALESCE(last_error, 'The app closed while this card was active.'),
            state_version = state_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE current_attempt_id IN (
            SELECT id FROM kanban_attempts WHERE status = 'interrupted' AND recoverable = 1
         ) AND execution_state IN ('starting','running','waiting_user','waiting_approval')",
    )
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Kanban cards could not be recovered: {error}"))?;
    for workspace_id in affected_workspace_ids {
        sqlx::query(
            "UPDATE kanban_boards SET revision = revision + 1,
                updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ?1",
        )
        .bind(workspace_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Kanban boards could not be recovered: {error}"))?;
    }
    sqlx::query(
        "UPDATE kanban_pending_requests SET status = 'expired',
            resolved_at = CURRENT_TIMESTAMP
         WHERE status IN ('pending','submitting')",
    )
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("Kanban requests could not be recovered: {error}"))?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("Kanban recovery could not be saved: {error}"))?;
    Ok(attempts.rows_affected())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepted_plan_requires_valid_implementation_settings() {
        let settings = r#"{
            "accountId":7,
            "profileKey":"account:7",
            "mode":"run",
            "intent":"plan-implementation",
            "goalMode":false,
            "accessMode":"full-access",
            "model":"gpt-5.6",
            "reasoningEffort":"high"
        }"#;
        let parsed = implementation_execution_settings(Some(settings))
            .expect("validate implementation settings");
        assert_eq!(parsed.account_id, Some(7));
        assert_eq!(parsed.access_mode, "full-access");
        assert_eq!(parsed.model.as_deref(), Some("gpt-5.6"));
        assert_eq!(parsed.reasoning_level.as_deref(), Some("high"));
        assert!(implementation_execution_settings(Some(
            r#"{"accountId":7,"profileKey":"account:7","mode":"plan","intent":"plan","goalMode":false,"accessMode":"full-access"}"#,
        ))
        .is_err());
        assert!(execution_settings_are_plan_implementation(Some(settings)));
    }

    #[test]
    fn completed_plan_validation_rejects_empty_and_oversized_descriptions() {
        assert!(validate_completed_plan(&CompletedKanbanPlanInput {
            item_id: "plan-item-1".to_string(),
            text: "# Plan\n\nShip it.".to_string(),
        })
        .is_ok());
        assert!(validate_completed_plan(&CompletedKanbanPlanInput {
            item_id: "plan-item-1".to_string(),
            text: "   ".to_string(),
        })
        .is_err());
        assert!(validate_completed_plan(&CompletedKanbanPlanInput {
            item_id: "plan-item-1".to_string(),
            text: "x".repeat(MAX_DESCRIPTION_CHARS + 1),
        })
        .is_err());
    }

    #[test]
    fn local_review_diff_totals_ignore_file_headers() {
        let diff = "diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1,2 @@\n-old\n+new\n+extra\n";
        assert_eq!(diff_totals(diff), (2, 1));
    }

    #[test]
    fn attempt_claims_follow_the_persisted_lifecycle() {
        assert!(claim_transition_allowed("start", "todo", "idle", "none"));
        assert!(!claim_transition_allowed(
            "start",
            "in_progress",
            "running",
            "none"
        ));
        assert!(claim_transition_allowed(
            "resume",
            "in_progress",
            "interrupted",
            "none"
        ));
        assert!(claim_transition_allowed(
            "request_changes",
            "in_review",
            "completed",
            "awaiting_review"
        ));
        assert!(claim_transition_allowed(
            "implement_plan",
            "in_review",
            "completed",
            "awaiting_review"
        ));
        assert!(!claim_transition_allowed(
            "request_changes",
            "done",
            "completed",
            "approved"
        ));
    }

    #[test]
    fn direct_moves_cannot_bypass_start_or_approval() {
        assert!(move_transition_allowed("todo", "idle", "todo"));
        assert!(!move_transition_allowed("todo", "idle", "in_progress"));
        assert!(move_transition_allowed("in_progress", "stopped", "todo"));
        assert!(move_transition_allowed(
            "in_progress",
            "completed",
            "in_review"
        ));
        assert!(!move_transition_allowed("in_review", "completed", "done"));
    }

    #[test]
    fn native_binding_states_preserve_cleanup_and_missing_work() {
        assert_eq!(persisted_binding_state("ready"), "ready");
        assert_eq!(persisted_binding_state("error"), "missing");
        assert_eq!(persisted_binding_state("targetMissing"), "missing");
        assert_eq!(
            persisted_binding_state("cleanupRequired"),
            "cleanup_pending"
        );
        assert_eq!(persisted_binding_state("cleanupFailed"), "cleanup_failed");
        assert_eq!(persisted_binding_state("cleaned"), "removed");
        assert_eq!(persisted_binding_state("rolledBack"), "removed");
    }

    #[test]
    fn attempt_events_cannot_reopen_suspended_or_terminal_attempts() {
        assert!(attempt_status_transition_allowed("running", "waiting_user"));
        assert!(attempt_status_transition_allowed("waiting_user", "running"));
        assert!(attempt_status_transition_allowed(
            "pause_requested",
            "paused"
        ));
        assert!(attempt_status_transition_allowed(
            "pause_requested",
            "completed"
        ));
        assert!(attempt_status_transition_allowed(
            "stop_requested",
            "completed"
        ));
        assert!(!attempt_status_transition_allowed("paused", "running"));
        assert!(!attempt_status_transition_allowed("blocked", "running"));
        assert!(attempt_status_transition_allowed("blocked", "interrupted"));
        assert!(!attempt_status_transition_allowed("completed", "running"));
    }

    #[test]
    fn publication_waits_for_another_eligible_card_follow_up() {
        tauri::async_runtime::block_on(async {
            let mut connection = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("open queue database");
            sqlx::query(
                "CREATE TABLE kanban_cards (id TEXT PRIMARY KEY, chat_id INTEGER NOT NULL)",
            )
            .execute(&mut connection)
            .await
            .expect("create cards table");
            sqlx::query(
                "CREATE TABLE prompt_queue_items (
                    id TEXT PRIMARY KEY,
                    chat_id INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    auto_send_enabled INTEGER NOT NULL,
                    send_now_priority INTEGER,
                    linked_run_id INTEGER,
                    linked_turn_id TEXT
                )",
            )
            .execute(&mut connection)
            .await
            .expect("create queue table");
            sqlx::query("INSERT INTO kanban_cards (id, chat_id) VALUES ('card-1', 11)")
                .execute(&mut connection)
                .await
                .expect("insert card");
            sqlx::query(
                "INSERT INTO prompt_queue_items (
                    id, chat_id, status, auto_send_enabled, linked_run_id, linked_turn_id
                ) VALUES
                    ('current', 11, 'active', 1, 7, 'turn-current'),
                    ('next', 11, 'queued', 1, NULL, NULL)",
            )
            .execute(&mut connection)
            .await
            .expect("insert queue items");

            let mut transaction = connection.begin().await.expect("begin check");
            assert!(card_has_pending_follow_up(
                &mut transaction,
                "card-1",
                Some(7),
                Some("turn-current"),
            )
            .await
            .expect("check pending follow-up"));
            transaction.rollback().await.expect("rollback check");

            sqlx::query("UPDATE prompt_queue_items SET auto_send_enabled = 0 WHERE id = 'next'")
                .execute(&mut connection)
                .await
                .expect("hold next item");
            let mut transaction = connection.begin().await.expect("begin held check");
            assert!(!card_has_pending_follow_up(
                &mut transaction,
                "card-1",
                Some(7),
                Some("turn-current"),
            )
            .await
            .expect("check held follow-up"));
        });
    }

    #[test]
    fn operation_fingerprints_bind_ids_to_exact_requests() {
        let first = VersionedKanbanCardRequest {
            card_id: "card-1".to_string(),
            expected_version: 1,
            operation_id: "operation-1".to_string(),
        };
        let replay = VersionedKanbanCardRequest {
            card_id: "card-1".to_string(),
            expected_version: 1,
            operation_id: "operation-1".to_string(),
        };
        let different = VersionedKanbanCardRequest {
            card_id: "card-2".to_string(),
            expected_version: 1,
            operation_id: "operation-1".to_string(),
        };
        assert_eq!(
            operation_fingerprint(&first).unwrap(),
            operation_fingerprint(&replay).unwrap()
        );
        assert_ne!(
            operation_fingerprint(&first).unwrap(),
            operation_fingerprint(&different).unwrap()
        );
    }

    #[test]
    fn move_anchors_must_exist_and_be_adjacent() {
        let cards = vec![
            ("card-1".to_string(), 1_024),
            ("card-2".to_string(), 2_048),
            ("card-3".to_string(), 3_072),
        ];
        assert_eq!(
            validated_anchor_positions(&cards, Some("card-2"), Some("card-1")).unwrap(),
            (Some(2_048), Some(1_024))
        );
        assert!(validated_anchor_positions(&cards, Some("card-3"), Some("card-1")).is_err());
        assert!(validated_anchor_positions(&cards, Some("missing"), None).is_err());
        assert!(validated_anchor_positions(&cards, Some("card-2"), None).is_err());
        assert!(validated_anchor_positions(&cards, None, Some("card-2")).is_err());
        assert_eq!(
            validated_anchor_positions(&cards, Some("card-1"), None).unwrap(),
            (Some(1_024), None)
        );
        assert_eq!(
            validated_anchor_positions(&cards, None, Some("card-3")).unwrap(),
            (None, Some(3_072))
        );
    }

    #[test]
    fn legacy_operation_receipts_are_replayable_but_remain_card_scoped() {
        tauri::async_runtime::block_on(async {
            let mut connection = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("open operation database");
            sqlx::query(
                "CREATE TABLE kanban_operations (
                    operation_id TEXT PRIMARY KEY,
                    workspace_id INTEGER NOT NULL,
                    card_id TEXT,
                    operation_kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    request_fingerprint TEXT NOT NULL
                 )",
            )
            .execute(&mut connection)
            .await
            .expect("create operation table");
            sqlx::query(
                "INSERT INTO kanban_operations (
                    operation_id, workspace_id, card_id, operation_kind, status,
                    request_fingerprint
                 ) VALUES ('legacy-op', 1, 'card-1', 'update_card', 'completed', '')",
            )
            .execute(&mut connection)
            .await
            .expect("insert legacy receipt");

            let mut replay = connection.begin().await.expect("begin replay");
            assert!(!insert_operation(
                &mut replay,
                "legacy-op",
                Some("card-1"),
                1,
                "update_card",
                "newly-derived-fingerprint",
            )
            .await
            .expect("replay legacy receipt"));
            replay.rollback().await.expect("finish replay");

            let mut wrong_card = connection.begin().await.expect("begin mismatch");
            assert!(insert_operation(
                &mut wrong_card,
                "legacy-op",
                Some("card-2"),
                1,
                "update_card",
                "newly-derived-fingerprint",
            )
            .await
            .is_err());
            wrong_card.rollback().await.expect("finish mismatch");
        });
    }

    #[test]
    fn archived_cards_can_persist_cleanup_bindings_but_deleted_cards_cannot() {
        tauri::async_runtime::block_on(async {
            let mut connection = SqliteConnection::connect("sqlite::memory:")
                .await
                .expect("open card database");
            sqlx::query(
                "CREATE TABLE kanban_cards (
                    id TEXT PRIMARY KEY,
                    state_version INTEGER NOT NULL,
                    archived_at TEXT,
                    deleted_at TEXT,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                 )",
            )
            .execute(&mut connection)
            .await
            .expect("create card table");
            sqlx::query(
                "INSERT INTO kanban_cards (id, state_version, archived_at)
                 VALUES ('archived-card', 4, CURRENT_TIMESTAMP)",
            )
            .execute(&mut connection)
            .await
            .expect("insert archived card");
            sqlx::query(
                "INSERT INTO kanban_cards (id, state_version, deleted_at)
                 VALUES ('deleted-card', 7, CURRENT_TIMESTAMP)",
            )
            .execute(&mut connection)
            .await
            .expect("insert deleted card");

            let mut archived = connection.begin().await.expect("begin archived claim");
            assert!(
                advance_git_binding_owner_version(&mut archived, "archived-card", 4)
                    .await
                    .expect("claim archived card")
            );
            archived.commit().await.expect("commit archived claim");
            let archived_version: i64 = sqlx::query_scalar(
                "SELECT state_version FROM kanban_cards WHERE id = 'archived-card'",
            )
            .fetch_one(&mut connection)
            .await
            .expect("read archived version");
            assert_eq!(archived_version, 5);

            let mut deleted = connection.begin().await.expect("begin deleted claim");
            assert!(
                !advance_git_binding_owner_version(&mut deleted, "deleted-card", 7)
                    .await
                    .expect("reject deleted card")
            );
            deleted.rollback().await.expect("finish deleted claim");
        });
    }
}
