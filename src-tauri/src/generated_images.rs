use super::*;
use sha2::{Digest, Sha256};

const GENERATED_IMAGES_DIRECTORY: &str = "generated_images";

fn shared_generated_images_root() -> Result<PathBuf, String> {
    let codex_home = ensure_default_codex_home()?;
    Ok(codex_home.join(GENERATED_IMAGES_DIRECTORY))
}

fn safe_path_segment(value: &str) -> bool {
    !value.is_empty()
        && Path::new(value)
            .components()
            .all(|component| matches!(component, std::path::Component::Normal(_)))
        && Path::new(value).components().count() == 1
}

fn ensure_private_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("Could not create {}: {error}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("Could not secure {}: {error}", path.display()))?;
    }
    Ok(())
}

pub(crate) fn prepare_generated_image_thread_alias(
    codex_home: &Path,
    thread_id: &str,
) -> Result<(), String> {
    prepare_generated_image_thread_alias_at(codex_home, &shared_generated_images_root()?, thread_id)
}

fn prepare_generated_image_thread_alias_at(
    codex_home: &Path,
    shared_root: &Path,
    thread_id: &str,
) -> Result<(), String> {
    if !safe_path_segment(thread_id) {
        return Err("Generated-image thread id is invalid".to_string());
    }
    let isolated_root = codex_home.join(GENERATED_IMAGES_DIRECTORY);
    let isolated_thread = isolated_root.join(thread_id);
    let shared_thread = shared_root.join(thread_id);
    ensure_private_directory(&isolated_root)?;
    ensure_private_directory(&shared_thread)?;

    match fs::symlink_metadata(&isolated_thread) {
        Ok(_) => return Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "Could not inspect {}: {error}",
                isolated_thread.display()
            ))
        }
    }

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&shared_thread, &isolated_thread).map_err(|error| {
            format!(
                "Could not link {} to {}: {error}",
                isolated_thread.display(),
                shared_thread.display()
            )
        })?;
    }
    #[cfg(not(unix))]
    {
        ensure_private_directory(&isolated_thread)?;
    }
    Ok(())
}

fn hash_file(path: &Path) -> Result<[u8; 32], String> {
    let mut file = fs::File::open(path)
        .map_err(|error| format!("Could not open {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hasher.finalize().into())
}

fn files_are_identical(left: &Path, right: &Path) -> Result<bool, String> {
    let left_metadata = fs::metadata(left)
        .map_err(|error| format!("Could not inspect {}: {error}", left.display()))?;
    let right_metadata = fs::metadata(right)
        .map_err(|error| format!("Could not inspect {}: {error}", right.display()))?;
    if left_metadata.len() != right_metadata.len() {
        return Ok(false);
    }
    Ok(hash_file(left)? == hash_file(right)?)
}

fn safe_item_suffix(item_id: &str) -> String {
    let suffix = item_id
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || *character == '-' || *character == '_'
        })
        .take(48)
        .collect::<String>();
    if suffix.is_empty() {
        "image".to_string()
    } else {
        suffix
    }
}

fn suffixed_file_name(file_name: &str, suffix: &str, attempt: usize) -> String {
    let path = Path::new(file_name);
    let stem = path.file_stem().and_then(OsStr::to_str).unwrap_or("image");
    let extension = path.extension().and_then(OsStr::to_str);
    let discriminator = if attempt == 0 {
        suffix.to_string()
    } else {
        format!("{suffix}-{attempt}")
    };
    match extension {
        Some(extension) if !extension.is_empty() => {
            format!("{stem}-{discriminator}.{extension}")
        }
        _ => format!("{stem}-{discriminator}"),
    }
}

fn select_destination(
    source: &Path,
    shared_thread: &Path,
    file_name: &str,
    item_id: &str,
) -> Result<(PathBuf, bool), String> {
    let preferred = shared_thread.join(file_name);
    if !preferred.exists() {
        return Ok((preferred, false));
    }
    if files_are_identical(source, &preferred)? {
        return Ok((preferred, true));
    }

    let suffix = safe_item_suffix(item_id);
    for attempt in 0..1_000 {
        let candidate = shared_thread.join(suffixed_file_name(file_name, &suffix, attempt));
        if !candidate.exists() {
            return Ok((candidate, false));
        }
        if files_are_identical(source, &candidate)? {
            return Ok((candidate, true));
        }
    }
    Err("Could not select a unique generated-image filename".to_string())
}

#[cfg(unix)]
fn create_file_symlink(target: &Path, link: &Path) -> Result<(), String> {
    std::os::unix::fs::symlink(target, link).map_err(|error| {
        format!(
            "Could not link {} to {}: {error}",
            link.display(),
            target.display()
        )
    })
}

#[cfg(not(unix))]
fn create_file_symlink(_target: &Path, _link: &Path) -> Result<(), String> {
    Err("Generated-image compatibility links require Unix".to_string())
}

fn restore_source_after_link_failure(
    source: &Path,
    destination: &Path,
    destination_was_created: bool,
) -> Result<(), String> {
    if source.exists() {
        return Ok(());
    }
    if destination_was_created && fs::rename(destination, source).is_ok() {
        return Ok(());
    }
    fs::copy(destination, source).map_err(|error| {
        format!(
            "Could not restore {} from {}: {error}",
            source.display(),
            destination.display()
        )
    })?;
    if !files_are_identical(source, destination)? {
        return Err(format!(
            "Restored image {} did not verify",
            source.display()
        ));
    }
    if destination_was_created {
        let _ = fs::remove_file(destination);
    }
    Ok(())
}

fn copy_to_destination(source: &Path, destination: &Path) -> Result<(), String> {
    let file_name = destination
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("image");
    let temporary =
        destination.with_file_name(format!(".{file_name}.{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut reader = fs::File::open(source)
            .map_err(|error| format!("Could not open {}: {error}", source.display()))?;
        let mut writer = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| format!("Could not create {}: {error}", temporary.display()))?;
        std::io::copy(&mut reader, &mut writer)
            .map_err(|error| format!("Could not copy {}: {error}", source.display()))?;
        writer
            .sync_all()
            .map_err(|error| format!("Could not sync {}: {error}", temporary.display()))?;
        if !files_are_identical(source, &temporary)? {
            return Err(format!(
                "Copied image {} did not verify",
                temporary.display()
            ));
        }
        fs::rename(&temporary, destination).map_err(|error| {
            format!(
                "Could not finalize {} as {}: {error}",
                temporary.display(),
                destination.display()
            )
        })
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn move_with_compatibility_link(
    source: &Path,
    destination: &Path,
    destination_already_existed: bool,
) -> Result<(), String> {
    let destination_was_created = !destination_already_existed;
    if destination_already_existed {
        fs::remove_file(source)
            .map_err(|error| format!("Could not remove {}: {error}", source.display()))?;
    } else if fs::rename(source, destination).is_err() {
        copy_to_destination(source, destination)?;
        fs::remove_file(source)
            .map_err(|error| format!("Could not remove {}: {error}", source.display()))?;
    }

    if let Err(link_error) = create_file_symlink(destination, source) {
        let rollback =
            restore_source_after_link_failure(source, destination, destination_was_created);
        return match rollback {
            Ok(()) => Err(link_error),
            Err(rollback_error) => Err(format!("{link_error}; rollback failed: {rollback_error}")),
        };
    }
    Ok(())
}

fn item_saved_path_key(item: &serde_json::Map<String, Value>) -> Option<&'static str> {
    if item.get("savedPath").and_then(Value::as_str).is_some() {
        Some("savedPath")
    } else if item.get("saved_path").and_then(Value::as_str).is_some() {
        Some("saved_path")
    } else {
        None
    }
}

pub(crate) fn normalize_image_generation_notification(
    codex_home: &Path,
    message: &mut Value,
) -> Result<bool, String> {
    if message.get("method").and_then(Value::as_str) != Some("item/completed")
        || message
            .get("params")
            .and_then(|params| params.get("item"))
            .and_then(|item| item.get("type"))
            .and_then(Value::as_str)
            != Some("imageGeneration")
    {
        return Ok(false);
    }
    normalize_image_generation_notification_at(
        codex_home,
        &shared_generated_images_root()?,
        message,
    )
}

fn normalize_image_generation_notification_at(
    codex_home: &Path,
    shared_root: &Path,
    message: &mut Value,
) -> Result<bool, String> {
    if message.get("method").and_then(Value::as_str) != Some("item/completed") {
        return Ok(false);
    }
    let params = message
        .get_mut("params")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| "Image-generation notification params are missing".to_string())?;
    let is_image_generation = params
        .get("item")
        .and_then(Value::as_object)
        .and_then(|item| item.get("type"))
        .and_then(Value::as_str)
        == Some("imageGeneration");
    if !is_image_generation {
        return Ok(false);
    }
    let thread_id = params
        .get("threadId")
        .and_then(Value::as_str)
        .ok_or_else(|| "Image-generation thread id is missing".to_string())?
        .to_string();
    if !safe_path_segment(&thread_id) {
        return Err("Image-generation thread id is invalid".to_string());
    }
    let item = params
        .get_mut("item")
        .and_then(Value::as_object_mut)
        .expect("image-generation item was checked");
    let Some(saved_path_key) = item_saved_path_key(item) else {
        return Ok(false);
    };
    let saved_path = item
        .get(saved_path_key)
        .and_then(Value::as_str)
        .expect("saved path key was checked")
        .to_string();
    let source = PathBuf::from(&saved_path);
    if !source.is_absolute() {
        return Err("Generated-image savedPath must be absolute".to_string());
    }

    let isolated_thread = codex_home.join(GENERATED_IMAGES_DIRECTORY).join(&thread_id);
    let relative = source.strip_prefix(&isolated_thread).map_err(|_| {
        format!(
            "Generated image {} is outside the isolated thread directory",
            source.display()
        )
    })?;
    if relative.components().count() != 1 {
        return Err("Generated image path has an invalid filename".to_string());
    }
    let file_name = relative
        .file_name()
        .and_then(OsStr::to_str)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Generated image filename is invalid".to_string())?;
    let shared_thread = shared_root.join(&thread_id);
    ensure_private_directory(&shared_thread)?;

    if fs::symlink_metadata(&isolated_thread)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
    {
        let linked_target = fs::canonicalize(&isolated_thread)
            .map_err(|error| format!("Could not resolve {}: {error}", isolated_thread.display()))?;
        let expected_target = fs::canonicalize(&shared_thread)
            .map_err(|error| format!("Could not resolve {}: {error}", shared_thread.display()))?;
        if linked_target != expected_target {
            return Err("Generated-image thread alias targets an unexpected directory".to_string());
        }
        let canonical_path = shared_thread.join(file_name);
        if !canonical_path.is_file() {
            return Err(format!(
                "Generated image {} is unavailable",
                canonical_path.display()
            ));
        }
        item.insert(
            saved_path_key.to_string(),
            Value::String(canonical_path.to_string_lossy().to_string()),
        );
        return Ok(true);
    }

    let source_metadata = fs::symlink_metadata(&source)
        .map_err(|error| format!("Could not inspect {}: {error}", source.display()))?;
    if source_metadata.file_type().is_symlink() {
        let target = fs::canonicalize(&source)
            .map_err(|error| format!("Could not resolve {}: {error}", source.display()))?;
        if target.starts_with(&shared_thread) && target.is_file() {
            item.insert(
                saved_path_key.to_string(),
                Value::String(target.to_string_lossy().to_string()),
            );
            return Ok(true);
        }
        return Err("Generated-image savedPath cannot be a symlink".to_string());
    }
    if !source_metadata.file_type().is_file() {
        return Err("Generated-image savedPath is not a regular file".to_string());
    }

    let item_id = item.get("id").and_then(Value::as_str).unwrap_or("image");
    let (destination, destination_already_existed) =
        select_destination(&source, &shared_thread, file_name, item_id)?;
    move_with_compatibility_link(&source, &destination, destination_already_existed)?;
    item.insert(
        saved_path_key.to_string(),
        Value::String(destination.to_string_lossy().to_string()),
    );
    Ok(true)
}

pub(crate) fn notification_thread_id(message: &Value) -> Option<&str> {
    message
        .get("params")
        .and_then(|params| params.get("threadId"))
        .and_then(Value::as_str)
        .or_else(|| {
            message
                .get("params")
                .and_then(|params| params.get("thread"))
                .and_then(|thread| thread.get("id"))
                .and_then(Value::as_str)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_root(name: &str) -> PathBuf {
        let root = env::temp_dir().join(format!(
            "orchestrator-generated-images-{name}-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("create generated-image fixture");
        root
    }

    fn completion(thread_id: &str, item_id: &str, saved_path: &Path) -> Value {
        json!({
            "method": "item/completed",
            "params": {
                "threadId": thread_id,
                "turnId": "turn-1",
                "item": {
                    "type": "imageGeneration",
                    "id": item_id,
                    "status": "completed",
                    "savedPath": saved_path.to_string_lossy()
                }
            }
        })
    }

    fn saved_path(message: &Value) -> PathBuf {
        PathBuf::from(
            message["params"]["item"]["savedPath"]
                .as_str()
                .expect("savedPath"),
        )
    }

    #[cfg(unix)]
    #[test]
    fn new_isolated_threads_write_directly_to_shared_storage() {
        let fixture = fixture_root("alias");
        let codex_home = fixture.join("isolated");
        let shared_root = fixture.join("shared");
        let thread_id = "thread-new";
        prepare_generated_image_thread_alias_at(&codex_home, &shared_root, thread_id)
            .expect("prepare alias");

        let isolated_thread = codex_home.join(GENERATED_IMAGES_DIRECTORY).join(thread_id);
        assert!(fs::symlink_metadata(&isolated_thread)
            .expect("inspect alias")
            .file_type()
            .is_symlink());
        fs::write(isolated_thread.join("concept.png"), b"preview").expect("write through alias");
        assert_eq!(
            fs::read(shared_root.join(thread_id).join("concept.png")).expect("read shared image"),
            b"preview"
        );
        fs::remove_dir_all(fixture).expect("remove fixture");
    }

    #[cfg(unix)]
    #[test]
    fn existing_thread_images_move_and_leave_compatible_links() {
        let fixture = fixture_root("existing");
        let codex_home = fixture.join("isolated");
        let shared_root = fixture.join("shared");
        let thread_id = "thread-existing";
        let isolated_thread = codex_home.join(GENERATED_IMAGES_DIRECTORY).join(thread_id);
        fs::create_dir_all(&isolated_thread).expect("create old thread directory");
        let source = isolated_thread.join("concept.png");
        fs::write(&source, b"new preview").expect("write source image");
        let mut message = completion(thread_id, "image-1", &source);

        assert!(normalize_image_generation_notification_at(
            &codex_home,
            &shared_root,
            &mut message,
        )
        .expect("normalize image"));
        let destination = shared_root.join(thread_id).join("concept.png");
        assert_eq!(saved_path(&message), destination);
        assert_eq!(
            fs::read(&destination).expect("read destination"),
            b"new preview"
        );
        assert!(fs::symlink_metadata(&source)
            .expect("inspect compatibility link")
            .file_type()
            .is_symlink());
        assert_eq!(
            fs::read(&source).expect("read compatibility link"),
            b"new preview"
        );
        fs::remove_dir_all(fixture).expect("remove fixture");
    }

    #[cfg(unix)]
    #[test]
    fn collisions_never_overwrite_different_images() {
        let fixture = fixture_root("collision");
        let codex_home = fixture.join("isolated");
        let shared_root = fixture.join("shared");
        let thread_id = "thread-collision";
        let isolated_thread = codex_home.join(GENERATED_IMAGES_DIRECTORY).join(thread_id);
        let shared_thread = shared_root.join(thread_id);
        fs::create_dir_all(&isolated_thread).expect("create old thread directory");
        fs::create_dir_all(&shared_thread).expect("create shared thread directory");
        let source = isolated_thread.join("concept.png");
        let existing = shared_thread.join("concept.png");
        fs::write(&source, b"new image").expect("write source");
        fs::write(&existing, b"existing image").expect("write collision");
        let mut message = completion(thread_id, "item:abc/123", &source);

        normalize_image_generation_notification_at(&codex_home, &shared_root, &mut message)
            .expect("normalize collision");
        assert_eq!(
            fs::read(&existing).expect("read original"),
            b"existing image"
        );
        let destination = saved_path(&message);
        assert_ne!(destination, existing);
        assert!(destination
            .file_name()
            .and_then(OsStr::to_str)
            .is_some_and(|name| name.contains("itemabc123")));
        assert_eq!(fs::read(destination).expect("read new image"), b"new image");
        fs::remove_dir_all(fixture).expect("remove fixture");
    }

    #[cfg(unix)]
    #[test]
    fn identical_collisions_reuse_the_existing_shared_file() {
        let fixture = fixture_root("identical");
        let codex_home = fixture.join("isolated");
        let shared_root = fixture.join("shared");
        let thread_id = "thread-identical";
        let isolated_thread = codex_home.join(GENERATED_IMAGES_DIRECTORY).join(thread_id);
        let shared_thread = shared_root.join(thread_id);
        fs::create_dir_all(&isolated_thread).expect("create old thread directory");
        fs::create_dir_all(&shared_thread).expect("create shared thread directory");
        let source = isolated_thread.join("concept.png");
        let existing = shared_thread.join("concept.png");
        fs::write(&source, b"same image").expect("write source");
        fs::write(&existing, b"same image").expect("write existing");
        let mut message = completion(thread_id, "image-2", &source);

        normalize_image_generation_notification_at(&codex_home, &shared_root, &mut message)
            .expect("normalize identical image");
        assert_eq!(saved_path(&message), existing);
        assert_eq!(
            fs::read_dir(&shared_thread).expect("list shared").count(),
            1
        );
        assert_eq!(
            fs::read(&source).expect("read compatibility link"),
            b"same image"
        );
        fs::remove_dir_all(fixture).expect("remove fixture");
    }

    #[test]
    fn outside_paths_are_rejected_without_modification() {
        let fixture = fixture_root("outside");
        let codex_home = fixture.join("isolated");
        let shared_root = fixture.join("shared");
        let outside = fixture.join("outside.png");
        fs::write(&outside, b"outside").expect("write outside image");
        let mut message = completion("thread-outside", "image-3", &outside);

        let error =
            normalize_image_generation_notification_at(&codex_home, &shared_root, &mut message)
                .expect_err("reject outside image");
        assert!(error.contains("outside the isolated thread directory"));
        assert_eq!(fs::read(&outside).expect("read outside image"), b"outside");
        assert_eq!(saved_path(&message), outside);
        fs::remove_dir_all(fixture).expect("remove fixture");
    }

    #[cfg(unix)]
    #[test]
    fn symlink_sources_outside_shared_storage_are_rejected() {
        let fixture = fixture_root("symlink-source");
        let codex_home = fixture.join("isolated");
        let shared_root = fixture.join("shared");
        let thread_id = "thread-symlink";
        let isolated_thread = codex_home.join(GENERATED_IMAGES_DIRECTORY).join(thread_id);
        fs::create_dir_all(&isolated_thread).expect("create old thread directory");
        let outside = fixture.join("outside.png");
        fs::write(&outside, b"outside").expect("write outside image");
        let source = isolated_thread.join("concept.png");
        std::os::unix::fs::symlink(&outside, &source).expect("create source link");
        let mut message = completion(thread_id, "image-4", &source);

        let error =
            normalize_image_generation_notification_at(&codex_home, &shared_root, &mut message)
                .expect_err("reject source link");
        assert!(error.contains("cannot be a symlink"));
        assert_eq!(fs::read(&outside).expect("read outside image"), b"outside");
        fs::remove_dir_all(fixture).expect("remove fixture");
    }
}
