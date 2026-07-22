use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    env,
    ffi::OsStr,
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_sql::{Migration, MigrationKind};
use tokio::{sync::oneshot, time::timeout};

mod agent_notifications;

use agent_notifications::AgentNotificationState;

const DATABASE_URL: &str = "sqlite:app.db";
const MAX_FILE_PREVIEW_BYTES: usize = 512 * 1024;
const MAX_COMMIT_MESSAGE_CONTEXT_CHARS: usize = 24_000;
const DEFAULT_CODEX_PROFILE_ID: i64 = 0;
const DEFAULT_CODEX_PROFILE_KEY: &str = "default";
const IGNORED_EXPLORER_DIRECTORIES: &[&str] =
    &[".git", "node_modules", "target", "dist", "build", ".next"];

struct PendingResponse {
    account_id: i64,
    sender: oneshot::Sender<Result<Value, String>>,
}

type PendingMap = Arc<Mutex<HashMap<String, PendingResponse>>>;

#[derive(Clone, Copy, PartialEq, Eq)]
enum ServerRequestResponseState {
    Pending,
    Responding,
}

struct PendingServerRequest {
    account_id: i64,
    connection_generation: u64,
    request_id: Value,
    response_state: ServerRequestResponseState,
}

type PendingServerRequestMap = Arc<Mutex<HashMap<String, PendingServerRequest>>>;

struct CodexProcess {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    connection_generation: u64,
}

#[derive(Default)]
struct CodexState {
    processes: Mutex<HashMap<i64, CodexProcess>>,
    pending: PendingMap,
    pending_server_requests: PendingServerRequestMap,
    next_id: AtomicU64,
    next_connection_generation: AtomicU64,
    next_server_request_token: Arc<AtomicU64>,
    login_account: Arc<Mutex<Option<i64>>>,
    history_index_requests: Arc<Mutex<HashSet<String>>>,
    transcript_sync_requests: Arc<Mutex<HashSet<String>>>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexConnectResult {
    pid: Option<u32>,
    already_connected: bool,
    initialize: Value,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessEvent {
    account_id: i64,
    profile_key: String,
    status: String,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexMessageEvent {
    account_id: i64,
    profile_key: String,
    message: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    request_token: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoricalCommandActivity {
    id: String,
    command: String,
    status: String,
    duration_ms: Option<i64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoricalEditedFile {
    path: String,
    name: String,
    additions: usize,
    deletions: usize,
    status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoricalTurnActivityResponse {
    commands: Vec<HistoricalCommandActivity>,
    edited_files: Vec<HistoricalEditedFile>,
    next_cursor: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryTurnHint {
    slot_index: usize,
    turn_id: Option<String>,
    prompt_characters: usize,
    response_characters: usize,
    prompt_lines: usize,
    response_lines: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryPageDescriptor {
    id: String,
    page_index: usize,
    start_index: usize,
    turn_count: usize,
    cursor: Option<String>,
    local_offset: Option<usize>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalThreadHistoryIndex {
    request_id: String,
    thread_id: String,
    source_version: String,
    total_turns: usize,
    page_size: usize,
    pages: Vec<HistoryPageDescriptor>,
    hints: Vec<HistoryTurnHint>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalTranscriptTurnSummary {
    slot_index: usize,
    turn_id: Option<String>,
    prompt: String,
    final_message: String,
    error: Option<String>,
    status: String,
    started_at: Option<String>,
    completed_at: Option<String>,
    duration_ms: Option<i64>,
    total_tokens: Option<i64>,
    model_context_window: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalTranscriptSnapshot {
    request_id: String,
    thread_id: String,
    source_version: String,
    total_turns: usize,
    turns: Vec<ExternalTranscriptTurnSummary>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreflightCheck {
    id: String,
    label: String,
    status: String,
    message: String,
    detail: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecommendationDraft {
    kind: String,
    title: String,
    body: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreflightReport {
    workspace_path: String,
    token_estimate: usize,
    context_budget: usize,
    route_recommendation: String,
    improved_prompt: String,
    checks: Vec<PreflightCheck>,
    recommendations: Vec<RecommendationDraft>,
}

#[derive(Serialize)]
struct CommandProbe {
    ok: bool,
    stdout: String,
    stderr: String,
}

struct CommandBytesProbe {
    ok: bool,
    stdout: Vec<u8>,
}

#[derive(Debug, Clone)]
struct PreviewText {
    content: String,
    truncated: bool,
    is_binary: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitBranchList {
    branches: Vec<String>,
    current_branch: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCheckoutResult {
    branch: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceGitActionResult {
    message: String,
    branch: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceCommitMessageResult {
    message: String,
    source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceGitStatusSnapshot {
    workspace_path: String,
    git_root: String,
    current_branch: Option<String>,
    ahead_count: usize,
    additions: usize,
    deletions: usize,
    has_upstream: bool,
    has_origin: bool,
    can_push: bool,
    files: Vec<WorkspaceGitFileStatus>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceGitFileStatus {
    path: String,
    relative_path: String,
    old_relative_path: Option<String>,
    index_status: String,
    worktree_status: String,
    status_kind: String,
    badge: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceGitDiff {
    path: String,
    relative_path: String,
    sections: Vec<WorkspaceGitDiffSection>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceGitDiffSection {
    kind: String,
    title: String,
    base_label: String,
    head_label: String,
    base_content: String,
    head_content: String,
    base_truncated: bool,
    head_truncated: bool,
    content: String,
    is_binary: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceTreeEntry {
    name: String,
    path: String,
    relative_path: String,
    kind: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceFilePreview {
    path: String,
    relative_path: String,
    content: String,
    truncated: bool,
    is_binary: bool,
}

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "remove_starter_notes_table",
            sql: "DROP TABLE IF EXISTS notes;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_orchestrator_tables",
            sql: "
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS workspaces (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    path TEXT NOT NULL UNIQUE,
                    label TEXT NOT NULL,
                    last_opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workspace_id INTEGER NOT NULL,
                    original_prompt TEXT NOT NULL,
                    improved_prompt TEXT NOT NULL,
                    route_recommendation TEXT NOT NULL,
                    budget_tokens INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id INTEGER NOT NULL,
                    workspace_id INTEGER NOT NULL,
                    codex_thread_id TEXT,
                    codex_turn_id TEXT,
                    model TEXT,
                    model_provider TEXT,
                    sandbox TEXT NOT NULL DEFAULT 'workspace-write',
                    approval_policy TEXT NOT NULL DEFAULT 'on-request',
                    status TEXT NOT NULL,
                    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    completed_at TEXT,
                    duration_ms INTEGER,
                    final_message TEXT,
                    error TEXT,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS run_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id INTEGER NOT NULL,
                    sequence INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    method TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS token_usage_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id INTEGER NOT NULL,
                    thread_id TEXT,
                    turn_id TEXT,
                    total_tokens INTEGER NOT NULL,
                    input_tokens INTEGER NOT NULL,
                    cached_input_tokens INTEGER NOT NULL,
                    output_tokens INTEGER NOT NULL,
                    reasoning_output_tokens INTEGER NOT NULL,
                    model_context_window INTEGER,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS preflight_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id INTEGER,
                    workspace_id INTEGER NOT NULL,
                    check_id TEXT NOT NULL,
                    label TEXT NOT NULL,
                    status TEXT NOT NULL,
                    message TEXT NOT NULL,
                    detail TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS recommendations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id INTEGER,
                    workspace_id INTEGER NOT NULL,
                    kind TEXT NOT NULL,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    accepted INTEGER NOT NULL DEFAULT 0,
                    dismissed INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_tasks_workspace_created ON tasks(workspace_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_runs_workspace_started ON runs(workspace_id, started_at DESC);
                CREATE INDEX IF NOT EXISTS idx_run_events_run_sequence ON run_events(run_id, sequence);
                CREATE INDEX IF NOT EXISTS idx_token_usage_run ON token_usage_snapshots(run_id, created_at);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_multi_account_codex_profiles",
            sql: "
                CREATE TABLE IF NOT EXISTS codex_accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    label TEXT NOT NULL,
                    email TEXT,
                    plan_type TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    last_error TEXT,
                    last_used_at TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    deleted_at TEXT
                );

                ALTER TABLE workspaces
                    ADD COLUMN default_account_id INTEGER
                    REFERENCES codex_accounts(id) ON DELETE SET NULL;

                ALTER TABLE runs
                    ADD COLUMN account_id INTEGER
                    REFERENCES codex_accounts(id) ON DELETE SET NULL;
                ALTER TABLE runs ADD COLUMN account_label TEXT;
                ALTER TABLE runs ADD COLUMN account_email TEXT;

                CREATE INDEX IF NOT EXISTS idx_codex_accounts_active
                    ON codex_accounts(deleted_at, last_used_at DESC);
                CREATE INDEX IF NOT EXISTS idx_runs_account_started
                    ON runs(account_id, started_at DESC);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "enforce_unique_active_codex_account_emails",
            sql: "
                UPDATE codex_accounts AS duplicate
                SET
                    status = 'signed_out',
                    last_error = 'Duplicate account consolidated',
                    updated_at = CURRENT_TIMESTAMP,
                    deleted_at = CURRENT_TIMESTAMP
                WHERE duplicate.deleted_at IS NULL
                  AND duplicate.email IS NOT NULL
                  AND TRIM(duplicate.email) <> ''
                  AND EXISTS (
                      SELECT 1
                      FROM codex_accounts AS keeper
                      WHERE keeper.deleted_at IS NULL
                        AND keeper.id <> duplicate.id
                        AND LOWER(TRIM(keeper.email)) = LOWER(TRIM(duplicate.email))
                        AND (
                            COALESCE(
                                keeper.last_used_at,
                                keeper.updated_at,
                                keeper.created_at
                            ) > COALESCE(
                                duplicate.last_used_at,
                                duplicate.updated_at,
                                duplicate.created_at
                            )
                            OR (
                                COALESCE(
                                    keeper.last_used_at,
                                    keeper.updated_at,
                                    keeper.created_at
                                ) = COALESCE(
                                    duplicate.last_used_at,
                                    duplicate.updated_at,
                                    duplicate.created_at
                                )
                                AND keeper.id > duplicate.id
                            )
                        )
                  );

                UPDATE workspaces
                SET default_account_id = NULL
                WHERE default_account_id IN (
                    SELECT id
                    FROM codex_accounts
                    WHERE deleted_at IS NOT NULL
                      AND last_error = 'Duplicate account consolidated'
                );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_codex_accounts_unique_active_email
                    ON codex_accounts(LOWER(TRIM(email)))
                    WHERE deleted_at IS NULL
                      AND email IS NOT NULL
                      AND TRIM(email) <> '';
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "soft_delete_workspaces",
            sql: "
                ALTER TABLE workspaces ADD COLUMN deleted_at TEXT;

                CREATE INDEX IF NOT EXISTS idx_workspaces_active_last_opened
                    ON workspaces(deleted_at, last_opened_at DESC);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_archived_runs",
            sql: "
                ALTER TABLE runs ADD COLUMN archived_at TEXT;
                CREATE INDEX IF NOT EXISTS idx_runs_workspace_archive_started
                    ON runs(workspace_id, archived_at, started_at DESC);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "soft_delete_runs",
            sql: "
                ALTER TABLE runs ADD COLUMN deleted_at TEXT;
                CREATE INDEX IF NOT EXISTS idx_runs_workspace_deleted_started
                    ON runs(workspace_id, deleted_at, started_at DESC);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "create_chats_for_threaded_history",
            sql: "
                CREATE TABLE IF NOT EXISTS chats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workspace_id INTEGER NOT NULL,
                    account_id INTEGER,
                    title TEXT NOT NULL,
                    codex_thread_id TEXT,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    deleted_at TEXT,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
                    FOREIGN KEY (account_id) REFERENCES codex_accounts(id) ON DELETE SET NULL
                );

                ALTER TABLE tasks ADD COLUMN chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL;
                ALTER TABLE tasks ADD COLUMN turn_index INTEGER;
                ALTER TABLE runs ADD COLUMN chat_id INTEGER REFERENCES chats(id) ON DELETE SET NULL;
                ALTER TABLE runs ADD COLUMN turn_index INTEGER;

                INSERT INTO chats (
                    id, workspace_id, account_id, title, codex_thread_id, status,
                    created_at, updated_at, deleted_at
                )
                SELECT
                    runs.id,
                    runs.workspace_id,
                    runs.account_id,
                    SUBSTR(tasks.original_prompt, 1, 120),
                    runs.codex_thread_id,
                    runs.status,
                    runs.started_at,
                    COALESCE(runs.completed_at, runs.started_at),
                    runs.deleted_at
                FROM runs
                JOIN tasks ON tasks.id = runs.task_id
                WHERE runs.chat_id IS NULL;

                UPDATE tasks
                SET chat_id = (
                    SELECT runs.id FROM runs WHERE runs.task_id = tasks.id LIMIT 1
                ),
                    turn_index = 1
                WHERE chat_id IS NULL
                  AND EXISTS (SELECT 1 FROM runs WHERE runs.task_id = tasks.id);

                UPDATE runs
                SET chat_id = runs.id,
                    turn_index = 1
                WHERE chat_id IS NULL;

                CREATE INDEX IF NOT EXISTS idx_chats_workspace_updated
                    ON chats(workspace_id, deleted_at, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_runs_chat_turn
                    ON runs(chat_id, turn_index, started_at);
                CREATE INDEX IF NOT EXISTS idx_tasks_chat_turn
                    ON tasks(chat_id, turn_index, created_at);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add_external_codex_chats",
            sql: "
                ALTER TABLE chats ADD COLUMN origin TEXT NOT NULL DEFAULT 'orchestrator';
                ALTER TABLE chats ADD COLUMN profile_key TEXT;
                ALTER TABLE chats ADD COLUMN external_thread_id TEXT;
                ALTER TABLE chats ADD COLUMN source_kind TEXT;
                ALTER TABLE chats ADD COLUMN sync_status TEXT;
                ALTER TABLE chats ADD COLUMN external_cwd TEXT;
                ALTER TABLE chats ADD COLUMN external_created_at TEXT;
                ALTER TABLE chats ADD COLUMN external_updated_at TEXT;
                ALTER TABLE chats ADD COLUMN last_synced_at TEXT;

                UPDATE chats
                SET origin = 'orchestrator',
                    profile_key = CASE
                        WHEN account_id IS NULL THEN NULL
                        ELSE 'account:' || account_id
                    END
                WHERE origin IS NULL OR origin = 'orchestrator';

                CREATE UNIQUE INDEX IF NOT EXISTS idx_chats_external_thread
                    ON chats(profile_key, external_thread_id)
                    WHERE origin = 'codex_external'
                      AND deleted_at IS NULL
                      AND external_thread_id IS NOT NULL;

                CREATE INDEX IF NOT EXISTS idx_chats_origin_workspace_updated
                    ON chats(workspace_id, origin, deleted_at, updated_at DESC);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "cache_external_chat_history_indexes",
            sql: "
                CREATE TABLE IF NOT EXISTS external_chat_history_indexes (
                    chat_id INTEGER PRIMARY KEY,
                    thread_id TEXT NOT NULL,
                    source_version TEXT NOT NULL,
                    page_size INTEGER NOT NULL,
                    total_turns INTEGER NOT NULL,
                    pages_json TEXT NOT NULL,
                    hints_json TEXT NOT NULL,
                    indexed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_external_chat_history_index_version
                    ON external_chat_history_indexes(thread_id, source_version);
            ",
            kind: MigrationKind::Up,
        },
        // Migration 11 has shipped. Keep this SQL byte-for-byte stable and use a
        // new migration version for every subsequent transcript schema change.
        Migration {
            version: 11,
            description: "cache_external_chat_transcript_snapshots",
            sql: "
                CREATE TABLE IF NOT EXISTS external_chat_transcript_snapshots (
                    chat_id INTEGER PRIMARY KEY,
                    source_version TEXT NOT NULL,
                    turn_count INTEGER NOT NULL,
                    synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS external_chat_turn_summaries (
                    chat_id INTEGER NOT NULL,
                    source_version TEXT NOT NULL,
                    slot_index INTEGER NOT NULL,
                    external_turn_id TEXT,
                    prompt TEXT NOT NULL,
                    final_message TEXT NOT NULL,
                    status TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    duration_ms INTEGER,
                    total_tokens INTEGER,
                    model_context_window INTEGER,
                    PRIMARY KEY (chat_id, source_version, slot_index),
                    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_external_chat_turn_summaries_active
                    ON external_chat_turn_summaries(chat_id, source_version, slot_index);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "add_external_transcript_turn_errors",
            sql: "
                ALTER TABLE external_chat_turn_summaries ADD COLUMN error TEXT;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "persist_native_plan_mode_workflows",
            sql: "
                ALTER TABLE chats ADD COLUMN collaboration_mode TEXT;
                ALTER TABLE chats ADD COLUMN saved_default_collaboration_mode_json TEXT;

                ALTER TABLE runs ADD COLUMN collaboration_mode TEXT;
                ALTER TABLE runs ADD COLUMN run_intent TEXT NOT NULL DEFAULT 'normal';
                ALTER TABLE runs ADD COLUMN client_user_message_id TEXT;
                ALTER TABLE runs ADD COLUMN completed_plan_item_id TEXT;
                ALTER TABLE runs ADD COLUMN completed_plan_text TEXT;
                ALTER TABLE runs ADD COLUMN plan_review_state TEXT NOT NULL DEFAULT 'none';

                CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_client_user_message_id
                    ON runs(client_user_message_id)
                    WHERE client_user_message_id IS NOT NULL;
            ",
            kind: MigrationKind::Up,
        },
        // Migration 14 has shipped. Keep its SQL stable and use a new version
        // for subsequent token-usage schema changes.
        Migration {
            version: 14,
            description: "separate_active_context_usage",
            sql: "
                ALTER TABLE token_usage_snapshots ADD COLUMN context_tokens INTEGER;

                UPDATE token_usage_snapshots
                SET context_tokens = (
                    SELECT CAST(json_extract(run_events.payload_json, '$.params.tokenUsage.last.totalTokens') AS INTEGER)
                    FROM run_events
                    WHERE run_events.run_id = token_usage_snapshots.run_id
                      AND run_events.method = 'thread/tokenUsage/updated'
                      AND json_valid(run_events.payload_json)
                      AND json_extract(run_events.payload_json, '$.params.tokenUsage.last.totalTokens') IS NOT NULL
                    ORDER BY run_events.sequence DESC, run_events.id DESC
                    LIMIT 1
                )
                WHERE token_usage_snapshots.id IN (
                    SELECT MAX(id)
                    FROM token_usage_snapshots
                    GROUP BY run_id
                );
            ",
            kind: MigrationKind::Up,
        },
        // Migration 15 has shipped. Keep its SQL stable and use a new version
        // for subsequent per-run token accounting changes.
        Migration {
            version: 15,
            description: "store_per_run_token_usage",
            sql: "
                ALTER TABLE token_usage_snapshots ADD COLUMN run_tokens INTEGER;
                ALTER TABLE token_usage_snapshots ADD COLUMN run_cached_input_tokens INTEGER;

                UPDATE token_usage_snapshots
                SET
                    run_tokens = MAX(
                        total_tokens - COALESCE((
                            SELECT previous_tokens.total_tokens
                            FROM runs previous_runs
                            JOIN token_usage_snapshots previous_tokens
                              ON previous_tokens.id = (
                                  SELECT MAX(previous_snapshot.id)
                                  FROM token_usage_snapshots previous_snapshot
                                  WHERE previous_snapshot.run_id = previous_runs.id
                              )
                            WHERE previous_runs.codex_thread_id = token_usage_snapshots.thread_id
                              AND previous_runs.id < token_usage_snapshots.run_id
                            ORDER BY previous_runs.id DESC
                            LIMIT 1
                        ), 0),
                        0
                    ),
                    run_cached_input_tokens = MAX(
                        cached_input_tokens - COALESCE((
                            SELECT previous_tokens.cached_input_tokens
                            FROM runs previous_runs
                            JOIN token_usage_snapshots previous_tokens
                              ON previous_tokens.id = (
                                  SELECT MAX(previous_snapshot.id)
                                  FROM token_usage_snapshots previous_snapshot
                                  WHERE previous_snapshot.run_id = previous_runs.id
                              )
                            WHERE previous_runs.codex_thread_id = token_usage_snapshots.thread_id
                              AND previous_runs.id < token_usage_snapshots.run_id
                            ORDER BY previous_runs.id DESC
                            LIMIT 1
                        ), 0),
                        0
                    )
                WHERE token_usage_snapshots.id IN (
                    SELECT MAX(id)
                    FROM token_usage_snapshots
                    GROUP BY run_id
                );
            ",
            kind: MigrationKind::Up,
        },
    ]
}

fn profile_key_for_account(account_id: i64) -> String {
    if account_id == DEFAULT_CODEX_PROFILE_ID {
        DEFAULT_CODEX_PROFILE_KEY.to_string()
    } else {
        format!("account:{account_id}")
    }
}

fn emit_process(app: &AppHandle, account_id: i64, status: &str, message: impl Into<String>) {
    let _ = app.emit(
        "codex:process",
        ProcessEvent {
            account_id,
            profile_key: profile_key_for_account(account_id),
            status: status.to_string(),
            message: message.into(),
        },
    );
}

fn pending_key(id: &Value) -> String {
    match id {
        Value::String(value) => value.clone(),
        other => other.to_string(),
    }
}

fn write_message(stdin: &Arc<Mutex<ChildStdin>>, message: &Value) -> Result<(), String> {
    let mut writer = stdin
        .lock()
        .map_err(|_| "Codex stdin lock was poisoned".to_string())?;
    writeln!(writer, "{}", message).map_err(|err| format!("Failed to write to Codex: {err}"))?;
    writer
        .flush()
        .map_err(|err| format!("Failed to flush Codex stdin: {err}"))
}

fn process_stdout(
    app: AppHandle,
    account_id: i64,
    connection_generation: u64,
    stdout: impl std::io::Read + Send + 'static,
    pending: PendingMap,
    pending_server_requests: PendingServerRequestMap,
    next_server_request_token: Arc<AtomicU64>,
    login_account: Arc<Mutex<Option<i64>>>,
) {
    for line in BufReader::new(stdout).lines() {
        match line {
            Ok(line) if line.trim().is_empty() => {}
            Ok(line) => match serde_json::from_str::<Value>(&line) {
                Ok(message) => {
                    let method = message.get("method").and_then(Value::as_str);
                    let id = message.get("id").cloned();

                    match (method, id) {
                        (Some(_), Some(request_id)) => {
                            let request_token = register_server_request(
                                &pending_server_requests,
                                &next_server_request_token,
                                account_id,
                                connection_generation,
                                request_id,
                            );
                            let _ = app.emit(
                                "codex:server-request",
                                CodexMessageEvent {
                                    account_id,
                                    profile_key: profile_key_for_account(account_id),
                                    message,
                                    request_token: Some(request_token),
                                },
                            );
                        }
                        (Some(method), None) => {
                            if method == "account/login/completed" {
                                if let Ok(mut active) = login_account.lock() {
                                    if *active == Some(account_id) {
                                        *active = None;
                                    }
                                }
                            }
                            if method == "serverRequest/resolved" {
                                if let Some(request_id) = message
                                    .get("params")
                                    .and_then(|params| params.get("requestId"))
                                {
                                    resolve_tracked_server_request(
                                        &pending_server_requests,
                                        account_id,
                                        connection_generation,
                                        request_id,
                                    );
                                }
                            }
                            let _ = app.emit(
                                "codex:notification",
                                CodexMessageEvent {
                                    account_id,
                                    profile_key: profile_key_for_account(account_id),
                                    message,
                                    request_token: None,
                                },
                            );
                        }
                        (None, Some(response_id)) => {
                            let key = pending_key(&response_id);
                            let sender = pending.lock().ok().and_then(|mut map| map.remove(&key));

                            if let Some(pending_response) = sender {
                                if let Some(error) = message.get("error") {
                                    let _ = pending_response.sender.send(Err(error.to_string()));
                                } else {
                                    let result = message.get("result").cloned().unwrap_or(Value::Null);
                                    let _ = pending_response.sender.send(Ok(result));
                                }
                            } else {
                                emit_process(&app, account_id, "warning", format!("Unmatched Codex response: {line}"));
                            }
                        }
                        (None, None) => {
                            emit_process(&app, account_id, "warning", format!("Unknown Codex message: {line}"));
                        }
                    }
                }
                Err(err) => emit_process(&app, account_id, "warning", format!("Invalid Codex JSONL: {err}")),
            },
            Err(err) => {
                emit_process(&app, account_id, "error", format!("Failed reading Codex stdout: {err}"));
                break;
            }
        }
    }

    reject_pending_for_account(
        &pending,
        account_id,
        "Codex app-server exited before responding",
    );
    clear_server_requests_for_generation(
        &pending_server_requests,
        account_id,
        connection_generation,
    );
    emit_process(&app, account_id, "exited", "Codex app-server stdout closed");
}

fn register_server_request(
    pending: &PendingServerRequestMap,
    sequence: &AtomicU64,
    account_id: i64,
    connection_generation: u64,
    request_id: Value,
) -> String {
    let mut requests = pending
        .lock()
        .expect("pending server request lock was poisoned");
    if let Some((token, _)) = requests.iter().find(|(_, request)| {
        request.account_id == account_id
            && request.connection_generation == connection_generation
            && request.request_id == request_id
    }) {
        return token.clone();
    }

    let token = format!(
        "server-request-{account_id}-{connection_generation}-{}",
        sequence.fetch_add(1, Ordering::SeqCst) + 1
    );
    requests.insert(
        token.clone(),
        PendingServerRequest {
            account_id,
            connection_generation,
            request_id,
            response_state: ServerRequestResponseState::Pending,
        },
    );
    token
}

fn resolve_tracked_server_request(
    pending: &PendingServerRequestMap,
    account_id: i64,
    connection_generation: u64,
    request_id: &Value,
) {
    if let Ok(mut requests) = pending.lock() {
        let token = requests.iter().find_map(|(token, request)| {
            (request.account_id == account_id
                && request.connection_generation == connection_generation
                && &request.request_id == request_id)
                .then(|| token.clone())
        });
        if let Some(token) = token {
            requests.remove(&token);
        }
    }
}

fn clear_server_requests_for_generation(
    pending: &PendingServerRequestMap,
    account_id: i64,
    connection_generation: u64,
) {
    if let Ok(mut requests) = pending.lock() {
        requests.retain(|_, request| {
            request.account_id != account_id
                || request.connection_generation != connection_generation
        });
    }
}

fn clear_server_requests_for_account(pending: &PendingServerRequestMap, account_id: i64) {
    if let Ok(mut requests) = pending.lock() {
        requests.retain(|_, request| request.account_id != account_id);
    }
}

fn claim_server_request(
    pending: &PendingServerRequestMap,
    account_id: i64,
    connection_generation: u64,
    request_token: &str,
    request_id: &Value,
) -> Result<(), String> {
    let mut requests = pending
        .lock()
        .map_err(|_| "Pending Codex server request lock was poisoned".to_string())?;
    let request = requests
        .get_mut(request_token)
        .ok_or_else(|| "This Codex approval request is stale or already resolved".to_string())?;
    if request.account_id != account_id
        || request.connection_generation != connection_generation
        || &request.request_id != request_id
    {
        return Err("The approval response does not match the active native request".to_string());
    }
    if request.response_state != ServerRequestResponseState::Pending {
        return Err("A response to this Codex approval request was already submitted".to_string());
    }
    request.response_state = ServerRequestResponseState::Responding;
    Ok(())
}

fn release_server_request_claim(pending: &PendingServerRequestMap, request_token: &str) {
    if let Ok(mut requests) = pending.lock() {
        if let Some(request) = requests.get_mut(request_token) {
            request.response_state = ServerRequestResponseState::Pending;
        }
    }
}

fn process_stderr(
    app: AppHandle,
    account_id: i64,
    stderr: impl std::io::Read + Send + 'static,
) {
    for line in BufReader::new(stderr).lines() {
        match line {
            Ok(line) if !line.trim().is_empty() => emit_process(&app, account_id, "stderr", line),
            Ok(_) => {}
            Err(err) => {
                emit_process(&app, account_id, "error", format!("Failed reading Codex stderr: {err}"));
                break;
            }
        }
    }
}

fn process_stdin(state: &CodexState, account_id: i64) -> Result<Arc<Mutex<ChildStdin>>, String> {
    let processes = state
        .processes
        .lock()
        .map_err(|_| "Codex processes lock was poisoned".to_string())?;
    processes
        .get(&account_id)
        .map(|process| Arc::clone(&process.stdin))
        .ok_or_else(|| format!("Codex account {account_id} is not connected"))
}

async fn send_request(
    state: &CodexState,
    account_id: i64,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let stdin = process_stdin(state, account_id)?;
    let id = state.next_id.fetch_add(1, Ordering::SeqCst);
    let key = id.to_string();
    let (tx, rx) = oneshot::channel();

    state
        .pending
        .lock()
        .map_err(|_| "Codex pending map lock was poisoned".to_string())?
        .insert(
            key.clone(),
            PendingResponse {
                account_id,
                sender: tx,
            },
        );

    let message = json!({
        "method": method,
        "id": id,
        "params": params,
    });

    if let Err(err) = write_message(&stdin, &message) {
        let _ = state.pending.lock().map(|mut map| map.remove(&key));
        return Err(err);
    }

    match timeout(Duration::from_secs(60), rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => {
            let _ = state.pending.lock().map(|mut map| map.remove(&key));
            Err(format!("Codex response channel closed while waiting for {method}"))
        }
        Err(_) => {
            let _ = state.pending.lock().map(|mut map| map.remove(&key));
            Err(format!("Timed out waiting for Codex response to {method}"))
        }
    }
}

fn project_historical_turn_activity(response: &Value) -> HistoricalTurnActivityResponse {
    let mut commands = Vec::new();
    let mut edited_files: Vec<HistoricalEditedFile> = Vec::new();
    let items = response
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for item in items {
        match item.get("type").and_then(Value::as_str) {
            Some("commandExecution") => {
                let id = item
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("historical-command")
                    .to_string();
                let command = item
                    .get("command")
                    .and_then(Value::as_str)
                    .unwrap_or("Command")
                    .to_string();
                let status = match item.get("status").and_then(Value::as_str) {
                    Some("inProgress") => "running",
                    Some("failed") => "failed",
                    Some("declined") => "declined",
                    _ => "completed",
                }
                .to_string();
                commands.push(HistoricalCommandActivity {
                    id,
                    command,
                    status,
                    duration_ms: item.get("durationMs").and_then(Value::as_i64),
                });
            }
            Some("fileChange") => {
                let changes = item
                    .get("changes")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                for change in changes {
                    let Some(path) = change.get("path").and_then(Value::as_str) else {
                        continue;
                    };
                    let diff = change.get("diff").and_then(Value::as_str).unwrap_or("");
                    let (additions, deletions) = count_unified_diff_lines(diff);
                    let kind = change
                        .get("kind")
                        .and_then(Value::as_object)
                        .and_then(|kind| kind.get("type"))
                        .and_then(Value::as_str);
                    let moved = change
                        .get("kind")
                        .and_then(Value::as_object)
                        .and_then(|kind| kind.get("move_path"))
                        .and_then(Value::as_str)
                        .is_some();
                    let status = match (kind, moved) {
                        (_, true) => "renamed",
                        (Some("add"), _) => "added",
                        (Some("delete"), _) => "deleted",
                        _ => "modified",
                    };

                    if let Some(existing) = edited_files.iter_mut().find(|file| file.path == path) {
                        existing.additions = additions;
                        existing.deletions = deletions;
                        existing.status = status.to_string();
                    } else {
                        edited_files.push(HistoricalEditedFile {
                            path: path.to_string(),
                            name: Path::new(path)
                                .file_name()
                                .and_then(OsStr::to_str)
                                .unwrap_or(path)
                                .to_string(),
                            additions,
                            deletions,
                            status: status.to_string(),
                        });
                    }
                }
            }
            _ => {}
        }
    }

    HistoricalTurnActivityResponse {
        commands,
        edited_files,
        next_cursor: response
            .get("nextCursor")
            .and_then(Value::as_str)
            .map(str::to_string),
    }
}

struct RawHistoryIndexPage {
    cursor: Option<String>,
    hints: Vec<HistoryTurnHint>,
}

fn text_metrics(text: &str) -> (usize, usize) {
    if text.is_empty() {
        return (0, 0);
    }
    (text.chars().count(), text.bytes().filter(|byte| *byte == b'\n').count() + 1)
}

fn item_text_metrics(item: &Value) -> (usize, usize) {
    if let Some(text) = item.get("text").and_then(Value::as_str) {
        return text_metrics(text);
    }

    if let Some(content) = item.get("content").and_then(Value::as_array) {
        let mut characters = 0;
        let mut lines = 0;
        for part in content {
            let text = part
                .as_str()
                .or_else(|| part.get("text").and_then(Value::as_str))
                .or_else(|| part.get("value").and_then(Value::as_str))
                .or_else(|| part.get("content").and_then(Value::as_str));
            if let Some(text) = text {
                let (part_characters, part_lines) = text_metrics(text);
                characters += part_characters;
                lines += part_lines;
            }
        }
        return (characters, lines);
    }

    item.get("message")
        .and_then(|message| message.get("text"))
        .and_then(Value::as_str)
        .map(text_metrics)
        .unwrap_or((0, 0))
}

fn project_history_turn_hint(turn: &Value) -> HistoryTurnHint {
    let items = turn
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut prompt_characters = 0;
    let mut prompt_lines = 0;
    let mut fallback_agent: Option<&Value> = None;
    let mut final_agent: Option<&Value> = None;

    for item in &items {
        match item.get("type").and_then(Value::as_str) {
            Some("userMessage") => {
                let (characters, lines) = item_text_metrics(item);
                prompt_characters += characters;
                prompt_lines += lines;
            }
            Some("agentMessage") => {
                fallback_agent = Some(item);
                if item.get("phase").and_then(Value::as_str) == Some("final_answer") {
                    final_agent = Some(item);
                }
            }
            _ => {}
        }
    }

    let (response_characters, response_lines) = final_agent
        .or(fallback_agent)
        .map(item_text_metrics)
        .unwrap_or((0, 0));
    HistoryTurnHint {
        slot_index: 0,
        turn_id: turn.get("id").and_then(Value::as_str).map(str::to_string),
        prompt_characters,
        response_characters,
        prompt_lines,
        response_lines,
    }
}

fn external_item_text(item: &Value) -> String {
    if let Some(text) = item.get("text").and_then(Value::as_str) {
        return text.to_string();
    }

    if let Some(content) = item.get("content").and_then(Value::as_array) {
        return content
            .iter()
            .filter_map(|part| {
                part.as_str()
                    .or_else(|| part.get("text").and_then(Value::as_str))
                    .or_else(|| part.get("value").and_then(Value::as_str))
                    .or_else(|| part.get("content").and_then(Value::as_str))
            })
            .collect::<String>();
    }

    item.get("message")
        .and_then(|message| message.get("text"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn external_turn_items(turn: &Value) -> Vec<Value> {
    for key in ["items", "output", "input"] {
        if let Some(items) = turn.get(key).and_then(Value::as_array) {
            if !items.is_empty() {
                return items.clone();
            }
        }
    }
    Vec::new()
}

fn external_timestamp(turn: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        let value = turn.get(*key)?;
        value
            .as_str()
            .map(str::to_string)
            .or_else(|| value.as_i64().map(|timestamp| timestamp.to_string()))
            .or_else(|| value.as_u64().map(|timestamp| timestamp.to_string()))
    })
}

fn external_token_metric(turn: &Value, keys: &[&str]) -> Option<i64> {
    [turn.get("tokenUsage"), turn.get("token_usage"), turn.get("usage")]
        .into_iter()
        .flatten()
        .find_map(|usage| {
            keys.iter().find_map(|key| {
                let value = usage.get(*key)?;
                value
                    .as_i64()
                    .or_else(|| value.as_u64().and_then(|number| i64::try_from(number).ok()))
            })
        })
}

fn external_turn_error(turn: &Value) -> Option<String> {
    let error = turn.get("error")?;
    if error.is_null() {
        return None;
    }
    error
        .as_str()
        .map(str::to_string)
        .or_else(|| error.get("message").and_then(Value::as_str).map(str::to_string))
        .or_else(|| Some(error.to_string()))
}

fn project_external_transcript_turn(turn: &Value) -> Option<ExternalTranscriptTurnSummary> {
    let items = external_turn_items(turn);
    let prompt = items
        .iter()
        .filter(|item| item.get("type").and_then(Value::as_str) == Some("userMessage"))
        .map(external_item_text)
        .filter(|text| !text.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
        .trim()
        .to_string();
    if prompt.is_empty() {
        return None;
    }

    let agent_messages = items
        .iter()
        .filter(|item| item.get("type").and_then(Value::as_str) == Some("agentMessage"))
        .collect::<Vec<_>>();
    let final_agent = agent_messages
        .iter()
        .find(|item| item.get("phase").and_then(Value::as_str) == Some("final_answer"))
        .copied()
        .or_else(|| agent_messages.last().copied());
    let final_message = final_agent
        .map(|item| external_item_text(item).trim().to_string())
        .unwrap_or_default();
    let raw_status = turn.get("status").and_then(Value::as_str).unwrap_or_default();
    let status = match raw_status {
        "failed" => "failed",
        "running" => "running",
        "interrupted" | "cancelled" | "canceled" => "interrupted",
        _ if !final_message.is_empty() => "completed",
        _ => "interrupted",
    }
    .to_string();

    Some(ExternalTranscriptTurnSummary {
        slot_index: 0,
        turn_id: turn.get("id").and_then(Value::as_str).map(str::to_string),
        prompt,
        final_message,
        error: external_turn_error(turn),
        status,
        started_at: external_timestamp(
            turn,
            &["startedAt", "started_at", "createdAt", "created_at"],
        ),
        completed_at: external_timestamp(turn, &["completedAt", "completed_at"]),
        duration_ms: turn
            .get("durationMs")
            .or_else(|| turn.get("duration_ms"))
            .and_then(Value::as_i64),
        total_tokens: external_token_metric(turn, &["totalTokens", "total_tokens"]),
        model_context_window: external_token_metric(
            turn,
            &["modelContextWindow", "model_context_window"],
        ),
    })
}

fn transcript_sync_request_active(state: &CodexState, request_id: &str) -> bool {
    state
        .transcript_sync_requests
        .lock()
        .map(|requests| requests.contains(request_id))
        .unwrap_or(false)
}

async fn build_external_thread_transcript(
    state: &CodexState,
    thread_id: &str,
    source_version: &str,
    page_size: usize,
    request_id: &str,
) -> Result<ExternalTranscriptSnapshot, String> {
    let mut cursor: Option<String> = None;
    let mut pages: Vec<Vec<ExternalTranscriptTurnSummary>> = Vec::new();

    loop {
        if !transcript_sync_request_active(state, request_id) {
            return Err("Transcript synchronization cancelled".to_string());
        }
        let response = send_request(
            state,
            DEFAULT_CODEX_PROFILE_ID,
            "thread/turns/list",
            json!({
                "threadId": thread_id,
                "cursor": cursor,
                "limit": page_size,
                "sortDirection": "desc",
                "itemsView": "summary",
            }),
        )
        .await?;
        if !transcript_sync_request_active(state, request_id) {
            return Err("Transcript synchronization cancelled".to_string());
        }

        let data = response
            .get("data")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if data.is_empty() {
            break;
        }
        pages.push(
            data.iter()
                .filter_map(project_external_transcript_turn)
                .collect(),
        );
        cursor = response
            .get("nextCursor")
            .and_then(Value::as_str)
            .map(str::to_string);
        if cursor.is_none() {
            break;
        }
    }

    pages.reverse();
    let mut turns = Vec::new();
    for mut page in pages {
        page.reverse();
        for mut turn in page {
            turn.slot_index = turns.len();
            turns.push(turn);
        }
    }

    Ok(ExternalTranscriptSnapshot {
        request_id: request_id.to_string(),
        thread_id: thread_id.to_string(),
        source_version: source_version.to_string(),
        total_turns: turns.len(),
        turns,
    })
}

fn history_index_request_active(state: &CodexState, request_id: &str) -> bool {
    state
        .history_index_requests
        .lock()
        .map(|requests| requests.contains(request_id))
        .unwrap_or(false)
}

async fn build_external_thread_history_index(
    state: &CodexState,
    thread_id: &str,
    source_version: &str,
    page_size: usize,
    request_id: &str,
) -> Result<ExternalThreadHistoryIndex, String> {
    let mut cursor: Option<String> = None;
    let mut raw_pages = Vec::new();

    loop {
        if !history_index_request_active(state, request_id) {
            return Err("History indexing cancelled".to_string());
        }
        let response = send_request(
            state,
            DEFAULT_CODEX_PROFILE_ID,
            "thread/turns/list",
            json!({
                "threadId": thread_id,
                "cursor": cursor,
                "limit": page_size,
                "sortDirection": "desc",
                "itemsView": "summary",
            }),
        )
        .await?;
        if !history_index_request_active(state, request_id) {
            return Err("History indexing cancelled".to_string());
        }

        let data = response
            .get("data")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if data.is_empty() {
            break;
        }
        raw_pages.push(RawHistoryIndexPage {
            cursor: cursor.clone(),
            hints: data.iter().map(project_history_turn_hint).collect(),
        });
        cursor = response
            .get("nextCursor")
            .and_then(Value::as_str)
            .map(str::to_string);
        if cursor.is_none() {
            break;
        }
    }

    raw_pages.reverse();
    let mut pages = Vec::with_capacity(raw_pages.len());
    let mut hints = Vec::new();
    let mut start_index = 0;
    for (page_index, mut raw_page) in raw_pages.into_iter().enumerate() {
        raw_page.hints.reverse();
        let turn_count = raw_page.hints.len();
        for mut hint in raw_page.hints {
            hint.slot_index = hints.len();
            hints.push(hint);
        }
        pages.push(HistoryPageDescriptor {
            id: format!("external:{thread_id}:{page_index}"),
            page_index,
            start_index,
            turn_count,
            cursor: raw_page.cursor,
            local_offset: None,
        });
        start_index += turn_count;
    }

    Ok(ExternalThreadHistoryIndex {
        request_id: request_id.to_string(),
        thread_id: thread_id.to_string(),
        source_version: source_version.to_string(),
        total_turns: hints.len(),
        page_size,
        pages,
        hints,
    })
}

fn count_unified_diff_lines(diff: &str) -> (usize, usize) {
    let additions = diff
        .lines()
        .filter(|line| line.starts_with('+') && !line.starts_with("+++"))
        .count();
    let deletions = diff
        .lines()
        .filter(|line| line.starts_with('-') && !line.starts_with("---"))
        .count();
    (additions, deletions)
}

fn send_notification(state: &CodexState, account_id: i64, message: Value) -> Result<(), String> {
    let stdin = process_stdin(state, account_id)?;
    write_message(&stdin, &message)
}

#[tauri::command]
async fn codex_connect(
    account_id: i64,
    app: AppHandle,
    state: State<'_, CodexState>,
) -> Result<CodexConnectResult, String> {
    validate_account_id(account_id)?;
    let codex_home = ensure_codex_home(&app, account_id)?;
    connect_codex_profile(account_id, &app, &state, codex_home, true).await
}

#[tauri::command]
async fn codex_default_profile_connect(
    app: AppHandle,
    state: State<'_, CodexState>,
) -> Result<CodexConnectResult, String> {
    let codex_home = ensure_default_codex_home()?;
    connect_codex_profile(
        DEFAULT_CODEX_PROFILE_ID,
        &app,
        &state,
        codex_home,
        false,
    )
    .await
}

async fn connect_codex_profile(
    account_id: i64,
    app: &AppHandle,
    state: &CodexState,
    codex_home: PathBuf,
    isolated_file_store: bool,
) -> Result<CodexConnectResult, String> {
    let connection_generation =
        state.next_connection_generation.fetch_add(1, Ordering::SeqCst) + 1;
    {
        let mut processes = state
            .processes
            .lock()
            .map_err(|_| "Codex processes lock was poisoned".to_string())?;

        if let Some(existing) = processes.get_mut(&account_id) {
            if existing
                .child
                .try_wait()
                .map_err(|err| format!("Failed to inspect Codex process: {err}"))?
                .is_none()
            {
                return Ok(CodexConnectResult {
                    pid: Some(existing.child.id()),
                    already_connected: true,
                    initialize: json!({ "status": "already-connected" }),
                });
            }
            processes.remove(&account_id);
        }

        let codex_binary = resolve_codex_binary()?;
        let mut command = Command::new(&codex_binary);
        command.args(["app-server", "--listen", "stdio://"]);
        if isolated_file_store {
            command.args(["-c", "cli_auth_credentials_store=\"file\""]);
        }
        let mut child = command
            .env("CODEX_HOME", &codex_home)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|err| {
                format!(
                    "Failed to start `codex app-server` from {}: {err}",
                    codex_binary.display()
                )
            })?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Codex stdout was not available".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Codex stderr was not available".to_string())?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Codex stdin was not available".to_string())?;

        let pending = Arc::clone(&state.pending);
        let pending_server_requests = Arc::clone(&state.pending_server_requests);
        let next_server_request_token = Arc::clone(&state.next_server_request_token);
        let login_account = Arc::clone(&state.login_account);
        let stdout_app = app.clone();
        std::thread::spawn(move || {
            process_stdout(
                stdout_app,
                account_id,
                connection_generation,
                stdout,
                pending,
                pending_server_requests,
                next_server_request_token,
                login_account,
            )
        });

        let stderr_app = app.clone();
        std::thread::spawn(move || process_stderr(stderr_app, account_id, stderr));

        processes.insert(account_id, CodexProcess {
            child,
            stdin: Arc::new(Mutex::new(stdin)),
            connection_generation,
        });
    }

    let initialize = send_request(
        &state,
        account_id,
        "initialize",
        json!({
            "clientInfo": {
                "name": "orchestrator",
                "title": "Orchestrator",
                "version": env!("CARGO_PKG_VERSION")
            },
            "capabilities": {
                "experimentalApi": true
            }
        }),
    )
    .await?;

    send_notification(
        &state,
        account_id,
        json!({ "method": "initialized", "params": {} }),
    )?;

    let pid = state
        .processes
        .lock()
        .ok()
        .and_then(|processes| processes.get(&account_id).map(|process| process.child.id()));

    emit_process(app, account_id, "connected", "Codex app-server connected");

    Ok(CodexConnectResult {
        pid,
        already_connected: false,
        initialize,
    })
}

#[tauri::command]
async fn codex_rpc(
    account_id: i64,
    method: String,
    params: Value,
    state: State<'_, CodexState>,
) -> Result<Value, String> {
    if method == "account/login/start" {
        let mut active = state
            .login_account
            .lock()
            .map_err(|_| "Codex login lock was poisoned".to_string())?;
        if let Some(active_account_id) = *active {
            if active_account_id != account_id {
                return Err(format!(
                    "Another Codex sign-in is already active for account {active_account_id}"
                ));
            }
        }
        *active = Some(account_id);
    }

    let response = send_request(&state, account_id, &method, params).await;

    if response.is_err()
        || method == "account/login/cancel"
        || method == "account/logout"
    {
        if let Ok(mut active) = state.login_account.lock() {
            if *active == Some(account_id) {
                *active = None;
            }
        }
    }

    response
}

#[tauri::command]
async fn codex_default_profile_rpc(
    method: String,
    params: Value,
    state: State<'_, CodexState>,
) -> Result<Value, String> {
    send_request(&state, DEFAULT_CODEX_PROFILE_ID, &method, params).await
}

#[tauri::command]
async fn codex_default_profile_turn_activity(
    thread_id: String,
    turn_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, CodexState>,
) -> Result<HistoricalTurnActivityResponse, String> {
    if thread_id.trim().is_empty() || turn_id.trim().is_empty() {
        return Err("Thread and turn ids are required".to_string());
    }
    let limit = limit.unwrap_or(50).clamp(1, 50);
    let response = send_request(
        &state,
        DEFAULT_CODEX_PROFILE_ID,
        "thread/items/list",
        json!({
            "threadId": thread_id,
            "turnId": turn_id,
            "cursor": cursor,
            "limit": limit,
            "sortDirection": "desc"
        }),
    )
    .await?;
    Ok(project_historical_turn_activity(&response))
}

#[tauri::command]
async fn codex_default_profile_thread_index(
    thread_id: String,
    source_version: String,
    page_size: Option<u32>,
    request_id: String,
    state: State<'_, CodexState>,
) -> Result<ExternalThreadHistoryIndex, String> {
    if thread_id.trim().is_empty() || request_id.trim().is_empty() {
        return Err("Thread id and index request id are required".to_string());
    }
    let page_size = page_size.unwrap_or(20).clamp(1, 100) as usize;
    state
        .history_index_requests
        .lock()
        .map_err(|_| "History index request lock was poisoned".to_string())?
        .insert(request_id.clone());
    let result = build_external_thread_history_index(
        &state,
        &thread_id,
        &source_version,
        page_size,
        &request_id,
    )
    .await;
    let _ = state
        .history_index_requests
        .lock()
        .map(|mut requests| requests.remove(&request_id));
    result
}

#[tauri::command]
fn codex_default_profile_thread_index_cancel(
    request_id: String,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    state
        .history_index_requests
        .lock()
        .map_err(|_| "History index request lock was poisoned".to_string())?
        .remove(&request_id);
    Ok(())
}

#[tauri::command]
async fn codex_default_profile_thread_transcript_sync(
    thread_id: String,
    source_version: String,
    page_size: Option<u32>,
    request_id: String,
    state: State<'_, CodexState>,
) -> Result<ExternalTranscriptSnapshot, String> {
    if thread_id.trim().is_empty() || request_id.trim().is_empty() {
        return Err("Thread id and transcript request id are required".to_string());
    }
    let page_size = page_size.unwrap_or(20).clamp(1, 100) as usize;
    state
        .transcript_sync_requests
        .lock()
        .map_err(|_| "Transcript sync request lock was poisoned".to_string())?
        .insert(request_id.clone());
    let result = build_external_thread_transcript(
        &state,
        &thread_id,
        &source_version,
        page_size,
        &request_id,
    )
    .await;
    let _ = state
        .transcript_sync_requests
        .lock()
        .map(|mut requests| requests.remove(&request_id));
    result
}

#[tauri::command]
fn codex_default_profile_thread_transcript_cancel(
    request_id: String,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    state
        .transcript_sync_requests
        .lock()
        .map_err(|_| "Transcript sync request lock was poisoned".to_string())?
        .remove(&request_id);
    Ok(())
}

#[tauri::command]
fn codex_resolve_server_request(
    account_id: i64,
    id: Value,
    request_token: String,
    result: Value,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    resolve_server_request_once(&state, account_id, &request_token, id, result)
}

#[tauri::command]
fn codex_default_profile_resolve_server_request(
    id: Value,
    request_token: String,
    result: Value,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    resolve_server_request_once(
        &state,
        DEFAULT_CODEX_PROFILE_ID,
        &request_token,
        id,
        result,
    )
}

fn resolve_server_request_once(
    state: &CodexState,
    account_id: i64,
    request_token: &str,
    id: Value,
    result: Value,
) -> Result<(), String> {
    let connection_generation = state
        .processes
        .lock()
        .map_err(|_| "Codex processes lock was poisoned".to_string())?
        .get(&account_id)
        .map(|process| process.connection_generation)
        .ok_or_else(|| format!("Codex account {account_id} is not connected"))?;

    claim_server_request(
        &state.pending_server_requests,
        account_id,
        connection_generation,
        request_token,
        &id,
    )?;

    let response = json!({ "id": id, "result": result });
    if let Err(error) = send_notification(state, account_id, response) {
        release_server_request_claim(&state.pending_server_requests, request_token);
        return Err(error);
    }

    Ok(())
}

#[tauri::command]
fn codex_stop(
    account_id: i64,
    app: AppHandle,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    stop_codex_account(account_id, &app, &state)
}

#[tauri::command]
fn codex_default_profile_stop(
    app: AppHandle,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    stop_codex_account(DEFAULT_CODEX_PROFILE_ID, &app, &state)
}

fn stop_codex_account(
    account_id: i64,
    app: &AppHandle,
    state: &CodexState,
) -> Result<(), String> {
    let mut processes = state
        .processes
        .lock()
        .map_err(|_| "Codex processes lock was poisoned".to_string())?;

    if let Some(mut process) = processes.remove(&account_id) {
        let _ = process.child.kill();
        let _ = process.child.wait();
    }

    reject_pending_for_account(
        &state.pending,
        account_id,
        "Codex app-server was stopped",
    );
    clear_server_requests_for_account(&state.pending_server_requests, account_id);

    if let Ok(mut active) = state.login_account.lock() {
        if *active == Some(account_id) {
            *active = None;
        }
    }

    emit_process(app, account_id, "stopped", "Codex app-server stopped");
    Ok(())
}

fn pending_keys_for_account(
    pending: &HashMap<String, PendingResponse>,
    account_id: i64,
) -> Vec<String> {
    pending
        .iter()
        .filter_map(|(key, response)| {
            (response.account_id == account_id).then_some(key.clone())
        })
        .collect()
}

fn reject_pending_for_account(pending: &PendingMap, account_id: i64, message: &str) {
    if let Ok(mut pending) = pending.lock() {
        let rejected_keys = pending_keys_for_account(&pending, account_id);
        for key in rejected_keys {
            if let Some(response) = pending.remove(&key) {
                let _ = response.sender.send(Err(message.to_string()));
            }
        }
    }
}

#[tauri::command]
fn codex_delete_profile(
    account_id: i64,
    app: AppHandle,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    validate_account_id(account_id)?;
    stop_codex_account(account_id, &app, &state)?;
    let profile_root = codex_profile_root(&app, account_id)?;
    if profile_root.exists() {
        fs::remove_dir_all(&profile_root).map_err(|error| {
            format!(
                "Failed to delete Codex profile {}: {error}",
                profile_root.display()
            )
        })?;
    }
    Ok(())
}

fn list_git_branches_blocking(path: String) -> Result<GitBranchList, String> {
    let git_probe = run_command("git", &["-C", &path, "rev-parse", "--is-inside-work-tree"]);
    if !git_probe.ok {
        return Err(output_detail(&git_probe).unwrap_or_else(|| {
            "Selected folder is not inside a Git repository".to_string()
        }));
    }

    let current_probe = run_command("git", &["-C", &path, "branch", "--show-current"]);
    let current_branch = current_probe
        .stdout
        .lines()
        .next()
        .map(str::trim)
        .filter(|branch| !branch.is_empty())
        .map(str::to_string);

    let branches_probe = run_command(
        "git",
        &["-C", &path, "for-each-ref", "--format=%(refname:short)", "refs/heads"],
    );
    if !branches_probe.ok {
        return Err(output_detail(&branches_probe)
            .unwrap_or_else(|| "Unable to list Git branches".to_string()));
    }

    let mut branches: Vec<String> = branches_probe
        .stdout
        .lines()
        .map(str::trim)
        .filter(|branch| !branch.is_empty())
        .map(str::to_string)
        .collect();
    branches.sort();

    if let Some(current) = &current_branch {
        if !branches.iter().any(|branch| branch == current) {
            branches.insert(0, current.clone());
        }
    }

    Ok(GitBranchList {
        branches,
        current_branch,
    })
}

#[tauri::command]
async fn list_git_branches(path: String) -> Result<GitBranchList, String> {
    run_blocking_command("list Git branches", move || list_git_branches_blocking(path)).await
}

fn checkout_git_branch_blocking(
    path: String,
    branch: String,
) -> Result<GitCheckoutResult, String> {
    if branch.trim().is_empty() {
        return Err("Choose a branch before switching".to_string());
    }

    let branches = list_git_branches_blocking(path.clone())?;
    if !branches.branches.iter().any(|candidate| candidate == &branch) {
        return Err(format!("Branch `{branch}` was not found in the selected folder"));
    }

    if branches.current_branch.as_deref() == Some(branch.as_str()) {
        return Ok(GitCheckoutResult { branch });
    }

    let checkout_probe = run_command("git", &["-C", &path, "checkout", &branch]);
    if !checkout_probe.ok {
        return Err(output_detail(&checkout_probe)
            .unwrap_or_else(|| format!("Unable to switch to `{branch}`")));
    }

    Ok(GitCheckoutResult { branch })
}

#[tauri::command]
async fn checkout_git_branch(path: String, branch: String) -> Result<GitCheckoutResult, String> {
    run_blocking_command("check out Git branch", move || {
        checkout_git_branch_blocking(path, branch)
    })
    .await
}

fn commit_workspace_changes_blocking(
    workspace_path: String,
    message: String,
    include_unstaged: Option<bool>,
) -> Result<WorkspaceGitActionResult, String> {
    let trimmed_message = message.trim();
    if trimmed_message.is_empty() {
        return Err("Enter a commit message before committing".to_string());
    }
    let include_unstaged = include_unstaged.unwrap_or(true);

    let workspace = canonical_workspace(&workspace_path)?;
    let git_root = resolve_git_root(&workspace)?;
    let pathspec = workspace_git_pathspec(&git_root, &workspace)?;

    let status_probe = git_status_for_pathspec(&git_root, &pathspec);
    if !status_probe.ok {
        return Err(output_detail(&status_probe)
            .unwrap_or_else(|| "Unable to inspect Git changes".to_string()));
    }
    if status_probe.stdout.trim().is_empty() {
        return Err("No workspace changes to commit".to_string());
    }

    let root_arg = git_root.to_string_lossy();
    if include_unstaged {
        let add_probe = run_command(
            "git",
            &["-C", root_arg.as_ref(), "add", "-A", "--", &pathspec],
        );
        if !add_probe.ok {
            return Err(output_detail(&add_probe)
                .unwrap_or_else(|| "Unable to stage workspace changes".to_string()));
        }
    }

    let staged_inside_workspace = git_staged_paths(&git_root, Some(&pathspec))?;
    if staged_inside_workspace.is_empty() {
        return Err(if include_unstaged {
            "No workspace changes to commit".to_string()
        } else {
            "No staged workspace changes to commit".to_string()
        });
    }

    let commit_probe = if include_unstaged {
        run_command(
            "git",
            &[
                "-C",
                root_arg.as_ref(),
                "commit",
                "-m",
                trimmed_message,
                "--",
                &pathspec,
            ],
        )
    } else {
        let inside_paths: HashSet<&str> = staged_inside_workspace
            .iter()
            .map(String::as_str)
            .collect();
        let staged_outside_workspace = git_staged_paths(&git_root, None)?
            .into_iter()
            .any(|path| !inside_paths.contains(path.as_str()));
        if staged_outside_workspace {
            return Err(
                "Staged changes outside the selected workspace must be committed separately"
                    .to_string(),
            );
        }

        run_command(
            "git",
            &["-C", root_arg.as_ref(), "commit", "-m", trimmed_message],
        )
    };
    if !commit_probe.ok {
        return Err(output_detail(&commit_probe)
            .unwrap_or_else(|| "Unable to commit workspace changes".to_string()));
    }

    Ok(WorkspaceGitActionResult {
        message: first_non_empty_line(&commit_probe.stdout)
            .unwrap_or_else(|| "Committed workspace changes".to_string()),
        branch: current_git_branch(&git_root),
    })
}

#[tauri::command]
async fn commit_workspace_changes(
    workspace_path: String,
    message: String,
    include_unstaged: Option<bool>,
) -> Result<WorkspaceGitActionResult, String> {
    run_blocking_command("commit workspace changes", move || {
        commit_workspace_changes_blocking(workspace_path, message, include_unstaged)
    })
    .await
}

fn generate_workspace_commit_message_blocking(
    app: AppHandle,
    workspace_path: String,
    account_id: Option<i64>,
    include_unstaged: Option<bool>,
    model: Option<String>,
    intent: Option<String>,
) -> Result<WorkspaceCommitMessageResult, String> {
    let workspace = canonical_workspace(&workspace_path)?;
    let git_root = resolve_git_root(&workspace)?;
    let pathspec = workspace_git_pathspec(&git_root, &workspace)?;
    let include_unstaged = include_unstaged.unwrap_or(true);
    let context = workspace_commit_context(&git_root, &pathspec, include_unstaged)?;
    if context.trim().is_empty() {
        return Err("No Git changes were found for commit message generation".to_string());
    }

    let intent = intent
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let fallback_message = local_commit_subject_from_context(&context, intent.as_deref());

    let Some(account_id) = account_id else {
        return Ok(WorkspaceCommitMessageResult {
            message: fallback_message,
            source: "local".to_string(),
        });
    };
    if validate_account_id(account_id).is_err() {
        return Ok(WorkspaceCommitMessageResult {
            message: fallback_message,
            source: "local".to_string(),
        });
    }
    let Ok(codex_binary) = resolve_codex_binary() else {
        return Ok(WorkspaceCommitMessageResult {
            message: fallback_message,
            source: "local".to_string(),
        });
    };
    let Ok(codex_home) = ensure_codex_home(&app, account_id) else {
        return Ok(WorkspaceCommitMessageResult {
            message: fallback_message,
            source: "local".to_string(),
        });
    };
    let mut args = vec![
        "exec".to_string(),
        "--ephemeral".to_string(),
        "--ignore-rules".to_string(),
        "--skip-git-repo-check".to_string(),
        "-s".to_string(),
        "read-only".to_string(),
        "-a".to_string(),
        "never".to_string(),
        "-C".to_string(),
        workspace.to_string_lossy().to_string(),
        "-c".to_string(),
        "cli_auth_credentials_store=\"file\"".to_string(),
    ];
    if let Some(model) = model.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        args.push("-m".to_string());
        args.push(model.to_string());
    }
    args.push("-".to_string());

    let prompt = commit_message_generation_prompt(&context, intent.as_deref(), None);
    let Ok(output) = run_command_with_stdin_timeout(
        &codex_binary,
        &args,
        &prompt,
        Some(("CODEX_HOME", codex_home.as_os_str())),
        Duration::from_secs(30),
    ) else {
        return Ok(WorkspaceCommitMessageResult {
            message: fallback_message,
            source: "local".to_string(),
        });
    };
    if !output.ok {
        return Ok(WorkspaceCommitMessageResult {
            message: fallback_message,
            source: "local".to_string(),
        });
    }

    let Some(first_message) = sanitize_commit_subject(&output.stdout) else {
        return Ok(WorkspaceCommitMessageResult {
            message: fallback_message,
            source: "local".to_string(),
        });
    };
    let message = if is_generic_commit_subject(&first_message)
        || commit_subject_ignores_intent(&first_message, intent.as_deref())
    {
        let retry_prompt =
            commit_message_generation_prompt(&context, intent.as_deref(), Some(&first_message));
        let Ok(retry_output) = run_command_with_stdin_timeout(
            &codex_binary,
            &args,
            &retry_prompt,
            Some(("CODEX_HOME", codex_home.as_os_str())),
            Duration::from_secs(30),
        ) else {
            return Ok(WorkspaceCommitMessageResult {
                message: fallback_message,
                source: "local".to_string(),
            });
        };
        if retry_output.ok {
            if let Some(subject) = sanitize_commit_subject(&retry_output.stdout)
                .filter(|subject| !is_generic_commit_subject(subject))
                .filter(|subject| !commit_subject_ignores_intent(subject, intent.as_deref()))
            {
                subject
            } else {
                return Ok(WorkspaceCommitMessageResult {
                    message: fallback_message,
                    source: "local".to_string(),
                });
            }
        } else {
            return Ok(WorkspaceCommitMessageResult {
                message: fallback_message,
                source: "local".to_string(),
            });
        }
    } else {
        first_message
    };

    Ok(WorkspaceCommitMessageResult {
        message,
        source: "codex".to_string(),
    })
}

#[tauri::command]
async fn generate_workspace_commit_message(
    app: AppHandle,
    workspace_path: String,
    account_id: Option<i64>,
    include_unstaged: Option<bool>,
    model: Option<String>,
    intent: Option<String>,
) -> Result<WorkspaceCommitMessageResult, String> {
    run_blocking_command("generate workspace commit message", move || {
        generate_workspace_commit_message_blocking(
            app,
            workspace_path,
            account_id,
            include_unstaged,
            model,
            intent,
        )
    })
    .await
}

fn local_commit_subject_from_context(context: &str, intent: Option<&str>) -> String {
    if let Some(subject) = intent.and_then(commit_subject_from_intent) {
        return subject;
    }

    let lower = context.to_ascii_lowercase();
    if lower.contains("intent-driven commit message")
        && (lower.contains("commit and push") || lower.contains("git-action-feedback"))
    {
        return "Generate intent-driven messages before commit and push".to_string();
    }
    if lower.contains("git-action-feedback") || lower.contains("commitdialogmessage") {
        return "Show commit message generation feedback".to_string();
    }
    if lower.contains("file-focused subject") || lower.contains("file-focused commit") {
        return "Reject file-focused generated commit subjects".to_string();
    }
    if lower.contains("includeunstagedchanges") || lower.contains("include unstaged changes") {
        return "Respect unstaged changes in commit actions".to_string();
    }
    if lower.contains("thread not found") || lower.contains("thread/resume") {
        return "Recover unavailable Codex threads gracefully".to_string();
    }
    if lower.contains("history drawer") {
        return "Keep chat history visible beside the composer".to_string();
    }
    if lower.contains("workspace-context") && lower.contains("color") {
        return "Use primary text colors in workspace controls".to_string();
    }
    if let Some(subject) = subject_from_added_test(context) {
        return subject;
    }
    if lower.contains("border") && lower.contains("chat") {
        return "Remove distracting chat bubble borders".to_string();
    }
    if lower.contains("drag") && lower.contains("drop") {
        return "Make file drops clear in the chat composer".to_string();
    }
    if lower.contains("color") || lower.contains("--color") {
        return "Align workspace UI colors with the app theme".to_string();
    }
    if lower.contains("min-width")
        || lower.contains("overflow")
        || lower.contains("grid-template")
        || lower.contains("display: flex")
    {
        return "Keep workspace layout responsive".to_string();
    }
    if lower.contains("\n?? ") || lower.contains("\na  ") {
        return "Add requested workspace files".to_string();
    }
    if lower.contains("\nd  ") || lower.contains("\n d ") {
        return "Remove requested workspace files".to_string();
    }

    "Apply requested workspace changes".to_string()
}

fn commit_subject_from_intent(intent: &str) -> Option<String> {
    let preferred = intent
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .find(|line| line.to_ascii_lowercase().starts_with("goal:"))
        .or_else(|| {
            intent
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .find(|line| line.to_ascii_lowercase().starts_with("prompt:"))
        })
        .or_else(|| intent.lines().map(str::trim).find(|line| !line.is_empty()))?;

    let mut subject = preferred
        .trim_start_matches(|ch: char| ch == '-' || ch == '*')
        .trim()
        .to_string();
    for prefix in ["Goal:", "goal:", "Prompt:", "prompt:", "Intent:", "intent:", "Summary:", "summary:"] {
        if let Some(rest) = subject.strip_prefix(prefix) {
            subject = rest.trim().to_string();
            break;
        }
    }
    for prefix in [
        "please ",
        "can you ",
        "could you ",
        "i want you to ",
        "i want to ",
    ] {
        if subject.to_ascii_lowercase().starts_with(prefix) {
            subject = subject[prefix.len()..].trim().to_string();
            break;
        }
    }
    if subject.to_ascii_lowercase().starts_with("make sure ") {
        subject = format!("Ensure {}", subject[10..].trim());
    }
    clean_local_commit_subject(&subject)
}

fn subject_from_added_test(context: &str) -> Option<String> {
    for line in context.lines() {
        let trimmed = line.trim_start();
        let Some(added) = trimmed.strip_prefix('+') else {
            continue;
        };
        let added = added.trim_start();
        let description = added
            .strip_prefix("it(\"")
            .or_else(|| added.strip_prefix("it('"))
            .or_else(|| added.strip_prefix("test(\""))
            .or_else(|| added.strip_prefix("test('"));
        let Some(description) = description else {
            continue;
        };
        let description = description
            .split(['"', '\''])
            .next()
            .unwrap_or_default()
            .trim();
        let lower = description.to_ascii_lowercase();
        if lower.contains("generates a message")
            && lower.contains("commit")
            && lower.contains("push")
        {
            return Some("Generate messages before blank commit and push".to_string());
        }
        if lower.contains("rejects broad")
            && lower.contains("commit")
            && lower.contains("message")
        {
            return Some("Reject broad generated commit subjects".to_string());
        }
        if lower.contains("does not commit")
            && lower.contains("diff-topic fallback")
        {
            return Some("Require intent-driven commit messages".to_string());
        }
    }
    None
}

fn clean_local_commit_subject(subject: &str) -> Option<String> {
    let mut subject = subject
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .trim_matches(['.', '!', '?'])
        .to_string();
    if subject.is_empty() {
        return None;
    }
    let mut chars = subject.chars();
    let first = chars.next()?;
    subject = format!("{}{}", first.to_uppercase(), chars.as_str());
    if subject.len() > 72 {
        subject.truncate(72);
        subject = subject.trim_end().to_string();
    }
    Some(subject)
}

fn commit_message_generation_prompt(
    context: &str,
    intent: Option<&str>,
    rejected_subject: Option<&str>,
) -> String {
    let retry_guidance = rejected_subject
        .map(|subject| {
            format!(
                "\nThe previous subject `{subject}` was rejected because it described changed files, \
                 layers, or broad areas instead of the underlying intent. Generate a subject that \
                 names the exact user-facing behavior, workflow outcome, or bug fixed.\n"
            )
        })
        .unwrap_or_default();
    let intent_section = intent
        .map(|value| {
            format!(
                "Intent:\n{}\n\n",
                value.trim()
            )
        })
        .unwrap_or_default();

    format!(
        "Generate one concise Git commit subject line for these changes.\n\
         Rules:\n\
         - Return only the commit subject, no markdown, no quotes, no explanation.\n\
         - Use imperative mood.\n\
         - If Intent is present, treat it as the source of truth for why the change exists.\n\
         - If Intent is absent, infer the user's intent from the actual diff hunks.\n\
         - Prefer the behavioral outcome over file names, changed layers, or implementation details.\n\
         - Be specific about the behavior, UI, or logic changed.\n\
         - Name the concrete feature or failure fixed, not just the broad changed area.\n\
         - Do not summarize touched layers with `and`, such as `app styling and app shell`.\n\
         - Do not use generic area-only subjects like `Update desktop app workflow`, `Update React app`, `Update app styling`, or `Update Tauri backend`.\n\
         - Do not use broad subjects like `Refine Tauri bridge and app styling` or `Refine app styling and app shell`.\n\
         - Do not return file-only subjects like `Update App.css` when Intent names a user-facing outcome.\n\
         - Avoid vague subjects like `Improve commit message generation` unless the subject names the specific behavior changed.\n\
         - Do not append change-count summaries like (5 modified).\n\
         - Keep it under 72 characters when possible.\n\
         Good examples:\n\
         - Use primary button text colors in workspace UI\n\
         - Keep header controls on one row\n\
         - Fix inline context file label spacing\n\
         - Refine transcript auto-scroll behavior\n\
         - Simplify submitted prompt edit focus styles\n\
         - Tighten task chat transcript editing layout\n\
         - Make staged-only commits respect the checkbox\n\
         - Reject duplicate AI commit subjects for changed diffs\n\
         Bad examples:\n\
         - Update desktop app workflow\n\
         - Update React app\n\
         - Update app styling\n\
         - Refine Tauri bridge and app styling\n\
         - Refine app styling and app shell\n\
         - Improve commit message generation\n\
         - Update Git workflow\n\
         - Update App.css\n\
         - Update files\n\
         {retry_guidance}\n\
         {intent_section}Git context:\n{context}"
    )
}

fn git_staged_paths(git_root: &Path, pathspec: Option<&str>) -> Result<Vec<String>, String> {
    let git_root_arg = git_root.to_string_lossy();
    let mut args = vec![
        "-C",
        git_root_arg.as_ref(),
        "diff",
        "--cached",
        "--name-only",
        "-z",
    ];
    if let Some(pathspec) = pathspec {
        args.extend(["--", pathspec]);
    }

    let probe = run_command_raw("git", &args);
    if !probe.ok {
        return Err(output_detail(&probe)
            .unwrap_or_else(|| "Unable to inspect staged Git changes".to_string()));
    }

    Ok(probe
        .stdout
        .split('\0')
        .filter(|path| !path.is_empty())
        .map(str::to_string)
        .collect())
}

fn workspace_commit_context(
    git_root: &Path,
    pathspec: &str,
    include_unstaged: bool,
) -> Result<String, String> {
    let mut sections = Vec::new();
    sections.push((
        "Status",
        git_context_output(
            git_root,
            &["status", "--short", "--untracked-files=normal", "--", pathspec],
        )?,
    ));
    sections.push((
        "Staged diffstat",
        git_context_output(git_root, &["diff", "--cached", "--stat", "--", pathspec])?,
    ));
    sections.push((
        "Staged diff",
        git_context_output(
            git_root,
            &[
                "diff",
                "--cached",
                "--find-renames",
                "--find-copies",
                "--unified=3",
                "--",
                pathspec,
            ],
        )?,
    ));

    if include_unstaged {
        sections.push((
            "Working tree diffstat",
            git_context_output(git_root, &["diff", "--stat", "--", pathspec])?,
        ));
        sections.push((
            "Working tree diff",
            git_context_output(
                git_root,
                &[
                    "diff",
                    "--find-renames",
                    "--find-copies",
                    "--unified=3",
                    "--",
                    pathspec,
                ],
            )?,
        ));
    }

    let mut context = String::new();
    for (title, body) in sections {
        if body.trim().is_empty() {
            continue;
        }
        context.push_str("## ");
        context.push_str(title);
        context.push('\n');
        context.push_str(body.trim());
        context.push_str("\n\n");
        if context.len() >= MAX_COMMIT_MESSAGE_CONTEXT_CHARS {
            context.truncate(MAX_COMMIT_MESSAGE_CONTEXT_CHARS);
            context.push_str("\n[Commit context truncated]\n");
            break;
        }
    }

    Ok(context)
}

fn git_context_output(git_root: &Path, git_args: &[&str]) -> Result<String, String> {
    let git_root_arg = git_root.to_string_lossy();
    let mut args = vec!["-C", git_root_arg.as_ref()];
    args.extend(git_args.iter().copied());
    let probe = run_command_raw("git", &args);
    if probe.ok {
        Ok(probe.stdout)
    } else {
        Err(output_detail(&probe)
            .unwrap_or_else(|| "Unable to inspect Git changes for commit message".to_string()))
    }
}

fn sanitize_commit_subject(output: &str) -> Option<String> {
    let line = output
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())?;
    let mut subject = line
        .trim_start_matches(|ch: char| ch == '-' || ch == '*' || ch.is_ascii_digit() || ch == '.')
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .trim_matches('`')
        .trim()
        .to_string();
    for prefix in ["Commit message:", "commit message:", "Subject:", "subject:"] {
        if let Some(rest) = subject.strip_prefix(prefix) {
            subject = rest.trim().to_string();
        }
    }
    subject = subject
        .trim_matches('"')
        .trim_matches('\'')
        .trim_matches('`')
        .trim()
        .to_string();
    subject = strip_commit_count_suffix(&subject);
    if subject.len() > 100 {
        subject.truncate(100);
        subject = subject.trim_end().to_string();
    }
    (!subject.is_empty()).then_some(subject)
}

fn is_generic_commit_subject(subject: &str) -> bool {
    let normalized = subject
        .trim()
        .trim_end_matches('.')
        .to_ascii_lowercase()
        .replace(['-', '_', '.', '/'], " ");
    let words: Vec<&str> = normalized.split_whitespace().collect();
    let generic_exact = [
        "update app css",
        "refine app css",
        "improve app css",
        "update desktop app workflow",
        "update desktop app integration",
        "update react app",
        "refine react app",
        "improve react app",
        "update app styling",
        "refine app styling",
        "improve app styling",
        "update app shell",
        "refine app shell",
        "improve app shell",
        "update app styling and app shell",
        "refine app styling and app shell",
        "improve app styling and app shell",
        "update app shell and app styling",
        "refine app shell and app styling",
        "improve app shell and app styling",
        "update tauri bridge",
        "refine tauri bridge",
        "improve tauri bridge",
        "update tauri bridge and app styling",
        "refine tauri bridge and app styling",
        "improve tauri bridge and app styling",
        "update app styling and tauri bridge",
        "refine app styling and tauri bridge",
        "improve app styling and tauri bridge",
        "update tauri backend",
        "refine tauri backend",
        "improve tauri backend",
        "update tests",
        "update workspace",
        "update files",
        "refine files",
        "improve files",
        "update code",
        "refine code",
        "improve code",
        "update git workflow",
        "refine git workflow",
        "improve git workflow",
        "update commit messages",
        "refine commit messages",
        "improve commit messages",
        "update commit message generation",
        "refine commit message generation",
        "improve commit message generation",
        "refine desktop app workflow",
        "refine desktop app integration",
    ];
    if generic_exact.contains(&normalized.as_str()) {
        return true;
    }
    let [verb, rest @ ..] = words.as_slice() else {
        return false;
    };
    if !["update", "refine", "improve"].contains(verb) {
        return false;
    }
    let broad_terms = [
        "app",
        "application",
        "backend",
        "bridge",
        "code",
        "desktop",
        "files",
        "frontend",
        "integration",
        "react",
        "shell",
        "styling",
        "tauri",
        "ui",
        "workflow",
        "workspace",
    ];
    let meaningful_rest: Vec<&str> = rest
        .iter()
        .copied()
        .filter(|word| *word != "and")
        .collect();
    !meaningful_rest.is_empty()
        && meaningful_rest.len() <= 5
        && meaningful_rest
            .iter()
            .all(|word| broad_terms.contains(word))
}

fn commit_subject_ignores_intent(subject: &str, intent: Option<&str>) -> bool {
    if intent.map(str::trim).unwrap_or_default().is_empty() {
        return false;
    }

    let normalized = subject
        .trim()
        .trim_end_matches('.')
        .to_ascii_lowercase()
        .replace(['-', '_', '.', '/'], " ");
    let normalized = normalized
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let generic_exact = [
        "update app css",
        "refine app css",
        "improve app css",
        "update app styling",
        "refine app styling",
        "improve app styling",
        "update react app",
        "refine react app",
        "update files",
        "update code",
    ];
    generic_exact.contains(&normalized.as_str())
}

fn strip_commit_count_suffix(subject: &str) -> String {
    let trimmed = subject.trim();
    let Some(prefix) = trimmed.strip_suffix(')') else {
        return trimmed.to_string();
    };
    let Some(open_index) = prefix.rfind(" (") else {
        return trimmed.to_string();
    };
    let inner = &prefix[(open_index + 2)..];
    if is_commit_count_suffix(inner) {
        prefix[..open_index].trim_end().to_string()
    } else {
        trimmed.to_string()
    }
}

fn is_commit_count_suffix(inner: &str) -> bool {
    let allowed = [
        "modified",
        "added",
        "deleted",
        "untracked",
        "renamed",
        "copied",
        "changed",
    ];

    inner.split(',').all(|part| {
        let mut words = part.split_whitespace();
        let Some(count) = words.next() else {
            return false;
        };
        count.parse::<usize>().is_ok()
            && words
                .next()
                .is_some_and(|status| allowed.contains(&status.to_ascii_lowercase().as_str()))
            && words.next().is_none()
    })
}

fn push_workspace_branch_blocking(
    workspace_path: String,
) -> Result<WorkspaceGitActionResult, String> {
    let workspace = canonical_workspace(&workspace_path)?;
    let git_root = resolve_git_root(&workspace)?;
    let branch = current_git_branch(&git_root)
        .ok_or_else(|| "Cannot push while detached from a branch".to_string())?;
    let root_arg = git_root.to_string_lossy();

    let push_probe = if git_upstream(&git_root).is_some() {
        run_command("git", &["-C", root_arg.as_ref(), "push"])
    } else if git_has_origin(&git_root) {
        run_command(
            "git",
            &["-C", root_arg.as_ref(), "push", "-u", "origin", &branch],
        )
    } else {
        return Err("No upstream branch or origin remote is configured".to_string());
    };

    if !push_probe.ok {
        return Err(output_detail(&push_probe)
            .unwrap_or_else(|| "Unable to push the current branch".to_string()));
    }

    Ok(WorkspaceGitActionResult {
        message: output_detail(&push_probe)
            .unwrap_or_else(|| format!("Pushed {branch}")),
        branch: Some(branch),
    })
}

#[tauri::command]
async fn push_workspace_branch(
    workspace_path: String,
) -> Result<WorkspaceGitActionResult, String> {
    run_blocking_command("push workspace branch", move || {
        push_workspace_branch_blocking(workspace_path)
    })
    .await
}

fn list_workspace_git_status_blocking(
    workspace_path: String,
) -> Result<WorkspaceGitStatusSnapshot, String> {
    let workspace = canonical_workspace(&workspace_path)?;
    let git_root = resolve_git_root(&workspace)?;
    let pathspec = workspace_git_pathspec(&git_root, &workspace)?;
    let status_probe = git_status_for_pathspec(&git_root, &pathspec);
    if !status_probe.ok {
        return Err(output_detail(&status_probe)
            .unwrap_or_else(|| "Unable to read Git status".to_string()));
    }

    let (mut additions, deletions) = git_numstat_totals(&git_root, &pathspec);
    let mut files = Vec::new();
    for parsed in parse_git_status_porcelain(&status_probe.stdout)? {
        let absolute_path = git_path_to_workspace_child(&git_root, &workspace, &parsed.path)?;
        let relative_path = relative_workspace_path(&workspace, &absolute_path)?;
        let status_kind = git_status_kind(parsed.index_status, parsed.worktree_status);
        let old_relative_path = parsed
            .old_path
            .as_ref()
            .and_then(|old_path| {
                git_path_to_workspace_child(&git_root, &workspace, old_path).ok()
            })
            .and_then(|old_absolute| relative_workspace_path(&workspace, &old_absolute).ok());

        if status_kind == "untracked" {
            additions += untracked_file_additions(&workspace, &absolute_path);
        }

        files.push(WorkspaceGitFileStatus {
            path: absolute_path.to_string_lossy().to_string(),
            relative_path,
            old_relative_path,
            index_status: parsed.index_status.to_string(),
            worktree_status: parsed.worktree_status.to_string(),
            status_kind: status_kind.to_string(),
            badge: git_status_badge(parsed.index_status, parsed.worktree_status).to_string(),
        });
    }

    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    Ok(WorkspaceGitStatusSnapshot {
        workspace_path: workspace.to_string_lossy().to_string(),
        git_root: git_root.to_string_lossy().to_string(),
        current_branch: current_git_branch(&git_root),
        ahead_count: git_ahead_count(&git_root),
        additions,
        deletions,
        has_upstream: git_upstream(&git_root).is_some(),
        has_origin: git_has_origin(&git_root),
        can_push: git_can_push(&git_root),
        files,
    })
}

#[tauri::command]
async fn list_workspace_git_status(
    workspace_path: String,
) -> Result<WorkspaceGitStatusSnapshot, String> {
    run_blocking_command("list workspace Git status", move || {
        list_workspace_git_status_blocking(workspace_path)
    })
    .await
}

fn read_workspace_git_diff_blocking(
    workspace_path: String,
    file_path: String,
) -> Result<WorkspaceGitDiff, String> {
    let workspace = canonical_workspace(&workspace_path)?;
    let git_root = resolve_git_root(&workspace)?;
    let file_path = workspace_child_path_allow_missing(&workspace, &file_path)?;
    let relative_path = relative_workspace_path(&workspace, &file_path)?;
    let git_path = git_relative_path(&git_root, &file_path)?;
    let status = list_workspace_git_status_blocking(workspace.to_string_lossy().to_string())?
        .files
        .into_iter()
        .find(|file| file.relative_path == relative_path);
    let old_git_path = status
        .as_ref()
        .and_then(|file| file.old_relative_path.as_deref())
        .and_then(|old_relative_path| {
            workspace_relative_to_git_path(&git_root, &workspace, old_relative_path).ok()
        });

    let mut sections = Vec::new();
    let staged_diff = run_git_diff(&git_root, true, &git_path)?;
    if !staged_diff.trim().is_empty() {
        sections.push(git_diff_section(
            &git_root,
            &workspace,
            &file_path,
            &git_path,
            old_git_path.as_deref(),
            "staged",
            "Staged changes",
            staged_diff,
            true,
        )?);
    }

    let unstaged_diff = run_git_diff(&git_root, false, &git_path)?;
    if !unstaged_diff.trim().is_empty() {
        sections.push(git_diff_section(
            &git_root,
            &workspace,
            &file_path,
            &git_path,
            None,
            "unstaged",
            "Working tree changes",
            unstaged_diff,
            false,
        )?);
    }

    if sections.is_empty()
        && status
            .as_ref()
            .is_some_and(|file| file.status_kind == "untracked")
    {
        sections.push(synthetic_untracked_diff(
            &workspace,
            &file_path,
            &relative_path,
        )?);
    }

    Ok(WorkspaceGitDiff {
        path: file_path.to_string_lossy().to_string(),
        relative_path,
        sections,
    })
}

#[tauri::command]
async fn read_workspace_git_diff(
    workspace_path: String,
    file_path: String,
) -> Result<WorkspaceGitDiff, String> {
    run_blocking_command("read workspace Git diff", move || {
        read_workspace_git_diff_blocking(workspace_path, file_path)
    })
    .await
}

fn list_workspace_directory_blocking(
    workspace_path: String,
    directory_path: String,
) -> Result<Vec<WorkspaceTreeEntry>, String> {
    let (workspace, directory) = canonical_workspace_child(&workspace_path, &directory_path)?;
    if !directory.is_dir() {
        return Err("Selected path is not a directory".to_string());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&directory)
        .map_err(|error| format!("Unable to read directory {}: {error}", directory.display()))?
    {
        let entry = entry.map_err(|error| format!("Unable to read directory entry: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Unable to inspect directory entry: {error}"))?;
        if !file_type.is_dir() && !file_type.is_file() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        if file_type.is_dir()
            && IGNORED_EXPLORER_DIRECTORIES
                .iter()
                .any(|ignored| ignored == &name.as_str())
        {
            continue;
        }

        let entry_path = entry.path();
        entries.push(WorkspaceTreeEntry {
            relative_path: relative_workspace_path(&workspace, &entry_path)?,
            path: entry_path.to_string_lossy().to_string(),
            name,
            kind: if file_type.is_dir() {
                "directory".to_string()
            } else {
                "file".to_string()
            },
        });
    }

    entries.sort_by(|left, right| {
        let left_is_file = left.kind == "file";
        let right_is_file = right.kind == "file";
        left_is_file
            .cmp(&right_is_file)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
async fn list_workspace_directory(
    workspace_path: String,
    directory_path: String,
) -> Result<Vec<WorkspaceTreeEntry>, String> {
    run_blocking_command("list workspace directory", move || {
        list_workspace_directory_blocking(workspace_path, directory_path)
    })
    .await
}

fn read_workspace_file_preview_blocking(
    workspace_path: String,
    file_path: String,
) -> Result<WorkspaceFilePreview, String> {
    let (workspace, file_path) = canonical_workspace_child(&workspace_path, &file_path)?;
    if !file_path.is_file() {
        return Err("Selected path is not a file".to_string());
    }

    let mut file = fs::File::open(&file_path)
        .map_err(|error| format!("Unable to open {}: {error}", file_path.display()))?;
    let mut bytes = Vec::with_capacity(MAX_FILE_PREVIEW_BYTES + 1);
    Read::by_ref(&mut file)
        .take((MAX_FILE_PREVIEW_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Unable to read {}: {error}", file_path.display()))?;

    let truncated = bytes.len() > MAX_FILE_PREVIEW_BYTES;
    let preview_len = bytes.len().min(MAX_FILE_PREVIEW_BYTES);
    let preview_bytes = &bytes[..preview_len];
    let (content, is_binary) = decode_preview_text(preview_bytes);

    Ok(WorkspaceFilePreview {
        relative_path: relative_workspace_path(&workspace, &file_path)?,
        path: file_path.to_string_lossy().to_string(),
        content,
        truncated,
        is_binary,
    })
}

#[tauri::command]
async fn read_workspace_file_preview(
    workspace_path: String,
    file_path: String,
) -> Result<WorkspaceFilePreview, String> {
    run_blocking_command("read workspace file preview", move || {
        read_workspace_file_preview_blocking(workspace_path, file_path)
    })
    .await
}

fn run_preflight_blocking(
    path: String,
    prompt: String,
    use_oss: bool,
    oss_provider: Option<String>,
) -> PreflightReport {
    let workspace = Path::new(&path);
    let mut checks = Vec::new();
    let mut recommendations = Vec::new();
    let token_estimate = estimate_tokens(&prompt);
    let context_budget = 128_000usize;
    let route_recommendation = route_recommendation(&prompt, token_estimate);
    let improved_prompt = improve_prompt(&prompt);

    push_check(
        &mut checks,
        "path",
        "Workspace path",
        if workspace.exists() { "pass" } else { "fail" },
        if workspace.exists() {
            "Folder exists"
        } else {
            "Folder does not exist"
        },
        Some(path.clone()),
    );

    let git_probe = run_command("git", &["-C", &path, "rev-parse", "--is-inside-work-tree"]);
    push_check(
        &mut checks,
        "git",
        "Git repository",
        if git_probe.ok { "pass" } else { "warn" },
        if git_probe.ok {
            "Workspace is inside a Git repository"
        } else {
            "Codex works best from a Git repository"
        },
        output_detail(&git_probe),
    );

    let branch_probe = run_command("git", &["-C", &path, "branch", "--show-current"]);
    push_check(
        &mut checks,
        "branch",
        "Current branch",
        if branch_probe.ok && !branch_probe.stdout.trim().is_empty() {
            "pass"
        } else {
            "info"
        },
        branch_probe.stdout.trim().trim_matches('\n'),
        output_detail(&branch_probe),
    );

    let status_probe = run_command("git", &["-C", &path, "status", "--short"]);
    let dirty_count = status_probe
        .stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count();
    push_check(
        &mut checks,
        "dirty",
        "Working tree",
        if dirty_count == 0 { "pass" } else { "warn" },
        if dirty_count == 0 {
            "No uncommitted changes detected".to_string()
        } else {
            format!("{dirty_count} changed files detected")
        },
        output_detail(&status_probe),
    );

    let codex_binary = resolve_codex_binary();
    let codex_probe = match &codex_binary {
        Ok(binary) => run_command(binary, &["--version"]),
        Err(error) => CommandProbe {
            ok: false,
            stdout: String::new(),
            stderr: error.clone(),
        },
    };
    push_check(
        &mut checks,
        "codex",
        "Codex CLI",
        if codex_probe.ok { "pass" } else { "fail" },
        if codex_probe.ok {
            codex_probe.stdout.trim().to_string()
        } else {
            "Codex CLI could not be located".to_string()
        },
        output_detail(&codex_probe),
    );

    let auth_probe = match &codex_binary {
        Ok(binary) => run_command(binary, &["doctor", "--json"]),
        Err(error) => CommandProbe {
            ok: false,
            stdout: String::new(),
            stderr: error.clone(),
        },
    };
    push_check(
        &mut checks,
        "codex-auth",
        "Codex auth",
        if auth_probe.ok { "pass" } else { "warn" },
        if auth_probe.ok {
            "Codex doctor completed; app-server auth can be checked in-app"
        } else {
            "Run `codex login` if app-server auth reports missing credentials"
        },
        output_detail(&auth_probe),
    );

    let package_hints = package_hints(workspace);
    push_check(
        &mut checks,
        "package-manager",
        "Project tooling",
        if package_hints.is_empty() { "info" } else { "pass" },
        if package_hints.is_empty() {
            "No common package manager files detected".to_string()
        } else {
            format!("Detected {}", package_hints.join(", "))
        },
        None,
    );

    push_check(
        &mut checks,
        "codex-config",
        "Codex guidance",
        if workspace.join(".codex").exists() || workspace.join("AGENTS.md").exists() {
            "pass"
        } else {
            "info"
        },
        if workspace.join(".codex").exists() || workspace.join("AGENTS.md").exists() {
            "Project guidance found"
        } else {
            "No .codex folder or AGENTS.md found"
        },
        None,
    );

    push_check(
        &mut checks,
        "budget",
        "Context budget",
        if token_estimate < context_budget / 2 {
            "pass"
        } else if token_estimate < context_budget {
            "warn"
        } else {
            "fail"
        },
        format!("Estimated prompt size: {token_estimate} tokens"),
        Some(format!("Default planning budget: {context_budget} tokens")),
    );

    if use_oss {
        let provider = oss_provider.unwrap_or_else(|| "ollama".to_string());
        let provider_probe = if provider == "ollama" {
            run_command("ollama", &["--version"])
        } else {
            CommandProbe {
                ok: true,
                stdout: "LM Studio provider selected; verify the local server is running".to_string(),
                stderr: String::new(),
            }
        };

        push_check(
            &mut checks,
            "oss-provider",
            "Local OSS provider",
            if provider_probe.ok { "pass" } else { "warn" },
            if provider_probe.ok {
                format!("{provider} selected")
            } else {
                format!("{provider} was selected but could not be verified")
            },
            output_detail(&provider_probe),
        );
    }

    if route_recommendation == "plan-first" {
        recommendations.push(RecommendationDraft {
            kind: "route".to_string(),
            title: "Start with a plan turn".to_string(),
            body: "Ask Codex to inspect the repository and produce an implementation plan before allowing a write-capable run.".to_string(),
        });
    }

    if prompt.to_lowercase().contains("review") || prompt.to_lowercase().contains("security") {
        recommendations.push(RecommendationDraft {
            kind: "subagent".to_string(),
            title: "Use focused review subagents".to_string(),
            body: "Add: Spawn one explorer subagent for code structure, one security subagent for risk, and one test subagent for coverage gaps. Wait for all results before summarizing.".to_string(),
        });
    } else if token_estimate > 180 || route_recommendation == "plan-first" {
        recommendations.push(RecommendationDraft {
            kind: "subagent".to_string(),
            title: "Delegate exploration".to_string(),
            body: "Add: Spawn an explorer subagent to map relevant files and return a concise summary before implementation.".to_string(),
        });
    }

    PreflightReport {
        workspace_path: path,
        token_estimate,
        context_budget,
        route_recommendation,
        improved_prompt,
        checks,
        recommendations,
    }
}

#[tauri::command]
async fn run_preflight(
    path: String,
    prompt: String,
    use_oss: bool,
    oss_provider: Option<String>,
) -> Result<PreflightReport, String> {
    run_blocking_command("run preflight checks", move || {
        Ok(run_preflight_blocking(
            path,
            prompt,
            use_oss,
            oss_provider,
        ))
    })
    .await
}

fn push_check(
    checks: &mut Vec<PreflightCheck>,
    id: &str,
    label: &str,
    status: &str,
    message: impl Into<String>,
    detail: Option<String>,
) {
    checks.push(PreflightCheck {
        id: id.to_string(),
        label: label.to_string(),
        status: status.to_string(),
        message: message.into(),
        detail,
    });
}

fn validate_account_id(account_id: i64) -> Result<(), String> {
    if account_id > 0 {
        Ok(())
    } else {
        Err("Codex account id must be a positive integer".to_string())
    }
}

fn account_profile_root(base: &Path, account_id: i64) -> Result<PathBuf, String> {
    validate_account_id(account_id)?;
    Ok(base.join("codex-accounts").join(account_id.to_string()))
}

fn codex_profile_root(app: &AppHandle, account_id: i64) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Orchestrator app data: {error}"))?;
    account_profile_root(&app_data, account_id)
}

fn ensure_codex_home(app: &AppHandle, account_id: i64) -> Result<PathBuf, String> {
    let codex_home = codex_profile_root(app, account_id)?.join("codex-home");
    fs::create_dir_all(&codex_home).map_err(|error| {
        format!(
            "Could not create isolated Codex home {}: {error}",
            codex_home.display()
        )
    })?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&codex_home, fs::Permissions::from_mode(0o700)).map_err(
            |error| {
                format!(
                    "Could not secure isolated Codex home {}: {error}",
                    codex_home.display()
                )
            },
        )?;
    }

    Ok(codex_home)
}

fn default_codex_home_from_home(home: &Path) -> PathBuf {
    home.join(".codex")
}

fn ensure_default_codex_home() -> Result<PathBuf, String> {
    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Could not resolve HOME for the default Codex profile".to_string())?;
    let codex_home = default_codex_home_from_home(&home);
    fs::create_dir_all(&codex_home).map_err(|error| {
        format!(
            "Could not create default Codex home {}: {error}",
            codex_home.display()
        )
    })?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&codex_home, fs::Permissions::from_mode(0o700)).map_err(
            |error| {
                format!(
                    "Could not secure default Codex home {}: {error}",
                    codex_home.display()
                )
            },
        )?;
    }

    Ok(codex_home)
}

fn resolve_codex_binary() -> Result<PathBuf, String> {
    if let Some(configured) = env::var_os("ORCHESTRATOR_CODEX_BIN") {
        let path = PathBuf::from(configured);
        if path.is_file() {
            return Ok(path);
        }

        return Err(format!(
            "ORCHESTRATOR_CODEX_BIN points to a missing file: {}",
            path.display()
        ));
    }

    if let Some(path) = find_codex_on_path(env::var_os("PATH")) {
        return Ok(path);
    }

    #[cfg(target_os = "macos")]
    {
        let home = env::var_os("HOME").map(PathBuf::from);
        if let Some(path) = macos_codex_binary_candidates(home.as_deref())
            .into_iter()
            .find(|path| path.is_file())
        {
            return Ok(path);
        }
    }

    Err(
        "Codex CLI was not found. Install Codex or ChatGPT Desktop, add `codex` to PATH, or set ORCHESTRATOR_CODEX_BIN."
            .to_string(),
    )
}

#[cfg(target_os = "macos")]
fn macos_codex_binary_candidates(home: Option<&Path>) -> Vec<PathBuf> {
    let mut candidates = vec![
        PathBuf::from("/Applications/Codex.app/Contents/Resources/codex"),
        PathBuf::from("/Applications/ChatGPT.app/Contents/Resources/codex"),
        PathBuf::from("/opt/homebrew/bin/codex"),
        PathBuf::from("/usr/local/bin/codex"),
    ];

    if let Some(home) = home {
        candidates.extend([
            home.join("Applications/Codex.app/Contents/Resources/codex"),
            home.join("Applications/ChatGPT.app/Contents/Resources/codex"),
            home.join(".cargo/bin/codex"),
            home.join(".local/bin/codex"),
            home.join(".npm-global/bin/codex"),
            home.join("Library/pnpm/codex"),
            home.join(".local/share/pnpm/codex"),
        ]);
    }

    candidates
}

fn find_codex_on_path(path_value: Option<std::ffi::OsString>) -> Option<PathBuf> {
    let executable = if cfg!(windows) { "codex.exe" } else { "codex" };

    path_value
        .into_iter()
        .flat_map(|value| env::split_paths(&value).collect::<Vec<_>>())
        .map(|directory| directory.join(executable))
        .find(|path| path.is_file())
}

async fn run_blocking_command<T, F>(operation: &'static str, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("Failed to {operation}: {error}"))?
}

fn run_command(program: impl AsRef<OsStr>, args: &[&str]) -> CommandProbe {
    match Command::new(program).args(args).output() {
        Ok(output) => CommandProbe {
            ok: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        },
        Err(err) => CommandProbe {
            ok: false,
            stdout: String::new(),
            stderr: err.to_string(),
        },
    }
}

fn run_command_raw(program: impl AsRef<OsStr>, args: &[&str]) -> CommandProbe {
    match Command::new(program).args(args).output() {
        Ok(output) => CommandProbe {
            ok: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        },
        Err(err) => CommandProbe {
            ok: false,
            stdout: String::new(),
            stderr: err.to_string(),
        },
    }
}

fn run_command_with_stdin_timeout(
    program: impl AsRef<OsStr>,
    args: &[String],
    stdin_text: &str,
    env_var: Option<(&str, &OsStr)>,
    timeout: Duration,
) -> Result<CommandProbe, String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some((key, value)) = env_var {
        command.env(key, value);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start Codex commit message generation: {error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(stdin_text.as_bytes())
            .map_err(|error| format!("Failed to send commit context to Codex: {error}"))?;
    }

    let started_at = Instant::now();
    loop {
        if let Some(_) = child
            .try_wait()
            .map_err(|error| format!("Failed to inspect Codex generation process: {error}"))?
        {
            let output = child
                .wait_with_output()
                .map_err(|error| format!("Failed to read Codex generation output: {error}"))?;
            return Ok(CommandProbe {
                ok: output.status.success(),
                stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
            });
        }

        if started_at.elapsed() >= timeout {
            let _ = child.kill();
            let output = child
                .wait_with_output()
                .map_err(|error| format!("Failed to stop Codex generation process: {error}"))?;
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Ok(CommandProbe {
                ok: false,
                stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
                stderr: if stderr.is_empty() {
                    "Timed out generating commit message".to_string()
                } else {
                    format!("Timed out generating commit message: {stderr}")
                },
            });
        }

        std::thread::sleep(Duration::from_millis(100));
    }
}

fn run_command_bytes(program: impl AsRef<OsStr>, args: &[&str]) -> CommandBytesProbe {
    match Command::new(program).args(args).output() {
        Ok(output) => CommandBytesProbe {
            ok: output.status.success(),
            stdout: output.stdout,
        },
        Err(_) => CommandBytesProbe {
            ok: false,
            stdout: Vec::new(),
        },
    }
}

fn output_detail(probe: &CommandProbe) -> Option<String> {
    let mut detail = Vec::new();
    if !probe.stdout.trim().is_empty() {
        detail.push(probe.stdout.trim());
    }
    if !probe.stderr.trim().is_empty() {
        detail.push(probe.stderr.trim());
    }
    if detail.is_empty() {
        None
    } else {
        Some(detail.join("\n"))
    }
}

fn package_hints(workspace: &Path) -> Vec<&'static str> {
    let mut hints = Vec::new();
    if workspace.join("package-lock.json").exists() {
        hints.push("npm");
    }
    if workspace.join("pnpm-lock.yaml").exists() {
        hints.push("pnpm");
    }
    if workspace.join("yarn.lock").exists() {
        hints.push("yarn");
    }
    if workspace.join("Cargo.toml").exists() {
        hints.push("cargo");
    }
    if workspace.join("pyproject.toml").exists() {
        hints.push("python");
    }
    if workspace.join("go.mod").exists() {
        hints.push("go");
    }
    hints
}

fn estimate_tokens(prompt: &str) -> usize {
    (prompt.chars().count() / 4).max(prompt.split_whitespace().count())
}

fn route_recommendation(prompt: &str, token_estimate: usize) -> String {
    let lower = prompt.to_lowercase();
    let broad = ["build", "implement", "refactor", "migrate", "redesign", "architecture"]
        .iter()
        .any(|needle| lower.contains(needle));
    let risky = ["delete", "auth", "security", "payment", "database", "migration"]
        .iter()
        .any(|needle| lower.contains(needle));

    if token_estimate > 180 || broad || risky {
        "plan-first".to_string()
    } else {
        "direct-run".to_string()
    }
}

fn improve_prompt(prompt: &str) -> String {
    let trimmed = prompt.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    format!(
        "Objective:\n{trimmed}\n\nContext:\nInspect the selected repository before changing files. Preserve existing conventions and avoid unrelated refactors.\n\nConstraints:\nUse workspace-write permissions only inside the selected repo. Surface uncertainty before risky changes.\n\nAcceptance criteria:\n- Implement the requested behavior completely.\n- Keep changes focused and easy to review.\n- Run the most relevant available checks.\n\nVerification:\nReport commands run, results, and any remaining risk."
    )
}

fn canonical_workspace_child(
    workspace_path: &str,
    child_path: &str,
) -> Result<(PathBuf, PathBuf), String> {
    let workspace = canonical_workspace(workspace_path)?;

    let child = if child_path.trim().is_empty() {
        workspace.clone()
    } else {
        fs::canonicalize(child_path)
            .map_err(|error| format!("Unable to open path {child_path}: {error}"))?
    };

    if !child.starts_with(&workspace) {
        return Err("Selected path is outside the workspace".to_string());
    }

    Ok((workspace, child))
}

fn canonical_workspace(workspace_path: &str) -> Result<PathBuf, String> {
    let workspace = fs::canonicalize(workspace_path)
        .map_err(|error| format!("Unable to open workspace {workspace_path}: {error}"))?;
    if !workspace.is_dir() {
        return Err("Selected workspace is not a directory".to_string());
    }
    Ok(workspace)
}

fn workspace_child_path_allow_missing(
    workspace: &Path,
    child_path: &str,
) -> Result<PathBuf, String> {
    if child_path.trim().is_empty() {
        return Err("Selected path is empty".to_string());
    }

    let raw_child = PathBuf::from(child_path);
    if raw_child
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err("Selected path is outside the workspace".to_string());
    }

    let candidate = if raw_child.is_absolute() {
        raw_child
    } else {
        workspace.join(raw_child)
    };

    let child = if candidate.exists() {
        fs::canonicalize(&candidate)
            .map_err(|error| format!("Unable to open path {}: {error}", candidate.display()))?
    } else {
        reconstruct_missing_absolute_path(&candidate)?
    };
    if !child.starts_with(workspace) {
        return Err("Selected path is outside the workspace".to_string());
    }

    Ok(child)
}

fn relative_workspace_path(workspace: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(workspace)
        .map_err(|_| "Selected path is outside the workspace".to_string())?;

    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn resolve_git_root(workspace: &Path) -> Result<PathBuf, String> {
    let workspace_arg = workspace.to_string_lossy();
    let root_probe = run_command(
        "git",
        &["-C", workspace_arg.as_ref(), "rev-parse", "--show-toplevel"],
    );
    if !root_probe.ok {
        return Err(output_detail(&root_probe).unwrap_or_else(|| {
            "Selected folder is not inside a Git repository".to_string()
        }));
    }

    let root = PathBuf::from(root_probe.stdout.trim());
    let root = fs::canonicalize(&root)
        .map_err(|error| format!("Unable to open Git root {}: {error}", root.display()))?;
    if !workspace.starts_with(&root) {
        return Err("Selected workspace is outside the Git repository".to_string());
    }
    Ok(root)
}

fn git_relative_path(git_root: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(git_root)
        .map_err(|_| "Selected path is outside the Git repository".to_string())?;
    let relative = relative.to_string_lossy().replace('\\', "/");
    Ok(relative)
}

fn workspace_git_pathspec(git_root: &Path, workspace: &Path) -> Result<String, String> {
    let workspace_prefix = git_relative_path(git_root, workspace)?;
    Ok(if workspace_prefix.is_empty() {
        ".".to_string()
    } else {
        workspace_prefix
    })
}

fn git_status_for_pathspec(git_root: &Path, pathspec: &str) -> CommandProbe {
    let git_root_arg = git_root.to_string_lossy();
    run_command_raw(
        "git",
        &[
            "-C",
            git_root_arg.as_ref(),
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=normal",
            "--",
            pathspec,
        ],
    )
}

fn current_git_branch(git_root: &Path) -> Option<String> {
    let git_root_arg = git_root.to_string_lossy();
    let probe = run_command(
        "git",
        &["-C", git_root_arg.as_ref(), "branch", "--show-current"],
    );
    if !probe.ok {
        return None;
    }

    probe
        .stdout
        .lines()
        .next()
        .map(str::trim)
        .filter(|branch| !branch.is_empty())
        .map(str::to_string)
}

fn git_upstream(git_root: &Path) -> Option<String> {
    let git_root_arg = git_root.to_string_lossy();
    let probe = run_command(
        "git",
        &[
            "-C",
            git_root_arg.as_ref(),
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{u}",
        ],
    );
    if !probe.ok {
        return None;
    }
    probe
        .stdout
        .lines()
        .next()
        .map(str::trim)
        .filter(|upstream| !upstream.is_empty())
        .map(str::to_string)
}

fn git_has_origin(git_root: &Path) -> bool {
    let git_root_arg = git_root.to_string_lossy();
    run_command("git", &["-C", git_root_arg.as_ref(), "remote", "get-url", "origin"]).ok
}

fn git_ahead_count(git_root: &Path) -> usize {
    if git_upstream(git_root).is_none() {
        return 0;
    }
    let git_root_arg = git_root.to_string_lossy();
    let probe = run_command(
        "git",
        &["-C", git_root_arg.as_ref(), "rev-list", "--count", "@{u}..HEAD"],
    );
    if !probe.ok {
        return 0;
    }
    probe.stdout.trim().parse::<usize>().unwrap_or(0)
}

fn git_can_push(git_root: &Path) -> bool {
    if current_git_branch(git_root).is_none() {
        return false;
    }
    git_ahead_count(git_root) > 0 || (git_upstream(git_root).is_none() && git_has_origin(git_root))
}

fn first_non_empty_line(output: &str) -> Option<String> {
    output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

fn git_path_to_workspace_child(
    git_root: &Path,
    workspace: &Path,
    git_path: &str,
) -> Result<PathBuf, String> {
    // With --untracked-files=normal, porcelain v1 marks an untracked directory
    // with a trailing slash (for example, "src/"). The slash is status
    // metadata rather than an empty path component.
    let git_path = git_path.trim_end_matches('/');
    if git_path.trim().is_empty()
        || Path::new(git_path).is_absolute()
        || git_path
            .split('/')
            .any(|component| component.is_empty() || component == "." || component == "..")
    {
        return Err("Git returned an unsafe path".to_string());
    }

    let absolute = git_root.join(git_path);
    if !absolute.starts_with(workspace) {
        return Err("Git path is outside the selected workspace".to_string());
    }
    Ok(absolute)
}

fn workspace_relative_to_git_path(
    git_root: &Path,
    workspace: &Path,
    workspace_relative_path: &str,
) -> Result<String, String> {
    if workspace_relative_path.trim().is_empty()
        || Path::new(workspace_relative_path).is_absolute()
        || workspace_relative_path
            .split('/')
            .any(|component| component.is_empty() || component == "." || component == "..")
    {
        return Err("Selected path is outside the workspace".to_string());
    }

    let workspace_prefix = git_relative_path(git_root, workspace)?;
    let git_path = if workspace_prefix.is_empty() {
        workspace_relative_path.to_string()
    } else {
        format!("{workspace_prefix}/{workspace_relative_path}")
    };
    git_path_to_workspace_child(git_root, workspace, &git_path)?;
    Ok(git_path)
}

#[derive(Debug, PartialEq)]
struct ParsedGitStatus {
    index_status: char,
    worktree_status: char,
    path: String,
    old_path: Option<String>,
}

fn parse_git_status_porcelain(output: &str) -> Result<Vec<ParsedGitStatus>, String> {
    let entries: Vec<&str> = output.split('\0').filter(|entry| !entry.is_empty()).collect();
    let mut parsed = Vec::new();
    let mut index = 0;

    while index < entries.len() {
        let entry = entries[index];
        let mut chars = entry.chars();
        let index_status = chars
            .next()
            .ok_or_else(|| "Git status entry is missing index status".to_string())?;
        let worktree_status = chars
            .next()
            .ok_or_else(|| "Git status entry is missing worktree status".to_string())?;
        let separator = chars
            .next()
            .ok_or_else(|| "Git status entry is missing path separator".to_string())?;
        if separator != ' ' {
            return Err("Git status entry has an unexpected format".to_string());
        }
        let path = chars.collect::<String>();
        if path.trim().is_empty() {
            return Err("Git status entry is missing a path".to_string());
        }

        let old_path = if matches!(index_status, 'R' | 'C')
            || matches!(worktree_status, 'R' | 'C')
        {
            index += 1;
            entries.get(index).map(|value| (*value).to_string())
        } else {
            None
        };

        parsed.push(ParsedGitStatus {
            index_status,
            worktree_status,
            path,
            old_path,
        });
        index += 1;
    }

    Ok(parsed)
}

fn git_status_kind(index_status: char, worktree_status: char) -> &'static str {
    if git_status_is_conflicted(index_status, worktree_status) {
        "conflicted"
    } else if index_status == '?' && worktree_status == '?' {
        "untracked"
    } else if matches!(index_status, 'R') || matches!(worktree_status, 'R') {
        "renamed"
    } else if matches!(index_status, 'C') || matches!(worktree_status, 'C') {
        "copied"
    } else if matches!(index_status, 'D') || matches!(worktree_status, 'D') {
        "deleted"
    } else if matches!(index_status, 'A') || matches!(worktree_status, 'A') {
        "added"
    } else {
        "modified"
    }
}

fn git_status_badge(index_status: char, worktree_status: char) -> &'static str {
    match git_status_kind(index_status, worktree_status) {
        "conflicted" => "U",
        "untracked" => "U",
        "renamed" => "R",
        "copied" => "C",
        "deleted" => "D",
        "added" => "A",
        _ => "M",
    }
}

fn git_status_is_conflicted(index_status: char, worktree_status: char) -> bool {
    matches!(index_status, 'U')
        || matches!(worktree_status, 'U')
        || matches!(
            (index_status, worktree_status),
            ('A', 'A') | ('D', 'D') | ('A', 'D') | ('D', 'A')
        )
}

fn git_numstat_totals(git_root: &Path, pathspec: &str) -> (usize, usize) {
    let git_root_arg = git_root.to_string_lossy();
    let mut additions = 0;
    let mut deletions = 0;

    for staged in [false, true] {
        let mut args = vec![
            "-C",
            git_root_arg.as_ref(),
            "diff",
            "--numstat",
            "--no-ext-diff",
            "--find-renames",
            "--find-copies",
        ];
        if staged {
            args.push("--cached");
        }
        args.extend(["--", pathspec]);

        let probe = run_command("git", &args);
        if probe.ok {
            let (next_additions, next_deletions) = parse_git_numstat_totals(&probe.stdout);
            additions += next_additions;
            deletions += next_deletions;
        }
    }

    (additions, deletions)
}

fn parse_git_numstat_totals(output: &str) -> (usize, usize) {
    output.lines().fold((0, 0), |(additions, deletions), line| {
        let mut fields = line.split('\t');
        let Some(added) = fields.next() else {
            return (additions, deletions);
        };
        let Some(deleted) = fields.next() else {
            return (additions, deletions);
        };

        match (added.parse::<usize>(), deleted.parse::<usize>()) {
            (Ok(added), Ok(deleted)) => (additions + added, deletions + deleted),
            _ => (additions, deletions),
        }
    })
}

fn untracked_file_additions(workspace: &Path, file_path: &Path) -> usize {
    read_workspace_file_preview_text(workspace, file_path)
        .ok()
        .filter(|preview| !preview.is_binary)
        .map(|preview| preview.content.lines().count())
        .unwrap_or(0)
}

fn run_git_diff(git_root: &Path, staged: bool, git_path: &str) -> Result<String, String> {
    let git_root_arg = git_root.to_string_lossy();
    let probe = if staged {
        run_command_raw(
            "git",
            &[
                "-C",
                git_root_arg.as_ref(),
                "diff",
                "--cached",
                "--no-ext-diff",
                "--find-renames",
                "--find-copies",
                "--",
                git_path,
            ],
        )
    } else {
        run_command_raw(
            "git",
            &[
                "-C",
                git_root_arg.as_ref(),
                "diff",
                "--no-ext-diff",
                "--find-renames",
                "--find-copies",
                "--",
                git_path,
            ],
        )
    };

    if probe.ok {
        Ok(probe.stdout)
    } else {
        Err(output_detail(&probe).unwrap_or_else(|| "Unable to read Git diff".to_string()))
    }
}

fn git_diff_is_binary(diff: &str) -> bool {
    diff.lines()
        .any(|line| line.starts_with("Binary files ") || line == "GIT binary patch")
}

fn git_diff_section(
    git_root: &Path,
    workspace: &Path,
    file_path: &Path,
    git_path: &str,
    old_git_path: Option<&str>,
    kind: &str,
    title: &str,
    diff: String,
    staged: bool,
) -> Result<WorkspaceGitDiffSection, String> {
    let base_git_path = old_git_path.unwrap_or(git_path);
    let (base_label, base) = if staged {
        read_git_object_preview(git_root, &format!("HEAD:{base_git_path}"))?
            .map(|preview| (format!("HEAD:{base_git_path}"), preview))
            .unwrap_or_else(|| ("/dev/null".to_string(), empty_preview_text()))
    } else {
        read_git_object_preview(git_root, &format!(":{git_path}"))?
            .map(|preview| (format!("Index:{git_path}"), preview))
            .unwrap_or_else(|| ("/dev/null".to_string(), empty_preview_text()))
    };
    let (head_label, head) = if staged {
        read_git_object_preview(git_root, &format!(":{git_path}"))?
            .map(|preview| (format!("Index:{git_path}"), preview))
            .unwrap_or_else(|| ("/dev/null".to_string(), empty_preview_text()))
    } else if file_path.exists() {
        (
            format!("Working tree:{git_path}"),
            read_workspace_file_preview_text(workspace, file_path)?,
        )
    } else {
        ("/dev/null".to_string(), empty_preview_text())
    };

    let is_binary = git_diff_is_binary(&diff) || base.is_binary || head.is_binary;

    Ok(WorkspaceGitDiffSection {
        kind: kind.to_string(),
        title: title.to_string(),
        base_label,
        head_label,
        base_content: base.content,
        head_content: head.content,
        base_truncated: base.truncated,
        head_truncated: head.truncated,
        content: diff,
        is_binary,
    })
}

fn read_git_object_preview(git_root: &Path, object: &str) -> Result<Option<PreviewText>, String> {
    let git_root_arg = git_root.to_string_lossy();
    let probe = run_command_bytes(
        "git",
        &["-C", git_root_arg.as_ref(), "show", "--no-ext-diff", object],
    );
    if !probe.ok {
        return Ok(None);
    }

    Ok(Some(preview_text_from_bytes(&probe.stdout)))
}

fn read_workspace_file_preview_text(workspace: &Path, file_path: &Path) -> Result<PreviewText, String> {
    let canonical_file = fs::canonicalize(file_path)
        .map_err(|error| format!("Unable to open {}: {error}", file_path.display()))?;
    if !canonical_file.starts_with(workspace) {
        return Err("Selected path is outside the workspace".to_string());
    }

    let mut file = fs::File::open(&canonical_file)
        .map_err(|error| format!("Unable to open {}: {error}", canonical_file.display()))?;
    let mut bytes = Vec::with_capacity(MAX_FILE_PREVIEW_BYTES + 1);
    Read::by_ref(&mut file)
        .take((MAX_FILE_PREVIEW_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Unable to read {}: {error}", canonical_file.display()))?;

    Ok(preview_text_from_bytes(&bytes))
}

fn preview_text_from_bytes(bytes: &[u8]) -> PreviewText {
    let preview_len = bytes.len().min(MAX_FILE_PREVIEW_BYTES);
    let preview_bytes = &bytes[..preview_len];
    let (content, is_binary) = decode_preview_text(preview_bytes);
    PreviewText {
        content,
        truncated: bytes.len() > MAX_FILE_PREVIEW_BYTES,
        is_binary,
    }
}

fn empty_preview_text() -> PreviewText {
    PreviewText {
        content: String::new(),
        truncated: false,
        is_binary: false,
    }
}

fn reconstruct_missing_absolute_path(path: &Path) -> Result<PathBuf, String> {
    let mut existing = path;
    let mut missing = Vec::new();

    while !existing.exists() {
        let file_name = existing
            .file_name()
            .ok_or_else(|| format!("Unable to open path {}", path.display()))?;
        missing.push(file_name.to_os_string());
        existing = existing
            .parent()
            .ok_or_else(|| format!("Unable to open path {}", path.display()))?;
    }

    let mut reconstructed = fs::canonicalize(existing)
        .map_err(|error| format!("Unable to open path {}: {error}", existing.display()))?;
    for component in missing.iter().rev() {
        reconstructed.push(component);
    }

    Ok(reconstructed)
}

fn synthetic_untracked_diff(
    workspace: &Path,
    file_path: &Path,
    relative_path: &str,
) -> Result<WorkspaceGitDiffSection, String> {
    let head = read_workspace_file_preview_text(workspace, file_path)?;
    let diff = if head.is_binary {
        String::new()
    } else {
        let mut lines = head
            .content
            .lines()
            .map(|line| format!("+{line}"))
            .collect::<Vec<_>>();
        if head.content.ends_with('\n') {
            lines.push(String::new());
        }
        format!(
            "diff --git a/{relative_path} b/{relative_path}\nnew file mode 100644\n--- /dev/null\n+++ b/{relative_path}\n@@ -0,0 +{} @@\n{}",
            head.content.lines().count(),
            lines.join("\n")
        )
    };

    Ok(WorkspaceGitDiffSection {
        kind: "untracked".to_string(),
        title: "Untracked file".to_string(),
        base_label: "/dev/null".to_string(),
        head_label: format!("Working tree:{relative_path}"),
        base_content: String::new(),
        head_content: head.content,
        base_truncated: false,
        head_truncated: head.truncated,
        content: diff,
        is_binary: head.is_binary,
    })
}

fn decode_preview_text(bytes: &[u8]) -> (String, bool) {
    if bytes.contains(&0) {
        return (String::new(), true);
    }

    match std::str::from_utf8(bytes) {
        Ok(content) => (content.to_string(), false),
        Err(error) if error.error_len().is_none() => {
            let valid_bytes = &bytes[..error.valid_up_to()];
            (
                std::str::from_utf8(valid_bytes)
                    .unwrap_or_default()
                    .to_string(),
                false,
            )
        }
        Err(_) => (String::new(), true),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            present_main_window(app);
        }))
        .manage(CodexState::default())
        .manage(AgentNotificationState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            codex_connect,
            codex_default_profile_connect,
            codex_rpc,
            codex_default_profile_rpc,
            codex_default_profile_turn_activity,
            codex_default_profile_thread_index,
            codex_default_profile_thread_index_cancel,
            codex_default_profile_thread_transcript_sync,
            codex_default_profile_thread_transcript_cancel,
            codex_resolve_server_request,
            codex_default_profile_resolve_server_request,
            codex_stop,
            codex_default_profile_stop,
            codex_delete_profile,
            list_git_branches,
            checkout_git_branch,
            commit_workspace_changes,
            generate_workspace_commit_message,
            push_workspace_branch,
            list_workspace_git_status,
            read_workspace_git_diff,
            list_workspace_directory,
            read_workspace_file_preview,
            run_preflight,
            agent_notifications::agent_notification_permission_status,
            agent_notifications::agent_notification_request_permission,
            agent_notifications::agent_notification_send,
            agent_notifications::agent_notification_remove,
            agent_notifications::agent_notification_take_pending_activation,
            agent_notifications::agent_notification_open_settings
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Ready = event {
            present_main_window(app_handle);
        }
    });
}

fn present_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_codex_binary_on_path() {
        let directory = env::temp_dir().join(format!(
            "orchestrator-codex-path-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&directory).expect("create test directory");

        let executable = if cfg!(windows) { "codex.exe" } else { "codex" };
        let binary = directory.join(executable);
        std::fs::write(&binary, b"test").expect("create test binary");
        let path_value = env::join_paths([&directory]).expect("join test PATH");

        assert_eq!(find_codex_on_path(Some(path_value)), Some(binary));

        std::fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn checks_desktop_bundles_and_common_cli_locations_on_macos() {
        let home = Path::new("/Users/orchestrator-test");
        let candidates = macos_codex_binary_candidates(Some(home));

        assert!(candidates.contains(&PathBuf::from(
            "/Applications/Codex.app/Contents/Resources/codex"
        )));
        assert!(candidates.contains(&PathBuf::from(
            "/Applications/ChatGPT.app/Contents/Resources/codex"
        )));
        assert!(candidates.contains(&PathBuf::from("/opt/homebrew/bin/codex")));
        assert!(candidates.contains(&home.join(".cargo/bin/codex")));
        assert!(candidates.contains(&home.join(".local/bin/codex")));
    }

    #[test]
    fn account_profile_paths_are_confined_to_app_data() {
        let base = Path::new("/tmp/orchestrator-test-data");
        assert_eq!(
            account_profile_root(base, 42).unwrap(),
            base.join("codex-accounts/42")
        );
        assert!(account_profile_root(base, 0).is_err());
        assert!(account_profile_root(base, -1).is_err());
    }

    #[test]
    fn default_profile_uses_local_codex_home() {
        let home = Path::new("/tmp/orchestrator-user-home");
        assert_eq!(
            default_codex_home_from_home(home),
            home.join(".codex")
        );
        assert_eq!(profile_key_for_account(0), "default");
        assert_eq!(profile_key_for_account(12), "account:12");
    }

    #[test]
    fn pending_requests_are_filtered_by_account() {
        let (sender_one, _receiver_one) = oneshot::channel();
        let (sender_two, _receiver_two) = oneshot::channel();
        let mut pending = HashMap::new();
        pending.insert(
            "1".to_string(),
            PendingResponse {
                account_id: 7,
                sender: sender_one,
            },
        );
        pending.insert(
            "2".to_string(),
            PendingResponse {
                account_id: 8,
                sender: sender_two,
            },
        );

        assert_eq!(pending_keys_for_account(&pending, 7), vec!["1"]);
        assert_eq!(pending_keys_for_account(&pending, 8), vec!["2"]);
    }

    #[test]
    fn native_server_request_registry_deduplicates_within_one_connection() {
        let pending: PendingServerRequestMap = Arc::new(Mutex::new(HashMap::new()));
        let sequence = AtomicU64::new(0);

        let first = register_server_request(&pending, &sequence, 7, 3, json!(9));
        let replay = register_server_request(&pending, &sequence, 7, 3, json!(9));
        let reconnected = register_server_request(&pending, &sequence, 7, 4, json!(9));

        assert_eq!(first, replay);
        assert_ne!(first, reconnected);
        assert_eq!(pending.lock().unwrap().len(), 2);

        resolve_tracked_server_request(&pending, 7, 3, &json!(9));
        let requests = pending.lock().unwrap();
        assert!(!requests.contains_key(&first));
        assert!(requests.contains_key(&reconnected));
    }

    #[test]
    fn native_server_request_claim_is_one_shot_and_bound_to_identity() {
        let pending: PendingServerRequestMap = Arc::new(Mutex::new(HashMap::new()));
        let sequence = AtomicU64::new(0);
        let token = register_server_request(&pending, &sequence, 7, 3, json!(9));

        assert!(claim_server_request(&pending, 7, 3, &token, &json!(9)).is_ok());
        assert!(claim_server_request(&pending, 7, 3, &token, &json!(9))
            .unwrap_err()
            .contains("already submitted"));

        release_server_request_claim(&pending, &token);
        assert!(claim_server_request(&pending, 8, 3, &token, &json!(9))
            .unwrap_err()
            .contains("does not match"));
        assert!(claim_server_request(&pending, 7, 4, &token, &json!(9))
            .unwrap_err()
            .contains("does not match"));
        assert!(claim_server_request(&pending, 7, 3, &token, &json!(10))
            .unwrap_err()
            .contains("does not match"));
        assert!(claim_server_request(&pending, 7, 3, "missing-token", &json!(9))
            .unwrap_err()
            .contains("stale or already resolved"));
    }

    #[test]
    fn native_server_request_cleanup_invalidates_stale_connections_and_accounts() {
        let pending: PendingServerRequestMap = Arc::new(Mutex::new(HashMap::new()));
        let sequence = AtomicU64::new(0);
        let account_seven_old = register_server_request(&pending, &sequence, 7, 3, json!(9));
        let account_seven_new = register_server_request(&pending, &sequence, 7, 4, json!(10));
        let account_eight = register_server_request(&pending, &sequence, 8, 3, json!(11));

        clear_server_requests_for_generation(&pending, 7, 3);
        {
            let requests = pending.lock().unwrap();
            assert!(!requests.contains_key(&account_seven_old));
            assert!(requests.contains_key(&account_seven_new));
            assert!(requests.contains_key(&account_eight));
        }

        clear_server_requests_for_account(&pending, 7);
        let requests = pending.lock().unwrap();
        assert!(!requests.contains_key(&account_seven_new));
        assert!(requests.contains_key(&account_eight));
    }

    #[test]
    fn stopping_one_profile_rejects_only_its_pending_requests() {
        let (sender_one, receiver_one) = oneshot::channel();
        let (sender_two, _receiver_two) = oneshot::channel();
        let pending: PendingMap = Arc::new(Mutex::new(HashMap::from([
            (
                "1".to_string(),
                PendingResponse {
                    account_id: 7,
                    sender: sender_one,
                },
            ),
            (
                "2".to_string(),
                PendingResponse {
                    account_id: 8,
                    sender: sender_two,
                },
            ),
        ])));

        reject_pending_for_account(&pending, 7, "profile stopped");

        assert_eq!(
            receiver_one.blocking_recv().unwrap().unwrap_err(),
            "profile stopped"
        );
        let remaining = pending.lock().unwrap();
        assert!(!remaining.contains_key("1"));
        assert!(remaining.contains_key("2"));
    }

    #[test]
    fn account_events_include_their_owner() {
        let event = CodexMessageEvent {
            account_id: 9,
            profile_key: profile_key_for_account(9),
            message: json!({ "method": "account/updated" }),
            request_token: None,
        };
        let value = serde_json::to_value(event).unwrap();

        assert_eq!(value["accountId"], 9);
        assert_eq!(value["profileKey"], "account:9");
        assert_eq!(value["message"]["method"], "account/updated");
    }

    #[test]
    fn historical_activity_projection_omits_bulk_item_content() {
        let response = json!({
            "data": [
                {
                    "type": "commandExecution",
                    "id": "command-1",
                    "command": "npm test -- --run",
                    "status": "completed",
                    "durationMs": 1200,
                    "aggregatedOutput": "very large command output that must not cross the bridge"
                },
                {
                    "type": "reasoning",
                    "id": "reasoning-1",
                    "content": "private reasoning body"
                },
                {
                    "type": "fileChange",
                    "changes": [
                        {
                            "path": "src/App.tsx",
                            "kind": { "type": "update" },
                            "diff": "--- a/src/App.tsx\n+++ b/src/App.tsx\n-old\n+new\n+another"
                        }
                    ]
                }
            ],
            "nextCursor": "older-items"
        });

        let projected = project_historical_turn_activity(&response);
        let value = serde_json::to_value(&projected).unwrap();
        let serialized = value.to_string();

        assert_eq!(value["commands"][0]["command"], "npm test -- --run");
        assert_eq!(value["commands"][0]["durationMs"], 1200);
        assert_eq!(value["editedFiles"][0]["path"], "src/App.tsx");
        assert_eq!(value["editedFiles"][0]["additions"], 2);
        assert_eq!(value["editedFiles"][0]["deletions"], 1);
        assert_eq!(value["nextCursor"], "older-items");
        assert!(!serialized.contains("very large command output"));
        assert!(!serialized.contains("private reasoning body"));
        assert!(!serialized.contains("--- a/src/App.tsx"));
    }

    #[test]
    fn history_index_projection_returns_metrics_without_message_content() {
        let prompt = "private prompt text\nwith another line";
        let final_answer = "private final answer";
        let turn = json!({
            "id": "turn-1",
            "items": [
                {
                    "type": "userMessage",
                    "text": prompt
                },
                {
                    "type": "reasoning",
                    "content": "private reasoning content"
                },
                {
                    "type": "commandExecution",
                    "command": "cat secret.txt",
                    "aggregatedOutput": "private command output"
                },
                {
                    "type": "fileChange",
                    "changes": [{
                        "path": "secret.txt",
                        "diff": "--- a/secret.txt\n+++ b/secret.txt\n-secret\n+private diff"
                    }]
                },
                {
                    "type": "agentMessage",
                    "phase": "final_answer",
                    "text": final_answer
                }
            ]
        });

        let hint = project_history_turn_hint(&turn);
        let serialized = serde_json::to_string(&hint).unwrap();

        assert_eq!(hint.turn_id.as_deref(), Some("turn-1"));
        assert_eq!(hint.prompt_characters, prompt.chars().count());
        assert_eq!(hint.prompt_lines, 2);
        assert_eq!(hint.response_characters, final_answer.chars().count());
        assert_eq!(hint.response_lines, 1);
        assert!(!serialized.contains("private prompt text"));
        assert!(!serialized.contains("private final answer"));
        assert!(!serialized.contains("private reasoning content"));
        assert!(!serialized.contains("private command output"));
        assert!(!serialized.contains("private diff"));
    }

    #[test]
    fn transcript_projection_keeps_only_prompt_and_final_answer() {
        let turn = json!({
            "id": "turn-1",
            "status": "completed",
            "startedAt": "2026-07-13T10:00:00Z",
            "completedAt": "2026-07-13T10:00:12Z",
            "durationMs": 12000,
            "tokenUsage": {
                "totalTokens": 4200,
                "modelContextWindow": 128000
            },
            "items": [
                { "type": "userMessage", "text": "Keep this prompt" },
                { "type": "reasoning", "content": "exclude private reasoning" },
                {
                    "type": "agentMessage",
                    "phase": "commentary",
                    "text": "exclude streamed commentary"
                },
                {
                    "type": "commandExecution",
                    "command": "cat secret.txt",
                    "aggregatedOutput": "exclude command output"
                },
                {
                    "type": "fileChange",
                    "changes": [{
                        "path": "secret.txt",
                        "diff": "exclude raw diff"
                    }]
                },
                {
                    "type": "agentMessage",
                    "phase": "final_answer",
                    "text": "Keep only this final answer"
                }
            ]
        });

        let projected = project_external_transcript_turn(&turn).expect("projected turn");
        let serialized = serde_json::to_string(&projected).unwrap();

        assert_eq!(projected.prompt, "Keep this prompt");
        assert_eq!(projected.final_message, "Keep only this final answer");
        assert_eq!(projected.total_tokens, Some(4200));
        assert_eq!(projected.model_context_window, Some(128000));
        assert!(!serialized.contains("exclude private reasoning"));
        assert!(!serialized.contains("exclude streamed commentary"));
        assert!(!serialized.contains("exclude command output"));
        assert!(!serialized.contains("exclude raw diff"));
    }

    #[test]
    fn main_window_can_write_to_sqlite() {
        let capability: Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let permissions = capability["permissions"].as_array().unwrap();

        assert!(permissions
            .iter()
            .any(|permission| permission == "sql:allow-execute"));
    }

    #[test]
    fn main_window_can_start_native_dragging() {
        let capability: Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let permissions = capability["permissions"].as_array().unwrap();

        assert!(permissions
            .iter()
            .any(|permission| permission == "core:window:allow-start-dragging"));
    }

    #[test]
    fn account_email_migration_enforces_active_uniqueness() {
        let migration = migrations()
            .into_iter()
            .find(|migration| migration.version == 4)
            .expect("account email uniqueness migration");

        assert!(migration
            .sql
            .contains("idx_codex_accounts_unique_active_email"));
        assert!(migration.sql.contains("LOWER(TRIM(email))"));
        assert!(migration
            .sql
            .contains("Duplicate account consolidated"));
    }

    #[test]
    fn migration_versions_are_unique() {
        let mut versions: Vec<i64> = migrations()
            .into_iter()
            .map(|migration| migration.version)
            .collect();
        versions.sort_unstable();

        for pair in versions.windows(2) {
            assert_ne!(pair[0], pair[1], "duplicate migration version {}", pair[0]);
        }
    }

    #[test]
    fn run_delete_migration_keeps_archive_compatibility_slot() {
        let all_migrations = migrations();
        let archive_compatibility = all_migrations
            .iter()
            .find(|migration| migration.version == 6)
            .expect("migration 6");
        let soft_delete_runs = all_migrations
            .iter()
            .find(|migration| migration.version == 7)
            .expect("migration 7");

        assert_eq!(archive_compatibility.description, "add_archived_runs");
        assert!(archive_compatibility.sql.contains("ADD COLUMN archived_at"));
        assert_eq!(soft_delete_runs.description, "soft_delete_runs");
        assert!(soft_delete_runs.sql.contains("ADD COLUMN deleted_at"));
    }

    #[test]
    fn chat_migration_adds_threaded_history_without_modifying_prior_slots() {
        let all_migrations = migrations();
        let archive_compatibility = all_migrations
            .iter()
            .find(|migration| migration.version == 6)
            .expect("migration 6");
        let soft_delete_runs = all_migrations
            .iter()
            .find(|migration| migration.version == 7)
            .expect("migration 7");
        let threaded_chats = all_migrations
            .iter()
            .find(|migration| migration.version == 8)
            .expect("migration 8");

        assert_eq!(archive_compatibility.description, "add_archived_runs");
        assert_eq!(soft_delete_runs.description, "soft_delete_runs");
        assert_eq!(
            threaded_chats.description,
            "create_chats_for_threaded_history"
        );
        assert!(threaded_chats.sql.contains("CREATE TABLE IF NOT EXISTS chats"));
        assert!(threaded_chats.sql.contains("ALTER TABLE runs ADD COLUMN chat_id"));
        assert!(threaded_chats.sql.contains("ALTER TABLE tasks ADD COLUMN chat_id"));
        assert!(threaded_chats.sql.contains("INSERT INTO chats"));
    }

    #[test]
    fn external_chat_migration_preserves_previous_history_migrations() {
        let all_migrations = migrations();
        let archive_compatibility = all_migrations
            .iter()
            .find(|migration| migration.version == 6)
            .expect("migration 6");
        let soft_delete_runs = all_migrations
            .iter()
            .find(|migration| migration.version == 7)
            .expect("migration 7");
        let threaded_chats = all_migrations
            .iter()
            .find(|migration| migration.version == 8)
            .expect("migration 8");
        let external_chats = all_migrations
            .iter()
            .find(|migration| migration.version == 9)
            .expect("migration 9");

        assert_eq!(archive_compatibility.description, "add_archived_runs");
        assert_eq!(soft_delete_runs.description, "soft_delete_runs");
        assert_eq!(
            threaded_chats.description,
            "create_chats_for_threaded_history"
        );
        assert_eq!(external_chats.description, "add_external_codex_chats");
        assert!(external_chats.sql.contains("ADD COLUMN origin"));
        assert!(external_chats.sql.contains("external_thread_id"));
        assert!(external_chats.sql.contains("idx_chats_external_thread"));
    }

    #[test]
    fn history_index_migration_uses_a_new_slot_and_preserves_history_migrations() {
        let all_migrations = migrations();
        let expected = [
            (6, "add_archived_runs"),
            (7, "soft_delete_runs"),
            (8, "create_chats_for_threaded_history"),
            (9, "add_external_codex_chats"),
            (10, "cache_external_chat_history_indexes"),
        ];

        for (version, description) in expected {
            let migration = all_migrations
                .iter()
                .find(|migration| migration.version == version)
                .unwrap_or_else(|| panic!("migration {version}"));
            assert_eq!(migration.description, description);
        }

        let history_index = all_migrations
            .iter()
            .find(|migration| migration.version == 10)
            .expect("migration 10");
        assert!(history_index
            .sql
            .contains("CREATE TABLE IF NOT EXISTS external_chat_history_indexes"));
        assert!(history_index.sql.contains("thread_id TEXT NOT NULL"));
        assert!(history_index.sql.contains("source_version TEXT NOT NULL"));
    }

    #[test]
    fn transcript_cache_migration_uses_slot_eleven_and_preserves_prior_slots() {
        let all_migrations = migrations();
        let expected = [
            (6, "add_archived_runs"),
            (7, "soft_delete_runs"),
            (8, "create_chats_for_threaded_history"),
            (9, "add_external_codex_chats"),
            (10, "cache_external_chat_history_indexes"),
            (11, "cache_external_chat_transcript_snapshots"),
            (12, "add_external_transcript_turn_errors"),
        ];

        for (version, description) in expected {
            let migration = all_migrations
                .iter()
                .find(|migration| migration.version == version)
                .unwrap_or_else(|| panic!("migration {version}"));
            assert_eq!(migration.description, description);
        }

        let transcript_cache = all_migrations
            .iter()
            .find(|migration| migration.version == 11)
            .expect("migration 11");
        assert!(transcript_cache.sql.contains(
            "CREATE TABLE IF NOT EXISTS external_chat_transcript_snapshots"
        ));
        assert!(transcript_cache.sql.contains(
            "CREATE TABLE IF NOT EXISTS external_chat_turn_summaries"
        ));
        assert!(transcript_cache
            .sql
            .contains("PRIMARY KEY (chat_id, source_version, slot_index)"));
        assert!(!transcript_cache.sql.contains("error TEXT"));

        let transcript_errors = all_migrations
            .iter()
            .find(|migration| migration.version == 12)
            .expect("migration 12");
        assert!(transcript_errors
            .sql
            .contains("ALTER TABLE external_chat_turn_summaries ADD COLUMN error TEXT"));
    }

    #[test]
    fn native_plan_mode_migration_persists_workflow_identity_and_review_state() {
        let all_migrations = migrations();
        let native_plan = all_migrations
            .iter()
            .find(|migration| migration.version == 13)
            .expect("migration 13");

        assert_eq!(native_plan.description, "persist_native_plan_mode_workflows");
        for column in [
            "collaboration_mode",
            "saved_default_collaboration_mode_json",
            "run_intent",
            "client_user_message_id",
            "completed_plan_item_id",
            "completed_plan_text",
            "plan_review_state",
        ] {
            assert!(native_plan.sql.contains(column), "missing {column}");
        }
        assert!(native_plan
            .sql
            .contains("CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_client_user_message_id"));
    }

    #[test]
    fn active_context_usage_migration_uses_a_new_slot() {
        let all_migrations = migrations();
        let native_plan = all_migrations
            .iter()
            .find(|migration| migration.version == 13)
            .expect("migration 13");
        let active_context = all_migrations
            .iter()
            .find(|migration| migration.version == 14)
            .expect("migration 14");

        assert_eq!(native_plan.description, "persist_native_plan_mode_workflows");
        assert_eq!(active_context.description, "separate_active_context_usage");
        assert!(active_context
            .sql
            .contains("ADD COLUMN context_tokens INTEGER"));
        assert!(active_context
            .sql
            .contains("$.params.tokenUsage.last.totalTokens"));
    }

    #[test]
    fn per_run_token_usage_migration_uses_a_new_slot() {
        let migration = migrations()
            .into_iter()
            .find(|migration| migration.version == 15)
            .expect("migration 15");

        assert_eq!(migration.description, "store_per_run_token_usage");
        assert!(migration.sql.contains("ADD COLUMN run_tokens INTEGER"));
        assert!(migration
            .sql
            .contains("ADD COLUMN run_cached_input_tokens INTEGER"));
        assert!(migration.sql.contains("previous_runs.codex_thread_id"));
    }

    #[test]
    fn pending_key_handles_string_and_number_ids() {
        assert_eq!(pending_key(&json!(7)), "7");
        assert_eq!(pending_key(&json!("abc")), "abc");
    }

    #[test]
    fn estimates_prompt_tokens_without_returning_zero_for_text() {
        assert_eq!(estimate_tokens("fix tests"), 2);
        assert!(estimate_tokens("a".repeat(400).as_str()) >= 100);
    }

    #[test]
    fn routes_large_or_risky_prompts_to_plan_first() {
        assert_eq!(
            route_recommendation("Implement a database migration", 20),
            "plan-first"
        );
        assert_eq!(route_recommendation("Rename this label", 4), "direct-run");
    }

    #[test]
    fn workspace_directory_listing_rejects_outside_paths() {
        let workspace = test_directory("workspace-list-rejects-workspace");
        let outside = test_directory("workspace-list-rejects-outside");

        let result = list_workspace_directory_blocking(
            workspace.to_string_lossy().to_string(),
            outside.to_string_lossy().to_string(),
        );

        assert!(result.unwrap_err().contains("outside the workspace"));
        remove_test_directory(workspace);
        remove_test_directory(outside);
    }

    #[test]
    fn workspace_directory_listing_sorts_and_omits_heavy_folders() {
        let workspace = test_directory("workspace-list-sorts");
        fs::create_dir_all(workspace.join("src")).unwrap();
        fs::create_dir_all(workspace.join(".git")).unwrap();
        fs::create_dir_all(workspace.join("node_modules")).unwrap();
        fs::write(workspace.join("Cargo.toml"), b"[package]").unwrap();
        fs::write(workspace.join("README.md"), b"readme").unwrap();

        let entries = list_workspace_directory_blocking(
            workspace.to_string_lossy().to_string(),
            workspace.to_string_lossy().to_string(),
        )
        .unwrap();
        let names: Vec<_> = entries.iter().map(|entry| entry.name.as_str()).collect();

        assert_eq!(names, vec!["src", "Cargo.toml", "README.md"]);
        assert_eq!(entries[0].kind, "directory");
        assert_eq!(entries[1].kind, "file");
        assert_eq!(entries[0].relative_path, "src");
        remove_test_directory(workspace);
    }

    #[test]
    fn workspace_file_preview_rejects_outside_and_missing_files() {
        let workspace = test_directory("workspace-preview-rejects-workspace");
        let outside = test_directory("workspace-preview-rejects-outside");
        let outside_file = outside.join("secret.txt");
        fs::write(&outside_file, b"secret").unwrap();

        let outside_result = read_workspace_file_preview_blocking(
            workspace.to_string_lossy().to_string(),
            outside_file.to_string_lossy().to_string(),
        );
        let missing_result = read_workspace_file_preview_blocking(
            workspace.to_string_lossy().to_string(),
            workspace.join("missing.txt").to_string_lossy().to_string(),
        );

        assert!(outside_result.unwrap_err().contains("outside the workspace"));
        assert!(missing_result.unwrap_err().contains("Unable to open path"));
        remove_test_directory(workspace);
        remove_test_directory(outside);
    }

    #[test]
    fn workspace_file_preview_truncates_large_text_files() {
        let workspace = test_directory("workspace-preview-truncates");
        let file = workspace.join("large.txt");
        fs::write(&file, "a".repeat(MAX_FILE_PREVIEW_BYTES + 16)).unwrap();

        let preview = read_workspace_file_preview_blocking(
            workspace.to_string_lossy().to_string(),
            file.to_string_lossy().to_string(),
        )
        .unwrap();

        assert!(preview.truncated);
        assert!(!preview.is_binary);
        assert_eq!(preview.content.len(), MAX_FILE_PREVIEW_BYTES);
        assert_eq!(preview.relative_path, "large.txt");
        remove_test_directory(workspace);
    }

    #[test]
    fn workspace_file_preview_marks_binary_content_without_text() {
        let workspace = test_directory("workspace-preview-binary");
        let file = workspace.join("data.bin");
        fs::write(&file, b"hello\0world").unwrap();

        let preview = read_workspace_file_preview_blocking(
            workspace.to_string_lossy().to_string(),
            file.to_string_lossy().to_string(),
        )
        .unwrap();

        assert!(preview.is_binary);
        assert_eq!(preview.content, "");
        remove_test_directory(workspace);
    }

    #[test]
    fn git_status_parser_covers_all_status_kinds() {
        let output = concat!(
            " M src/modified.ts\0",
            "M  src/staged.ts\0",
            "?? src/new.ts\0",
            "D  src/deleted.ts\0",
            "R  src/renamed.ts\0src/old.ts\0",
            "C  src/copied.ts\0src/source.ts\0",
            "UU src/conflict.ts\0"
        );

        let parsed = parse_git_status_porcelain(output).unwrap();
        let kinds: Vec<_> = parsed
            .iter()
            .map(|status| {
                (
                    status.path.as_str(),
                    git_status_kind(status.index_status, status.worktree_status),
                    git_status_badge(status.index_status, status.worktree_status),
                    status.old_path.as_deref(),
                )
            })
            .collect();

        assert_eq!(
            kinds,
            vec![
                ("src/modified.ts", "modified", "M", None),
                ("src/staged.ts", "modified", "M", None),
                ("src/new.ts", "untracked", "U", None),
                ("src/deleted.ts", "deleted", "D", None),
                ("src/renamed.ts", "renamed", "R", Some("src/old.ts")),
                ("src/copied.ts", "copied", "C", Some("src/source.ts")),
                ("src/conflict.ts", "conflicted", "U", None),
            ]
        );
    }

    #[test]
    fn workspace_git_status_accepts_untracked_directories_in_an_unborn_repository() {
        let workspace = git_test_directory("git-status-untracked-directories");
        fs::create_dir_all(workspace.join("src")).unwrap();
        fs::create_dir_all(workspace.join("dist")).unwrap();
        fs::write(workspace.join("src/main.ts"), "console.log('snake');\n").unwrap();
        fs::write(workspace.join("dist/index.js"), "console.log('built');\n").unwrap();

        let snapshot =
            list_workspace_git_status_blocking(workspace.to_string_lossy().to_string()).unwrap();
        let paths = snapshot
            .files
            .iter()
            .map(|file| file.relative_path.as_str())
            .collect::<Vec<_>>();

        assert_eq!(paths, vec!["dist", "src"]);
        assert!(snapshot
            .files
            .iter()
            .all(|file| file.status_kind == "untracked" && file.badge == "U"));
        remove_test_directory(workspace);
    }

    #[test]
    fn git_numstat_parser_sums_text_changes_and_skips_binary_rows() {
        let output = concat!(
            "12\t4\tsrc/App.tsx\n",
            "-\t-\tassets/image.png\n",
            "3\t0\tsrc/New.ts\n"
        );

        assert_eq!(parse_git_numstat_totals(output), (15, 4));
    }

    #[test]
    fn git_diff_rejects_paths_outside_workspace() {
        let workspace = git_test_directory("git-diff-rejects");
        let outside = test_directory("git-diff-rejects-outside");
        let outside_file = outside.join("secret.txt");
        fs::write(&outside_file, b"secret").unwrap();

        let result = read_workspace_git_diff_blocking(
            workspace.to_string_lossy().to_string(),
            outside_file.to_string_lossy().to_string(),
        );

        assert!(result.unwrap_err().contains("outside the workspace"));
        remove_test_directory(workspace);
        remove_test_directory(outside);
    }

    #[cfg(unix)]
    #[test]
    fn git_diff_rejects_missing_paths_through_symlinks() {
        use std::os::unix::fs::symlink;

        let workspace = git_test_directory("git-diff-symlink-rejects");
        let outside = test_directory("git-diff-symlink-outside");
        symlink(&outside, workspace.join("linked")).unwrap();

        let result = read_workspace_git_diff_blocking(
            workspace.to_string_lossy().to_string(),
            workspace
                .join("linked/missing.txt")
                .to_string_lossy()
                .to_string(),
        );

        assert!(result.unwrap_err().contains("outside the workspace"));
        remove_test_directory(workspace);
        remove_test_directory(outside);
    }

    #[test]
    fn git_diff_returns_staged_and_unstaged_sections() {
        let workspace = git_test_directory("git-diff-staged-unstaged");
        let file = workspace.join("app.ts");
        fs::write(&file, "const value = 1;\n").unwrap();
        git(&workspace, &["add", "app.ts"]);
        git(&workspace, &["commit", "-m", "initial"]);

        fs::write(&file, "const value = 2;\n").unwrap();
        git(&workspace, &["add", "app.ts"]);
        fs::write(&file, "const value = 3;\n").unwrap();

        let diff = read_workspace_git_diff_blocking(
            workspace.to_string_lossy().to_string(),
            file.to_string_lossy().to_string(),
        )
        .unwrap();
        let kinds: Vec<_> = diff.sections.iter().map(|section| section.kind.as_str()).collect();

        assert_eq!(kinds, vec!["staged", "unstaged"]);
        assert!(diff.sections[0].base_content.contains("const value = 1;"));
        assert!(diff.sections[0].head_content.contains("const value = 2;"));
        assert!(diff.sections[0].content.contains("const value = 2;"));
        assert!(diff.sections[1].base_content.contains("const value = 2;"));
        assert!(diff.sections[1].head_content.contains("const value = 3;"));
        assert!(diff.sections[1].content.contains("const value = 3;"));
        remove_test_directory(workspace);
    }

    #[test]
    fn git_diff_synthesizes_untracked_file_diff() {
        let workspace = git_test_directory("git-diff-untracked");
        let file = workspace.join("new.ts");
        fs::write(&file, "export const value = 1;\n").unwrap();

        let diff = read_workspace_git_diff_blocking(
            workspace.to_string_lossy().to_string(),
            file.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(diff.sections[0].kind, "untracked");
        assert!(diff.sections[0].base_content.is_empty());
        assert!(diff.sections[0].head_content.contains("export const value = 1;"));
        assert!(diff.sections[0].content.contains("new file mode"));
        assert!(diff.sections[0].content.contains("+export const value = 1;"));
        remove_test_directory(workspace);
    }

    #[test]
    fn git_diff_returns_deleted_file_diff() {
        let workspace = git_test_directory("git-diff-deleted");
        let file = workspace.join("deleted.ts");
        fs::write(&file, "export const value = 1;\n").unwrap();
        git(&workspace, &["add", "deleted.ts"]);
        git(&workspace, &["commit", "-m", "initial"]);
        fs::remove_file(&file).unwrap();

        let diff = read_workspace_git_diff_blocking(
            workspace.to_string_lossy().to_string(),
            file.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(diff.sections[0].kind, "unstaged");
        assert!(diff.sections[0].base_content.contains("export const value = 1;"));
        assert!(diff.sections[0].head_content.is_empty());
        assert!(diff.sections[0].content.contains("deleted file mode"));
        remove_test_directory(workspace);
    }

    #[test]
    fn git_diff_returns_deleted_file_diff_when_parent_directory_is_missing() {
        let workspace = git_test_directory("git-diff-deleted-directory");
        let directory = workspace.join("src");
        let file = directory.join("deleted.ts");
        fs::create_dir_all(&directory).unwrap();
        fs::write(&file, "export const value = 1;\n").unwrap();
        git(&workspace, &["add", "src/deleted.ts"]);
        git(&workspace, &["commit", "-m", "initial"]);
        fs::remove_dir_all(&directory).unwrap();

        let diff = read_workspace_git_diff_blocking(
            workspace.to_string_lossy().to_string(),
            file.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(diff.sections[0].kind, "unstaged");
        assert!(diff.sections[0].base_content.contains("export const value = 1;"));
        assert!(diff.sections[0].head_content.is_empty());
        assert!(diff.sections[0].content.contains("deleted file mode"));
        remove_test_directory(workspace);
    }

    #[test]
    fn git_diff_returns_full_contents_for_staged_renamed_files() {
        let workspace = git_test_directory("git-diff-renamed");
        let old_file = workspace.join("old.ts");
        let new_file = workspace.join("new.ts");
        fs::write(&old_file, "export const keep = true;\nexport const value = 1;\n").unwrap();
        git(&workspace, &["add", "old.ts"]);
        git(&workspace, &["commit", "-m", "initial"]);
        git(&workspace, &["mv", "old.ts", "new.ts"]);
        fs::write(&new_file, "export const keep = true;\nexport const value = 2;\n").unwrap();
        git(&workspace, &["add", "new.ts"]);

        let diff = read_workspace_git_diff_blocking(
            workspace.to_string_lossy().to_string(),
            new_file.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(diff.sections[0].kind, "staged");
        assert!(diff.sections[0].base_label.contains("old.ts"));
        assert!(diff.sections[0].base_content.contains("export const value = 1;"));
        assert!(diff.sections[0].head_content.contains("export const value = 2;"));
        remove_test_directory(workspace);
    }

    #[test]
    fn git_diff_returns_full_contents_for_staged_copied_files() {
        let workspace = git_test_directory("git-diff-copied");
        let source_file = workspace.join("source.ts");
        let copy_file = workspace.join("copy.ts");
        fs::write(&source_file, "export const value = 1;\n").unwrap();
        git(&workspace, &["add", "source.ts"]);
        git(&workspace, &["commit", "-m", "initial"]);
        fs::copy(&source_file, &copy_file).unwrap();
        git(&workspace, &["add", "copy.ts"]);

        let diff = read_workspace_git_diff_blocking(
            workspace.to_string_lossy().to_string(),
            copy_file.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(diff.sections[0].kind, "staged");
        assert!(diff.sections[0].base_content.is_empty());
        assert!(diff.sections[0].head_content.contains("export const value = 1;"));
        remove_test_directory(workspace);
    }

    #[test]
    fn git_diff_marks_tracked_binary_files() {
        let workspace = git_test_directory("git-diff-binary");
        let file = workspace.join("asset.bin");
        fs::write(&file, b"before\0content").unwrap();
        git(&workspace, &["add", "asset.bin"]);
        git(&workspace, &["commit", "-m", "initial"]);
        fs::write(&file, b"after\0content").unwrap();

        let diff = read_workspace_git_diff_blocking(
            workspace.to_string_lossy().to_string(),
            file.to_string_lossy().to_string(),
        )
        .unwrap();

        assert_eq!(diff.sections[0].kind, "unstaged");
        assert!(diff.sections[0].is_binary);
        remove_test_directory(workspace);
    }

    #[test]
    fn commit_workspace_changes_rejects_empty_message() {
        let workspace = git_test_directory("git-commit-empty-message");
        fs::write(workspace.join("app.ts"), "export const value = 1;\n").unwrap();

        let result = commit_workspace_changes_blocking(
            workspace.to_string_lossy().to_string(),
            "   ".to_string(),
            Some(true),
        );

        assert!(result.unwrap_err().contains("commit message"));
        remove_test_directory(workspace);
    }

    #[test]
    fn commit_workspace_changes_rejects_clean_workspace() {
        let workspace = git_test_directory("git-commit-clean");

        let result = commit_workspace_changes_blocking(
            workspace.to_string_lossy().to_string(),
            "Update workspace".to_string(),
            Some(true),
        );

        assert!(result.unwrap_err().contains("No workspace changes"));
        remove_test_directory(workspace);
    }

    #[test]
    fn commit_workspace_changes_stages_and_commits_all_changes() {
        let workspace = git_test_directory("git-commit-all");
        fs::write(workspace.join("app.ts"), "export const value = 1;\n").unwrap();

        let result = commit_workspace_changes_blocking(
            workspace.to_string_lossy().to_string(),
            "Add app source".to_string(),
            Some(true),
        )
        .unwrap();

        let status = Command::new("git")
            .arg("-C")
            .arg(&workspace)
            .args(["status", "--porcelain"])
            .output()
            .expect("read git status");
        let log = Command::new("git")
            .arg("-C")
            .arg(&workspace)
            .args(["log", "-1", "--pretty=%s"])
            .output()
            .expect("read git log");

        assert_eq!(result.branch.as_deref(), current_git_branch(&workspace).as_deref());
        assert!(status.status.success());
        assert!(String::from_utf8_lossy(&status.stdout).trim().is_empty());
        assert_eq!(String::from_utf8_lossy(&log.stdout).trim(), "Add app source");
        remove_test_directory(workspace);
    }

    #[test]
    fn commit_workspace_changes_can_commit_only_staged_changes() {
        let workspace = git_test_directory("git-commit-staged-only");
        let app_file = workspace.join("app.ts");
        fs::write(&app_file, "export const value = 1;\n").unwrap();
        git(&workspace, &["add", "app.ts"]);
        git(&workspace, &["commit", "-m", "initial"]);
        fs::write(&app_file, "export const value = 2;\n").unwrap();
        git(&workspace, &["add", "app.ts"]);
        fs::write(&app_file, "export const value = 3;\n").unwrap();

        let result = commit_workspace_changes_blocking(
            workspace.to_string_lossy().to_string(),
            "Add staged app source".to_string(),
            Some(false),
        )
        .unwrap();

        let status = Command::new("git")
            .arg("-C")
            .arg(&workspace)
            .args(["status", "--porcelain"])
            .output()
            .expect("read git status");
        let committed_app = Command::new("git")
            .arg("-C")
            .arg(&workspace)
            .args(["show", "HEAD:app.ts"])
            .output()
            .expect("read committed app source");
        let log = Command::new("git")
            .arg("-C")
            .arg(&workspace)
            .args(["log", "-1", "--pretty=%s"])
            .output()
            .expect("read git log");

        assert_eq!(result.branch.as_deref(), current_git_branch(&workspace).as_deref());
        assert!(String::from_utf8_lossy(&status.stdout).contains(" M app.ts"));
        assert_eq!(
            String::from_utf8_lossy(&committed_app.stdout),
            "export const value = 2;\n"
        );
        assert_eq!(
            fs::read_to_string(app_file).unwrap(),
            "export const value = 3;\n"
        );
        assert_eq!(
            String::from_utf8_lossy(&log.stdout).trim(),
            "Add staged app source"
        );
        remove_test_directory(workspace);
    }

    #[test]
    fn sanitize_commit_subject_returns_single_clean_line() {
        assert_eq!(
            sanitize_commit_subject("thinking...\nCommit message: `Improve commit dialog controls`\n")
                .as_deref(),
            Some("Improve commit dialog controls")
        );
        assert_eq!(
            sanitize_commit_subject("Improve commit dialog controls (5 modified)").as_deref(),
            Some("Improve commit dialog controls")
        );
        assert_eq!(
            sanitize_commit_subject("Update app workflow (2 modified, 1 added)").as_deref(),
            Some("Update app workflow")
        );
        assert_eq!(sanitize_commit_subject("   ").as_deref(), None);
    }

    #[test]
    fn generic_commit_subject_detection_rejects_area_only_messages() {
        assert!(is_generic_commit_subject("Update desktop app workflow"));
        assert!(is_generic_commit_subject("Update React app"));
        assert!(is_generic_commit_subject("Improve app styling"));
        assert!(is_generic_commit_subject(
            "Refine Tauri bridge and app styling"
        ));
        assert!(is_generic_commit_subject(
            "Refine app styling and app shell"
        ));
        assert!(is_generic_commit_subject("Update App.css"));
        assert!(is_generic_commit_subject("Refine desktop app integration"));
        assert!(is_generic_commit_subject(
            "Improve commit message generation"
        ));
        assert!(is_generic_commit_subject("Update Git workflow"));
        assert!(!is_generic_commit_subject(
            "Fix inline context file label spacing"
        ));
        assert!(!is_generic_commit_subject(
            "Refine transcript auto-scroll behavior"
        ));
        assert!(!is_generic_commit_subject(
            "Make staged-only commits respect the checkbox"
        ));
    }

    #[test]
    fn commit_message_prompt_names_rejected_generic_subject() {
        let prompt = commit_message_generation_prompt(
            "M src/App.tsx\nM src-tauri/src/lib.rs",
            None,
            Some("Update desktop app workflow"),
        );

        assert!(prompt.contains("Update desktop app workflow"));
        assert!(prompt.contains("names the exact user-facing behavior"));
        assert!(prompt.contains("Fix inline context file label spacing"));
    }

    #[test]
    fn commit_message_prompt_prioritizes_intent_before_git_context() {
        let prompt = commit_message_generation_prompt(
            "M src/App.css",
            Some("Keep header controls on one row at smaller widths"),
            None,
        );

        assert!(prompt.contains("Intent:\nKeep header controls on one row"));
        assert!(prompt.contains("source of truth"));
        assert!(prompt.contains("infer the user's intent from the actual diff hunks"));
        assert!(prompt.contains("Prefer the behavioral outcome"));
        assert!(prompt.contains("Refine Tauri bridge and app styling"));
        assert!(
            prompt.find("Intent:").unwrap() < prompt.find("Git context:").unwrap()
        );
    }

    #[test]
    fn local_commit_subject_uses_intent_when_available() {
        assert_eq!(
            local_commit_subject_from_context(
                "M src/App.css",
                Some("Goal: keep header controls on one row at smaller widths"),
            ),
            "Keep header controls on one row at smaller widths"
        );
    }

    #[test]
    fn local_commit_subject_infers_commit_push_feedback_from_diff() {
        let context = r#"## Working tree diff
diff --git a/src/App.tsx b/src/App.tsx
+    setCommitDialogMessage("Generating an intent-driven commit message...");
+  it("generates a message before committing and pushing when the message is blank", async () => {
+    expect(mocks.pushWorkspaceBranchMock).toHaveBeenCalledWith(workspace.path);
+  });
+  <p className="git-action-feedback" role="status">
"#;

        assert_eq!(
            local_commit_subject_from_context(context, None),
            "Generate intent-driven messages before commit and push"
        );
    }

    #[test]
    fn commit_subject_with_intent_rejects_file_only_subjects() {
        assert!(commit_subject_ignores_intent(
            "Update App.css",
            Some("Keep header controls on one row")
        ));
        assert!(commit_subject_ignores_intent(
            "Update app styling",
            Some("Keep header controls on one row")
        ));
        assert!(!commit_subject_ignores_intent("Update App.css", None));
        assert!(!commit_subject_ignores_intent(
            "Keep header controls on one row",
            Some("Keep header controls on one row")
        ));
    }

    #[test]
    fn push_workspace_branch_reports_missing_remote() {
        let workspace = git_test_directory("git-push-no-remote");
        fs::write(workspace.join("app.ts"), "export const value = 1;\n").unwrap();
        git(&workspace, &["add", "app.ts"]);
        git(&workspace, &["commit", "-m", "initial"]);

        let result = push_workspace_branch_blocking(workspace.to_string_lossy().to_string());

        assert!(result.unwrap_err().contains("No upstream branch or origin"));
        remove_test_directory(workspace);
    }

    #[test]
    fn push_workspace_branch_uses_origin_fallback_without_upstream() {
        let workspace = git_test_directory("git-push-origin");
        let origin = test_directory("git-push-origin-bare");
        git(&origin, &["init", "--bare"]);
        fs::write(workspace.join("app.ts"), "export const value = 1;\n").unwrap();
        git(&workspace, &["add", "app.ts"]);
        git(&workspace, &["commit", "-m", "initial"]);
        git(&workspace, &["remote", "add", "origin", origin.to_string_lossy().as_ref()]);

        let result =
            push_workspace_branch_blocking(workspace.to_string_lossy().to_string()).unwrap();
        let upstream = Command::new("git")
            .arg("-C")
            .arg(&workspace)
            .args(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
            .output()
            .expect("read git upstream");

        assert_eq!(result.branch.as_deref(), current_git_branch(&workspace).as_deref());
        assert!(upstream.status.success());
        assert!(String::from_utf8_lossy(&upstream.stdout).contains("origin/"));
        remove_test_directory(workspace);
        remove_test_directory(origin);
    }

    fn git_test_directory(name: &str) -> PathBuf {
        let workspace = test_directory(name);
        git(&workspace, &["init"]);
        git(&workspace, &["config", "user.email", "test@example.com"]);
        git(&workspace, &["config", "user.name", "Orchestrator Test"]);
        workspace
    }

    fn git(workspace: &Path, args: &[&str]) {
        let output = Command::new("git")
            .arg("-C")
            .arg(workspace)
            .args(args)
            .output()
            .expect("run git");
        assert!(
            output.status.success(),
            "git {:?} failed: {}{}",
            args,
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn test_directory(name: &str) -> PathBuf {
        let directory = env::temp_dir().join(format!(
            "orchestrator-{name}-{}-{}",
            std::process::id(),
            next_test_id()
        ));
        fs::create_dir_all(&directory).expect("create test directory");
        directory
    }

    fn remove_test_directory(directory: PathBuf) {
        fs::remove_dir_all(directory).expect("remove test directory");
    }

    fn next_test_id() -> u64 {
        static NEXT_TEST_ID: AtomicU64 = AtomicU64::new(1);
        NEXT_TEST_ID.fetch_add(1, Ordering::Relaxed)
    }
}
