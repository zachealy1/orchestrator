use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    ffi::OsStr,
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    process::{Command, Output, Stdio},
};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::{
    git::{
        case_only_renames, git_diff_is_binary, read_git_object_preview, stage_case_only_renames,
    },
    models::{WorkspaceGitDiff, WorkspaceGitDiffSection},
    paths::{empty_preview_text, read_workspace_file_preview_text},
};

const CARD_BRANCH_PREFIX: &str = "codex/";
const MAX_CARD_ID_LENGTH: usize = 128;
const MAX_BRANCH_ATTEMPTS: usize = 1_000;

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct KanbanGitRepositorySelection {
    pub repository_path: String,
    pub relative_path: Option<String>,
    #[serde(default)]
    pub include_dirty_changes: bool,
}

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct KanbanGitProvisionRequest {
    pub card_id: String,
    pub card_slug: Option<String>,
    pub repositories: Vec<KanbanGitRepositorySelection>,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct KanbanGitRepositoryBinding {
    pub source_repository_path: String,
    pub relative_path: String,
    pub execution_root: String,
    pub source_branch: String,
    pub base_branch: String,
    pub base_commit: String,
    pub card_branch: String,
    pub worktree_path: String,
    /// Legacy compatibility field for bindings persisted by older builds.
    #[serde(default)]
    pub source_status_fingerprint: Option<String>,
    pub status: String,
    pub error: Option<KanbanGitOperationError>,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct KanbanGitOperationError {
    pub repository_path: Option<String>,
    pub code: String,
    pub message: String,
    pub cleanup_required: bool,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KanbanGitProvisionResult {
    pub card_id: String,
    pub execution_root: String,
    pub repositories: Vec<KanbanGitRepositoryBinding>,
    pub errors: Vec<KanbanGitOperationError>,
    pub complete: bool,
    pub rolled_back: bool,
}

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct KanbanGitBindingRequest {
    pub binding: KanbanGitRepositoryBinding,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KanbanGitReconcileResult {
    pub binding: KanbanGitRepositoryBinding,
    pub source_available: bool,
    pub worktree_available: bool,
    pub branch_available: bool,
    pub branch_matches: bool,
    pub base_branch_head: Option<String>,
    pub head_commit: Option<String>,
    pub target_moved: bool,
    pub has_changes: bool,
    pub has_conflicts: bool,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KanbanGitFileStatus {
    pub path: String,
    pub original_path: Option<String>,
    pub index_status: String,
    pub worktree_status: String,
    pub kind: String,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KanbanGitStatusResult {
    pub binding: KanbanGitRepositoryBinding,
    pub head_commit: String,
    pub base_branch_head: Option<String>,
    pub ahead_of_base: u64,
    pub behind_base: u64,
    pub ahead_of_target: Option<u64>,
    pub behind_target: Option<u64>,
    pub has_changes: bool,
    pub has_conflicts: bool,
    pub staged_count: usize,
    pub unstaged_count: usize,
    pub untracked_count: usize,
    pub files: Vec<KanbanGitFileStatus>,
}

impl KanbanGitStatusResult {
    pub(crate) fn has_uncommitted_changes(&self) -> bool {
        !self.files.is_empty()
    }
}

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct KanbanGitDiffRequest {
    pub binding: KanbanGitRepositoryBinding,
    #[serde(default = "default_true")]
    pub include_binary: bool,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KanbanGitDiffResult {
    pub binding: KanbanGitRepositoryBinding,
    pub base_commit: String,
    pub head_commit: String,
    pub content: String,
    pub untracked_paths: Vec<String>,
    pub is_empty: bool,
}

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct KanbanGitFileDiffRequest {
    pub binding: KanbanGitRepositoryBinding,
    pub file_path: String,
}

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct KanbanGitCommitRequest {
    pub binding: KanbanGitRepositoryBinding,
    pub message: String,
    #[serde(default = "default_true")]
    pub stage_all: bool,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KanbanGitActionResult {
    pub binding: KanbanGitRepositoryBinding,
    pub status: String,
    pub message: String,
    pub branch: String,
    pub head_commit: String,
}

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct KanbanGitMergeRequest {
    pub binding: KanbanGitRepositoryBinding,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KanbanGitMergeResult {
    pub binding: KanbanGitRepositoryBinding,
    pub status: String,
    pub merge_kind: Option<String>,
    pub target_branch: String,
    pub target_head: String,
    pub conflict_paths: Vec<String>,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct KanbanGitCleanupRequest {
    pub binding: KanbanGitRepositoryBinding,
    #[serde(default)]
    pub delete_branch: bool,
    #[serde(default)]
    pub force: bool,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KanbanGitCleanupResult {
    pub binding: KanbanGitRepositoryBinding,
    pub status: String,
    pub worktree_removed: bool,
    pub branch_deleted: bool,
    pub execution_root_removed: bool,
    pub errors: Vec<KanbanGitOperationError>,
}

#[derive(Debug)]
struct ProvisioningRepository {
    source_root: PathBuf,
    relative_path: String,
    source_branch: String,
    base_commit: String,
    source_unborn: bool,
    include_dirty_changes: bool,
    staged_patch: Vec<u8>,
    unstaged_patch: Vec<u8>,
    untracked_paths: Vec<String>,
    source_status_snapshot: Vec<u8>,
    dirty: bool,
}

fn default_true() -> bool {
    true
}

fn operation_error(
    repository_path: Option<String>,
    code: impl Into<String>,
    message: impl Into<String>,
    cleanup_required: bool,
) -> KanbanGitOperationError {
    KanbanGitOperationError {
        repository_path,
        code: code.into(),
        message: message.into(),
        cleanup_required,
    }
}

fn cards_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app data directory: {error}"))?
        .join("kanban")
        .join("cards");
    fs::create_dir_all(&root)
        .map_err(|error| format!("Unable to create Kanban execution directory: {error}"))?;
    fs::canonicalize(&root)
        .map_err(|error| format!("Unable to resolve Kanban execution directory: {error}"))
}

fn validate_card_id(card_id: &str) -> Result<(), String> {
    if card_id.is_empty()
        || card_id.len() > MAX_CARD_ID_LENGTH
        || !card_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("Card ID must contain only letters, numbers, hyphens, or underscores".into());
    }
    Ok(())
}

fn branch_component(value: &str, maximum_length: usize) -> String {
    let mut result = String::new();
    let mut previous_hyphen = false;
    for character in value.chars() {
        let normalized = character.to_ascii_lowercase();
        if normalized.is_ascii_alphanumeric() {
            result.push(normalized);
            previous_hyphen = false;
        } else if !previous_hyphen && !result.is_empty() {
            result.push('-');
            previous_hyphen = true;
        }
        if result.len() >= maximum_length {
            break;
        }
    }
    while result.ends_with('-') {
        result.pop();
    }
    result
}

fn safe_relative_path(value: &str) -> Result<String, String> {
    let path = Path::new(value);
    if path.is_absolute() || value.trim().is_empty() {
        return Err("Repository relative path must be a non-empty relative path".into());
    }
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => {
                if part == OsStr::new(".git") {
                    return Err("Repository relative path cannot contain .git".into());
                }
                parts.push(part.to_string_lossy().to_string());
            }
            Component::CurDir => {}
            _ => {
                return Err(
                    "Repository relative path cannot contain parent or root components".into(),
                )
            }
        }
    }
    if parts.is_empty() {
        return Err("Repository relative path must identify a child directory".into());
    }
    Ok(parts.join("/"))
}

fn path_is_lexically_within(path: &Path, root: &Path) -> bool {
    if !path.is_absolute() || !root.is_absolute() || !path.starts_with(root) {
        return false;
    }
    path.strip_prefix(root).is_ok_and(|relative| {
        relative
            .components()
            .all(|component| matches!(component, Component::Normal(_) | Component::CurDir))
    })
}

fn ensure_execution_root(cards_root: &Path, execution_root: &Path) -> Result<(), String> {
    if execution_root.parent() != Some(cards_root)
        || !path_is_lexically_within(execution_root, cards_root)
    {
        return Err("Kanban execution root is outside the app-owned cards directory".into());
    }
    if let Ok(metadata) = fs::symlink_metadata(execution_root) {
        if metadata.file_type().is_symlink() {
            return Err("Kanban execution root cannot be a symbolic link".into());
        }
        let canonical = fs::canonicalize(execution_root)
            .map_err(|error| format!("Unable to resolve Kanban execution root: {error}"))?;
        if canonical.parent() != Some(cards_root) {
            return Err("Kanban execution root resolves outside app data".into());
        }
    }
    Ok(())
}

fn validate_command_binding(
    app_cards_root: &Path,
    binding: &KanbanGitRepositoryBinding,
) -> Result<(), String> {
    if !binding.card_branch.starts_with(CARD_BRANCH_PREFIX) {
        return Err("Kanban card branch has an invalid prefix".into());
    }
    let execution_root = Path::new(&binding.execution_root);
    ensure_execution_root(app_cards_root, execution_root)?;
    let worktree_path = Path::new(&binding.worktree_path);
    if worktree_path == execution_root || !path_is_lexically_within(worktree_path, execution_root) {
        return Err("Kanban worktree path is outside its execution root".into());
    }
    let expected = execution_root.join(&binding.relative_path);
    if expected != worktree_path {
        return Err("Kanban worktree path does not match its repository binding".into());
    }
    Ok(())
}

fn git_output(repo: &Path, args: &[&str]) -> Result<Output, String> {
    Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|error| format!("Unable to start Git: {error}"))
}

fn git_output_with_stdin(repo: &Path, args: &[&str], input: &[u8]) -> Result<Output, String> {
    let mut child = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Unable to start Git: {error}"))?;
    child
        .stdin
        .take()
        .ok_or_else(|| "Unable to open Git input".to_string())?
        .write_all(input)
        .map_err(|error| format!("Unable to send data to Git: {error}"))?;
    child
        .wait_with_output()
        .map_err(|error| format!("Unable to read Git output: {error}"))
}

fn output_text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).trim().to_string()
}

fn output_detail(output: &Output) -> String {
    let stdout = output_text(&output.stdout);
    let stderr = output_text(&output.stderr);
    match (stdout.is_empty(), stderr.is_empty()) {
        (false, false) => format!("{stdout}\n{stderr}"),
        (false, true) => stdout,
        (true, false) => stderr,
        (true, true) => "Git command failed without an error message".to_string(),
    }
}

fn git_checked(repo: &Path, args: &[&str], operation: &str) -> Result<String, String> {
    let output = git_output(repo, args)?;
    if !output.status.success() {
        return Err(format!("{operation}: {}", output_detail(&output)));
    }
    Ok(output_text(&output.stdout))
}

fn git_checked_bytes(repo: &Path, args: &[&str], operation: &str) -> Result<Vec<u8>, String> {
    let output = git_output(repo, args)?;
    if !output.status.success() {
        return Err(format!("{operation}: {}", output_detail(&output)));
    }
    Ok(output.stdout)
}

fn resolve_repository(path: &Path) -> Result<PathBuf, String> {
    let source = fs::canonicalize(path)
        .map_err(|error| format!("Unable to resolve repository {}: {error}", path.display()))?;
    if !source.is_dir() {
        return Err(format!(
            "Repository path is not a directory: {}",
            source.display()
        ));
    }
    let top_level = git_checked(
        &source,
        &["rev-parse", "--show-toplevel"],
        "Not a Git worktree",
    )?;
    let top_level = fs::canonicalize(&top_level)
        .map_err(|error| format!("Unable to resolve Git root {top_level}: {error}"))?;
    if top_level != source {
        return Err(format!(
            "Repository selection must be its Git root ({})",
            top_level.display()
        ));
    }
    let bare = git_checked(
        &source,
        &["rev-parse", "--is-bare-repository"],
        "Unable to inspect repository",
    )?;
    if bare == "true" {
        return Err("Bare repositories cannot be used for Kanban worktrees".into());
    }
    Ok(source)
}

fn current_branch(repo: &Path) -> Result<String, String> {
    let branch = git_checked(
        repo,
        &["symbolic-ref", "--quiet", "--short", "HEAD"],
        "Unable to read the checked-out branch",
    )?;
    if branch.is_empty() {
        return Err("Cannot provision a Kanban card from a detached HEAD".into());
    }
    Ok(branch)
}

fn rev_parse(repo: &Path, revision: &str) -> Result<String, String> {
    git_checked(
        repo,
        &["rev-parse", "--verify", revision],
        "Unable to resolve Git revision",
    )
}

fn optional_revision(repo: &Path, revision: &str) -> Result<Option<String>, String> {
    let output = git_output(repo, &["rev-parse", "--verify", "--quiet", revision])?;
    match output.status.code() {
        Some(0) => Ok(Some(output_text(&output.stdout))),
        Some(1) => Ok(None),
        _ => Err(format!(
            "Unable to resolve Git revision: {}",
            output_detail(&output)
        )),
    }
}

fn optional_head_commit(repo: &Path) -> Result<Option<String>, String> {
    optional_revision(repo, "HEAD^{commit}")
}

fn create_unborn_base_commit(repo: &Path) -> Result<String, String> {
    let empty_tree = git_checked(repo, &["mktree"], "Unable to create an empty Git tree")?;
    let mut child = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(["commit-tree", empty_tree.as_str()])
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_AUTHOR_NAME", "Orchestrator")
        .env("GIT_AUTHOR_EMAIL", "orchestrator@localhost")
        .env("GIT_COMMITTER_NAME", "Orchestrator")
        .env("GIT_COMMITTER_EMAIL", "orchestrator@localhost")
        .env("GIT_AUTHOR_DATE", "1970-01-01T00:00:00Z")
        .env("GIT_COMMITTER_DATE", "1970-01-01T00:00:00Z")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Unable to create an empty Kanban base commit: {error}"))?;
    child
        .stdin
        .take()
        .ok_or_else(|| "Unable to open Git commit input".to_string())?
        .write_all(b"Initialize empty Kanban base\n")
        .map_err(|error| format!("Unable to write the empty Kanban base commit: {error}"))?;
    let output = child
        .wait_with_output()
        .map_err(|error| format!("Unable to read the empty Kanban base commit: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Unable to create an empty Kanban base commit: {}",
            output_detail(&output)
        ));
    }
    Ok(output_text(&output.stdout))
}

fn common_git_directory(repo: &Path) -> Result<PathBuf, String> {
    let value = git_checked(
        repo,
        &["rev-parse", "--git-common-dir"],
        "Unable to resolve the Git common directory",
    )?;
    let path = PathBuf::from(value);
    let path = if path.is_absolute() {
        path
    } else {
        repo.join(path)
    };
    fs::canonicalize(path)
        .map_err(|error| format!("Unable to resolve the Git common directory: {error}"))
}

fn repository_is_dirty(repo: &Path) -> Result<bool, String> {
    Ok(!git_checked_bytes(
        repo,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        "Unable to read Git status",
    )?
    .is_empty())
}

fn append_case_only_renames(
    repo: &Path,
    files: &mut Vec<KanbanGitFileStatus>,
) -> Result<(), String> {
    for (tracked_path, actual_path) in case_only_renames(repo, None)? {
        if files.iter().any(|file| {
            file.path == actual_path || file.original_path.as_deref() == Some(tracked_path.as_str())
        }) {
            continue;
        }
        files.push(KanbanGitFileStatus {
            path: actual_path,
            original_path: Some(tracked_path),
            index_status: " ".to_string(),
            worktree_status: "R".to_string(),
            kind: "renamed".to_string(),
        });
    }
    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(())
}

fn untracked_paths(repo: &Path) -> Result<Vec<String>, String> {
    let bytes = git_checked_bytes(
        repo,
        &["ls-files", "--others", "--exclude-standard", "-z"],
        "Unable to list untracked files",
    )?;
    let mut paths = bytes
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
        .map(|path| String::from_utf8_lossy(path).to_string())
        .collect::<Vec<_>>();
    paths.sort();
    paths.dedup();
    Ok(paths)
}

fn repository_fallback_name(source: &Path, index: usize) -> String {
    let name = source
        .file_name()
        .and_then(OsStr::to_str)
        .map(|value| branch_component(value, 48))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "repository".to_string());
    format!("{index:02}-{name}")
}

fn prepare_repositories(
    request: &KanbanGitProvisionRequest,
) -> Result<Vec<ProvisioningRepository>, String> {
    if request.repositories.is_empty() {
        return Err("Select at least one Git repository for this card".into());
    }
    let mut roots = HashSet::new();
    let mut relative_paths = HashSet::new();
    let mut prepared = Vec::with_capacity(request.repositories.len());

    for (index, selection) in request.repositories.iter().enumerate() {
        let source_root = resolve_repository(Path::new(&selection.repository_path))?;
        if !roots.insert(source_root.clone()) {
            return Err(format!(
                "Repository was selected more than once: {}",
                source_root.display()
            ));
        }
        let relative_path = match selection.relative_path.as_deref() {
            Some(value) if value.trim() != "." => safe_relative_path(value)?,
            _ => repository_fallback_name(&source_root, index + 1),
        };
        if !relative_paths.insert(relative_path.clone()) {
            return Err(format!(
                "Duplicate repository execution path: {relative_path}"
            ));
        }
        let relative = Path::new(&relative_path);
        if relative_paths.iter().any(|other| {
            let other = Path::new(other);
            other != relative && (other.starts_with(relative) || relative.starts_with(other))
        }) {
            return Err(format!(
                "Repository execution paths cannot overlap: {relative_path}"
            ));
        }

        let source_branch = current_branch(&source_root)?;
        let source_head = optional_head_commit(&source_root)?;
        let source_unborn = source_head.is_none();
        let base_commit = match source_head {
            Some(commit) => commit,
            None => create_unborn_base_commit(&source_root)?,
        };
        let source_status_snapshot = git_checked_bytes(
            &source_root,
            &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
            "Unable to snapshot source Git status",
        )?;
        let dirty = !source_status_snapshot.is_empty();
        let (staged_patch, unstaged_patch, untracked) = if selection.include_dirty_changes && dirty
        {
            (
                git_checked_bytes(
                    &source_root,
                    if source_unborn {
                        &["diff", "--cached", "--binary", "--full-index", "--"]
                    } else {
                        &["diff", "--cached", "--binary", "--full-index", "HEAD", "--"]
                    },
                    "Unable to snapshot staged source changes",
                )?,
                git_checked_bytes(
                    &source_root,
                    &["diff", "--binary", "--full-index", "--"],
                    "Unable to snapshot unstaged source changes",
                )?,
                untracked_paths(&source_root)?,
            )
        } else {
            (Vec::new(), Vec::new(), Vec::new())
        };

        let status_after_snapshot = git_checked_bytes(
            &source_root,
            &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
            "Unable to verify source Git status",
        )?;
        if status_after_snapshot != source_status_snapshot {
            return Err(format!(
                "Repository changed while its source snapshot was being captured: {}",
                source_root.display()
            ));
        }

        prepared.push(ProvisioningRepository {
            source_root,
            relative_path,
            source_branch,
            base_commit,
            source_unborn,
            include_dirty_changes: selection.include_dirty_changes,
            staged_patch,
            unstaged_patch,
            untracked_paths: untracked,
            source_status_snapshot,
            dirty,
        });
    }
    Ok(prepared)
}

fn branch_exists(repo: &Path, branch: &str) -> Result<bool, String> {
    let reference = format!("refs/heads/{branch}");
    let output = git_output(repo, &["show-ref", "--verify", "--quiet", &reference])?;
    match output.status.code() {
        Some(0) => Ok(true),
        Some(1) => Ok(false),
        _ => Err(format!(
            "Unable to inspect branch {branch}: {}",
            output_detail(&output)
        )),
    }
}

fn available_card_branch(repo: &Path, base: &str) -> Result<String, String> {
    for attempt in 1..=MAX_BRANCH_ATTEMPTS {
        let candidate = if attempt == 1 {
            base.to_string()
        } else {
            format!("{base}-{attempt}")
        };
        if !branch_exists(repo, &candidate)? {
            return Ok(candidate);
        }
    }
    Err("Unable to allocate a unique Kanban branch name".into())
}

fn create_worktree(
    repository: &ProvisioningRepository,
    execution_root: &Path,
    branch_base: &str,
) -> Result<KanbanGitRepositoryBinding, String> {
    let worktree = execution_root.join(&repository.relative_path);
    if worktree.exists() {
        return Err(format!(
            "Kanban worktree path already exists: {}",
            worktree.display()
        ));
    }
    if let Some(parent) = worktree.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Unable to create worktree parent: {error}"))?;
    }

    let worktree_arg = worktree.to_string_lossy().to_string();
    let card_branch = available_card_branch(&repository.source_root, branch_base)?;
    let output = git_output(
        &repository.source_root,
        &[
            "worktree",
            "add",
            "-b",
            &card_branch,
            &worktree_arg,
            &repository.base_commit,
        ],
    )?;
    if !output.status.success() {
        if worktree.is_dir()
            && fs::read_dir(&worktree)
                .map(|mut entries| entries.next().is_none())
                .unwrap_or(false)
        {
            let _ = fs::remove_dir(&worktree);
        }
        let cleanup_warning = if branch_exists(&repository.source_root, &card_branch)? {
            format!(
                "\nCleanup required: Git left branch {card_branch} after the failed worktree operation"
            )
        } else {
            String::new()
        };
        return Err(format!(
            "Unable to create Kanban worktree: {}{cleanup_warning}",
            output_detail(&output)
        ));
    }

    let apply_result = if repository.include_dirty_changes && repository.dirty {
        apply_source_snapshot(repository, &worktree)
    } else {
        Ok(())
    };
    if let Err(error) = apply_result {
        return Err(cleanup_failed_worktree(
            &repository.source_root,
            &worktree,
            &card_branch,
            error,
        ));
    }

    let target_reference = format!("refs/heads/{}^{{commit}}", repository.source_branch);
    let current_target = optional_revision(&repository.source_root, &target_reference);
    let source_unchanged = if repository.include_dirty_changes {
        git_checked_bytes(
            &repository.source_root,
            &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
            "Unable to verify source changes after provisioning",
        )
        .map(|status| status == repository.source_status_snapshot)
    } else {
        Ok(true)
    };
    let verification_error = match (current_target, source_unchanged) {
        (Ok(None), Ok(true)) if repository.source_unborn => None,
        (Ok(Some(target)), Ok(true))
            if !repository.source_unborn && target == repository.base_commit =>
        {
            None
        }
        (Ok(_), Ok(true)) => {
            Some("The captured target branch moved during provisioning".to_string())
        }
        (Ok(_), Ok(false)) => {
            Some("The source worktree changed during dirty-change inclusion".to_string())
        }
        (Err(error), _) | (_, Err(error)) => Some(error),
    };
    if let Some(error) = verification_error {
        return Err(cleanup_failed_worktree(
            &repository.source_root,
            &worktree,
            &card_branch,
            error,
        ));
    }

    Ok(KanbanGitRepositoryBinding {
        source_repository_path: repository.source_root.to_string_lossy().to_string(),
        relative_path: repository.relative_path.clone(),
        execution_root: execution_root.to_string_lossy().to_string(),
        source_branch: repository.source_branch.clone(),
        base_branch: repository.source_branch.clone(),
        base_commit: repository.base_commit.clone(),
        card_branch,
        worktree_path: worktree.to_string_lossy().to_string(),
        // Retained in the binding contract so cards created by older builds
        // remain readable. New cards no longer fingerprint the source checkout.
        source_status_fingerprint: None,
        status: if repository.dirty && !repository.include_dirty_changes {
            "readySourceChangesExcluded".to_string()
        } else if repository.dirty {
            "readySourceChangesIncluded".to_string()
        } else {
            "ready".to_string()
        },
        error: None,
    })
}

fn cleanup_failed_worktree(
    source: &Path,
    worktree: &Path,
    branch: &str,
    original_error: String,
) -> String {
    let mut cleanup_errors = Vec::new();
    if worktree.exists() {
        if let Err(error) = remove_worktree(source, worktree, true) {
            cleanup_errors.push(error);
        }
    }
    if branch_exists(source, branch).unwrap_or(false) {
        if let Err(error) = delete_branch(source, branch, true) {
            cleanup_errors.push(error);
        }
    }
    if cleanup_errors.is_empty() {
        original_error
    } else {
        format!(
            "{original_error}\nCleanup required: {}",
            cleanup_errors.join("\n")
        )
    }
}

fn validate_snapshot_path(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_) | Component::CurDir))
    {
        return Err(format!(
            "Unsafe untracked file path in Git output: {}",
            path.display()
        ));
    }
    Ok(path.to_path_buf())
}

fn copy_snapshot_path(source_root: &Path, worktree: &Path, relative: &str) -> Result<(), String> {
    let relative = validate_snapshot_path(relative)?;
    let source = source_root.join(&relative);
    let destination = worktree.join(&relative);
    let metadata = fs::symlink_metadata(&source).map_err(|error| {
        format!(
            "Unable to inspect untracked file {}: {error}",
            source.display()
        )
    })?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Unable to create untracked file parent: {error}"))?;
    }
    if metadata.file_type().is_symlink() {
        copy_symlink(&source, &destination)
    } else if metadata.is_file() {
        fs::copy(&source, &destination).map_err(|error| {
            format!(
                "Unable to copy untracked file {}: {error}",
                source.display()
            )
        })?;
        fs::set_permissions(&destination, metadata.permissions())
            .map_err(|error| format!("Unable to copy file permissions: {error}"))?;
        Ok(())
    } else {
        Err(format!(
            "Unsupported untracked filesystem entry: {}",
            source.display()
        ))
    }
}

#[cfg(unix)]
fn copy_symlink(source: &Path, destination: &Path) -> Result<(), String> {
    let target = fs::read_link(source)
        .map_err(|error| format!("Unable to read symbolic link {}: {error}", source.display()))?;
    std::os::unix::fs::symlink(target, destination)
        .map_err(|error| format!("Unable to copy symbolic link {}: {error}", source.display()))
}

#[cfg(windows)]
fn copy_symlink(source: &Path, destination: &Path) -> Result<(), String> {
    let target = fs::read_link(source)
        .map_err(|error| format!("Unable to read symbolic link {}: {error}", source.display()))?;
    if source.is_dir() {
        std::os::windows::fs::symlink_dir(target, destination)
    } else {
        std::os::windows::fs::symlink_file(target, destination)
    }
    .map_err(|error| format!("Unable to copy symbolic link {}: {error}", source.display()))
}

fn apply_patch(worktree: &Path, patch: &[u8], staged: bool) -> Result<(), String> {
    if patch.is_empty() {
        return Ok(());
    }
    let args = if staged {
        vec!["apply", "--index", "--whitespace=nowarn", "-"]
    } else {
        vec!["apply", "--whitespace=nowarn", "-"]
    };
    let output = git_output_with_stdin(worktree, &args, patch)?;
    if !output.status.success() {
        return Err(format!(
            "Unable to apply source changes: {}",
            output_detail(&output)
        ));
    }
    Ok(())
}

fn apply_source_snapshot(
    repository: &ProvisioningRepository,
    worktree: &Path,
) -> Result<(), String> {
    apply_patch(worktree, &repository.staged_patch, true)?;
    apply_patch(worktree, &repository.unstaged_patch, false)?;
    for path in &repository.untracked_paths {
        copy_snapshot_path(&repository.source_root, worktree, path)?;
    }
    Ok(())
}

fn remove_worktree(source: &Path, worktree: &Path, force: bool) -> Result<(), String> {
    let worktree_arg = worktree.to_string_lossy().to_string();
    let args = if force {
        vec!["worktree", "remove", "--force", &worktree_arg]
    } else {
        vec!["worktree", "remove", &worktree_arg]
    };
    let output = git_output(source, &args)?;
    if !output.status.success() {
        return Err(format!(
            "Unable to remove Kanban worktree: {}",
            output_detail(&output)
        ));
    }
    Ok(())
}

fn delete_branch(source: &Path, branch: &str, force: bool) -> Result<(), String> {
    if !branch.starts_with(CARD_BRANCH_PREFIX) {
        return Err("Refusing to delete a branch not owned by Kanban".into());
    }
    let flag = if force { "-D" } else { "-d" };
    let output = git_output(source, &["branch", flag, "--", branch])?;
    if !output.status.success() {
        return Err(format!(
            "Unable to delete Kanban branch: {}",
            output_detail(&output)
        ));
    }
    Ok(())
}

fn rollback_bindings(bindings: &mut [KanbanGitRepositoryBinding]) -> Vec<KanbanGitOperationError> {
    let mut errors = Vec::new();
    for binding in bindings.iter_mut().rev() {
        let source = Path::new(&binding.source_repository_path);
        let worktree = Path::new(&binding.worktree_path);
        let mut cleanup_messages = Vec::new();
        if worktree.exists() {
            if let Err(error) = remove_worktree(source, worktree, true) {
                cleanup_messages.push(error);
            }
        }
        remove_empty_worktree_parents(worktree, Path::new(&binding.execution_root));
        if branch_exists(source, &binding.card_branch).unwrap_or(false) {
            if let Err(error) = delete_branch(source, &binding.card_branch, true) {
                cleanup_messages.push(error);
            }
        }
        if cleanup_messages.is_empty() {
            binding.status = "rolledBack".to_string();
            binding.error = None;
        } else {
            let message = cleanup_messages.join("\n");
            let error = operation_error(
                Some(binding.source_repository_path.clone()),
                "rollback_failed",
                message,
                true,
            );
            binding.status = "cleanupRequired".to_string();
            binding.error = Some(error.clone());
            errors.push(error);
        }
    }
    errors
}

fn provision_blocking(
    app_cards_root: &Path,
    request: KanbanGitProvisionRequest,
) -> Result<KanbanGitProvisionResult, String> {
    validate_card_id(&request.card_id)?;
    let repositories = prepare_repositories(&request)?;
    let execution_root = app_cards_root.join(&request.card_id);
    ensure_execution_root(app_cards_root, &execution_root)?;
    if execution_root.exists()
        && fs::read_dir(&execution_root)
            .map_err(|error| format!("Unable to inspect existing execution root: {error}"))?
            .next()
            .is_some()
    {
        return Err("This card already has an execution root; reconcile it instead".into());
    }
    fs::create_dir_all(&execution_root)
        .map_err(|error| format!("Unable to create card execution root: {error}"))?;

    let slug_component = request
        .card_slug
        .as_deref()
        .map(|slug| branch_component(slug, 32))
        .filter(|slug| !slug.is_empty())
        .unwrap_or_else(|| "card".to_string());
    let branch_base = format!("{CARD_BRANCH_PREFIX}{slug_component}");

    let mut bindings = Vec::with_capacity(repositories.len());
    for repository in &repositories {
        match create_worktree(repository, &execution_root, &branch_base) {
            Ok(binding) => bindings.push(binding),
            Err(message) => {
                let cleanup_required = message.contains("Cleanup required:");
                let mut errors = vec![operation_error(
                    Some(repository.source_root.to_string_lossy().to_string()),
                    "provision_failed",
                    message,
                    cleanup_required,
                )];
                errors.extend(rollback_bindings(&mut bindings));
                if execution_root
                    .read_dir()
                    .map(|mut entries| entries.next().is_none())
                    .unwrap_or(false)
                {
                    let _ = fs::remove_dir(&execution_root);
                }
                return Ok(KanbanGitProvisionResult {
                    card_id: request.card_id,
                    execution_root: execution_root.to_string_lossy().to_string(),
                    repositories: bindings,
                    errors,
                    complete: false,
                    rolled_back: true,
                });
            }
        }
    }

    Ok(KanbanGitProvisionResult {
        card_id: request.card_id,
        execution_root: execution_root.to_string_lossy().to_string(),
        repositories: bindings,
        errors: Vec::new(),
        complete: true,
        rolled_back: false,
    })
}

fn validate_live_binding(
    binding: &KanbanGitRepositoryBinding,
    require_worktree: bool,
) -> Result<(PathBuf, PathBuf), String> {
    let source = resolve_repository(Path::new(&binding.source_repository_path))?;
    let worktree = PathBuf::from(&binding.worktree_path);
    if require_worktree && !worktree.is_dir() {
        return Err("Kanban worktree is missing".into());
    }
    if worktree.is_dir() {
        let metadata = fs::symlink_metadata(&worktree)
            .map_err(|error| format!("Unable to inspect Kanban worktree: {error}"))?;
        if metadata.file_type().is_symlink() {
            return Err("Kanban worktree path cannot be a symbolic link".into());
        }
        if common_git_directory(&source)? != common_git_directory(&worktree)? {
            return Err("Kanban worktree no longer belongs to its source repository".into());
        }
        let branch = current_branch(&worktree)?;
        if branch != binding.card_branch {
            return Err(format!(
                "Kanban worktree is on {branch}, expected {}",
                binding.card_branch
            ));
        }
    }
    Ok((source, worktree))
}

fn parse_status(bytes: &[u8]) -> Result<Vec<KanbanGitFileStatus>, String> {
    let records = bytes
        .split(|byte| *byte == 0)
        .filter(|record| !record.is_empty())
        .collect::<Vec<_>>();
    let mut index = 0;
    let mut files = Vec::new();
    while index < records.len() {
        let record = records[index];
        index += 1;
        if record.len() < 4 || record[2] != b' ' {
            return Err("Git returned an invalid porcelain status entry".into());
        }
        let index_status = record[0] as char;
        let worktree_status = record[1] as char;
        let path = String::from_utf8_lossy(&record[3..]).to_string();
        let renamed = matches!(index_status, 'R' | 'C') || matches!(worktree_status, 'R' | 'C');
        let original_path = if renamed {
            let value = records
                .get(index)
                .ok_or_else(|| "Git returned incomplete rename status".to_string())?;
            index += 1;
            Some(String::from_utf8_lossy(value).to_string())
        } else {
            None
        };
        files.push(KanbanGitFileStatus {
            path,
            original_path,
            index_status: index_status.to_string(),
            worktree_status: worktree_status.to_string(),
            kind: status_kind(index_status, worktree_status).to_string(),
        });
    }
    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
}

fn status_is_conflicted(index: char, worktree: char) -> bool {
    matches!(index, 'U')
        || matches!(worktree, 'U')
        || matches!(
            (index, worktree),
            ('A', 'A') | ('D', 'D') | ('A', 'U') | ('U', 'D') | ('U', 'A') | ('D', 'U')
        )
}

fn status_kind(index: char, worktree: char) -> &'static str {
    if status_is_conflicted(index, worktree) {
        "conflicted"
    } else if index == '?' && worktree == '?' {
        "untracked"
    } else if matches!(index, 'R') || matches!(worktree, 'R') {
        "renamed"
    } else if matches!(index, 'C') || matches!(worktree, 'C') {
        "copied"
    } else if matches!(index, 'D') || matches!(worktree, 'D') {
        "deleted"
    } else if matches!(index, 'A') || matches!(worktree, 'A') {
        "added"
    } else {
        "modified"
    }
}

fn ahead_behind(repo: &Path, base: &str, head: &str) -> Result<(u64, u64), String> {
    let range = format!("{base}...{head}");
    let counts = git_checked(
        repo,
        &["rev-list", "--left-right", "--count", &range],
        "Unable to compare Git revisions",
    )?;
    let mut values = counts.split_whitespace();
    let behind = values
        .next()
        .ok_or_else(|| "Git returned invalid revision counts".to_string())?
        .parse::<u64>()
        .map_err(|_| "Git returned invalid revision counts".to_string())?;
    let ahead = values
        .next()
        .ok_or_else(|| "Git returned invalid revision counts".to_string())?
        .parse::<u64>()
        .map_err(|_| "Git returned invalid revision counts".to_string())?;
    Ok((ahead, behind))
}

fn base_branch_head(source: &Path, binding: &KanbanGitRepositoryBinding) -> Option<String> {
    let reference = format!("refs/heads/{}^{{commit}}", binding.base_branch);
    rev_parse(source, &reference).ok()
}

pub(crate) fn is_empty_root_commit(repo: &Path, commit: &str) -> Result<bool, String> {
    let revision = git_checked(
        repo,
        &["rev-list", "--parents", "-n", "1", commit],
        "Unable to inspect the Kanban base commit",
    )?;
    if revision.split_whitespace().count() != 1 {
        return Ok(false);
    }
    let commit_tree = rev_parse(repo, &format!("{commit}^{{tree}}"))?;
    let empty_tree = git_checked(repo, &["mktree"], "Unable to inspect the empty Git tree")?;
    Ok(commit_tree == empty_tree)
}

fn reconcile_blocking(binding: KanbanGitRepositoryBinding) -> KanbanGitReconcileResult {
    let mut result_binding = binding.clone();
    let mut result = KanbanGitReconcileResult {
        binding: binding.clone(),
        source_available: false,
        worktree_available: false,
        branch_available: false,
        branch_matches: false,
        base_branch_head: None,
        head_commit: None,
        target_moved: false,
        has_changes: false,
        has_conflicts: false,
    };
    let source = match resolve_repository(Path::new(&binding.source_repository_path)) {
        Ok(source) => {
            result.source_available = true;
            source
        }
        Err(message) => {
            result_binding.status = "sourceMissing".to_string();
            result_binding.error = Some(operation_error(
                Some(binding.source_repository_path.clone()),
                "source_missing",
                message,
                false,
            ));
            result.binding = result_binding;
            return result;
        }
    };
    result.branch_available = match branch_exists(&source, &binding.card_branch) {
        Ok(available) => available,
        Err(message) => {
            result_binding.status = "error".to_string();
            result_binding.error = Some(operation_error(
                Some(binding.source_repository_path.clone()),
                "branch_inspect_failed",
                message,
                false,
            ));
            result.binding = result_binding;
            return result;
        }
    };
    result.base_branch_head = base_branch_head(&source, &binding);
    let target_is_unborn = result.base_branch_head.is_none()
        && is_empty_root_commit(&source, &binding.base_commit).unwrap_or(false);
    result.target_moved = result
        .base_branch_head
        .as_deref()
        .is_some_and(|head| head != binding.base_commit);
    let worktree = Path::new(&binding.worktree_path);
    if !worktree.is_dir() {
        result_binding.status = if result.branch_available {
            "worktreeMissing".to_string()
        } else {
            "missing".to_string()
        };
        result_binding.error = Some(operation_error(
            Some(binding.source_repository_path.clone()),
            "worktree_missing",
            "Kanban worktree is missing",
            false,
        ));
        result.binding = result_binding;
        return result;
    }
    result.worktree_available = true;
    match common_git_directory(&source).and_then(|source_common| {
        common_git_directory(worktree).map(|worktree_common| source_common == worktree_common)
    }) {
        Ok(true) => {}
        Ok(false) | Err(_) => {
            result_binding.status = "repositoryMismatch".to_string();
            result_binding.error = Some(operation_error(
                Some(binding.source_repository_path.clone()),
                "repository_mismatch",
                "Worktree no longer belongs to its source repository",
                false,
            ));
            result.binding = result_binding;
            return result;
        }
    }
    result.branch_matches =
        current_branch(worktree).is_ok_and(|branch| branch == binding.card_branch);
    if !result.branch_matches {
        result_binding.status = "branchMismatch".to_string();
        result_binding.error = Some(operation_error(
            Some(binding.source_repository_path.clone()),
            "branch_mismatch",
            "Worktree is not on its recorded Kanban branch",
            false,
        ));
        result.binding = result_binding;
        return result;
    }
    result.head_commit = match rev_parse(worktree, "HEAD^{commit}") {
        Ok(commit) => Some(commit),
        Err(message) => {
            result_binding.status = "error".to_string();
            result_binding.error = Some(operation_error(
                Some(binding.source_repository_path.clone()),
                "head_missing",
                message,
                false,
            ));
            result.binding = result_binding;
            return result;
        }
    };
    let bytes = match git_checked_bytes(
        worktree,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        "Unable to read Git status",
    ) {
        Ok(bytes) => bytes,
        Err(message) => {
            result_binding.status = "error".to_string();
            result_binding.error = Some(operation_error(
                Some(binding.source_repository_path.clone()),
                "status_failed",
                message,
                false,
            ));
            result.binding = result_binding;
            return result;
        }
    };
    let mut files = match parse_status(&bytes) {
        Ok(files) => files,
        Err(message) => {
            result_binding.status = "error".to_string();
            result_binding.error = Some(operation_error(
                Some(binding.source_repository_path.clone()),
                "status_invalid",
                message,
                false,
            ));
            result.binding = result_binding;
            return result;
        }
    };
    if let Err(message) = append_case_only_renames(worktree, &mut files) {
        result_binding.status = "error".to_string();
        result_binding.error = Some(operation_error(
            Some(binding.source_repository_path.clone()),
            "case_status_failed",
            message,
            false,
        ));
        result.binding = result_binding;
        return result;
    }
    result.has_changes = !files.is_empty()
        || result
            .head_commit
            .as_deref()
            .is_some_and(|head| head != binding.base_commit);
    result.has_conflicts = files.iter().any(|file| file.kind == "conflicted");
    result_binding.status = if result.has_conflicts {
        "conflicted"
    } else if result.base_branch_head.is_none() && !target_is_unborn {
        "targetMissing"
    } else if result.target_moved {
        "targetMoved"
    } else {
        "ready"
    }
    .to_string();
    result_binding.error = None;
    result.binding = result_binding;
    result
}

fn status_blocking(binding: KanbanGitRepositoryBinding) -> Result<KanbanGitStatusResult, String> {
    let (source, worktree) = validate_live_binding(&binding, true)?;
    let bytes = git_checked_bytes(
        &worktree,
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        "Unable to read Git status",
    )?;
    let mut files = parse_status(&bytes)?;
    append_case_only_renames(&worktree, &mut files)?;
    let head_commit = rev_parse(&worktree, "HEAD^{commit}")?;
    let (ahead_of_base, behind_base) = ahead_behind(&worktree, &binding.base_commit, "HEAD")?;
    let target_head = base_branch_head(&source, &binding);
    let target_counts = target_head
        .as_deref()
        .map(|target| ahead_behind(&worktree, target, "HEAD"))
        .transpose()?;
    Ok(KanbanGitStatusResult {
        binding,
        head_commit,
        base_branch_head: target_head,
        ahead_of_base,
        behind_base,
        ahead_of_target: target_counts.map(|counts| counts.0),
        behind_target: target_counts.map(|counts| counts.1),
        has_changes: !files.is_empty() || ahead_of_base > 0 || behind_base > 0,
        has_conflicts: files.iter().any(|file| file.kind == "conflicted"),
        staged_count: files
            .iter()
            .filter(|file| file.index_status != " " && file.index_status != "?")
            .count(),
        unstaged_count: files
            .iter()
            .filter(|file| file.worktree_status != " " && file.worktree_status != "?")
            .count(),
        untracked_count: files.iter().filter(|file| file.kind == "untracked").count(),
        files,
    })
}

fn diff_untracked_file(
    worktree: &Path,
    path: &str,
    include_binary: bool,
) -> Result<String, String> {
    validate_snapshot_path(path)?;
    let mut command = Command::new("git");
    command.arg("-C").arg(worktree).args(["diff", "--no-index"]);
    if include_binary {
        command.arg("--binary");
    }
    let output = command
        .args(["--", null_device(), path])
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|error| format!("Unable to diff untracked file {path}: {error}"))?;
    if !matches!(output.status.code(), Some(0 | 1)) {
        return Err(format!(
            "Unable to diff untracked file {path}: {}",
            output_detail(&output)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[cfg(windows)]
fn null_device() -> &'static str {
    "NUL"
}

#[cfg(not(windows))]
fn null_device() -> &'static str {
    "/dev/null"
}

fn diff_blocking(request: KanbanGitDiffRequest) -> Result<KanbanGitDiffResult, String> {
    let (_, worktree) = validate_live_binding(&request.binding, true)?;
    let base_commit = request.binding.base_commit.clone();
    let mut args = vec!["diff", "--no-ext-diff", "--find-renames", "--find-copies"];
    if request.include_binary {
        args.push("--binary");
    }
    args.extend([request.binding.base_commit.as_str(), "--"]);
    let output = git_output(&worktree, &args)?;
    if !output.status.success() {
        return Err(format!(
            "Unable to read Kanban diff: {}",
            output_detail(&output)
        ));
    }
    let mut content = String::from_utf8_lossy(&output.stdout).to_string();
    let untracked = untracked_paths(&worktree)?;
    for path in &untracked {
        let file_diff = diff_untracked_file(&worktree, path, request.include_binary)?;
        if !content.is_empty() && !content.ends_with('\n') {
            content.push('\n');
        }
        content.push_str(&file_diff);
    }
    let head_commit = rev_parse(&worktree, "HEAD^{commit}")?;
    Ok(KanbanGitDiffResult {
        binding: request.binding,
        base_commit,
        head_commit,
        is_empty: content.trim().is_empty(),
        content,
        untracked_paths: untracked,
    })
}

fn file_diff_blocking(request: KanbanGitFileDiffRequest) -> Result<WorkspaceGitDiff, String> {
    let relative_path = validate_snapshot_path(request.file_path.trim())?;
    if relative_path.as_os_str().is_empty() {
        return Err("A file must be selected before its changes can be reviewed.".into());
    }

    let (_, worktree) = validate_live_binding(&request.binding, true)?;
    let canonical_worktree = fs::canonicalize(&worktree)
        .map_err(|error| format!("Unable to resolve the Kanban worktree: {error}"))?;
    let file_path = canonical_worktree.join(&relative_path);
    let git_path = relative_path.to_string_lossy().replace('\\', "/");
    let output = git_output(
        &worktree,
        &[
            "diff",
            "--no-ext-diff",
            "--find-renames",
            "--find-copies",
            request.binding.base_commit.as_str(),
            "--",
            git_path.as_str(),
        ],
    )?;
    if !output.status.success() {
        return Err(format!(
            "Unable to read the selected Kanban file diff: {}",
            output_detail(&output)
        ));
    }

    let mut content = String::from_utf8_lossy(&output.stdout).to_string();
    let base = read_git_object_preview(
        &worktree,
        &format!("{}:{git_path}", request.binding.base_commit),
    )?
    .unwrap_or_else(empty_preview_text);
    let head = if file_path.exists() {
        read_workspace_file_preview_text(&canonical_worktree, &file_path)?
    } else {
        empty_preview_text()
    };
    let is_untracked = content.trim().is_empty() && file_path.exists() && base.content.is_empty();
    if is_untracked {
        content = diff_untracked_file(&worktree, &git_path, true)?;
    }
    let is_binary = git_diff_is_binary(&content) || base.is_binary || head.is_binary;
    let kind = if is_untracked {
        "untracked"
    } else {
        "unstaged"
    };

    Ok(WorkspaceGitDiff {
        path: file_path.to_string_lossy().to_string(),
        relative_path: git_path.clone(),
        sections: vec![WorkspaceGitDiffSection {
            kind: kind.to_string(),
            title: "Card changes".to_string(),
            base_label: format!("{}:{git_path}", request.binding.base_branch),
            head_label: format!("{}:{git_path}", request.binding.card_branch),
            base_content: base.content,
            head_content: head.content,
            base_truncated: base.truncated,
            head_truncated: head.truncated,
            content,
            is_binary,
        }],
    })
}

fn commit_blocking(request: KanbanGitCommitRequest) -> Result<KanbanGitActionResult, String> {
    let (_, worktree) = validate_live_binding(&request.binding, true)?;
    let message = request.message.trim();
    if message.is_empty() || message.len() > 10_000 || message.contains('\0') {
        return Err("Commit message must contain between 1 and 10,000 characters".into());
    }
    if request.stage_all {
        stage_case_only_renames(&worktree, None)?;
        git_checked(
            &worktree,
            &["add", "--all", "--"],
            "Unable to stage Kanban changes",
        )?;
    }
    let staged = git_output(&worktree, &["diff", "--cached", "--quiet", "--"])?;
    match staged.status.code() {
        Some(0) => return Err("There are no staged changes to commit".into()),
        Some(1) => {}
        _ => {
            return Err(format!(
                "Unable to inspect staged changes: {}",
                output_detail(&staged)
            ))
        }
    }
    let output = git_output(&worktree, &["commit", "-m", message])?;
    if !output.status.success() {
        return Err(format!(
            "Unable to commit Kanban changes: {}",
            output_detail(&output)
        ));
    }
    let head_commit = rev_parse(&worktree, "HEAD^{commit}")?;
    let mut binding = request.binding;
    binding.status = "ready".to_string();
    binding.error = None;
    Ok(KanbanGitActionResult {
        branch: binding.card_branch.clone(),
        binding,
        status: "committed".to_string(),
        message: output_detail(&output),
        head_commit,
    })
}

fn push_blocking(binding: KanbanGitRepositoryBinding) -> Result<KanbanGitActionResult, String> {
    let (_, worktree) = validate_live_binding(&binding, true)?;
    let upstream = git_checked(
        &worktree,
        &[
            "for-each-ref",
            "--format=%(upstream:short)",
            &format!("refs/heads/{}", binding.card_branch),
        ],
        "Unable to inspect branch upstream",
    )?;
    let output = if upstream.trim().is_empty() {
        git_checked(
            &worktree,
            &["remote", "get-url", "origin"],
            "No origin remote is configured",
        )?;
        git_output(
            &worktree,
            &["push", "--porcelain", "-u", "origin", &binding.card_branch],
        )?
    } else {
        git_output(&worktree, &["push", "--porcelain"])?
    };
    if !output.status.success() {
        return Err(format!(
            "Unable to push Kanban branch: {}",
            output_detail(&output)
        ));
    }
    let head_commit = rev_parse(&worktree, "HEAD^{commit}")?;
    Ok(KanbanGitActionResult {
        branch: binding.card_branch.clone(),
        binding,
        status: "pushed".to_string(),
        message: output_detail(&output),
        head_commit,
    })
}

#[derive(Debug)]
struct ListedWorktree {
    path: PathBuf,
    branch: Option<String>,
}

fn list_worktrees(source: &Path) -> Result<Vec<ListedWorktree>, String> {
    let output = git_checked(
        source,
        &["worktree", "list", "--porcelain"],
        "Unable to list Git worktrees",
    )?;
    let mut result = Vec::new();
    let mut path = None;
    let mut branch = None;
    for line in output.lines().chain(std::iter::once("")) {
        if let Some(value) = line.strip_prefix("worktree ") {
            path = Some(PathBuf::from(value));
        } else if let Some(value) = line.strip_prefix("branch refs/heads/") {
            branch = Some(value.to_string());
        } else if line.is_empty() {
            if let Some(path) = path.take() {
                result.push(ListedWorktree {
                    path,
                    branch: branch.take(),
                });
            }
        }
    }
    Ok(result)
}

fn merge_base_is_ancestor(repo: &Path, ancestor: &str, descendant: &str) -> Result<bool, String> {
    let output = git_output(repo, &["merge-base", "--is-ancestor", ancestor, descendant])?;
    match output.status.code() {
        Some(0) => Ok(true),
        Some(1) => Ok(false),
        _ => Err(format!(
            "Unable to compare merge ancestry: {}",
            output_detail(&output)
        )),
    }
}

fn conflict_paths(repo: &Path) -> Vec<String> {
    git_checked(
        repo,
        &["diff", "--name-only", "--diff-filter=U", "--"],
        "Unable to list merge conflicts",
    )
    .map(|paths| paths.lines().map(str::to_string).collect())
    .unwrap_or_default()
}

fn remove_temporary_worktree(source: &Path, worktree: &Path) {
    let _ = git_output(worktree, &["merge", "--abort"]);
    let _ = remove_worktree(source, worktree, true);
}

fn preflight_non_fast_forward_merge(
    source: &Path,
    execution_root: &Path,
    target_commit: &str,
    card_head: &str,
) -> Result<Vec<String>, String> {
    let path = execution_root.join(format!(".merge-preflight-{}", Uuid::new_v4()));
    let path_arg = path.to_string_lossy().to_string();
    let add = git_output(
        source,
        &["worktree", "add", "--detach", &path_arg, target_commit],
    )?;
    if !add.status.success() {
        return Err(format!(
            "Unable to create merge preflight worktree: {}",
            output_detail(&add)
        ));
    }
    let merge = git_output(&path, &["merge", "--no-ff", "--no-commit", card_head]);
    let result = match merge {
        Ok(output) if output.status.success() => Ok(Vec::new()),
        Ok(output) => {
            let conflicts = conflict_paths(&path);
            if conflicts.is_empty() {
                Err(format!(
                    "Unable to preflight merge: {}",
                    output_detail(&output)
                ))
            } else {
                Ok(conflicts)
            }
        }
        Err(error) => Err(error),
    };
    remove_temporary_worktree(source, &path);
    result
}

fn merge_blocking(request: KanbanGitMergeRequest) -> Result<KanbanGitMergeResult, String> {
    let (source, card_worktree) = validate_live_binding(&request.binding, true)?;
    if repository_is_dirty(&card_worktree)? {
        return Err("Commit or discard all card worktree changes before merging".into());
    }
    let target_head = base_branch_head(&source, &request.binding)
        .ok_or_else(|| "The captured merge target branch no longer exists".to_string())?;
    if target_head != request.binding.base_commit {
        return Err(format!(
            "Merge target {} moved from {} to {}; update the card explicitly before retrying",
            request.binding.base_branch, request.binding.base_commit, target_head
        ));
    }
    let card_head = rev_parse(&card_worktree, "HEAD^{commit}")?;
    let fast_forward = merge_base_is_ancestor(&source, &target_head, &card_head)?;
    let execution_root = Path::new(&request.binding.execution_root);
    if !fast_forward {
        let conflicts =
            preflight_non_fast_forward_merge(&source, execution_root, &target_head, &card_head)?;
        if !conflicts.is_empty() {
            let mut binding = request.binding;
            binding.status = "conflicted".to_string();
            binding.error = Some(operation_error(
                Some(binding.source_repository_path.clone()),
                "merge_conflict",
                "The card conflicts with its captured target branch",
                false,
            ));
            return Ok(KanbanGitMergeResult {
                target_branch: binding.base_branch.clone(),
                target_head,
                binding,
                status: "conflicted".to_string(),
                merge_kind: None,
                conflict_paths: conflicts,
                message: "Merge conflicts were detected in an isolated preflight worktree; the target was not changed".to_string(),
            });
        }
    }

    let existing_target_worktree = list_worktrees(&source)?
        .into_iter()
        .find(|worktree| worktree.branch.as_deref() == Some(request.binding.base_branch.as_str()));
    let (target_worktree, temporary) = if let Some(worktree) = existing_target_worktree {
        (worktree.path, false)
    } else {
        let path = execution_root.join(format!(".merge-target-{}", Uuid::new_v4()));
        let path_arg = path.to_string_lossy().to_string();
        let add = git_output(
            &source,
            &["worktree", "add", &path_arg, &request.binding.base_branch],
        )?;
        if !add.status.success() {
            return Err(format!(
                "Unable to create target merge worktree: {}",
                output_detail(&add)
            ));
        }
        (path, true)
    };
    if repository_is_dirty(&target_worktree)? {
        if temporary {
            remove_temporary_worktree(&source, &target_worktree);
        }
        return Err("The merge target worktree is dirty; clean it before merging".into());
    }
    let current_target_head = rev_parse(&target_worktree, "HEAD^{commit}")?;
    if current_target_head != request.binding.base_commit {
        if temporary {
            remove_temporary_worktree(&source, &target_worktree);
        }
        return Err("The merge target moved during preflight; no merge was performed".into());
    }
    let merge_message = request
        .message
        .as_deref()
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| {
            format!(
                "Merge {} into {}",
                request.binding.card_branch, request.binding.base_branch
            )
        });
    if merge_message.len() > 10_000 || merge_message.contains('\0') {
        if temporary {
            remove_temporary_worktree(&source, &target_worktree);
        }
        return Err("Merge message cannot exceed 10,000 characters".into());
    }
    let merge = if fast_forward {
        git_output(&target_worktree, &["merge", "--ff-only", &card_head])?
    } else {
        git_output(
            &target_worktree,
            &["merge", "--no-ff", "-m", &merge_message, &card_head],
        )?
    };
    if !merge.status.success() {
        let conflicts = conflict_paths(&target_worktree);
        let _ = git_output(&target_worktree, &["merge", "--abort"]);
        if temporary {
            remove_temporary_worktree(&source, &target_worktree);
        }
        if !conflicts.is_empty() {
            let mut binding = request.binding;
            binding.status = "conflicted".to_string();
            binding.error = Some(operation_error(
                Some(binding.source_repository_path.clone()),
                "merge_conflict",
                output_detail(&merge),
                false,
            ));
            return Ok(KanbanGitMergeResult {
                target_branch: binding.base_branch.clone(),
                target_head,
                binding,
                status: "conflicted".to_string(),
                merge_kind: None,
                conflict_paths: conflicts,
                message: "The target changed during merge; Git restored it to its pre-merge state"
                    .to_string(),
            });
        }
        return Err(format!(
            "Unable to merge Kanban branch: {}",
            output_detail(&merge)
        ));
    }
    let merged_head = rev_parse(&target_worktree, "HEAD^{commit}")?;
    if temporary {
        remove_temporary_worktree(&source, &target_worktree);
    }
    let mut binding = request.binding;
    // A successful merge is an explicit target update. Advancing the captured
    // base lets a later request-changes turn add commits and merge again while
    // preserving the target-movement guard for all external changes.
    binding.base_commit = merged_head.clone();
    binding.status = "merged".to_string();
    binding.error = None;
    Ok(KanbanGitMergeResult {
        target_branch: binding.base_branch.clone(),
        target_head: merged_head,
        binding,
        status: "merged".to_string(),
        merge_kind: Some(
            if fast_forward {
                "fastForward"
            } else {
                "mergeCommit"
            }
            .to_string(),
        ),
        conflict_paths: Vec::new(),
        message: output_detail(&merge),
    })
}

fn remove_empty_worktree_parents(worktree: &Path, execution_root: &Path) {
    let mut current = worktree.parent();
    while let Some(directory) = current {
        if directory == execution_root {
            break;
        }
        if !directory.starts_with(execution_root) || fs::remove_dir(directory).is_err() {
            break;
        }
        current = directory.parent();
    }
}

fn remove_empty_execution_root(execution_root: &Path) -> bool {
    if !execution_root.is_dir() {
        return false;
    }
    let is_empty = execution_root
        .read_dir()
        .map(|mut entries| entries.next().is_none())
        .unwrap_or(false);
    is_empty && fs::remove_dir(execution_root).is_ok()
}

fn cleanup_blocking(request: KanbanGitCleanupRequest) -> Result<KanbanGitCleanupResult, String> {
    let (source, worktree) = validate_live_binding(&request.binding, false)?;
    let mut errors = Vec::new();
    let mut worktree_removed = false;
    let mut branch_deleted = false;

    if worktree.is_dir() {
        if repository_is_dirty(&worktree)? && !request.force {
            errors.push(operation_error(
                Some(request.binding.source_repository_path.clone()),
                "dirty_worktree",
                "Kanban worktree has uncommitted changes; cleanup requires force=true",
                false,
            ));
            return Ok(KanbanGitCleanupResult {
                binding: request.binding,
                status: "blocked".to_string(),
                worktree_removed,
                branch_deleted,
                execution_root_removed: false,
                errors,
            });
        }
        match remove_worktree(&source, &worktree, request.force) {
            Ok(()) => {
                worktree_removed = true;
                remove_empty_worktree_parents(
                    &worktree,
                    Path::new(&request.binding.execution_root),
                );
            }
            Err(message) => errors.push(operation_error(
                Some(request.binding.source_repository_path.clone()),
                "worktree_remove_failed",
                message,
                true,
            )),
        }
    } else {
        let _ = git_output(&source, &["worktree", "prune"]);
        worktree_removed = true;
        remove_empty_worktree_parents(&worktree, Path::new(&request.binding.execution_root));
    }

    if request.delete_branch && worktree_removed {
        match branch_exists(&source, &request.binding.card_branch) {
            Ok(false) => branch_deleted = true,
            Ok(true) => match delete_branch(&source, &request.binding.card_branch, request.force) {
                Ok(()) => branch_deleted = true,
                Err(message) => errors.push(operation_error(
                    Some(request.binding.source_repository_path.clone()),
                    "branch_delete_failed",
                    message,
                    false,
                )),
            },
            Err(message) => errors.push(operation_error(
                Some(request.binding.source_repository_path.clone()),
                "branch_inspect_failed",
                message,
                false,
            )),
        }
    }

    let execution_root_removed = if worktree_removed {
        remove_empty_execution_root(Path::new(&request.binding.execution_root))
    } else {
        false
    };
    let mut binding = request.binding;
    binding.status = if errors.is_empty() {
        "cleaned"
    } else {
        "cleanupRequired"
    }
    .to_string();
    binding.error = errors.first().cloned();
    Ok(KanbanGitCleanupResult {
        binding,
        status: if errors.is_empty() {
            "cleaned"
        } else {
            "partial"
        }
        .to_string(),
        worktree_removed,
        branch_deleted,
        execution_root_removed,
        errors,
    })
}

async fn run_blocking<T, F>(operation: &'static str, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("Failed to {operation}: {error}"))?
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn kanban_git_provision(
    app: AppHandle,
    request: KanbanGitProvisionRequest,
) -> Result<KanbanGitProvisionResult, String> {
    let root = cards_root(&app)?;
    run_blocking("provision Kanban worktrees", move || {
        provision_blocking(&root, request)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn kanban_git_reconcile(
    app: AppHandle,
    request: KanbanGitBindingRequest,
) -> Result<KanbanGitReconcileResult, String> {
    let root = cards_root(&app)?;
    validate_command_binding(&root, &request.binding)?;
    run_blocking("reconcile a Kanban worktree", move || {
        Ok(reconcile_blocking(request.binding))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn kanban_git_status(
    app: AppHandle,
    request: KanbanGitBindingRequest,
) -> Result<KanbanGitStatusResult, String> {
    let root = cards_root(&app)?;
    validate_command_binding(&root, &request.binding)?;
    run_blocking("read Kanban Git status", move || {
        status_blocking(request.binding)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn kanban_git_diff(
    app: AppHandle,
    request: KanbanGitDiffRequest,
) -> Result<KanbanGitDiffResult, String> {
    let root = cards_root(&app)?;
    validate_command_binding(&root, &request.binding)?;
    run_blocking("read a Kanban Git diff", move || diff_blocking(request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn kanban_git_file_diff(
    app: AppHandle,
    request: KanbanGitFileDiffRequest,
) -> Result<WorkspaceGitDiff, String> {
    let root = cards_root(&app)?;
    validate_command_binding(&root, &request.binding)?;
    run_blocking("read a Kanban file diff", move || {
        file_diff_blocking(request)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn kanban_git_commit(
    app: AppHandle,
    request: KanbanGitCommitRequest,
) -> Result<KanbanGitActionResult, String> {
    let root = cards_root(&app)?;
    validate_command_binding(&root, &request.binding)?;
    run_blocking("commit Kanban changes", move || commit_blocking(request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn kanban_git_push(
    app: AppHandle,
    request: KanbanGitBindingRequest,
) -> Result<KanbanGitActionResult, String> {
    let root = cards_root(&app)?;
    validate_command_binding(&root, &request.binding)?;
    run_blocking("push a Kanban branch", move || {
        push_blocking(request.binding)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn kanban_git_merge(
    app: AppHandle,
    request: KanbanGitMergeRequest,
) -> Result<KanbanGitMergeResult, String> {
    let root = cards_root(&app)?;
    validate_command_binding(&root, &request.binding)?;
    run_blocking("merge a Kanban branch", move || merge_blocking(request)).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn kanban_git_cleanup(
    app: AppHandle,
    request: KanbanGitCleanupRequest,
) -> Result<KanbanGitCleanupResult, String> {
    let root = cards_root(&app)?;
    validate_command_binding(&root, &request.binding)?;
    run_blocking("clean up a Kanban worktree", move || {
        cleanup_blocking(request)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_directory(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "orchestrator-kanban-{label}-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create temp directory");
        path
    }

    fn run(repo: &Path, args: &[&str]) -> String {
        git_checked(repo, args, "test Git command").expect("Git command succeeds")
    }

    fn init_repository(label: &str) -> PathBuf {
        let repo = temp_directory(label);
        run(&repo, &["init", "-b", "main"]);
        run(&repo, &["config", "user.name", "Kanban Test"]);
        run(&repo, &["config", "user.email", "kanban@example.test"]);
        fs::write(repo.join("README.md"), "base\n").expect("write base file");
        run(&repo, &["add", "README.md"]);
        run(&repo, &["commit", "-m", "Initial commit"]);
        repo
    }

    fn init_unborn_repository(label: &str) -> PathBuf {
        let repo = temp_directory(label);
        run(&repo, &["init", "-b", "main"]);
        repo
    }

    fn provision(
        root: &Path,
        repo: &Path,
        card_id: &str,
        include_dirty: bool,
    ) -> KanbanGitProvisionResult {
        provision_blocking(
            root,
            KanbanGitProvisionRequest {
                card_id: card_id.to_string(),
                card_slug: Some("Implement feature".to_string()),
                repositories: vec![KanbanGitRepositorySelection {
                    repository_path: repo.to_string_lossy().to_string(),
                    relative_path: Some("repository".to_string()),
                    include_dirty_changes: include_dirty,
                }],
            },
        )
        .expect("provision result")
    }

    fn remove_test_directory(path: &Path) {
        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn provisioning_creates_isolated_branch_and_worktree() {
        let repo = init_repository("provision-source");
        let cards = temp_directory("provision-cards");
        let result = provision(&cards, &repo, "card-123", false);
        assert!(result.complete);
        assert_eq!(result.repositories.len(), 1);
        let binding = &result.repositories[0];
        assert_eq!(binding.base_branch, "main");
        assert_eq!(binding.card_branch, "codex/implement-feature");
        assert!(Path::new(&binding.worktree_path).is_dir());
        assert_eq!(
            current_branch(Path::new(&binding.worktree_path)).unwrap(),
            binding.card_branch
        );
        assert_eq!(current_branch(&repo).unwrap(), "main");

        cleanup_blocking(KanbanGitCleanupRequest {
            binding: binding.clone(),
            delete_branch: true,
            force: true,
        })
        .expect("cleanup");
        remove_test_directory(&repo);
        remove_test_directory(&cards);
    }

    #[test]
    fn provisioning_supports_an_unborn_source_without_committing_to_it() {
        let repo = init_unborn_repository("unborn-source");
        let cards = temp_directory("unborn-cards");
        let result = provision(&cards, &repo, "unborn-card", false);

        assert!(result.complete);
        assert!(result.errors.is_empty());
        assert_eq!(result.repositories.len(), 1);
        let binding = &result.repositories[0];
        let worktree = Path::new(&binding.worktree_path);
        assert_eq!(binding.base_branch, "main");
        assert_eq!(binding.card_branch, "codex/implement-feature");
        assert_eq!(current_branch(worktree).unwrap(), binding.card_branch);
        assert_eq!(
            rev_parse(worktree, "HEAD^{commit}").unwrap(),
            binding.base_commit
        );
        assert_eq!(optional_head_commit(&repo).unwrap(), None);
        assert_eq!(current_branch(&repo).unwrap(), "main");
        assert!(!repository_is_dirty(worktree).unwrap());
        let reconciled = reconcile_blocking(binding.clone());
        assert_eq!(reconciled.binding.status, "ready");
        assert!(reconciled.worktree_available);
        assert!(!reconciled.target_moved);
        let status = status_blocking(binding.clone()).expect("read unborn card status");
        assert_eq!(status.head_commit, binding.base_commit);
        assert_eq!(status.base_branch_head, None);
        assert!(!status.has_changes);

        cleanup_blocking(KanbanGitCleanupRequest {
            binding: binding.clone(),
            delete_branch: true,
            force: true,
        })
        .expect("cleanup");
        remove_test_directory(&repo);
        remove_test_directory(&cards);
    }

    #[test]
    fn provisioning_uses_collision_safe_branch_suffix() {
        let repo = init_repository("collision-source");
        let cards = temp_directory("collision-cards");
        run(&repo, &["branch", "codex/implement-feature"]);
        let result = provision(&cards, &repo, "card-456", false);
        assert!(result.complete);
        assert_eq!(
            result.repositories[0].card_branch,
            "codex/implement-feature-2"
        );
        cleanup_blocking(KanbanGitCleanupRequest {
            binding: result.repositories[0].clone(),
            delete_branch: true,
            force: true,
        })
        .expect("cleanup");
        run(&repo, &["branch", "-D", "codex/implement-feature"]);
        remove_test_directory(&repo);
        remove_test_directory(&cards);
    }

    #[test]
    fn dirty_source_changes_are_excluded_by_default_and_copyable_explicitly() {
        let repo = init_repository("dirty-source");
        fs::write(repo.join("README.md"), "changed\n").expect("edit tracked file");
        fs::write(repo.join("new.txt"), "untracked\n").expect("write untracked file");
        let excluded_cards = temp_directory("dirty-excluded-cards");
        let excluded = provision(&excluded_cards, &repo, "dirty-excluded", false);
        let excluded_worktree = Path::new(&excluded.repositories[0].worktree_path);
        assert_eq!(
            fs::read_to_string(excluded_worktree.join("README.md")).unwrap(),
            "base\n"
        );
        assert!(!excluded_worktree.join("new.txt").exists());
        assert_eq!(
            excluded.repositories[0].status,
            "readySourceChangesExcluded"
        );
        assert!(excluded.repositories[0].source_status_fingerprint.is_none());
        assert!(
            !status_blocking(excluded.repositories[0].clone())
                .expect("read excluded status")
                .has_changes
        );

        let included_cards = temp_directory("dirty-included-cards");
        let included = provision(&included_cards, &repo, "dirty-included", true);
        let included_worktree = Path::new(&included.repositories[0].worktree_path);
        assert_eq!(
            fs::read_to_string(included_worktree.join("README.md")).unwrap(),
            "changed\n"
        );
        assert_eq!(
            fs::read_to_string(included_worktree.join("new.txt")).unwrap(),
            "untracked\n"
        );

        for binding in [
            excluded.repositories[0].clone(),
            included.repositories[0].clone(),
        ] {
            cleanup_blocking(KanbanGitCleanupRequest {
                binding,
                delete_branch: true,
                force: true,
            })
            .expect("cleanup");
        }
        remove_test_directory(&repo);
        remove_test_directory(&excluded_cards);
        remove_test_directory(&included_cards);
    }

    #[test]
    fn cleanup_refuses_to_discard_dirty_work_without_force() {
        let repo = init_repository("cleanup-source");
        let cards = temp_directory("cleanup-cards");
        let result = provision(&cards, &repo, "cleanup-card", false);
        let binding = result.repositories[0].clone();
        fs::write(
            Path::new(&binding.worktree_path).join("README.md"),
            "valuable\n",
        )
        .expect("write card change");
        let blocked = cleanup_blocking(KanbanGitCleanupRequest {
            binding: binding.clone(),
            delete_branch: true,
            force: false,
        })
        .expect("cleanup result");
        assert_eq!(blocked.status, "blocked");
        assert!(Path::new(&binding.worktree_path).exists());
        cleanup_blocking(KanbanGitCleanupRequest {
            binding,
            delete_branch: true,
            force: true,
        })
        .expect("forced cleanup");
        remove_test_directory(&repo);
        remove_test_directory(&cards);
    }

    #[test]
    fn status_diff_commit_and_reconcile_cover_committed_and_untracked_changes() {
        let repo = init_repository("review-source");
        let cards = temp_directory("review-cards");
        let result = provision(&cards, &repo, "review-card", false);
        let binding = result.repositories[0].clone();
        let worktree = Path::new(&binding.worktree_path);
        fs::write(worktree.join("README.md"), "updated\n").expect("edit tracked file");
        fs::write(worktree.join("new.txt"), "new file\n").expect("write untracked file");

        let status = status_blocking(binding.clone()).expect("read status");
        assert!(status.has_changes);
        assert!(status.has_uncommitted_changes());
        assert_eq!(status.untracked_count, 1);
        assert!(status.files.iter().any(|file| file.path == "README.md"));
        assert!(status.files.iter().any(|file| file.path == "new.txt"));

        let diff = diff_blocking(KanbanGitDiffRequest {
            binding: binding.clone(),
            include_binary: true,
        })
        .expect("read diff");
        assert!(diff.content.contains("updated"));
        assert!(diff.content.contains("new file"));
        assert_eq!(diff.untracked_paths, vec!["new.txt"]);

        let tracked_file_diff = file_diff_blocking(KanbanGitFileDiffRequest {
            binding: binding.clone(),
            file_path: "README.md".to_string(),
        })
        .expect("read tracked file diff");
        assert_eq!(tracked_file_diff.relative_path, "README.md");
        assert_eq!(tracked_file_diff.sections[0].head_content, "updated\n");
        assert!(tracked_file_diff.sections[0].content.contains("updated"));

        let untracked_file_diff = file_diff_blocking(KanbanGitFileDiffRequest {
            binding: binding.clone(),
            file_path: "new.txt".to_string(),
        })
        .expect("read untracked file diff");
        assert_eq!(untracked_file_diff.sections[0].kind, "untracked");
        assert_eq!(untracked_file_diff.sections[0].head_content, "new file\n");

        let committed = commit_blocking(KanbanGitCommitRequest {
            binding: binding.clone(),
            message: "Update review files".to_string(),
            stage_all: true,
        })
        .expect("commit changes");
        assert_eq!(committed.status, "committed");
        let committed_status = status_blocking(binding.clone()).expect("read committed status");
        assert_eq!(committed_status.ahead_of_base, 1);
        assert!(committed_status.has_changes);
        assert!(!committed_status.has_uncommitted_changes());
        assert!(committed_status.files.is_empty());
        let committed_file_diff = file_diff_blocking(KanbanGitFileDiffRequest {
            binding: binding.clone(),
            file_path: "README.md".to_string(),
        })
        .expect("read committed file diff");
        assert!(committed_file_diff.sections[0].content.contains("updated"));
        let reconciled = reconcile_blocking(binding.clone());
        assert_eq!(reconciled.binding.status, "ready");
        assert!(reconciled.has_changes);

        cleanup_blocking(KanbanGitCleanupRequest {
            binding,
            delete_branch: true,
            force: true,
        })
        .expect("cleanup");
        remove_test_directory(&repo);
        remove_test_directory(&cards);
    }

    #[test]
    fn source_repository_changes_do_not_invalidate_card_status() {
        let repo = init_repository("source-boundary-source");
        let cards = temp_directory("source-boundary-cards");
        let result = provision(&cards, &repo, "source-boundary-card", false);
        let binding = result.repositories[0].clone();

        let initial = status_blocking(binding.clone()).expect("read initial status");
        assert_eq!(
            initial.base_branch_head.as_deref(),
            Some(binding.base_commit.as_str())
        );
        assert!(!initial.has_changes);

        fs::write(repo.join("outside.txt"), "outside worktree\n")
            .expect("write source-only change");
        let dirty_source = status_blocking(binding.clone()).expect("read dirty source status");
        assert!(!dirty_source.has_changes);
        assert!(dirty_source.files.is_empty());

        run(&repo, &["add", "outside.txt"]);
        run(&repo, &["commit", "-m", "Advance source main"]);
        fs::write(repo.join("source-only.tmp"), "untracked source file\n")
            .expect("write untracked source file");

        let advanced_source = status_blocking(binding.clone()).expect("read advanced status");
        assert_ne!(
            advanced_source.base_branch_head.as_deref(),
            Some(binding.base_commit.as_str())
        );
        assert!(!advanced_source.has_changes);
        assert!(advanced_source.files.is_empty());

        let reconciled = reconcile_blocking(binding.clone());
        assert!(reconciled.target_moved);
        assert_eq!(reconciled.binding.status, "targetMoved");

        cleanup_blocking(KanbanGitCleanupRequest {
            binding,
            delete_branch: true,
            force: true,
        })
        .expect("cleanup");
        remove_test_directory(&repo);
        remove_test_directory(&cards);
    }

    #[test]
    fn commit_handles_case_only_renames_in_card_worktrees() {
        let repo = init_repository("case-only-rename-source");
        let cards = temp_directory("case-only-rename-cards");
        let result = provision(&cards, &repo, "case-only-rename-card", false);
        let binding = result.repositories[0].clone();
        let worktree = Path::new(&binding.worktree_path);
        fs::rename(worktree.join("README.md"), worktree.join("readme.md"))
            .expect("rename tracked file casing");

        let status = status_blocking(binding.clone()).expect("read case-only status");
        assert!(status.has_changes);
        assert_eq!(status.unstaged_count, 1);
        assert!(status.files.iter().any(|file| {
            file.kind == "renamed"
                && file.path == "readme.md"
                && file.original_path.as_deref() == Some("README.md")
        }));

        commit_blocking(KanbanGitCommitRequest {
            binding: binding.clone(),
            message: "Normalize readme casing".to_string(),
            stage_all: true,
        })
        .expect("commit case-only rename");

        let tracked = run(worktree, &["ls-tree", "--name-only", "HEAD"]);
        assert!(tracked.lines().any(|path| path == "readme.md"));
        assert!(!tracked.lines().any(|path| path == "README.md"));
        assert!(run(worktree, &["status", "--porcelain"]).is_empty());

        cleanup_blocking(KanbanGitCleanupRequest {
            binding,
            delete_branch: true,
            force: true,
        })
        .expect("cleanup");
        remove_test_directory(&repo);
        remove_test_directory(&cards);
    }

    #[test]
    fn push_sets_origin_upstream_for_new_card_branch() {
        let repo = init_repository("push-source");
        let remote = temp_directory("push-remote");
        run(&remote, &["init", "--bare"]);
        run(
            &repo,
            &["remote", "add", "origin", remote.to_string_lossy().as_ref()],
        );
        let cards = temp_directory("push-cards");
        let result = provision(&cards, &repo, "push-card", false);
        let binding = result.repositories[0].clone();
        let worktree = Path::new(&binding.worktree_path);
        fs::write(worktree.join("pushed.txt"), "pushed\n").expect("write pushed file");
        commit_blocking(KanbanGitCommitRequest {
            binding: binding.clone(),
            message: "Add pushed file".to_string(),
            stage_all: true,
        })
        .expect("commit pushed file");
        let pushed = push_blocking(binding.clone()).expect("push card branch");
        assert_eq!(pushed.status, "pushed");
        assert_eq!(
            rev_parse(
                &remote,
                &format!("refs/heads/{}^{{commit}}", binding.card_branch)
            )
            .expect("remote branch"),
            pushed.head_commit
        );

        cleanup_blocking(KanbanGitCleanupRequest {
            binding,
            delete_branch: true,
            force: true,
        })
        .expect("cleanup");
        remove_test_directory(&repo);
        remove_test_directory(&remote);
        remove_test_directory(&cards);
    }

    #[test]
    fn merge_fast_forwards_captured_clean_target() {
        let repo = init_repository("merge-source");
        let cards = temp_directory("merge-cards");
        let result = provision(&cards, &repo, "merge-card", false);
        let binding = result.repositories[0].clone();
        let card_worktree = Path::new(&binding.worktree_path);
        fs::write(card_worktree.join("feature.txt"), "feature\n").expect("write feature");
        run(card_worktree, &["add", "feature.txt"]);
        run(card_worktree, &["commit", "-m", "Add feature"]);
        let status = status_blocking(binding.clone()).expect("read committed card status");
        assert!(status.has_changes);
        assert_eq!(status.ahead_of_base, 1);
        assert!(!status.has_uncommitted_changes());
        let merged = merge_blocking(KanbanGitMergeRequest {
            binding: binding.clone(),
            message: None,
        })
        .expect("merge succeeds");
        assert_eq!(merged.merge_kind.as_deref(), Some("fastForward"));
        assert_eq!(merged.binding.base_commit, merged.target_head);
        assert!(repo.join("feature.txt").is_file());
        cleanup_blocking(KanbanGitCleanupRequest {
            binding,
            delete_branch: true,
            force: false,
        })
        .expect("cleanup");
        remove_test_directory(&repo);
        remove_test_directory(&cards);
    }

    #[test]
    fn merge_rejects_external_target_movement() {
        let repo = init_repository("merge-moved-target-source");
        let cards = temp_directory("merge-moved-target-cards");
        let result = provision(&cards, &repo, "merge-moved-target-card", false);
        let binding = result.repositories[0].clone();
        let card_worktree = Path::new(&binding.worktree_path);
        fs::write(card_worktree.join("feature.txt"), "feature\n").expect("write feature");
        run(card_worktree, &["add", "feature.txt"]);
        run(card_worktree, &["commit", "-m", "Add feature"]);

        fs::write(repo.join("main.txt"), "new target work\n").expect("advance target");
        run(&repo, &["add", "main.txt"]);
        run(&repo, &["commit", "-m", "Advance target"]);
        let target_head = rev_parse(&repo, "HEAD^{commit}").expect("target head");

        let error = merge_blocking(KanbanGitMergeRequest {
            binding: binding.clone(),
            message: None,
        })
        .expect_err("moved target must not merge");
        assert!(error.contains("moved from"));
        assert_eq!(
            rev_parse(&repo, "HEAD^{commit}").expect("unchanged target"),
            target_head
        );
        assert!(!repo.join("feature.txt").exists());

        cleanup_blocking(KanbanGitCleanupRequest {
            binding,
            delete_branch: true,
            force: true,
        })
        .expect("cleanup");
        remove_test_directory(&repo);
        remove_test_directory(&cards);
    }

    #[test]
    fn merge_conflicts_are_detected_without_changing_target_worktree() {
        let repo = init_repository("merge-conflict-source");
        fs::write(repo.join("README.md"), "target version\n").expect("edit target");
        run(&repo, &["add", "README.md"]);
        run(&repo, &["commit", "-m", "Update target"]);
        let target_head_before = rev_parse(&repo, "HEAD^{commit}").expect("target head");
        let cards = temp_directory("merge-conflict-cards");
        let result = provision(&cards, &repo, "merge-conflict-card", false);
        let binding = result.repositories[0].clone();
        let card_worktree = Path::new(&binding.worktree_path);
        run(card_worktree, &["reset", "--hard", "HEAD^"]);
        fs::write(card_worktree.join("README.md"), "card version\n").expect("edit card");
        run(card_worktree, &["add", "README.md"]);
        run(card_worktree, &["commit", "-m", "Alternative card update"]);

        let merge = merge_blocking(KanbanGitMergeRequest {
            binding: binding.clone(),
            message: None,
        })
        .expect("conflict result");
        assert_eq!(merge.status, "conflicted");
        assert_eq!(merge.conflict_paths, vec!["README.md"]);
        assert_eq!(
            rev_parse(&repo, "HEAD^{commit}").expect("unchanged target"),
            target_head_before
        );
        assert_eq!(
            fs::read_to_string(repo.join("README.md")).expect("target content"),
            "target version\n"
        );
        assert!(!repository_is_dirty(&repo).expect("target status"));
        assert!(fs::read_dir(Path::new(&binding.execution_root))
            .expect("execution root")
            .all(|entry| !entry
                .expect("execution entry")
                .file_name()
                .to_string_lossy()
                .starts_with(".merge-")));

        cleanup_blocking(KanbanGitCleanupRequest {
            binding,
            delete_branch: true,
            force: true,
        })
        .expect("cleanup");
        remove_test_directory(&repo);
        remove_test_directory(&cards);
    }
}
