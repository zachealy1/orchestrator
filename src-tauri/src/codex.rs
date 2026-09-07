use super::*;

pub(crate) fn profile_key_for_account(account_id: i64) -> String {
    if account_id == DEFAULT_CODEX_PROFILE_ID {
        DEFAULT_CODEX_PROFILE_KEY.to_string()
    } else {
        format!("account:{account_id}")
    }
}

pub(crate) fn emit_process(
    app: &AppHandle,
    account_id: i64,
    status: &str,
    message: impl Into<String>,
) {
    let _ = app.emit(
        "codex:process",
        ProcessEvent {
            account_id,
            profile_key: profile_key_for_account(account_id),
            status: status.to_string(),
            message: message.into(),
        },
    );
}

pub(crate) fn pending_key(id: &Value) -> String {
    match id {
        Value::String(value) => value.clone(),
        other => other.to_string(),
    }
}

pub(crate) fn write_message(stdin: &Arc<Mutex<ChildStdin>>, message: &Value) -> Result<(), String> {
    let mut writer = stdin
        .lock()
        .map_err(|_| "Codex stdin lock was poisoned".to_string())?;
    writeln!(writer, "{}", message).map_err(|err| format!("Failed to write to Codex: {err}"))?;
    writer
        .flush()
        .map_err(|err| format!("Failed to flush Codex stdin: {err}"))
}

pub(crate) fn unix_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

pub(crate) fn clear_active_login(
    active_login: &Arc<Mutex<Option<ActiveCodexLogin>>>,
    account_id: i64,
    connection_generation: Option<u64>,
    login_id: Option<&str>,
) -> bool {
    let Ok(mut active) = active_login.lock() else {
        return false;
    };
    let Some(current) = active.as_ref() else {
        return false;
    };
    if current.account_id != account_id
        || connection_generation
            .is_some_and(|generation| current.connection_generation != generation)
        || login_id.is_some_and(|id| current.login_id.as_deref() != Some(id))
    {
        return false;
    }
    *active = None;
    true
}

pub(crate) fn active_login_snapshot(
    active_login: &Arc<Mutex<Option<ActiveCodexLogin>>>,
) -> Result<Option<ActiveCodexLogin>, String> {
    let active = active_login
        .lock()
        .map_err(|_| "Codex login lock was poisoned".to_string())?;
    if active
        .as_ref()
        .is_some_and(|attempt| attempt.expires_at_ms <= unix_timestamp_ms())
    {
        return Ok(None);
    }
    Ok(active.clone())
}

pub(crate) fn process_stdout(
    app: AppHandle,
    account_id: i64,
    connection_generation: u64,
    codex_home: PathBuf,
    stdout: impl std::io::Read + Send + 'static,
    pending: PendingMap,
    pending_server_requests: PendingServerRequestMap,
    next_server_request_token: Arc<AtomicU64>,
    active_login: Arc<Mutex<Option<ActiveCodexLogin>>>,
) {
    for line in BufReader::new(stdout).lines() {
        match line {
            Ok(line) if line.trim().is_empty() => {}
            Ok(line) => match serde_json::from_str::<Value>(&line) {
                Ok(mut message) => {
                    let method = message
                        .get("method")
                        .and_then(Value::as_str)
                        .map(str::to_string);
                    let id = message.get("id").cloned();

                    if account_id != DEFAULT_CODEX_PROFILE_ID && id.is_none() {
                        let should_prepare_alias = matches!(
                            method.as_deref(),
                            Some("thread/started") | Some("turn/started") | Some("item/started")
                        );
                        if should_prepare_alias {
                            if let Some(thread_id) = notification_thread_id(&message) {
                                if let Err(error) =
                                    prepare_generated_image_thread_alias(&codex_home, thread_id)
                                {
                                    eprintln!(
                                        "Generated-image preview warning for account {account_id}: \
                                         could not prepare shared storage: {error}"
                                    );
                                }
                            }
                        }
                        if let Err(error) =
                            normalize_image_generation_notification(&codex_home, &mut message)
                        {
                            eprintln!(
                                "Generated-image preview warning for account {account_id}: \
                                 could not normalize output: {error}"
                            );
                        }
                    }

                    match (method.as_deref(), id) {
                        (Some(_), Some(request_id)) => {
                            let request_token = register_server_request(
                                &pending_server_requests,
                                &next_server_request_token,
                                account_id,
                                connection_generation,
                                request_id,
                            );
                            let _ = app.emit(
                                "codex:server-request",
                                CodexMessageEvent {
                                    account_id,
                                    profile_key: profile_key_for_account(account_id),
                                    message,
                                    request_token: Some(request_token),
                                },
                            );
                        }
                        (Some(method), None) => {
                            if method == "account/login/completed" {
                                let login_id = message
                                    .get("params")
                                    .and_then(|params| params.get("loginId"))
                                    .and_then(Value::as_str);
                                clear_active_login(
                                    &active_login,
                                    account_id,
                                    Some(connection_generation),
                                    login_id,
                                );
                            }
                            if method == "serverRequest/resolved" {
                                if let Some(request_id) = message
                                    .get("params")
                                    .and_then(|params| params.get("requestId"))
                                {
                                    resolve_tracked_server_request(
                                        &pending_server_requests,
                                        account_id,
                                        connection_generation,
                                        request_id,
                                    );
                                }
                            }
                            let _ = app.emit(
                                "codex:notification",
                                CodexMessageEvent {
                                    account_id,
                                    profile_key: profile_key_for_account(account_id),
                                    message,
                                    request_token: None,
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
                                    let result =
                                        message.get("result").cloned().unwrap_or(Value::Null);
                                    let _ = pending_response.sender.send(Ok(result));
                                }
                            } else if !key.starts_with("orchestrator-login-timeout-") {
                                emit_process(
                                    &app,
                                    account_id,
                                    "warning",
                                    format!("Unmatched Codex response: {line}"),
                                );
                            }
                        }
                        (None, None) => {
                            emit_process(
                                &app,
                                account_id,
                                "warning",
                                format!("Unknown Codex message: {line}"),
                            );
                        }
                    }
                }
                Err(err) => emit_process(
                    &app,
                    account_id,
                    "warning",
                    format!("Invalid Codex JSONL: {err}"),
                ),
            },
            Err(err) => {
                emit_process(
                    &app,
                    account_id,
                    "error",
                    format!("Failed reading Codex stdout: {err}"),
                );
                break;
            }
        }
    }

    reject_pending_for_account(
        &pending,
        account_id,
        "Codex app-server exited before responding",
    );
    clear_server_requests_for_generation(
        &pending_server_requests,
        account_id,
        connection_generation,
    );
    clear_active_login(&active_login, account_id, Some(connection_generation), None);
    emit_process(&app, account_id, "exited", "Codex app-server stdout closed");
}

pub(crate) fn register_server_request(
    pending: &PendingServerRequestMap,
    sequence: &AtomicU64,
    account_id: i64,
    connection_generation: u64,
    request_id: Value,
) -> String {
    let mut requests = pending
        .lock()
        .expect("pending server request lock was poisoned");
    if let Some((token, _)) = requests.iter().find(|(_, request)| {
        request.account_id == account_id
            && request.connection_generation == connection_generation
            && request.request_id == request_id
    }) {
        return token.clone();
    }

    let token = format!(
        "server-request-{account_id}-{connection_generation}-{}",
        sequence.fetch_add(1, Ordering::SeqCst) + 1
    );
    requests.insert(
        token.clone(),
        PendingServerRequest {
            account_id,
            connection_generation,
            request_id,
            response_state: ServerRequestResponseState::Pending,
        },
    );
    token
}

pub(crate) fn resolve_tracked_server_request(
    pending: &PendingServerRequestMap,
    account_id: i64,
    connection_generation: u64,
    request_id: &Value,
) {
    if let Ok(mut requests) = pending.lock() {
        let token = requests.iter().find_map(|(token, request)| {
            (request.account_id == account_id
                && request.connection_generation == connection_generation
                && &request.request_id == request_id)
                .then(|| token.clone())
        });
        if let Some(token) = token {
            requests.remove(&token);
        }
    }
}

pub(crate) fn clear_server_requests_for_generation(
    pending: &PendingServerRequestMap,
    account_id: i64,
    connection_generation: u64,
) {
    if let Ok(mut requests) = pending.lock() {
        requests.retain(|_, request| {
            request.account_id != account_id
                || request.connection_generation != connection_generation
        });
    }
}

pub(crate) fn clear_server_requests_for_account(
    pending: &PendingServerRequestMap,
    account_id: i64,
) {
    if let Ok(mut requests) = pending.lock() {
        requests.retain(|_, request| request.account_id != account_id);
    }
}

pub(crate) fn claim_server_request(
    pending: &PendingServerRequestMap,
    account_id: i64,
    connection_generation: u64,
    request_token: &str,
    request_id: &Value,
) -> Result<(), String> {
    let mut requests = pending
        .lock()
        .map_err(|_| "Pending Codex server request lock was poisoned".to_string())?;
    let request = requests
        .get_mut(request_token)
        .ok_or_else(|| "This Codex approval request is stale or already resolved".to_string())?;
    if request.account_id != account_id
        || request.connection_generation != connection_generation
        || &request.request_id != request_id
    {
        return Err("The approval response does not match the active native request".to_string());
    }
    if request.response_state != ServerRequestResponseState::Pending {
        return Err("A response to this Codex approval request was already submitted".to_string());
    }
    request.response_state = ServerRequestResponseState::Responding;
    Ok(())
}

pub(crate) fn release_server_request_claim(pending: &PendingServerRequestMap, request_token: &str) {
    if let Ok(mut requests) = pending.lock() {
        if let Some(request) = requests.get_mut(request_token) {
            request.response_state = ServerRequestResponseState::Pending;
        }
    }
}

pub(crate) fn process_stderr(
    app: AppHandle,
    account_id: i64,
    stderr: impl std::io::Read + Send + 'static,
) {
    for line in BufReader::new(stderr).lines() {
        match line {
            Ok(line) if !line.trim().is_empty() => emit_process(&app, account_id, "stderr", line),
            Ok(_) => {}
            Err(err) => {
                emit_process(
                    &app,
                    account_id,
                    "error",
                    format!("Failed reading Codex stderr: {err}"),
                );
                break;
            }
        }
    }
}

pub(crate) fn process_stdin(
    state: &CodexState,
    account_id: i64,
) -> Result<Arc<Mutex<ChildStdin>>, String> {
    let processes = state
        .processes
        .lock()
        .map_err(|_| "Codex processes lock was poisoned".to_string())?;
    processes
        .get(&account_id)
        .map(|process| Arc::clone(&process.stdin))
        .ok_or_else(|| format!("Codex account {account_id} is not connected"))
}

pub(crate) async fn send_request(
    state: &CodexState,
    account_id: i64,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let stdin = process_stdin(state, account_id)?;
    let id = state.next_id.fetch_add(1, Ordering::SeqCst);
    let key = id.to_string();
    let (tx, rx) = oneshot::channel();

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

    match timeout(Duration::from_secs(60), rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => {
            let _ = state.pending.lock().map(|mut map| map.remove(&key));
            Err(format!(
                "Codex response channel closed while waiting for {method}"
            ))
        }
        Err(_) => {
            let _ = state.pending.lock().map(|mut map| map.remove(&key));
            Err(format!("Timed out waiting for Codex response to {method}"))
        }
    }
}

pub(crate) fn project_historical_turn_activity(response: &Value) -> HistoricalTurnActivityResponse {
    let mut commands: Vec<HistoricalCommandActivity> = Vec::new();
    let mut edited_files: Vec<HistoricalEditedFile> = Vec::new();
    let mut tool_activities: Vec<HistoricalToolActivity> = Vec::new();
    let items = response
        .get("data")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for item in items {
        match item.get("type").and_then(Value::as_str) {
            Some("commandExecution") => {
                let id = item
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("historical-command")
                    .to_string();
                let command = item
                    .get("command")
                    .and_then(Value::as_str)
                    .unwrap_or("Command")
                    .to_string();
                let status = match item.get("status").and_then(Value::as_str) {
                    Some("inProgress") => "running",
                    Some("failed") => "failed",
                    Some("declined") => "declined",
                    _ => "completed",
                }
                .to_string();
                let projected = HistoricalCommandActivity {
                    id,
                    command,
                    status,
                    duration_ms: item.get("durationMs").and_then(Value::as_i64),
                };
                if let Some(existing) = commands
                    .iter_mut()
                    .find(|command| command.id == projected.id)
                {
                    if !is_terminal_historical_status(&existing.status)
                        || is_terminal_historical_status(&projected.status)
                    {
                        *existing = projected;
                    }
                } else {
                    commands.push(projected);
                }
            }
            Some("fileChange") => {
                let changes = item
                    .get("changes")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                for change in changes {
                    let Some(path) = change.get("path").and_then(Value::as_str) else {
                        continue;
                    };
                    let diff = change.get("diff").and_then(Value::as_str).unwrap_or("");
                    let (additions, deletions) = count_unified_diff_lines(diff);
                    let kind = change
                        .get("kind")
                        .and_then(Value::as_object)
                        .and_then(|kind| kind.get("type"))
                        .and_then(Value::as_str);
                    let moved = change
                        .get("kind")
                        .and_then(Value::as_object)
                        .and_then(|kind| kind.get("move_path"))
                        .and_then(Value::as_str)
                        .is_some();
                    let status = match (kind, moved) {
                        (_, true) => "renamed",
                        (Some("add"), _) => "added",
                        (Some("delete"), _) => "deleted",
                        _ => "modified",
                    };

                    if let Some(existing) = edited_files.iter_mut().find(|file| file.path == path) {
                        existing.additions = additions;
                        existing.deletions = deletions;
                        existing.status = status.to_string();
                    } else {
                        edited_files.push(HistoricalEditedFile {
                            path: path.to_string(),
                            name: Path::new(path)
                                .file_name()
                                .and_then(OsStr::to_str)
                                .unwrap_or(path)
                                .to_string(),
                            additions,
                            deletions,
                            status: status.to_string(),
                        });
                    }
                }
            }
            Some(
                item_type @ ("mcpToolCall"
                | "dynamicToolCall"
                | "collabToolCall"
                | "collabAgentToolCall"
                | "subAgentActivity"
                | "webSearch"),
            ) => {
                let id = item
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("historical-tool")
                    .to_string();
                let projected = project_historical_tool_activity(item_type, &id, &item);
                if let Some(existing) = tool_activities
                    .iter_mut()
                    .find(|activity| activity.id == id)
                {
                    if !is_terminal_historical_status(&existing.status)
                        || is_terminal_historical_status(&projected.status)
                    {
                        *existing = projected;
                    }
                } else {
                    tool_activities.push(projected);
                }
            }
            _ => {}
        }
    }

    HistoricalTurnActivityResponse {
        commands,
        edited_files,
        tool_activities,
        next_cursor: response
            .get("nextCursor")
            .and_then(Value::as_str)
            .map(str::to_string),
    }
}

fn project_historical_tool_activity(
    item_type: &str,
    id: &str,
    item: &Value,
) -> HistoricalToolActivity {
    let arguments = item.get("arguments").and_then(Value::as_object);
    let server = safe_protocol_identifier(item.get("server").and_then(Value::as_str))
        .unwrap_or_else(|| "integration".to_string());
    let tool = safe_protocol_identifier(item.get("tool").and_then(Value::as_str))
        .unwrap_or_else(|| "tool".to_string());
    let title = arguments
        .and_then(|arguments| arguments.get("title"))
        .and_then(Value::as_str)
        .and_then(sanitize_tool_activity_title);
    let mut safe_details = Vec::new();

    if let Some(repository) = arguments
        .and_then(|arguments| {
            first_argument_string(arguments, &["repo_full_name", "repository", "repo"])
        })
        .filter(|value| is_safe_repository_name(value))
    {
        safe_details.push(HistoricalToolActivityDetail {
            label: "Repository".to_string(),
            value: repository.to_string(),
        });
    }

    if let Some(path) = arguments
        .and_then(|arguments| first_argument_string(arguments, &["file_path", "path", "filename"]))
    {
        let filename = Path::new(path)
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or("");
        if !filename.is_empty()
            && filename.chars().count() <= 160
            && !contains_sensitive_activity_text(filename)
        {
            safe_details.push(HistoricalToolActivityDetail {
                label: "File".to_string(),
                value: filename.to_string(),
            });
        }
    }

    if let Some(origin) = arguments
        .and_then(|arguments| first_argument_string(arguments, &["url", "uri"]))
        .and_then(safe_http_origin)
    {
        safe_details.push(HistoricalToolActivityDetail {
            label: "Origin".to_string(),
            value: origin,
        });
    }

    if let Some(action) = arguments
        .and_then(|arguments| first_argument_string(arguments, &["action", "operation"]))
        .filter(|value| is_safe_activity_action(value))
    {
        safe_details.push(HistoricalToolActivityDetail {
            label: "Action".to_string(),
            value: action.to_string(),
        });
    }

    HistoricalToolActivity {
        id: id.to_string(),
        item_type: item_type.to_string(),
        server,
        tool,
        title,
        status: normalize_historical_tool_status(item.get("status").and_then(Value::as_str)),
        duration_ms: item
            .get("durationMs")
            .and_then(Value::as_i64)
            .or_else(|| item.get("elapsedMs").and_then(Value::as_i64)),
        sequence: item.get("sequence").and_then(Value::as_i64),
        safe_details,
    }
}

fn safe_protocol_identifier(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if value.is_empty()
        || value.len() > 160
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_.:/-".contains(character))
    {
        return None;
    }
    Some(value.to_string())
}

fn sanitize_tool_activity_title(value: &str) -> Option<String> {
    let normalized = value
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if normalized.is_empty()
        || normalized.chars().count() > 180
        || normalized.contains("http://")
        || normalized.contains("https://")
        || contains_sensitive_activity_text(&normalized)
    {
        return None;
    }
    Some(normalized)
}

fn contains_sensitive_activity_text(value: &str) -> bool {
    let normalized = value.to_ascii_lowercase().replace([' ', '-', '_'], "");
    [
        "authorization",
        "bearer",
        "cookie",
        "credential",
        "devicecode",
        "onetime",
        "otp",
        "password",
        "passcode",
        "secret",
        "token",
        "apikey",
        "cardnumber",
        "cvv",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
}

fn first_argument_string<'a>(
    arguments: &'a serde_json::Map<String, Value>,
    keys: &[&str],
) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| arguments.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn is_safe_repository_name(value: &str) -> bool {
    let mut segments = value.split('/');
    let Some(owner) = segments.next() else {
        return false;
    };
    let Some(repository) = segments.next() else {
        return false;
    };
    segments.next().is_none()
        && !owner.is_empty()
        && !repository.is_empty()
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "_.-/".contains(character))
}

fn safe_http_origin(value: &str) -> Option<String> {
    let parsed = url::Url::parse(value).ok()?;
    if !matches!(parsed.scheme(), "http" | "https")
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return None;
    }
    Some(parsed.origin().ascii_serialization())
}

fn is_safe_activity_action(value: &str) -> bool {
    !value.is_empty()
        && value.chars().count() <= 80
        && !contains_sensitive_activity_text(value)
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || " ._-".contains(character))
}

fn normalize_historical_tool_status(value: Option<&str>) -> String {
    match value {
        Some("pending") => "pending",
        Some("inProgress" | "running" | "started") => "running",
        Some("failed" | "error") => "failed",
        Some("declined" | "denied") => "declined",
        Some("cancelled" | "canceled" | "interrupted") => "interrupted",
        _ => "completed",
    }
    .to_string()
}

fn is_terminal_historical_status(status: &str) -> bool {
    matches!(status, "completed" | "failed" | "declined" | "interrupted")
}

pub(crate) fn project_subagent_thread(
    requested_thread_id: &str,
    response: &Value,
) -> Result<ProjectedSubagentThread, String> {
    let thread = response
        .get("thread")
        .or_else(|| response.get("data").and_then(|data| data.get("thread")))
        .unwrap_or(response);
    let thread_id = thread
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or(requested_thread_id)
        .to_string();
    if thread_id != requested_thread_id {
        return Err("Codex returned a different subagent thread".to_string());
    }
    let turns: Vec<ProjectedSubagentTurn> = thread
        .get("turns")
        .and_then(Value::as_array)
        .map(|turns| turns.iter().filter_map(project_subagent_turn).collect())
        .unwrap_or_default();
    let active_turn_id = turns
        .iter()
        .rev()
        .find(|turn| matches!(turn.status.as_str(), "inProgress" | "running" | "active"))
        .map(|turn| turn.id.clone());
    Ok(ProjectedSubagentThread {
        thread_id,
        status: project_status_label(thread.get("status")),
        active_turn_id,
        turns,
    })
}

pub(crate) fn project_subagent_turn(turn: &Value) -> Option<ProjectedSubagentTurn> {
    let id = turn.get("id").and_then(Value::as_str)?.to_string();
    let status = project_status_label(turn.get("status")).unwrap_or_else(|| "unknown".to_string());
    let items = turn
        .get("items")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(project_subagent_item).collect())
        .unwrap_or_default();
    Some(ProjectedSubagentTurn {
        id,
        status,
        started_at: read_projected_timestamp(turn, &["startedAt", "createdAt"]),
        completed_at: read_projected_timestamp(turn, &["completedAt", "updatedAt"]),
        items,
    })
}

pub(crate) fn project_subagent_item(item: &Value) -> Option<Value> {
    let item_type = item.get("type").and_then(Value::as_str)?;
    let id = item
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    match item_type {
        "userMessage" => {
            let text = project_user_message_text(item);
            (!text.is_empty()).then(|| {
                json!({
                    "id": id,
                    "kind": "user",
                    "text": text
                })
            })
        }
        "agentMessage" => {
            let text = item.get("text").and_then(Value::as_str)?;
            Some(json!({
                "id": id,
                "kind": "assistant",
                "text": text,
                "phase": item.get("phase").and_then(Value::as_str)
            }))
        }
        "plan" => {
            let text = item.get("text").and_then(Value::as_str)?;
            Some(json!({
                "id": id,
                "kind": "plan",
                "text": text
            }))
        }
        "reasoning" => {
            let summaries = project_reasoning_summaries(item.get("summary"));
            (!summaries.is_empty()).then(|| {
                json!({
                    "id": id,
                    "kind": "reasoning",
                    "summaries": summaries
                })
            })
        }
        "commandExecution" => Some(project_activity_item(
            id,
            "command",
            "Shell command".to_string(),
            project_status_label(item.get("status")),
        )),
        "fileChange" => {
            let names = item
                .get("changes")
                .and_then(Value::as_array)
                .map(|changes| {
                    changes
                        .iter()
                        .filter_map(|change| {
                            change
                                .get("path")
                                .and_then(Value::as_str)
                                .and_then(|path| Path::new(path).file_name())
                                .and_then(OsStr::to_str)
                                .map(str::to_string)
                        })
                        .take(12)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let label = if names.is_empty() {
                "File changes".to_string()
            } else {
                format!("Edited {}", names.join(", "))
            };
            Some(project_activity_item(
                id,
                "file",
                label,
                project_status_label(item.get("status")),
            ))
        }
        "mcpToolCall" => {
            let server = item.get("server").and_then(Value::as_str).unwrap_or("MCP");
            let tool = item.get("tool").and_then(Value::as_str).unwrap_or("tool");
            Some(project_activity_item(
                id,
                "mcp",
                format!("{server} / {tool}"),
                project_status_label(item.get("status")),
            ))
        }
        "dynamicToolCall" => Some(project_activity_item(
            id,
            "mcp",
            item.get("tool")
                .and_then(Value::as_str)
                .unwrap_or("Dynamic tool")
                .to_string(),
            project_status_label(item.get("status")),
        )),
        "collabAgentToolCall" | "collabToolCall" => Some(project_activity_item(
            id,
            "collaboration",
            item.get("tool")
                .and_then(Value::as_str)
                .map(humanize_collab_tool)
                .unwrap_or_else(|| "Subagent activity".to_string()),
            project_status_label(item.get("status")),
        )),
        "webSearch" => Some(project_activity_item(
            id,
            "web",
            "Web search".to_string(),
            project_status_label(item.get("status")),
        )),
        _ => None,
    }
}

pub(crate) fn project_activity_item(
    id: String,
    activity_kind: &str,
    label: String,
    status: Option<String>,
) -> Value {
    json!({
        "id": id,
        "kind": "activity",
        "activityKind": activity_kind,
        "label": label,
        "status": status
    })
}

pub(crate) fn project_user_message_text(item: &Value) -> String {
    if let Some(text) = item.get("text").and_then(Value::as_str) {
        return text.to_string();
    }

    if let Some(content) = item.get("content").and_then(Value::as_array) {
        return content
            .iter()
            .filter_map(|part| {
                part.as_str()
                    .or_else(|| part.get("text").and_then(Value::as_str))
                    .or_else(|| part.get("value").and_then(Value::as_str))
                    .or_else(|| part.get("content").and_then(Value::as_str))
            })
            .filter(|text| !text.trim().is_empty())
            .collect::<Vec<_>>()
            .join("\n");
    }

    item.get("message")
        .and_then(|message| message.get("text"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

pub(crate) fn project_reasoning_summaries(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| {
                    part.as_str().or_else(|| {
                        part.get("text")
                            .and_then(Value::as_str)
                            .or_else(|| part.get("summary").and_then(Value::as_str))
                    })
                })
                .filter(|summary| !summary.trim().is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn read_projected_timestamp(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::to_string)
}

pub(crate) fn project_status_label(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(status)) => Some(status.clone()),
        Some(Value::Object(status)) => status
            .get("type")
            .or_else(|| status.get("status"))
            .and_then(Value::as_str)
            .map(str::to_string),
        _ => None,
    }
}

pub(crate) fn humanize_collab_tool(tool: &str) -> String {
    match tool {
        "spawnAgent" | "spawn_agent" => "Started subagent",
        "sendInput" | "send_input" => "Sent subagent instruction",
        "resumeAgent" | "resume_agent" => "Resumed subagent",
        "wait" | "wait_agent" => "Waited for subagent",
        "closeAgent" | "close_agent" => "Closed subagent",
        _ => "Subagent activity",
    }
    .to_string()
}

pub(crate) fn external_item_text(item: &Value) -> String {
    if let Some(text) = item.get("text").and_then(Value::as_str) {
        return text.to_string();
    }

    if let Some(content) = item.get("content").and_then(Value::as_array) {
        return content
            .iter()
            .filter_map(|part| {
                part.as_str()
                    .or_else(|| part.get("text").and_then(Value::as_str))
                    .or_else(|| part.get("value").and_then(Value::as_str))
                    .or_else(|| part.get("content").and_then(Value::as_str))
            })
            .collect::<String>();
    }

    item.get("message")
        .and_then(|message| message.get("text"))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

pub(crate) fn external_turn_items(turn: &Value) -> Vec<Value> {
    for key in ["items", "output", "input"] {
        if let Some(items) = turn.get(key).and_then(Value::as_array) {
            if !items.is_empty() {
                return items.clone();
            }
        }
    }
    Vec::new()
}

pub(crate) fn external_timestamp(turn: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        let value = turn.get(*key)?;
        value
            .as_str()
            .map(str::to_string)
            .or_else(|| value.as_i64().map(|timestamp| timestamp.to_string()))
            .or_else(|| value.as_u64().map(|timestamp| timestamp.to_string()))
    })
}

pub(crate) fn external_token_metric(turn: &Value, keys: &[&str]) -> Option<i64> {
    [
        turn.get("tokenUsage"),
        turn.get("token_usage"),
        turn.get("usage"),
    ]
    .into_iter()
    .flatten()
    .find_map(|usage| {
        keys.iter().find_map(|key| {
            let value = usage.get(*key)?;
            value
                .as_i64()
                .or_else(|| value.as_u64().and_then(|number| i64::try_from(number).ok()))
        })
    })
}

pub(crate) fn external_turn_error(turn: &Value) -> Option<String> {
    let error = turn.get("error")?;
    if error.is_null() {
        return None;
    }
    error
        .as_str()
        .map(str::to_string)
        .or_else(|| {
            error
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| Some(error.to_string()))
}

pub(crate) fn project_external_transcript_turn(
    turn: &Value,
) -> Option<ExternalTranscriptTurnSummary> {
    let items = external_turn_items(turn);
    let prompt = items
        .iter()
        .filter(|item| item.get("type").and_then(Value::as_str) == Some("userMessage"))
        .map(external_item_text)
        .filter(|text| !text.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
        .trim()
        .to_string();
    if prompt.is_empty() {
        return None;
    }

    let agent_messages = items
        .iter()
        .filter(|item| item.get("type").and_then(Value::as_str) == Some("agentMessage"))
        .collect::<Vec<_>>();
    let final_agent = agent_messages
        .iter()
        .find(|item| item.get("phase").and_then(Value::as_str) == Some("final_answer"))
        .copied()
        .or_else(|| agent_messages.last().copied());
    let final_message = final_agent
        .map(|item| external_item_text(item).trim().to_string())
        .unwrap_or_default();
    let raw_status = turn
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let status = match raw_status {
        "failed" => "failed",
        "running" => "running",
        "interrupted" | "cancelled" | "canceled" => "interrupted",
        _ if !final_message.is_empty() => "completed",
        _ => "interrupted",
    }
    .to_string();

    Some(ExternalTranscriptTurnSummary {
        slot_index: 0,
        turn_id: turn.get("id").and_then(Value::as_str).map(str::to_string),
        prompt,
        final_message,
        error: external_turn_error(turn),
        status,
        started_at: external_timestamp(
            turn,
            &["startedAt", "started_at", "createdAt", "created_at"],
        ),
        completed_at: external_timestamp(turn, &["completedAt", "completed_at"]),
        duration_ms: turn
            .get("durationMs")
            .or_else(|| turn.get("duration_ms"))
            .and_then(Value::as_i64),
        total_tokens: external_token_metric(turn, &["totalTokens", "total_tokens"]),
        model_context_window: external_token_metric(
            turn,
            &["modelContextWindow", "model_context_window"],
        ),
    })
}

pub(crate) fn transcript_sync_request_active(state: &CodexState, request_id: &str) -> bool {
    state
        .transcript_sync_requests
        .lock()
        .map(|requests| requests.contains(request_id))
        .unwrap_or(false)
}

pub(crate) async fn build_external_thread_transcript(
    state: &CodexState,
    thread_id: &str,
    source_version: &str,
    page_size: usize,
    request_id: &str,
) -> Result<ExternalTranscriptSnapshot, String> {
    let mut cursor: Option<String> = None;
    let mut seen_cursors = HashSet::new();
    let mut pages: Vec<Vec<ExternalTranscriptTurnSummary>> = Vec::new();

    loop {
        if !transcript_sync_request_active(state, request_id) {
            return Err("Transcript synchronization cancelled".to_string());
        }
        let response = send_request(
            state,
            DEFAULT_CODEX_PROFILE_ID,
            "thread/turns/list",
            json!({
                "threadId": thread_id,
                "cursor": cursor,
                "limit": page_size,
                "sortDirection": "desc",
                "itemsView": "summary",
            }),
        )
        .await?;
        if !transcript_sync_request_active(state, request_id) {
            return Err("Transcript synchronization cancelled".to_string());
        }

        let data = response
            .get("data")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if data.is_empty() {
            break;
        }
        pages.push(
            data.iter()
                .filter_map(project_external_transcript_turn)
                .collect(),
        );
        let next_cursor = response
            .get("nextCursor")
            .and_then(Value::as_str)
            .map(str::to_string);
        if let Some(next_cursor) = next_cursor.as_ref() {
            if !seen_cursors.insert(next_cursor.clone()) {
                return Err(
                    "Codex returned a repeated transcript cursor; synchronization stopped."
                        .to_string(),
                );
            }
        }
        cursor = next_cursor;
        if cursor.is_none() {
            break;
        }
    }

    pages.reverse();
    let mut turns = Vec::new();
    for mut page in pages {
        page.reverse();
        for mut turn in page {
            turn.slot_index = turns.len();
            turns.push(turn);
        }
    }

    Ok(ExternalTranscriptSnapshot {
        request_id: request_id.to_string(),
        thread_id: thread_id.to_string(),
        source_version: source_version.to_string(),
        total_turns: turns.len(),
        turns,
    })
}

pub(crate) fn count_unified_diff_lines(diff: &str) -> (usize, usize) {
    let additions = diff
        .lines()
        .filter(|line| line.starts_with('+') && !line.starts_with("+++"))
        .count();
    let deletions = diff
        .lines()
        .filter(|line| line.starts_with('-') && !line.starts_with("---"))
        .count();
    (additions, deletions)
}

pub(crate) fn send_notification(
    state: &CodexState,
    account_id: i64,
    message: Value,
) -> Result<(), String> {
    let stdin = process_stdin(state, account_id)?;
    write_message(&stdin, &message)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn codex_connect(
    account_id: i64,
    app: AppHandle,
    state: State<'_, CodexState>,
) -> Result<CodexConnectResult, String> {
    validate_account_id(account_id)?;
    let codex_home = ensure_codex_home(&app, account_id)?;
    connect_codex_profile(account_id, &app, &state, codex_home, true).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn codex_default_profile_connect(
    app: AppHandle,
    state: State<'_, CodexState>,
) -> Result<CodexConnectResult, String> {
    let codex_home = ensure_default_codex_home()?;
    connect_codex_profile(DEFAULT_CODEX_PROFILE_ID, &app, &state, codex_home, false).await
}

pub(crate) fn process_connection_generation(
    state: &CodexState,
    account_id: i64,
) -> Result<u64, String> {
    state
        .processes
        .lock()
        .map_err(|_| "Codex processes lock was poisoned".to_string())?
        .get(&account_id)
        .map(|process| process.connection_generation)
        .ok_or_else(|| format!("Codex account {account_id} is not connected"))
}

pub(crate) fn start_login_timeout_watchdog(
    active_login: Arc<Mutex<Option<ActiveCodexLogin>>>,
    stdin: Arc<Mutex<ChildStdin>>,
    attempt: ActiveCodexLogin,
) {
    std::thread::spawn(move || {
        std::thread::sleep(CODEX_LOGIN_TIMEOUT);
        let should_cancel = active_login.lock().ok().is_some_and(|mut active| {
            let matches = active.as_ref().is_some_and(|current| {
                current.account_id == attempt.account_id
                    && current.connection_generation == attempt.connection_generation
                    && current.login_id == attempt.login_id
            });
            if matches {
                *active = None;
            }
            matches
        });
        if !should_cancel {
            return;
        }
        if let Some(login_id) = attempt.login_id {
            let _ = write_message(
                &stdin,
                &json!({
                    "id": format!(
                        "orchestrator-login-timeout-{}-{}",
                        attempt.account_id, attempt.connection_generation
                    ),
                    "method": "account/login/cancel",
                    "params": { "loginId": login_id }
                }),
            );
        }
    });
}

pub(crate) async fn connect_codex_profile(
    account_id: i64,
    app: &AppHandle,
    state: &CodexState,
    codex_home: PathBuf,
    isolated_file_store: bool,
) -> Result<CodexConnectResult, String> {
    // Engine provisioning must never block process cancellation or the async executor.
    let codex_binary = run_blocking_command("prepare Codex engine", resolve_codex_binary).await?;
    let connection_generation = state
        .next_connection_generation
        .fetch_add(1, Ordering::SeqCst)
        + 1;
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

        let mut command = Command::new(&codex_binary);
        command.args(codex_app_server_args(isolated_file_store));
        let mut child = command
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
        let pending_server_requests = Arc::clone(&state.pending_server_requests);
        let next_server_request_token = Arc::clone(&state.next_server_request_token);
        let active_login = Arc::clone(&state.active_login);
        let stdout_app = app.clone();
        let stdout_codex_home = codex_home.clone();
        std::thread::spawn(move || {
            process_stdout(
                stdout_app,
                account_id,
                connection_generation,
                stdout_codex_home,
                stdout,
                pending,
                pending_server_requests,
                next_server_request_token,
                active_login,
            )
        });

        let stderr_app = app.clone();
        std::thread::spawn(move || process_stderr(stderr_app, account_id, stderr));

        processes.insert(
            account_id,
            CodexProcess {
                child,
                stdin: Arc::new(Mutex::new(stdin)),
                connection_generation,
            },
        );
    }

    let initialize = match send_request(
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
    )
    .await
    {
        Ok(response) => response,
        Err(error) => {
            let _ = stop_codex_account(account_id, app, state);
            return Err(format!(
                "Orchestrator requires a Codex version with dynamic filesystem permissions and multi-agent v2. Update Codex or remove the ORCHESTRATOR_CODEX_BIN override and retry. App-server initialization failed: {error}"
            ));
        }
    };

    send_notification(
        &state,
        account_id,
        json!({ "method": "initialized", "params": {} }),
    )?;

    let experimental_features = match send_request(
        state,
        account_id,
        "experimentalFeature/list",
        json!({ "limit": 100 }),
    )
    .await
    {
        Ok(response) => response,
        Err(error) => {
            let _ = stop_codex_account(account_id, app, state);
            return Err(format!(
                "Ask for approval requires a Codex version with dynamic filesystem permission support. Update Codex and retry. Feature check failed: {error}"
            ));
        }
    };
    if !experimental_feature_is_enabled(&experimental_features, REQUEST_PERMISSIONS_FEATURE) {
        let _ = stop_codex_account(account_id, app, state);
        return Err(
            "Ask for approval requires Codex dynamic filesystem permissions, but request_permissions_tool is unavailable or disabled. Update Codex and retry."
                .to_string(),
        );
    }
    if !experimental_feature_is_enabled(&experimental_features, MULTI_AGENT_V2_FEATURE) {
        let _ = stop_codex_account(account_id, app, state);
        return Err(
            "Subagent prompt visibility requires Codex multi-agent v2, but multi_agent_v2 is unavailable or disabled. Update Codex or remove the ORCHESTRATOR_CODEX_BIN override and retry."
                .to_string(),
        );
    }

    let permission_profiles = match send_request(
        state,
        account_id,
        "permissionProfile/list",
        json!({ "limit": 100 }),
    )
    .await
    {
        Ok(response) => response,
        Err(error) => {
            let _ = stop_codex_account(account_id, app, state);
            return Err(format!(
                "Ask for approval requires a Codex version with custom permission-profile support. Update Codex and retry. Profile check failed: {error}"
            ));
        }
    };
    if !permission_profile_is_available(&permission_profiles, ASK_FOR_APPROVAL_PERMISSION_PROFILE) {
        let _ = stop_codex_account(account_id, app, state);
        return Err(
            "Ask for approval requires the Orchestrator workspace-and-network permission profile, but Codex did not make it available. Update Codex and retry."
                .to_string(),
        );
    }
    if !permission_profile_is_available(&permission_profiles, PLAN_READ_ONLY_PERMISSION_PROFILE) {
        let _ = stop_codex_account(account_id, app, state);
        return Err(
            "Plan mode requires Codex's built-in read-only permission profile, but Codex did not make it available. Update Codex or remove the ORCHESTRATOR_CODEX_BIN override and retry."
                .to_string(),
        );
    }

    let pid = state
        .processes
        .lock()
        .ok()
        .and_then(|processes| processes.get(&account_id).map(|process| process.child.id()));

    emit_process(app, account_id, "connected", "Codex app-server connected");

    Ok(CodexConnectResult {
        pid,
        already_connected: false,
        initialize,
    })
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn codex_rpc(
    account_id: i64,
    method: String,
    params: IpcJsonValue,
    state: State<'_, CodexState>,
) -> Result<IpcJsonValue, String> {
    let mut login_generation = None;
    if method == "account/login/start" {
        let connection_generation = process_connection_generation(&state, account_id)?;
        let now = unix_timestamp_ms();
        let expires_at_ms = now.saturating_add(
            CODEX_LOGIN_TIMEOUT
                .as_millis()
                .try_into()
                .unwrap_or(u64::MAX),
        );
        let expired_attempt = {
            let mut active = state
                .active_login
                .lock()
                .map_err(|_| "Codex login lock was poisoned".to_string())?;
            let expired = if active
                .as_ref()
                .is_some_and(|attempt| attempt.expires_at_ms <= now)
            {
                active.take()
            } else {
                None
            };
            if let Some(active_attempt) = active.as_ref() {
                if active_attempt.account_id != account_id {
                    return Err(format!(
                        "Another Codex sign-in is already active for account {}",
                        active_attempt.account_id
                    ));
                }
                return Err(format!(
                    "A Codex sign-in is already active for account {account_id}"
                ));
            }
            *active = Some(ActiveCodexLogin {
                account_id,
                login_id: None,
                auth_url: None,
                connection_generation,
                started_at_ms: now,
                expires_at_ms,
                state: "starting".to_string(),
            });
            expired
        };
        if let Some(expired) = expired_attempt {
            if let (Some(login_id), Ok(stdin)) =
                (expired.login_id, process_stdin(&state, expired.account_id))
            {
                let _ = write_message(
                    &stdin,
                    &json!({
                        "id": format!(
                            "orchestrator-login-timeout-{}-{}",
                            expired.account_id, expired.connection_generation
                        ),
                        "method": "account/login/cancel",
                        "params": { "loginId": login_id }
                    }),
                );
            }
        }
        login_generation = Some(connection_generation);
    }

    let response = send_request(&state, account_id, &method, params.0).await;

    if method == "account/login/start" {
        let connection_generation = login_generation.expect("login generation is set");
        match response.as_ref() {
            Ok(value) => {
                let login_id = value
                    .get("loginId")
                    .and_then(Value::as_str)
                    .map(str::to_string);
                let auth_url = value
                    .get("authUrl")
                    .or_else(|| value.get("verificationUrl"))
                    .and_then(Value::as_str)
                    .map(str::to_string);
                if login_id.is_some() {
                    let attempt = {
                        let mut active = state
                            .active_login
                            .lock()
                            .map_err(|_| "Codex login lock was poisoned".to_string())?;
                        let Some(current) = active.as_mut().filter(|current| {
                            current.account_id == account_id
                                && current.connection_generation == connection_generation
                        }) else {
                            return Err("Codex sign-in was cancelled before it started".to_string());
                        };
                        current.login_id = login_id;
                        current.auth_url = auth_url;
                        current.state = "waiting".to_string();
                        current.clone()
                    };
                    let stdin = match process_stdin(&state, account_id) {
                        Ok(stdin) => stdin,
                        Err(error) => {
                            clear_active_login(
                                &state.active_login,
                                account_id,
                                Some(connection_generation),
                                None,
                            );
                            return Err(error);
                        }
                    };
                    start_login_timeout_watchdog(Arc::clone(&state.active_login), stdin, attempt);
                } else {
                    clear_active_login(
                        &state.active_login,
                        account_id,
                        Some(connection_generation),
                        None,
                    );
                }
            }
            Err(_) => {
                clear_active_login(
                    &state.active_login,
                    account_id,
                    Some(connection_generation),
                    None,
                );
            }
        }
    } else if method == "account/login/cancel" || method == "account/logout" {
        clear_active_login(&state.active_login, account_id, None, None);
    }

    response.map(IpcJsonValue)
}

#[tauri::command]
#[specta::specta]
pub(crate) fn codex_active_login(
    state: State<'_, CodexState>,
) -> Result<Option<ActiveCodexLogin>, String> {
    active_login_snapshot(&state.active_login)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn codex_default_profile_rpc(
    method: String,
    params: IpcJsonValue,
    state: State<'_, CodexState>,
) -> Result<IpcJsonValue, String> {
    send_request(&state, DEFAULT_CODEX_PROFILE_ID, &method, params.0)
        .await
        .map(IpcJsonValue)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn codex_projected_subagent_thread_read(
    account_id: Option<i64>,
    profile_key: String,
    thread_id: String,
    state: State<'_, CodexState>,
) -> Result<ProjectedSubagentThread, String> {
    let thread_id = thread_id.trim();
    if thread_id.is_empty() {
        return Err("Subagent thread id is required".to_string());
    }
    let resolved_account_id = if profile_key == DEFAULT_CODEX_PROFILE_KEY {
        DEFAULT_CODEX_PROFILE_ID
    } else {
        let account_id =
            account_id.ok_or_else(|| "A managed Codex account id is required".to_string())?;
        if profile_key != profile_key_for_account(account_id) {
            return Err("The subagent profile did not match its Codex account".to_string());
        }
        account_id
    };
    let response = send_request(
        &state,
        resolved_account_id,
        "thread/read",
        json!({
            "threadId": thread_id,
            "includeTurns": true
        }),
    )
    .await?;
    project_subagent_thread(thread_id, &response)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn codex_default_profile_turn_activity(
    thread_id: String,
    turn_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, CodexState>,
) -> Result<HistoricalTurnActivityResponse, String> {
    if thread_id.trim().is_empty() || turn_id.trim().is_empty() {
        return Err("Thread and turn ids are required".to_string());
    }
    let limit = limit.unwrap_or(50).clamp(1, 50);
    let response = send_request(
        &state,
        DEFAULT_CODEX_PROFILE_ID,
        "thread/items/list",
        json!({
            "threadId": thread_id,
            "turnId": turn_id,
            "cursor": cursor,
            "limit": limit,
            "sortDirection": "desc"
        }),
    )
    .await?;
    Ok(project_historical_turn_activity(&response))
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn codex_default_profile_thread_transcript_sync(
    thread_id: String,
    source_version: String,
    page_size: Option<u32>,
    request_id: String,
    state: State<'_, CodexState>,
) -> Result<ExternalTranscriptSnapshot, String> {
    if thread_id.trim().is_empty() || request_id.trim().is_empty() {
        return Err("Thread id and transcript request id are required".to_string());
    }
    let page_size = page_size.unwrap_or(20).clamp(1, 100) as usize;
    state
        .transcript_sync_requests
        .lock()
        .map_err(|_| "Transcript sync request lock was poisoned".to_string())?
        .insert(request_id.clone());
    let result = build_external_thread_transcript(
        &state,
        &thread_id,
        &source_version,
        page_size,
        &request_id,
    )
    .await;
    let _ = state
        .transcript_sync_requests
        .lock()
        .map(|mut requests| requests.remove(&request_id));
    result
}

#[tauri::command]
#[specta::specta]
pub(crate) fn codex_default_profile_thread_transcript_cancel(
    request_id: String,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    state
        .transcript_sync_requests
        .lock()
        .map_err(|_| "Transcript sync request lock was poisoned".to_string())?
        .remove(&request_id);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) fn codex_resolve_server_request(
    account_id: i64,
    id: IpcJsonValue,
    request_token: String,
    result: IpcJsonValue,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    resolve_server_request_once(&state, account_id, &request_token, id.0, result.0)
}

#[tauri::command]
#[specta::specta]
pub(crate) fn codex_default_profile_resolve_server_request(
    id: IpcJsonValue,
    request_token: String,
    result: IpcJsonValue,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    resolve_server_request_once(
        &state,
        DEFAULT_CODEX_PROFILE_ID,
        &request_token,
        id.0,
        result.0,
    )
}

pub(crate) fn resolve_server_request_once(
    state: &CodexState,
    account_id: i64,
    request_token: &str,
    id: Value,
    result: Value,
) -> Result<(), String> {
    let connection_generation = state
        .processes
        .lock()
        .map_err(|_| "Codex processes lock was poisoned".to_string())?
        .get(&account_id)
        .map(|process| process.connection_generation)
        .ok_or_else(|| format!("Codex account {account_id} is not connected"))?;

    claim_server_request(
        &state.pending_server_requests,
        account_id,
        connection_generation,
        request_token,
        &id,
    )?;

    let response = json!({ "id": id, "result": result });
    if let Err(error) = send_notification(state, account_id, response) {
        release_server_request_claim(&state.pending_server_requests, request_token);
        return Err(error);
    }

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) fn codex_stop(
    account_id: i64,
    app: AppHandle,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    stop_codex_account(account_id, &app, &state)
}

#[tauri::command]
#[specta::specta]
pub(crate) fn codex_default_profile_stop(
    app: AppHandle,
    state: State<'_, CodexState>,
) -> Result<(), String> {
    stop_codex_account(DEFAULT_CODEX_PROFILE_ID, &app, &state)
}

pub(crate) fn stop_codex_account(
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

    reject_pending_for_account(&state.pending, account_id, "Codex app-server was stopped");
    clear_server_requests_for_account(&state.pending_server_requests, account_id);

    clear_active_login(&state.active_login, account_id, None, None);

    emit_process(app, account_id, "stopped", "Codex app-server stopped");
    Ok(())
}

pub(crate) fn pending_keys_for_account(
    pending: &HashMap<String, PendingResponse>,
    account_id: i64,
) -> Vec<String> {
    pending
        .iter()
        .filter_map(|(key, response)| (response.account_id == account_id).then_some(key.clone()))
        .collect()
}

pub(crate) fn reject_pending_for_account(pending: &PendingMap, account_id: i64, message: &str) {
    if let Ok(mut pending) = pending.lock() {
        let rejected_keys = pending_keys_for_account(&pending, account_id);
        for key in rejected_keys {
            if let Some(response) = pending.remove(&key) {
                let _ = response.sender.send(Err(message.to_string()));
            }
        }
    }
}

#[tauri::command]
#[specta::specta]
pub(crate) fn codex_delete_profile(
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
