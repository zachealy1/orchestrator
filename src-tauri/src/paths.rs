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

    let mut source = fs::File::open(&canonical_file)
        .map_err(|error| format!("Unable to read {}: {error}", canonical_file.display()))?;
    let metadata = source
        .metadata()
        .map_err(|error| format!("Unable to inspect {}: {error}", canonical_file.display()))?;
    let mut probe = Vec::with_capacity(WORKSPACE_FILE_BINARY_PROBE_BYTES);
    Read::by_ref(&mut source)
        .take(WORKSPACE_FILE_BINARY_PROBE_BYTES as u64)
        .read_to_end(&mut probe)
        .map_err(|error| format!("Unable to read {}: {error}", canonical_file.display()))?;

    let probe_reaches_end_of_file = probe.len() as u64 == metadata.len();
    let probe_is_binary = probe.contains(&0)
        || matches!(
            std::str::from_utf8(&probe),
            Err(error) if error.error_len().is_some() || probe_reaches_end_of_file
        );
    if probe_is_binary {
        return Ok(PreviewText {
            content: String::new(),
            truncated: false,
            is_binary: true,
        });
    }

    source
        .seek(std::io::SeekFrom::Start(0))
        .map_err(|error| format!("Unable to read {}: {error}", canonical_file.display()))?;
    let mut bytes =
        Vec::with_capacity((metadata.len() as usize).min(WORKSPACE_PREVIEW_MAX_BYTES + 1));
    Read::by_ref(&mut source)
        .take((WORKSPACE_PREVIEW_MAX_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Unable to read {}: {error}", canonical_file.display()))?;
    Ok(preview_text_from_bytes(&bytes))
}

pub(crate) fn preview_text_from_bytes(bytes: &[u8]) -> PreviewText {
    let truncated = bytes.len() > WORKSPACE_PREVIEW_MAX_BYTES;
    let bounded = &bytes[..bytes.len().min(WORKSPACE_PREVIEW_MAX_BYTES)];
    let (mut content, is_binary) = decode_preview_text(bounded);
    if truncated && !is_binary {
        content = truncate_to_complete_line(content);
    }
    PreviewText {
        content,
        truncated,
        is_binary,
    }
}

pub(crate) fn bounded_unified_diff(diff: String) -> (String, bool) {
    if diff.len() <= WORKSPACE_PREVIEW_MAX_BYTES {
        return (diff, false);
    }

    let mut prefix = String::new();
    let mut hunks = Vec::<String>::new();
    let mut current_hunk: Option<String> = None;
    for line in diff.split_inclusive('\n') {
        if line.starts_with("@@ ") {
            if let Some(hunk) = current_hunk.take() {
                hunks.push(hunk);
            }
            current_hunk = Some(line.to_string());
        } else if let Some(hunk) = current_hunk.as_mut() {
            hunk.push_str(line);
        } else {
            prefix.push_str(line);
        }
    }
    if let Some(hunk) = current_hunk {
        hunks.push(hunk);
    }

    let mut bounded = prefix;
    for hunk in hunks {
        if bounded.len() + hunk.len() > WORKSPACE_PREVIEW_MAX_BYTES {
            break;
        }
        bounded.push_str(&hunk);
    }
    if bounded.len() > WORKSPACE_PREVIEW_MAX_BYTES {
        let mut boundary = WORKSPACE_PREVIEW_MAX_BYTES;
        while !bounded.is_char_boundary(boundary) {
            boundary -= 1;
        }
        bounded.truncate(boundary);
        bounded = truncate_to_complete_line(bounded);
    }
    (bounded, true)
}

fn truncate_to_complete_line(mut content: String) -> String {
    if content.ends_with('\n') || content.ends_with('\r') {
        return content;
    }
    if let Some(index) = content.rfind(['\n', '\r']) {
        content.truncate(index + 1);
    } else {
        content.clear();
    }
    content
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

    let (diff, diff_truncated) = bounded_unified_diff(diff);
    Ok(WorkspaceGitDiffSection {
        kind: "untracked".to_string(),
        title: "Untracked file".to_string(),
        base_label: "/dev/null".to_string(),
        head_label: format!("Working tree:{relative_path}"),
        base_content: String::new(),
        head_content: head.content,
        base_truncated: diff_truncated,
        head_truncated: head.truncated || diff_truncated,
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
