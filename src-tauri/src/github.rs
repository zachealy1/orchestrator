//! Compatibility commands for existing GitHub callers. Publication is provider-aware.
use tauri::AppHandle;
#[tauri::command]
#[specta::specta]
pub(crate) async fn github_publish_kanban_card(
    app: AppHandle,
    card_id: String,
) -> Result<crate::reviews::ReviewPublicationResult, String> {
    crate::reviews::review_publish_kanban_card(app, card_id).await
}
#[tauri::command]
#[specta::specta]
pub(crate) async fn github_sync_kanban_pull_requests(
    app: AppHandle,
    workspace_id: Option<i64>,
    known_board_revision: Option<i64>,
) -> Result<u64, String> {
    crate::reviews::review_sync_kanban_requests(app, workspace_id, known_board_revision).await
}
#[tauri::command]
#[specta::specta]
pub(crate) async fn github_complete_kanban_without_pull_request(
    app: AppHandle,
    card_id: String,
) -> Result<(), String> {
    crate::reviews::review_complete_kanban_without_request(app, card_id).await
}
