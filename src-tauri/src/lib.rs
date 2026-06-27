use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    env,
    ffi::OsStr,
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{channel, Sender},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_sql::{Migration, MigrationKind};

const DATABASE_URL: &str = "sqlite:app.db";

struct PendingResponse {
    account_id: i64,
    sender: Sender<Result<Value, String>>,
}

type PendingMap = Arc<Mutex<HashMap<String, PendingResponse>>>;

struct CodexProcess {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
}

#[derive(Default)]
struct CodexState {
    processes: Mutex<HashMap<i64, CodexProcess>>,
    pending: PendingMap,
    next_id: AtomicU64,
    login_account: Arc<Mutex<Option<i64>>>,
}

impl Drop for CodexState {
    fn drop(&mut self) {
        if let Ok(processes) = self.processes.get_mut() {
            for (_, process) in processes.iter_mut() {
                let _ = process.child.kill();
                let _ = process.child.wait();
            }
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexConnectResult {
    pid: Option<u32>,
    already_connected: bool,
    initialize: Value,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProcessEvent {
    account_id: i64,
    status: String,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexMessageEvent {
    account_id: i64,
    message: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreflightCheck {
    id: String,
    label: String,
    status: String,
    message: String,
    detail: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecommendationDraft {
    kind: String,
    title: String,
    body: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PreflightReport {
    workspace_path: String,
    token_estimate: usize,
    context_budget: usize,
    route_recommendation: String,
    improved_prompt: String,
    checks: Vec<PreflightCheck>,
    recommendations: Vec<RecommendationDraft>,
}

#[derive(Serialize)]
struct CommandProbe {
    ok: bool,
    stdout: String,
    stderr: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitBranchList {
    branches: Vec<String>,
    current_branch: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCheckoutResult {
    branch: String,
}

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "remove_starter_notes_table",
            sql: "DROP TABLE IF EXISTS notes;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_orchestrator_tables",
            sql: "
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS workspaces (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    path TEXT NOT NULL UNIQUE,
                    label TEXT NOT NULL,
                    last_opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    workspace_id INTEGER NOT NULL,
                    original_prompt TEXT NOT NULL,
                    improved_prompt TEXT NOT NULL,
                    route_recommendation TEXT NOT NULL,
                    budget_tokens INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id INTEGER NOT NULL,
                    workspace_id INTEGER NOT NULL,
                    codex_thread_id TEXT,
                    codex_turn_id TEXT,
                    model TEXT,
                    model_provider TEXT,
                    sandbox TEXT NOT NULL DEFAULT 'workspace-write',
                    approval_policy TEXT NOT NULL DEFAULT 'on-request',
                    status TEXT NOT NULL,
                    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    completed_at TEXT,
                    duration_ms INTEGER,
                    final_message TEXT,
                    error TEXT,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS run_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id INTEGER NOT NULL,
                    sequence INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    method TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS token_usage_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id INTEGER NOT NULL,
                    thread_id TEXT,
                    turn_id TEXT,
                    total_tokens INTEGER NOT NULL,
                    input_tokens INTEGER NOT NULL,
                    cached_input_tokens INTEGER NOT NULL,
                    output_tokens INTEGER NOT NULL,
                    reasoning_output_tokens INTEGER NOT NULL,
                    model_context_window INTEGER,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS preflight_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id INTEGER,
                    workspace_id INTEGER NOT NULL,
                    check_id TEXT NOT NULL,
                    label TEXT NOT NULL,
                    status TEXT NOT NULL,
                    message TEXT NOT NULL,
                    detail TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS recommendations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    task_id INTEGER,
                    workspace_id INTEGER NOT NULL,
                    kind TEXT NOT NULL,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    accepted INTEGER NOT NULL DEFAULT 0,
                    dismissed INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
                    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_tasks_workspace_created ON tasks(workspace_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_runs_workspace_started ON runs(workspace_id, started_at DESC);
                CREATE INDEX IF NOT EXISTS idx_run_events_run_sequence ON run_events(run_id, sequence);
                CREATE INDEX IF NOT EXISTS idx_token_usage_run ON token_usage_snapshots(run_id, created_at);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_multi_account_codex_profiles",
            sql: "
                CREATE TABLE IF NOT EXISTS codex_accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    label TEXT NOT NULL,
                    email TEXT,
                    plan_type TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    last_error TEXT,
                    last_used_at TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    deleted_at TEXT
                );

                ALTER TABLE workspaces
                    ADD COLUMN default_account_id INTEGER
                    REFERENCES codex_accounts(id) ON DELETE SET NULL;

                ALTER TABLE runs
                    ADD COLUMN account_id INTEGER
                    REFERENCES codex_accounts(id) ON DELETE SET NULL;
                ALTER TABLE runs ADD COLUMN account_label TEXT;
                ALTER TABLE runs ADD COLUMN account_email TEXT;

                CREATE INDEX IF NOT EXISTS idx_codex_accounts_active
                    ON codex_accounts(deleted_at, last_used_at DESC);
                CREATE INDEX IF NOT EXISTS idx_runs_account_started
                    ON runs(account_id, started_at DESC);
            ",
            kind: MigrationKind::Up,
        },
    ]
}

fn emit_process(app: &AppHandle, account_id: i64, status: &str, message: impl Into<String>) {
    let _ = app.emit(
        "codex:process",
        ProcessEvent {
            account_id,
            status: status.to_string(),
            message: message.into(),
        },
    );
}

fn pending_key(id: &Value) -> String {
    match id {
        Value::String(value) => value.clone(),
        other => other.to_string(),
    }
}

fn write_message(stdin: &Arc<Mutex<ChildStdin>>, message: &Value) -> Result<(), String> {
    let mut writer = stdin
        .lock()
        .map_err(|_| "Codex stdin lock was poisoned".to_string())?;
    writeln!(writer, "{}", message).map_err(|err| format!("Failed to write to Codex: {err}"))?;
    writer
        .flush()
        .map_err(|err| format!("Failed to flush Codex stdin: {err}"))
}

fn process_stdout(
    app: AppHandle,
    account_id: i64,
    stdout: impl std::io::Read + Send + 'static,
    pending: PendingMap,
    login_account: Arc<Mutex<Option<i64>>>,
) {
    for line in BufReader::new(stdout).lines() {
        match line {
            Ok(line) if line.trim().is_empty() => {}
            Ok(line) => match serde_json::from_str::<Value>(&line) {
                Ok(message) => {
                    let method = message.get("method").and_then(Value::as_str);
                    let id = message.get("id").cloned();

                    match (method, id) {
                        (Some(_), Some(_)) => {
                            let _ = app.emit(
                                "codex:server-request",
                                CodexMessageEvent {
                                    account_id,
                                    message,
                                },
                            );
                        }
                        (Some(method), None) => {
                            if method == "account/login/completed" {
                                if let Ok(mut active) = login_account.lock() {
                                    if *active == Some(account_id) {
                                        *active = None;
                                    }
                                }
                            }
                            let _ = app.emit(
                                "codex:notification",
                                CodexMessageEvent {
                                    account_id,
                                    message,
                                },
                            );
                        }
                        (None, Some(response_id)) => {
                            let key = pending_key(&response_id);
                            let sender = pending.lock().ok().and_then(|mut map| map.remove(&key));

                            if let Some(pending_response) = sender {
                                if let Some(error) = message.get("error") {
                                    let _ = pending_response.sender.send(Err(error.to_string()));
                                } else {
                                    let result = message.get("result").cloned().unwrap_or(Value::Null);
                                    let _ = pending_response.sender.send(Ok(result));
                                }
                            } else {
                                emit_process(&app, account_id, "warning", format!("Unmatched Codex response: {line}"));
                            }
                        }
                        (None, None) => {
                            emit_process(&app, account_id, "warning", format!("Unknown Codex message: {line}"));
                        }
                    }
                }
                Err(err) => emit_process(&app, account_id, "warning", format!("Invalid Codex JSONL: {err}")),
            },
            Err(err) => {
                emit_process(&app, account_id, "error", format!("Failed reading Codex stdout: {err}"));
                break;
            }
        }
    }

    emit_process(&app, account_id, "exited", "Codex app-server stdout closed");
}

fn process_stderr(
    app: AppHandle,
    account_id: i64,
    stderr: impl std::io::Read + Send + 'static,
) {
    for line in BufReader::new(stderr).lines() {
        match line {
            Ok(line) if !line.trim().is_empty() => emit_process(&app, account_id, "stderr", line),
            Ok(_) => {}
            Err(err) => {
                emit_process(&app, account_id, "error", format!("Failed reading Codex stderr: {err}"));
                break;
            }
        }
    }
}

fn process_stdin(state: &CodexState, account_id: i64) -> Result<Arc<Mutex<ChildStdin>>, String> {
    let processes = state
        .processes
        .lock()
        .map_err(|_| "Codex processes lock was poisoned".to_string())?;
    processes
        .get(&account_id)
        .map(|process| Arc::clone(&process.stdin))
        .ok_or_else(|| format!("Codex account {account_id} is not connected"))
}

fn send_request(
    state: &CodexState,
    account_id: i64,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let stdin = process_stdin(state, account_id)?;
    let id = state.next_id.fetch_add(1, Ordering::SeqCst);
    let key = id.to_string();
    let (tx, rx) = channel();

    state
        .pending
        .lock()
        .map_err(|_| "Codex pending map lock was poisoned".to_string())?
        .insert(
            key.clone(),
            PendingResponse {
                account_id,
                sender: tx,
            },
        );

    let message = json!({
        "method": method,
        "id": id,
        "params": params,
    });

    if let Err(err) = write_message(&stdin, &message) {
        let _ = state.pending.lock().map(|mut map| map.remove(&key));
        return Err(err);
    }

    match rx.recv_timeout(Duration::from_secs(60)) {
        Ok(result) => result,
        Err(_) => {
            let _ = state.pending.lock().map(|mut map| map.remove(&key));
            Err(format!("Timed out waiting for Codex response to {method}"))
        }
    }
}

fn send_notification(state: &CodexState, account_id: i64, message: Value) -> Result<(), String> {
    let stdin = process_stdin(state, account_id)?;
    write_message(&stdin, &message)
}

#[tauri::command]
fn codex_connect(
    account_id: i64,
    app: AppHandle,
    state: State<'_, CodexState>,
) -> Result<CodexConnectResult, String> {
    validate_account_id(account_id)?;
    {
        let mut processes = state
            .processes
            .lock()
            .map_err(|_| "Codex processes lock was poisoned".to_string())?;

        if let Some(existing) = processes.get_mut(&account_id) {
            if existing
                .child
                .try_wait()
                .map_err(|err| format!("Failed to inspect Codex process: {err}"))?
                .is_none()
            {
                return Ok(CodexConnectResult {
                    pid: Some(existing.child.id()),
                    already_connected: true,
                    initialize: json!({ "status": "already-connected" }),
                });
            }
            processes.remove(&account_id);
        }

        let codex_binary = resolve_codex_binary()?;
        let codex_home = ensure_codex_home(&app, account_id)?;
        let mut child = Command::new(&codex_binary)
            .args([
                "app-server",
                "--listen",
                "stdio://",
                "-c",
                "cli_auth_credentials_store=\"file\"",
            ])
            .env("CODEX_HOME", &codex_home)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|err| {
                format!(
                    "Failed to start `codex app-server` from {}: {err}",
                    codex_binary.display()
                )
            })?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Codex stdout was not available".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Codex stderr was not available".to_string())?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Codex stdin was not available".to_string())?;

        let pending = Arc::clone(&state.pending);
        let login_account = Arc::clone(&state.login_account);
        let stdout_app = app.clone();
        std::thread::spawn(move || {
            process_stdout(stdout_app, account_id, stdout, pending, login_account)
        });

        let stderr_app = app.clone();
        std::thread::spawn(move || process_stderr(stderr_app, account_id, stderr));

        processes.insert(account_id, CodexProcess {
            child,
            stdin: Arc::new(Mutex::new(stdin)),
        });
    }

    let initialize = send_request(
        &state,
        account_id,
        "initialize",
        json!({
            "clientInfo": {
                "name": "orchestrator",
                "title": "Orchestrator",
                "version": env!("CARGO_PKG_VERSION")
            },
            "capabilities": {
                "experimentalApi": true
            }
        }),
    )?;

    send_notification(
        &state,
        account_id,
        json!({ "method": "initialized", "params": {} }),
    )?;

    let pid = state
        .processes
        .lock()
        .ok()
        .and_then(|processes| processes.get(&account_id).map(|process| process.child.id()));

    emit_process(&app, account_id, "connected", "Codex app-server connected");

    Ok(CodexConnectResult {
        pid,
        already_connected: false,
        initialize,
    })
}

#[tauri::command]
fn codex_rpc(
    account_id: i64,
    method: String,
    params: Value,
    state: State<'_, CodexState>,
) -> Result<Value, String> {
    if method == "account/login/start" {
        let mut active = state
            .login_account
            .lock()
            .map_err(|_| "Codex login lock was poisoned".to_string())?;
        if let Some(active_account_id) = *active {
            if active_account_id != account_id {
                return Err(format!(
                    "Another Codex sign-in is already active for account {active_account_id}"
                ));
            }
        }
        *active = Some(account_id);
    }

    let response = send_request(&state, account_id, &method, params);

    if response.is_err()
        || method == "account/login/cancel"
        || method == "account/logout"
    {
        if let Ok(mut active) = state.login_account.lock() {
            if *active == Some(account_id) {
                *active = None;
            }
        }
    }

    response
}

#[tauri::command]
fn codex_resolve_server_request(
    account_id: i64,
    id: Value,
    result: Value,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    send_notification(
        &state,
        account_id,
        json!({
            "id": id,
            "result": result
        }),
    )
}

#[tauri::command]
fn codex_stop(
    account_id: i64,
    app: AppHandle,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    stop_codex_account(account_id, &app, &state)
}

fn stop_codex_account(
    account_id: i64,
    app: &AppHandle,
    state: &CodexState,
) -> Result<(), String> {
    let mut processes = state
        .processes
        .lock()
        .map_err(|_| "Codex processes lock was poisoned".to_string())?;

    if let Some(mut process) = processes.remove(&account_id) {
        let _ = process.child.kill();
        let _ = process.child.wait();
    }

    if let Ok(mut pending) = state.pending.lock() {
        let stopped_keys = pending_keys_for_account(&pending, account_id);
        for key in stopped_keys {
            if let Some(response) = pending.remove(&key) {
                let _ = response
                    .sender
                    .send(Err("Codex app-server was stopped".to_string()));
            }
        }
    }

    if let Ok(mut active) = state.login_account.lock() {
        if *active == Some(account_id) {
            *active = None;
        }
    }

    emit_process(app, account_id, "stopped", "Codex app-server stopped");
    Ok(())
}

fn pending_keys_for_account(
    pending: &HashMap<String, PendingResponse>,
    account_id: i64,
) -> Vec<String> {
    pending
        .iter()
        .filter_map(|(key, response)| {
            (response.account_id == account_id).then_some(key.clone())
        })
        .collect()
}

#[tauri::command]
fn codex_delete_profile(
    account_id: i64,
    app: AppHandle,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    validate_account_id(account_id)?;
    stop_codex_account(account_id, &app, &state)?;
    let profile_root = codex_profile_root(&app, account_id)?;
    if profile_root.exists() {
        fs::remove_dir_all(&profile_root).map_err(|error| {
            format!(
                "Failed to delete Codex profile {}: {error}",
                profile_root.display()
            )
        })?;
    }
    Ok(())
}

#[tauri::command]
fn list_git_branches(path: String) -> Result<GitBranchList, String> {
    let git_probe = run_command("git", &["-C", &path, "rev-parse", "--is-inside-work-tree"]);
    if !git_probe.ok {
        return Err(output_detail(&git_probe).unwrap_or_else(|| {
            "Selected folder is not inside a Git repository".to_string()
        }));
    }

    let current_probe = run_command("git", &["-C", &path, "branch", "--show-current"]);
    let current_branch = current_probe
        .stdout
        .lines()
        .next()
        .map(str::trim)
        .filter(|branch| !branch.is_empty())
        .map(str::to_string);

    let branches_probe = run_command(
        "git",
        &["-C", &path, "for-each-ref", "--format=%(refname:short)", "refs/heads"],
    );
    if !branches_probe.ok {
        return Err(output_detail(&branches_probe)
            .unwrap_or_else(|| "Unable to list Git branches".to_string()));
    }

    let mut branches: Vec<String> = branches_probe
        .stdout
        .lines()
        .map(str::trim)
        .filter(|branch| !branch.is_empty())
        .map(str::to_string)
        .collect();
    branches.sort();

    if let Some(current) = &current_branch {
        if !branches.iter().any(|branch| branch == current) {
            branches.insert(0, current.clone());
        }
    }

    Ok(GitBranchList {
        branches,
        current_branch,
    })
}

#[tauri::command]
fn checkout_git_branch(path: String, branch: String) -> Result<GitCheckoutResult, String> {
    if branch.trim().is_empty() {
        return Err("Choose a branch before switching".to_string());
    }

    let branches = list_git_branches(path.clone())?;
    if !branches.branches.iter().any(|candidate| candidate == &branch) {
        return Err(format!("Branch `{branch}` was not found in the selected folder"));
    }

    if branches.current_branch.as_deref() == Some(branch.as_str()) {
        return Ok(GitCheckoutResult { branch });
    }

    let checkout_probe = run_command("git", &["-C", &path, "checkout", &branch]);
    if !checkout_probe.ok {
        return Err(output_detail(&checkout_probe)
            .unwrap_or_else(|| format!("Unable to switch to `{branch}`")));
    }

    Ok(GitCheckoutResult { branch })
}

#[tauri::command]
fn run_preflight(
    path: String,
    prompt: String,
    use_oss: bool,
    oss_provider: Option<String>,
) -> PreflightReport {
    let workspace = Path::new(&path);
    let mut checks = Vec::new();
    let mut recommendations = Vec::new();
    let token_estimate = estimate_tokens(&prompt);
    let context_budget = 128_000usize;
    let route_recommendation = route_recommendation(&prompt, token_estimate);
    let improved_prompt = improve_prompt(&prompt);

    push_check(
        &mut checks,
        "path",
        "Workspace path",
        if workspace.exists() { "pass" } else { "fail" },
        if workspace.exists() {
            "Folder exists"
        } else {
            "Folder does not exist"
        },
        Some(path.clone()),
    );

    let git_probe = run_command("git", &["-C", &path, "rev-parse", "--is-inside-work-tree"]);
    push_check(
        &mut checks,
        "git",
        "Git repository",
        if git_probe.ok { "pass" } else { "warn" },
        if git_probe.ok {
            "Workspace is inside a Git repository"
        } else {
            "Codex works best from a Git repository"
        },
        output_detail(&git_probe),
    );

    let branch_probe = run_command("git", &["-C", &path, "branch", "--show-current"]);
    push_check(
        &mut checks,
        "branch",
        "Current branch",
        if branch_probe.ok && !branch_probe.stdout.trim().is_empty() {
            "pass"
        } else {
            "info"
        },
        branch_probe.stdout.trim().trim_matches('\n'),
        output_detail(&branch_probe),
    );

    let status_probe = run_command("git", &["-C", &path, "status", "--short"]);
    let dirty_count = status_probe
        .stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .count();
    push_check(
        &mut checks,
        "dirty",
        "Working tree",
        if dirty_count == 0 { "pass" } else { "warn" },
        if dirty_count == 0 {
            "No uncommitted changes detected".to_string()
        } else {
            format!("{dirty_count} changed files detected")
        },
        output_detail(&status_probe),
    );

    let codex_binary = resolve_codex_binary();
    let codex_probe = match &codex_binary {
        Ok(binary) => run_command(binary, &["--version"]),
        Err(error) => CommandProbe {
            ok: false,
            stdout: String::new(),
            stderr: error.clone(),
        },
    };
    push_check(
        &mut checks,
        "codex",
        "Codex CLI",
        if codex_probe.ok { "pass" } else { "fail" },
        if codex_probe.ok {
            codex_probe.stdout.trim().to_string()
        } else {
            "Codex CLI could not be located".to_string()
        },
        output_detail(&codex_probe),
    );

    let auth_probe = match &codex_binary {
        Ok(binary) => run_command(binary, &["doctor", "--json"]),
        Err(error) => CommandProbe {
            ok: false,
            stdout: String::new(),
            stderr: error.clone(),
        },
    };
    push_check(
        &mut checks,
        "codex-auth",
        "Codex auth",
        if auth_probe.ok { "pass" } else { "warn" },
        if auth_probe.ok {
            "Codex doctor completed; app-server auth can be checked in-app"
        } else {
            "Run `codex login` if app-server auth reports missing credentials"
        },
        output_detail(&auth_probe),
    );

    let package_hints = package_hints(workspace);
    push_check(
        &mut checks,
        "package-manager",
        "Project tooling",
        if package_hints.is_empty() { "info" } else { "pass" },
        if package_hints.is_empty() {
            "No common package manager files detected".to_string()
        } else {
            format!("Detected {}", package_hints.join(", "))
        },
        None,
    );

    push_check(
        &mut checks,
        "codex-config",
        "Codex guidance",
        if workspace.join(".codex").exists() || workspace.join("AGENTS.md").exists() {
            "pass"
        } else {
            "info"
        },
        if workspace.join(".codex").exists() || workspace.join("AGENTS.md").exists() {
            "Project guidance found"
        } else {
            "No .codex folder or AGENTS.md found"
        },
        None,
    );

    push_check(
        &mut checks,
        "budget",
        "Context budget",
        if token_estimate < context_budget / 2 {
            "pass"
        } else if token_estimate < context_budget {
            "warn"
        } else {
            "fail"
        },
        format!("Estimated prompt size: {token_estimate} tokens"),
        Some(format!("Default planning budget: {context_budget} tokens")),
    );

    if use_oss {
        let provider = oss_provider.unwrap_or_else(|| "ollama".to_string());
        let provider_probe = if provider == "ollama" {
            run_command("ollama", &["--version"])
        } else {
            CommandProbe {
                ok: true,
                stdout: "LM Studio provider selected; verify the local server is running".to_string(),
                stderr: String::new(),
            }
        };

        push_check(
            &mut checks,
            "oss-provider",
            "Local OSS provider",
            if provider_probe.ok { "pass" } else { "warn" },
            if provider_probe.ok {
                format!("{provider} selected")
            } else {
                format!("{provider} was selected but could not be verified")
            },
            output_detail(&provider_probe),
        );
    }

    if route_recommendation == "plan-first" {
        recommendations.push(RecommendationDraft {
            kind: "route".to_string(),
            title: "Start with a plan turn".to_string(),
            body: "Ask Codex to inspect the repository and produce an implementation plan before allowing a write-capable run.".to_string(),
        });
    }

    if prompt.to_lowercase().contains("review") || prompt.to_lowercase().contains("security") {
        recommendations.push(RecommendationDraft {
            kind: "subagent".to_string(),
            title: "Use focused review subagents".to_string(),
            body: "Add: Spawn one explorer subagent for code structure, one security subagent for risk, and one test subagent for coverage gaps. Wait for all results before summarizing.".to_string(),
        });
    } else if token_estimate > 180 || route_recommendation == "plan-first" {
        recommendations.push(RecommendationDraft {
            kind: "subagent".to_string(),
            title: "Delegate exploration".to_string(),
            body: "Add: Spawn an explorer subagent to map relevant files and return a concise summary before implementation.".to_string(),
        });
    }

    PreflightReport {
        workspace_path: path,
        token_estimate,
        context_budget,
        route_recommendation,
        improved_prompt,
        checks,
        recommendations,
    }
}

fn push_check(
    checks: &mut Vec<PreflightCheck>,
    id: &str,
    label: &str,
    status: &str,
    message: impl Into<String>,
    detail: Option<String>,
) {
    checks.push(PreflightCheck {
        id: id.to_string(),
        label: label.to_string(),
        status: status.to_string(),
        message: message.into(),
        detail,
    });
}

fn validate_account_id(account_id: i64) -> Result<(), String> {
    if account_id > 0 {
        Ok(())
    } else {
        Err("Codex account id must be a positive integer".to_string())
    }
}

fn account_profile_root(base: &Path, account_id: i64) -> Result<PathBuf, String> {
    validate_account_id(account_id)?;
    Ok(base.join("codex-accounts").join(account_id.to_string()))
}

fn codex_profile_root(app: &AppHandle, account_id: i64) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Orchestrator app data: {error}"))?;
    account_profile_root(&app_data, account_id)
}

fn ensure_codex_home(app: &AppHandle, account_id: i64) -> Result<PathBuf, String> {
    let codex_home = codex_profile_root(app, account_id)?.join("codex-home");
    fs::create_dir_all(&codex_home).map_err(|error| {
        format!(
            "Could not create isolated Codex home {}: {error}",
            codex_home.display()
        )
    })?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&codex_home, fs::Permissions::from_mode(0o700)).map_err(
            |error| {
                format!(
                    "Could not secure isolated Codex home {}: {error}",
                    codex_home.display()
                )
            },
        )?;
    }

    Ok(codex_home)
}

fn resolve_codex_binary() -> Result<PathBuf, String> {
    if let Some(configured) = env::var_os("ORCHESTRATOR_CODEX_BIN") {
        let path = PathBuf::from(configured);
        if path.is_file() {
            return Ok(path);
        }

        return Err(format!(
            "ORCHESTRATOR_CODEX_BIN points to a missing file: {}",
            path.display()
        ));
    }

    if let Some(path) = find_codex_on_path(env::var_os("PATH")) {
        return Ok(path);
    }

    #[cfg(target_os = "macos")]
    {
        let mut candidates = vec![PathBuf::from(
            "/Applications/Codex.app/Contents/Resources/codex",
        )];

        if let Some(home) = env::var_os("HOME") {
            candidates.push(
                PathBuf::from(home)
                    .join("Applications/Codex.app/Contents/Resources/codex"),
            );
        }

        if let Some(path) = candidates.into_iter().find(|path| path.is_file()) {
            return Ok(path);
        }
    }

    Err(
        "Codex CLI was not found. Install Codex, add `codex` to PATH, or set ORCHESTRATOR_CODEX_BIN."
            .to_string(),
    )
}

fn find_codex_on_path(path_value: Option<std::ffi::OsString>) -> Option<PathBuf> {
    let executable = if cfg!(windows) { "codex.exe" } else { "codex" };

    path_value
        .into_iter()
        .flat_map(|value| env::split_paths(&value).collect::<Vec<_>>())
        .map(|directory| directory.join(executable))
        .find(|path| path.is_file())
}

fn run_command(program: impl AsRef<OsStr>, args: &[&str]) -> CommandProbe {
    match Command::new(program).args(args).output() {
        Ok(output) => CommandProbe {
            ok: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
        },
        Err(err) => CommandProbe {
            ok: false,
            stdout: String::new(),
            stderr: err.to_string(),
        },
    }
}

fn output_detail(probe: &CommandProbe) -> Option<String> {
    let mut detail = Vec::new();
    if !probe.stdout.trim().is_empty() {
        detail.push(probe.stdout.trim());
    }
    if !probe.stderr.trim().is_empty() {
        detail.push(probe.stderr.trim());
    }
    if detail.is_empty() {
        None
    } else {
        Some(detail.join("\n"))
    }
}

fn package_hints(workspace: &Path) -> Vec<&'static str> {
    let mut hints = Vec::new();
    if workspace.join("package-lock.json").exists() {
        hints.push("npm");
    }
    if workspace.join("pnpm-lock.yaml").exists() {
        hints.push("pnpm");
    }
    if workspace.join("yarn.lock").exists() {
        hints.push("yarn");
    }
    if workspace.join("Cargo.toml").exists() {
        hints.push("cargo");
    }
    if workspace.join("pyproject.toml").exists() {
        hints.push("python");
    }
    if workspace.join("go.mod").exists() {
        hints.push("go");
    }
    hints
}

fn estimate_tokens(prompt: &str) -> usize {
    (prompt.chars().count() / 4).max(prompt.split_whitespace().count())
}

fn route_recommendation(prompt: &str, token_estimate: usize) -> String {
    let lower = prompt.to_lowercase();
    let broad = ["build", "implement", "refactor", "migrate", "redesign", "architecture"]
        .iter()
        .any(|needle| lower.contains(needle));
    let risky = ["delete", "auth", "security", "payment", "database", "migration"]
        .iter()
        .any(|needle| lower.contains(needle));

    if token_estimate > 180 || broad || risky {
        "plan-first".to_string()
    } else {
        "direct-run".to_string()
    }
}

fn improve_prompt(prompt: &str) -> String {
    let trimmed = prompt.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    format!(
        "Objective:\n{trimmed}\n\nContext:\nInspect the selected repository before changing files. Preserve existing conventions and avoid unrelated refactors.\n\nConstraints:\nUse workspace-write permissions only inside the selected repo. Surface uncertainty before risky changes.\n\nAcceptance criteria:\n- Implement the requested behavior completely.\n- Keep changes focused and easy to review.\n- Run the most relevant available checks.\n\nVerification:\nReport commands run, results, and any remaining risk."
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(CodexState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            codex_connect,
            codex_rpc,
            codex_resolve_server_request,
            codex_stop,
            codex_delete_profile,
            list_git_branches,
            checkout_git_branch,
            run_preflight
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_codex_binary_on_path() {
        let directory = env::temp_dir().join(format!(
            "orchestrator-codex-path-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&directory).expect("create test directory");

        let executable = if cfg!(windows) { "codex.exe" } else { "codex" };
        let binary = directory.join(executable);
        std::fs::write(&binary, b"test").expect("create test binary");
        let path_value = env::join_paths([&directory]).expect("join test PATH");

        assert_eq!(find_codex_on_path(Some(path_value)), Some(binary));

        std::fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn account_profile_paths_are_confined_to_app_data() {
        let base = Path::new("/tmp/orchestrator-test-data");
        assert_eq!(
            account_profile_root(base, 42).unwrap(),
            base.join("codex-accounts/42")
        );
        assert!(account_profile_root(base, 0).is_err());
        assert!(account_profile_root(base, -1).is_err());
    }

    #[test]
    fn pending_requests_are_filtered_by_account() {
        let (sender_one, _receiver_one) = channel();
        let (sender_two, _receiver_two) = channel();
        let mut pending = HashMap::new();
        pending.insert(
            "1".to_string(),
            PendingResponse {
                account_id: 7,
                sender: sender_one,
            },
        );
        pending.insert(
            "2".to_string(),
            PendingResponse {
                account_id: 8,
                sender: sender_two,
            },
        );

        assert_eq!(pending_keys_for_account(&pending, 7), vec!["1"]);
        assert_eq!(pending_keys_for_account(&pending, 8), vec!["2"]);
    }

    #[test]
    fn account_events_include_their_owner() {
        let event = CodexMessageEvent {
            account_id: 9,
            message: json!({ "method": "account/updated" }),
        };
        let value = serde_json::to_value(event).unwrap();

        assert_eq!(value["accountId"], 9);
        assert_eq!(value["message"]["method"], "account/updated");
    }

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
}
