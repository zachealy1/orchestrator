use crate::DatabaseState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::Connection;
use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Arc, Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};

const GH_VERSION: &str = "2.96.0";
const COMMAND_TIMEOUT: Duration = Duration::from_secs(45);
const LOGIN_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const MAX_STDOUT_BYTES: u64 = 2 * 1024 * 1024;
const MAX_STDERR_BYTES: u64 = 256 * 1024;
const GITHUB_DEVICE_LOGIN_URL: &str = "https://github.com/login/device";
const ACTIVE_LOGIN_PID_FILE: &str = "active-login.pid";
static GITHUB_CLI_RUNTIME: OnceLock<Result<GithubCliRuntime, String>> = OnceLock::new();
static LEGACY_GITHUB_CREDENTIALS_CLEARED: OnceLock<()> = OnceLock::new();

#[derive(Clone)]
pub(crate) struct GithubCliRuntime {
    pub executable: PathBuf,
    pub config_dir: PathBuf,
    pub version: String,
}

#[derive(Clone, Default)]
pub(crate) struct GithubState {
    login: Arc<Mutex<Option<ActiveGithubLogin>>>,
    generation: Arc<AtomicU64>,
}

#[derive(Clone)]
struct ActiveGithubLogin {
    generation: u64,
    pid: u32,
    device_code: Option<String>,
    verification_uri: Option<String>,
}

struct LoginProcessGuard {
    pid: u32,
    pid_path: PathBuf,
}

impl Drop for LoginProcessGuard {
    fn drop(&mut self) {
        terminate_process(self.pid);
        remove_login_pid(&self.pid_path, self.pid);
    }
}

impl Drop for GithubState {
    fn drop(&mut self) {
        if Arc::strong_count(&self.login) == 1 {
            if let Ok(login) = self.login.lock() {
                if let Some(login) = login.as_ref() {
                    terminate_process(login.pid);
                }
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GithubConnectionStatus {
    pub available: bool,
    pub connected: bool,
    pub login: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub status: String,
    pub message: Option<String>,
    pub cli_version: Option<String>,
    pub device_code: Option<String>,
    pub verification_uri: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct GithubPullRequest {
    pub number: i64,
    pub url: String,
    pub state: String,
    pub draft: bool,
    pub merged_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeManifest {
    version: u32,
    architecture: String,
    gh_version: String,
    executable_sha256: String,
    executable: String,
}

#[derive(Deserialize)]
struct GithubUser {
    id: i64,
    login: String,
    name: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPullRequest {
    number: i64,
    url: String,
    state: String,
    is_draft: bool,
    merged_at: Option<String>,
}

struct CommandOutput {
    success: bool,
    stdout: String,
    stderr: String,
}

pub(crate) fn resolve_github_cli_runtime(app: &AppHandle) -> Result<GithubCliRuntime, String> {
    GITHUB_CLI_RUNTIME
        .get_or_init(|| resolve_github_cli_runtime_uncached(app))
        .clone()
}

fn resolve_github_cli_runtime_uncached(app: &AppHandle) -> Result<GithubCliRuntime, String> {
    let architecture = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else if cfg!(target_arch = "x86_64") {
        "x64"
    } else {
        return Err("The bundled GitHub CLI does not support this Mac architecture.".to_string());
    };
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Could not resolve Orchestrator resources: {error}"))?;
    let mut roots = vec![
        resource_dir
            .join("resources")
            .join("github-cli")
            .join(format!("darwin-{architecture}")),
        resource_dir
            .join("github-cli")
            .join(format!("darwin-{architecture}")),
    ];
    if tauri::is_dev() {
        roots.push(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("resources")
                .join("github-cli")
                .join(format!("darwin-{architecture}")),
        );
    }
    let root = roots
        .into_iter()
        .find(|root| root.join("runtime.json").is_file())
        .ok_or_else(|| {
            "The bundled GitHub CLI runtime is unavailable. Run `npm run prepare:github-cli-runtime` and rebuild Orchestrator."
                .to_string()
        })?;
    let manifest: RuntimeManifest = serde_json::from_slice(
        &fs::read(root.join("runtime.json"))
            .map_err(|error| format!("Could not read the GitHub CLI manifest: {error}"))?,
    )
    .map_err(|error| format!("The GitHub CLI manifest is invalid: {error}"))?;
    if manifest.version != 1
        || manifest.architecture != architecture
        || manifest.gh_version != GH_VERSION
    {
        return Err(
            "The bundled GitHub CLI runtime does not match this Orchestrator build.".to_string(),
        );
    }
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Could not resolve the GitHub CLI runtime: {error}"))?;
    let executable = root
        .join(&manifest.executable)
        .canonicalize()
        .map_err(|error| format!("Could not resolve the bundled GitHub CLI: {error}"))?;
    if !executable.starts_with(&canonical_root) || !executable.is_file() {
        return Err("The GitHub CLI manifest referenced an unsafe executable.".to_string());
    }
    let executable_hash = format!(
        "{:x}",
        Sha256::digest(
            fs::read(&executable)
                .map_err(|error| format!("Could not verify the bundled GitHub CLI: {error}"))?
        )
    );
    if executable_hash != manifest.executable_sha256 {
        return Err(
            "The bundled GitHub CLI failed its integrity check. Rebuild Orchestrator.".to_string(),
        );
    }
    let config_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Orchestrator app data: {error}"))?
        .join("github-cli");
    secure_directory(&config_dir)?;
    let runtime = GithubCliRuntime {
        executable,
        config_dir,
        version: manifest.gh_version,
    };
    clear_stale_login_process(&runtime);
    let output = run_command(
        &runtime,
        &["--version"],
        None,
        Duration::from_secs(5),
        false,
    )?;
    if !output.success
        || !output
            .stdout
            .starts_with(&format!("gh version {GH_VERSION} "))
    {
        return Err(
            "The bundled GitHub CLI failed its integrity check. Rebuild Orchestrator.".to_string(),
        );
    }
    Ok(runtime)
}

pub(crate) async fn github_review_available(app: &AppHandle) -> bool {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = resolve_github_cli_runtime(&app)?;
        active_login(&runtime).map(|login| login.is_some())
    })
    .await
    .ok()
    .and_then(Result::ok)
    .unwrap_or(false)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn github_connection_status(
    app: AppHandle,
    state: State<'_, GithubState>,
) -> Result<GithubConnectionStatus, String> {
    connection_status(app, state.inner().clone()).await
}

async fn connection_status(
    app: AppHandle,
    state: GithubState,
) -> Result<GithubConnectionStatus, String> {
    clear_legacy_credentials();
    let active_login_state = state.login.lock().ok().and_then(|login| login.clone());
    let connecting = active_login_state.is_some();
    let device_code = active_login_state
        .as_ref()
        .and_then(|login| login.device_code.clone());
    let verification_uri = active_login_state
        .as_ref()
        .and_then(|login| login.verification_uri.clone());
    let app_for_probe = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let runtime = resolve_github_cli_runtime(&app_for_probe)?;
        let identity = active_login(&runtime);
        Ok::<_, String>((runtime, identity))
    })
    .await
    .map_err(|error| format!("GitHub CLI status stopped unexpectedly: {error}"))?;
    let (runtime, identity) = match result {
        Ok(result) => result,
        Err(error) => {
            clear_legacy_connection_metadata(&app).await;
            return Ok(GithubConnectionStatus {
                available: false,
                connected: false,
                login: None,
                display_name: None,
                avatar_url: None,
                status: "unavailable".to_string(),
                message: Some(error),
                cli_version: None,
                device_code: None,
                verification_uri: None,
            });
        }
    };
    match identity {
        Ok(Some(identity)) => {
            persist_connection_metadata(&app, &identity).await?;
            Ok(GithubConnectionStatus {
                available: true,
                connected: true,
                login: Some(identity.login),
                display_name: identity.name,
                avatar_url: identity.avatar_url,
                status: "connected".to_string(),
                message: None,
                cli_version: Some(runtime.version),
                device_code: None,
                verification_uri: None,
            })
        }
        Err(error) => {
            clear_legacy_connection_metadata(&app).await;
            Ok(GithubConnectionStatus {
                available: true,
                connected: false,
                login: None,
                display_name: None,
                avatar_url: None,
                status: "reconnect_required".to_string(),
                message: Some(error),
                cli_version: Some(runtime.version),
                device_code: None,
                verification_uri: None,
            })
        }
        Ok(None) => {
            clear_legacy_connection_metadata(&app).await;
            Ok(GithubConnectionStatus {
                available: true,
                connected: false,
                login: None,
                display_name: None,
                avatar_url: None,
                status: if connecting {
                    "connecting"
                } else {
                    "disconnected"
                }
                .to_string(),
                message: Some(if connecting {
                    "Complete GitHub sign-in in your browser.".to_string()
                } else {
                    "Connect GitHub CLI to publish completed Kanban work as draft pull requests."
                        .to_string()
                }),
                cli_version: Some(runtime.version),
                device_code,
                verification_uri,
            })
        }
    }
}

fn clear_legacy_credentials() {
    LEGACY_GITHUB_CREDENTIALS_CLEARED.get_or_init(|| {
        #[cfg(target_os = "macos")]
        for account in ["github-app-user-token", "github-app-client-id"] {
            let _ = Command::new("/usr/bin/security")
                .args([
                    "delete-generic-password",
                    "-s",
                    "com.orchestrator.github",
                    "-a",
                    account,
                ])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
    });
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn github_connect(
    app: AppHandle,
    state: State<'_, GithubState>,
) -> Result<GithubConnectionStatus, String> {
    let state = state.inner().clone();
    let app_for_login = app.clone();
    let state_for_login = state.clone();
    tauri::async_runtime::spawn_blocking(move || run_login(&app_for_login, &state_for_login))
        .await
        .map_err(|error| format!("GitHub sign-in stopped unexpectedly: {error}"))??;
    connection_status(app, state).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn github_cancel_connection(state: State<'_, GithubState>) -> Result<(), String> {
    let active = state.login.lock().ok().and_then(|mut login| login.take());
    if let Some(active) = active {
        terminate_process(active.pid);
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn github_disconnect(
    app: AppHandle,
    state: State<'_, GithubState>,
) -> Result<(), String> {
    github_cancel_connection(state).await?;
    let app_for_logout = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = resolve_github_cli_runtime(&app_for_logout)?;
        let login = active_login(&runtime)?;
        if let Some(login) = login {
            let output = run_command(
                &runtime,
                &[
                    "auth",
                    "logout",
                    "--hostname",
                    "github.com",
                    "--user",
                    &login.login,
                ],
                Some("Y\n"),
                COMMAND_TIMEOUT,
                false,
            )?;
            if !output.success {
                return Err(map_cli_error("GitHub could not be disconnected", &output));
            }
        }
        Ok(())
    })
    .await
    .map_err(|error| format!("GitHub disconnect stopped unexpectedly: {error}"))??;
    clear_legacy_connection_metadata(&app).await;
    Ok(())
}

pub(crate) async fn ensure_repository_access(
    app: &AppHandle,
    owner: &str,
    repository: &str,
) -> Result<(), String> {
    let app = app.clone();
    let repository = format!("{owner}/{repository}");
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = resolve_github_cli_runtime(&app)?;
        ensure_authenticated(&runtime)?;
        let output = run_command(
            &runtime,
            &["repo", "view", &repository, "--json", "nameWithOwner"],
            None,
            COMMAND_TIMEOUT,
            false,
        )?;
        if output.success {
            Ok(())
        } else {
            Err(map_cli_error(
                &format!("GitHub repository {repository} is not accessible"),
                &output,
            ))
        }
    })
    .await
    .map_err(|error| format!("GitHub repository validation stopped unexpectedly: {error}"))?
}

pub(crate) async fn find_pull_request(
    app: &AppHandle,
    owner: &str,
    repository: &str,
    head: &str,
    base: &str,
) -> Result<Option<GithubPullRequest>, String> {
    let app = app.clone();
    let repository = format!("{owner}/{repository}");
    let head = head.to_string();
    let base = base.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = resolve_github_cli_runtime(&app)?;
        let output = run_command(
            &runtime,
            &[
                "pr",
                "list",
                "--repo",
                &repository,
                "--head",
                &head,
                "--base",
                &base,
                "--state",
                "all",
                "--limit",
                "1",
                "--json",
                "number,url,state,isDraft,mergedAt",
            ],
            None,
            COMMAND_TIMEOUT,
            false,
        )?;
        if !output.success {
            return Err(map_cli_error(
                "GitHub could not check existing pull requests",
                &output,
            ));
        }
        let records: Vec<GhPullRequest> = serde_json::from_str(&output.stdout)
            .map_err(|_| "GitHub CLI returned invalid pull request data.".to_string())?;
        Ok(records.into_iter().next().map(Into::into))
    })
    .await
    .map_err(|error| format!("Pull request lookup stopped unexpectedly: {error}"))?
}

pub(crate) async fn create_pull_request(
    app: &AppHandle,
    owner: &str,
    repository: &str,
    head: &str,
    base: &str,
    title: &str,
    body: &str,
) -> Result<GithubPullRequest, String> {
    let app = app.clone();
    let repository = format!("{owner}/{repository}");
    let head = head.to_string();
    let base = base.to_string();
    let title = title.to_string();
    let body = body.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = resolve_github_cli_runtime(&app)?;
        let output = run_command(
            &runtime,
            &[
                "pr",
                "create",
                "--repo",
                &repository,
                "--head",
                &head,
                "--base",
                &base,
                "--draft",
                "--title",
                &title,
                "--body-file",
                "-",
            ],
            Some(&body),
            COMMAND_TIMEOUT,
            false,
        )?;
        if !output.success {
            return Err(map_cli_error(
                "GitHub could not create the pull request",
                &output,
            ));
        }
        let lookup = run_command(
            &runtime,
            &[
                "pr",
                "list",
                "--repo",
                &repository,
                "--head",
                &head,
                "--base",
                &base,
                "--state",
                "all",
                "--limit",
                "1",
                "--json",
                "number,url,state,isDraft,mergedAt",
            ],
            None,
            COMMAND_TIMEOUT,
            false,
        )?;
        if !lookup.success {
            return Err(map_cli_error(
                "The new pull request could not be verified",
                &lookup,
            ));
        }
        serde_json::from_str::<Vec<GhPullRequest>>(&lookup.stdout)
            .map_err(|_| "GitHub CLI returned invalid pull request data.".to_string())?
            .into_iter()
            .next()
            .map(Into::into)
            .ok_or_else(|| "GitHub created the pull request but it could not be found.".to_string())
    })
    .await
    .map_err(|error| format!("Pull request creation stopped unexpectedly: {error}"))?
}

pub(crate) async fn view_pull_request(
    app: &AppHandle,
    owner: &str,
    repository: &str,
    number: i64,
) -> Result<GithubPullRequest, String> {
    let app = app.clone();
    let repository = format!("{owner}/{repository}");
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = resolve_github_cli_runtime(&app)?;
        let number = number.to_string();
        let output = run_command(
            &runtime,
            &[
                "pr",
                "view",
                &number,
                "--repo",
                &repository,
                "--json",
                "number,url,state,isDraft,mergedAt",
            ],
            None,
            COMMAND_TIMEOUT,
            false,
        )?;
        if !output.success {
            return Err(map_cli_error(
                "GitHub pull request status could not be refreshed",
                &output,
            ));
        }
        serde_json::from_str::<GhPullRequest>(&output.stdout)
            .map(Into::into)
            .map_err(|_| "GitHub CLI returned invalid pull request data.".to_string())
    })
    .await
    .map_err(|error| format!("Pull request synchronization stopped unexpectedly: {error}"))?
}

pub(crate) async fn push_branch(
    app: &AppHandle,
    worktree: &Path,
    remote: &str,
    owner: &str,
    repository: &str,
    branch: &str,
) -> Result<(), String> {
    let app = app.clone();
    let worktree = worktree.to_path_buf();
    let remote = remote.to_string();
    let owner = owner.to_string();
    let repository = repository.to_string();
    let branch = branch.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let runtime = resolve_github_cli_runtime(&app)?;
        ensure_authenticated(&runtime)?;
        let refspec = format!("{branch}:refs/heads/{branch}");
        let mut command = Command::new("git");
        command.arg("-C").arg(&worktree);
        let helper = if is_ssh_remote(&remote) {
            None
        } else {
            let helper = credential_helper(&runtime)?;
            command
                .args(["-c", "credential.helper="])
                .arg("-c")
                .arg(format!("credential.helper={}", helper.to_string_lossy()));
            Some(helper)
        };
        let destination = if is_ssh_remote(&remote) {
            remote.clone()
        } else {
            format!("https://github.com/{owner}/{repository}.git")
        };
        let output = command
            .args(["push", "--porcelain"])
            .arg(destination)
            .arg(refspec)
            .env("GH_CONFIG_DIR", &runtime.config_dir)
            .env("GIT_TERMINAL_PROMPT", "0")
            .env_remove("GH_TOKEN")
            .env_remove("GITHUB_TOKEN")
            .stdin(Stdio::null())
            .output()
            .map_err(|error| format!("Git push could not be started: {error}"));
        if let Some(helper) = helper {
            let _ = fs::remove_file(helper);
        }
        let output = output?;
        if output.status.success() {
            Ok(())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(map_error_text("GitHub rejected the branch push", &stderr))
        }
    })
    .await
    .map_err(|error| format!("Git push stopped unexpectedly: {error}"))?
}

fn run_login(app: &AppHandle, state: &GithubState) -> Result<(), String> {
    let runtime = resolve_github_cli_runtime(app)?;
    match active_login(&runtime) {
        Ok(Some(_)) => return Ok(()),
        Err(_) => {
            let _ = fs::remove_file(runtime.config_dir.join("hosts.yml"));
        }
        Ok(None) => {}
    }
    {
        let login = state
            .login
            .lock()
            .map_err(|_| "GitHub sign-in state is unavailable.".to_string())?;
        if login.is_some() {
            return Err("A GitHub sign-in is already active.".to_string());
        }
    }
    let generation = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let mut command = github_login_command(&runtime);
    let mut child = command
        .spawn()
        .map_err(|error| format!("GitHub sign-in could not be started: {error}"))?;
    let pid = child.id();
    let pid_path = runtime.config_dir.join(ACTIVE_LOGIN_PID_FILE);
    write_login_pid(&pid_path, pid).inspect_err(|_| {
        let _ = child.kill();
        let _ = child.wait();
    })?;
    let _process_guard = LoginProcessGuard { pid, pid_path };
    *state.login.lock().unwrap() = Some(ActiveGithubLogin {
        generation,
        pid,
        device_code: None,
        verification_uri: None,
    });
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not read GitHub sign-in output.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Could not read GitHub sign-in errors.".to_string())?;
    let stdout_reader = std::thread::spawn(move || read_limited(stdout, MAX_STDOUT_BYTES));
    let (browser_sender, browser_receiver) = mpsc::channel();
    let state_for_device_code = state.clone();
    let state_for_browser = state.clone();
    let stderr_reader = std::thread::spawn(move || {
        read_login_stderr(
            stderr,
            MAX_STDERR_BYTES,
            move |device_code| {
                update_login_prompt(&state_for_device_code, generation, Some(device_code), None)
            },
            move || {
                let result = update_login_prompt(
                    &state_for_browser,
                    generation,
                    None,
                    Some(GITHUB_DEVICE_LOGIN_URL.to_string()),
                )
                .and_then(|_| {
                    tauri_plugin_opener::open_url(GITHUB_DEVICE_LOGIN_URL, None::<&str>).map_err(
                        |error| format!("GitHub sign-in could not open your browser: {error}"),
                    )
                });
                let _ = browser_sender.send(result.clone());
                result
            },
        )
    });
    let started = Instant::now();
    let status = loop {
        if let Ok(Err(error)) = browser_receiver.try_recv() {
            let _ = child.kill();
            let _ = child.wait();
            clear_login(state, generation);
            return Err(error);
        }
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Could not inspect GitHub sign-in: {error}"))?
        {
            break status;
        }
        if started.elapsed() >= LOGIN_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            clear_login(state, generation);
            return Err("GitHub sign-in timed out. Try again.".to_string());
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    let stdout = String::from_utf8_lossy(
        &stdout_reader
            .join()
            .ok()
            .and_then(Result::ok)
            .unwrap_or_default(),
    )
    .trim()
    .to_string();
    let stderr = String::from_utf8_lossy(
        &stderr_reader
            .join()
            .ok()
            .and_then(Result::ok)
            .unwrap_or_default(),
    )
    .trim()
    .to_string();
    let was_cancelled = state
        .login
        .lock()
        .map(|login| {
            !login
                .as_ref()
                .is_some_and(|active| active.generation == generation)
        })
        .unwrap_or(true);
    clear_login(state, generation);
    if was_cancelled {
        return Err("GitHub sign-in cancelled.".to_string());
    }
    if status.success() {
        Ok(())
    } else {
        Err(map_error_text(
            "GitHub sign-in did not complete",
            if stderr.is_empty() { &stdout } else { &stderr },
        ))
    }
}

fn github_login_command(runtime: &GithubCliRuntime) -> Command {
    let mut command = Command::new(&runtime.executable);
    command
        .args([
            "auth",
            "login",
            "--hostname",
            "github.com",
            "--git-protocol",
            "https",
            "--web",
            "--clipboard",
        ])
        .env("GH_CONFIG_DIR", &runtime.config_dir)
        .env("GH_PAGER", "cat")
        .env("NO_COLOR", "1")
        .env_remove("GH_TOKEN")
        .env_remove("GITHUB_TOKEN")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "macos")]
    command
        .env("GH_BROWSER", "/usr/bin/open")
        .env("BROWSER", "/usr/bin/open");
    command
}

fn active_login(runtime: &GithubCliRuntime) -> Result<Option<GithubUser>, String> {
    let status = run_command(
        runtime,
        &[
            "auth",
            "status",
            "--active",
            "--hostname",
            "github.com",
            "--json",
            "hosts",
        ],
        None,
        Duration::from_secs(10),
        false,
    )?;
    let value: Value = serde_json::from_str(&status.stdout)
        .map_err(|_| "GitHub CLI returned invalid authentication status.".to_string())?;
    if !has_active_authentication(&value)? {
        return Ok(None);
    }
    let user = run_command(runtime, &["api", "user"], None, COMMAND_TIMEOUT, false)?;
    if !user.success {
        return Err(map_cli_error(
            "The GitHub connection could not be verified",
            &user,
        ));
    }
    serde_json::from_str(&user.stdout)
        .map(Some)
        .map_err(|_| "GitHub CLI returned invalid account information.".to_string())
}

fn has_active_authentication(value: &Value) -> Result<bool, String> {
    let Some(hosts) = value.get("hosts").and_then(Value::as_object) else {
        return Err("GitHub CLI returned invalid authentication status.".to_string());
    };
    let Some(accounts) = hosts.get("github.com") else {
        return Ok(false);
    };
    let Some(accounts) = accounts.as_array() else {
        return Err("GitHub CLI returned invalid authentication status.".to_string());
    };
    if accounts.iter().any(|account| {
        account.get("active").and_then(Value::as_bool) == Some(true)
            && account.get("state").and_then(Value::as_str) != Some("failure")
    }) {
        return Ok(true);
    }
    if accounts.is_empty() {
        Ok(false)
    } else {
        Err("GitHub CLI authentication needs to be refreshed. Reconnect to continue.".to_string())
    }
}

fn ensure_authenticated(runtime: &GithubCliRuntime) -> Result<(), String> {
    if active_login(runtime)?.is_some() {
        Ok(())
    } else {
        Err("Connect GitHub in Settings to continue.".to_string())
    }
}

fn run_command(
    runtime: &GithubCliRuntime,
    args: &[&str],
    stdin: Option<&str>,
    timeout: Duration,
    login: bool,
) -> Result<CommandOutput, String> {
    let mut command = Command::new(&runtime.executable);
    command
        .args(args)
        .env("GH_CONFIG_DIR", &runtime.config_dir)
        .env("GH_PAGER", "cat")
        .env("NO_COLOR", "1")
        .env_remove("GH_TOKEN")
        .env_remove("GITHUB_TOKEN")
        .env_remove("GH_ENTERPRISE_TOKEN")
        .env_remove("GITHUB_ENTERPRISE_TOKEN")
        .stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if !login {
        command.env("GH_PROMPT_DISABLED", "1");
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("GitHub CLI could not be started: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Could not read GitHub CLI output.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Could not read GitHub CLI errors.".to_string())?;
    let stdout_reader = std::thread::spawn(move || read_limited(stdout, MAX_STDOUT_BYTES));
    let stderr_reader = std::thread::spawn(move || read_limited(stderr, MAX_STDERR_BYTES));
    if let (Some(input), Some(mut writer)) = (stdin, child.stdin.take()) {
        writer
            .write_all(input.as_bytes())
            .map_err(|error| format!("Could not send input to GitHub CLI: {error}"))?;
    }
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Could not inspect GitHub CLI: {error}"))?
        {
            break status;
        }
        if started.elapsed() >= timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err("GitHub CLI timed out. Try again.".to_string());
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    let stdout = stdout_reader
        .join()
        .map_err(|_| "Could not read GitHub CLI output.".to_string())??;
    let stderr = stderr_reader
        .join()
        .map_err(|_| "Could not read GitHub CLI errors.".to_string())??;
    Ok(CommandOutput {
        success: status.success(),
        stdout: String::from_utf8_lossy(&stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&stderr).trim().to_string(),
    })
}

fn read_limited(reader: impl Read, limit: u64) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    reader
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read GitHub CLI output: {error}"))?;
    if bytes.len() as u64 > limit {
        return Err("GitHub CLI returned too much output.".to_string());
    }
    Ok(bytes)
}

fn read_login_stderr(
    reader: impl Read,
    limit: u64,
    mut receive_device_code: impl FnMut(String) -> Result<(), String>,
    open_browser: impl FnOnce() -> Result<(), String>,
) -> Result<Vec<u8>, String> {
    let mut reader = BufReader::new(reader);
    let mut bytes = Vec::new();
    let mut open_browser = Some(open_browser);
    loop {
        let mut line = Vec::new();
        let read = reader
            .read_until(b'\n', &mut line)
            .map_err(|error| format!("Could not read GitHub CLI output: {error}"))?;
        if read == 0 {
            break;
        }
        if bytes.len() as u64 + line.len() as u64 > limit {
            return Err("GitHub CLI returned too much output.".to_string());
        }
        if let Some(device_code) = parse_device_code_line(&line) {
            receive_device_code(device_code)?;
        } else if is_device_login_line(&line) {
            if let Some(open_browser) = open_browser.take() {
                open_browser()?;
            }
        }
        bytes.extend_from_slice(&line);
    }
    Ok(bytes)
}

fn parse_device_code_line(line: &[u8]) -> Option<String> {
    let line = std::str::from_utf8(line).ok()?.trim();
    let code = line
        .strip_prefix("! One-time code (")?
        .strip_suffix(") copied to clipboard")?;
    let bytes = code.as_bytes();
    if bytes.len() == 9
        && bytes[4] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || byte.is_ascii_uppercase() || byte.is_ascii_digit())
    {
        Some(code.to_string())
    } else {
        None
    }
}

fn is_device_login_line(line: &[u8]) -> bool {
    std::str::from_utf8(line).is_ok_and(|line| {
        line.trim()
            == format!("Open this URL to continue in your web browser: {GITHUB_DEVICE_LOGIN_URL}")
    })
}

fn credential_helper(runtime: &GithubCliRuntime) -> Result<PathBuf, String> {
    let path = std::env::temp_dir().join(format!(
        "orchestrator-gh-credential-{}",
        uuid::Uuid::new_v4().simple()
    ));
    let script = format!(
        "#!/bin/sh\nGH_CONFIG_DIR={} exec {} auth git-credential \"$@\"\n",
        shell_quote(&runtime.config_dir),
        shell_quote(&runtime.executable),
    );
    fs::write(&path, script)
        .map_err(|error| format!("Could not create the GitHub credential helper: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("Could not secure the GitHub credential helper: {error}"))?;
    }
    Ok(path)
}

fn shell_quote(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', "'\\''"))
}

fn is_ssh_remote(remote: &str) -> bool {
    let value = remote.trim();
    value.starts_with("git@github.com:") || value.starts_with("ssh://git@github.com/")
}

fn clear_login(state: &GithubState, generation: u64) {
    if let Ok(mut login) = state.login.lock() {
        if login
            .as_ref()
            .is_some_and(|active| active.generation == generation)
        {
            *login = None;
        }
    }
}

fn write_login_pid(path: &Path, pid: u32) -> Result<(), String> {
    fs::write(path, pid.to_string())
        .map_err(|error| format!("Could not track the GitHub sign-in process: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("Could not secure the GitHub sign-in state: {error}"))?;
    }
    Ok(())
}

fn remove_login_pid(path: &Path, pid: u32) {
    let tracked_pid = fs::read_to_string(path)
        .ok()
        .and_then(|value| value.trim().parse::<u32>().ok());
    if tracked_pid == Some(pid) {
        let _ = fs::remove_file(path);
    }
}

fn clear_stale_login_process(runtime: &GithubCliRuntime) {
    let path = runtime.config_dir.join(ACTIVE_LOGIN_PID_FILE);
    let pid = fs::read_to_string(&path)
        .ok()
        .and_then(|value| value.trim().parse::<u32>().ok());
    if let Some(pid) = pid {
        let command = Command::new("/bin/ps")
            .args(["-p", &pid.to_string(), "-o", "command="])
            .stdin(Stdio::null())
            .output()
            .ok()
            .filter(|output| output.status.success())
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string());
        if command.as_deref().is_some_and(|command| {
            command.starts_with(runtime.executable.to_string_lossy().as_ref())
                && command.contains(" auth login ")
        }) {
            terminate_process(pid);
        }
    }
    let _ = fs::remove_file(path);
}

fn update_login_prompt(
    state: &GithubState,
    generation: u64,
    device_code: Option<String>,
    verification_uri: Option<String>,
) -> Result<(), String> {
    let mut login = state
        .login
        .lock()
        .map_err(|_| "GitHub sign-in state is unavailable.".to_string())?;
    let Some(active) = login
        .as_mut()
        .filter(|active| active.generation == generation)
    else {
        return Err("GitHub sign-in cancelled.".to_string());
    };
    if let Some(device_code) = device_code {
        active.device_code = Some(device_code);
    }
    if let Some(verification_uri) = verification_uri {
        active.verification_uri = Some(verification_uri);
    }
    Ok(())
}

fn terminate_process(pid: u32) {
    let _ = Command::new("/bin/kill")
        .args(["-TERM", &pid.to_string()])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

fn secure_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("Could not prepare GitHub CLI storage: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("Could not secure GitHub CLI storage: {error}"))?;
    }
    Ok(())
}

async fn persist_connection_metadata(app: &AppHandle, user: &GithubUser) -> Result<(), String> {
    let mut connection = app.state::<DatabaseState>().acquire().await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("GitHub connection state could not be saved: {error}"))?;
    sqlx::query(
        "INSERT INTO github_connections (
            id, github_user_id, login, display_name, avatar_url, token_key, status
         ) VALUES (1, ?1, ?2, ?3, ?4, 'gh-cli', 'connected')
         ON CONFLICT(id) DO UPDATE SET github_user_id = excluded.github_user_id,
            login = excluded.login, display_name = excluded.display_name,
            avatar_url = excluded.avatar_url, token_key = 'gh-cli', status = 'connected',
            updated_at = CURRENT_TIMESTAMP",
    )
    .bind(user.id)
    .bind(&user.login)
    .bind(&user.name)
    .bind(&user.avatar_url)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("GitHub connection state could not be saved: {error}"))?;
    sqlx::query("DELETE FROM github_installation_repositories")
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("Old GitHub access metadata could not be cleared: {error}"))?;
    sqlx::query("DELETE FROM github_installations")
        .execute(&mut *transaction)
        .await
        .map_err(|error| {
            format!("Old GitHub installation metadata could not be cleared: {error}")
        })?;
    transaction
        .commit()
        .await
        .map_err(|error| format!("GitHub connection state could not be saved: {error}"))
}

async fn clear_legacy_connection_metadata(app: &AppHandle) {
    let Ok(mut connection) = app.state::<DatabaseState>().acquire().await else {
        return;
    };
    let _ = sqlx::query("DELETE FROM github_connections WHERE id = 1")
        .execute(&mut *connection)
        .await;
    let _ = sqlx::query("DELETE FROM github_installation_repositories")
        .execute(&mut *connection)
        .await;
    let _ = sqlx::query("DELETE FROM github_installations")
        .execute(&mut *connection)
        .await;
}

fn map_cli_error(operation: &str, output: &CommandOutput) -> String {
    let detail = if output.stderr.is_empty() {
        output.stdout.as_str()
    } else {
        output.stderr.as_str()
    };
    map_error_text(operation, detail)
}

fn map_error_text(operation: &str, detail: &str) -> String {
    let lower = detail.to_ascii_lowercase();
    let reason = if lower.contains("not logged") || lower.contains("authentication required") {
        "Connect GitHub in Settings and try again."
    } else if lower.contains("saml") || lower.contains("sso") {
        "Authorize GitHub CLI for your organization, then try again."
    } else if lower.contains("rate limit") {
        "GitHub rate limits are temporarily preventing this action. Try again later."
    } else if lower.contains("could not resolve host") || lower.contains("connection") {
        "GitHub could not be reached. Check your connection and try again."
    } else if lower.contains("non-fast-forward") || lower.contains("fetch first") {
        "GitHub rejected the push because the remote branch changed. Review it and retry."
    } else if detail.trim().is_empty() {
        "Try again."
    } else {
        detail.trim()
    };
    format!("{operation}. {reason}")
}

impl From<GhPullRequest> for GithubPullRequest {
    fn from(value: GhPullRequest) -> Self {
        Self {
            number: value.number,
            url: value.url,
            state: value.state.to_ascii_lowercase(),
            draft: value.is_draft,
            merged_at: value.merged_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        github_login_command, has_active_authentication, is_device_login_line, is_ssh_remote,
        map_error_text, parse_device_code_line, read_login_stderr, shell_quote, GithubCliRuntime,
    };
    use serde_json::json;
    use std::{cell::Cell, ffi::OsStr, io::Cursor, path::Path, rc::Rc};

    #[test]
    fn configures_browser_login_for_macos() {
        let runtime = GithubCliRuntime {
            executable: "/tmp/gh".into(),
            config_dir: "/tmp/orchestrator-gh".into(),
            version: "test".to_string(),
        };
        let command = github_login_command(&runtime);
        let args = command.get_args().collect::<Vec<_>>();

        assert!(args.windows(2).any(|args| args == ["--web", "--clipboard"]));
        assert_eq!(
            command
                .get_envs()
                .find(|(name, _)| *name == OsStr::new("GH_CONFIG_DIR"))
                .and_then(|(_, value)| value),
            Some(OsStr::new("/tmp/orchestrator-gh")),
        );
        #[cfg(target_os = "macos")]
        for name in ["GH_BROWSER", "BROWSER"] {
            assert_eq!(
                command
                    .get_envs()
                    .find(|(key, _)| *key == OsStr::new(name))
                    .and_then(|(_, value)| value),
                Some(OsStr::new("/usr/bin/open")),
            );
        }
    }

    #[test]
    fn opens_only_the_pinned_github_device_login_url() {
        let opened = Rc::new(Cell::new(0));
        let opened_for_callback = opened.clone();
        let output = read_login_stderr(
            Cursor::new(
                "! One-time code (<redacted>) copied to clipboard\n\
                 Open this URL to continue in your web browser: https://github.com/login/device\n",
            ),
            1_024,
            |_| Ok(()),
            move || {
                opened_for_callback.set(opened_for_callback.get() + 1);
                Ok(())
            },
        )
        .unwrap();

        assert_eq!(opened.get(), 1);
        assert!(String::from_utf8(output)
            .unwrap()
            .contains("github.com/login/device"));
        assert!(!is_device_login_line(
            b"Open this URL to continue in your web browser: https://example.com/login/device\n"
        ));
    }

    #[test]
    fn extracts_only_valid_ephemeral_device_codes() {
        assert_eq!(
            parse_device_code_line(b"! One-time code (ABCD-1234) copied to clipboard\n"),
            Some("ABCD-1234".to_string()),
        );
        assert_eq!(
            parse_device_code_line(b"! One-time code (abcd-1234) copied to clipboard\n"),
            None,
        );
        assert_eq!(
            parse_device_code_line(b"Open https://example.com with ABCD-1234\n"),
            None,
        );
    }

    #[test]
    fn identifies_ssh_remotes() {
        assert!(is_ssh_remote("git@github.com:openai/codex.git"));
        assert!(is_ssh_remote("ssh://git@github.com/openai/codex.git"));
        assert!(!is_ssh_remote("https://github.com/openai/codex.git"));
    }

    #[test]
    fn quotes_credential_helper_paths() {
        assert_eq!(shell_quote(Path::new("/tmp/a b")), "'/tmp/a b'");
        assert_eq!(shell_quote(Path::new("/tmp/a'b")), "'/tmp/a'\\''b'");
    }

    #[test]
    fn maps_authentication_errors_without_tokens() {
        let error = map_error_text("Publication failed", "not logged into github.com");
        assert!(error.contains("Connect GitHub"));
        assert!(!error.contains("token"));
    }

    #[test]
    fn parses_disconnected_and_active_authentication() {
        assert!(!has_active_authentication(&json!({ "hosts": {} })).unwrap());
        assert!(has_active_authentication(&json!({
            "hosts": {
                "github.com": [{ "active": true, "state": "success" }]
            }
        }))
        .unwrap());
    }

    #[test]
    fn rejects_expired_or_malformed_authentication() {
        assert!(has_active_authentication(&json!({
            "hosts": {
                "github.com": [{ "active": true, "state": "failure" }]
            }
        }))
        .is_err());
        assert!(has_active_authentication(&json!({ "hosts": [] })).is_err());
        assert!(has_active_authentication(&json!({})).is_err());
    }
}
