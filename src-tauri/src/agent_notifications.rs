use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};

const ACTIVATION_EVENT: &str = "orchestrator:agent-notification-activated";
const MAX_EVENT_KEY_BYTES: usize = 512;
const MAX_COPY_BYTES: usize = 280;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentNotificationTarget {
    pub event_key: String,
    pub kind: String,
    pub workspace_id: Option<i64>,
    pub chat_id: Option<i64>,
    pub run_id: Option<i64>,
    pub entry_client_id: Option<String>,
    pub request_id: Option<String>,
    pub plan_item_id: Option<String>,
    pub account_id: Option<i64>,
    pub profile_key: Option<String>,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentNotificationRequest {
    pub title: String,
    pub body: String,
    pub group_key: Option<String>,
    pub target: AgentNotificationTarget,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentNotificationSendResult {
    pub delivered: bool,
    pub notification_id: Option<String>,
    pub permission_status: String,
}

#[derive(Default)]
pub struct AgentNotificationState {
    pending_activation: Arc<Mutex<Option<AgentNotificationTarget>>>,
}

impl AgentNotificationState {
    fn pending_activation(&self) -> Arc<Mutex<Option<AgentNotificationTarget>>> {
        Arc::clone(&self.pending_activation)
    }
}

fn validate_request(request: &AgentNotificationRequest) -> Result<(), String> {
    if request.target.event_key.trim().is_empty()
        || request.target.event_key.len() > MAX_EVENT_KEY_BYTES
    {
        return Err("Notification event key is invalid.".to_string());
    }
    if request.title.trim().is_empty()
        || request.body.trim().is_empty()
        || request.title.len() > MAX_COPY_BYTES
        || request.body.len() > MAX_COPY_BYTES
    {
        return Err("Notification copy is invalid.".to_string());
    }
    if !matches!(
        request.target.kind.as_str(),
        "response-completed" | "approval-required" | "plan-ready" | "external-action"
    ) {
        return Err("Notification kind is invalid.".to_string());
    }
    Ok(())
}

fn stable_notification_id(event_key: &str) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in event_key.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("orchestrator-agent-{hash:016x}")
}

fn present_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "macos")]
fn permission_status_label(status: mac_usernotifications::AuthorizationStatus) -> &'static str {
    use mac_usernotifications::AuthorizationStatus;

    match status {
        AuthorizationStatus::Authorized
        | AuthorizationStatus::Provisional
        | AuthorizationStatus::Ephemeral => "allowed",
        AuthorizationStatus::NotDetermined => "not-enabled",
        AuthorizationStatus::Denied => "denied",
        AuthorizationStatus::Unknown => "unavailable",
    }
}

#[cfg(target_os = "macos")]
fn native_notifications_available() -> bool {
    // UNUserNotificationCenter raises an Objective-C exception when the current
    // process is not running from a valid app bundle. Tauri dev binaries run
    // directly from target/{debug,release}, so guard every native-center call.
    mac_usernotifications::check_bundle().is_ok()
}

#[cfg(target_os = "macos")]
async fn permission_status() -> String {
    if !native_notifications_available() {
        return "unavailable".to_string();
    }

    match mac_usernotifications::get_notification_settings().await {
        Ok(settings) => permission_status_label(settings.authorization_status),
        Err(_) => "unavailable",
    }
    .to_string()
}

#[cfg(not(target_os = "macos"))]
async fn permission_status() -> String {
    "unavailable".to_string()
}

#[tauri::command]
pub async fn agent_notification_permission_status() -> String {
    permission_status().await
}

#[tauri::command]
pub async fn agent_notification_request_permission() -> String {
    #[cfg(target_os = "macos")]
    {
        if !native_notifications_available() {
            return "unavailable".to_string();
        }

        return match mac_usernotifications::request_auth().await {
            Ok(true) => "allowed".to_string(),
            Ok(false) => "denied".to_string(),
            Err(_) => "unavailable".to_string(),
        };
    }

    #[cfg(not(target_os = "macos"))]
    {
        "unavailable".to_string()
    }
}

#[tauri::command]
pub async fn agent_notification_send(
    app: AppHandle,
    state: State<'_, AgentNotificationState>,
    request: AgentNotificationRequest,
) -> Result<AgentNotificationSendResult, String> {
    validate_request(&request)?;
    let current_permission = permission_status().await;
    if current_permission != "allowed" {
        return Ok(AgentNotificationSendResult {
            delivered: false,
            notification_id: None,
            permission_status: current_permission,
        });
    }

    #[cfg(target_os = "macos")]
    {
        use std::time::Duration;

        let notification_id = stable_notification_id(&request.target.event_key);
        let mut notification = mac_usernotifications::Notification::new()
            .id(&notification_id)
            .title(&request.title)
            .message(&request.body)
            .default_sound()
            .timeout(Duration::from_secs(7 * 24 * 60 * 60));
        if let Some(group_key) = request.group_key.as_deref().filter(|key| !key.is_empty()) {
            notification = notification.thread_id(group_key);
        }

        let handle = notification
            .send()
            .await
            .map_err(|error| error.to_string())?;
        let target = request.target;
        let pending_activation = state.pending_activation();
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let Ok(response) = handle.response().await else {
                return;
            };
            if !response.is_default_action() {
                return;
            }
            present_main_window(&app_handle);
            if let Ok(mut pending) = pending_activation.lock() {
                *pending = Some(target.clone());
            }
            let _ = app_handle.emit(ACTIVATION_EVENT, target);
        });

        return Ok(AgentNotificationSendResult {
            delivered: true,
            notification_id: Some(notification_id),
            permission_status: current_permission,
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, state, request);
        Ok(AgentNotificationSendResult {
            delivered: false,
            notification_id: None,
            permission_status: "unavailable".to_string(),
        })
    }
}

#[tauri::command]
pub async fn agent_notification_remove(
    state: State<'_, AgentNotificationState>,
    event_key: String,
) -> Result<(), String> {
    if event_key.trim().is_empty() || event_key.len() > MAX_EVENT_KEY_BYTES {
        return Err("Notification event key is invalid.".to_string());
    }
    if let Ok(mut pending) = state.pending_activation.lock() {
        if pending
            .as_ref()
            .is_some_and(|target| target.event_key == event_key)
        {
            *pending = None;
        }
    }

    #[cfg(target_os = "macos")]
    if native_notifications_available() {
        mac_usernotifications::close_delivered(&stable_notification_id(&event_key)).await;
    }

    Ok(())
}

#[tauri::command]
pub fn agent_notification_take_pending_activation(
    state: State<'_, AgentNotificationState>,
) -> Option<AgentNotificationTarget> {
    state
        .pending_activation
        .lock()
        .ok()
        .and_then(|mut pending| pending.take())
}

#[tauri::command]
pub fn agent_notification_open_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.Notifications-Settings.extension")
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Could not open macOS Notification settings: {error}"))
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("Notification settings are unavailable on this platform.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(event_key: &str) -> AgentNotificationRequest {
        AgentNotificationRequest {
            title: "Plan ready".to_string(),
            body: "A chat needs your review.".to_string(),
            group_key: Some("chat:12".to_string()),
            target: AgentNotificationTarget {
                event_key: event_key.to_string(),
                kind: "plan-ready".to_string(),
                workspace_id: Some(3),
                chat_id: Some(12),
                run_id: Some(19),
                entry_client_id: Some("entry-19".to_string()),
                request_id: None,
                plan_item_id: Some("plan-1".to_string()),
                account_id: Some(4),
                profile_key: Some("account:4".to_string()),
                thread_id: Some("thread-1".to_string()),
                turn_id: Some("turn-1".to_string()),
            },
        }
    }

    #[test]
    fn stable_identifiers_are_repeatable_and_event_specific() {
        assert_eq!(
            stable_notification_id("plan:a"),
            stable_notification_id("plan:a")
        );
        assert_ne!(
            stable_notification_id("plan:a"),
            stable_notification_id("plan:b")
        );
    }

    #[test]
    fn request_validation_rejects_missing_keys_and_unknown_kinds() {
        assert!(validate_request(&request("")).is_err());
        let mut invalid = request("event");
        invalid.target.kind = "unknown".to_string();
        assert!(validate_request(&invalid).is_err());
    }

    #[test]
    fn pending_activation_is_consumed_once() {
        let state = AgentNotificationState::default();
        *state.pending_activation.lock().unwrap() = Some(request("event").target);
        assert!(state.pending_activation.lock().unwrap().is_some());
        let taken = state.pending_activation.lock().unwrap().take();
        assert_eq!(taken.unwrap().event_key, "event");
        assert!(state.pending_activation.lock().unwrap().take().is_none());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_permission_statuses_map_to_frontend_states() {
        use mac_usernotifications::AuthorizationStatus;

        assert_eq!(
            permission_status_label(AuthorizationStatus::Authorized),
            "allowed"
        );
        assert_eq!(
            permission_status_label(AuthorizationStatus::Provisional),
            "allowed"
        );
        assert_eq!(
            permission_status_label(AuthorizationStatus::Ephemeral),
            "allowed"
        );
        assert_eq!(
            permission_status_label(AuthorizationStatus::NotDetermined),
            "not-enabled"
        );
        assert_eq!(
            permission_status_label(AuthorizationStatus::Denied),
            "denied"
        );
        assert_eq!(
            permission_status_label(AuthorizationStatus::Unknown),
            "unavailable"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn unbundled_test_process_disables_native_notifications() {
        assert!(!native_notifications_available());
    }
}
