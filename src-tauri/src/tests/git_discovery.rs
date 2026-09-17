use super::*;

#[test]
fn repository_discovery_preserves_git_execution_failures() {
    let workspace = test_directory("git-discovery-failed-probe");
    for diagnostic in [
        "You have not agreed to the Xcode license agreements.",
        "fatal: detected dubious ownership in repository",
        "fatal: unable to read config file: Permission denied",
    ] {
        let result = discover_git_repositories_with_probe(&workspace, |candidate| {
            git_worktree_probe_root(
                candidate,
                CommandProbe {
                    ok: false,
                    stdout: String::new(),
                    stderr: diagnostic.to_string(),
                },
            )
        });
        let error = result
            .err()
            .expect("Git failures must not become an empty repository list");
        assert!(error.contains(diagnostic), "{error}");
        assert!(!error.contains("does not belong"));
    }
    let result = discover_git_repositories_with_probe(&workspace, |_| {
        Err("Unable to run Git: No such file or directory".to_string())
    });
    assert!(result.err().unwrap().contains("Unable to run Git"));
    remove_test_directory(workspace);
}

#[test]
fn repository_discovery_propagates_a_nested_probe_failure_after_finding_the_root() {
    let workspace = test_directory("git-discovery-nested-failure");
    let nested = workspace.join("nested");
    fs::create_dir_all(nested.join(".git")).unwrap();
    let mut calls = Vec::new();
    let result = discover_git_repositories_with_probe(&workspace, |candidate| {
        calls.push(candidate.to_path_buf());
        if candidate == workspace {
            Ok(Some(workspace.clone()))
        } else {
            Err("Git stopped working during discovery".to_string())
        }
    });
    assert_eq!(calls, vec![workspace.clone(), nested]);
    assert_eq!(
        result.err().unwrap(),
        "Git stopped working during discovery"
    );
    remove_test_directory(workspace);
}

#[test]
fn repository_selection_reports_broken_git_metadata_and_recovers_after_repair() {
    let workspace = test_directory("git-discovery-recovery");
    fs::create_dir(workspace.join(".git")).unwrap();
    let canonical = fs::canonicalize(&workspace).unwrap();
    let requested = canonical.to_string_lossy();
    let error = resolve_workspace_git_repository(&canonical, Some(requested.as_ref()))
        .err()
        .expect("broken .git metadata must fail validation");
    assert!(
        error.contains("Unable to inspect Git repository"),
        "{error}"
    );
    assert!(!error.contains("does not belong"));

    assert!(Command::new("git")
        .arg("init")
        .arg(&workspace)
        .output()
        .unwrap()
        .status
        .success());
    let (repositories, _) = discover_git_repositories(&canonical, false).unwrap();
    assert_eq!(
        repositories.len(),
        1,
        "failed discovery must not cache an empty list"
    );
    let selected = resolve_workspace_git_repository(&canonical, Some(requested.as_ref())).unwrap();
    assert_eq!(selected.root, canonical);
    remove_test_directory(workspace);
}

#[test]
fn repository_discovery_ignores_bare_repositories() {
    let workspace = test_directory("git-discovery-bare");
    assert!(Command::new("git")
        .args(["init", "--bare"])
        .arg(&workspace)
        .output()
        .unwrap()
        .status
        .success());
    let (repositories, truncated) = discover_git_repositories_uncached(&workspace).unwrap();
    assert!(repositories.is_empty());
    assert!(!truncated);
    remove_test_directory(workspace);
}
