use super::*;

#[test]
fn pending_key_handles_string_and_number_ids() {
    assert_eq!(pending_key(&json!(7)), "7");
    assert_eq!(pending_key(&json!("abc")), "abc");
}

#[test]
fn estimates_prompt_tokens_without_returning_zero_for_text() {
    assert_eq!(estimate_tokens("fix tests"), 2);
    assert!(estimate_tokens("a".repeat(400).as_str()) >= 100);
}

#[test]
fn routes_large_or_risky_prompts_to_plan_first() {
    assert_eq!(
        route_recommendation("Implement a database migration", 20),
        "plan-first"
    );
    assert_eq!(route_recommendation("Rename this label", 4), "direct-run");
}

#[test]
fn workspace_directory_listing_rejects_outside_paths() {
    let workspace = test_directory("workspace-list-rejects-workspace");
    let outside = test_directory("workspace-list-rejects-outside");

    let result = list_workspace_directory_blocking(
        workspace.to_string_lossy().to_string(),
        outside.to_string_lossy().to_string(),
    );

    assert!(result.unwrap_err().contains("outside the workspace"));
    remove_test_directory(workspace);
    remove_test_directory(outside);
}

#[test]
fn workspace_directory_listing_sorts_and_omits_heavy_folders() {
    let workspace = test_directory("workspace-list-sorts");
    fs::create_dir_all(workspace.join("src")).unwrap();
    fs::create_dir_all(workspace.join(".git")).unwrap();
    fs::create_dir_all(workspace.join("node_modules")).unwrap();
    fs::write(workspace.join("Cargo.toml"), b"[package]").unwrap();
    fs::write(workspace.join("README.md"), b"readme").unwrap();

    let entries = list_workspace_directory_blocking(
        workspace.to_string_lossy().to_string(),
        workspace.to_string_lossy().to_string(),
    )
    .unwrap();
    let names: Vec<_> = entries.iter().map(|entry| entry.name.as_str()).collect();

    assert_eq!(names, vec!["src", "Cargo.toml", "README.md"]);
    assert_eq!(entries[0].kind, "directory");
    assert_eq!(entries[1].kind, "file");
    assert_eq!(entries[0].relative_path, "src");
    remove_test_directory(workspace);
}

#[test]
fn workspace_file_preview_rejects_outside_and_missing_files() {
    let workspace = test_directory("workspace-preview-rejects-workspace");
    let outside = test_directory("workspace-preview-rejects-outside");
    let outside_file = outside.join("secret.txt");
    fs::write(&outside_file, b"secret").unwrap();

    let outside_result = read_workspace_file_preview_blocking(
        workspace.to_string_lossy().to_string(),
        outside_file.to_string_lossy().to_string(),
    );
    let missing_result = read_workspace_file_preview_blocking(
        workspace.to_string_lossy().to_string(),
        workspace.join("missing.txt").to_string_lossy().to_string(),
    );

    assert!(outside_result
        .unwrap_err()
        .contains("outside the workspace"));
    assert!(missing_result.unwrap_err().contains("Unable to open path"));
    remove_test_directory(workspace);
    remove_test_directory(outside);
}

#[test]
fn workspace_file_preview_streams_large_text_files_completely() {
    const TAIL_SENTINEL: &str = "UNIQUE_FILE_PREVIEW_TAIL_SENTINEL";

    let workspace = test_directory("workspace-preview-complete");
    let file = workspace.join("large.txt");
    let payload = "x".repeat(40);
    let mut expected = String::new();
    for line_number in 1..=12_345 {
        expected.push_str(&format!("{line_number:05}: {payload}\n"));
    }
    expected.push_str(TAIL_SENTINEL);
    assert!(expected.len() > WORKSPACE_FILE_PREVIEW_CHUNK_BYTES);
    assert!(expected.lines().count() > 10_000);
    fs::write(&file, &expected).unwrap();

    let mut preview = read_workspace_file_preview_blocking(
        workspace.to_string_lossy().to_string(),
        file.to_string_lossy().to_string(),
    )
    .unwrap();

    assert!(!preview.truncated);
    assert!(!preview.is_binary);
    assert!(!preview.complete);
    assert!(preview.content.len() <= WORKSPACE_FILE_PREVIEW_CHUNK_BYTES);
    assert_eq!(preview.total_bytes, expected.len() as u64);
    assert_eq!(preview.next_offset, preview.content.len() as u64);
    assert_eq!(preview.relative_path, "large.txt");
    assert_eq!(
        read_workspace_file_preview_version_blocking(
            workspace.to_string_lossy().to_string(),
            file.to_string_lossy().to_string(),
        )
        .unwrap(),
        preview.version
    );

    let serialized = serde_json::to_value(&preview).unwrap();
    assert!(serialized.get("complete").is_some());
    assert!(serialized.get("nextOffset").is_some());
    assert!(serialized.get("totalBytes").is_some());
    assert!(serialized.get("version").is_some());

    let version = preview.version.clone();
    let mut assembled = String::new();
    loop {
        assembled.push_str(&preview.content);
        if preview.complete {
            break;
        }
        let previous_offset = preview.next_offset;
        preview = read_workspace_file_preview_chunk_blocking(
            workspace.to_string_lossy().to_string(),
            file.to_string_lossy().to_string(),
            previous_offset,
            Some(version.clone()),
        )
        .unwrap();
        assert_eq!(preview.version, version);
        assert!(!preview.truncated);
        assert!(preview.next_offset > previous_offset);
    }

    let canonical_workspace = fs::canonicalize(&workspace).unwrap();
    let shared_preview = read_workspace_file_preview_text(&canonical_workspace, &file).unwrap();

    assert!(preview.complete);
    assert_eq!(preview.next_offset, expected.len() as u64);
    assert_eq!(assembled, expected);
    assert!(assembled.ends_with(TAIL_SENTINEL));
    assert!(!shared_preview.truncated);
    assert!(!shared_preview.is_binary);
    assert_eq!(shared_preview.content, expected);
    remove_test_directory(workspace);
}

#[test]
fn workspace_file_preview_marks_binary_content_without_text() {
    let workspace = test_directory("workspace-preview-binary");
    let file = workspace.join("data.bin");
    fs::write(&file, b"hello\0world").unwrap();

    let preview = read_workspace_file_preview_blocking(
        workspace.to_string_lossy().to_string(),
        file.to_string_lossy().to_string(),
    )
    .unwrap();

    assert!(preview.is_binary);
    assert!(preview.complete);
    assert!(!preview.truncated);
    assert_eq!(preview.content, "");
    assert_eq!(preview.next_offset, preview.total_bytes);
    assert_eq!(preview.total_bytes, 11);
    remove_test_directory(workspace);
}

#[test]
fn workspace_file_preview_preserves_utf8_across_chunk_boundaries() {
    let workspace = test_directory("workspace-preview-utf8-boundary");
    let file = workspace.join("unicode.txt");
    let expected = format!(
        "{}é-tail",
        "x".repeat(WORKSPACE_FILE_PREVIEW_CHUNK_BYTES - 1)
    );
    fs::write(&file, &expected).unwrap();

    let first = read_workspace_file_preview_blocking(
        workspace.to_string_lossy().to_string(),
        file.to_string_lossy().to_string(),
    )
    .unwrap();
    assert!(!first.complete);
    assert!(!first.is_binary);
    assert_eq!(
        first.next_offset,
        (WORKSPACE_FILE_PREVIEW_CHUNK_BYTES - 1) as u64
    );

    let invalid_offset = read_workspace_file_preview_chunk_blocking(
        workspace.to_string_lossy().to_string(),
        file.to_string_lossy().to_string(),
        WORKSPACE_FILE_PREVIEW_CHUNK_BYTES as u64,
        Some(first.version.clone()),
    );
    assert!(invalid_offset
        .unwrap_err()
        .contains("UTF-8 character boundary"));

    let second = read_workspace_file_preview_chunk_blocking(
        workspace.to_string_lossy().to_string(),
        file.to_string_lossy().to_string(),
        first.next_offset,
        Some(first.version.clone()),
    )
    .unwrap();
    assert!(second.complete);
    assert!(!second.is_binary);
    assert_eq!(format!("{}{}", first.content, second.content), expected);
    remove_test_directory(workspace);
}

#[test]
fn workspace_file_preview_rejects_stale_versions() {
    let workspace = test_directory("workspace-preview-stale-version");
    let file = workspace.join("changing.txt");
    fs::write(&file, "a".repeat(WORKSPACE_FILE_PREVIEW_CHUNK_BYTES + 8)).unwrap();

    let first = read_workspace_file_preview_blocking(
        workspace.to_string_lossy().to_string(),
        file.to_string_lossy().to_string(),
    )
    .unwrap();
    assert!(!first.complete);

    fs::write(&file, "b".repeat(WORKSPACE_FILE_PREVIEW_CHUNK_BYTES + 9)).unwrap();
    let current_version = read_workspace_file_preview_version_blocking(
        workspace.to_string_lossy().to_string(),
        file.to_string_lossy().to_string(),
    )
    .unwrap();
    assert_ne!(current_version, first.version);

    let stale = read_workspace_file_preview_chunk_blocking(
        workspace.to_string_lossy().to_string(),
        file.to_string_lossy().to_string(),
        first.next_offset,
        Some(first.version),
    );
    assert!(stale.unwrap_err().contains("File changed while loading"));
    remove_test_directory(workspace);
}

#[test]
fn workspace_file_preview_completes_empty_and_small_files_immediately() {
    let workspace = test_directory("workspace-preview-small");
    let empty_file = workspace.join("empty.txt");
    let small_file = workspace.join("small.txt");
    fs::write(&empty_file, b"").unwrap();
    fs::write(&small_file, b"one\ntwo\n").unwrap();

    for (file, expected) in [(&empty_file, ""), (&small_file, "one\ntwo\n")] {
        let preview = read_workspace_file_preview_blocking(
            workspace.to_string_lossy().to_string(),
            file.to_string_lossy().to_string(),
        )
        .unwrap();
        assert!(preview.complete);
        assert!(!preview.truncated);
        assert!(!preview.is_binary);
        assert_eq!(preview.content, expected);
        assert_eq!(preview.next_offset, preview.total_bytes);
    }
    remove_test_directory(workspace);
}

#[test]
fn image_attachment_preparation_validates_content_and_bounds_thumbnail() {
    let directory = test_directory("image-attachment-preview");
    let file = directory.join("reference.data");
    image::RgbaImage::from_pixel(4, 3, image::Rgba([20, 40, 60, 255]))
        .save_with_format(&file, ImageFormat::Png)
        .unwrap();

    let preview = prepare_image_attachment_blocking(file.to_string_lossy().to_string())
        .unwrap()
        .expect("image preview");

    assert_eq!(preview.mime_type, "image/png");
    assert_eq!((preview.width, preview.height), (4, 3));
    assert!(preview
        .thumbnail_data_url
        .starts_with("data:image/png;base64,"));
    assert_eq!(
        preview.path,
        fs::canonicalize(&file).unwrap().to_string_lossy()
    );
    remove_test_directory(directory);
}

#[test]
fn image_attachment_preparation_ignores_text_and_rejects_broken_images() {
    let directory = test_directory("image-attachment-validation");
    let text_file = directory.join("notes.txt");
    let broken_image = directory.join("broken.png");
    fs::write(&text_file, b"plain text").unwrap();
    fs::write(&broken_image, b"not really a png").unwrap();

    assert!(
        prepare_image_attachment_blocking(text_file.to_string_lossy().to_string(),)
            .unwrap()
            .is_none()
    );
    assert!(
        prepare_image_attachment_blocking(broken_image.to_string_lossy().to_string(),)
            .unwrap_err()
            .contains("could not be decoded")
    );
    remove_test_directory(directory);
}

#[test]
fn dropped_context_path_inspection_accepts_files_and_rejects_other_items() {
    let directory = test_directory("dropped-context-paths");
    let file = directory.join("notes.txt");
    let child_directory = directory.join("folder");
    let missing = directory.join("missing.txt");
    fs::write(&file, b"notes").unwrap();
    fs::create_dir_all(&child_directory).unwrap();

    let inspection = inspect_dropped_context_paths_blocking(vec![
        file.to_string_lossy().to_string(),
        child_directory.to_string_lossy().to_string(),
        missing.to_string_lossy().to_string(),
    ]);

    assert_eq!(inspection.files.len(), 1);
    assert_eq!(inspection.files[0].name, "notes.txt");
    assert_eq!(
        inspection.files[0].canonical_path,
        fs::canonicalize(&file).unwrap().to_string_lossy()
    );
    assert_eq!(inspection.rejected.len(), 2);
    assert_eq!(inspection.rejected[0].reason, "directory");
    assert_eq!(inspection.rejected[1].reason, "unavailable");
    remove_test_directory(directory);
}

#[cfg(unix)]
#[test]
fn dropped_context_path_inspection_follows_symlinks_and_deduplicates_targets() {
    use std::os::unix::fs::symlink;

    let directory = test_directory("dropped-context-symlink");
    let file = directory.join("notes.txt");
    let link = directory.join("notes-link.txt");
    fs::write(&file, b"notes").unwrap();
    symlink(&file, &link).unwrap();

    let inspection = inspect_dropped_context_paths_blocking(vec![
        link.to_string_lossy().to_string(),
        file.to_string_lossy().to_string(),
    ]);

    assert_eq!(inspection.files.len(), 1);
    assert_eq!(inspection.files[0].path, link.to_string_lossy().to_string());
    assert_eq!(
        inspection.files[0].canonical_path,
        fs::canonicalize(&file).unwrap().to_string_lossy()
    );
    assert!(inspection.rejected.is_empty());
    remove_test_directory(directory);
}

#[test]
fn image_attachment_preparation_rejects_unsupported_and_oversized_images() {
    let directory = test_directory("image-attachment-limits");
    let unsupported = directory.join("reference.bmp");
    fs::write(&unsupported, b"BMunsupported").unwrap();
    let oversized = directory.join("oversized.png");
    fs::write(&oversized, [137_u8, 80, 78, 71, 13, 10, 26, 10]).unwrap();
    fs::OpenOptions::new()
        .write(true)
        .open(&oversized)
        .unwrap()
        .set_len(MAX_IMAGE_ATTACHMENT_BYTES + 1)
        .unwrap();

    assert!(
        prepare_image_attachment_blocking(unsupported.to_string_lossy().to_string(),)
            .unwrap_err()
            .contains("format is unsupported")
    );
    assert!(
        prepare_image_attachment_blocking(oversized.to_string_lossy().to_string(),)
            .unwrap_err()
            .contains("25 MB limit")
    );
    remove_test_directory(directory);
}
