use super::*;

pub(crate) fn list_workspace_directory_blocking(
    workspace_path: String,
    directory_path: String,
) -> Result<Vec<WorkspaceTreeEntry>, String> {
    let (workspace, directory) = canonical_workspace_child(&workspace_path, &directory_path)?;
    if !directory.is_dir() {
        return Err("Selected path is not a directory".to_string());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(&directory)
        .map_err(|error| format!("Unable to read directory {}: {error}", directory.display()))?
    {
        let entry = entry.map_err(|error| format!("Unable to read directory entry: {error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Unable to inspect directory entry: {error}"))?;
        if !file_type.is_dir() && !file_type.is_file() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        if file_type.is_dir()
            && IGNORED_EXPLORER_DIRECTORIES
                .iter()
                .any(|ignored| ignored == &name.as_str())
        {
            continue;
        }

        let entry_path = entry.path();
        entries.push(WorkspaceTreeEntry {
            relative_path: relative_workspace_path(&workspace, &entry_path)?,
            path: entry_path.to_string_lossy().to_string(),
            name,
            kind: if file_type.is_dir() {
                "directory".to_string()
            } else {
                "file".to_string()
            },
        });
    }

    entries.sort_by(|left, right| {
        let left_is_file = left.kind == "file";
        let right_is_file = right.kind == "file";
        left_is_file
            .cmp(&right_is_file)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn list_workspace_directory(
    workspace_path: String,
    directory_path: String,
) -> Result<Vec<WorkspaceTreeEntry>, String> {
    run_blocking_command("list workspace directory", move || {
        list_workspace_directory_blocking(workspace_path, directory_path)
    })
    .await
}

pub(crate) fn read_workspace_file_preview_blocking(
    workspace_path: String,
    file_path: String,
) -> Result<WorkspaceFilePreview, String> {
    let (workspace, file_path) = canonical_workspace_child(&workspace_path, &file_path)?;
    if !file_path.is_file() {
        return Err("Selected path is not a file".to_string());
    }

    let mut file = fs::File::open(&file_path)
        .map_err(|error| format!("Unable to open {}: {error}", file_path.display()))?;
    let mut bytes = Vec::with_capacity(MAX_FILE_PREVIEW_BYTES + 1);
    Read::by_ref(&mut file)
        .take((MAX_FILE_PREVIEW_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Unable to read {}: {error}", file_path.display()))?;

    let truncated = bytes.len() > MAX_FILE_PREVIEW_BYTES;
    let preview_len = bytes.len().min(MAX_FILE_PREVIEW_BYTES);
    let preview_bytes = &bytes[..preview_len];
    let (content, is_binary) = decode_preview_text(preview_bytes);

    Ok(WorkspaceFilePreview {
        relative_path: relative_workspace_path(&workspace, &file_path)?,
        path: file_path.to_string_lossy().to_string(),
        content,
        truncated,
        is_binary,
    })
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn read_workspace_file_preview(
    workspace_path: String,
    file_path: String,
) -> Result<WorkspaceFilePreview, String> {
    run_blocking_command("read workspace file preview", move || {
        read_workspace_file_preview_blocking(workspace_path, file_path)
    })
    .await
}

pub(crate) fn prepare_image_attachment_blocking(
    path: String,
) -> Result<Option<ImageAttachmentPreview>, String> {
    let path = fs::canonicalize(&path)
        .map_err(|error| format!("Unable to resolve image attachment: {error}"))?;
    if !path.is_file() {
        return Err("Selected image attachment is not a file".to_string());
    }

    let metadata = fs::metadata(&path)
        .map_err(|error| format!("Unable to inspect {}: {error}", path.display()))?;
    let mut source = fs::File::open(&path)
        .map_err(|error| format!("Unable to open {}: {error}", path.display()))?;
    let mut header = [0_u8; 32];
    let header_length = source
        .read(&mut header)
        .map_err(|error| format!("Unable to inspect {}: {error}", path.display()))?;
    let format = match image::guess_format(&header[..header_length]) {
        Ok(format) => format,
        Err(_) if is_image_extension(&path) => {
            return Err("Selected image could not be decoded".to_string())
        }
        Err(_) => return Ok(None),
    };
    if metadata.len() > MAX_IMAGE_ATTACHMENT_BYTES {
        return Err("Image attachment exceeds the 25 MB limit".to_string());
    }

    let bytes =
        fs::read(&path).map_err(|error| format!("Unable to read {}: {error}", path.display()))?;
    let mime_type = match format {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        ImageFormat::WebP => "image/webp",
        ImageFormat::Gif => "image/gif",
        _ => {
            return Err(
                "Image attachment format is unsupported; use PNG, JPEG, WebP, or GIF".to_string(),
            )
        }
    };

    let reader = ImageReader::new(Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|error| format!("Image attachment could not be inspected: {error}"))?;
    let (width, height) = reader
        .into_dimensions()
        .map_err(|error| format!("Image attachment dimensions could not be read: {error}"))?;
    if width == 0
        || height == 0
        || u64::from(width).saturating_mul(u64::from(height)) > MAX_IMAGE_ATTACHMENT_PIXELS
    {
        return Err("Image attachment dimensions exceed the supported limit".to_string());
    }

    let image = image::load_from_memory_with_format(&bytes, format)
        .map_err(|error| format!("Image attachment could not be decoded: {error}"))?;
    let thumbnail = image.thumbnail(
        IMAGE_ATTACHMENT_THUMBNAIL_EDGE,
        IMAGE_ATTACHMENT_THUMBNAIL_EDGE,
    );
    let mut thumbnail_bytes = Vec::new();
    thumbnail
        .write_to(&mut Cursor::new(&mut thumbnail_bytes), ImageFormat::Png)
        .map_err(|error| format!("Image attachment thumbnail could not be created: {error}"))?;
    if thumbnail_bytes.len() > MAX_IMAGE_ATTACHMENT_THUMBNAIL_BYTES {
        return Err("Image attachment thumbnail exceeds the supported limit".to_string());
    }

    Ok(Some(ImageAttachmentPreview {
        path: path.to_string_lossy().to_string(),
        mime_type: mime_type.to_string(),
        width,
        height,
        thumbnail_data_url: format!(
            "data:image/png;base64,{}",
            BASE64_STANDARD.encode(thumbnail_bytes)
        ),
    }))
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn prepare_image_attachment(
    path: String,
) -> Result<Option<ImageAttachmentPreview>, String> {
    run_blocking_command("prepare image attachment", move || {
        prepare_image_attachment_blocking(path)
    })
    .await
}

pub(crate) fn inspect_dropped_context_paths_blocking(
    paths: Vec<String>,
) -> DroppedContextPathInspection {
    let mut files = Vec::new();
    let mut rejected = Vec::new();
    let mut canonical_paths = HashSet::new();

    for original_path in paths {
        let source_path = PathBuf::from(&original_path);
        let canonical_path = match fs::canonicalize(&source_path) {
            Ok(path) => path,
            Err(_) => {
                rejected.push(RejectedDroppedContextPath {
                    path: original_path,
                    reason: "unavailable".to_string(),
                });
                continue;
            }
        };
        let metadata = match fs::metadata(&canonical_path) {
            Ok(metadata) => metadata,
            Err(_) => {
                rejected.push(RejectedDroppedContextPath {
                    path: original_path,
                    reason: "unavailable".to_string(),
                });
                continue;
            }
        };
        if metadata.is_dir() {
            rejected.push(RejectedDroppedContextPath {
                path: original_path,
                reason: "directory".to_string(),
            });
            continue;
        }
        if !metadata.is_file() {
            rejected.push(RejectedDroppedContextPath {
                path: original_path,
                reason: "not-file".to_string(),
            });
            continue;
        }
        if fs::File::open(&canonical_path).is_err() {
            rejected.push(RejectedDroppedContextPath {
                path: original_path,
                reason: "unreadable".to_string(),
            });
            continue;
        }
        if !canonical_paths.insert(canonical_path.clone()) {
            continue;
        }

        let name = source_path
            .file_name()
            .or_else(|| canonical_path.file_name())
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| original_path.clone());
        files.push(DroppedContextPath {
            path: original_path,
            canonical_path: canonical_path.to_string_lossy().to_string(),
            name,
        });
    }

    DroppedContextPathInspection { files, rejected }
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn inspect_dropped_context_paths(
    paths: Vec<String>,
) -> Result<DroppedContextPathInspection, String> {
    run_blocking_command("inspect dropped context paths", move || {
        Ok(inspect_dropped_context_paths_blocking(paths))
    })
    .await
}
