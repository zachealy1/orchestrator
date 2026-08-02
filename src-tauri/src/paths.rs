use super::*;

pub(crate) fn package_hints(workspace: &Path) -> Vec<&'static str> {
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

pub(crate) fn estimate_tokens(prompt: &str) -> usize {
    (prompt.chars().count() / 4).max(prompt.split_whitespace().count())
}

pub(crate) fn route_recommendation(prompt: &str, token_estimate: usize) -> String {
    let lower = prompt.to_lowercase();
    let broad = [
        "build",
        "implement",
        "refactor",
        "migrate",
        "redesign",
        "architecture",
    ]
    .iter()
    .any(|needle| lower.contains(needle));
    let risky = [
        "delete",
        "auth",
        "security",
        "payment",
        "database",
        "migration",
    ]
    .iter()
    .any(|needle| lower.contains(needle));

    if token_estimate > 180 || broad || risky {
        "plan-first".to_string()
    } else {
        "direct-run".to_string()
    }
}

pub(crate) fn improve_prompt(prompt: &str) -> String {
    let trimmed = prompt.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    format!(
        "Objective:\n{trimmed}\n\nContext:\nInspect the selected repository before changing files. Preserve existing conventions and avoid unrelated refactors.\n\nConstraints:\nUse workspace-write permissions only inside the selected repo. Surface uncertainty before risky changes.\n\nAcceptance criteria:\n- Implement the requested behavior completely.\n- Keep changes focused and easy to review.\n- Run the most relevant available checks.\n\nVerification:\nReport commands run, results, and any remaining risk."
    )
}

pub(crate) fn canonical_workspace_child(
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

pub(crate) fn canonical_workspace(workspace_path: &str) -> Result<PathBuf, String> {
    let workspace = fs::canonicalize(workspace_path)
        .map_err(|error| format!("Unable to open workspace {workspace_path}: {error}"))?;
    if !workspace.is_dir() {
        return Err("Selected workspace is not a directory".to_string());
    }
    Ok(workspace)
}

pub(crate) fn workspace_child_path_allow_missing(
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

pub(crate) fn relative_workspace_path(workspace: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(workspace)
        .map_err(|_| "Selected path is outside the workspace".to_string())?;

    Ok(relative.to_string_lossy().replace('\\', "/"))
}

pub(crate) fn read_workspace_file_preview_text(
    workspace: &Path,
    file_path: &Path,
) -> Result<PreviewText, String> {
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

pub(crate) fn preview_text_from_bytes(bytes: &[u8]) -> PreviewText {
    let preview_len = bytes.len().min(MAX_FILE_PREVIEW_BYTES);
    let preview_bytes = &bytes[..preview_len];
    let (content, is_binary) = decode_preview_text(preview_bytes);
    PreviewText {
        content,
        truncated: bytes.len() > MAX_FILE_PREVIEW_BYTES,
        is_binary,
    }
}

pub(crate) fn empty_preview_text() -> PreviewText {
    PreviewText {
        content: String::new(),
        truncated: false,
        is_binary: false,
    }
}

pub(crate) fn reconstruct_missing_absolute_path(path: &Path) -> Result<PathBuf, String> {
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

pub(crate) fn synthetic_untracked_diff(
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

pub(crate) fn decode_preview_text(bytes: &[u8]) -> (String, bool) {
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
