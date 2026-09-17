use crate::{
    git::generate_workspace_repository_commit_message_blocking,
    github_cli,
    kanban_git::{
        is_empty_root_commit, kanban_git_commit, kanban_git_status, KanbanGitBindingRequest,
        KanbanGitCommitRequest, KanbanGitRepositoryBinding,
    },
    models::WorkspaceCommitIntentContext,
    review_provider, DatabaseState,
};
use serde::Serialize;
use sqlx::{pool::PoolConnection, Row, Sqlite};
use std::{
    collections::HashSet,
    path::Path,
    process::{Command, Stdio},
};
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub(crate) struct ReviewState {
    locks:
        std::sync::Mutex<std::collections::HashMap<String, std::sync::Arc<tokio::sync::Mutex<()>>>>,
}
impl ReviewState {
    fn lock(&self, key: String) -> std::sync::Arc<tokio::sync::Mutex<()>> {
        self.locks.lock().unwrap().entry(key).or_default().clone()
    }
}

pub(crate) fn card_review_lock(
    app: &AppHandle,
    card_id: &str,
) -> std::sync::Arc<tokio::sync::Mutex<()>> {
    app.state::<ReviewState>().lock(format!("card:{card_id}"))
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KanbanPullRequestDto {
    pub provider: String,
    pub host: String,
    pub project_id: Option<i64>,
    pub project_path: Option<String>,
    pub source_repository_path: String,
    pub relative_path: String,
    pub owner: Option<String>,
    pub repository: Option<String>,
    pub number: Option<i64>,
    pub url: Option<String>,
    pub base_branch: String,
    pub head_branch: String,
    pub draft: bool,
    pub state: String,
    pub publication_status: String,
    pub error: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReviewPublicationResult {
    pub card_id: String,
    pub pull_requests: Vec<KanbanPullRequestDto>,
}

#[derive(Clone, Debug)]
struct PullRequestSyncTarget {
    id: i64,
    provider: String,
    host: String,
    project_id: Option<i64>,
    owner: String,
    repository: String,
    number: i64,
    draft: bool,
    state: String,
    publication_status: String,
    url: Option<String>,
    error: Option<String>,
}

const PULL_REQUEST_SYNC_CONCURRENCY: usize = 4;

#[derive(Debug, PartialEq, Eq)]
enum PublicationGitPreparation {
    CommitWorktree,
    PublishExistingHead,
    NothingToPublish,
}

fn publication_git_preparation(
    has_uncommitted_changes: bool,
    ahead_of_base: u64,
) -> PublicationGitPreparation {
    if has_uncommitted_changes {
        PublicationGitPreparation::CommitWorktree
    } else if ahead_of_base > 0 {
        PublicationGitPreparation::PublishExistingHead
    } else {
        PublicationGitPreparation::NothingToPublish
    }
}

fn synchronized_change_count(
    synchronized: u64,
    known_board_revision: Option<i64>,
    persisted_board_revision: Option<i64>,
) -> u64 {
    if matches!(
        (known_board_revision, persisted_board_revision),
        (Some(known), Some(persisted)) if known != persisted
    ) {
        synchronized.max(1)
    } else {
        synchronized
    }
}

async fn open_database(app: &AppHandle) -> Result<PoolConnection<Sqlite>, String> {
    app.state::<DatabaseState>().acquire().await
}

pub(crate) async fn load_card_pull_requests(
    connection: &mut sqlx::SqliteConnection,
    card_id: &str,
) -> Result<Vec<KanbanPullRequestDto>, String> {
    let rows = sqlx::query(
        "SELECT provider, host, project_id, project_path, source_repository_path, relative_path, owner, repository,
                pull_request_number, pull_request_url, base_branch, head_branch,
                draft, pull_request_state, publication_status, last_error, updated_at
         FROM kanban_pull_requests WHERE card_id = ?1 ORDER BY relative_path",
    )
    .bind(card_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Review request state could not be loaded: {error}"))?;
    Ok(rows
        .into_iter()
        .map(|row| KanbanPullRequestDto {
            provider: row.get("provider"),
            host: row.get("host"),
            project_id: row.get("project_id"),
            project_path: row.get("project_path"),
            source_repository_path: row.get("source_repository_path"),
            relative_path: row.get("relative_path"),
            owner: row.get("owner"),
            repository: row.get("repository"),
            number: row.get("pull_request_number"),
            url: row.get("pull_request_url"),
            base_branch: row.get("base_branch"),
            head_branch: row.get("head_branch"),
            draft: row.get::<i64, _>("draft") != 0,
            state: row.get("pull_request_state"),
            publication_status: row.get("publication_status"),
            error: row.get("last_error"),
            updated_at: row.get("updated_at"),
        })
        .collect())
}

fn git_output(path: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Git could not be started: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            "Git operation failed.".to_string()
        } else {
            detail
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

async fn upsert_publication_error(app: &AppHandle, card_id: &str, source_path: &str, error: &str) {
    if let Ok(mut connection) = open_database(app).await {
        let _ = sqlx::query(
            "UPDATE kanban_pull_requests SET publication_status = 'failed', last_error = ?1,
                    attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP
             WHERE card_id = ?2 AND source_repository_path = ?3",
        )
        .bind(error)
        .bind(card_id)
        .bind(source_path)
        .execute(&mut *connection)
        .await;
    }
    let _ = touch_card_board(app, card_id).await;
}

async fn touch_card_board(app: &AppHandle, card_id: &str) -> Result<(), String> {
    let mut connection = open_database(app).await?;
    sqlx::query(
        "UPDATE kanban_boards SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
         WHERE workspace_id = (SELECT workspace_id FROM kanban_cards WHERE id = ?1)",
    )
    .bind(card_id)
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("The Kanban board could not be refreshed: {error}"))?;
    Ok(())
}

fn diff_totals(path: &Path, base_commit: &str) -> (u64, u64, usize) {
    let output = git_output(
        path,
        &["diff", "--numstat", &format!("{base_commit}..HEAD")],
    )
    .unwrap_or_default();
    let mut additions = 0;
    let mut deletions = 0;
    let mut files = 0;
    for line in output.lines() {
        let mut fields = line.splitn(3, '\t');
        let added = fields.next().unwrap_or_default();
        let deleted = fields.next().unwrap_or_default();
        if fields.next().is_none() {
            continue;
        }
        files += 1;
        additions += added.parse::<u64>().unwrap_or(0);
        deletions += deleted.parse::<u64>().unwrap_or(0);
    }
    (additions, deletions, files)
}

fn safe_pull_request_text(value: &str, limit: usize) -> String {
    const SENSITIVE_MARKERS: &[&str] = &[
        "authorization:",
        "api_key",
        "apikey",
        "access_token",
        "refresh_token",
        "client_secret",
        "password",
        "device code",
        "one-time code",
        "otp:",
    ];
    let mut in_fence = false;
    let mut omitted = false;
    let mut safe = String::new();
    for line in value.lines() {
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
            if !omitted {
                safe.push_str("[Technical details omitted.]\n");
                omitted = true;
            }
            continue;
        }
        if in_fence {
            continue;
        }
        let lower = line.to_ascii_lowercase();
        if SENSITIVE_MARKERS
            .iter()
            .any(|marker| lower.contains(marker))
        {
            if !omitted {
                safe.push_str("[Sensitive details omitted.]\n");
                omitted = true;
            }
            continue;
        }
        safe.push_str(line);
        safe.push('\n');
        if safe.chars().count() >= limit {
            break;
        }
    }
    safe.chars()
        .take(limit)
        .collect::<String>()
        .trim()
        .to_string()
}

async fn publish_record(
    app: AppHandle,
    card_id: String,
    binding: KanbanGitRepositoryBinding,
) -> Result<(), String> {
    let lock = app
        .state::<ReviewState>()
        .lock(format!("{card_id}:{}", binding.source_repository_path));
    let _guard = lock.lock().await;
    let mut db = open_database(&app).await?;
    let eligible: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM kanban_pull_requests pr JOIN kanban_cards card ON card.id=pr.card_id WHERE pr.card_id=?1 AND pr.source_repository_path=?2 AND pr.pull_request_number IS NULL AND card.stage='in_review' AND card.deleted_at IS NULL AND card.review_channel IN ('github','gitlab','mixed'))")
        .bind(&card_id).bind(&binding.source_repository_path).fetch_one(&mut *db).await.map_err(|e| e.to_string())?;
    drop(db);
    if !eligible {
        return Ok(());
    }
    let remote = git_output(
        Path::new(&binding.source_repository_path),
        &["remote", "get-url", "origin"],
    )?;
    let mut repository = review_provider::resolve(&app, &remote).await?;
    // Freeze provider/project identity once publishing starts. Origin edits must
    // never redirect recovery to a different project.
    let mut saved_db = open_database(&app).await?;
    let saved = sqlx::query("SELECT provider, host, project_path, project_id FROM kanban_pull_requests WHERE card_id=?1 AND source_repository_path=?2")
        .bind(&card_id).bind(&binding.source_repository_path).fetch_optional(&mut *saved_db).await.map_err(|e| e.to_string())?;
    if let Some(saved) = saved.as_ref() {
        if let Some(path) = saved.get::<Option<String>, _>("project_path") {
            if saved.get::<String, _>("provider") != repository.provider
                || saved.get::<String, _>("host") != repository.host
                || path != repository.path()
            {
                return Err("Repository origin changed after publication was queued. Restore the original origin before retrying.".into());
            }
        }
    }
    drop(saved_db);
    repository.validate(&app).await?;
    if let Some(saved_id) = saved
        .as_ref()
        .and_then(|row| row.get::<Option<i64>, _>("project_id"))
    {
        if repository.project_id != Some(saved_id) {
            return Err("The GitLab project identity changed after publication started. The original project must be restored before retrying.".into());
        }
    }
    let mut connection = open_database(&app).await?;
    let card = sqlx::query(
        "SELECT card.title, card.description, card.account_id, card.model, card.chat_id,
                workspace.path AS workspace_path
         FROM kanban_cards card JOIN workspaces workspace ON workspace.id = card.workspace_id
         WHERE card.id = ?1 AND card.deleted_at IS NULL",
    )
    .bind(&card_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(|_| "The Kanban card is no longer available.".to_string())?;
    let title: String = card.get("title");
    let objective: String = card.get("description");
    let account_id: Option<i64> = card.get("account_id");
    let model: Option<String> = card.get("model");
    let chat_id: i64 = card.get("chat_id");
    let implementation_outcome: Option<String> = sqlx::query_scalar(
        "SELECT final_message FROM runs WHERE chat_id = ?1 AND final_message IS NOT NULL
         ORDER BY turn_index DESC, id DESC LIMIT 1",
    )
    .bind(chat_id)
    .fetch_optional(&mut *connection)
    .await
    .unwrap_or(None);
    sqlx::query(
        "UPDATE kanban_pull_requests SET owner = ?1, repository = ?2, provider = ?5, host = ?6, project_id = ?7, project_path = ?8,
                publication_status = 'publishing', last_error = NULL,
                attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP
         WHERE card_id = ?3 AND source_repository_path = ?4",
    )
    .bind(&repository.owner)
    .bind(&repository.name)
    .bind(&card_id)
    .bind(&binding.source_repository_path)
    .bind(&repository.provider).bind(&repository.host).bind(repository.project_id).bind(repository.path())
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("Publication state could not be saved: {error}"))?;
    drop(connection);

    let status = kanban_git_status(
        app.clone(),
        KanbanGitBindingRequest {
            binding: binding.clone(),
        },
    )
    .await?;
    let preparation =
        publication_git_preparation(status.has_uncommitted_changes(), status.ahead_of_base);
    let mut next_binding = binding;
    if preparation == PublicationGitPreparation::CommitWorktree {
        let context = WorkspaceCommitIntentContext {
            objective: Some(objective.clone()),
            approved_plan: None,
            implementation_outcome: implementation_outcome.clone(),
        };
        let app_for_generation = app.clone();
        let worktree = next_binding.worktree_path.clone();
        let message = tauri::async_runtime::spawn_blocking(move || {
            generate_workspace_repository_commit_message_blocking(
                app_for_generation,
                worktree.clone(),
                Some(worktree),
                account_id,
                Some(true),
                model,
                Some(context),
            )
        })
        .await
        .map_err(|_| "Commit message generation stopped unexpectedly.".to_string())??;
        next_binding = kanban_git_commit(
            app.clone(),
            KanbanGitCommitRequest {
                binding: next_binding,
                message: message.message,
                stage_all: true,
            },
        )
        .await?
        .binding;
    }
    let head_commit = git_output(
        Path::new(&next_binding.worktree_path),
        &["rev-parse", "HEAD^{commit}"],
    )?;
    let ahead = git_output(
        Path::new(&next_binding.worktree_path),
        &[
            "rev-list",
            "--count",
            &format!("{}..HEAD", next_binding.base_commit),
        ],
    )?
    .parse::<u64>()
    .unwrap_or(0);
    if ahead == 0 {
        let mut connection = open_database(&app).await?;
        sqlx::query(
            "UPDATE kanban_pull_requests SET publication_status = 'nothing_to_publish',
                    head_commit = ?1, last_error = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE card_id = ?2 AND source_repository_path = ?3",
        )
        .bind(head_commit)
        .bind(&card_id)
        .bind(&next_binding.source_repository_path)
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Publication state could not be saved: {error}"))?;
        drop(connection);
        touch_card_board(&app, &card_id).await?;
        return Ok(());
    }
    if is_empty_root_commit(
        Path::new(&next_binding.worktree_path),
        &next_binding.base_commit,
    )? {
        repository
            .push(
                &app,
                Path::new(&next_binding.worktree_path),
                &remote,
                &next_binding.base_commit,
                &next_binding.base_branch,
                true,
            )
            .await?;
    }
    repository
        .push(
            &app,
            Path::new(&next_binding.worktree_path),
            &remote,
            &next_binding.card_branch,
            &next_binding.card_branch,
            false,
        )
        .await?;
    let head_commit = git_output(
        Path::new(&next_binding.worktree_path),
        &["rev-parse", "HEAD^{commit}"],
    )?;
    let pull_request = if let Some(existing) = repository
        .find(&app, &next_binding.card_branch, &next_binding.base_branch)
        .await?
    {
        existing
    } else {
        let summary = implementation_outcome
            .unwrap_or_else(|| "The agent completed the requested card work.".to_string());
        let (additions, deletions, changed_files) = diff_totals(
            Path::new(&next_binding.worktree_path),
            &next_binding.base_commit,
        );
        let body = format!(
            "## Objective\n{}\n\n## Agent summary\n{}\n\n## Changes\n{} files changed, +{} -{}\n\n---\nOrchestrator card `{}`",
            safe_pull_request_text(&objective, 4_000),
            safe_pull_request_text(&summary, 6_000),
            changed_files,
            additions,
            deletions,
            card_id,
        );
        repository
            .create(
                &app,
                &next_binding.card_branch,
                &next_binding.base_branch,
                &title,
                &body,
            )
            .await?
    };
    let state = if pull_request.merged_at.is_some() {
        "merged"
    } else {
        pull_request.state.as_str()
    };
    let publication = if state == "merged" {
        "merged"
    } else if state == "closed" {
        "closed"
    } else if pull_request.draft {
        "draft"
    } else {
        "ready"
    };
    let mut connection = open_database(&app).await?;
    sqlx::query(
        "UPDATE kanban_pull_requests SET pull_request_number = ?1, pull_request_url = ?2,
                head_commit = ?3, draft = ?4, pull_request_state = ?5,
                publication_status = ?6, last_error = NULL,
                last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE card_id = ?7 AND source_repository_path = ?8",
    )
    .bind(pull_request.number)
    .bind(pull_request.url)
    .bind(head_commit)
    .bind(pull_request.draft)
    .bind(state)
    .bind(publication)
    .bind(&card_id)
    .bind(&next_binding.source_repository_path)
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("Review request state could not be saved: {error}"))?;
    drop(connection);
    touch_card_board(&app, &card_id).await?;
    Ok(())
}

pub(crate) async fn enqueue_card_publication(
    app: AppHandle,
    card_id: String,
) -> Result<(), String> {
    let lock = card_review_lock(&app, &card_id);
    let _guard = lock.lock().await;
    enqueue_card_publication_unlocked(app, card_id).await
}

async fn enqueue_card_publication_unlocked(app: AppHandle, card_id: String) -> Result<(), String> {
    let _update_lease = crate::update_gate::work()?;
    let mut connection = open_database(&app).await?;
    let active: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM kanban_cards WHERE id=?1 AND stage='in_review' AND deleted_at IS NULL AND review_channel IN ('github','gitlab','mixed'))")
        .bind(&card_id).fetch_one(&mut *connection).await.map_err(|e| e.to_string())?;
    if !active {
        return Err("Only a card in remote review can publish review requests.".into());
    }
    let rows = sqlx::query(
        "SELECT binding_json FROM kanban_repository_bindings WHERE card_id = ?1 AND state != 'removed'",
    )
    .bind(&card_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Card repositories could not be loaded: {error}"))?;
    let bindings = rows
        .into_iter()
        .filter_map(|row| {
            serde_json::from_str::<KanbanGitRepositoryBinding>(
                &row.get::<String, _>("binding_json"),
            )
            .ok()
        })
        .collect::<Vec<_>>();
    let hosts = crate::gitlab_cli::configured_hosts(&app).await?;
    for binding in &bindings {
        let remote = git_output(
            Path::new(&binding.source_repository_path),
            &["remote", "get-url", "origin"],
        )?;
        let repository = review_provider::parse_remote(&remote, &hosts)?;
        sqlx::query(
            "INSERT INTO kanban_pull_requests (
                card_id, source_repository_path, relative_path, base_branch, head_branch, provider, host, project_path
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(card_id, source_repository_path) DO UPDATE SET
                relative_path = excluded.relative_path, base_branch = excluded.base_branch,
                head_branch = excluded.head_branch,
                publication_status = CASE
                    WHEN kanban_pull_requests.pull_request_number IS NULL THEN 'queued'
                    ELSE kanban_pull_requests.publication_status END,
                updated_at = CURRENT_TIMESTAMP",
        )
        .bind(&card_id)
        .bind(&binding.source_repository_path)
        .bind(&binding.relative_path)
        .bind(&binding.base_branch)
        .bind(&binding.card_branch)
        .bind(&repository.provider).bind(&repository.host).bind(repository.path())
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Publication could not be queued: {error}"))?;
    }
    let eligible_rows = sqlx::query(
        "SELECT source_repository_path FROM kanban_pull_requests
         WHERE card_id = ?1
           AND pull_request_number IS NULL
           AND publication_status IN ('queued', 'failed', 'nothing_to_publish')",
    )
    .bind(&card_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Publication state could not be loaded: {error}"))?;
    let eligible_paths = eligible_rows
        .into_iter()
        .map(|row| row.get::<String, _>("source_repository_path"))
        .collect::<HashSet<_>>();
    drop(connection);
    touch_card_board(&app, &card_id).await?;
    for binding in bindings
        .into_iter()
        .filter(|binding| eligible_paths.contains(&binding.source_repository_path))
    {
        let app = app.clone();
        let card = card_id.clone();
        let publication_lease = crate::update_gate::work()?;
        tauri::async_runtime::spawn(async move {
            let _publication_lease = publication_lease;
            let source = binding.source_repository_path.clone();
            if let Err(error) = publish_record(app.clone(), card.clone(), binding).await {
                upsert_publication_error(&app, &card, &source, &error).await;
            }
        });
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn review_publish_kanban_card(
    app: AppHandle,
    card_id: String,
) -> Result<ReviewPublicationResult, String> {
    let lock = card_review_lock(&app, &card_id);
    let _guard = lock.lock().await;
    let mut connection = open_database(&app).await?;
    let card = sqlx::query(
        "SELECT review_channel,
                EXISTS(SELECT 1 FROM kanban_pull_requests
                       WHERE card_id = kanban_cards.id AND pull_request_number IS NOT NULL)
                    AS has_pr,
                EXISTS(SELECT 1 FROM kanban_local_reviews
                       WHERE card_id = kanban_cards.id
                         AND merge_started = 1) AS local_started
         FROM kanban_cards WHERE id = ?1 AND stage = 'in_review' AND deleted_at IS NULL",
    )
    .bind(&card_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|error| format!("The review destination could not be checked: {error}"))?
    .ok_or_else(|| "Only a completed card in review can be published.".to_string())?;
    let has_pr = card.get::<i64, _>("has_pr") != 0;
    let local_started = card.get::<i64, _>("local_started") != 0;
    if card.get::<Option<String>, _>("review_channel").as_deref() == Some("local") {
        if local_started {
            return Err(
                "Local merging has already started, so this card cannot switch to remote review."
                    .to_string(),
            );
        }
        if has_pr {
            return Err("This card already has a review request.".to_string());
        }
        let destination = review_provider::card_destination(&app, &card_id).await?;
        sqlx::query(
            "UPDATE kanban_cards SET review_channel = ?2,
                 state_version = state_version + 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1 AND review_channel = 'local'",
        )
        .bind(&card_id)
        .bind(destination)
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Remote review could not be selected: {error}"))?;
        sqlx::query("DELETE FROM kanban_local_reviews WHERE card_id = ?1")
            .bind(&card_id)
            .execute(&mut *connection)
            .await
            .map_err(|error| format!("Local review state could not be cleared: {error}"))?;
    }
    drop(connection);
    enqueue_card_publication_unlocked(app.clone(), card_id.clone()).await?;
    let mut connection = open_database(&app).await?;
    Ok(ReviewPublicationResult {
        card_id: card_id.clone(),
        pull_requests: load_card_pull_requests(&mut connection, &card_id).await?,
    })
}

fn pull_request_sync_state(pull_request: &github_cli::GithubPullRequest) -> (&str, &str) {
    let state = if pull_request.merged_at.is_some() {
        "merged"
    } else {
        pull_request.state.as_str()
    };
    let publication = if state == "merged" {
        "merged"
    } else if state == "closed" {
        "closed"
    } else if pull_request.draft {
        "draft"
    } else {
        "ready"
    };
    (state, publication)
}

fn pull_request_sync_changed(
    target: &PullRequestSyncTarget,
    pull_request: &github_cli::GithubPullRequest,
) -> bool {
    let (state, publication) = pull_request_sync_state(pull_request);
    target.draft != pull_request.draft
        || target.state != state
        || target.publication_status != publication
        || target.url.as_deref() != Some(pull_request.url.as_str())
        || target.error.is_some()
}

async fn sync_pull_request(
    app: &AppHandle,
    target: &PullRequestSyncTarget,
) -> Result<bool, String> {
    let repository = review_provider::Repository {
        provider: target.provider.clone(),
        host: target.host.clone(),
        project_id: target.project_id,
        owner: target.owner.clone(),
        name: target.repository.clone(),
    };
    let pull_request = repository.view(app, target.number).await?;
    let (state, publication) = pull_request_sync_state(&pull_request);
    let changed = pull_request_sync_changed(target, &pull_request);
    let mut connection = open_database(app).await?;
    if changed {
        sqlx::query(
            "UPDATE kanban_pull_requests SET draft = ?1, pull_request_state = ?2,
                    publication_status = ?3, pull_request_url = ?4, last_error = NULL,
                    etag = ?5, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?6",
        )
        .bind(pull_request.draft)
        .bind(state)
        .bind(publication)
        .bind(&pull_request.url)
        .bind(Option::<String>::None)
        .bind(target.id)
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Review request state could not be saved: {error}"))?;
    } else {
        sqlx::query(
            "UPDATE kanban_pull_requests SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?1",
        )
        .bind(target.id)
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Review request sync time could not be saved: {error}"))?;
    }
    Ok(changed)
}

pub(crate) async fn merged_card_ids(
    connection: &mut sqlx::SqliteConnection,
) -> Result<Vec<String>, String> {
    sqlx::query_scalar::<_, String>(
        "SELECT card.id FROM kanban_cards card
         WHERE card.stage = 'in_review' AND card.deleted_at IS NULL
           AND card.execution_state = 'completed'
           AND card.review_channel IN ('github','gitlab','mixed')
           AND NOT EXISTS (
             SELECT 1 FROM kanban_repository_bindings binding
             WHERE binding.card_id = card.id AND binding.state != 'removed'
               AND NOT EXISTS (SELECT 1 FROM kanban_pull_requests request
                               WHERE request.card_id = card.id AND request.source_repository_path = binding.repository_path)
           )
           AND EXISTS (SELECT 1 FROM kanban_pull_requests pr WHERE pr.card_id = card.id)
           AND NOT EXISTS (
             SELECT 1 FROM kanban_pull_requests pr
             WHERE pr.card_id = card.id AND pr.publication_status NOT IN ('merged', 'nothing_to_publish')
           )",
    )
    .fetch_all(connection)
    .await
    .map_err(|error| format!("Merged cards could not be reconciled: {error}"))
}

async fn complete_merged_cards(app: &AppHandle) -> Result<u64, String> {
    let mut connection = open_database(app).await?;
    let card_ids = merged_card_ids(&mut connection).await?;
    let mut completed = 0;
    for card_id in &card_ids {
        let updated = sqlx::query(
            "UPDATE kanban_cards SET stage = 'done', review_state = 'approved',
                    approved_at = CURRENT_TIMESTAMP, state_version = state_version + 1,
                    updated_at = CURRENT_TIMESTAMP WHERE id = ?1
                      AND stage = 'in_review' AND execution_state = 'completed'
                      AND review_channel IN ('github','gitlab','mixed') AND deleted_at IS NULL",
        )
        .bind(&card_id)
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Merged card state could not be saved: {error}"))?;
        if updated.rows_affected() == 0 {
            continue;
        }
        completed += 1;
        sqlx::query(
            "UPDATE kanban_boards SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
             WHERE workspace_id = (SELECT workspace_id FROM kanban_cards WHERE id = ?1)",
        )
        .bind(&card_id)
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Merged board state could not be saved: {error}"))?;
    }
    Ok(completed)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn review_sync_kanban_requests(
    app: AppHandle,
    workspace_id: Option<i64>,
    known_board_revision: Option<i64>,
) -> Result<u64, String> {
    let mut connection = open_database(&app).await?;
    let stale_publications = sqlx::query(
        "SELECT pr.card_id, pr.source_repository_path, binding.binding_json
         FROM kanban_pull_requests pr
         JOIN kanban_cards card ON card.id = pr.card_id
         JOIN kanban_repository_bindings binding
           ON binding.card_id = pr.card_id
          AND binding.repository_path = pr.source_repository_path
         WHERE pr.pull_request_number IS NULL
           AND pr.publication_status IN ('queued', 'publishing')
           AND pr.updated_at <= datetime('now', '-2 minutes')
           AND binding.state != 'removed'
           AND card.stage = 'in_review' AND card.deleted_at IS NULL
           AND card.review_channel IN ('github','gitlab','mixed')
           AND (?1 IS NULL OR card.workspace_id = ?1)",
    )
    .bind(workspace_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Pending publications could not be recovered: {error}"))?;
    let rows = sqlx::query(
        "SELECT pr.id, pr.provider, pr.host, pr.project_id, pr.owner, pr.repository, pr.pull_request_number, pr.draft,
                pr.pull_request_state, pr.publication_status, pr.pull_request_url,
                pr.last_error
         FROM kanban_pull_requests pr JOIN kanban_cards card ON card.id = pr.card_id
         WHERE pr.pull_request_number IS NOT NULL
           AND pr.publication_status IN ('draft','ready','closed')
           AND card.stage = 'in_review' AND card.deleted_at IS NULL
           AND (?1 IS NULL OR card.workspace_id = ?1)",
    )
    .bind(workspace_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Review requests could not be loaded: {error}"))?;
    let targets = rows
        .into_iter()
        .map(|row| PullRequestSyncTarget {
            id: row.get("id"),
            provider: row.get("provider"),
            host: row.get("host"),
            project_id: row.get("project_id"),
            owner: row.get("owner"),
            repository: row.get("repository"),
            number: row.get("pull_request_number"),
            draft: row.get::<i64, _>("draft") != 0,
            state: row.get("pull_request_state"),
            publication_status: row.get("publication_status"),
            url: row.get("pull_request_url"),
            error: row.get("last_error"),
        })
        .collect::<Vec<_>>();
    drop(connection);
    let mut synced = 0_u64;
    for row in stale_publications {
        let card_id: String = row.get("card_id");
        let source_path: String = row.get("source_repository_path");
        let binding = match serde_json::from_str::<KanbanGitRepositoryBinding>(
            &row.get::<String, _>("binding_json"),
        ) {
            Ok(binding) => binding,
            Err(_) => {
                upsert_publication_error(
                    &app,
                    &card_id,
                    &source_path,
                    "The saved repository publication state is invalid.",
                )
                .await;
                synced += 1;
                continue;
            }
        };
        if let Err(error) = publish_record(app.clone(), card_id.clone(), binding).await {
            upsert_publication_error(&app, &card_id, &source_path, &error).await;
        }
        synced += 1;
    }
    for batch in targets.chunks(PULL_REQUEST_SYNC_CONCURRENCY) {
        let tasks = batch
            .iter()
            .cloned()
            .map(|target| {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    match sync_pull_request(&app, &target).await {
                        Ok(changed) => Ok(changed),
                        Err(error) => {
                            let mut db = open_database(&app).await?;
                            let changed = target.error.as_deref() != Some(error.as_str());
                            sqlx::query("UPDATE kanban_pull_requests SET last_error=?1, updated_at=CURRENT_TIMESTAMP WHERE id=?2")
                                .bind(error).bind(target.id).execute(&mut *db).await.map_err(|e| e.to_string())?;
                            Ok::<_, String>(changed)
                        }
                    }
                })
            })
            .collect::<Vec<_>>();
        for task in tasks {
            if matches!(task.await, Ok(Ok(true))) {
                synced += 1;
            }
        }
    }
    synced += complete_merged_cards(&app).await?;
    let persisted_board_revision = if let Some(workspace_id) = workspace_id {
        let mut connection = open_database(&app).await?;
        sqlx::query_scalar::<_, i64>("SELECT revision FROM kanban_boards WHERE workspace_id = ?1")
            .bind(workspace_id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(|error| format!("The Kanban board revision could not be checked: {error}"))?
    } else {
        None
    };
    Ok(synchronized_change_count(
        synced,
        known_board_revision,
        persisted_board_revision,
    ))
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn review_complete_kanban_without_request(
    app: AppHandle,
    card_id: String,
) -> Result<(), String> {
    let mut connection = open_database(&app).await?;
    let (total, invalid): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(
             CASE WHEN publication_status != 'nothing_to_publish' THEN 1 ELSE 0 END
         ), 0)
         FROM kanban_pull_requests WHERE card_id = ?1",
    )
    .bind(&card_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(|error| format!("Publication state could not be checked: {error}"))?;
    if total == 0 || invalid > 0 {
        return Err(
            "This card still has work to publish or an existing review request.".to_string(),
        );
    }
    let binding_rows: Vec<String> = sqlx::query_scalar(
        "SELECT binding_json FROM kanban_repository_bindings
         WHERE card_id = ?1 AND state != 'removed' ORDER BY repository_path",
    )
    .bind(&card_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Card worktrees could not be checked: {error}"))?;
    drop(connection);
    for value in binding_rows {
        let binding: crate::kanban_git::KanbanGitRepositoryBinding =
            serde_json::from_str(&value)
                .map_err(|_| "A saved card worktree is invalid.".to_string())?;
        let status = kanban_git_status(app.clone(), KanbanGitBindingRequest { binding }).await?;
        if status.has_changes || status.ahead_of_base > 0 {
            return Err(
                "This card now has work to publish. Retry publication instead of completing it without a review request."
                    .to_string(),
            );
        }
    }
    let mut connection = open_database(&app).await?;
    sqlx::query(
        "UPDATE kanban_cards SET stage = 'done', review_state = 'approved',
                approved_at = CURRENT_TIMESTAMP, state_version = state_version + 1,
                updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND stage = 'in_review'",
    )
    .bind(&card_id)
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("The card could not be completed: {error}"))?;
    drop(connection);
    touch_card_board(&app, &card_id).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        publication_git_preparation, pull_request_sync_changed, safe_pull_request_text,
        synchronized_change_count, PublicationGitPreparation, PullRequestSyncTarget,
    };
    use crate::github_cli::GithubPullRequest;

    #[test]
    fn pull_request_text_omits_secrets_and_fenced_output() {
        let safe = safe_pull_request_text(
            "Implemented login.\n```sh\nexport API_KEY=secret\n```\nPassword: hidden\nTests pass.",
            1_000,
        );
        assert!(safe.contains("Implemented login."));
        assert!(safe.contains("Tests pass."));
        assert!(!safe.contains("API_KEY"));
        assert!(!safe.contains("hidden"));
    }

    #[test]
    fn pull_request_sync_only_reports_user_visible_state_changes() {
        let target = PullRequestSyncTarget {
            id: 1,
            provider: "github".into(),
            host: "github.com".into(),
            project_id: None,
            owner: "openai".to_string(),
            repository: "orchestrator".to_string(),
            number: 12,
            draft: false,
            state: "open".to_string(),
            publication_status: "ready".to_string(),
            url: Some("https://github.com/openai/orchestrator/pull/12".to_string()),
            error: None,
        };
        let unchanged = GithubPullRequest {
            number: 12,
            url: "https://github.com/openai/orchestrator/pull/12".to_string(),
            state: "open".to_string(),
            draft: false,
            merged_at: None,
        };
        assert!(!pull_request_sync_changed(&target, &unchanged));

        let merged = GithubPullRequest {
            merged_at: Some("2026-08-20T12:00:00Z".to_string()),
            ..unchanged
        };
        assert!(pull_request_sync_changed(&target, &merged));
    }

    #[test]
    fn missed_background_publication_requests_a_board_reload() {
        assert_eq!(synchronized_change_count(0, Some(12), Some(13)), 1);
        assert_eq!(synchronized_change_count(0, Some(13), Some(13)), 0);
        assert_eq!(synchronized_change_count(2, Some(12), Some(13)), 2);
        assert_eq!(synchronized_change_count(0, None, Some(13)), 0);
    }

    #[test]
    fn publication_commits_only_dirty_worktrees() {
        assert_eq!(
            publication_git_preparation(true, 0),
            PublicationGitPreparation::CommitWorktree
        );
        assert_eq!(
            publication_git_preparation(true, 1),
            PublicationGitPreparation::CommitWorktree
        );
        assert_eq!(
            publication_git_preparation(false, 1),
            PublicationGitPreparation::PublishExistingHead
        );
        assert_eq!(
            publication_git_preparation(false, 0),
            PublicationGitPreparation::NothingToPublish
        );
    }
}
