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
    read_workspace_file_preview_chunk_blocking(workspace_path, file_path, 0, None)
}

fn workspace_file_preview_version(metadata: &fs::Metadata) -> Result<String, String> {
    let modified = metadata
        .modified()
        .map_err(|error| format!("Unable to inspect file modification time: {error}"))?;
    let modified_component = match modified.duration_since(SystemTime::UNIX_EPOCH) {
        Ok(duration) => format!("{}-{}", duration.as_secs(), duration.subsec_nanos()),
        Err(error) => {
            let duration = error.duration();
            format!("pre-{}-{}", duration.as_secs(), duration.subsec_nanos())
        }
    };

    Ok(format!("{}:{modified_component}", metadata.len()))
}

fn utf8_sequence_width(byte: u8) -> Option<usize> {
    match byte {
        0x00..=0x7f => Some(1),
        0xc2..=0xdf => Some(2),
        0xe0..=0xef => Some(3),
        0xf0..=0xf4 => Some(4),
        _ => None,
    }
}

fn validate_workspace_file_preview_offset(
    source: &mut fs::File,
    offset: u64,
    total_bytes: u64,
) -> Result<(), String> {
    if offset == 0 || offset == total_bytes {
        return Ok(());
    }

    source
        .seek(SeekFrom::Start(offset))
        .map_err(|error| format!("Unable to seek in preview file: {error}"))?;
    let mut current = [0_u8; 1];
    source
        .read_exact(&mut current)
        .map_err(|error| format!("Unable to validate preview offset: {error}"))?;
    if current[0] & 0xc0 != 0x80 {
        return Ok(());
    }

    let preceding_length = offset.min(3) as usize;
    let preceding_start = offset - preceding_length as u64;
    source
        .seek(SeekFrom::Start(preceding_start))
        .map_err(|error| format!("Unable to seek in preview file: {error}"))?;
    let mut preceding = vec![0_u8; preceding_length];
    source
        .read_exact(&mut preceding)
        .map_err(|error| format!("Unable to validate preview offset: {error}"))?;

    for distance in 1..=preceding_length {
        let lead_index = preceding_length - distance;
        let Some(width) = utf8_sequence_width(preceding[lead_index]) else {
            continue;
        };
        if width > distance
            && preceding[lead_index + 1..]
                .iter()
                .all(|byte| byte & 0xc0 == 0x80)
        {
            return Err("Preview offset is not a UTF-8 character boundary".to_string());
        }
    }

    Ok(())
}

fn workspace_file_preview_limit(source: &mut fs::File, total_bytes: u64) -> Result<u64, String> {
    let mut limit = total_bytes.min(WORKSPACE_PREVIEW_MAX_BYTES as u64);
    if limit == total_bytes {
        return Ok(limit);
    }

    source
        .seek(SeekFrom::Start(limit))
        .map_err(|error| format!("Unable to seek in preview file: {error}"))?;
    let mut current = [0_u8; 1];
    source
        .read_exact(&mut current)
        .map_err(|error| format!("Unable to inspect preview boundary: {error}"))?;
    if current[0] & 0xc0 != 0x80 {
        return Ok(limit);
    }

    for distance in 1..=3_u64 {
        let candidate = limit.saturating_sub(distance);
        source
            .seek(SeekFrom::Start(candidate))
            .map_err(|error| format!("Unable to seek in preview file: {error}"))?;
        let mut byte = [0_u8; 1];
        source
            .read_exact(&mut byte)
            .map_err(|error| format!("Unable to inspect preview boundary: {error}"))?;
        if utf8_sequence_width(byte[0]).is_some_and(|width| candidate + width as u64 > limit) {
            limit = candidate;
            break;
        }
    }

    Ok(limit)
}

fn decode_workspace_file_preview_chunk(
    bytes: &[u8],
    reaches_end_of_file: bool,
) -> Result<(String, usize, bool), String> {
    if bytes.contains(&0) {
        return Ok((String::new(), bytes.len(), true));
    }

    match std::str::from_utf8(bytes) {
        Ok(content) => Ok((content.to_string(), bytes.len(), false)),
        Err(error)
            if error.error_len().is_none() && !reaches_end_of_file && error.valid_up_to() > 0 =>
        {
            let valid_length = error.valid_up_to();
            Ok((
                std::str::from_utf8(&bytes[..valid_length])
                    .map_err(|_| "Unable to decode a valid preview chunk prefix".to_string())?
                    .to_string(),
                valid_length,
                false,
            ))
        }
        Err(_) => Ok((String::new(), bytes.len(), true)),
    }
}

pub(crate) fn read_workspace_file_preview_chunk_blocking(
    workspace_path: String,
    file_path: String,
    offset: u64,
    expected_version: Option<String>,
) -> Result<WorkspaceFilePreview, String> {
    let (workspace, file_path) = canonical_workspace_child(&workspace_path, &file_path)?;
    if !file_path.is_file() {
        return Err("Selected path is not a file".to_string());
    }

    let mut source = fs::File::open(&file_path)
        .map_err(|error| format!("Unable to read {}: {error}", file_path.display()))?;
    let metadata = source
        .metadata()
        .map_err(|error| format!("Unable to inspect {}: {error}", file_path.display()))?;
    let total_bytes = metadata.len();
    let preview_limit = workspace_file_preview_limit(&mut source, total_bytes)?;
    let version = workspace_file_preview_version(&metadata)?;

    if expected_version
        .as_deref()
        .is_some_and(|expected| expected != version)
    {
        return Err("File changed while loading; restart the preview".to_string());
    }
    if offset > preview_limit {
        return Err(format!(
            "Preview offset {offset} exceeds preview limit {preview_limit}"
        ));
    }

    validate_workspace_file_preview_offset(&mut source, offset, total_bytes)?;
    source
        .seek(SeekFrom::Start(offset))
        .map_err(|error| format!("Unable to seek in {}: {error}", file_path.display()))?;
    let maximum_length = (preview_limit - offset).min(WORKSPACE_FILE_PREVIEW_CHUNK_BYTES as u64);
    let mut bytes = Vec::with_capacity(maximum_length as usize);
    source
        .take(maximum_length)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Unable to read {}: {error}", file_path.display()))?;

    let reaches_end_of_file = offset + bytes.len() as u64 == total_bytes;
    let (content, consumed_bytes, is_binary) =
        decode_workspace_file_preview_chunk(&bytes, reaches_end_of_file)?;

    let current_metadata = fs::metadata(&file_path)
        .map_err(|_| "File changed while loading; restart the preview".to_string())?;
    if workspace_file_preview_version(&current_metadata)? != version {
        return Err("File changed while loading; restart the preview".to_string());
    }

    let next_offset = if is_binary {
        total_bytes
    } else {
        offset + consumed_bytes as u64
    };
    let complete = is_binary || next_offset == preview_limit;

    Ok(WorkspaceFilePreview {
        relative_path: relative_workspace_path(&workspace, &file_path)?,
        path: file_path.to_string_lossy().to_string(),
        content,
        truncated: !is_binary && preview_limit < total_bytes,
        is_binary,
        complete,
        next_offset,
        total_bytes,
        version,
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

#[tauri::command]
#[specta::specta]
pub(crate) async fn read_workspace_file_preview_chunk(
    workspace_path: String,
    file_path: String,
    offset: u64,
    version: String,
) -> Result<WorkspaceFilePreview, String> {
    run_blocking_command("read workspace file preview chunk", move || {
        read_workspace_file_preview_chunk_blocking(workspace_path, file_path, offset, Some(version))
    })
    .await
}

pub(crate) fn read_workspace_file_preview_version_blocking(
    workspace_path: String,
    file_path: String,
) -> Result<String, String> {
    let (_, file_path) = canonical_workspace_child(&workspace_path, &file_path)?;
    if !file_path.is_file() {
        return Err("Selected path is not a file".to_string());
    }
    let metadata = fs::metadata(&file_path)
        .map_err(|error| format!("Unable to inspect {}: {error}", file_path.display()))?;
    workspace_file_preview_version(&metadata)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn read_workspace_file_preview_version(
    workspace_path: String,
    file_path: String,
) -> Result<String, String> {
    run_blocking_command("read workspace file preview version", move || {
        read_workspace_file_preview_version_blocking(workspace_path, file_path)
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
