use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc::{channel, Sender},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_sql::{Migration, MigrationKind};

const DATABASE_URL: &str = "sqlite:app.db";

type PendingMap = Arc<Mutex<HashMap<String, Sender<Result<Value, String>>>>>;

struct CodexProcess {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
}

#[derive(Default)]
struct CodexState {
    process: Mutex<Option<CodexProcess>>,
    pending: PendingMap,
    next_id: AtomicU64,
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
    status: String,
    message: String,
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
    ]
}

fn emit_process(app: &AppHandle, status: &str, message: impl Into<String>) {
    let _ = app.emit(
        "codex:process",
        ProcessEvent {
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

fn process_stdout(app: AppHandle, stdout: impl std::io::Read + Send + 'static, pending: PendingMap) {
    for line in BufReader::new(stdout).lines() {
        match line {
            Ok(line) if line.trim().is_empty() => {}
            Ok(line) => match serde_json::from_str::<Value>(&line) {
                Ok(message) => {
                    let method = message.get("method").and_then(Value::as_str);
                    let id = message.get("id").cloned();

                    match (method, id) {
                        (Some(_), Some(_)) => {
                            let _ = app.emit("codex:server-request", message);
                        }
                        (Some(_), None) => {
                            let _ = app.emit("codex:notification", message);
                        }
                        (None, Some(response_id)) => {
                            let key = pending_key(&response_id);
                            let sender = pending.lock().ok().and_then(|mut map| map.remove(&key));

                            if let Some(sender) = sender {
                                if let Some(error) = message.get("error") {
                                    let _ = sender.send(Err(error.to_string()));
                                } else {
                                    let result = message.get("result").cloned().unwrap_or(Value::Null);
                                    let _ = sender.send(Ok(result));
                                }
                            } else {
                                emit_process(&app, "warning", format!("Unmatched Codex response: {line}"));
                            }
                        }
                        (None, None) => {
                            emit_process(&app, "warning", format!("Unknown Codex message: {line}"));
                        }
                    }
                }
                Err(err) => emit_process(&app, "warning", format!("Invalid Codex JSONL: {err}")),
            },
            Err(err) => {
                emit_process(&app, "error", format!("Failed reading Codex stdout: {err}"));
                break;
            }
        }
    }

    emit_process(&app, "exited", "Codex app-server stdout closed");
}

fn process_stderr(app: AppHandle, stderr: impl std::io::Read + Send + 'static) {
    for line in BufReader::new(stderr).lines() {
        match line {
            Ok(line) if !line.trim().is_empty() => emit_process(&app, "stderr", line),
            Ok(_) => {}
            Err(err) => {
                emit_process(&app, "error", format!("Failed reading Codex stderr: {err}"));
                break;
            }
        }
    }
}

fn process_stdin(state: &CodexState) -> Result<Arc<Mutex<ChildStdin>>, String> {
    let process = state
        .process
        .lock()
        .map_err(|_| "Codex process lock was poisoned".to_string())?;
    process
        .as_ref()
        .map(|process| Arc::clone(&process.stdin))
        .ok_or_else(|| "Codex app-server is not connected".to_string())
}

fn send_request(state: &CodexState, method: &str, params: Value) -> Result<Value, String> {
    let stdin = process_stdin(state)?;
    let id = state.next_id.fetch_add(1, Ordering::SeqCst);
    let key = id.to_string();
    let (tx, rx) = channel();

    state
        .pending
        .lock()
        .map_err(|_| "Codex pending map lock was poisoned".to_string())?
        .insert(key.clone(), tx);

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

fn send_notification(state: &CodexState, message: Value) -> Result<(), String> {
    let stdin = process_stdin(state)?;
    write_message(&stdin, &message)
}

#[tauri::command]
fn codex_connect(app: AppHandle, state: State<'_, CodexState>) -> Result<CodexConnectResult, String> {
    {
        let mut process = state
            .process
            .lock()
            .map_err(|_| "Codex process lock was poisoned".to_string())?;

        if let Some(existing) = process.as_mut() {
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
        }

        let mut child = Command::new("codex")
            .args(["app-server", "--listen", "stdio://"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|err| format!("Failed to start `codex app-server`: {err}"))?;

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
        let stdout_app = app.clone();
        std::thread::spawn(move || process_stdout(stdout_app, stdout, pending));

        let stderr_app = app.clone();
        std::thread::spawn(move || process_stderr(stderr_app, stderr));

        *process = Some(CodexProcess {
            child,
            stdin: Arc::new(Mutex::new(stdin)),
        });
    }

    let initialize = send_request(
        &state,
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

    send_notification(&state, json!({ "method": "initialized" }))?;

    let pid = state
        .process
        .lock()
        .ok()
        .and_then(|process| process.as_ref().map(|process| process.child.id()));

    emit_process(&app, "connected", "Codex app-server connected");

    Ok(CodexConnectResult {
        pid,
        already_connected: false,
        initialize,
    })
}

#[tauri::command]
fn codex_rpc(
    method: String,
    params: Value,
    state: State<'_, CodexState>,
) -> Result<Value, String> {
    send_request(&state, &method, params)
}

#[tauri::command]
fn codex_resolve_server_request(
    id: Value,
    result: Value,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    send_notification(
        &state,
        json!({
            "id": id,
            "result": result
        }),
    )
}

#[tauri::command]
fn codex_stop(app: AppHandle, state: State<'_, CodexState>) -> Result<(), String> {
    let mut process = state
        .process
        .lock()
        .map_err(|_| "Codex process lock was poisoned".to_string())?;

    if let Some(mut process) = process.take() {
        let _ = process.child.kill();
        let _ = process.child.wait();
    }

    if let Ok(mut pending) = state.pending.lock() {
        for (_, sender) in pending.drain() {
            let _ = sender.send(Err("Codex app-server was stopped".to_string()));
        }
    }

    emit_process(&app, "stopped", "Codex app-server stopped");
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

    let codex_probe = run_command("codex", &["--version"]);
    push_check(
        &mut checks,
        "codex",
        "Codex CLI",
        if codex_probe.ok { "pass" } else { "fail" },
        if codex_probe.ok {
            codex_probe.stdout.trim().to_string()
        } else {
            "Codex CLI is not available on PATH".to_string()
        },
        output_detail(&codex_probe),
    );

    let auth_probe = run_command("codex", &["doctor", "--json"]);
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

fn run_command(program: &str, args: &[&str]) -> CommandProbe {
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
