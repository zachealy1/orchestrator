use super::*;

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
fn workspace_git_status_counts_untracked_files_in_an_unborn_repository() {
    let workspace = git_test_directory("git-status-untracked-files");
    fs::create_dir_all(workspace.join("src")).unwrap();
    fs::create_dir_all(workspace.join("dist")).unwrap();
    fs::write(workspace.join("src/main.ts"), "console.log('snake');\n").unwrap();
    fs::write(
        workspace.join("dist/index.js"),
        "console.log('built');\nconsole.log('ready');\n",
    )
    .unwrap();

    let snapshot =
        list_workspace_git_status_blocking(workspace.to_string_lossy().to_string()).unwrap();
    let paths = snapshot
        .files
        .iter()
        .map(|file| file.relative_path.as_str())
        .collect::<Vec<_>>();

    assert_eq!(paths, vec!["dist/index.js", "src/main.ts"]);
    assert_eq!(snapshot.additions, 3);
    assert_eq!(snapshot.deletions, 0);
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
    let kinds: Vec<_> = diff
        .sections
        .iter()
        .map(|section| section.kind.as_str())
        .collect();

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
    assert!(diff.sections[0]
        .head_content
        .contains("export const value = 1;"));
    assert!(diff.sections[0].content.contains("new file mode"));
    assert!(diff.sections[0]
        .content
        .contains("+export const value = 1;"));
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
    assert!(diff.sections[0]
        .base_content
        .contains("export const value = 1;"));
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
    assert!(diff.sections[0]
        .base_content
        .contains("export const value = 1;"));
    assert!(diff.sections[0].head_content.is_empty());
    assert!(diff.sections[0].content.contains("deleted file mode"));
    remove_test_directory(workspace);
}

#[test]
fn git_diff_returns_full_contents_for_staged_renamed_files() {
    let workspace = git_test_directory("git-diff-renamed");
    let old_file = workspace.join("old.ts");
    let new_file = workspace.join("new.ts");
    fs::write(
        &old_file,
        "export const keep = true;\nexport const value = 1;\n",
    )
    .unwrap();
    git(&workspace, &["add", "old.ts"]);
    git(&workspace, &["commit", "-m", "initial"]);
    git(&workspace, &["mv", "old.ts", "new.ts"]);
    fs::write(
        &new_file,
        "export const keep = true;\nexport const value = 2;\n",
    )
    .unwrap();
    git(&workspace, &["add", "new.ts"]);

    let diff = read_workspace_git_diff_blocking(
        workspace.to_string_lossy().to_string(),
        new_file.to_string_lossy().to_string(),
    )
    .unwrap();

    assert_eq!(diff.sections[0].kind, "staged");
    assert!(diff.sections[0].base_label.contains("old.ts"));
    assert!(diff.sections[0]
        .base_content
        .contains("export const value = 1;"));
    assert!(diff.sections[0]
        .head_content
        .contains("export const value = 2;"));
    remove_test_directory(workspace);
}

#[test]
fn nested_repository_diff_resolves_staged_rename_paths() {
    let workspace = test_directory("git-multi-nested-diff");
    let repository = workspace.join("backend");
    initialize_git_repository(&repository);
    let old_file = repository.join("old.ts");
    let new_file = repository.join("new.ts");
    fs::write(
        &old_file,
        "export const keep = true;\nexport const value = 1;\n",
    )
    .unwrap();
    git(&repository, &["add", "old.ts"]);
    git(&repository, &["commit", "-m", "initial"]);
    git(&repository, &["mv", "old.ts", "new.ts"]);
    fs::write(
        &new_file,
        "export const keep = true;\nexport const value = 2;\n",
    )
    .unwrap();
    git(&repository, &["add", "new.ts"]);

    let diff = read_workspace_repository_git_diff_blocking(
        workspace.to_string_lossy().to_string(),
        Some(
            fs::canonicalize(&repository)
                .unwrap()
                .to_string_lossy()
                .to_string(),
        ),
        new_file.to_string_lossy().to_string(),
    )
    .unwrap();

    assert_eq!(diff.sections[0].kind, "staged");
    assert!(diff.sections[0].base_label.contains("old.ts"));
    assert!(diff.sections[0].base_content.contains("value = 1"));
    assert!(diff.sections[0].head_content.contains("value = 2"));
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
    assert!(diff.sections[0]
        .head_content
        .contains("export const value = 1;"));
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
fn undo_workspace_git_diff_reverses_the_exact_unstaged_patch() {
    let workspace = git_test_directory("git-undo-exact-patch");
    let file = workspace.join("app.ts");
    fs::write(&file, "export const value = 1;\n").unwrap();
    git(&workspace, &["add", "app.ts"]);
    git(&workspace, &["commit", "-m", "initial"]);
    fs::write(
        &file,
        "export const value = 2;\nexport const ready = true;\n",
    )
    .unwrap();
    let diff = git_stdout(&workspace, &["diff", "--", "app.ts"]);

    let result =
        undo_workspace_git_diff_blocking(workspace.to_string_lossy().to_string(), diff).unwrap();

    assert_eq!(
        fs::read_to_string(&file).unwrap(),
        "export const value = 1;\n"
    );
    assert!(git_stdout(&workspace, &["status", "--porcelain"])
        .trim()
        .is_empty());
    assert_eq!(result.message, "Undid changes to 1 file");
    remove_test_directory(workspace);
}

#[test]
fn undo_workspace_git_diff_strips_a_card_repository_prefix() {
    let workspace = git_test_directory("git-undo-card-prefix");
    let file = workspace.join("src/app.ts");
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(&file, "export const value = 1;\n").unwrap();
    git(&workspace, &["add", "src/app.ts"]);
    git(&workspace, &["commit", "-m", "initial"]);
    fs::write(&file, "export const value = 2;\n").unwrap();
    let diff = git_stdout(&workspace, &["diff", "--", "src/app.ts"])
        .replace("a/src/app.ts", "a/01-space-invaders-test/src/app.ts")
        .replace("b/src/app.ts", "b/01-space-invaders-test/src/app.ts");

    let result = undo_workspace_git_diff_with_path_strip_blocking(
        workspace.to_string_lossy().to_string(),
        diff,
        Some(2),
    )
    .unwrap();

    assert_eq!(
        fs::read_to_string(&file).unwrap(),
        "export const value = 1;\n"
    );
    assert!(git_stdout(&workspace, &["status", "--porcelain"])
        .trim()
        .is_empty());
    assert_eq!(result.message, "Undid changes to 1 file");
    remove_test_directory(workspace);
}

#[test]
fn undo_workspace_git_diff_removes_an_exact_untracked_file() {
    let workspace = git_test_directory("git-undo-untracked-file");
    let file = workspace.join("new.ts");
    fs::write(&file, "export const created = true;\n").unwrap();
    let saved_diff = read_workspace_git_diff_blocking(
        workspace.to_string_lossy().to_string(),
        file.to_string_lossy().to_string(),
    )
    .unwrap()
    .sections
    .remove(0)
    .content;

    undo_workspace_git_diff_blocking(workspace.to_string_lossy().to_string(), saved_diff).unwrap();

    assert!(!file.exists());
    remove_test_directory(workspace);
}

#[test]
fn undo_workspace_git_diff_rejects_files_changed_after_the_saved_edit() {
    let workspace = git_test_directory("git-undo-diverged-file");
    let file = workspace.join("app.ts");
    fs::write(&file, "export const value = 1;\n").unwrap();
    git(&workspace, &["add", "app.ts"]);
    git(&workspace, &["commit", "-m", "initial"]);
    fs::write(&file, "export const value = 2;\n").unwrap();
    let diff = git_stdout(&workspace, &["diff", "--", "app.ts"]);
    fs::write(&file, "export const value = 3;\n").unwrap();

    let result = undo_workspace_git_diff_blocking(workspace.to_string_lossy().to_string(), diff);

    assert!(result.is_err());
    assert_eq!(
        fs::read_to_string(&file).unwrap(),
        "export const value = 3;\n"
    );
    remove_test_directory(workspace);
}

#[test]
fn undo_workspace_git_diff_rejects_staged_or_outside_workspace_files() {
    let repository = git_test_directory("git-undo-confined");
    let workspace = repository.join("workspace");
    fs::create_dir_all(&workspace).unwrap();
    let inside_file = workspace.join("inside.ts");
    let outside_file = repository.join("outside.ts");
    fs::write(&inside_file, "export const inside = 1;\n").unwrap();
    fs::write(&outside_file, "export const outside = 1;\n").unwrap();
    git(&repository, &["add", "."]);
    git(&repository, &["commit", "-m", "initial"]);

    fs::write(&inside_file, "export const inside = 2;\n").unwrap();
    let staged_diff = git_stdout(&repository, &["diff", "--", "workspace/inside.ts"]);
    git(&repository, &["add", "workspace/inside.ts"]);
    let staged_result =
        undo_workspace_git_diff_blocking(workspace.to_string_lossy().to_string(), staged_diff);
    assert!(staged_result.unwrap_err().contains("Unstage"));

    git(&repository, &["reset", "HEAD", "workspace/inside.ts"]);
    fs::write(&outside_file, "export const outside = 2;\n").unwrap();
    let outside_diff = git_stdout(&repository, &["diff", "--", "outside.ts"]);
    let outside_result =
        undo_workspace_git_diff_blocking(workspace.to_string_lossy().to_string(), outside_diff);
    assert!(outside_result.unwrap_err().contains("outside"));
    assert_eq!(
        fs::read_to_string(&outside_file).unwrap(),
        "export const outside = 2;\n"
    );
    remove_test_directory(repository);
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

    assert_eq!(
        result.branch.as_deref(),
        current_git_branch(&workspace).as_deref()
    );
    assert!(status.status.success());
    assert!(String::from_utf8_lossy(&status.stdout).trim().is_empty());
    assert_eq!(
        String::from_utf8_lossy(&log.stdout).trim(),
        "Add app source"
    );
    remove_test_directory(workspace);
}

#[test]
fn commit_workspace_changes_handles_case_only_renames() {
    let workspace = git_test_directory("git-commit-case-only-rename");
    fs::write(workspace.join("readme.md"), "documentation\n").unwrap();
    git(&workspace, &["add", "readme.md"]);
    git(&workspace, &["commit", "-m", "Add readme"]);
    fs::rename(workspace.join("readme.md"), workspace.join("README.md")).unwrap();

    commit_workspace_changes_blocking(
        workspace.to_string_lossy().to_string(),
        "Normalize README casing".to_string(),
        Some(true),
    )
    .unwrap();

    let tracked = git_stdout(&workspace, &["ls-tree", "--name-only", "HEAD"]);
    assert!(tracked.lines().any(|path| path == "README.md"));
    assert!(!tracked.lines().any(|path| path == "readme.md"));
    assert!(git_stdout(&workspace, &["status", "--porcelain"]).is_empty());
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

    assert_eq!(
        result.branch.as_deref(),
        current_git_branch(&workspace).as_deref()
    );
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
fn multi_repository_commit_targets_only_the_selected_sibling() {
    let workspace = test_directory("git-multi-sibling-commit");
    let frontend = workspace.join("frontend");
    let backend = workspace.join("backend");
    initialize_git_repository(&frontend);
    initialize_git_repository(&backend);
    fs::write(frontend.join("app.ts"), "export const value = 1;\n").unwrap();
    fs::write(backend.join("server.ts"), "export const value = 1;\n").unwrap();
    git(&frontend, &["add", "."]);
    git(&frontend, &["commit", "-m", "initial frontend"]);
    git(&backend, &["add", "."]);
    git(&backend, &["commit", "-m", "initial backend"]);
    fs::write(frontend.join("app.ts"), "export const value = 2;\n").unwrap();
    fs::write(backend.join("server.ts"), "export const value = 2;\n").unwrap();

    let canonical_workspace = fs::canonicalize(&workspace).unwrap();
    let canonical_frontend = fs::canonicalize(&frontend).unwrap();
    let (repositories, _) = discover_git_repositories(&canonical_workspace, true).unwrap();
    let frontend_repository = repositories
        .iter()
        .find(|repository| repository.root == canonical_frontend)
        .unwrap();
    let pathspecs = git_repository_pathspecs(frontend_repository, &repositories).unwrap();
    let commit_context = workspace_commit_context_for_pathspecs(
        &frontend_repository.root,
        &canonical_workspace,
        &pathspecs,
        true,
    )
    .unwrap();
    assert!(commit_context.contains("app.ts"));
    assert!(!commit_context.contains("server.ts"));

    commit_workspace_repository_changes_blocking(
        workspace.to_string_lossy().to_string(),
        Some(
            fs::canonicalize(&frontend)
                .unwrap()
                .to_string_lossy()
                .to_string(),
        ),
        "Update frontend".to_string(),
        Some(true),
    )
    .unwrap();

    assert_eq!(
        git_stdout(&frontend, &["log", "-1", "--pretty=%s"]).trim(),
        "Update frontend"
    );
    assert_eq!(
        git_stdout(&backend, &["log", "-1", "--pretty=%s"]).trim(),
        "initial backend"
    );
    assert!(git_stdout(&frontend, &["status", "--porcelain"])
        .trim()
        .is_empty());
    assert!(git_stdout(&backend, &["status", "--porcelain"]).contains("server.ts"));

    let overview =
        list_workspace_git_overview_blocking(workspace.to_string_lossy().to_string(), true)
            .unwrap();
    assert_eq!(overview.repositories.len(), 2);
    assert_eq!(overview.changed_repository_count, 1);
    assert_eq!(overview.files.len(), 1);
    assert_eq!(overview.files[0].relative_path, "backend/server.ts");
    remove_test_directory(workspace);
}

#[test]
fn repository_discovery_includes_enclosing_and_contained_repositories() {
    let root = git_test_directory("git-multi-enclosing-root");
    let workspace = root.join("workspace");
    fs::create_dir_all(&workspace).unwrap();
    let nested = workspace.join("nested");
    initialize_git_repository(&nested);

    let canonical_root = fs::canonicalize(&root).unwrap();
    let canonical_workspace = fs::canonicalize(&workspace).unwrap();
    let canonical_nested = fs::canonicalize(&nested).unwrap();
    let (repositories, truncated) = discover_git_repositories(&canonical_workspace, true).unwrap();

    assert!(!truncated);
    assert_eq!(repositories.len(), 2);
    assert!(repositories.iter().any(|repository| {
        repository.root == canonical_root
            && repository.scope == canonical_workspace
            && repository.public.relative_path == "."
    }));
    assert!(repositories.iter().any(|repository| {
        repository.root == canonical_nested
            && repository.scope == canonical_nested
            && repository.public.relative_path == "nested"
    }));

    remove_test_directory(root);
}

#[test]
fn repository_discovery_accepts_git_file_worktrees() {
    let source = git_test_directory("git-multi-worktree-source");
    fs::write(source.join("tracked.txt"), "tracked\n").unwrap();
    git(&source, &["add", "tracked.txt"]);
    git(&source, &["commit", "-m", "initial"]);
    let workspace = test_directory("git-multi-worktree-parent");
    let worktree = workspace.join("linked-worktree");
    let worktree_arg = worktree.to_string_lossy().to_string();
    git(
        &source,
        &[
            "worktree",
            "add",
            "-b",
            "feature/discovered-worktree",
            &worktree_arg,
        ],
    );

    assert!(worktree.join(".git").is_file());
    let canonical_workspace = fs::canonicalize(&workspace).unwrap();
    let canonical_worktree = fs::canonicalize(&worktree).unwrap();
    let (repositories, truncated) = discover_git_repositories(&canonical_workspace, true).unwrap();

    assert!(!truncated);
    assert_eq!(repositories.len(), 1);
    assert_eq!(repositories[0].root, canonical_worktree);
    assert_eq!(repositories[0].public.relative_path, "linked-worktree");

    remove_test_directory(workspace);
    remove_test_directory(source);
}

#[cfg(unix)]
#[test]
fn repository_discovery_ignores_symlinked_repositories_outside_workspace() {
    use std::os::unix::fs::symlink;

    let workspace = test_directory("git-multi-symlink-workspace");
    let outside = git_test_directory("git-multi-symlink-outside");
    symlink(&outside, workspace.join("linked-repository")).unwrap();

    let canonical_workspace = fs::canonicalize(&workspace).unwrap();
    let (repositories, truncated) = discover_git_repositories(&canonical_workspace, true).unwrap();

    assert!(!truncated);
    assert!(repositories.is_empty());
    assert!(
        list_workspace_git_overview_blocking(workspace.to_string_lossy().to_string(), true,)
            .unwrap_err()
            .contains("No Git repositories")
    );

    remove_test_directory(workspace);
    remove_test_directory(outside);
}

#[test]
fn parent_repository_excludes_independent_nested_repository_changes() {
    let workspace = git_test_directory("git-multi-nested-commit");
    let root_file = workspace.join("root.txt");
    fs::write(&root_file, "root 1\n").unwrap();
    git(&workspace, &["add", "root.txt"]);
    git(&workspace, &["commit", "-m", "initial root"]);

    let child = workspace.join("packages/child");
    initialize_git_repository(&child);
    let child_file = child.join("child.txt");
    fs::write(&child_file, "child 1\n").unwrap();
    git(&child, &["add", "child.txt"]);
    git(&child, &["commit", "-m", "initial child"]);
    fs::write(&root_file, "root 2\n").unwrap();
    fs::write(&child_file, "child 2\n").unwrap();

    let overview =
        list_workspace_git_overview_blocking(workspace.to_string_lossy().to_string(), true)
            .unwrap();
    let root_path = fs::canonicalize(&workspace)
        .unwrap()
        .to_string_lossy()
        .to_string();
    let child_path = fs::canonicalize(&child)
        .unwrap()
        .to_string_lossy()
        .to_string();
    let root_status = overview
        .repositories
        .iter()
        .find(|status| status.repository.root_path == root_path)
        .unwrap();
    let child_status = overview
        .repositories
        .iter()
        .find(|status| status.repository.root_path == child_path)
        .unwrap();
    assert_eq!(root_status.files.len(), 1);
    assert_eq!(root_status.files[0].relative_path, "root.txt");
    assert_eq!(child_status.files.len(), 1);
    assert_eq!(
        child_status.files[0].relative_path,
        "packages/child/child.txt"
    );

    commit_workspace_repository_changes_blocking(
        workspace.to_string_lossy().to_string(),
        Some(root_path.clone()),
        "Update root".to_string(),
        Some(true),
    )
    .unwrap();

    assert_eq!(
        git_stdout(&workspace, &["log", "-1", "--pretty=%s"]).trim(),
        "Update root"
    );
    assert_eq!(
        git_stdout(&child, &["log", "-1", "--pretty=%s"]).trim(),
        "initial child"
    );
    assert!(git_stdout(&child, &["status", "--porcelain"]).contains("child.txt"));
    remove_test_directory(workspace);
}

#[test]
fn repository_file_ownership_uses_the_deepest_nested_repository() {
    let workspace = git_test_directory("git-multi-nested-file-owner");
    let child = workspace.join("packages/child");
    initialize_git_repository(&child);
    let child_file = child.join("child.txt");
    fs::write(&child_file, "child\n").unwrap();

    let canonical_workspace = fs::canonicalize(&workspace).unwrap();
    let canonical_child = fs::canonicalize(&child).unwrap();
    let canonical_child_file = fs::canonicalize(&child_file).unwrap();
    let (repositories, _) = discover_git_repositories(&canonical_workspace, true).unwrap();
    let parent = repositories
        .iter()
        .find(|repository| repository.root == canonical_workspace)
        .unwrap();
    let child_repository = repositories
        .iter()
        .find(|repository| repository.root == canonical_child)
        .unwrap();

    assert!(!git_repository_owns_workspace_path(
        parent,
        &repositories,
        &canonical_child_file,
    ));
    assert!(git_repository_owns_workspace_path(
        child_repository,
        &repositories,
        &canonical_child_file,
    ));

    remove_test_directory(workspace);
}

#[test]
fn parent_repository_keeps_submodule_pointer_changes_visible() {
    let workspace = git_test_directory("git-multi-submodule-parent");
    let source = git_test_directory("git-multi-submodule-source");
    fs::write(source.join("module.txt"), "module 1\n").unwrap();
    git(&source, &["add", "module.txt"]);
    git(&source, &["commit", "-m", "initial module"]);
    let source_arg = source.to_string_lossy().to_string();
    git(
        &workspace,
        &[
            "-c",
            "protocol.file.allow=always",
            "submodule",
            "add",
            &source_arg,
            "modules/child",
        ],
    );
    git(&workspace, &["commit", "-m", "add submodule"]);

    let child = workspace.join("modules/child");
    git(&child, &["config", "user.email", "test@example.com"]);
    git(&child, &["config", "user.name", "Orchestrator Test"]);
    fs::write(child.join("module.txt"), "module 2\n").unwrap();
    git(&child, &["add", "module.txt"]);
    git(&child, &["commit", "-m", "update module"]);

    let overview =
        list_workspace_git_overview_blocking(workspace.to_string_lossy().to_string(), true)
            .unwrap();
    let root_path = fs::canonicalize(&workspace)
        .unwrap()
        .to_string_lossy()
        .to_string();
    let parent_status = overview
        .repositories
        .iter()
        .find(|status| status.repository.root_path == root_path)
        .unwrap();
    assert!(parent_status
        .files
        .iter()
        .any(|file| file.relative_path == "modules/child"));
    let canonical_workspace = fs::canonicalize(&workspace).unwrap();
    let canonical_child = fs::canonicalize(&child).unwrap();
    let (repositories, _) = discover_git_repositories(&canonical_workspace, true).unwrap();
    let parent = repositories
        .iter()
        .find(|repository| repository.root == canonical_workspace)
        .unwrap();
    assert!(git_repository_owns_workspace_path(
        parent,
        &repositories,
        &canonical_child,
    ));

    remove_test_directory(workspace);
    remove_test_directory(source);
}

#[test]
fn repository_selection_rejects_a_repository_outside_the_workspace() {
    let workspace = test_directory("git-multi-contained-workspace");
    let contained = workspace.join("contained");
    initialize_git_repository(&contained);
    let outside = git_test_directory("git-multi-outside-repository");

    let result = resolve_workspace_git_repository(
        &fs::canonicalize(&workspace).unwrap(),
        Some(outside.to_string_lossy().as_ref()),
    );

    assert!(result.unwrap_err().contains("does not belong"));
    remove_test_directory(workspace);
    remove_test_directory(outside);
}

#[test]
fn sanitize_commit_subject_returns_single_clean_line() {
    assert_eq!(
        sanitize_commit_subject("Improve commit dialog controls").as_deref(),
        Some("Improve commit dialog controls")
    );
    assert_eq!(
        sanitize_commit_subject("thinking...\nCommit message: `Improve commit dialog controls`\n")
            .as_deref(),
        None
    );
    assert_eq!(
        sanitize_commit_subject("Commit message: Improve commit dialog controls").as_deref(),
        None
    );
    assert_eq!(
        sanitize_commit_subject("\"Improve commit dialog controls\"").as_deref(),
        None
    );
    assert_eq!(
        sanitize_commit_subject("Improve commit dialog controls (5 modified)").as_deref(),
        Some("Improve commit dialog controls (5 modified)")
    );
    assert_eq!(
        sanitize_commit_subject("Update app workflow (2 modified, 1 added)").as_deref(),
        Some("Update app workflow (2 modified, 1 added)")
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
    let intent = WorkspaceCommitIntentContext {
        objective: Some("Keep header controls on one row".to_string()),
        approved_plan: None,
        implementation_outcome: None,
    };
    let prompt = commit_message_generation_prompt(
        "M src/App.tsx\nM src-tauri/src/lib.rs",
        Some(&intent),
        Some((
            "Update desktop app workflow",
            "the subject described only a broad area",
        )),
    );

    assert!(prompt.contains("Update desktop app workflow"));
    assert!(prompt.contains("described only a broad area"));
    assert!(prompt.contains("names the exact user-facing behavior"));
    assert!(prompt.contains("Fix inline context file label spacing"));
}

#[test]
fn commit_message_prompt_prioritizes_intent_before_git_context() {
    let intent = WorkspaceCommitIntentContext {
        objective: Some("Keep header controls on one row at smaller widths".to_string()),
        approved_plan: Some("Remove the responsive stacking rule from the header.".to_string()),
        implementation_outcome: None,
    };
    let prompt = commit_message_generation_prompt("M src/App.css", Some(&intent), None);

    assert!(prompt.contains("User objective:\nKeep header controls on one row"));
    assert!(prompt.contains("Approved plan:\nRemove the responsive stacking rule"));
    assert!(prompt.contains("source of truth"));
    assert!(prompt.contains("infer the underlying intent from the actual diff hunks"));
    assert!(prompt.contains("Prefer the behavioral outcome"));
    assert!(prompt.contains("Refine Tauri bridge and app styling"));
    assert!(prompt.find("User objective:").unwrap() < prompt.find("Git context:").unwrap());
}

#[test]
fn commit_message_generation_uses_a_minimal_bounded_codex_session() {
    let args =
        commit_message_generation_args(Path::new("/tmp/orchestrator-workspace"), Some("gpt-5.5"));

    assert!(args.iter().any(|arg| arg == "--ignore-user-config"));
    assert!(args.iter().any(|arg| arg == "--ignore-rules"));
    assert!(!args.iter().any(|arg| arg == "-a"));
    assert!(args
        .windows(2)
        .any(|pair| pair == ["-c", "approval_policy=\"never\""]));
    assert!(args
        .iter()
        .any(|arg| arg == "model_reasoning_effort=\"low\""));
    assert!(args.windows(2).any(|pair| pair == ["--color", "never"]));
    assert!(args.windows(2).any(|pair| pair == ["-m", "gpt-5.5"]));
}

#[test]
fn commit_message_generation_uses_the_shared_profile_when_account_is_unset() {
    assert_eq!(commit_message_account_id(None).unwrap(), 0);
    assert_eq!(commit_message_account_id(Some(0)).unwrap(), 0);
    assert_eq!(commit_message_account_id(Some(7)).unwrap(), 7);
    assert!(commit_message_account_id(Some(-1)).is_err());
}

#[test]
fn commit_context_balances_large_diffs_and_untracked_sources() {
    let workspace = git_test_directory("git-commit-context");
    let tracked_file = workspace.join("src/app.js");
    fs::create_dir_all(tracked_file.parent().unwrap()).unwrap();
    fs::write(&tracked_file, "export const state = 'initial';\n").unwrap();
    git(&workspace, &["add", "."]);
    git(&workspace, &["commit", "-m", "initial"]);

    let staged_lines = (0..800)
        .map(|index| format!("export const staged{index} = 'snake gameplay';"))
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(&tracked_file, format!("{staged_lines}\n")).unwrap();
    git(&workspace, &["add", "src/app.js"]);
    fs::write(
        &tracked_file,
        format!("{staged_lines}\nexport const controls = 'arrow keys';\n"),
    )
    .unwrap();
    fs::create_dir_all(workspace.join("public")).unwrap();
    fs::write(
        workspace.join("public/index.html"),
        "<main>Playable Snake game with score and restart controls</main>\n",
    )
    .unwrap();

    let context = workspace_commit_context(&workspace, &workspace, ".", true).unwrap();

    assert!(context.len() <= MAX_COMMIT_MESSAGE_CONTEXT_CHARS);
    assert!(context.contains("## Staged diff"));
    assert!(context.contains("## Working tree diff"));
    assert!(context.contains("## Untracked file samples"));
    assert!(context.contains("public/index.html"));
    assert!(context.contains("Playable Snake game"));
    assert!(context.contains("[truncated]"));
    remove_test_directory(workspace);
}

#[test]
fn staged_only_commit_context_excludes_unstaged_and_untracked_content() {
    let workspace = git_test_directory("git-commit-context-staged-only");
    let tracked_file = workspace.join("app.js");
    fs::write(&tracked_file, "export const state = 'initial';\n").unwrap();
    git(&workspace, &["add", "."]);
    git(&workspace, &["commit", "-m", "initial"]);
    fs::write(&tracked_file, "export const state = 'staged';\n").unwrap();
    git(&workspace, &["add", "app.js"]);
    fs::write(
        &tracked_file,
        "export const state = 'unstaged working tree';\n",
    )
    .unwrap();
    fs::write(workspace.join("notes.txt"), "untracked notes\n").unwrap();

    let context = workspace_commit_context(&workspace, &workspace, ".", false).unwrap();

    assert!(context.contains("state = 'staged'"));
    assert!(!context.contains("unstaged working tree"));
    assert!(!context.contains("untracked notes"));
    assert!(!context.contains("## Working tree diff"));
    assert!(!context.contains("## Untracked file samples"));
    remove_test_directory(workspace);
}

#[cfg(unix)]
#[test]
fn timed_command_drains_large_output_without_deadlocking() {
    let output = run_command_with_stdin_timeout(
        "/bin/sh",
        &["-c".to_string(), "yes x | head -c 262144".to_string()],
        "",
        None,
        Duration::from_secs(5),
        "output drain test",
    )
    .unwrap();

    assert!(output.ok, "{}", output.stderr);
    assert!(output.stdout.len() >= 262_000);
}

#[test]
fn commit_subject_validation_rejects_procedural_and_unrelated_subjects() {
    let intent = WorkspaceCommitIntentContext {
        objective: Some("Create an expressJS app in this directory".to_string()),
        approved_plan: Some(
            "Create a minimal Express scaffold with a GET /health endpoint.".to_string(),
        ),
        implementation_outcome: Some(
            "Implemented a CommonJS Express app and health endpoint.".to_string(),
        ),
    };
    let git_context = "?? package.json\n?? src/app.js\n?? src/server.js";

    assert!(
        commit_subject_rejection_reason("Implement the plan", Some(&intent), git_context,)
            .unwrap()
            .contains("orchestration")
    );
    assert!(commit_subject_rejection_reason(
        "Improve notification routing",
        Some(&intent),
        git_context,
    )
    .unwrap()
    .contains("could not be tied"));
    assert!(commit_subject_rejection_reason(
        "Scaffold minimal Express health service",
        Some(&intent),
        git_context,
    )
    .is_none());
    assert!(commit_subject_rejection_reason(
        "Scaffold minimal Express health service (5 added)",
        Some(&intent),
        git_context,
    )
    .unwrap()
    .contains("change-count"));
    assert_eq!(
        validate_generated_commit_subject(
            "Scaffold minimal Express health service",
            Some(&intent),
            git_context,
        )
        .as_deref(),
        Ok("Scaffold minimal Express health service"),
    );
    assert!(validate_generated_commit_subject(
        "Subject: Scaffold minimal Express health service",
        Some(&intent),
        git_context,
    )
    .unwrap_err()
    .contains("exactly one plain subject line"));
}

#[test]
fn create_git_branch_switches_and_preserves_workspace_changes() {
    let workspace = git_test_directory("git-create-branch-preserves-changes");
    let tracked_file = workspace.join("tracked.txt");
    fs::write(&tracked_file, "initial\n").unwrap();
    git(&workspace, &["add", "tracked.txt"]);
    git(&workspace, &["commit", "-m", "initial"]);

    fs::write(&tracked_file, "staged\n").unwrap();
    git(&workspace, &["add", "tracked.txt"]);
    fs::write(&tracked_file, "unstaged\n").unwrap();
    fs::write(workspace.join("untracked.txt"), "untracked\n").unwrap();

    let result = create_git_branch_blocking(
        workspace.to_string_lossy().to_string(),
        "feature/preserved-worktree".to_string(),
    )
    .unwrap();

    assert_eq!(result.branch, "feature/preserved-worktree");
    assert_eq!(
        git_stdout(&workspace, &["branch", "--show-current"]).trim(),
        "feature/preserved-worktree"
    );
    let status = git_stdout(&workspace, &["status", "--short"]);
    assert!(status.contains("MM tracked.txt"), "{status}");
    assert!(status.contains("?? untracked.txt"), "{status}");
    remove_test_directory(workspace);
}

#[test]
fn create_git_branch_rejects_empty_invalid_and_existing_names() {
    let workspace = git_test_directory("git-create-branch-validation");
    fs::write(workspace.join("tracked.txt"), "initial\n").unwrap();
    git(&workspace, &["add", "tracked.txt"]);
    git(&workspace, &["commit", "-m", "initial"]);
    let current_branch = git_stdout(&workspace, &["branch", "--show-current"])
        .trim()
        .to_string();
    let workspace_path = workspace.to_string_lossy().to_string();

    assert_eq!(
        create_git_branch_blocking(workspace_path.clone(), "   ".to_string()).unwrap_err(),
        "Enter a branch name"
    );
    assert!(
        create_git_branch_blocking(workspace_path.clone(), "feature..invalid".to_string(),)
            .unwrap_err()
            .contains("not a valid branch name")
    );
    assert!(create_git_branch_blocking(workspace_path, current_branch)
        .unwrap_err()
        .contains("already exists"));
    remove_test_directory(workspace);
}

#[test]
fn create_git_branch_supports_an_unborn_repository() {
    let workspace = git_test_directory("git-create-branch-unborn");

    let result = create_git_branch_blocking(
        workspace.to_string_lossy().to_string(),
        "feature/first-commit".to_string(),
    )
    .unwrap();

    assert_eq!(result.branch, "feature/first-commit");
    assert_eq!(
        git_stdout(&workspace, &["branch", "--show-current"]).trim(),
        "feature/first-commit"
    );
    remove_test_directory(workspace);
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
    git(
        &workspace,
        &["remote", "add", "origin", origin.to_string_lossy().as_ref()],
    );

    let result = push_workspace_branch_blocking(workspace.to_string_lossy().to_string()).unwrap();
    let upstream = Command::new("git")
        .arg("-C")
        .arg(&workspace)
        .args(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"])
        .output()
        .expect("read git upstream");

    assert_eq!(
        result.branch.as_deref(),
        current_git_branch(&workspace).as_deref()
    );
    assert!(upstream.status.success());
    assert!(String::from_utf8_lossy(&upstream.stdout).contains("origin/"));
    remove_test_directory(workspace);
    remove_test_directory(origin);
}

fn git_test_directory(name: &str) -> PathBuf {
    let workspace = test_directory(name);
    initialize_git_repository(&workspace);
    workspace
}

fn initialize_git_repository(workspace: &Path) {
    fs::create_dir_all(workspace).expect("create Git repository directory");
    git(&workspace, &["init"]);
    git(&workspace, &["config", "user.email", "test@example.com"]);
    git(&workspace, &["config", "user.name", "Orchestrator Test"]);
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

fn git_stdout(workspace: &Path, args: &[&str]) -> String {
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
    String::from_utf8_lossy(&output.stdout).to_string()
}
