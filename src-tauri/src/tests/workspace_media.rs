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
fn workspace_file_preview_truncates_large_text_files() {
    let workspace = test_directory("workspace-preview-truncates");
    let file = workspace.join("large.txt");
    fs::write(&file, "a".repeat(MAX_FILE_PREVIEW_BYTES + 16)).unwrap();

    let preview = read_workspace_file_preview_blocking(
        workspace.to_string_lossy().to_string(),
        file.to_string_lossy().to_string(),
    )
    .unwrap();

    assert!(preview.truncated);
    assert!(!preview.is_binary);
    assert_eq!(preview.content.len(), MAX_FILE_PREVIEW_BYTES);
    assert_eq!(preview.relative_path, "large.txt");
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
    assert_eq!(preview.content, "");
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
