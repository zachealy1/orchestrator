use super::*;
use crate::kanban_git::KanbanGitRepositoryBinding;

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SourceControlTarget {
    pub workspace_path: String,
    pub repository_path: String,
    pub binding: Option<KanbanGitRepositoryBinding>,
}

struct ResolvedTarget {
    workspace: PathBuf,
    repository: DiscoveredGitRepository,
}

fn resolve_target(
    target: &SourceControlTarget,
    cards_root: Option<&Path>,
) -> Result<ResolvedTarget, String> {
    let workspace = canonical_workspace(&target.workspace_path)?;
    let repository = resolve_workspace_git_repository(&workspace, Some(&target.repository_path))?;
    if let Some(binding) = &target.binding {
        let root = cards_root.ok_or("The card worktree cannot be verified")?;
        crate::kanban_git::validate_command_binding(root, binding)?;
        let (source, worktree) = crate::kanban_git::validate_live_binding(binding, true)?;
        if source != repository.root {
            return Err("The card binding belongs to another repository".into());
        }
        let workspace = fs::canonicalize(worktree).map_err(|e| e.to_string())?;
        let repository = resolve_workspace_git_repository(&workspace, None)?;
        return Ok(ResolvedTarget {
            workspace,
            repository,
        });
    }
    Ok(ResolvedTarget {
        workspace,
        repository,
    })
}

// All application Git writers share this interlock, including the older commit dialogs.
static MUTATIONS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
pub(crate) struct GitMutationGuard(PathBuf);
impl Drop for GitMutationGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = MUTATIONS.get_or_init(Default::default).lock() {
            active.remove(&self.0);
        }
    }
}
pub(crate) fn acquire_git_mutation(root: &Path) -> Result<GitMutationGuard, String> {
    let common = git(root, &["rev-parse", "--git-common-dir"])?;
    let path = fs::canonicalize(root.join(common.trim())).map_err(|e| e.to_string())?;
    let mut active = MUTATIONS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| "Git operation lock is unavailable")?;
    if !active.insert(path.clone()) {
        return Err(
            "Another Git operation is running for this repository. Try again when it finishes."
                .into(),
        );
    }
    Ok(GitMutationGuard(path))
}

fn git(root: &Path, args: &[&str]) -> Result<String, String> {
    let mut options = vec![
        "-c",
        "core.quotePath=false",
        "-c",
        "core.sshCommand=ssh -oBatchMode=yes",
    ];
    options.extend_from_slice(args);
    let output = crate::kanban_git::git_output(root, &options)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn status(target: &ResolvedTarget) -> Result<WorkspaceGitRepositoryStatus, String> {
    let (repositories, _) = discover_git_repositories(&target.workspace, true)?;
    list_git_repository_status(&target.workspace, &target.repository, &repositories)
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SourceControlStatus {
    repository: WorkspaceGitRepositoryStatus,
    remotes: Vec<String>,
    upstream: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn source_control_status(
    app: AppHandle,
    target: SourceControlTarget,
) -> Result<SourceControlStatus, String> {
    let cards = crate::kanban_git::cards_root(&app)?;
    run_blocking_command("read source control", move || {
        let resolved = resolve_target(&target, Some(&cards))?;
        Ok(SourceControlStatus {
            repository: status(&resolved)?,
            remotes: git(&resolved.repository.root, &["remote"])?
                .lines()
                .map(str::to_string)
                .collect(),
            upstream: git(
                &resolved.repository.root,
                &[
                    "rev-parse",
                    "--abbrev-ref",
                    "--symbolic-full-name",
                    "@{upstream}",
                ],
            )
            .ok()
            .map(|s| s.trim().to_string()),
        })
    })
    .await
}

fn allowed_path(target: &ResolvedTarget, relative: &str) -> Result<PathBuf, String> {
    if relative.is_empty()
        || Path::new(relative).is_absolute()
        || relative.contains('\0')
        || Path::new(relative)
            .components()
            .any(|c| !matches!(c, std::path::Component::Normal(_)))
    {
        return Err("Choose a repository-relative file path".into());
    }
    let path = workspace_child_path_allow_missing(
        &target.workspace,
        &target.repository.root.join(relative).to_string_lossy(),
    )?;
    let (repositories, _) = discover_git_repositories(&target.workspace, false)?;
    if !path.starts_with(&target.repository.scope)
        || !git_repository_owns_workspace_path(&target.repository, &repositories, &path)
    {
        return Err("The selected file does not belong to this workspace repository".into());
    }
    Ok(path)
}

fn stage_files(
    target: &ResolvedTarget,
    paths: Option<Vec<String>>,
    stage: bool,
) -> Result<(), String> {
    let _guard = acquire_git_mutation(&target.repository.root)?;
    let snapshot = status(target)?;
    if paths.as_ref().is_some_and(|p| p.is_empty()) {
        return Err("Choose files to stage or unstage".into());
    }
    if let Some(paths) = &paths {
        for path in paths {
            allowed_path(target, path)?;
        }
    }
    let mut selected = Vec::new();
    for file in &snapshot.files {
        if paths
            .as_ref()
            .is_some_and(|paths| !paths.contains(&file.repository_relative_path))
        {
            continue;
        }
        if file.status_kind == "conflicted" {
            if paths.is_some() {
                return Err("Resolve this file's conflicts before staging it".into());
            }
            continue;
        }
        let eligible = if stage {
            !matches!(file.worktree_status.as_str(), " " | "") || file.status_kind == "untracked"
        } else {
            !matches!(file.index_status.as_str(), " " | "" | "?")
        };
        if !eligible {
            continue;
        }
        allowed_path(target, &file.repository_relative_path)?;
        selected.push(file.repository_relative_path.clone());
        if let Some(old) = &file.old_relative_path {
            let old_path = workspace_child_path_allow_missing(
                &target.workspace,
                &target.workspace.join(old).to_string_lossy(),
            )?;
            let relative = git_relative_path(&target.repository.root, &old_path)?;
            allowed_path(target, &relative)?;
            if !stage
                || git(
                    &target.repository.root,
                    &[
                        "--literal-pathspecs",
                        "ls-files",
                        "--error-unmatch",
                        "--",
                        &relative,
                    ],
                )
                .is_ok()
            {
                selected.push(relative);
            }
        }
    }
    selected.sort();
    selected.dedup();
    if selected.is_empty() {
        return Ok(());
    }
    let has_head = git(&target.repository.root, &["rev-parse", "--verify", "HEAD"]).is_ok();
    let mut args = if stage {
        vec!["--literal-pathspecs", "add", "-A", "--"]
    } else if has_head {
        vec!["--literal-pathspecs", "reset", "-q", "HEAD", "--"]
    } else {
        vec!["--literal-pathspecs", "rm", "--cached", "-r", "-f", "--"]
    };
    args.extend(selected.iter().map(String::as_str));
    git(&target.repository.root, &args)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn source_control_stage(
    app: AppHandle,
    target: SourceControlTarget,
    paths: Option<Vec<String>>,
    stage: bool,
) -> Result<(), String> {
    let cards = crate::kanban_git::cards_root(&app)?;
    run_blocking_command("update Git index", move || {
        stage_files(&resolve_target(&target, Some(&cards))?, paths, stage)
    })
    .await
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct GitHistoryRef {
    pub name: String,
    pub sha: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct GitHistoryCursor {
    pub repository_path: String,
    pub tips: Vec<String>,
    pub refs: Vec<GitHistoryRef>,
    pub offset: u32,
}
#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitHistoryCommit {
    pub sha: String,
    pub parents: Vec<String>,
    pub author: String,
    pub date: String,
    pub subject: String,
    pub refs: Vec<String>,
    pub is_shallow_boundary: bool,
}
#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitHistoryPage {
    pub commits: Vec<GitHistoryCommit>,
    pub cursor: Option<GitHistoryCursor>,
}

fn validate_oid(value: &str) -> Result<(), String> {
    if !matches!(value.len(), 40 | 64) || !value.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Git revisions must be full commit IDs".into());
    }
    Ok(())
}
fn ensure_commit(root: &Path, sha: &str) -> Result<(), String> {
    validate_oid(sha)?;
    if git(root, &["cat-file", "-t", sha])?.trim() != "commit" {
        return Err("The selected revision is not a commit".into());
    }
    Ok(())
}
fn snapshot_refs(root: &Path) -> Result<Vec<GitHistoryRef>, String> {
    let output = git(
        root,
        &[
            "for-each-ref",
            "--format=%(refname)%00%(objectname)%00%(*objectname)",
            "refs/heads",
            "refs/remotes",
            "refs/tags",
        ],
    )?;
    let mut refs = Vec::new();
    for line in output.lines() {
        let fields: Vec<_> = line.split('\0').collect();
        if fields.len() != 3 {
            continue;
        }
        let sha = if fields[2].is_empty() {
            fields[1]
        } else {
            fields[2]
        };
        if ensure_commit(root, sha).is_ok() {
            refs.push(GitHistoryRef {
                name: fields[0].into(),
                sha: sha.into(),
            });
        }
    }
    if let Ok(head) = git(root, &["rev-parse", "--verify", "HEAD"]) {
        refs.push(GitHistoryRef {
            name: "HEAD".into(),
            sha: head.trim().into(),
        });
    }
    Ok(refs)
}
fn parse_commits(output: &str, refs: &[GitHistoryRef]) -> Result<Vec<GitHistoryCommit>, String> {
    let fields: Vec<_> = output.trim_end_matches('\0').split('\0').collect();
    if output.is_empty() {
        return Ok(Vec::new());
    }
    if fields.len() % 5 != 0 {
        return Err("Git returned incomplete commit metadata".into());
    }
    fields
        .chunks_exact(5)
        .map(|fields| {
            let sha = fields[0].trim();
            validate_oid(sha)?;
            Ok(GitHistoryCommit {
                sha: sha.into(),
                parents: fields[1].split_whitespace().map(str::to_string).collect(),
                author: fields[2].into(),
                date: fields[3].into(),
                subject: fields[4].into(),
                refs: refs
                    .iter()
                    .filter(|r| r.sha == sha)
                    .map(|r| r.name.clone())
                    .collect(),
                is_shallow_boundary: false,
            })
        })
        .collect()
}
fn shallow_commits(root: &Path) -> HashSet<String> {
    git(root, &["rev-parse", "--git-path", "shallow"])
        .ok()
        .and_then(|path| fs::read_to_string(root.join(path.trim())).ok())
        .map(|value| value.lines().map(str::to_string).collect())
        .unwrap_or_default()
}
fn history(
    target: &ResolvedTarget,
    cursor: Option<GitHistoryCursor>,
) -> Result<GitHistoryPage, String> {
    let root = &target.repository.root;
    let mut cursor = if let Some(cursor) = cursor {
        if cursor.repository_path != root.to_string_lossy()
            || cursor.tips.len() > 8192
            || cursor.refs.len() > 16384
        {
            return Err(
                "History continuation does not match this repository; refresh history".into(),
            );
        }
        for tip in &cursor.tips {
            ensure_commit(root, tip)?;
        }
        cursor
    } else {
        let refs = snapshot_refs(root)?;
        let mut tips: Vec<_> = refs.iter().map(|r| r.sha.clone()).collect();
        tips.sort();
        tips.dedup();
        GitHistoryCursor {
            repository_path: root.to_string_lossy().into(),
            tips,
            refs,
            offset: 0,
        }
    };
    if cursor.tips.is_empty() {
        return Ok(GitHistoryPage {
            commits: vec![],
            cursor: None,
        });
    }
    let skip = format!("--skip={}", cursor.offset);
    let mut args = vec![
        "log",
        "--topo-order",
        "--no-show-signature",
        "-z",
        "--format=%H%x00%P%x00%an%x00%aI%x00%s",
        "-n",
        "101",
        &skip,
    ];
    args.extend(cursor.tips.iter().map(String::as_str));
    args.push("--");
    let mut commits = parse_commits(&git(root, &args)?, &cursor.refs)?;
    let shallow = shallow_commits(root);
    for commit in &mut commits {
        commit.is_shallow_boundary = shallow.contains(&commit.sha);
    }
    let more = commits.len() > 100;
    commits.truncate(100);
    cursor.offset = cursor
        .offset
        .checked_add(commits.len() as u32)
        .ok_or("History is too large")?;
    Ok(GitHistoryPage {
        commits,
        cursor: more.then_some(cursor),
    })
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn source_control_history(
    app: AppHandle,
    target: SourceControlTarget,
    cursor: Option<GitHistoryCursor>,
) -> Result<GitHistoryPage, String> {
    let cards = crate::kanban_git::cards_root(&app)?;
    run_blocking_command("read Git history", move || {
        history(&resolve_target(&target, Some(&cards))?, cursor)
    })
    .await
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitCommitFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: String,
}
#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitCommitDetails {
    pub commit: GitHistoryCommit,
    pub parent: Option<String>,
    pub files: Vec<GitCommitFile>,
}

fn commit_details(target: &ResolvedTarget, sha: &str) -> Result<GitCommitDetails, String> {
    let root = &target.repository.root;
    ensure_commit(root, sha)?;
    let metadata = git(
        root,
        &[
            "show",
            "--no-patch",
            "--no-show-signature",
            "-z",
            "--format=%H%x00%P%x00%an%x00%aI%x00%s",
            sha,
        ],
    )?;
    let mut commit = parse_commits(&metadata, &[])?
        .into_iter()
        .next()
        .ok_or("Commit is unavailable")?;
    commit.is_shallow_boundary = shallow_commits(root).contains(sha);
    if commit.is_shallow_boundary {
        return Ok(GitCommitDetails {
            commit,
            parent: None,
            files: vec![],
        });
    }
    let parent = commit.parents.first().cloned();
    let mut args = if let Some(parent) = &parent {
        vec![
            "diff",
            "--no-ext-diff",
            "--name-status",
            "-z",
            "--find-renames",
            parent,
            sha,
        ]
    } else {
        vec![
            "diff-tree",
            "--root",
            "--no-commit-id",
            "-r",
            "--name-status",
            "-z",
            "--find-renames",
            sha,
        ]
    };
    args.push("--");
    let output = git(root, &args)?;
    let mut fields = output.split('\0').filter(|s| !s.is_empty());
    let mut files = Vec::new();
    while let Some(status) = fields.next() {
        let first = fields.next().ok_or("Incomplete commit file list")?;
        let (path, old_path) = if status.starts_with(['R', 'C']) {
            (
                fields.next().ok_or("Incomplete renamed file")?,
                Some(first.to_string()),
            )
        } else {
            (first, None)
        };
        // An inspected commit may also include files outside a subfolder workspace.
        if allowed_path(target, path).is_err() {
            continue;
        }
        let old_path = old_path.filter(|old| allowed_path(target, old).is_ok());
        files.push(GitCommitFile {
            path: path.into(),
            old_path,
            status: status.into(),
        });
    }
    Ok(GitCommitDetails {
        commit,
        parent,
        files,
    })
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn source_control_commit(
    app: AppHandle,
    target: SourceControlTarget,
    sha: String,
) -> Result<GitCommitDetails, String> {
    let cards = crate::kanban_git::cards_root(&app)?;
    run_blocking_command("inspect Git commit", move || {
        commit_details(&resolve_target(&target, Some(&cards))?, &sha)
    })
    .await
}

fn commit_diff(target: &ResolvedTarget, sha: &str, path: &str) -> Result<WorkspaceGitDiff, String> {
    let details = commit_details(target, sha)?;
    let file = details
        .files
        .iter()
        .find(|f| f.path == path)
        .ok_or("This file is not part of the selected commit")?;
    let root = &target.repository.root;
    let mut args = if let Some(parent) = &details.parent {
        vec![
            "--literal-pathspecs",
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--find-renames",
            parent,
            sha,
            "--",
            path,
        ]
    } else {
        vec![
            "--literal-pathspecs",
            "diff-tree",
            "--root",
            "--no-commit-id",
            "-p",
            "--no-ext-diff",
            "--no-textconv",
            "--find-renames",
            sha,
            "--",
            path,
        ]
    };
    if let Some(old) = &file.old_path {
        args.push(old);
    }
    let content = git(root, &args)?;
    let (content, truncated) = bounded_unified_diff(content);
    let old_path = file.old_path.as_deref().unwrap_or(path);
    let base_object = details
        .parent
        .as_ref()
        .map(|parent| format!("{parent}:{old_path}"));
    let head_object = format!("{sha}:{path}");
    let base = match &base_object {
        Some(object) => read_git_object_preview(root, object)?.unwrap_or_else(empty_preview_text),
        None => empty_preview_text(),
    };
    let head = read_git_object_preview(root, &head_object)?.unwrap_or_else(empty_preview_text);
    let is_binary = base.is_binary || head.is_binary || git_diff_is_binary(&content);
    Ok(WorkspaceGitDiff {
        path: root.join(path).to_string_lossy().into(),
        relative_path: path.into(),
        sections: vec![WorkspaceGitDiffSection {
            kind: "commit".into(),
            title: if details.parent.is_some() {
                "Compared with first parent".into()
            } else {
                "Root commit · compared with empty tree".into()
            },
            base_label: base_object.unwrap_or_else(|| "/dev/null".into()),
            head_label: head_object,
            base_content: base.content,
            head_content: head.content,
            base_truncated: base.truncated || truncated,
            head_truncated: head.truncated || truncated,
            content,
            is_binary,
        }],
    })
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn source_control_commit_diff(
    app: AppHandle,
    target: SourceControlTarget,
    sha: String,
    path: String,
) -> Result<WorkspaceGitDiff, String> {
    let cards = crate::kanban_git::cards_root(&app)?;
    run_blocking_command("read commit diff", move || {
        commit_diff(&resolve_target(&target, Some(&cards))?, &sha, &path)
    })
    .await
}

fn remote(target: &ResolvedTarget, action: &str) -> Result<String, String> {
    let root = &target.repository.root;
    let _guard = acquire_git_mutation(root)?;
    match action {
        "fetch" => {
            if git(root, &["remote"])?.trim().is_empty() {
                return Err("This repository has no remotes configured".into());
            }
            git(
                root,
                &["fetch", "--all", "--no-prune", "--no-recurse-submodules"],
            )?;
            Ok("Fetched configured remotes".into())
        }
        "pull" => {
            if !git(root, &["status", "--porcelain=v1", "--untracked-files=all"])?
                .trim()
                .is_empty()
            {
                return Err("Commit or move your working changes before pulling".into());
            }
            if git(root, &["rev-parse", "--verify", "@{upstream}"]).is_err() {
                return Err("Set an upstream branch before pulling".into());
            }
            git(
                root,
                &[
                    "-c",
                    "pull.rebase=false",
                    "pull",
                    "--ff-only",
                    "--no-rebase",
                    "--no-autostash",
                    "--no-recurse-submodules",
                ],
            )
            .map_err(|e| {
                format!("Pull could not fast-forward. No merge or rebase was performed. {e}")
            })?;
            Ok("Branch is up to date".into())
        }
        _ => Err("Unknown Git synchronization action".into()),
    }
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn source_control_remote(
    app: AppHandle,
    target: SourceControlTarget,
    action: String,
) -> Result<String, String> {
    let cards = crate::kanban_git::cards_root(&app)?;
    run_blocking_command("synchronize Git", move || {
        remote(&resolve_target(&target, Some(&cards))?, &action)
    })
    .await
}

#[cfg(test)]
#[path = "tests/source_control.rs"]
mod tests;
