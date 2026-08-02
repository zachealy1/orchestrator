use super::*;
use sqlx::{pool::PoolConnection, sqlite::SqlitePoolOptions, Sqlite, SqlitePool};

#[derive(Clone)]
pub(crate) struct DatabaseState {
    pool: SqlitePool,
}

impl DatabaseState {
    pub(crate) async fn connect(app: &AppHandle) -> Result<Self, String> {
        let database_path = app
            .path()
            .app_config_dir()
            .map_err(|_| "The application database is unavailable.".to_string())?
            .join(
                DATABASE_URL
                    .strip_prefix("sqlite:")
                    .ok_or_else(|| "The application database is unavailable.".to_string())?,
            );
        let options = SqliteConnectOptions::new()
            .filename(database_path)
            .create_if_missing(false)
            .foreign_keys(true)
            .busy_timeout(Duration::from_secs(10));
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await
            .map_err(|_| "The application database is unavailable.".to_string())?;
        Ok(Self { pool })
    }

    pub(crate) async fn acquire(&self) -> Result<PoolConnection<Sqlite>, String> {
        self.pool
            .acquire()
            .await
            .map_err(|_| "The application database is unavailable.".to_string())
    }
}

pub(crate) fn extend_stable_fingerprint(hash: &mut u64, value: &[u8]) {
    for byte in (value.len() as u64).to_le_bytes() {
        *hash ^= u64::from(byte);
        *hash = hash.wrapping_mul(0x100000001b3);
    }
    for byte in value {
        *hash ^= u64::from(*byte);
        *hash = hash.wrapping_mul(0x100000001b3);
    }
}

pub(crate) fn prompt_queue_status_paths(status: &str) -> Vec<String> {
    let mut records = status.split('\0').filter(|record| !record.is_empty());
    let mut paths = Vec::new();

    while let Some(record) = records.next() {
        let bytes = record.as_bytes();
        if bytes.len() < 4 || bytes[2] != b' ' {
            continue;
        }

        if let Some(path) = record.get(3..) {
            paths.push(path.to_string());
        }
        if matches!(bytes[0], b'R' | b'C') || matches!(bytes[1], b'R' | b'C') {
            if let Some(previous_path) = records.next() {
                paths.push(previous_path.to_string());
            }
        }
    }

    paths.sort();
    paths.dedup();
    paths
}

pub(crate) fn extend_prompt_queue_file_fingerprint(
    hash: &mut u64,
    git_root: &Path,
    relative_path: &str,
) {
    extend_stable_fingerprint(hash, relative_path.as_bytes());
    let path = git_root.join(relative_path);
    let Ok(metadata) = fs::symlink_metadata(&path) else {
        extend_stable_fingerprint(hash, b"missing");
        return;
    };

    if metadata.file_type().is_symlink() {
        match fs::read_link(&path) {
            Ok(target) => {
                extend_stable_fingerprint(hash, b"symlink");
                extend_stable_fingerprint(hash, target.to_string_lossy().as_bytes());
            }
            Err(error) => {
                extend_stable_fingerprint(hash, b"unreadable-symlink");
                extend_stable_fingerprint(hash, error.kind().to_string().as_bytes());
            }
        }
        return;
    }

    if !metadata.is_file() {
        extend_stable_fingerprint(hash, b"not-file");
        return;
    }

    extend_stable_fingerprint(hash, b"file");
    extend_stable_fingerprint(hash, &metadata.len().to_le_bytes());
    let Ok(canonical_path) = fs::canonicalize(&path) else {
        extend_stable_fingerprint(hash, b"uncanonicalized");
        return;
    };
    if !canonical_path.starts_with(git_root) {
        extend_stable_fingerprint(hash, b"outside-git-root");
        return;
    }

    let Ok(file) = fs::File::open(&canonical_path) else {
        extend_stable_fingerprint(hash, b"unreadable");
        return;
    };
    let mut reader = BufReader::new(file);
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => extend_stable_fingerprint(hash, &buffer[..read]),
            Err(error) => {
                extend_stable_fingerprint(hash, b"read-error");
                extend_stable_fingerprint(hash, error.kind().to_string().as_bytes());
                break;
            }
        }
    }
}

#[cfg(test)]
pub(crate) fn prompt_queue_worktree_fingerprint(git_root: &Path, pathspec: &str) -> Option<String> {
    prompt_queue_worktree_fingerprint_for_pathspecs(git_root, &[pathspec.to_string()])
}

pub(crate) fn prompt_queue_worktree_fingerprint_for_pathspecs(
    git_root: &Path,
    pathspecs: &[String],
) -> Option<String> {
    let status = git_status_for_pathspecs(git_root, pathspecs);
    if !status.ok {
        return None;
    }
    let git_root_arg = git_root.to_string_lossy();
    let mut index_args = vec![
        "-C",
        git_root_arg.as_ref(),
        "ls-files",
        "--stage",
        "-z",
        "--",
    ];
    index_args.extend(pathspecs.iter().map(String::as_str));
    let index = run_command_bytes("git", &index_args);
    if !index.ok {
        return None;
    }

    let mut hash = 0xcbf29ce484222325_u64;
    extend_stable_fingerprint(&mut hash, b"status");
    extend_stable_fingerprint(&mut hash, status.stdout.as_bytes());
    extend_stable_fingerprint(&mut hash, b"index");
    extend_stable_fingerprint(&mut hash, &index.stdout);
    for path in prompt_queue_status_paths(&status.stdout) {
        extend_prompt_queue_file_fingerprint(&mut hash, git_root, &path);
    }
    Some(format!("{hash:016x}"))
}

pub(crate) fn validate_create_chat_with_queued_prompt_request(
    request: &CreateChatWithQueuedPromptRequest,
) -> Result<(Value, Value), String> {
    if request.workspace_id <= 0 {
        return Err("The queued prompt has an invalid workspace.".to_string());
    }
    if request.account_id.is_some_and(|account_id| account_id <= 0) {
        return Err("The queued prompt has an invalid account.".to_string());
    }
    if request.status != "queued" {
        return Err("The queued conversation has an invalid status.".to_string());
    }
    if request.item_id.trim().is_empty()
        || request.item_id.len() > 200
        || request.client_message_id.trim().is_empty()
        || request.client_message_id.len() > 200
    {
        return Err("The queued prompt has an invalid identifier.".to_string());
    }
    if request.prompt.trim().is_empty() {
        return Err("Write a prompt before adding it to the queue.".to_string());
    }
    if request.prompt.chars().count() > MAX_PROMPT_QUEUE_PROMPT_CHARS {
        return Err(format!(
            "Queued prompts are limited to {MAX_PROMPT_QUEUE_PROMPT_CHARS} characters."
        ));
    }
    if request.conversation_revision < 0 {
        return Err("The queued prompt has an invalid conversation revision.".to_string());
    }
    if request.execution_snapshot_json.len() > MAX_PROMPT_QUEUE_SNAPSHOT_BYTES
        || request.context_fingerprint_json.len() > MAX_PROMPT_QUEUE_SNAPSHOT_BYTES
    {
        return Err("The queued prompt settings are too large.".to_string());
    }

    let snapshot: Value = serde_json::from_str(&request.execution_snapshot_json)
        .map_err(|_| "The queued prompt settings are invalid.".to_string())?;
    let fingerprint: Value = serde_json::from_str(&request.context_fingerprint_json)
        .map_err(|_| "The queued prompt context is invalid.".to_string())?;
    if !snapshot.is_object() || !fingerprint.is_object() {
        return Err("The queued prompt settings are invalid.".to_string());
    }
    if snapshot.get("prompt").and_then(Value::as_str) != Some(request.prompt.as_str())
        || snapshot.get("contextFingerprint") != Some(&fingerprint)
        || fingerprint
            .get("conversationRevision")
            .and_then(Value::as_i64)
            != Some(request.conversation_revision)
    {
        return Err("The queued prompt settings do not match the prompt context.".to_string());
    }

    Ok((snapshot, fingerprint))
}

pub(crate) async fn create_chat_with_queued_prompt_transaction(
    connection: &mut SqliteConnection,
    request: &CreateChatWithQueuedPromptRequest,
) -> Result<i64, String> {
    validate_create_chat_with_queued_prompt_request(request)?;

    let fallback_title = {
        let title = request.title.trim();
        if title.is_empty() {
            "Untitled conversation"
        } else {
            title
        }
    };
    let title = if request.generate_title {
        "Generating title..."
    } else {
        fallback_title
    };
    let profile_key = request
        .account_id
        .map(|account_id| format!("account:{account_id}"));
    let title_generation_state = if request.generate_title {
        "pending"
    } else {
        "complete"
    };
    let title_fallback = request.generate_title.then_some(fallback_title);

    let mut transaction = connection
        .begin()
        .await
        .map_err(|_| "The queued conversation could not be created.".to_string())?;
    let chat_result = sqlx::query(
        "INSERT INTO chats (
            workspace_id, account_id, title, status, origin, profile_key,
            title_generation_state, title_fallback
         )
         VALUES (?1, ?2, ?3, ?4, 'orchestrator', ?5, ?6, ?7)",
    )
    .bind(request.workspace_id)
    .bind(request.account_id)
    .bind(title)
    .bind(&request.status)
    .bind(profile_key)
    .bind(title_generation_state)
    .bind(title_fallback)
    .execute(&mut *transaction)
    .await
    .map_err(|_| "The queued conversation could not be created.".to_string())?;
    let chat_id = chat_result.last_insert_rowid();
    if chat_id <= 0 {
        return Err("The queued conversation could not be created.".to_string());
    }

    let queue_result = sqlx::query(
        "INSERT INTO prompt_queue_items (
            id, client_message_id, workspace_id, chat_id, position,
            prompt_text, execution_snapshot_json, context_fingerprint_json,
            conversation_revision, status
         )
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8, 'queued')",
    )
    .bind(&request.item_id)
    .bind(&request.client_message_id)
    .bind(request.workspace_id)
    .bind(chat_id)
    .bind(&request.prompt)
    .bind(&request.execution_snapshot_json)
    .bind(&request.context_fingerprint_json)
    .bind(request.conversation_revision)
    .execute(&mut *transaction)
    .await
    .map_err(|_| "The prompt was not added to the queue.".to_string())?;
    if queue_result.rows_affected() != 1 {
        return Err("The prompt was not added to the queue.".to_string());
    }

    transaction
        .commit()
        .await
        .map_err(|_| "The queued conversation could not be saved.".to_string())?;
    Ok(chat_id)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn create_chat_with_queued_prompt(
    request: CreateChatWithQueuedPromptRequest,
    database: State<'_, DatabaseState>,
) -> Result<CreateChatWithQueuedPromptResult, String> {
    let mut connection = database
        .pool
        .acquire()
        .await
        .map_err(|_| "The application database is unavailable.".to_string())?;
    let chat_id = create_chat_with_queued_prompt_transaction(&mut connection, &request).await?;
    Ok(CreateChatWithQueuedPromptResult { chat_id })
}

pub(crate) async fn append_run_events_in_transaction(
    connection: &mut SqliteConnection,
    events: &[RunEventWrite],
) -> Result<(), String> {
    if events.is_empty() {
        return Ok(());
    }
    if events.len() > 1_000 {
        return Err("Too many run events were submitted at once.".to_string());
    }

    let mut transaction = connection
        .begin()
        .await
        .map_err(|_| "The run events could not be saved.".to_string())?;
    for event in events {
        if event.run_id <= 0
            || event.sequence < 0
            || !matches!(
                event.event_type.as_str(),
                "notification" | "server-request" | "process" | "client-action"
            )
        {
            return Err("The run event is invalid.".to_string());
        }
        let payload_json = serde_json::to_string(&event.payload.0)
            .map_err(|_| "The run event is invalid.".to_string())?;
        sqlx::query(
            "INSERT INTO run_events (run_id, sequence, event_type, method, payload_json)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(event.run_id)
        .bind(event.sequence)
        .bind(&event.event_type)
        .bind(&event.method)
        .bind(payload_json)
        .execute(&mut *transaction)
        .await
        .map_err(|_| "The run events could not be saved.".to_string())?;
    }

    transaction
        .commit()
        .await
        .map_err(|_| "The run events could not be saved.".to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn append_run_events_transaction(
    events: Vec<RunEventWrite>,
    database: State<'_, DatabaseState>,
) -> Result<(), String> {
    let mut connection = database
        .pool
        .acquire()
        .await
        .map_err(|_| "The application database is unavailable.".to_string())?;
    append_run_events_in_transaction(&mut connection, &events).await
}

fn require_one_row(rows_affected: u64, message: &str) -> Result<(), String> {
    if rows_affected == 1 {
        Ok(())
    } else {
        Err(message.to_string())
    }
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn soft_delete_workspace_transaction(
    workspace_id: i64,
    database: State<'_, DatabaseState>,
) -> Result<(), String> {
    let mut transaction = database
        .pool
        .begin()
        .await
        .map_err(|_| "The workspace could not be removed.".to_string())?;
    sqlx::query("DELETE FROM prompt_queue_items WHERE workspace_id = ?1")
        .bind(workspace_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| "The workspace queue could not be cleared.".to_string())?;
    let result = sqlx::query(
        "UPDATE workspaces
         SET default_account_id = NULL, deleted_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND deleted_at IS NULL",
    )
    .bind(workspace_id)
    .execute(&mut *transaction)
    .await
    .map_err(|_| "The workspace could not be removed.".to_string())?;
    require_one_row(
        result.rows_affected(),
        "The workspace is no longer available.",
    )?;
    transaction
        .commit()
        .await
        .map_err(|_| "The workspace removal could not be saved.".to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn soft_delete_codex_account_transaction(
    account_id: i64,
    database: State<'_, DatabaseState>,
) -> Result<(), String> {
    let mut transaction = database
        .pool
        .begin()
        .await
        .map_err(|_| "The Codex account could not be removed.".to_string())?;
    sqlx::query("UPDATE workspaces SET default_account_id = NULL WHERE default_account_id = ?1")
        .bind(account_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| "Workspace account defaults could not be cleared.".to_string())?;
    let result = sqlx::query(
        "UPDATE codex_accounts
         SET status = 'signed_out', deleted_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND deleted_at IS NULL",
    )
    .bind(account_id)
    .execute(&mut *transaction)
    .await
    .map_err(|_| "The Codex account could not be removed.".to_string())?;
    require_one_row(
        result.rows_affected(),
        "The Codex account is no longer available.",
    )?;
    transaction
        .commit()
        .await
        .map_err(|_| "The account removal could not be saved.".to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn activate_external_transcript_snapshot_transaction(
    chat_id: i64,
    snapshot: ExternalTranscriptSnapshot,
    database: State<'_, DatabaseState>,
) -> Result<(), String> {
    if chat_id <= 0 || snapshot.turns.len() != snapshot.total_turns {
        return Err("External transcript snapshot is incomplete.".to_string());
    }

    let mut transaction = database
        .pool
        .begin()
        .await
        .map_err(|_| "The transcript snapshot could not be saved.".to_string())?;
    let active: Option<String> = sqlx::query_scalar(
        "SELECT source_version FROM external_chat_transcript_snapshots WHERE chat_id = ?1",
    )
    .bind(chat_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|_| "The transcript snapshot could not be read.".to_string())?;
    if active.as_deref() == Some(snapshot.source_version.as_str()) {
        transaction
            .rollback()
            .await
            .map_err(|_| "The transcript snapshot could not be closed.".to_string())?;
        return Ok(());
    }

    sqlx::query(
        "DELETE FROM external_chat_turn_summaries
         WHERE chat_id = ?1 AND source_version = ?2",
    )
    .bind(chat_id)
    .bind(&snapshot.source_version)
    .execute(&mut *transaction)
    .await
    .map_err(|_| "The previous transcript generation could not be cleared.".to_string())?;

    for turn in &snapshot.turns {
        sqlx::query(
            "INSERT INTO external_chat_turn_summaries (
               chat_id, source_version, slot_index, external_turn_id,
               prompt, final_message, error, status, started_at, completed_at,
               duration_ms, total_tokens, model_context_window
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        )
        .bind(chat_id)
        .bind(&snapshot.source_version)
        .bind(i64::try_from(turn.slot_index).map_err(|_| "Invalid transcript position.")?)
        .bind(&turn.turn_id)
        .bind(&turn.prompt)
        .bind(&turn.final_message)
        .bind(&turn.error)
        .bind(&turn.status)
        .bind(&turn.started_at)
        .bind(&turn.completed_at)
        .bind(turn.duration_ms)
        .bind(turn.total_tokens)
        .bind(turn.model_context_window)
        .execute(&mut *transaction)
        .await
        .map_err(|_| "A transcript turn could not be saved.".to_string())?;
    }

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM external_chat_turn_summaries
         WHERE chat_id = ?1 AND source_version = ?2",
    )
    .bind(chat_id)
    .bind(&snapshot.source_version)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|_| "The transcript snapshot could not be verified.".to_string())?;
    if usize::try_from(count).ok() != Some(snapshot.total_turns) {
        return Err("External transcript snapshot could not be verified.".to_string());
    }

    sqlx::query(
        "INSERT INTO external_chat_transcript_snapshots (
           chat_id, source_version, turn_count, synced_at
         ) VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
         ON CONFLICT(chat_id) DO UPDATE SET
           source_version = excluded.source_version,
           turn_count = excluded.turn_count,
           synced_at = CURRENT_TIMESTAMP",
    )
    .bind(chat_id)
    .bind(&snapshot.source_version)
    .bind(count)
    .execute(&mut *transaction)
    .await
    .map_err(|_| "The transcript snapshot could not be activated.".to_string())?;
    sqlx::query(
        "DELETE FROM external_chat_turn_summaries
         WHERE chat_id = ?1 AND source_version <> ?2",
    )
    .bind(chat_id)
    .bind(&snapshot.source_version)
    .execute(&mut *transaction)
    .await
    .map_err(|_| "Superseded transcript data could not be cleared.".to_string())?;
    transaction
        .commit()
        .await
        .map_err(|_| "The transcript snapshot could not be saved.".to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn delete_external_transcript_snapshots_transaction(
    chat_id: i64,
    database: State<'_, DatabaseState>,
) -> Result<(), String> {
    let mut transaction = database
        .pool
        .begin()
        .await
        .map_err(|_| "The transcript cache could not be cleared.".to_string())?;
    sqlx::query("DELETE FROM external_chat_transcript_snapshots WHERE chat_id = ?1")
        .bind(chat_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| "The transcript snapshot could not be cleared.".to_string())?;
    sqlx::query("DELETE FROM external_chat_turn_summaries WHERE chat_id = ?1")
        .bind(chat_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| "The transcript turns could not be cleared.".to_string())?;
    transaction
        .commit()
        .await
        .map_err(|_| "The transcript cache removal could not be saved.".to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn soft_delete_chat_transaction(
    chat_id: i64,
    database: State<'_, DatabaseState>,
) -> Result<(), String> {
    let mut transaction = database
        .pool
        .begin()
        .await
        .map_err(|_| "The chat could not be removed.".to_string())?;
    for table in [
        "prompt_queue_items",
        "external_chat_history_indexes",
        "external_chat_transcript_snapshots",
        "external_chat_turn_summaries",
    ] {
        let statement = format!("DELETE FROM {table} WHERE chat_id = ?1");
        sqlx::query(&statement)
            .bind(chat_id)
            .execute(&mut *transaction)
            .await
            .map_err(|_| "Related chat data could not be removed.".to_string())?;
    }
    let chat = sqlx::query(
        "UPDATE chats SET deleted_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND deleted_at IS NULL",
    )
    .bind(chat_id)
    .execute(&mut *transaction)
    .await
    .map_err(|_| "The chat could not be removed.".to_string())?;
    require_one_row(chat.rows_affected(), "The chat is no longer available.")?;
    sqlx::query(
        "UPDATE runs SET deleted_at = CURRENT_TIMESTAMP
         WHERE chat_id = ?1 AND deleted_at IS NULL",
    )
    .bind(chat_id)
    .execute(&mut *transaction)
    .await
    .map_err(|_| "Related runs could not be archived.".to_string())?;
    transaction
        .commit()
        .await
        .map_err(|_| "The chat removal could not be saved.".to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn reorder_prompt_queue_items_transaction(
    chat_id: i64,
    ordered_item_ids: Vec<String>,
    database: State<'_, DatabaseState>,
) -> Result<bool, String> {
    if chat_id <= 0 || ordered_item_ids.len() > 50 {
        return Ok(false);
    }
    if ordered_item_ids.is_empty() {
        return Ok(true);
    }
    let unique_ids: HashSet<&str> = ordered_item_ids.iter().map(String::as_str).collect();
    if unique_ids.len() != ordered_item_ids.len()
        || ordered_item_ids.iter().any(|item_id| item_id.is_empty())
    {
        return Ok(false);
    }

    let mut transaction = database
        .pool
        .begin()
        .await
        .map_err(|_| "The prompt queue could not be reordered.".to_string())?;
    let mut mutable_items = Vec::new();
    for (position, item_id) in ordered_item_ids.iter().enumerate() {
        let record: Option<(i64, String)> =
            sqlx::query_as("SELECT chat_id, status FROM prompt_queue_items WHERE id = ?1")
                .bind(item_id)
                .fetch_optional(&mut *transaction)
                .await
                .map_err(|_| "The prompt queue could not be read.".to_string())?;
        let Some((record_chat_id, status)) = record else {
            return Ok(false);
        };
        if record_chat_id != chat_id {
            return Ok(false);
        }
        if !matches!(
            status.as_str(),
            "starting" | "steering" | "active" | "completed" | "skipped"
        ) {
            mutable_items.push((item_id, position));
        }
    }

    for (item_id, position) in mutable_items {
        let result = sqlx::query(
            "UPDATE prompt_queue_items
             SET position = ?1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?2 AND chat_id = ?3
               AND status NOT IN ('starting', 'steering', 'active', 'completed', 'skipped')",
        )
        .bind(i64::try_from(position).map_err(|_| "Invalid queue position.")?)
        .bind(item_id)
        .bind(chat_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| "The prompt queue could not be reordered.".to_string())?;
        if result.rows_affected() != 1 {
            return Ok(false);
        }
    }
    transaction
        .commit()
        .await
        .map_err(|_| "The prompt queue reorder could not be saved.".to_string())?;
    Ok(true)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn advance_chat_conversation_revision_transaction(
    chat_id: i64,
    queue_owned: bool,
    database: State<'_, DatabaseState>,
) -> Result<i64, String> {
    let mut transaction = database
        .pool
        .begin()
        .await
        .map_err(|_| "The conversation revision could not be updated.".to_string())?;
    let revision: Option<i64> = sqlx::query_scalar(
        "UPDATE chats
         SET conversation_revision = conversation_revision + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND deleted_at IS NULL
         RETURNING conversation_revision",
    )
    .bind(chat_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|_| "The conversation revision could not be updated.".to_string())?;
    let revision = revision.ok_or_else(|| "The chat is no longer available.".to_string())?;
    if queue_owned {
        sqlx::query(
            "UPDATE prompt_queue_items
             SET conversation_revision = ?1, updated_at = CURRENT_TIMESTAMP
             WHERE chat_id = ?2 AND status IN ('queued', 'scheduled-next')",
        )
        .bind(revision)
        .bind(chat_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| "Queued prompt revisions could not be updated.".to_string())?;
    }
    transaction
        .commit()
        .await
        .map_err(|_| "The conversation revision could not be saved.".to_string())?;
    Ok(revision)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn recover_abandoned_runs_transaction(
    database: State<'_, DatabaseState>,
) -> Result<RecoveredRunCounts, String> {
    let mut transaction = database
        .pool
        .begin()
        .await
        .map_err(|_| "Interrupted work could not be recovered.".to_string())?;
    let runs = sqlx::query(
        "UPDATE runs SET status = 'interrupted'
         WHERE status IN ('starting', 'connecting', 'running') AND completed_at IS NULL",
    )
    .execute(&mut *transaction)
    .await
    .map_err(|_| "Interrupted runs could not be recovered.".to_string())?
    .rows_affected();
    let tasks = sqlx::query(
        "UPDATE tasks SET status = 'interrupted'
         WHERE status IN ('starting', 'connecting', 'running')",
    )
    .execute(&mut *transaction)
    .await
    .map_err(|_| "Interrupted tasks could not be recovered.".to_string())?
    .rows_affected();
    let chats = sqlx::query(
        "UPDATE chats SET status = 'interrupted'
         WHERE origin = 'orchestrator' AND deleted_at IS NULL
           AND status IN ('starting', 'connecting', 'running')",
    )
    .execute(&mut *transaction)
    .await
    .map_err(|_| "Interrupted chats could not be recovered.".to_string())?
    .rows_affected();
    transaction
        .commit()
        .await
        .map_err(|_| "Interrupted work recovery could not be saved.".to_string())?;
    Ok(RecoveredRunCounts { runs, tasks, chats })
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn save_preflight_report_transaction(
    workspace_id: i64,
    task_id: Option<i64>,
    report: PreflightReport,
    database: State<'_, DatabaseState>,
) -> Result<(), String> {
    let mut transaction = database
        .pool
        .begin()
        .await
        .map_err(|_| "The preflight report could not be saved.".to_string())?;
    if let Some(task_id) = task_id {
        sqlx::query("DELETE FROM preflight_results WHERE task_id = ?1")
            .bind(task_id)
            .execute(&mut *transaction)
            .await
            .map_err(|_| "Previous preflight checks could not be cleared.".to_string())?;
        sqlx::query("DELETE FROM recommendations WHERE task_id = ?1")
            .bind(task_id)
            .execute(&mut *transaction)
            .await
            .map_err(|_| "Previous recommendations could not be cleared.".to_string())?;
    }
    for check in report.checks {
        sqlx::query(
            "INSERT INTO preflight_results (
               task_id, workspace_id, check_id, label, status, message, detail
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(task_id)
        .bind(workspace_id)
        .bind(check.id)
        .bind(check.label)
        .bind(check.status)
        .bind(check.message)
        .bind(check.detail)
        .execute(&mut *transaction)
        .await
        .map_err(|_| "A preflight check could not be saved.".to_string())?;
    }
    for recommendation in report.recommendations {
        sqlx::query(
            "INSERT INTO recommendations (task_id, workspace_id, kind, title, body)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(task_id)
        .bind(workspace_id)
        .bind(recommendation.kind)
        .bind(recommendation.title)
        .bind(recommendation.body)
        .execute(&mut *transaction)
        .await
        .map_err(|_| "A recommendation could not be saved.".to_string())?;
    }
    transaction
        .commit()
        .await
        .map_err(|_| "The preflight report could not be saved.".to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn upsert_external_codex_chats_transaction(
    chats: Vec<ExternalCodexChatUpsert>,
    database: State<'_, DatabaseState>,
) -> Result<(), String> {
    if chats.len() > 10_000 {
        return Err("Too many external chats were returned.".to_string());
    }
    let mut transaction = database
        .pool
        .begin()
        .await
        .map_err(|_| "External chats could not be synchronized.".to_string())?;
    let fallback_now: String = sqlx::query_scalar("SELECT STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')")
        .fetch_one(&mut *transaction)
        .await
        .map_err(|_| "External chat synchronization time is unavailable.".to_string())?;
    for chat in chats {
        if chat.workspace_id <= 0
            || chat.profile_key != DEFAULT_CODEX_PROFILE_KEY
            || chat.external_thread_id.trim().is_empty()
        {
            return Err("An external chat record is invalid.".to_string());
        }
        let existing: Option<(
            i64,
            Option<i64>,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
        )> = sqlx::query_as(
            "SELECT id, account_id, profile_key, sync_status,
                        external_created_at, external_updated_at
                 FROM chats
                 WHERE origin = 'codex_external' AND external_thread_id = ?1
                 LIMIT 1",
        )
        .bind(&chat.external_thread_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|_| "External chat state could not be read.".to_string())?;
        let title = if chat.title.trim().is_empty() {
            "Untitled Codex chat".to_string()
        } else {
            chat.title.trim().to_string()
        };
        let existing_created_at = existing.as_ref().and_then(|record| record.4.clone());
        let existing_updated_at = existing.as_ref().and_then(|record| record.5.clone());
        let created_at = chat
            .created_at
            .clone()
            .or(existing_created_at)
            .unwrap_or_else(|| fallback_now.clone());
        let updated_at = chat
            .updated_at
            .clone()
            .or(existing_updated_at.clone())
            .unwrap_or_else(|| created_at.clone());

        if let Some((id, account_id, profile_key, sync_status, _, previous_updated_at)) = existing {
            if sync_status.as_deref() == Some("adopted")
                || account_id.is_some()
                || profile_key.as_deref() != Some(chat.profile_key.as_str())
            {
                continue;
            }
            sqlx::query(
                "UPDATE chats
                 SET workspace_id = ?1, title = ?2, codex_thread_id = ?3, status = ?4,
                     source_kind = ?5, sync_status = 'synced', external_cwd = ?6,
                     external_created_at = ?7, external_updated_at = ?8, updated_at = ?8,
                     conversation_revision = conversation_revision + CASE
                       WHEN COALESCE(external_updated_at, '') <> COALESCE(?8, '') THEN 1 ELSE 0
                     END,
                     last_synced_at = CURRENT_TIMESTAMP
                 WHERE id = ?9",
            )
            .bind(chat.workspace_id)
            .bind(title)
            .bind(&chat.external_thread_id)
            .bind(chat.status)
            .bind(chat.source_kind)
            .bind(chat.cwd)
            .bind(created_at)
            .bind(&updated_at)
            .bind(id)
            .execute(&mut *transaction)
            .await
            .map_err(|_| "An external chat could not be updated.".to_string())?;
            if chat.updated_at.is_some() && chat.updated_at != previous_updated_at {
                sqlx::query(
                    "DELETE FROM external_chat_history_indexes
                     WHERE chat_id = ?1 AND source_version <> ?2",
                )
                .bind(id)
                .bind(updated_at)
                .execute(&mut *transaction)
                .await
                .map_err(|_| "Stale external chat history could not be cleared.".to_string())?;
            }
        } else {
            sqlx::query(
                "INSERT INTO chats (
                   workspace_id, account_id, title, codex_thread_id, status, origin,
                   profile_key, external_thread_id, source_kind, sync_status,
                   external_cwd, external_created_at, external_updated_at,
                   created_at, updated_at, last_synced_at
                 ) VALUES (?1, NULL, ?2, ?3, ?4, 'codex_external', ?5, ?3, ?6,
                   'synced', ?7, ?8, ?9, ?8, ?9, CURRENT_TIMESTAMP)",
            )
            .bind(chat.workspace_id)
            .bind(title)
            .bind(chat.external_thread_id)
            .bind(chat.status)
            .bind(chat.profile_key)
            .bind(chat.source_kind)
            .bind(chat.cwd)
            .bind(created_at)
            .bind(updated_at)
            .execute(&mut *transaction)
            .await
            .map_err(|_| "An external chat could not be added.".to_string())?;
        }
    }
    transaction
        .commit()
        .await
        .map_err(|_| "External chat synchronization could not be saved.".to_string())
}

pub(crate) fn inspect_prompt_queue_context_blocking(
    workspace_path: String,
    paths: Vec<String>,
) -> Result<PromptQueueContextInspection, String> {
    let workspace = canonical_workspace(&workspace_path)?;
    let workspace_display = workspace.to_string_lossy().to_string();
    let discovered_repositories = discover_git_repositories(&workspace, true)?.0;
    let repositories = discovered_repositories
        .iter()
        .map(|repository| {
            let git_root_arg = repository.root.to_string_lossy();
            let head = run_command("git", &["-C", git_root_arg.as_ref(), "rev-parse", "HEAD"]);
            let head_commit = head
                .ok
                .then(|| {
                    head.stdout
                        .lines()
                        .next()
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(str::to_string)
                })
                .flatten();
            let pathspecs = git_repository_pathspecs(repository, &discovered_repositories)
                .unwrap_or_else(|_| vec![".".to_string()]);
            PromptQueueRepositoryFingerprint {
                repository_path: Some(repository.public.root_path.clone()),
                branch: current_git_branch(&repository.root),
                head_commit,
                worktree_fingerprint: prompt_queue_worktree_fingerprint_for_pathspecs(
                    &repository.root,
                    &pathspecs,
                ),
            }
        })
        .collect();

    let files = paths
        .into_iter()
        .map(|original_path| {
            let source = PathBuf::from(&original_path);
            let canonical = fs::canonicalize(&source).ok();
            let metadata = canonical
                .as_ref()
                .and_then(|path| fs::metadata(path).ok())
                .filter(|metadata| metadata.is_file());
            let modified_at_ms = metadata
                .as_ref()
                .and_then(|metadata| metadata.modified().ok())
                .and_then(|modified| modified.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64);
            PromptQueueFileFingerprint {
                path: original_path,
                canonical_path: canonical
                    .as_ref()
                    .map(|path| path.to_string_lossy().to_string()),
                size: metadata.as_ref().map(|metadata| metadata.len()),
                modified_at_ms,
                available: metadata.is_some(),
            }
        })
        .collect();

    Ok(PromptQueueContextInspection {
        workspace_path: workspace_display,
        repositories,
        files,
    })
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn inspect_prompt_queue_context(
    workspace_path: String,
    paths: Vec<String>,
) -> Result<PromptQueueContextInspection, String> {
    run_blocking_command("inspect prompt queue context", move || {
        inspect_prompt_queue_context_blocking(workspace_path, paths)
    })
    .await
}

pub(crate) fn is_image_extension(path: &Path) -> bool {
    path.extension()
        .and_then(OsStr::to_str)
        .map(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "webp" | "gif"
            )
        })
        .unwrap_or(false)
}
