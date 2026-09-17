//! Host-scoped GitLab CLI adapter. No secrets cross the status API or enter SQLite.
use crate::{github_cli::GithubPullRequest, DatabaseState};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};

const GLAB_VERSION: &str = "1.117.0";
const COMMAND_TIMEOUT: Duration = Duration::from_secs(45);
static RUNTIME: OnceLock<Result<PathBuf, String>> = OnceLock::new();

#[derive(Default)]
pub(crate) struct GitlabState {
    logins: Mutex<HashMap<String, Arc<AtomicBool>>>,
    errors: Mutex<HashMap<String, String>>,
    locks: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    checked: Mutex<HashMap<String, Instant>>,
}
impl GitlabState {
    fn host_lock(&self, host: &str) -> Arc<tokio::sync::Mutex<()>> {
        self.locks
            .lock()
            .unwrap()
            .entry(host.to_string())
            .or_default()
            .clone()
    }
}
impl Drop for GitlabState {
    fn drop(&mut self) {
        for cancelled in self.logins.lock().unwrap().values() {
            cancelled.store(true, Ordering::SeqCst);
        }
    }
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitlabConnectionStatus {
    pub host: String,
    pub available: bool,
    pub connected: bool,
    pub login: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub status: String,
    pub message: Option<String>,
    pub cli_version: Option<String>,
}

#[derive(Clone)]
struct Runtime {
    executable: PathBuf,
    config_dir: PathBuf,
    host: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    version: u32,
    architecture: String,
    glab_version: String,
    executable: String,
    executable_sha256: String,
}

pub(crate) fn normalize_host(value: &str) -> Result<String, String> {
    let value = value.trim();
    let url = url::Url::parse(&if value.contains("://") {
        value.to_string()
    } else {
        format!("https://{value}")
    })
    .map_err(|_| "Enter a GitLab hostname, optionally with an HTTPS port.".to_string())?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || url.host_str().is_none()
        || value.contains(['\\', '\n', '\r'])
    {
        return Err("Use an HTTPS GitLab host without credentials or a subpath.".to_string());
    }
    let hostname = url.host_str().unwrap().to_ascii_lowercase();
    if hostname.ends_with('.') || hostname.is_empty() {
        return Err("Enter a valid GitLab hostname.".into());
    }
    Ok(match url.port() {
        Some(port) => format!("{hostname}:{port}"),
        None => hostname,
    })
}

fn executable(app: &AppHandle) -> Result<PathBuf, String> {
    RUNTIME.get_or_init(|| {
        let arch = if cfg!(target_arch = "aarch64") { "arm64" } else if cfg!(target_arch = "x86_64") { "x64" } else { return Err("GitLab CLI does not support this architecture.".into()); };
        let resource = app.path().resource_dir().map_err(|e| e.to_string())?;
        let mut roots = vec![resource.join("resources/gitlab-cli"), resource.join("gitlab-cli")];
        if tauri::is_dev() { roots.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/gitlab-cli")); }
        let root = roots.into_iter().map(|p| p.join(format!("darwin-{arch}")))
            .find(|p| p.join("runtime.json").is_file()).ok_or("The bundled GitLab CLI is unavailable. Run npm run prepare:gitlab-cli-runtime and rebuild Orchestrator.")?;
        let manifest: Manifest = serde_json::from_slice(&fs::read(root.join("runtime.json")).map_err(|_| "Cannot read GitLab CLI manifest.")?).map_err(|_| "Invalid GitLab CLI manifest.")?;
        if manifest.version != 1 || manifest.architecture != arch || manifest.glab_version != GLAB_VERSION || manifest.executable != "bin/glab" { return Err("GitLab CLI does not match this build.".into()); }
        let binary = root.join(&manifest.executable).canonicalize().map_err(|_| "GitLab CLI is missing.")?;
        if !binary.starts_with(root.canonicalize().map_err(|_| "Invalid GitLab CLI directory.")?) || !binary.is_file() { return Err("Unsafe GitLab CLI executable path.".into()); }
        let hash = format!("{:x}", Sha256::digest(fs::read(&binary).map_err(|_| "Cannot verify GitLab CLI.")?));
        if hash != manifest.executable_sha256 { return Err("GitLab CLI failed its integrity check. Rebuild Orchestrator.".into()); }
        Ok(binary)
    }).clone()
}
fn runtime(app: &AppHandle, host: &str) -> Result<Runtime, String> {
    let host = normalize_host(host)?;
    let config_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("gitlab-cli")
        .join(format!("{:x}", Sha256::digest(host.as_bytes())));
    fs::create_dir_all(&config_dir).map_err(|_| "Could not create GitLab configuration.")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&config_dir, fs::Permissions::from_mode(0o700))
            .map_err(|_| "Could not secure GitLab configuration.")?;
    }
    Ok(Runtime {
        executable: executable(app)?,
        config_dir,
        host,
    })
}

fn isolate(command: &mut Command, runtime: &Runtime) {
    // Never inherit a CI identity, token, alternate API host, or debugging that logs headers.
    for (key, _) in std::env::vars_os() {
        let name = key.to_string_lossy();
        if name.starts_with("GITLAB_")
            || name.starts_with("GLAB_")
            || name.starts_with("CI_")
            || name.starts_with("GIT_CONFIG_")
            || matches!(
                name.as_ref(),
                "CI" | "OAUTH_TOKEN"
                    | "DEBUG"
                    | "GIT_TRACE"
                    | "GIT_TRACE_CURL"
                    | "GIT_CURL_VERBOSE"
                    | "GIT_SSL_NO_VERIFY"
                    | "GIT_ASKPASS"
                    | "SSH_ASKPASS"
            )
        {
            command.env_remove(key);
        }
    }
    for key in [
        "GITLAB_TOKEN",
        "GITLAB_ACCESS_TOKEN",
        "OAUTH_TOKEN",
        "CI_JOB_TOKEN",
        "CI",
        "GITLAB_CI",
        "GLAB_DEBUG_HTTP",
    ] {
        command.env_remove(key);
    }
    command
        .current_dir(&runtime.config_dir)
        .env("GLAB_CONFIG_DIR", &runtime.config_dir)
        .env("GITLAB_HOST", &runtime.host)
        .env("GLAB_CHECK_UPDATE", "false")
        .env("GLAB_SEND_TELEMETRY", "false")
        .env("GLAB_ENABLE_CI_AUTOLOGIN", "false")
        .env("NO_COLOR", "1")
        .env("PAGER", "cat")
        .env("GIT_TERMINAL_PROMPT", "0");
}
fn command(runtime: &Runtime, args: &[&str]) -> Command {
    let mut c = Command::new(&runtime.executable);
    isolate(&mut c, runtime);
    c.args(args);
    c
}
struct Output {
    code: Option<i32>,
    stdout: String,
}
fn capture(
    mut c: Command,
    input: Option<&str>,
    timeout: Duration,
    cancelled: Option<&AtomicBool>,
) -> Result<Output, String> {
    c.stdin(if input.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    })
    .stdout(Stdio::piped())
    .stderr(Stdio::null());
    let mut child = c
        .spawn()
        .map_err(|_| "GitLab operation could not be started.".to_string())?;
    let mut reader = child.stdout.take().ok_or("Could not read GitLab output.")?;
    let output = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = (&mut reader)
            .take(2 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes);
        // Drain excessive output so the child cannot block on its pipe.
        let _ = std::io::copy(&mut reader, &mut std::io::sink());
        result.map(|_| bytes)
    });
    if let (Some(input), Some(mut writer)) = (input, child.stdin.take()) {
        if writer.write_all(input.as_bytes()).is_err() {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Could not send input to GitLab CLI.".into());
        }
    }
    let start = Instant::now();
    let status = loop {
        if cancelled.is_some_and(|c| c.load(Ordering::SeqCst)) || start.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            let _ = output.join();
            return Err(if start.elapsed() >= timeout {
                "GitLab operation timed out. Try again."
            } else {
                "GitLab sign-in cancelled."
            }
            .into());
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("GitLab operation stopped unexpectedly.".into());
            }
        }
    };
    let bytes = output
        .join()
        .map_err(|_| "Could not read GitLab output.")?
        .map_err(|_| "Could not read GitLab output.")?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("GitLab returned too much output.".into());
    }
    Ok(Output {
        code: status.code(),
        stdout: String::from_utf8_lossy(&bytes).trim().to_string(),
    })
}
fn api_blocking(runtime: &Runtime, endpoint: &str, body: Option<Value>) -> Result<Value, String> {
    api_blocking_with_cancel(runtime, endpoint, body, None)
}
fn api_blocking_with_cancel(
    runtime: &Runtime,
    endpoint: &str,
    body: Option<Value>,
    cancelled: Option<&AtomicBool>,
) -> Result<Value, String> {
    let mut c = command(runtime, &["api", "--hostname", &runtime.host, endpoint]);
    let input = body.map(|v| v.to_string());
    if input.is_some() {
        c.args(["--method", "POST", "--input", "-"]);
    }
    let result = capture(c, input.as_deref(), COMMAND_TIMEOUT, cancelled)?;
    if result.code != Some(0) {
        return Err(format!("GitLab request to {} failed. Check your connection, token permissions, and project access.", runtime.host));
    }
    serde_json::from_str(&result.stdout).map_err(|_| "GitLab returned invalid JSON.".into())
}
async fn api(
    app: &AppHandle,
    host: &str,
    endpoint: String,
    body: Option<Value>,
) -> Result<Value, String> {
    let lock = app.state::<GitlabState>().host_lock(host);
    let _guard = lock.lock().await;
    if !connected(app, host).await {
        return Err(format!(
            "Connect GitLab host {host} in Settings to continue."
        ));
    }
    let runtime = runtime(app, host)?;
    tauri::async_runtime::spawn_blocking(move || api_blocking(&runtime, &endpoint, body))
        .await
        .map_err(|_| "GitLab request stopped unexpectedly.".to_string())?
}

pub(crate) async fn configured_hosts(app: &AppHandle) -> Result<Vec<String>, String> {
    let mut db = app.state::<DatabaseState>().acquire().await?;
    sqlx::query_scalar("SELECT host FROM gitlab_connections ORDER BY host")
        .fetch_all(&mut *db)
        .await
        .map_err(|e| e.to_string())
}
pub(crate) async fn connected(app: &AppHandle, host: &str) -> bool {
    if executable(app).is_err() {
        return false;
    }
    let Ok(mut db) = app.state::<DatabaseState>().acquire().await else {
        return false;
    };
    sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM gitlab_connections WHERE host = ?1 AND status = 'connected'",
    )
    .bind(host)
    .fetch_one(&mut *db)
    .await
    .unwrap_or(0)
        > 0
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn gitlab_connections(
    app: AppHandle,
) -> Result<Vec<GitlabConnectionStatus>, String> {
    let runtime_error = executable(&app).err();
    let mut db = app.state::<DatabaseState>().acquire().await?;
    let rows = sqlx::query("SELECT host, login, display_name, avatar_url, status FROM gitlab_connections ORDER BY host").fetch_all(&mut *db).await.map_err(|e| e.to_string())?;
    drop(db);
    let state = app.state::<GitlabState>();
    let mut connections = Vec::new();
    for row in rows {
        let host: String = row.get("host");
        let connecting = state.logins.lock().unwrap().contains_key(&host);
        let error = state.errors.lock().unwrap().get(&host).cloned();
        let status: String = row.get("status");
        // Probe hosts independently in the background; a slow/offline server
        // must not delay the connection list or another server's status.
        if !connecting
            && runtime_error.is_none()
            && status != "disconnected"
            && row.get::<Option<String>, _>("login").is_some()
        {
            let due = state
                .checked
                .lock()
                .unwrap()
                .get(&host)
                .is_none_or(|at| at.elapsed() >= Duration::from_secs(30));
            if due {
                let lock = state.host_lock(&host);
                if let Ok(guard) = lock.try_lock_owned() {
                    state
                        .checked
                        .lock()
                        .unwrap()
                        .insert(host.clone(), Instant::now());
                    let probe_app = app.clone();
                    let probe_host = host.clone();
                    tauri::async_runtime::spawn(async move {
                        let _guard = guard;
                        let result = match runtime(&probe_app, &probe_host) {
                            Ok(runtime) => tauri::async_runtime::spawn_blocking(move || {
                                api_blocking(&runtime, "user", None)
                            })
                            .await
                            .ok()
                            .and_then(Result::ok),
                            Err(_) => None,
                        };
                        let state = probe_app.state::<GitlabState>();
                        let status = if result.is_some() {
                            state.errors.lock().unwrap().remove(&probe_host);
                            "connected"
                        } else {
                            state.errors.lock().unwrap().insert(probe_host.clone(), format!("Could not verify {probe_host}. Check connectivity or reconnect with a valid token."));
                            "reconnect_required"
                        };
                        if let Ok(mut db) = probe_app.state::<DatabaseState>().acquire().await {
                            let _ = sqlx::query(
                                "UPDATE gitlab_connections SET status=?2 WHERE host=?1",
                            )
                            .bind(probe_host)
                            .bind(status)
                            .execute(&mut *db)
                            .await;
                        }
                    });
                }
            }
        }
        connections.push(GitlabConnectionStatus {
            host,
            available: runtime_error.is_none(),
            connected: status == "connected" && !connecting && runtime_error.is_none(),
            login: row.get("login"),
            display_name: row.get("display_name"),
            avatar_url: row.get("avatar_url"),
            status: if runtime_error.is_some() {
                "unavailable".into()
            } else if connecting {
                "connecting".into()
            } else {
                status
            },
            message: runtime_error.clone().or(error),
            cli_version: runtime_error.is_none().then(|| GLAB_VERSION.into()),
        });
    }
    if connections.is_empty() {
        connections.push(GitlabConnectionStatus {
            host: "gitlab.com".into(),
            available: runtime_error.is_none(),
            connected: false,
            login: None,
            display_name: None,
            avatar_url: None,
            status: if runtime_error.is_some() {
                "unavailable"
            } else {
                "disconnected"
            }
            .into(),
            message: runtime_error,
            cli_version: Some(GLAB_VERSION.into()),
        });
    }
    Ok(connections)
}

fn require_keychain() -> Result<(), String> {
    // glab otherwise falls back to plaintext. Refuse login when Keychain is unavailable.
    #[cfg(target_os = "macos")]
    {
        let service = format!("com.orchestrator.gitlab.probe.{}", uuid::Uuid::new_v4());
        let result = Command::new("/usr/bin/security")
            .args([
                "add-generic-password",
                "-s",
                &service,
                "-a",
                "probe",
                "-w",
                "1",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = Command::new("/usr/bin/security")
            .args(["delete-generic-password", "-s", &service, "-a", "probe"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if result.is_ok_and(|r| r.success()) {
            return Ok(());
        }
    }
    Err("Unlock the macOS Keychain before connecting GitLab. Credentials will not be saved in plaintext.".into())
}
fn ensure_keychain_storage(runtime: &Runtime) -> Result<(), String> {
    let value = capture(
        command(
            runtime,
            &["config", "get", "use_keyring", "--host", &runtime.host],
        ),
        None,
        Duration::from_secs(5),
        None,
    )?;
    if value.code == Some(0) && value.stdout == "true" {
        return Ok(());
    }
    // Remove any file produced by glab's fallback; never retain a plaintext token.
    let _ = fs::remove_file(runtime.config_dir.join("config.yml"));
    Err("GitLab could not store credentials in Keychain. Unlock Keychain and reconnect.".into())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn gitlab_connect(
    app: AppHandle,
    host: String,
    token: Option<String>,
) -> Result<(), String> {
    let host = normalize_host(&host)?;
    if token.is_none() && host != "gitlab.com" {
        return Err("Use a personal access token for self-managed GitLab.".into());
    }
    if token
        .as_ref()
        .is_some_and(|t| t.trim().is_empty() || t.contains(['\n', '\r']))
    {
        return Err("Enter a valid personal access token.".into());
    }
    let runtime = runtime(&app, &host)?;
    let state = app.state::<GitlabState>();
    let lock = state.host_lock(&host);
    let guard = lock
        .try_lock_owned()
        .map_err(|_| "A GitLab operation is already active for this host.".to_string())?;
    let mut db = app.state::<DatabaseState>().acquire().await?;
    let cancelled = Arc::new(AtomicBool::new(false));
    state
        .logins
        .lock()
        .unwrap()
        .insert(host.clone(), cancelled.clone());
    state.errors.lock().unwrap().remove(&host);
    if let Err(error) =
        sqlx::query("INSERT INTO gitlab_connections(host) VALUES (?1) ON CONFLICT(host) DO NOTHING")
            .bind(&host)
            .execute(&mut *db)
            .await
    {
        state.logins.lock().unwrap().remove(&host);
        return Err(error.to_string());
    }
    drop(db);
    let task_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _guard = guard;
        let stop = cancelled.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            require_keychain()?;
            let mut c = command(
                &runtime,
                &[
                    "auth",
                    "login",
                    "--hostname",
                    &runtime.host,
                    "--api-host",
                    &runtime.host,
                    "--api-protocol",
                    "https",
                    "--git-protocol",
                    "https",
                    "--ssh-hostname",
                    &runtime.host,
                    "--container-registry-domains",
                    &runtime.host,
                ],
            );
            c.env("BROWSER", "/usr/bin/open")
                .env("GLAB_BROWSER", "/usr/bin/open");
            c.arg(if token.is_some() { "--stdin" } else { "--web" });
            let result = capture(c, token.as_deref(), Duration::from_secs(600), Some(&stop));
            let storage = ensure_keychain_storage(&runtime);
            let output = result?;
            storage?;
            if output.code != Some(0) {
                return Err(
                    "GitLab sign-in failed. Check your token or try browser sign-in again.".into(),
                );
            }
            api_blocking_with_cancel(&runtime, "user", None, Some(&stop))
        })
        .await
        .unwrap_or_else(|_| Err("GitLab sign-in stopped unexpectedly.".into()));
        let state = task_app.state::<GitlabState>();
        if !cancelled.load(Ordering::SeqCst) {
            match result {
                Ok(user) => {
                    state
                        .checked
                        .lock()
                        .unwrap()
                        .insert(host.clone(), Instant::now());
                    if let Ok(mut db) = task_app.state::<DatabaseState>().acquire().await {
                        let saved = sqlx::query("UPDATE gitlab_connections SET login=?2, display_name=?3, avatar_url=?4, status='connected', updated_at=CURRENT_TIMESTAMP WHERE host=?1")
                            .bind(&host).bind(user["username"].as_str()).bind(user["name"].as_str()).bind(user["avatar_url"].as_str()).execute(&mut *db).await;
                        if saved.is_err() {
                            state.errors.lock().unwrap().insert(
                                host.clone(),
                                "GitLab connection could not be saved. Reconnect to try again."
                                    .into(),
                            );
                        }
                    }
                }
                Err(error) => {
                    state.errors.lock().unwrap().insert(host.clone(), error);
                    if let Ok(mut db) = task_app.state::<DatabaseState>().acquire().await {
                        let _ = sqlx::query("UPDATE gitlab_connections SET status='reconnect_required' WHERE host=?1").bind(&host).execute(&mut *db).await;
                    }
                }
            }
        }
        if cancelled.load(Ordering::SeqCst) {
            if let Ok(runtime) = self::runtime(&task_app, &host) {
                let _ = tauri::async_runtime::spawn_blocking(move || {
                    capture(
                        command(&runtime, &["auth", "logout", "--hostname", &runtime.host]),
                        None,
                        COMMAND_TIMEOUT,
                        None,
                    )
                })
                .await;
            }
            if let Ok(mut db) = task_app.state::<DatabaseState>().acquire().await {
                let _ = sqlx::query("UPDATE gitlab_connections SET status='disconnected', login=NULL, display_name=NULL, avatar_url=NULL WHERE host=?1").bind(&host).execute(&mut *db).await;
            }
        }
        state.logins.lock().unwrap().remove(&host);
    });
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn gitlab_cancel_connection(
    state: State<'_, GitlabState>,
    host: String,
) -> Result<(), String> {
    let host = normalize_host(&host)?;
    if let Some(cancelled) = state.logins.lock().unwrap().get(&host) {
        cancelled.store(true, Ordering::SeqCst);
    }
    Ok(())
}
#[tauri::command]
#[specta::specta]
pub(crate) async fn gitlab_disconnect(app: AppHandle, host: String) -> Result<(), String> {
    let host = normalize_host(&host)?;
    let state = app.state::<GitlabState>();
    if let Some(cancelled) = state.logins.lock().unwrap().get(&host) {
        cancelled.store(true, Ordering::SeqCst);
    }
    let lock = state.host_lock(&host);
    let _guard = lock.lock().await;
    let mut db = app.state::<DatabaseState>().acquire().await?;
    let inactive: bool = sqlx::query_scalar("SELECT NOT EXISTS(SELECT 1 FROM gitlab_connections WHERE host=?1 AND status != 'disconnected')").bind(&host).fetch_one(&mut *db).await.map_err(|e| e.to_string())?;
    drop(db);
    if inactive {
        return Ok(());
    }
    let runtime = runtime(&app, &host)?;
    tauri::async_runtime::spawn_blocking(move || {
        let output = capture(
            command(&runtime, &["auth", "logout", "--hostname", &runtime.host]),
            None,
            COMMAND_TIMEOUT,
            None,
        )?;
        if output.code != Some(0) {
            return Err("GitLab could not be disconnected. Try again.".to_string());
        }
        Ok(())
    })
    .await
    .map_err(|_| "GitLab disconnect stopped unexpectedly.".to_string())??;
    let mut db = app.state::<DatabaseState>().acquire().await?;
    sqlx::query("UPDATE gitlab_connections SET status='disconnected', login=NULL, display_name=NULL, avatar_url=NULL WHERE host=?1").bind(&host).execute(&mut *db).await.map_err(|e| e.to_string())?;
    state.errors.lock().unwrap().remove(&host);
    Ok(())
}

pub(crate) fn encode_project(path: &str) -> String {
    url::form_urlencoded::byte_serialize(path.as_bytes()).collect()
}
pub(crate) async fn ensure_repository_access(
    app: &AppHandle,
    host: &str,
    path: &str,
) -> Result<i64, String> {
    if !connected(app, host).await {
        return Err(format!(
            "Connect GitLab host {host} in Settings to publish this card."
        ));
    }
    let project = api(
        app,
        host,
        format!("projects/{}", encode_project(path)),
        None,
    )
    .await?;
    project["id"]
        .as_i64()
        .ok_or("GitLab returned an invalid project ID.".into())
}
fn merge_request(value: &Value) -> Result<GithubPullRequest, String> {
    let state = match value["state"].as_str() {
        Some("opened" | "locked") => "open",
        Some("closed") => "closed",
        Some("merged") => "merged",
        _ => return Err("GitLab returned an invalid merge request state.".into()),
    };
    Ok(GithubPullRequest {
        number: value["iid"]
            .as_i64()
            .ok_or("GitLab returned an invalid merge request number.")?,
        url: value["web_url"]
            .as_str()
            .ok_or("GitLab returned an invalid merge request URL.")?
            .into(),
        state: state.into(),
        draft: value["draft"]
            .as_bool()
            .or(value["work_in_progress"].as_bool())
            .unwrap_or(false),
        merged_at: value["merged_at"]
            .as_str()
            .map(str::to_string)
            .or_else(|| (state == "merged").then(|| "merged".into())),
    })
}
pub(crate) async fn find_merge_request(
    app: &AppHandle,
    host: &str,
    project: i64,
    head: &str,
    base: &str,
) -> Result<Option<GithubPullRequest>, String> {
    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("scope", "all")
        .append_pair("state", "all")
        .append_pair("source_branch", head)
        .append_pair("target_branch", base)
        .append_pair("order_by", "created_at")
        .append_pair("sort", "desc")
        .append_pair("per_page", "100")
        .finish();
    let value = api(
        app,
        host,
        format!("projects/{project}/merge_requests?{query}"),
        None,
    )
    .await?;
    let items = value
        .as_array()
        .ok_or("GitLab returned invalid merge request data.")?;
    // Exclude fork-based requests with a coincidentally identical source branch.
    items
        .iter()
        .find(|v| {
            v["source_project_id"].as_i64() == Some(project)
                && v["target_project_id"].as_i64() == Some(project)
        })
        .map(merge_request)
        .transpose()
}
pub(crate) async fn create_merge_request(
    app: &AppHandle,
    host: &str,
    project: i64,
    head: &str,
    base: &str,
    title: &str,
    body: &str,
) -> Result<GithubPullRequest, String> {
    let value = api(app, host, format!("projects/{project}/merge_requests"), Some(json!({"source_branch":head,"target_branch":base,"title":format!("Draft: {title}"),"description":body}))).await?;
    merge_request(&value)
}
pub(crate) async fn view_merge_request(
    app: &AppHandle,
    host: &str,
    project: i64,
    number: i64,
) -> Result<GithubPullRequest, String> {
    merge_request(
        &api(
            app,
            host,
            format!("projects/{project}/merge_requests/{number}"),
            None,
        )
        .await?,
    )
}

fn quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}
fn credential_script(runtime: &Runtime) -> String {
    format!("#!/bin/sh\n[ \"$1\" = get ] || exit 0\nprotocol=\nhost=\nwhile IFS='=' read -r key value; do\n case \"$key\" in protocol) protocol=$value;; host) host=$value;; esac\ndone\n[ \"$protocol\" = https ] && [ \"$host\" = {} ] || exit 0\ntoken=$({} config get token --host {}) || exit 1\nprintf 'username=oauth2\\npassword=%s\\n' \"$token\"\n", quote(&runtime.host), quote(&runtime.executable.to_string_lossy()), quote(&runtime.host))
}

pub(crate) async fn push_ref(
    app: &AppHandle,
    host: &str,
    project_path: &str,
    worktree: &Path,
    source: &str,
    branch: &str,
    ensure_base: bool,
) -> Result<(), String> {
    let runtime = runtime(app, host)?;
    let worktree = worktree.to_path_buf();
    let path = project_path.to_string();
    let source = source.to_string();
    let branch = branch.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        // Always push over authenticated HTTPS, including origins using SSH. No SSH key setup is required.
        let helper = runtime.config_dir.join(format!("credential-{}.sh", uuid::Uuid::new_v4()));
        let script = credential_script(&runtime);
        fs::write(&helper, script).map_err(|_| "Could not create GitLab credential helper.")?;
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&helper, fs::Permissions::from_mode(0o700)).map_err(|_| "Could not secure GitLab credential helper.")?; }
        let result = (|| {
            let destination = format!("https://{}/{path}.git", runtime.host);
            let remote_ref = format!("refs/heads/{branch}");
            let git = || { let mut c = Command::new("git"); isolate(&mut c, &runtime); c.arg("-C").arg(&worktree).args(["-c", "credential.helper=", "-c"]).arg(format!("credential.helper=!{}", quote(&helper.to_string_lossy()))).args(["-c", "http.followRedirects=false"]); c };
            if ensure_base {
                let mut c = git(); c.args(["ls-remote", "--exit-code", "--heads", &destination, &remote_ref]);
                let output = capture(c, None, COMMAND_TIMEOUT, None)?;
                if output.code == Some(0) { return Ok(()); }
                if output.code != Some(2) { return Err("GitLab base branch could not be checked.".to_string()); }
            }
            let mut c = git(); c.args(["push", "--porcelain", &destination, &format!("{source}:{remote_ref}")]);
            let output = capture(c, None, COMMAND_TIMEOUT, None)?;
            if output.code == Some(0) { Ok(()) } else { Err("GitLab rejected the branch push. Check token permissions and branch protection.".into()) }
        })();
        let _ = fs::remove_file(helper); result
    }).await.map_err(|_| "GitLab push stopped unexpectedly.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hosts_are_canonical_https_origins() {
        assert_eq!(
            normalize_host("https://GitLab.Example:8443/").unwrap(),
            "gitlab.example:8443"
        );
        assert_eq!(normalize_host("GITLAB.COM:443").unwrap(), "gitlab.com");
        for host in [
            "http://gitlab.com",
            "gitlab.com/path",
            "https://token@gitlab.com",
            "gitlab.com?token=secret",
            "gitlab.com#x",
            "gitlab.com.",
            "",
        ] {
            assert!(normalize_host(host).is_err(), "{host}");
        }
    }
    #[test]
    fn nested_projects_and_states() {
        assert_eq!(encode_project("team/sub/project"), "team%2Fsub%2Fproject");
        for (state, expected) in [
            ("opened", "open"),
            ("locked", "open"),
            ("closed", "closed"),
            ("merged", "merged"),
        ] {
            let request = merge_request(&json!({"iid":7,"web_url":"https://gitlab.com/g/p/-/merge_requests/7","state":state,"draft":true})).unwrap();
            assert_eq!(request.state, expected);
            assert!(request.draft);
            assert_eq!(request.merged_at.is_some(), state == "merged");
        }
    }
    #[test]
    fn command_selects_only_its_own_host_and_config() {
        let runtime = Runtime {
            executable: "/bin/echo".into(),
            config_dir: "/tmp/orchestrator-gitlab-test".into(),
            host: "gitlab.example:8443".into(),
        };
        let c = command(&runtime, &["api", "user"]);
        let env: HashMap<_, _> = c.get_envs().collect();
        assert_eq!(
            env.get(std::ffi::OsStr::new("GITLAB_HOST")),
            Some(&Some(std::ffi::OsStr::new("gitlab.example:8443")))
        );
        assert_eq!(
            env.get(std::ffi::OsStr::new("GLAB_CONFIG_DIR")),
            Some(&Some(runtime.config_dir.as_os_str()))
        );
    }
}

#[cfg(test)]
mod process_tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    fn fixture(script: &str) -> Runtime {
        let root =
            std::env::temp_dir().join(format!("orchestrator gitlab {}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let executable = root.join("mock glab");
        fs::write(&executable, format!("#!/bin/sh\n{script}\n")).unwrap();
        fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).unwrap();
        Runtime {
            executable,
            config_dir: root,
            host: "code.example:8443".into(),
        }
    }
    #[test]
    fn api_preserves_json_body_and_discards_secret_diagnostics() {
        let runtime = fixture("cat > input.json\nprintf '%s' '{\"iid\":12}'");
        let body = json!({"title":"Draft: fix quotes ' and newline\n", "description":"a `literal` $value", "source_branch":"card", "target_branch":"main"});
        let result =
            api_blocking(&runtime, "projects/42/merge_requests", Some(body.clone())).unwrap();
        assert_eq!(result["iid"], 12);
        assert_eq!(
            serde_json::from_str::<Value>(
                &fs::read_to_string(runtime.config_dir.join("input.json")).unwrap()
            )
            .unwrap(),
            body
        );
        fs::write(
            &runtime.executable,
            "#!/bin/sh\nprintf 'synthetic-secret'\nprintf 'synthetic-secret' >&2\nexit 1\n",
        )
        .unwrap();
        let error = api_blocking(&runtime, "user", None)
            .err()
            .expect("operation should fail");
        assert!(!error.contains("synthetic-secret"));
        fs::remove_dir_all(runtime.config_dir).unwrap();
    }
    #[test]
    fn process_timeout_and_cancellation_terminate_the_cli() {
        let runtime = fixture("exec /bin/sleep 5");
        let started = Instant::now();
        assert!(capture(
            command(&runtime, &[]),
            None,
            Duration::from_millis(100),
            None
        )
        .err()
        .expect("operation should fail")
        .contains("timed out"));
        assert!(started.elapsed() < Duration::from_secs(3));
        let cancel = AtomicBool::new(true);
        assert!(
            capture(command(&runtime, &[]), None, COMMAND_TIMEOUT, Some(&cancel))
                .err()
                .expect("operation should fail")
                .contains("cancelled")
        );
        fs::remove_dir_all(runtime.config_dir).unwrap();
    }
    #[test]
    fn git_helper_handles_spaces_and_never_answers_for_another_host() {
        let runtime = fixture("printf '%s' 'synthetic-token'");
        let helper = runtime.config_dir.join("credential helper.sh");
        fs::write(&helper, credential_script(&runtime)).unwrap();
        fs::set_permissions(&helper, fs::Permissions::from_mode(0o700)).unwrap();
        let mut git = Command::new("git");
        isolate(&mut git, &runtime);
        git.args(["-c", "credential.helper=", "-c"])
            .arg(format!(
                "credential.helper=!{}",
                quote(&helper.to_string_lossy())
            ))
            .args(["credential", "fill"]);
        let credentials = capture(
            git,
            Some("protocol=https\nhost=code.example:8443\n\n"),
            COMMAND_TIMEOUT,
            None,
        )
        .unwrap();
        assert_eq!(credentials.code, Some(0));
        assert!(credentials.stdout.contains("password=synthetic-token"));
        let mut other = Command::new(&helper);
        other.arg("get");
        let credentials = capture(
            other,
            Some("protocol=https\nhost=other.example\n\n"),
            COMMAND_TIMEOUT,
            None,
        )
        .unwrap();
        assert!(credentials.stdout.is_empty());
        fs::remove_dir_all(runtime.config_dir).unwrap();
    }
}
