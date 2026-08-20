use std::{path::PathBuf, process::Command};

const MAX_CONTINUATION_PROMPT_CHARACTERS: usize = 64_000;

fn codex_new_task_url(workspace_path: &str, prompt: &str) -> Result<String, String> {
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err("Codex Desktop requires continuation context.".to_string());
    }
    if prompt.chars().count() > MAX_CONTINUATION_PROMPT_CHARACTERS {
        return Err("The Codex Desktop continuation context is too large.".to_string());
    }
    let workspace_path = canonical_workspace_path(workspace_path)?;
    let workspace_path = workspace_path
        .to_str()
        .ok_or_else(|| "The Codex workspace path is not valid UTF-8.".to_string())?;
    let mut url = url::Url::parse("codex://new")
        .map_err(|error| format!("Could not build the Codex Desktop link: {error}"))?;
    url.query_pairs_mut()
        .append_pair("path", workspace_path)
        .append_pair("prompt", prompt);
    Ok(url.into())
}

fn canonical_workspace_path(workspace_path: &str) -> Result<PathBuf, String> {
    let workspace_path = workspace_path.trim();
    if workspace_path.is_empty() {
        return Err("Codex Desktop requires a workspace path.".to_string());
    }
    let canonical = std::fs::canonicalize(workspace_path)
        .map_err(|error| format!("Could not resolve the Codex workspace: {error}"))?;
    if !canonical.is_dir() {
        return Err("The Codex workspace is not a directory.".to_string());
    }
    Ok(canonical)
}

#[cfg(target_os = "macos")]
fn open_codex_workspace_continuation(workspace_path: String, prompt: String) -> Result<(), String> {
    let url = codex_new_task_url(&workspace_path, &prompt)?;
    let output = Command::new("/usr/bin/open")
        .arg(url)
        .output()
        .map_err(|error| format!("Could not prepare the task in Codex Desktop: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            "Codex Desktop did not accept the continuation.".to_string()
        } else {
            format!("Codex Desktop did not accept the continuation: {stderr}")
        })
    }
}

#[cfg(not(target_os = "macos"))]
fn open_codex_workspace_continuation(
    _workspace_path: String,
    _prompt: String,
) -> Result<(), String> {
    Err("Opening a task in Codex Desktop is currently supported on macOS only.".to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn codex_desktop_continue_task(
    workspace_path: String,
    prompt: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        open_codex_workspace_continuation(workspace_path, prompt)
    })
    .await
    .map_err(|error| format!("Could not continue the task in Codex Desktop: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::{canonical_workspace_path, codex_new_task_url};

    #[test]
    fn builds_a_workspace_scoped_codex_continuation_link() {
        let workspace = std::env::temp_dir();
        let url = codex_new_task_url(
            workspace.to_str().expect("temporary path should be UTF-8"),
            "Continue this task & preserve context.",
        )
        .unwrap();
        let parsed = url::Url::parse(&url).unwrap();
        let query = parsed
            .query_pairs()
            .into_owned()
            .collect::<std::collections::HashMap<_, _>>();
        assert_eq!(parsed.scheme(), "codex");
        assert_eq!(parsed.host_str(), Some("new"));
        assert_eq!(
            query.get("path"),
            Some(
                &std::fs::canonicalize(workspace)
                    .unwrap()
                    .display()
                    .to_string()
            )
        );
        assert_eq!(
            query.get("prompt"),
            Some(&"Continue this task & preserve context.".to_string())
        );
    }

    #[test]
    fn rejects_missing_workspace_paths() {
        assert!(canonical_workspace_path("").is_err());
        assert!(canonical_workspace_path("/definitely/missing/orchestrator-workspace").is_err());
    }

    #[test]
    fn rejects_empty_continuation_context() {
        assert!(codex_new_task_url(
            std::env::temp_dir()
                .to_str()
                .expect("temporary path should be UTF-8"),
            "  ",
        )
        .is_err());
    }
}
