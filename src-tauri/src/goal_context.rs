use super::*;

#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreparedGoalContext {
    pub(crate) objective: String,
    pub(crate) directory_path: Option<String>,
    pub(crate) files: Vec<String>,
}

fn goal_context_root(home: &Path) -> PathBuf {
    home.join("attachments").join("orchestrator-goals")
}

pub(crate) fn prepare_goal_context_at(
    home: &Path,
    objective: String,
    context_json: Option<String>,
    image_paths: Vec<String>,
) -> Result<PreparedGoalContext, String> {
    if objective.trim().is_empty() {
        return Err("Goal objective must not be empty".into());
    }
    if context_json.is_none() && image_paths.is_empty() && objective.chars().count() <= 4_000 {
        return Ok(PreparedGoalContext {
            objective,
            directory_path: None,
            files: vec![],
        });
    }
    if let Some(context) = &context_json {
        serde_json::from_str::<Value>(context)
            .map_err(|error| format!("Invalid Goal context: {error}"))?;
    }
    let root = goal_context_root(home);
    fs::create_dir_all(&root)
        .map_err(|error| format!("Could not create Goal attachments: {error}"))?;
    let root = fs::canonicalize(root).map_err(|error| error.to_string())?;
    let directory = root.join(uuid::Uuid::new_v4().to_string());
    fs::create_dir(&directory)
        .map_err(|error| format!("Could not create Goal context: {error}"))?;
    let result = (|| {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))
                .map_err(|error| error.to_string())?;
        }
        let mut effective = objective;
        let mut files = vec![];
        if let Some(context) = context_json {
            let path = directory.join("goal-context.json");
            fs::write(&path, context).map_err(|error| error.to_string())?;
            effective.push_str(&format!(
                "\n\nReferenced supporting context: {}. Read this file before continuing.",
                path.display()
            ));
            files.push(path.to_string_lossy().into_owned());
        }
        for (index, source) in image_paths.into_iter().enumerate() {
            let preview = prepare_image_attachment_blocking(source)?
                .ok_or("Goal image attachment is not a supported image")?;
            let extension = match preview.mime_type.as_str() {
                "image/jpeg" => "jpg",
                "image/webp" => "webp",
                "image/gif" => "gif",
                _ => "png",
            };
            let path = directory.join(format!("image-{}.{}", index + 1, extension));
            fs::copy(preview.path, &path)
                .map_err(|error| format!("Could not retain Goal image: {error}"))?;
            effective.push_str(&format!(
                "\n\nReferenced image #{}: {}",
                index + 1,
                path.display()
            ));
            files.push(path.to_string_lossy().into_owned());
        }
        if effective.chars().count() > 4_000 {
            let path = directory.join("goal-objective.md");
            fs::write(&path, effective).map_err(|error| error.to_string())?;
            effective = format!(
                "Read the Codex goal objective file at {} before continuing.",
                path.display()
            );
            files.push(path.to_string_lossy().into_owned());
        }
        if effective.chars().count() > 4_000 {
            return Err("Goal objective file reference exceeds the native limit".into());
        }
        Ok(PreparedGoalContext {
            objective: effective,
            directory_path: Some(directory.to_string_lossy().into_owned()),
            files,
        })
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&directory);
    }
    result
}

pub(crate) fn discard_goal_context_at(home: &Path, directory_path: &str) -> Result<(), String> {
    let directory = Path::new(directory_path);
    let root = fs::canonicalize(goal_context_root(home)).map_err(|error| error.to_string())?;
    let name = directory
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    if directory.parent() != Some(root.as_path()) || uuid::Uuid::parse_str(name).is_err() {
        return Err("Only an Orchestrator Goal attachment directory can be discarded".into());
    }
    let metadata = match fs::symlink_metadata(directory) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("Goal attachment directory is invalid".into());
    }
    fs::remove_dir_all(directory).map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn prepare_goal_context(
    app: AppHandle,
    account_id: i64,
    objective: String,
    context_json: Option<String>,
    image_paths: Vec<String>,
) -> Result<PreparedGoalContext, String> {
    let home = ensure_codex_home_for_account(&app, account_id)?;
    run_blocking_command("prepare Goal context", move || {
        prepare_goal_context_at(&home, objective, context_json, image_paths)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn discard_goal_context(
    app: AppHandle,
    account_id: i64,
    directory_path: String,
) -> Result<(), String> {
    let home = ensure_codex_home_for_account(&app, account_id)?;
    run_blocking_command("discard unsubmitted Goal context", move || {
        discard_goal_context_at(&home, &directory_path)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> PathBuf {
        let path = env::temp_dir().join(format!("orchestrator-goal-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn plain_goal_is_unchanged_and_needs_no_files() {
        let home = fixture();
        let objective = "Why does this fail?\n\n```rs\n  example()\n```";
        let prepared = prepare_goal_context_at(&home, objective.into(), None, vec![]).unwrap();
        assert_eq!(prepared.objective, objective);
        assert!(prepared.files.is_empty());
        assert!(prepared.directory_path.is_none());
        assert!(!goal_context_root(&home).exists());
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn long_goal_and_context_are_retained_and_cleanup_is_scoped() {
        let home = fixture();
        let objective = "🙂".repeat(4_001);
        let context = r#"{"context":{"kind":"untrusted","value":"quoted\ncontent"}}"#;
        let prepared =
            prepare_goal_context_at(&home, objective.clone(), Some(context.into()), vec![])
                .unwrap();
        assert!(prepared.objective.chars().count() <= 4_000);
        assert_eq!(prepared.files.len(), 2);
        assert_eq!(fs::read_to_string(&prepared.files[0]).unwrap(), context);
        assert!(fs::read_to_string(&prepared.files[1])
            .unwrap()
            .starts_with(&objective));
        assert!(discard_goal_context_at(&home, home.to_str().unwrap()).is_err());
        let directory = prepared.directory_path.unwrap();
        discard_goal_context_at(&home, &directory).unwrap();
        discard_goal_context_at(&home, &directory).unwrap();
        assert!(!Path::new(&directory).exists());
        fs::remove_dir_all(home).unwrap();
    }

    #[test]
    fn images_survive_source_removal_and_failed_preparation_leaves_no_partial_files() {
        let home = fixture();
        let source = home.join("source.png");
        image::RgbaImage::new(2, 2).save(&source).unwrap();
        let prepared = prepare_goal_context_at(
            &home,
            "Explain this image".into(),
            None,
            vec![source.to_string_lossy().into_owned()],
        )
        .unwrap();
        fs::remove_file(source).unwrap();
        assert!(Path::new(&prepared.files[0]).exists());
        let before = fs::read_dir(goal_context_root(&home)).unwrap().count();
        assert!(prepare_goal_context_at(
            &home,
            "Question".into(),
            Some("{}".into()),
            vec!["/missing/image.png".into()]
        )
        .is_err());
        assert_eq!(
            fs::read_dir(goal_context_root(&home)).unwrap().count(),
            before
        );
        fs::remove_dir_all(home).unwrap();
    }
}
