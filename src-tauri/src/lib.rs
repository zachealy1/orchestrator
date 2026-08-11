use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use image::{ImageFormat, ImageReader};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteConnection},
    Connection,
};
use std::{
    collections::{HashMap, HashSet},
    env,
    ffi::OsStr,
    fs,
    io::{BufRead, BufReader, Cursor, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant, SystemTime},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{sync::oneshot, time::timeout};

mod agent_notifications;
mod browser_sessions;
mod codex;
mod database;
mod git;
mod github;
mod kanban_git;
mod kanban_store;
mod migrations;
mod models;
mod paths;
mod preflight;
mod process;
mod web_preview;
mod workspace;

use agent_notifications::AgentNotificationState;
use browser_sessions::{BrowserSessionRegistry, PlaywrightRuntime};
pub(crate) use codex::*;
pub(crate) use database::*;
pub(crate) use git::*;
use migrations::migrations;
pub(crate) use models::*;
pub(crate) use paths::*;
pub(crate) use preflight::*;
pub(crate) use process::*;
pub(crate) use workspace::*;

fn command_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::new()
        // Tauri serializes these SQLite IDs and counters as JSON numbers today.
        .dangerously_cast_bigints_to_number()
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
        .commands(tauri_specta::collect_commands![
            codex_connect,
            codex_default_profile_connect,
            codex_rpc,
            codex_active_login,
            codex_default_profile_rpc,
            codex_projected_subagent_thread_read,
            codex_default_profile_turn_activity,
            codex_default_profile_thread_index,
            codex_default_profile_thread_index_cancel,
            codex_default_profile_thread_transcript_sync,
            codex_default_profile_thread_transcript_cancel,
            codex_resolve_server_request,
            codex_default_profile_resolve_server_request,
            codex_stop,
            codex_default_profile_stop,
            codex_delete_profile,
            list_git_branches,
            checkout_git_branch,
            checkout_git_branch_in_workspace,
            create_git_branch,
            create_git_branch_in_workspace,
            commit_workspace_changes,
            generate_workspace_commit_message,
            generate_chat_title,
            push_workspace_branch,
            discover_workspace_git_repositories,
            list_workspace_git_status,
            read_workspace_git_diff,
            undo_workspace_git_diff,
            list_workspace_directory,
            read_workspace_file_preview,
            read_workspace_file_preview_chunk,
            read_workspace_file_preview_version,
            prepare_image_attachment,
            inspect_dropped_context_paths,
            inspect_prompt_queue_context,
            create_chat_with_queued_prompt,
            append_run_events_transaction,
            soft_delete_workspace_transaction,
            soft_delete_codex_account_transaction,
            activate_external_transcript_snapshot_transaction,
            delete_external_transcript_snapshots_transaction,
            soft_delete_chat_transaction,
            reorder_prompt_queue_items_transaction,
            advance_chat_conversation_revision_transaction,
            recover_abandoned_runs_transaction,
            save_preflight_report_transaction,
            upsert_external_codex_chats_transaction,
            kanban_store::kanban_board_snapshot,
            kanban_store::kanban_card_for_chat,
            kanban_store::kanban_create_card,
            kanban_store::kanban_update_card,
            kanban_store::kanban_move_card,
            kanban_store::kanban_claim_attempt,
            kanban_store::kanban_update_attempt,
            kanban_store::kanban_approve_card,
            kanban_store::kanban_reopen_card,
            kanban_store::kanban_stop_inactive_card,
            kanban_store::kanban_archive_card,
            kanban_store::kanban_delete_card,
            kanban_store::kanban_update_preferences,
            kanban_store::kanban_recover_interrupted,
            kanban_store::kanban_save_git_bindings,
            kanban_store::kanban_list_git_bindings,
            kanban_store::kanban_local_review,
            kanban_store::kanban_use_local_review,
            kanban_store::kanban_approve_local_review,
            kanban_store::kanban_complete_local_review_without_changes,
            kanban_store::kanban_set_inherited_context,
            kanban_store::kanban_get_inherited_context,
            github::github_connection_status,
            github::github_configure_client_id,
            github::github_begin_device_authorization,
            github::github_poll_device_authorization,
            github::github_disconnect,
            github::github_publish_kanban_card,
            github::github_sync_kanban_pull_requests,
            github::github_complete_kanban_without_pull_request,
            kanban_git::kanban_git_provision,
            kanban_git::kanban_git_reconcile,
            kanban_git::kanban_git_status,
            kanban_git::kanban_git_diff,
            kanban_git::kanban_git_file_diff,
            kanban_git::kanban_git_commit,
            kanban_git::kanban_git_push,
            kanban_git::kanban_git_merge,
            kanban_git::kanban_git_cleanup,
            run_preflight,
            web_preview::probe_local_web_preview,
            browser_sessions::browser_runtime_status,
            browser_sessions::browser_session_prepare,
            browser_sessions::browser_session_status,
            browser_sessions::browser_session_focus,
            browser_sessions::browser_session_update_target,
            browser_sessions::browser_session_stop,
            agent_notifications::agent_notification_permission_status,
            agent_notifications::agent_notification_request_permission,
            agent_notifications::agent_notification_send,
            agent_notifications::agent_notification_remove,
            agent_notifications::agent_notification_take_pending_activation,
            agent_notifications::agent_notification_open_settings,
        ])
}

pub fn export_typescript_bindings(path: impl AsRef<Path>) -> Result<(), String> {
    command_builder()
        .export(specta_typescript::Typescript::default(), path)
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let command_builder = command_builder();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            present_main_window(app);
        }))
        .manage(CodexState::default())
        .manage(AgentNotificationState::default())
        .manage(BrowserSessionRegistry::default())
        .manage(github::GithubState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, migrations())
                .build(),
        )
        .setup(|app| {
            let database = tauri::async_runtime::block_on(DatabaseState::connect(app.handle()))
                .map_err(std::io::Error::other)?;
            app.manage(database);
            Ok(())
        })
        .invoke_handler(command_builder.invoke_handler())
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Ready = event {
            present_main_window(app_handle);
        }
    });
}

fn present_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests;
