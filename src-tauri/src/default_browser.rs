use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

#[cfg(unix)]
use std::os::unix::{
    fs::PermissionsExt,
    net::{UnixListener, UnixStream},
};

const EXTENSION_ID: &str = "fofeecpbpggdafigoheccdohbpeekmjp";
const NATIVE_HOST_NAME: &str = "com.zachealy.orchestrator.browser";
const BRIDGE_PROTOCOL_VERSION: u32 = 1;
const BRIDGE_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Default)]
pub(crate) struct DefaultBrowserBridgeState {
    runtime: Mutex<Option<DefaultBrowserBridgeRuntime>>,
}

#[derive(Clone)]
struct DefaultBrowserBridgeRuntime {
    socket_path: PathBuf,
    secret: String,
    extension_connected: Arc<AtomicBool>,
    extension_path: PathBuf,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DefaultBrowserInfo {
    pub bundle_id: String,
    pub name: String,
    pub path: String,
    pub supported: bool,
    pub family: Option<String>,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DefaultBrowserCapabilityStatus {
    pub browser: Option<DefaultBrowserInfo>,
    pub extension_id: String,
    pub extension_connected: bool,
    pub native_host_installed: bool,
    pub accessibility_trusted: bool,
    pub extension_path: String,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DefaultBrowserTab {
    pub id: i64,
    pub title: String,
    pub origin: String,
    pub active: bool,
    pub in_current_group: bool,
}

#[derive(Deserialize)]
struct BridgeConfig {
    version: u32,
    socket_path: String,
    secret: String,
}

pub(crate) fn initialize_default_browser_bridge(
    app: &AppHandle,
    state: &DefaultBrowserBridgeState,
) -> Result<(), String> {
    #[cfg(not(unix))]
    {
        let _ = (app, state);
        return Ok(());
    }

    #[cfg(unix)]
    {
        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("Could not resolve Orchestrator app data: {error}"))?;
        let bridge_dir = app_data.join("browser-bridge");
        fs::create_dir_all(&bridge_dir)
            .map_err(|error| format!("Could not create the browser bridge directory: {error}"))?;
        fs::set_permissions(&bridge_dir, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("Could not secure the browser bridge directory: {error}"))?;

        let socket_path = browser_bridge_socket_path();
        let _ = fs::remove_file(&socket_path);
        let secret = Uuid::new_v4().simple().to_string();
        let extension_path = resolve_extension_path(app)?;
        let config_path = bridge_dir.join("native-host.json");
        write_secure_json(
            &config_path,
            &json!({
                "version": BRIDGE_PROTOCOL_VERSION,
                "socketPath": socket_path,
                "secret": secret,
            }),
        )?;
        install_native_host_manifests(app, &config_path, &bridge_dir)?;

        let extension_connected = Arc::new(AtomicBool::new(false));
        start_broker(
            socket_path.clone(),
            secret.clone(),
            extension_connected.clone(),
        )?;
        *state
            .runtime
            .lock()
            .map_err(|_| "Default browser bridge lock was poisoned".to_string())? =
            Some(DefaultBrowserBridgeRuntime {
                socket_path,
                secret,
                extension_connected,
                extension_path,
            });
        Ok(())
    }
}

pub(crate) fn bridge_connection_details(
    state: &DefaultBrowserBridgeState,
) -> Result<(PathBuf, String), String> {
    let runtime = state
        .runtime
        .lock()
        .map_err(|_| "Default browser bridge lock was poisoned".to_string())?
        .clone()
        .ok_or_else(|| "The default-browser bridge is unavailable.".to_string())?;
    Ok((runtime.socket_path, runtime.secret))
}

pub(crate) fn bridge_request(
    state: &DefaultBrowserBridgeState,
    action: &str,
    payload: Value,
) -> Result<Value, String> {
    let (socket_path, secret) = bridge_connection_details(state)?;
    bridge_request_with_details(&socket_path, &secret, action, payload)
}

#[tauri::command]
#[specta::specta]
pub(crate) fn default_browser_capability_status(
    app: AppHandle,
    state: State<'_, DefaultBrowserBridgeState>,
) -> DefaultBrowserCapabilityStatus {
    let browser = detect_default_browser();
    let runtime = state.runtime.lock().ok().and_then(|value| value.clone());
    let extension_connected = runtime.as_ref().is_some_and(|runtime| {
        if !runtime.extension_connected.load(Ordering::SeqCst) {
            return false;
        }
        bridge_request_with_details(&runtime.socket_path, &runtime.secret, "ping", json!({}))
            .is_ok()
    });
    let native_host_installed = native_host_manifest_paths()
        .iter()
        .all(|path| path.is_file());
    let extension_path = runtime
        .as_ref()
        .map(|runtime| runtime.extension_path.to_string_lossy().to_string())
        .or_else(|| {
            resolve_extension_path(&app)
                .ok()
                .map(|path| path.to_string_lossy().to_string())
        })
        .unwrap_or_default();
    let message = match browser.as_ref() {
        None => Some("The macOS default browser could not be detected.".to_string()),
        Some(browser) if !browser.supported => Some(format!(
            "{} cannot be controlled by Orchestrator. Choose Chrome, Edge, Brave, or Safari 27+ as the macOS default browser.",
            browser.name
        )),
        Some(browser) if browser.family.as_deref() == Some("safari") => Some(
            "Safari 27+ detected. Enable “Allow remote automation and external agents” in Safari Developer settings."
                .to_string(),
        ),
        Some(_) if !extension_connected => Some(
            "Install or enable the Orchestrator Browser Bridge extension to use your default browser."
                .to_string(),
        ),
        _ => None,
    };
    DefaultBrowserCapabilityStatus {
        browser,
        extension_id: EXTENSION_ID.to_string(),
        extension_connected,
        native_host_installed,
        accessibility_trusted: accessibility_is_trusted(),
        extension_path,
        message,
    }
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn default_browser_install_extension(app: AppHandle) -> Result<(), String> {
    let extension_path = resolve_extension_path(&app)?;
    if !extension_path.join("manifest.json").is_file() {
        return Err(
            "The bundled browser extension is unavailable. Rebuild Orchestrator.".to_string(),
        );
    }
    let reveal_status = Command::new("/usr/bin/open")
        .arg(&extension_path)
        .status()
        .map_err(|error| format!("Could not reveal the browser extension: {error}"))?;
    if !reveal_status.success() {
        return Err("Could not reveal the bundled browser extension.".to_string());
    }
    let browser = detect_default_browser()
        .filter(|browser| browser.supported && browser.family.as_deref() != Some("safari"))
        .ok_or_else(|| {
            "Select Chrome, Edge, or Brave as the default browser before installing the extension."
                .to_string()
        })?;
    let browser_status = Command::new("/usr/bin/open")
        .args(["-a", browser.path.as_str(), "chrome://extensions"])
        .status()
        .map_err(|error| format!("Could not open the browser extension settings: {error}"))?;
    if !browser_status.success() {
        return Err("Could not open the browser extension settings.".to_string());
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn default_browser_open_accessibility_settings() -> Result<(), String> {
    let status = Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .status()
        .map_err(|error| format!("Could not open Accessibility settings: {error}"))?;
    if !status.success() {
        return Err("Could not open Accessibility settings.".to_string());
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn default_browser_enable_safari_automation() -> Result<(), String> {
    let browser = detect_default_browser()
        .filter(|browser| browser.family.as_deref() == Some("safari") && browser.supported)
        .ok_or_else(|| "Safari 27+ is not the current macOS default browser.".to_string())?;
    let driver = safari_driver_path(&browser)
        .ok_or_else(|| "Safari's safaridriver executable is unavailable.".to_string())?;
    let status = Command::new(driver)
        .arg("--enable")
        .status()
        .map_err(|error| format!("Could not enable Safari automation: {error}"))?;
    if !status.success() {
        return Err("Safari automation was not enabled. In Safari, enable Allow remote automation and external agents under Developer settings.".to_string());
    }
    Ok(())
}

pub(crate) fn list_tabs(
    state: &DefaultBrowserBridgeState,
    group_key: &str,
) -> Result<Vec<DefaultBrowserTab>, String> {
    let result = bridge_request(state, "list-tabs", json!({ "groupKey": group_key }))?;
    serde_json::from_value(result)
        .map_err(|_| "The browser returned an invalid tab list.".to_string())
}

pub(crate) fn attach_tab(
    state: &DefaultBrowserBridgeState,
    group_key: &str,
    group_title: &str,
    session_token: &str,
    tab_id: i64,
) -> Result<Value, String> {
    bridge_request(
        state,
        "attach-tab",
        json!({
            "groupKey": group_key,
            "groupTitle": group_title,
            "sessionToken": session_token,
            "tabId": tab_id,
        }),
    )
}

pub(crate) fn focus_group(
    state: &DefaultBrowserBridgeState,
    group_key: &str,
) -> Result<Value, String> {
    bridge_request(state, "focus-group", json!({ "groupKey": group_key }))
}

pub(crate) fn rename_group(
    state: &DefaultBrowserBridgeState,
    group_key: &str,
    group_title: &str,
) -> Result<Value, String> {
    bridge_request(
        state,
        "rename-group",
        json!({ "groupKey": group_key, "groupTitle": group_title }),
    )
}

pub(crate) fn detach_session(
    state: &DefaultBrowserBridgeState,
    session_token: &str,
) -> Result<Value, String> {
    bridge_request(
        state,
        "detach-session",
        json!({ "sessionToken": session_token }),
    )
}

fn bridge_request_with_details(
    socket_path: &Path,
    secret: &str,
    action: &str,
    payload: Value,
) -> Result<Value, String> {
    #[cfg(not(unix))]
    {
        let _ = (socket_path, secret, action, payload);
        return Err("Default-browser control is available only on macOS.".to_string());
    }
    #[cfg(unix)]
    {
        let mut stream = UnixStream::connect(socket_path)
            .map_err(|_| "The browser extension is not connected.".to_string())?;
        stream.set_read_timeout(Some(BRIDGE_TIMEOUT)).ok();
        stream.set_write_timeout(Some(BRIDGE_TIMEOUT)).ok();
        writeln!(stream, "{}", json!({ "role": "client", "secret": secret }))
            .map_err(|error| format!("Could not authenticate with the browser bridge: {error}"))?;
        let id = Uuid::new_v4().simple().to_string();
        let mut request = match payload {
            Value::Object(map) => map,
            _ => serde_json::Map::new(),
        };
        request.insert("id".to_string(), Value::String(id.clone()));
        request.insert("action".to_string(), Value::String(action.to_string()));
        writeln!(stream, "{}", Value::Object(request))
            .map_err(|error| format!("Could not send the browser request: {error}"))?;
        stream.flush().ok();
        let mut response = String::new();
        BufReader::new(stream)
            .read_line(&mut response)
            .map_err(|_| "The browser extension did not respond.".to_string())?;
        let response: Value = serde_json::from_str(response.trim())
            .map_err(|_| "The browser extension returned an invalid response.".to_string())?;
        if response.get("ok").and_then(Value::as_bool) != Some(true) {
            return Err(response
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("The browser request failed.")
                .to_string());
        }
        Ok(response.get("result").cloned().unwrap_or(Value::Null))
    }
}

#[cfg(unix)]
fn start_broker(
    socket_path: PathBuf,
    secret: String,
    extension_connected: Arc<AtomicBool>,
) -> Result<(), String> {
    let listener = UnixListener::bind(&socket_path)
        .map_err(|error| format!("Could not start the browser bridge: {error}"))?;
    fs::set_permissions(&socket_path, fs::Permissions::from_mode(0o600))
        .map_err(|error| format!("Could not secure the browser bridge: {error}"))?;
    let extension_stream: Arc<Mutex<Option<UnixStream>>> = Arc::new(Mutex::new(None));
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let secret = secret.clone();
            let extension_stream = extension_stream.clone();
            let extension_connected = extension_connected.clone();
            std::thread::spawn(move || {
                let mut reader = BufReader::new(stream);
                let mut auth = String::new();
                if reader.read_line(&mut auth).is_err() {
                    return;
                }
                let auth: Value = match serde_json::from_str(auth.trim()) {
                    Ok(value) => value,
                    Err(_) => return,
                };
                if auth.get("secret").and_then(Value::as_str) != Some(secret.as_str()) {
                    return;
                }
                match auth.get("role").and_then(Value::as_str) {
                    Some("extension") => {
                        let stream = reader.into_inner();
                        stream.set_read_timeout(Some(BRIDGE_TIMEOUT)).ok();
                        stream.set_write_timeout(Some(BRIDGE_TIMEOUT)).ok();
                        if let Ok(mut slot) = extension_stream.lock() {
                            *slot = Some(stream);
                            extension_connected.store(true, Ordering::SeqCst);
                        }
                    }
                    Some("client") => {
                        let mut client = reader;
                        let mut raw = String::new();
                        if client.read_line(&mut raw).is_err() {
                            return;
                        }
                        let request: Value = match serde_json::from_str(raw.trim()) {
                            Ok(value) => value,
                            Err(_) => return,
                        };
                        let request_id = request.get("id").and_then(Value::as_str).unwrap_or("");
                        let mut response = None;
                        if let Ok(mut slot) = extension_stream.lock() {
                            if let Some(extension) = slot.as_mut() {
                                if writeln!(extension, "{request}").is_ok()
                                    && extension.flush().is_ok()
                                {
                                    let Ok(extension_clone) = extension.try_clone() else {
                                        *slot = None;
                                        extension_connected.store(false, Ordering::SeqCst);
                                        return;
                                    };
                                    let mut extension_reader = BufReader::new(extension_clone);
                                    for _ in 0..4 {
                                        let mut line = String::new();
                                        if extension_reader.read_line(&mut line).is_err()
                                            || line.is_empty()
                                        {
                                            break;
                                        }
                                        if let Ok(value) =
                                            serde_json::from_str::<Value>(line.trim())
                                        {
                                            if value.get("id").and_then(Value::as_str)
                                                == Some(request_id)
                                            {
                                                response = Some(value);
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                            if response.is_none() {
                                *slot = None;
                                extension_connected.store(false, Ordering::SeqCst);
                            }
                        }
                        let response = response.unwrap_or_else(|| {
                            json!({
                                "id": request_id,
                                "ok": false,
                                "error": "The browser extension is not connected."
                            })
                        });
                        let _ = writeln!(client.get_mut(), "{response}");
                    }
                    _ => {}
                }
            });
        }
    });
    Ok(())
}

#[cfg(unix)]
fn browser_bridge_socket_path() -> PathBuf {
    // macOS limits Unix-domain socket paths to roughly 104 bytes. The system
    // temporary directory can itself be long, so use the stable /tmp alias.
    PathBuf::from("/tmp").join(format!(
        "orchestrator-browser-{}-{}.sock",
        std::process::id(),
        &Uuid::new_v4().simple().to_string()[..8]
    ))
}

fn install_native_host_manifests(
    app: &AppHandle,
    config_path: &Path,
    bridge_dir: &Path,
) -> Result<(), String> {
    let executable = std::env::current_exe()
        .map_err(|error| format!("Could not resolve the Orchestrator executable: {error}"))?;
    let launcher = bridge_dir.join("native-host.sh");
    let script = format!(
        "#!/bin/sh\nexec {} --browser-native-host {}\n",
        shell_quote(&executable.to_string_lossy()),
        shell_quote(&config_path.to_string_lossy())
    );
    fs::write(&launcher, script)
        .map_err(|error| format!("Could not install the browser native host: {error}"))?;
    #[cfg(unix)]
    fs::set_permissions(&launcher, fs::Permissions::from_mode(0o700))
        .map_err(|error| format!("Could not secure the browser native host: {error}"))?;
    let manifest = json!({
        "name": NATIVE_HOST_NAME,
        "description": "Orchestrator default-browser bridge",
        "path": launcher,
        "type": "stdio",
        "allowed_origins": [format!("chrome-extension://{EXTENSION_ID}/")],
    });
    for path in native_host_manifest_paths() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create browser host settings: {error}"))?;
        }
        write_secure_json(&path, &manifest)?;
    }
    // Keep the app handle used so development and packaged paths are both exercised.
    let _ = app;
    Ok(())
}

fn native_host_manifest_paths() -> Vec<PathBuf> {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default();
    [
        "Google/Chrome/NativeMessagingHosts",
        "Microsoft Edge/NativeMessagingHosts",
        "BraveSoftware/Brave-Browser/NativeMessagingHosts",
    ]
    .into_iter()
    .map(|relative| {
        home.join("Library/Application Support")
            .join(relative)
            .join(format!("{NATIVE_HOST_NAME}.json"))
    })
    .collect()
}

fn resolve_extension_path(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Could not resolve Orchestrator resources: {error}"))?;
    for candidate in [
        resource_dir.join("resources/browser-extension"),
        resource_dir.join("browser-extension"),
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap_or(Path::new(env!("CARGO_MANIFEST_DIR")))
            .join("browser-extension"),
    ] {
        if candidate.join("manifest.json").is_file() {
            return Ok(candidate);
        }
    }
    Err("The bundled browser extension is unavailable.".to_string())
}

pub(crate) fn detect_default_browser() -> Option<DefaultBrowserInfo> {
    #[cfg(not(target_os = "macos"))]
    return None;
    #[cfg(target_os = "macos")]
    {
        let script = r#"ObjC.import('AppKit'); const u=$.NSURL.URLWithString('https://example.com'); const a=$.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL(u); const b=$.NSBundle.bundleWithURL(a); JSON.stringify({path:ObjC.unwrap(a.path),bundleId:ObjC.unwrap(b.bundleIdentifier),name:ObjC.unwrap(b.objectForInfoDictionaryKey('CFBundleDisplayName') || b.objectForInfoDictionaryKey('CFBundleName'))})"#;
        let output = Command::new("/usr/bin/osascript")
            .args(["-l", "JavaScript", "-e", script])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let value: Value = serde_json::from_slice(&output.stdout).ok()?;
        let bundle_id = value.get("bundleId")?.as_str()?.to_string();
        let family = browser_family(&bundle_id);
        let application_path = value.get("path")?.as_str()?.to_string();
        let supported = family.as_deref().is_some_and(|family| {
            family != "safari" || safari_major_version(&application_path) >= Some(27)
        });
        Some(DefaultBrowserInfo {
            supported,
            family,
            name: value.get("name")?.as_str()?.to_string(),
            path: application_path,
            bundle_id,
        })
    }
}

fn browser_family(bundle_id: &str) -> Option<String> {
    match bundle_id {
        "com.google.Chrome" => Some("chrome".to_string()),
        "com.microsoft.edgemac" => Some("edge".to_string()),
        "com.brave.Browser" => Some("brave".to_string()),
        "com.apple.Safari" | "com.apple.SafariTechnologyPreview" => Some("safari".to_string()),
        _ => None,
    }
}

fn safari_major_version(application_path: &str) -> Option<u64> {
    let output = Command::new("/usr/libexec/PlistBuddy")
        .args(["-c", "Print :CFBundleShortVersionString"])
        .arg(Path::new(application_path).join("Contents/Info.plist"))
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .split('.')
        .next()?
        .parse()
        .ok()
}

pub(crate) fn safari_driver_path(browser: &DefaultBrowserInfo) -> Option<PathBuf> {
    if browser.bundle_id == "com.apple.Safari" {
        let system = PathBuf::from("/usr/bin/safaridriver");
        return system.is_file().then_some(system);
    }
    let bundled = Path::new(&browser.path).join("Contents/MacOS/safaridriver");
    bundled.is_file().then_some(bundled)
}

#[cfg(target_os = "macos")]
fn accessibility_is_trusted() -> bool {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }
    unsafe { AXIsProcessTrusted() }
}

#[cfg(not(target_os = "macos"))]
fn accessibility_is_trusted() -> bool {
    false
}

fn write_secure_json(path: &Path, value: &Value) -> Result<(), String> {
    fs::write(path, serde_json::to_vec_pretty(value).unwrap())
        .map_err(|error| format!("Could not write {}: {error}", path.display()))?;
    #[cfg(unix)]
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|error| format!("Could not secure {}: {error}", path.display()))?;
    Ok(())
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

pub fn run_native_messaging_host(config_path: &Path) -> Result<(), String> {
    #[cfg(not(unix))]
    {
        let _ = config_path;
        return Err("The native browser host is available only on macOS.".to_string());
    }
    #[cfg(unix)]
    {
        let config: BridgeConfig = serde_json::from_slice(
            &fs::read(config_path)
                .map_err(|error| format!("Could not read browser host configuration: {error}"))?,
        )
        .map_err(|_| "The browser host configuration is invalid.".to_string())?;
        if config.version != BRIDGE_PROTOCOL_VERSION || config.secret.len() != 32 {
            return Err("The browser host configuration is incompatible.".to_string());
        }
        let mut socket = UnixStream::connect(&config.socket_path)
            .map_err(|error| format!("Could not connect to Orchestrator: {error}"))?;
        writeln!(
            socket,
            "{}",
            json!({ "role": "extension", "secret": config.secret })
        )
        .map_err(|error| format!("Could not authenticate the browser host: {error}"))?;
        socket.flush().ok();

        let mut socket_reader = socket
            .try_clone()
            .map(BufReader::new)
            .map_err(|error| format!("Could not initialize browser host input: {error}"))?;
        let writer = std::thread::spawn(move || -> Result<(), String> {
            let stdout = std::io::stdout();
            let mut stdout = stdout.lock();
            loop {
                let mut line = String::new();
                let read = socket_reader
                    .read_line(&mut line)
                    .map_err(|error| format!("Could not read browser bridge output: {error}"))?;
                if read == 0 {
                    return Ok(());
                }
                let bytes = line.trim_end().as_bytes();
                let length = u32::try_from(bytes.len())
                    .map_err(|_| "Browser bridge response was too large.".to_string())?;
                stdout
                    .write_all(&length.to_le_bytes())
                    .map_err(|e| e.to_string())?;
                stdout.write_all(bytes).map_err(|e| e.to_string())?;
                stdout.flush().map_err(|e| e.to_string())?;
            }
        });

        let stdin = std::io::stdin();
        let mut stdin = stdin.lock();
        loop {
            let mut length = [0_u8; 4];
            if stdin.read_exact(&mut length).is_err() {
                break;
            }
            let length = u32::from_le_bytes(length) as usize;
            if length == 0 || length > 1_048_576 {
                return Err("Browser extension message size is invalid.".to_string());
            }
            let mut message = vec![0_u8; length];
            stdin.read_exact(&mut message).map_err(|e| e.to_string())?;
            socket.write_all(&message).map_err(|e| e.to_string())?;
            socket.write_all(b"\n").map_err(|e| e.to_string())?;
            socket.flush().map_err(|e| e.to_string())?;
        }
        drop(socket);
        let _ = writer.join();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    #[test]
    fn browser_family_detection_covers_supported_browsers() {
        assert_eq!(
            browser_family("com.google.Chrome").as_deref(),
            Some("chrome")
        );
        assert_eq!(
            browser_family("com.apple.Safari").as_deref(),
            Some("safari")
        );
        assert_eq!(browser_family("org.mozilla.firefox"), None);
    }

    #[test]
    fn native_host_manifest_paths_cover_supported_browsers() {
        let paths = native_host_manifest_paths();
        assert_eq!(paths.len(), 3);
        assert!(paths
            .iter()
            .all(|path| path.ends_with(format!("{NATIVE_HOST_NAME}.json"))));
    }

    #[cfg(unix)]
    #[test]
    fn authenticated_broker_relays_one_scoped_extension_request() {
        let socket_path = browser_bridge_socket_path();
        let secret = Uuid::new_v4().simple().to_string();
        let connected = Arc::new(AtomicBool::new(false));
        start_broker(socket_path.clone(), secret.clone(), connected.clone())
            .expect("starts test broker");

        let extension_socket = socket_path.clone();
        let extension_secret = secret.clone();
        let extension = std::thread::spawn(move || {
            let mut stream = UnixStream::connect(extension_socket).expect("connects extension");
            writeln!(
                stream,
                "{}",
                json!({ "role": "extension", "secret": extension_secret })
            )
            .expect("authenticates extension");
            stream.flush().expect("flushes extension authentication");
            let mut reader = BufReader::new(stream.try_clone().expect("clones extension stream"));
            let mut request = String::new();
            reader
                .read_line(&mut request)
                .expect("reads broker request");
            let request: Value = serde_json::from_str(request.trim()).expect("valid request");
            writeln!(
                stream,
                "{}",
                json!({
                    "id": request.get("id").cloned().unwrap_or(Value::Null),
                    "ok": true,
                    "result": { "version": 1 }
                })
            )
            .expect("writes broker response");
            stream.flush().expect("flushes broker response");
        });

        for _ in 0..50 {
            if connected.load(Ordering::SeqCst) {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(connected.load(Ordering::SeqCst));
        let result = bridge_request_with_details(&socket_path, &secret, "ping", json!({}))
            .expect("relays broker request");
        assert_eq!(result, json!({ "version": 1 }));
        extension.join().expect("extension thread completes");
        let _ = fs::remove_file(socket_path);
    }
}
