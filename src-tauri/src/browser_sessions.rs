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

const BROWSER_SESSION_EVENT: &str = "orchestrator:browser-session";
const CONTROL_TIMEOUT: Duration = Duration::from_secs(3);
const BACKEND_START_TIMEOUT: Duration = Duration::from_secs(15);
const BROWSER_PLUGIN_NAME: &str = "browser";
const SUPPORTED_BROWSER_PLUGIN_MAJOR: u64 = 26;

#[derive(Clone)]
pub(crate) struct BrowserHostRuntime {
    pub node_executable: PathBuf,
    pub backend_script: PathBuf,
}

#[derive(Clone)]
struct BrowserSkillRuntime {
    version: String,
    _client_script: PathBuf,
    _service_script: PathBuf,
    _skill_file: PathBuf,
}

#[derive(Default)]
pub(crate) struct BrowserSessionRegistry {
    sessions: Mutex<HashMap<String, BrowserSessionRecord>>,
    safari_lease: Mutex<Option<String>>,
}

impl Drop for BrowserSessionRegistry {
    fn drop(&mut self) {
        if let Ok(sessions) = self.sessions.get_mut() {
            for session in sessions.values() {
                let _ = send_control_command(session, "stop");
                terminate_session_processes(session);
                let _ = fs::remove_dir_all(&session.session_root);
                let _ = fs::remove_file(&session.control_socket);
                let _ = fs::remove_file(&session.backend_pipe);
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
    backend_pipe: PathBuf,
    control_socket: PathBuf,
    backend: String,
    browser: default_browser::DefaultBrowserInfo,
    group_key: Option<String>,
    group_title: Option<String>,
    status: String,
    runtime_error: Option<String>,
    controlled_tab_id: Option<i64>,
    skill_version: String,
    service_compatible: bool,
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
    pub unavailable_reason: Option<String>,
    pub browser_skill_version: String,
    pub browser_service_compatible: bool,
    pub backend_healthy: bool,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BrowserRuntimeStatus {
    pub available: bool,
    pub message: Option<String>,
    pub default_browser: Option<DefaultBrowserCapabilityStatus>,
    pub browser_skill_version: Option<String>,
    pub browser_service_compatible: bool,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreparedBrowserSession {
    pub token: String,
    #[specta(type = specta_typescript::Unknown)]
    pub config: Value,
    pub state: BrowserSessionStatus,
}

#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BrowserSessionPreparation {
    pub session: Option<PreparedBrowserSession>,
    pub unavailable_reason: Option<String>,
    pub browser_family: Option<String>,
}

#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
struct RuntimeManifest {
    version: u32,
    architecture: String,
    node_executable: String,
    browser_backend_script: String,
}

#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
struct WrapperState {
    session_token: String,
    status: String,
    wrapper_pid: Option<u32>,
    browser_pid: Option<u32>,
    error: Option<String>,
    backend_pipe: Option<String>,
}

pub(crate) fn resolve_browser_host_runtime(app: &AppHandle) -> Result<BrowserHostRuntime, String> {
    if let (Some(node), Some(backend)) = (
        env::var_os("ORCHESTRATOR_PLAYWRIGHT_NODE"),
        env::var_os("ORCHESTRATOR_BROWSER_BACKEND"),
    ) {
        return validate_runtime_paths(PathBuf::from(node), PathBuf::from(backend));
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
        "The bundled Browser host runtime is unavailable. Rebuild Orchestrator with `npm run build:tauri`."
            .to_string(),
    )
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn browser_runtime_status(app: AppHandle) -> BrowserRuntimeStatus {
    let default_browser = Some(default_browser::default_browser_capability_status(
        app.clone(),
        app.state::<DefaultBrowserBridgeState>(),
    ));
    let integration_ready = default_browser.as_ref().is_some_and(|status| {
        status.browser.as_ref().is_some_and(|browser| {
            browser.supported
                && if browser.family.as_deref() == Some("safari") {
                    default_browser::safari_driver_path(browser).is_some()
                } else {
                    status.extension_connected
                }
        })
    });
    let skill = resolve_browser_skill_runtime();
    match (resolve_browser_host_runtime(&app), skill) {
        (Ok(_), Ok(skill)) if integration_ready => BrowserRuntimeStatus {
            available: true,
            message: default_browser
                .as_ref()
                .and_then(|status| status.message.clone()),
            default_browser,
            browser_skill_version: Some(skill.version),
            browser_service_compatible: true,
        },
        (host, skill) => BrowserRuntimeStatus {
            available: false,
            message: Some(
                host.err()
                    .or_else(|| skill.err())
                    .or_else(|| {
                        default_browser
                            .as_ref()
                            .and_then(|status| status.message.clone())
                    })
                    .unwrap_or_else(|| "The bundled Browser runtime is unavailable.".to_string()),
            ),
            default_browser,
            browser_skill_version: None,
            browser_service_compatible: false,
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
) -> Result<BrowserSessionPreparation, String> {
    validate_target(&target)?;
    let browser = match default_browser::detect_default_browser() {
        Some(browser) if browser.supported => browser,
        Some(browser) => {
            return Ok(unavailable_preparation(
                browser.family.clone(),
                format!("{} is not supported for Computer Use.", browser.name),
            ))
        }
        None => {
            return Ok(unavailable_preparation(
                None,
                "The macOS default browser could not be detected.",
            ))
        }
    };
    let family = browser.family.clone();
    let runtime = match resolve_browser_host_runtime(&app) {
        Ok(runtime) => runtime,
        Err(error) => return Ok(unavailable_preparation(family, error)),
    };
    let skill = match resolve_browser_skill_runtime() {
        Ok(skill) => skill,
        Err(error) => return Ok(unavailable_preparation(browser.family.clone(), error)),
    };

    let token = Uuid::new_v4().simple().to_string();
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Orchestrator app data: {error}"))?;
    let session_root = app_data.join("browser-sessions").join(&token);
    let output_dir = session_root.join("output");
    let temp_dir = session_root.join("tmp");
    let state_file = session_root.join("state.json");
    let backend_pipe =
        env::temp_dir().join(format!("orchestrator-codex-browser-{}.sock", &token[..16]));
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
    let is_safari = browser.family.as_deref() == Some("safari");
    if is_safari {
        let mut lease = state
            .safari_lease
            .lock()
            .map_err(|_| "Safari control lease lock was poisoned".to_string())?;
        if lease.is_some() {
            return Ok(unavailable_preparation(
                browser.family.clone(),
                "Safari is already controlled by another active turn.",
            ));
        }
        *lease = Some(token.clone());
    }
    let default_status = default_browser::default_browser_capability_status(
        app.clone(),
        app.state::<DefaultBrowserBridgeState>(),
    );
    if !is_safari && (target.chat_id.is_none() || !default_status.extension_connected) {
        return Ok(unavailable_preparation(
            browser.family.clone(),
            default_status
                .message
                .unwrap_or_else(|| "The Browser Bridge extension is not connected.".to_string()),
        ));
    }
    let backend = if is_safari {
        "safari-mcp"
    } else {
        "browser-bridge"
    }
    .to_string();
    let mut command = Command::new(&runtime.node_executable);
    command
        .arg(&runtime.backend_script)
        .args(["--backend", &backend])
        .args(["--session-token", &token])
        .args(["--entry-id", &target.entry_id])
        .args(["--profile-key", &target.profile_key])
        .args(["--workspace-id", &target.workspace_id.to_string()])
        .arg("--state-file")
        .arg(&state_file)
        .arg("--backend-pipe")
        .arg(&backend_pipe)
        .arg("--control-socket")
        .arg(&control_socket)
        .env("TMPDIR", &temp_dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    if let Some(run_id) = target.run_id {
        command.args(["--run-id", &run_id.to_string()]);
    }
    if let Some(thread_id) = target.thread_id.as_deref() {
        command.args(["--thread-id", thread_id]);
    }
    if let Some(turn_id) = target.turn_id.as_deref() {
        command.args(["--turn-id", turn_id]);
    }
    if !is_safari {
        let (bridge_socket, bridge_secret) =
            default_browser::bridge_connection_details(default_browser_state.inner())?;
        command
            .arg("--bridge-socket")
            .arg(bridge_socket)
            .arg("--bridge-secret")
            .arg(bridge_secret)
            .arg("--group-key")
            .arg(
                group_key
                    .as_deref()
                    .ok_or("Browser group is unavailable.")?,
            )
            .arg("--group-title")
            .arg(&group_title);
    } else {
        let safari_driver = match default_browser::safari_driver_path(&browser) {
            Some(path) => path,
            None => {
                release_safari_lease(state.inner(), &token);
                return Ok(unavailable_preparation(
                    browser.family.clone(),
                    "Safari's safaridriver executable is unavailable.",
                ));
            }
        };
        command.arg("--safari-driver").arg(safari_driver);
    }
    let mut backend_process = match command.spawn() {
        Ok(process) => process,
        Err(error) => {
            release_safari_lease(state.inner(), &token);
            return Ok(unavailable_preparation(
                browser.family.clone(),
                format!("Could not start the Browser backend: {error}"),
            ));
        }
    };
    if let Err(error) = wait_for_backend_ready(&state_file, &backend_pipe, &token).await {
        let _ = backend_process.kill();
        terminate_processes_from_state(&state_file, &token);
        if !is_safari {
            let _ = default_browser::detach_session(default_browser_state.inner(), &token);
        }
        let _ = fs::remove_dir_all(&session_root);
        let _ = fs::remove_file(&backend_pipe);
        let _ = fs::remove_file(&control_socket);
        release_safari_lease(state.inner(), &token);
        return Ok(unavailable_preparation(browser.family.clone(), error));
    }
    drop(backend_process);

    let config = browser_service_config(&backend_pipe, &skill.version);
    let record = BrowserSessionRecord {
        token: token.clone(),
        target: target.clone(),
        session_root,
        state_file,
        backend_pipe,
        control_socket,
        backend,
        browser: browser.clone(),
        group_key,
        group_title: Some(group_title),
        status: "ready".to_string(),
        runtime_error: None,
        controlled_tab_id: None,
        skill_version: skill.version,
        service_compatible: true,
    };
    let status = status_for_record(&record);
    state
        .sessions
        .lock()
        .map_err(|_| "Browser session lock was poisoned".to_string())?
        .insert(token.clone(), record);
    monitor_browser_backend(app.clone(), token.clone());

    let prepared = PreparedBrowserSession {
        token,
        config,
        state: BrowserSessionStatus {
            status: "ready".to_string(),
            ..status
        },
    };
    emit_browser_session_state(&app, &prepared.state);
    Ok(BrowserSessionPreparation {
        session: Some(prepared),
        unavailable_reason: None,
        browser_family: browser.family,
    })
}

fn unavailable_preparation(
    family: Option<String>,
    reason: impl Into<String>,
) -> BrowserSessionPreparation {
    BrowserSessionPreparation {
        session: None,
        unavailable_reason: Some(reason.into()),
        browser_family: family,
    }
}

fn release_safari_lease(state: &BrowserSessionRegistry, token: &str) {
    if let Ok(mut lease) = state.safari_lease.lock() {
        if lease.as_deref() == Some(token) {
            *lease = None;
        }
    }
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
    if record.backend == "browser-bridge" {
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
        if record.backend == "browser-bridge" && previous_title != record.target.chat_title {
            record.group_title = Some(format!("Orchestrator · {}", record.target.chat_title));
        }
        record.clone()
    };
    if record.backend == "browser-bridge" {
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
    send_control_payload(
        &record,
        json!({ "action": "update-target", "target": record.target }),
    )?;
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
    release_safari_lease(state.inner(), &record.token);
    let _ = send_control_command(&record, "stop");
    if !wait_for_session_stop(&record).await {
        terminate_session_processes(&record);
    }
    if record.backend == "browser-bridge" {
        let _ = default_browser::detach_session(default_browser_state.inner(), &record.token);
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
        unavailable_reason: None,
        browser_skill_version: record.skill_version.clone(),
        browser_service_compatible: record.service_compatible,
        backend_healthy: false,
    };
    let _ = fs::remove_dir_all(&record.session_root);
    let _ = fs::remove_file(&record.control_socket);
    let _ = fs::remove_file(&record.backend_pipe);
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
    if record.backend != "browser-bridge" {
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
    if record.backend != "browser-bridge" {
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
    let wrapper_state = fs::read_to_string(&record.state_file)
        .ok()
        .and_then(|raw| serde_json::from_str::<WrapperState>(&raw).ok())
        .filter(|state| state.session_token == record.token);
    BrowserSessionStatus {
        token: record.token.clone(),
        status: if record.runtime_error.is_some() {
            "error".to_string()
        } else {
            wrapper_state
                .as_ref()
                .map(|state| state.status.clone())
                .unwrap_or_else(|| record.status.clone())
        },
        target: record.target.clone(),
        browser_pid: wrapper_state.as_ref().and_then(|state| state.browser_pid),
        error: record
            .runtime_error
            .clone()
            .or_else(|| wrapper_state.as_ref().and_then(|state| state.error.clone())),
        backend: record.backend.clone(),
        browser: Some(record.browser.clone()),
        extension_connected: record.backend == "browser-bridge",
        chat_group_key: record.group_key.clone(),
        controlled_tab_id: record.controlled_tab_id,
        unavailable_reason: None,
        browser_skill_version: record.skill_version.clone(),
        browser_service_compatible: record.service_compatible,
        backend_healthy: record.runtime_error.is_none()
            && wrapper_state.as_ref().is_some_and(|state| {
                state.status == "ready"
                    && state.backend_pipe.as_deref()
                        == Some(record.backend_pipe.to_string_lossy().as_ref())
                    && record.backend_pipe.exists()
            }),
    }
}

fn monitor_browser_backend(app: AppHandle, token: String) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_millis(500)).await;
            let registry = app.state::<BrowserSessionRegistry>();
            let Ok(record) = session_record_direct(registry.inner(), &token) else {
                return;
            };
            let status = status_for_record(&record);
            if status.backend_healthy {
                continue;
            }
            if matches!(status.status.as_str(), "stopping" | "stopped") {
                return;
            }
            let error = status.error.unwrap_or_else(|| {
                "The bundled Browser backend disconnected from this run.".to_string()
            });
            let updated = {
                let Ok(mut sessions) = registry.sessions.lock() else {
                    return;
                };
                let Some(stored) = sessions.get_mut(&token) else {
                    return;
                };
                if stored.runtime_error.is_some() {
                    return;
                }
                stored.status = "error".to_string();
                stored.runtime_error = Some(error);
                status_for_record(stored)
            };
            emit_browser_session_state(&app, &updated);
            return;
        }
    });
}

fn send_control_command(record: &BrowserSessionRecord, action: &str) -> Result<(), String> {
    send_control_payload(record, json!({ "action": action }))
}

fn send_control_payload(record: &BrowserSessionRecord, mut payload: Value) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::net::UnixStream;

        payload
            .as_object_mut()
            .ok_or("Browser control payload is invalid.")?
            .insert(
                "sessionToken".to_string(),
                Value::String(record.token.clone()),
            );

        let mut stream = UnixStream::connect(&record.control_socket)
            .map_err(|error| format!("Could not contact the browser session: {error}"))?;
        stream
            .set_read_timeout(Some(CONTROL_TIMEOUT))
            .map_err(|error| format!("Could not configure browser control timeout: {error}"))?;
        stream
            .set_write_timeout(Some(CONTROL_TIMEOUT))
            .map_err(|error| format!("Could not configure browser control timeout: {error}"))?;
        writeln!(stream, "{}", payload)
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
        let _ = (record, payload);
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

fn terminate_processes_from_state(state_file: &Path, token: &str) {
    let state = fs::read_to_string(state_file)
        .ok()
        .and_then(|raw| serde_json::from_str::<WrapperState>(&raw).ok())
        .filter(|state| state.session_token == token);
    for pid in state
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
    Ok(())
}

fn validate_token(token: &str) -> Result<(), String> {
    if token.len() == 32 && token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("Invalid browser session token.".to_string())
    }
}

fn browser_service_config(backend_pipe: &Path, skill_version: &str) -> Value {
    json!({
        "shell_environment_policy": {
            "inherit": "all",
            "set": {
                "BROWSER_USE_AVAILABLE_BACKENDS": "cdp",
                "CDP_BROWSER_BACKEND_PIPE_PATH": backend_pipe,
                "BROWSER_AUTH_EVAL_EXACT_CDP_BACKEND_SOCKET": "true",
                "BROWSER_USE_BROWSER_CLIENT_BUILD": skill_version,
                "BROWSER_USE_DISABLE_API_MEMBERS": "Browser.download,Tab.upload,Tab.clipboard",
                "BROWSER_USE_DISABLE_BROWSER_CAPABILITIES": "download,upload,clipboard",
                "BROWSER_USE_DISABLE_TAB_CAPABILITIES": "download,upload,clipboard",
                "BROWSER_USE_SECURITY_MODE": ""
            }
        }
    })
}

async fn wait_for_backend_ready(
    state_file: &Path,
    backend_pipe: &Path,
    token: &str,
) -> Result<(), String> {
    let started = std::time::Instant::now();
    while started.elapsed() < BACKEND_START_TIMEOUT {
        if let Ok(raw) = fs::read_to_string(state_file) {
            if let Ok(state) = serde_json::from_str::<WrapperState>(&raw) {
                if state.session_token != token {
                    return Err(
                        "The Browser backend returned a mismatched session token.".to_string()
                    );
                }
                if state.status == "error" {
                    return Err(state.error.unwrap_or_else(|| {
                        "The bundled Browser backend could not be started.".to_string()
                    }));
                }
                if state.status == "ready"
                    && state.backend_pipe.as_deref()
                        == Some(backend_pipe.to_string_lossy().as_ref())
                    && backend_pipe.exists()
                {
                    return Ok(());
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    Err("The bundled Browser backend did not become ready in time.".to_string())
}

fn resolve_browser_skill_runtime() -> Result<BrowserSkillRuntime, String> {
    let plugin_root = if let Some(value) = env::var_os("ORCHESTRATOR_BROWSER_PLUGIN_ROOT") {
        PathBuf::from(value)
    } else {
        let home = env::var_os("HOME")
            .map(PathBuf::from)
            .ok_or_else(|| "Could not resolve the Codex Browser plugin directory.".to_string())?;
        let cache = home
            .join(".codex")
            .join("plugins")
            .join("cache")
            .join("openai-bundled")
            .join(BROWSER_PLUGIN_NAME);
        let mut versions = fs::read_dir(&cache)
            .map_err(|_| {
                "Codex's bundled Browser skill is not installed. Update Codex and try again."
                    .to_string()
            })?
            .filter_map(Result::ok)
            .filter(|entry| entry.path().is_dir())
            .collect::<Vec<_>>();
        versions.sort_by_key(|entry| entry.file_name());
        versions
            .pop()
            .map(|entry| entry.path())
            .ok_or_else(|| "Codex's bundled Browser skill is unavailable.".to_string())?
    };
    let canonical = plugin_root
        .canonicalize()
        .map_err(|error| format!("Could not resolve the bundled Browser plugin: {error}"))?;
    let manifest_path = canonical.join(".codex-plugin").join("plugin.json");
    let manifest: Value = serde_json::from_slice(
        &fs::read(&manifest_path)
            .map_err(|error| format!("Could not read the bundled Browser manifest: {error}"))?,
    )
    .map_err(|error| format!("The bundled Browser manifest is invalid: {error}"))?;
    if manifest.get("name").and_then(Value::as_str) != Some(BROWSER_PLUGIN_NAME) {
        return Err("The resolved Codex plugin is not the trusted Browser plugin.".to_string());
    }
    let version = manifest
        .get("version")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or("The bundled Browser plugin has no version.")?
        .to_string();
    let major = version
        .split('.')
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .ok_or_else(|| "The bundled Browser plugin version is invalid.".to_string())?;
    if major != SUPPORTED_BROWSER_PLUGIN_MAJOR {
        return Err(format!(
            "Codex Browser plugin {version} is not compatible with this Orchestrator build."
        ));
    }
    let client_script = canonical.join("scripts").join("browser-client.mjs");
    let service_script = canonical.join("scripts").join("browser-service.mjs");
    let skill_file = canonical
        .join("skills")
        .join("control-in-app-browser")
        .join("SKILL.md");
    for (label, path) in [
        ("client", &client_script),
        ("service", &service_script),
        ("skill", &skill_file),
    ] {
        if !path.is_file() {
            return Err(format!("The bundled Browser {label} is missing."));
        }
    }
    Ok(BrowserSkillRuntime {
        version,
        _client_script: client_script,
        _service_script: service_script,
        _skill_file: skill_file,
    })
}

fn read_packaged_runtime(root: &Path, architecture: &str) -> Result<BrowserHostRuntime, String> {
    let manifest_path = root.join("runtime.json");
    let manifest: RuntimeManifest = serde_json::from_slice(
        &fs::read(&manifest_path)
            .map_err(|error| format!("Could not read the Browser host manifest: {error}"))?,
    )
    .map_err(|error| format!("The Browser host manifest is invalid: {error}"))?;
    if manifest.version != 3 || manifest.architecture != architecture {
        return Err("The bundled Browser host does not match this Mac.".to_string());
    }
    let node = confined_runtime_path(root, &manifest.node_executable)?;
    let backend = confined_runtime_path(root, &manifest.browser_backend_script)?;
    validate_runtime_paths(node, backend)
}

fn resolve_development_runtime() -> Result<BrowserHostRuntime, String> {
    let repository = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or_else(|| "Could not resolve the Orchestrator repository.".to_string())?;
    let backend = repository
        .join("scripts")
        .join("playwright-runtime")
        .join("orchestrator-browser-backend.mjs");
    let node = resolve_path_executable("node")
        .ok_or_else(|| "Node.js is required for the development browser runtime.".to_string())?;
    validate_runtime_paths(node, backend)
}

fn validate_runtime_paths(node: PathBuf, backend: PathBuf) -> Result<BrowserHostRuntime, String> {
    if !node.is_file() {
        return Err(format!(
            "The Browser host Node runtime was not found at {}.",
            node.display()
        ));
    }
    if !backend.is_file() {
        return Err(format!(
            "The Browser backend host was not found at {}.",
            backend.display()
        ));
    }
    Ok(BrowserHostRuntime {
        node_executable: node,
        backend_script: backend,
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
    fn browser_service_config_exposes_one_exact_backend_without_mcp() {
        let config = browser_service_config(Path::new("/tmp/browser.sock"), "26.818.31338");
        let serialized = serde_json::to_string(&config).expect("serializes Browser config");
        assert!(serialized.contains("CDP_BROWSER_BACKEND_PIPE_PATH"));
        assert!(serialized.contains("BROWSER_AUTH_EVAL_EXACT_CDP_BACKEND_SOCKET"));
        assert!(serialized.contains("26.818.31338"));
        assert!(!serialized.contains("mcp_servers"));
        assert!(!serialized.contains("playwright"));
    }

    #[test]
    fn runtime_validation_requires_only_node_and_backend() {
        let root = env::temp_dir().join(format!(
            "orchestrator-playwright-validation-{}",
            Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("creates validation fixture");
        let node = root.join("node");
        let backend = root.join("backend.mjs");
        fs::write(&node, b"node").expect("writes node fixture");
        fs::write(&backend, b"backend").expect("writes backend fixture");

        let result = validate_runtime_paths(node, backend);
        assert!(result.is_ok());
        fs::remove_dir_all(root).expect("removes validation fixture");
    }
}
