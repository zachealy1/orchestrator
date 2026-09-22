use super::*;

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = env::temp_dir().join(format!(
            "orchestrator-source-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        let path = fs::canonicalize(path).unwrap();
        git(&path, &["init", "-b", "main"]).unwrap();
        git(&path, &["config", "user.name", "Test User"]).unwrap();
        git(&path, &["config", "user.email", "test@example.invalid"]).unwrap();
        git(&path, &["config", "commit.gpgSign", "false"]).unwrap();
        Self(path)
    }
    fn target(&self) -> ResolvedTarget {
        resolve_target(
            &SourceControlTarget {
                workspace_path: self.0.to_string_lossy().into(),
                repository_path: self.0.to_string_lossy().into(),
                binding: None,
            },
            None,
        )
        .unwrap()
    }
    fn commit(&self, text: &str) -> String {
        fs::write(self.0.join("file.txt"), text).unwrap();
        git(&self.0, &["add", "."]).unwrap();
        git(&self.0, &["commit", "-m", text]).unwrap();
        git(&self.0, &["rev-parse", "HEAD"]).unwrap().trim().into()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn stage_and_unstage_preserve_partial_and_unborn_working_content() {
    let f = Fixture::new();
    let t = f.target();
    fs::write(f.0.join("file.txt"), "first").unwrap();
    stage_files(&t, None, true).unwrap();
    fs::write(f.0.join("file.txt"), "second").unwrap();
    stage_files(&t, None, false).unwrap();
    assert_eq!(fs::read_to_string(f.0.join("file.txt")).unwrap(), "second");
    assert!(git(&f.0, &["ls-files"]).unwrap().is_empty());
    f.commit("base");
    fs::write(f.0.join("file.txt"), "staged").unwrap();
    stage_files(&t, None, true).unwrap();
    fs::write(f.0.join("file.txt"), "unstaged").unwrap();
    let snapshot = status(&t).unwrap();
    assert_eq!(snapshot.files[0].index_status, "M");
    assert_eq!(snapshot.files[0].worktree_status, "M");
    stage_files(&t, Some(vec!["file.txt".into()]), false).unwrap();
    assert_eq!(
        fs::read_to_string(f.0.join("file.txt")).unwrap(),
        "unstaged"
    );
    assert!(git(&f.0, &["diff", "--cached"]).unwrap().is_empty());
}

#[test]
fn stage_deleted_renamed_and_literal_paths() {
    let f = Fixture::new();
    f.commit("base\nkeep this line\nkeep the other line\n");
    let t = f.target();
    git(&f.0, &["mv", "file.txt", "renamed.txt"]).unwrap();
    fs::write(
        f.0.join("renamed.txt"),
        "base\nkeep this line\nkeep the other line\nadditional\n",
    )
    .unwrap();
    assert_eq!(status(&t).unwrap().files[0].status_kind, "renamed");
    stage_files(&t, Some(vec!["renamed.txt".into()]), true).unwrap();
    assert!(git(&f.0, &["show", ":renamed.txt"])
        .unwrap()
        .contains("additional"));
    stage_files(&t, Some(vec!["renamed.txt".into()]), false).unwrap();
    assert!(f.0.join("renamed.txt").exists());
    assert!(!f.0.join("file.txt").exists());
    fs::write(f.0.join(":(glob)*"), "literal").unwrap();
    stage_files(&t, None, true).unwrap();
    let names = git(&f.0, &["diff", "--cached", "--name-only"]).unwrap();
    assert!(names.contains(":(glob)*"));
    assert!(names.contains("renamed.txt"));
    stage_files(&t, None, false).unwrap();
    assert!(git(&f.0, &["diff", "--cached"]).unwrap().is_empty());
}

#[test]
fn staging_excludes_nested_repositories_and_outside_workspace() {
    let f = Fixture::new();
    f.commit("base");
    fs::create_dir_all(f.0.join("nested")).unwrap();
    git(&f.0.join("nested"), &["init"]).unwrap();
    fs::write(f.0.join("nested/private.txt"), "nested").unwrap();
    fs::create_dir_all(f.0.join("scope")).unwrap();
    fs::write(f.0.join("scope/allowed.txt"), "allowed").unwrap();
    fs::write(f.0.join("outside.txt"), "outside").unwrap();
    let t = f.target();
    assert!(stage_files(&t, Some(vec!["nested/private.txt".into()]), true).is_err());
    assert!(stage_files(&t, Some(vec!["../outside".into()]), true).is_err());
    assert!(stage_files(
        &t,
        Some(vec![f.0.join("file.txt").to_string_lossy().into()]),
        true
    )
    .is_err());
    let scope = resolve_target(
        &SourceControlTarget {
            workspace_path: f.0.join("scope").to_string_lossy().into(),
            repository_path: f.0.to_string_lossy().into(),
            binding: None,
        },
        None,
    )
    .unwrap();
    assert!(stage_files(&scope, Some(vec!["outside.txt".into()]), true).is_err());
    stage_files(&scope, None, true).unwrap();
    assert_eq!(
        git(&f.0, &["diff", "--cached", "--name-only"])
            .unwrap()
            .trim(),
        "scope/allowed.txt"
    );
}

#[test]
fn history_snapshot_pages_and_first_parent_root_diffs_do_not_checkout() {
    let f = Fixture::new();
    let root = f.commit("root");
    git(&f.0, &["tag", "v1"]).unwrap();
    for n in 0..101 {
        git(
            &f.0,
            &["commit", "--allow-empty", "-m", &format!("commit {n}")],
        )
        .unwrap();
    }
    let t = f.target();
    let first = history(&t, None).unwrap();
    assert_eq!(first.commits.len(), 100);
    let previous_tip = first.commits[0].sha.clone();
    f.commit("new arrival");
    let second = history(&t, first.cursor).unwrap();
    assert_eq!(second.commits.len(), 2);
    assert!(second.cursor.is_none());
    assert_eq!(second.commits.last().unwrap().sha, root);
    assert!(second
        .commits
        .last()
        .unwrap()
        .refs
        .contains(&"refs/tags/v1".into()));
    let diff = commit_diff(&t, &root, "file.txt").unwrap();
    assert_eq!(diff.sections[0].base_content, "");
    assert_eq!(diff.sections[0].head_content, "root");
    assert!(commit_details(&t, &previous_tip).unwrap().parent.is_some());
    assert!(commit_details(&t, "HEAD; bad").is_err());
    assert_eq!(
        git(&f.0, &["symbolic-ref", "--short", "HEAD"])
            .unwrap()
            .trim(),
        "main"
    );
    git(&f.0, &["checkout", "--detach", &root]).unwrap();
    let detached = history(&t, None).unwrap();
    assert!(history(&t, detached.cursor)
        .unwrap()
        .commits
        .iter()
        .any(|c| c.sha == root && c.refs.contains(&"HEAD".into())));
}

#[test]
fn remote_pull_only_fast_forwards_and_fetch_does_not_prune() {
    let upstream = Fixture::new();
    upstream.commit("base");
    let f = Fixture::new();
    git(
        &f.0,
        &["remote", "add", "origin", upstream.0.to_str().unwrap()],
    )
    .unwrap();
    let t = f.target();
    remote(&t, "fetch").unwrap();
    git(&f.0, &["checkout", "-B", "main", "origin/main"]).unwrap();
    git(&f.0, &["branch", "--set-upstream-to=origin/main"]).unwrap();
    upstream.commit("remote advance");
    remote(&t, "pull").unwrap();
    assert_eq!(
        fs::read_to_string(f.0.join("file.txt")).unwrap(),
        "remote advance"
    );
    fs::write(f.0.join("file.txt"), "dirty").unwrap();
    assert!(remote(&t, "pull").unwrap_err().contains("working changes"));
    assert_eq!(fs::read_to_string(f.0.join("file.txt")).unwrap(), "dirty");
    f.commit("local divergence");
    upstream.commit("remote divergence");
    let head = git(&f.0, &["rev-parse", "HEAD"]).unwrap();
    assert!(remote(&t, "pull")
        .unwrap_err()
        .contains("No merge or rebase"));
    assert_eq!(git(&f.0, &["rev-parse", "HEAD"]).unwrap(), head);
    assert!(!f.0.join(".git/MERGE_HEAD").exists());
    git(&f.0, &["branch", "--unset-upstream"]).unwrap();
    assert!(remote(&t, "pull").unwrap_err().contains("upstream"));
    git(&f.0, &["update-ref", "refs/remotes/origin/keep", "HEAD"]).unwrap();
    git(&f.0, &["config", "fetch.prune", "true"]).unwrap();
    remote(&t, "fetch").unwrap();
    assert!(git(&f.0, &["rev-parse", "--verify", "refs/remotes/origin/keep"]).is_ok());
    git(
        &f.0,
        &[
            "remote",
            "set-url",
            "origin",
            "/nonexistent/orchestrator-test-remote",
        ],
    )
    .unwrap();
    assert!(remote(&t, "fetch").is_err());
    assert_eq!(git(&f.0, &["rev-parse", "HEAD"]).unwrap(), head);
}

#[test]
fn worktree_writers_share_lock_and_unborn_history_is_empty() {
    let f = Fixture::new();
    let t = f.target();
    assert!(history(&t, None).unwrap().commits.is_empty());
    f.commit("base");
    let worktree = f.0.join("worktree");
    git(
        &f.0,
        &["worktree", "add", "-b", "other", worktree.to_str().unwrap()],
    )
    .unwrap();
    let guard = acquire_git_mutation(&f.0).unwrap();
    assert!(acquire_git_mutation(&worktree).is_err());
    assert!(stage_files(&t, None, true).is_err());
    drop(guard);
    assert!(acquire_git_mutation(&worktree).is_ok());
}

#[test]
fn merge_graph_metadata_conflicts_and_first_parent_comparisons() {
    let f = Fixture::new();
    f.commit("base");
    git(&f.0, &["checkout", "-b", "feature"]).unwrap();
    fs::write(f.0.join("feature.txt"), "feature").unwrap();
    git(&f.0, &["add", "."]).unwrap();
    git(&f.0, &["commit", "-m", "feature"]).unwrap();
    let feature = git(&f.0, &["rev-parse", "HEAD"])
        .unwrap()
        .trim()
        .to_string();
    git(&f.0, &["checkout", "main"]).unwrap();
    let first_parent = f.commit("main changed");
    git(
        &f.0,
        &["merge", "--no-ff", "feature", "-m", "merge feature"],
    )
    .unwrap();
    let t = f.target();
    let page = history(&t, None).unwrap();
    assert_eq!(page.commits[0].parents, vec![first_parent.clone(), feature]);
    let details = commit_details(&t, &page.commits[0].sha).unwrap();
    assert_eq!(details.parent, Some(first_parent));
    assert_eq!(details.files.len(), 1);
    assert_eq!(details.files[0].path, "feature.txt");
    let diff = commit_diff(&t, &page.commits[0].sha, "feature.txt").unwrap();
    assert!(diff.sections[0].base_content.is_empty());
    assert_eq!(diff.sections[0].head_content, "feature");
    git(&f.0, &["checkout", "feature"]).unwrap();
    f.commit("feature conflicting");
    git(&f.0, &["checkout", "main"]).unwrap();
    f.commit("main conflicting");
    assert!(git(&f.0, &["merge", "feature", "--no-edit"]).is_err());
    let content = fs::read_to_string(f.0.join("file.txt")).unwrap();
    assert_eq!(status(&t).unwrap().files[0].status_kind, "conflicted");
    assert!(stage_files(&t, Some(vec!["file.txt".into()]), true).is_err());
    stage_files(&t, None, true).unwrap();
    assert_eq!(fs::read_to_string(f.0.join("file.txt")).unwrap(), content);
    assert!(!git(&f.0, &["ls-files", "--unmerged"]).unwrap().is_empty());
}

#[test]
fn shallow_boundaries_are_not_mislabeled_as_root_commits() {
    let source = Fixture::new();
    source.commit("first");
    let tip = source.commit("second");
    let f = Fixture::new();
    let clone = f.0.join("shallow");
    git(
        &f.0,
        &[
            "clone",
            "--depth=1",
            &format!("file://{}", source.0.display()),
            clone.to_str().unwrap(),
        ],
    )
    .unwrap();
    let t = resolve_target(
        &SourceControlTarget {
            workspace_path: clone.to_string_lossy().into(),
            repository_path: clone.to_string_lossy().into(),
            binding: None,
        },
        None,
    )
    .unwrap();
    let page = history(&t, None).unwrap();
    assert_eq!(page.commits.len(), 1);
    assert!(page.commits[0].is_shallow_boundary);
    let details = commit_details(&t, &tip).unwrap();
    assert!(details.commit.is_shallow_boundary);
    assert!(details.files.is_empty());
}

#[cfg(unix)]
#[test]
fn symbolic_link_paths_cannot_escape_the_scope() {
    let f = Fixture::new();
    f.commit("base");
    let outside = Fixture::new();
    outside.commit("private");
    std::os::unix::fs::symlink(&outside.0, f.0.join("linked")).unwrap();
    let t = f.target();
    assert!(stage_files(&t, Some(vec!["linked/file.txt".into()]), true).is_err());
    assert!(stage_files(&t, Some(vec!["linked/missing.txt".into()]), true).is_err());
}

#[test]
fn card_bindings_stage_only_the_worktree_and_never_fall_back_to_source() {
    let source = Fixture::new();
    let base = source.commit("base");
    let cards = Fixture::new();
    let execution = cards.0.join("card-1");
    fs::create_dir_all(&execution).unwrap();
    let worktree = execution.join("repository");
    let branch = "codex/card-test";
    git(
        &source.0,
        &["worktree", "add", "-b", branch, worktree.to_str().unwrap()],
    )
    .unwrap();
    let binding = KanbanGitRepositoryBinding {
        source_repository_path: source.0.to_string_lossy().into(),
        relative_path: "repository".into(),
        execution_root: execution.to_string_lossy().into(),
        source_branch: "main".into(),
        base_branch: "main".into(),
        base_commit: base,
        card_branch: branch.into(),
        worktree_path: worktree.to_string_lossy().into(),
        source_status_fingerprint: None,
        status: "ready".into(),
        error: None,
    };
    let request = SourceControlTarget {
        workspace_path: source.0.to_string_lossy().into(),
        repository_path: source.0.to_string_lossy().into(),
        binding: Some(binding),
    };
    let target = resolve_target(&request, Some(&cards.0)).unwrap();
    fs::write(source.0.join("file.txt"), "source changes").unwrap();
    fs::write(worktree.join("file.txt"), "card changes").unwrap();
    stage_files(&target, None, true).unwrap();
    assert!(git(&source.0, &["diff", "--cached"]).unwrap().is_empty());
    assert_eq!(
        git(&worktree, &["show", ":file.txt"]).unwrap(),
        "card changes"
    );
    assert!(resolve_target(&request, None).is_err());
    git(&worktree, &["checkout", "-b", "unexpected"]).unwrap();
    assert!(resolve_target(&request, Some(&cards.0)).is_err());
    assert!(git(&source.0, &["diff", "--cached"]).unwrap().is_empty());
    fs::remove_dir_all(&worktree).unwrap();
    assert!(resolve_target(&request, Some(&cards.0)).is_err());
}
