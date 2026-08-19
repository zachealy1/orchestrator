use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    env, fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::default_browser::{
    self, DefaultBrowserBridgeState, DefaultBrowserCapabilityStatus, DefaultBrowserTab,
};

const PLAYWRIGHT_SERVER_NAME: &str = "playwright";
const BROWSER_SESSION_EVENT: &str = "orchestrator:browser-session";
const CONTROL_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Clone)]
pub(crate) struct PlaywrightRuntime {
    pub node_executable: PathBuf,
    pub wrapper_script: PathBuf,
    pub default_browser_wrapper_script: PathBuf,
    pub chromium_executable: PathBuf,
}

#[derive(Default)]
pub(crate) struct BrowserSessionRegistry {
    sessions: Mutex<HashMap<String, BrowserSessionRecord>>,
}

impl Drop for BrowserSessionRegistry {
    fn drop(&mut self) {
        if let Ok(sessions) = self.sessions.get_mut() {
            for session in sessions.values() {
                let _ = send_control_command(session, "stop");
                terminate_session_processes(session);
                let _ = fs::remove_dir_all(&session.session_root);
                let _ = fs::remove_file(&session.control_socket);
            }
        }
    }
}

#[derive(Clone)]
struct BrowserSessionRecord {
    token: String,
    target: BrowserSessionTarget,
    session_root: PathBuf,
    state_file: PathBuf,
    control_socket: PathBuf,
    backend: String,
    fallback_reason: Option<String>,
    group_key: Option<String>,
    group_title: Option<String>,
    status: String,
    controlled_tab_id: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BrowserSessionTarget {
    pub profile_key: String,
    pub workspace_id: i64,
    pub chat_id: Option<i64>,
    pub run_id: Option<i64>,
    pub entry_id: String,
    pub thread_id: Option<String>,
    pub turn_id: Option<String>,
    pub access_mode: String,
    pub execution_target: String,
    pub chat_title: String,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BrowserSessionStatus {
    pub token: String,
    pub status: String,
    pub target: BrowserSessionTarget,
    pub browser_pid: Option<u32>,
    pub error: Option<String>,
    pub backend: String,
    pub browser: Option<default_browser::DefaultBrowserInfo>,
    pub extension_connected: bool,
    pub chat_group_key: Option<String>,
    pub controlled_tab_id: Option<i64>,
    pub fallback_reason: Option<String>,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BrowserRuntimeStatus {
    pub available: bool,
    pub message: Option<String>,
    pub default_browser: Option<DefaultBrowserCapabilityStatus>,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreparedBrowserSession {
    pub token: String,
    #[specta(type = specta_typescript::Unknown)]
    pub config: Value,
    pub state: BrowserSessionStatus,
}

#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
struct RuntimeManifest {
    version: u32,
    architecture: String,
    playwright_mcp_version: String,
    playwright_version: String,
    node_executable: String,
    wrapper_script: String,
    default_browser_wrapper_script: Option<String>,
    chromium_executable: String,
}

#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
struct WrapperState {
    session_token: String,
    status: String,
    wrapper_pid: Option<u32>,
    browser_pid: Option<u32>,
    error: Option<String>,
}

pub(crate) fn resolve_playwright_runtime(app: &AppHandle) -> Result<PlaywrightRuntime, String> {
    if let (Some(node), Some(wrapper), Some(default_wrapper), Some(chromium)) = (
        env::var_os("ORCHESTRATOR_PLAYWRIGHT_NODE"),
        env::var_os("ORCHESTRATOR_PLAYWRIGHT_WRAPPER"),
        env::var_os("ORCHESTRATOR_DEFAULT_BROWSER_WRAPPER"),
        env::var_os("ORCHESTRATOR_PLAYWRIGHT_CHROMIUM"),
    ) {
        return validate_runtime_paths(
            PathBuf::from(node),
            PathBuf::from(wrapper),
            PathBuf::from(default_wrapper),
            PathBuf::from(chromium),
            "environment override".to_string(),
        );
    }

    let architecture = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else if cfg!(target_arch = "x86_64") {
        "x64"
    } else {
        return Err("The bundled browser does not support this Mac architecture.".to_string());
    };

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Could not resolve Orchestrator resources: {error}"))?;
    for root in [
        resource_dir
            .join("resources")
            .join("playwright")
            .join(format!("darwin-{architecture}")),
        resource_dir
            .join("playwright")
            .join(format!("darwin-{architecture}")),
    ] {
        if root.join("runtime.json").is_file() {
            return read_packaged_runtime(&root, architecture);
        }
    }

    // `tauri dev --release` is still a development process even though Rust
    // debug assertions are disabled, so use Tauri's build-mode signal here.
    if tauri::is_dev() {
        let development_bundle = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("playwright")
            .join(format!("darwin-{architecture}"));
        if development_bundle.join("runtime.json").is_file() {
            return read_packaged_runtime(&development_bundle, architecture);
        }
        return resolve_development_runtime();
    }

    Err(
        "The bundled Playwright runtime is unavailable. Rebuild Orchestrator with `npm run build:tauri`."
            .to_string(),
    )
}

pub(crate) fn append_playwright_app_server_args(
    args: &mut Vec<String>,
    runtime: &PlaywrightRuntime,
) {
    args.extend([
        "-c".to_string(),
        format!(
            "mcp_servers.{PLAYWRIGHT_SERVER_NAME}.command={}",
            toml_string(&runtime.node_executable)
        ),
        "-c".to_string(),
        format!(
            "mcp_servers.{PLAYWRIGHT_SERVER_NAME}.args=[{},\"--unscoped\"]",
            toml_string(&runtime.wrapper_script)
        ),
        "-c".to_string(),
        format!("mcp_servers.{PLAYWRIGHT_SERVER_NAME}.enabled=false"),
        "-c".to_string(),
        format!("mcp_servers.{PLAYWRIGHT_SERVER_NAME}.required=false"),
        "-c".to_string(),
        format!("mcp_servers.{PLAYWRIGHT_SERVER_NAME}.startup_timeout_sec=30"),
        "-c".to_string(),
        format!("mcp_servers.{PLAYWRIGHT_SERVER_NAME}.tool_timeout_sec=120"),
    ]);
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn browser_runtime_status(app: AppHandle) -> BrowserRuntimeStatus {
    let default_browser = Some(default_browser::default_browser_capability_status(
        app.clone(),
        app.state::<DefaultBrowserBridgeState>(),
    ));
    match resolve_playwright_runtime(&app) {
        Ok(_) => BrowserRuntimeStatus {
            available: true,
            message: None,
            default_browser,
        },
        Err(error) => BrowserRuntimeStatus {
            available: false,
            message: Some(error),
            default_browser,
        },
    }
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn browser_session_prepare(
    target: BrowserSessionTarget,
    app: AppHandle,
    state: State<'_, BrowserSessionRegistry>,
    default_browser_state: State<'_, DefaultBrowserBridgeState>,
) -> Result<PreparedBrowserSession, String> {
    validate_target(&target)?;
    let runtime = resolve_playwright_runtime(&app)?;

    let token = Uuid::new_v4().simple().to_string();
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Orchestrator app data: {error}"))?;
    let session_root = app_data.join("browser-sessions").join(&token);
    let output_dir = session_root.join("output");
    let temp_dir = session_root.join("tmp");
    let state_file = session_root.join("state.json");
    let control_socket =
        env::temp_dir().join(format!("orchestrator-browser-{}.sock", &token[..16]));

    fs::create_dir_all(&output_dir)
        .and_then(|_| fs::create_dir_all(&temp_dir))
        .map_err(|error| format!("Could not prepare the browser session: {error}"))?;
    secure_directory(&session_root)?;
    let group_key = target
        .chat_id
        .map(|chat_id| format!("workspace-{}-chat-{chat_id}", target.workspace_id));
    let group_title = format!(
        "Orchestrator · {}",
        target
            .chat_title
            .trim()
            .chars()
            .take(60)
            .collect::<String>()
    );
    let default_status = default_browser::default_browser_capability_status(
        app.clone(),
        app.state::<DefaultBrowserBridgeState>(),
    );
    let use_default_browser = target.execution_target == "default-browser"
        && target.chat_id.is_some()
        && default_status
            .browser
            .as_ref()
            .is_some_and(|browser| browser.supported)
        && default_status.extension_connected;
    let fallback_reason = if target.execution_target == "default-browser" && !use_default_browser {
        Some(default_status.message.clone().unwrap_or_else(|| {
            "The default-browser bridge is unavailable. Isolated Chromium will be used.".to_string()
        }))
    } else {
        None
    };
    let (config, backend) = if use_default_browser {
        let (bridge_socket, bridge_secret) =
            default_browser::bridge_connection_details(default_browser_state.inner())?;
        (
            json!({
                "mcp_servers": {
                    PLAYWRIGHT_SERVER_NAME: {
                        "command": runtime.node_executable,
                        "args": [
                            runtime.default_browser_wrapper_script,
                            "--session-token", token,
                            "--entry-id", target.entry_id,
                            "--bridge-socket", bridge_socket,
                            "--bridge-secret", bridge_secret,
                            "--group-key", group_key,
                            "--group-title", group_title,
                            "--access-mode", target.access_mode,
                        ],
                        "enabled": true,
                        "required": true,
                        "startup_timeout_sec": 30,
                        "tool_timeout_sec": 120,
                    }
                }
            }),
            "default-browser".to_string(),
        )
    } else {
        (
            json!({
            "mcp_servers": {
                PLAYWRIGHT_SERVER_NAME: {
                    "command": runtime.node_executable,
                    "args": [
                        runtime.wrapper_script,
                        "--session-token", token,
                        "--entry-id", target.entry_id,
                        "--state-file", state_file,
                        "--browser-executable", runtime.chromium_executable,
                        "--output-dir", output_dir,
                        "--control-socket", control_socket,
                        "--access-mode", target.access_mode,
                    ],
                    "env": {
                        "TMPDIR": temp_dir,
                    },
                    "enabled": true,
                    "required": true,
                    "startup_timeout_sec": 30,
                    "tool_timeout_sec": 120,
                }
            }
            }),
            "isolated".to_string(),
        )
    };
    let record = BrowserSessionRecord {
        token: token.clone(),
        target: target.clone(),
        session_root,
        state_file,
        control_socket,
        backend,
        fallback_reason,
        group_key,
        group_title: Some(group_title),
        status: "prepared".to_string(),
        controlled_tab_id: None,
    };
    let status = status_for_record(&record);
    state
        .sessions
        .lock()
        .map_err(|_| "Browser session lock was poisoned".to_string())?
        .insert(token.clone(), record);

    let prepared = PreparedBrowserSession {
        token,
        config,
        state: BrowserSessionStatus {
            status: "prepared".to_string(),
            ..status
        },
    };
    emit_browser_session_state(&app, &prepared.state);
    Ok(prepared)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn browser_session_status(
    token: String,
    state: State<'_, BrowserSessionRegistry>,
) -> Result<BrowserSessionStatus, String> {
    validate_token(&token)?;
    let record = session_record(&state, &token)?;
    Ok(status_for_record(&record))
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn browser_session_focus(
    token: String,
    app: AppHandle,
    state: State<'_, BrowserSessionRegistry>,
    default_browser_state: State<'_, DefaultBrowserBridgeState>,
) -> Result<BrowserSessionStatus, String> {
    validate_token(&token)?;
    let mut record = session_record(&state, &token)?;
    if record.backend == "default-browser" {
        default_browser::focus_group(
            default_browser_state.inner(),
            record
                .group_key
                .as_deref()
                .ok_or("Browser group is unavailable.")?,
        )?;
        record.status = "running".to_string();
        if let Ok(mut sessions) = state.sessions.lock() {
            if let Some(stored) = sessions.get_mut(&token) {
                stored.status = record.status.clone();
            }
        }
    } else {
        send_control_command(&record, "focus")?;
    }
    let status = status_for_record(&record);
    emit_browser_session_state(&app, &status);
    Ok(status)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn browser_session_update_target(
    token: String,
    target: BrowserSessionTarget,
    app: AppHandle,
    state: State<'_, BrowserSessionRegistry>,
    default_browser_state: State<'_, DefaultBrowserBridgeState>,
) -> Result<BrowserSessionStatus, String> {
    validate_token(&token)?;
    validate_target(&target)?;
    let record = {
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| "Browser session lock was poisoned".to_string())?;
        let record = sessions
            .get_mut(&token)
            .ok_or_else(|| "The browser session is no longer available.".to_string())?;
        let previous_title = record.target.chat_title.clone();
        record.target = target;
        if record.backend == "default-browser" && previous_title != record.target.chat_title {
            record.group_title = Some(format!("Orchestrator · {}", record.target.chat_title));
        }
        record.clone()
    };
    if record.backend == "default-browser" {
        if let (Some(group_key), Some(group_title)) =
            (record.group_key.as_deref(), record.group_title.as_deref())
        {
            let _ = default_browser::rename_group(
                default_browser_state.inner(),
                group_key,
                group_title,
            );
        }
    }
    let status = status_for_record(&record);
    emit_browser_session_state(&app, &status);
    Ok(status)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn browser_session_stop(
    token: String,
    app: AppHandle,
    state: State<'_, BrowserSessionRegistry>,
    default_browser_state: State<'_, DefaultBrowserBridgeState>,
) -> Result<BrowserSessionStatus, String> {
    validate_token(&token)?;
    let record = {
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| "Browser session lock was poisoned".to_string())?;
        sessions
            .remove(&token)
            .ok_or_else(|| "The browser session is no longer available.".to_string())?
    };
    if record.backend == "default-browser" {
        let _ = default_browser::detach_session(default_browser_state.inner(), &record.token);
    } else {
        let _ = send_control_command(&record, "stop");
        if !wait_for_session_stop(&record).await {
            terminate_session_processes(&record);
        }
    }
    let stopped = BrowserSessionStatus {
        token: record.token.clone(),
        status: "stopped".to_string(),
        target: record.target.clone(),
        browser_pid: None,
        error: None,
        backend: record.backend.clone(),
        browser: None,
        extension_connected: false,
        chat_group_key: record.group_key.clone(),
        controlled_tab_id: None,
        fallback_reason: record.fallback_reason.clone(),
    };
    let _ = fs::remove_dir_all(&record.session_root);
    let _ = fs::remove_file(&record.control_socket);
    emit_browser_session_state(&app, &stopped);
    Ok(stopped)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn browser_session_list_tabs(
    token: String,
    state: State<'_, BrowserSessionRegistry>,
    default_browser_state: State<'_, DefaultBrowserBridgeState>,
) -> Result<Vec<DefaultBrowserTab>, String> {
    validate_token(&token)?;
    let record = session_record(&state, &token)?;
    if record.backend != "default-browser" {
        return Err("Tabs can be attached only when using the default browser.".to_string());
    }
    default_browser::list_tabs(
        default_browser_state.inner(),
        record
            .group_key
            .as_deref()
            .ok_or("Browser group is unavailable.")?,
    )
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn browser_session_attach_tab(
    token: String,
    tab_id: i64,
    app: AppHandle,
    state: State<'_, BrowserSessionRegistry>,
    default_browser_state: State<'_, DefaultBrowserBridgeState>,
) -> Result<BrowserSessionStatus, String> {
    validate_token(&token)?;
    if tab_id <= 0 {
        return Err("Select a valid browser tab.".to_string());
    }
    let mut record = session_record(&state, &token)?;
    if record.backend != "default-browser" {
        return Err("Tabs can be attached only when using the default browser.".to_string());
    }
    default_browser::attach_tab(
        default_browser_state.inner(),
        record
            .group_key
            .as_deref()
            .ok_or("Browser group is unavailable.")?,
        record.group_title.as_deref().unwrap_or("Orchestrator"),
        &record.token,
        tab_id,
    )?;
    record.status = "running".to_string();
    record.controlled_tab_id = Some(tab_id);
    if let Ok(mut sessions) = state.sessions.lock() {
        if let Some(stored) = sessions.get_mut(&token) {
            stored.status = record.status.clone();
            stored.controlled_tab_id = record.controlled_tab_id;
        }
    }
    let status = status_for_record(&record);
    emit_browser_session_state(&app, &status);
    Ok(status)
}

fn emit_browser_session_state(app: &AppHandle, status: &BrowserSessionStatus) {
    let _ = app.emit(BROWSER_SESSION_EVENT, status);
}

fn session_record(
    state: &State<'_, BrowserSessionRegistry>,
    token: &str,
) -> Result<BrowserSessionRecord, String> {
    session_record_direct(state.inner(), token)
}

fn session_record_direct(
    state: &BrowserSessionRegistry,
    token: &str,
) -> Result<BrowserSessionRecord, String> {
    state
        .sessions
        .lock()
        .map_err(|_| "Browser session lock was poisoned".to_string())?
        .get(token)
        .cloned()
        .ok_or_else(|| "The browser session is no longer available.".to_string())
}

fn status_for_record(record: &BrowserSessionRecord) -> BrowserSessionStatus {
    if record.backend == "default-browser" {
        return BrowserSessionStatus {
            token: record.token.clone(),
            status: record.status.clone(),
            target: record.target.clone(),
            browser_pid: None,
            error: None,
            backend: record.backend.clone(),
            browser: None,
            extension_connected: true,
            chat_group_key: record.group_key.clone(),
            controlled_tab_id: record.controlled_tab_id,
            fallback_reason: record.fallback_reason.clone(),
        };
    }
    let wrapper_state = fs::read_to_string(&record.state_file)
        .ok()
        .and_then(|raw| serde_json::from_str::<WrapperState>(&raw).ok())
        .filter(|state| state.session_token == record.token);
    BrowserSessionStatus {
        token: record.token.clone(),
        status: wrapper_state
            .as_ref()
            .map(|state| state.status.clone())
            .unwrap_or_else(|| "prepared".to_string()),
        target: record.target.clone(),
        browser_pid: wrapper_state.as_ref().and_then(|state| state.browser_pid),
        error: wrapper_state.and_then(|state| state.error),
        backend: record.backend.clone(),
        browser: None,
        extension_connected: false,
        chat_group_key: record.group_key.clone(),
        controlled_tab_id: None,
        fallback_reason: record.fallback_reason.clone(),
    }
}

fn send_control_command(record: &BrowserSessionRecord, action: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::net::UnixStream;

        let mut stream = UnixStream::connect(&record.control_socket)
            .map_err(|error| format!("Could not contact the browser session: {error}"))?;
        stream
            .set_read_timeout(Some(CONTROL_TIMEOUT))
            .map_err(|error| format!("Could not configure browser control timeout: {error}"))?;
        stream
            .set_write_timeout(Some(CONTROL_TIMEOUT))
            .map_err(|error| format!("Could not configure browser control timeout: {error}"))?;
        writeln!(
            stream,
            "{}",
            json!({ "sessionToken": record.token, "action": action })
        )
        .map_err(|error| format!("Could not send the browser control command: {error}"))?;
        stream
            .flush()
            .map_err(|error| format!("Could not flush the browser control command: {error}"))?;
        let mut response = String::new();
        BufReader::new(stream)
            .read_line(&mut response)
            .map_err(|error| format!("Could not read the browser control response: {error}"))?;
        let response: Value = serde_json::from_str(response.trim())
            .map_err(|_| "The browser returned an invalid control response.".to_string())?;
        if response.get("ok").and_then(Value::as_bool) == Some(true) {
            return Ok(());
        }
        return Err(response
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("The browser control command failed.")
            .to_string());
    }

    #[cfg(not(unix))]
    {
        let _ = (record, action);
        Err("Browser controls are available only in the macOS desktop app.".to_string())
    }
}

async fn wait_for_session_stop(record: &BrowserSessionRecord) -> bool {
    for _ in 0..20 {
        let stopped = fs::read_to_string(&record.state_file)
            .ok()
            .and_then(|raw| serde_json::from_str::<WrapperState>(&raw).ok())
            .is_some_and(|state| {
                state.session_token == record.token
                    && matches!(state.status.as_str(), "stopped" | "error")
            });
        if stopped {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    false
}

fn terminate_session_processes(record: &BrowserSessionRecord) {
    let wrapper_state = fs::read_to_string(&record.state_file)
        .ok()
        .and_then(|raw| serde_json::from_str::<WrapperState>(&raw).ok())
        .filter(|state| state.session_token == record.token);
    for pid in wrapper_state
        .iter()
        .flat_map(|state| [state.browser_pid, state.wrapper_pid])
        .flatten()
    {
        let _ = Command::new("/bin/kill")
            .args(["-TERM", &pid.to_string()])
            .status();
    }
}

fn validate_target(target: &BrowserSessionTarget) -> Result<(), String> {
    if target.profile_key != "default"
        && !target
            .profile_key
            .strip_prefix("account:")
            .is_some_and(|value| value.parse::<i64>().is_ok_and(|id| id > 0))
    {
        return Err("Invalid Codex profile for browser session.".to_string());
    }
    if target.workspace_id <= 0 || target.entry_id.trim().is_empty() {
        return Err("Browser session target is incomplete.".to_string());
    }
    if !matches!(
        target.access_mode.as_str(),
        "ask-for-approval" | "full-access"
    ) {
        return Err("Invalid browser access mode.".to_string());
    }
    if !matches!(
        target.execution_target.as_str(),
        "default-browser" | "isolated"
    ) {
        return Err("Invalid browser execution target.".to_string());
    }
    Ok(())
}

fn validate_token(token: &str) -> Result<(), String> {
    if token.len() == 32 && token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("Invalid browser session token.".to_string())
    }
}

fn read_packaged_runtime(root: &Path, architecture: &str) -> Result<PlaywrightRuntime, String> {
    let manifest_path = root.join("runtime.json");
    let manifest: RuntimeManifest = serde_json::from_slice(
        &fs::read(&manifest_path)
            .map_err(|error| format!("Could not read the Playwright runtime manifest: {error}"))?,
    )
    .map_err(|error| format!("The Playwright runtime manifest is invalid: {error}"))?;
    if manifest.version != 1 || manifest.architecture != architecture {
        return Err("The bundled Playwright runtime does not match this Mac.".to_string());
    }
    let node = confined_runtime_path(root, &manifest.node_executable)?;
    let wrapper = confined_runtime_path(root, &manifest.wrapper_script)?;
    let default_wrapper = confined_runtime_path(
        root,
        manifest
            .default_browser_wrapper_script
            .as_deref()
            .ok_or("The default-browser MCP wrapper is missing from the runtime manifest.")?,
    )?;
    let chromium = confined_runtime_path(root, &manifest.chromium_executable)?;
    validate_runtime_paths(
        node,
        wrapper,
        default_wrapper,
        chromium,
        format!(
            "@playwright/mcp {} / Playwright {}",
            manifest.playwright_mcp_version, manifest.playwright_version
        ),
    )
}

fn resolve_development_runtime() -> Result<PlaywrightRuntime, String> {
    let repository = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| "Could not resolve the Orchestrator repository.".to_string())?;
    let wrapper = repository
        .join("scripts")
        .join("playwright-runtime")
        .join("orchestrator-playwright-mcp.mjs");
    let default_wrapper = repository
        .join("scripts")
        .join("playwright-runtime")
        .join("orchestrator-default-browser-mcp.mjs");
    let node = resolve_path_executable("node")
        .ok_or_else(|| "Node.js is required for the development browser runtime.".to_string())?;
    let chromium = env::var_os("ORCHESTRATOR_PLAYWRIGHT_CHROMIUM")
        .map(PathBuf::from)
        .or_else(|| probe_development_chromium(repository, &node))
        .ok_or_else(|| {
            "The pinned Chromium build is unavailable. Run `npm run prepare:playwright-runtime` before starting Orchestrator."
                .to_string()
        })?;
    validate_runtime_paths(
        node,
        wrapper,
        default_wrapper,
        chromium,
        "development runtime".to_string(),
    )
}

fn probe_development_chromium(repository: &Path, node: &Path) -> Option<PathBuf> {
    let output = Command::new(node)
        .current_dir(repository)
        .args([
            "--input-type=module",
            "--eval",
            "import { chromium } from 'playwright'; process.stdout.write(chromium.executablePath());",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let path = PathBuf::from(String::from_utf8(output.stdout).ok()?.trim());
    path.is_file().then_some(path)
}

fn validate_runtime_paths(
    node: PathBuf,
    wrapper: PathBuf,
    default_wrapper: PathBuf,
    chromium: PathBuf,
    _version: String,
) -> Result<PlaywrightRuntime, String> {
    if !node.is_file() {
        return Err(format!(
            "The Playwright Node runtime was not found at {}.",
            node.display()
        ));
    }
    if !wrapper.is_file() {
        return Err(format!(
            "The Playwright MCP wrapper was not found at {}.",
            wrapper.display()
        ));
    }
    if !chromium.is_file() {
        return Err(format!(
            "The pinned Chromium executable was not found at {}.",
            chromium.display()
        ));
    }
    if !default_wrapper.is_file() {
        return Err(format!(
            "The default-browser MCP wrapper was not found at {}.",
            default_wrapper.display()
        ));
    }
    Ok(PlaywrightRuntime {
        node_executable: node,
        wrapper_script: wrapper,
        default_browser_wrapper_script: default_wrapper,
        chromium_executable: chromium,
    })
}

fn confined_runtime_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Could not resolve the Playwright runtime: {error}"))?;
    let candidate = root.join(relative);
    let canonical = candidate.canonicalize().map_err(|error| {
        format!(
            "Could not resolve bundled Playwright resource {}: {error}",
            candidate.display()
        )
    })?;
    if canonical.starts_with(&canonical_root) {
        Ok(canonical)
    } else {
        Err("The Playwright runtime manifest referenced an unsafe path.".to_string())
    }
}

fn resolve_path_executable(name: &str) -> Option<PathBuf> {
    env::var_os("PATH").and_then(|path| {
        env::split_paths(&path)
            .map(|directory| directory.join(name))
            .find(|candidate| candidate.is_file())
    })
}

fn toml_string(path: &Path) -> String {
    serde_json::to_string(&path.to_string_lossy()).expect("paths serialize as JSON strings")
}

fn secure_directory(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("Could not secure the browser session: {error}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn target_validation_rejects_unscoped_profiles_and_access() {
        let target = BrowserSessionTarget {
            profile_key: "other".to_string(),
            workspace_id: 1,
            chat_id: None,
            run_id: None,
            entry_id: "entry".to_string(),
            thread_id: None,
            turn_id: None,
            access_mode: "ask-for-approval".to_string(),
            execution_target: "isolated".to_string(),
            chat_title: "Test chat".to_string(),
        };
        assert!(validate_target(&target).is_err());

        let target = BrowserSessionTarget {
            profile_key: "account:4".to_string(),
            access_mode: "full-access".to_string(),
            ..target
        };
        assert!(validate_target(&target).is_ok());
    }

    #[test]
    fn app_server_registration_is_pinned_and_disabled_by_default() {
        let runtime = PlaywrightRuntime {
            node_executable: PathBuf::from("/bundle/bin/node"),
            wrapper_script: PathBuf::from("/bundle/mcp/wrapper.mjs"),
            default_browser_wrapper_script: PathBuf::from("/bundle/mcp/default.mjs"),
            chromium_executable: PathBuf::from("/bundle/chromium"),
        };
        let mut args = Vec::new();
        append_playwright_app_server_args(&mut args, &runtime);
        assert!(args
            .iter()
            .any(|arg| arg == "mcp_servers.playwright.enabled=false"));
        assert!(args
            .iter()
            .any(|arg| arg.contains("/bundle/mcp/wrapper.mjs")));
        assert!(!args
            .iter()
            .any(|arg| arg.contains("npx") || arg.contains("@latest")));
    }

    #[test]
    fn runtime_validation_requires_the_pinned_browser_executable() {
        let root = env::temp_dir().join(format!(
            "orchestrator-playwright-validation-{}",
            Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("creates validation fixture");
        let node = root.join("node");
        let wrapper = root.join("wrapper.mjs");
        let default_wrapper = root.join("default-wrapper.mjs");
        fs::write(&node, b"node").expect("writes node fixture");
        fs::write(&wrapper, b"wrapper").expect("writes wrapper fixture");
        fs::write(&default_wrapper, b"wrapper").expect("writes default wrapper fixture");

        let result = validate_runtime_paths(
            node,
            wrapper,
            default_wrapper,
            root.join("missing-chromium"),
            "test".to_string(),
        );

        assert!(result
            .err()
            .expect("missing Chromium must fail")
            .contains("Chromium executable"));
        fs::remove_dir_all(root).expect("removes validation fixture");
    }
}
