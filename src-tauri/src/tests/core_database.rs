use super::*;

#[test]
fn generated_typescript_bindings_are_exportable() {
    let output = std::env::temp_dir().join(format!(
        "orchestrator-tauri-bindings-{}.ts",
        uuid::Uuid::new_v4()
    ));
    export_typescript_bindings(&output).expect("typed Tauri bindings should export");
    let bindings = std::fs::read_to_string(&output).expect("generated bindings should be readable");
    let _ = std::fs::remove_file(output);

    assert!(bindings.contains("export const commands"));
    assert!(bindings.contains("codexConnect"));
    assert!(bindings.contains("listWorkspaceGitStatus"));
}

fn active_login_fixture(
    account_id: i64,
    login_id: Option<&str>,
    connection_generation: u64,
    expires_at_ms: u64,
) -> ActiveCodexLogin {
    ActiveCodexLogin {
        account_id,
        login_id: login_id.map(str::to_string),
        auth_url: None,
        connection_generation,
        started_at_ms: unix_timestamp_ms(),
        expires_at_ms,
        state: "waiting".to_string(),
    }
}

#[test]
fn active_login_clears_only_for_the_matching_profile_and_generation() {
    let active = Arc::new(Mutex::new(Some(active_login_fixture(
        8,
        Some("login-8"),
        4,
        unix_timestamp_ms() + 60_000,
    ))));

    assert!(!clear_active_login(&active, 7, Some(4), Some("login-8")));
    assert!(!clear_active_login(&active, 8, Some(3), Some("login-8")));
    assert!(!clear_active_login(&active, 8, Some(4), Some("other")));
    assert!(active_login_snapshot(&active).unwrap().is_some());
    assert!(clear_active_login(&active, 8, Some(4), Some("login-8")));
    assert!(active_login_snapshot(&active).unwrap().is_none());
}

#[test]
fn expired_active_login_does_not_block_a_later_attempt() {
    let active = Arc::new(Mutex::new(Some(active_login_fixture(
        10,
        Some("stale-login"),
        2,
        unix_timestamp_ms().saturating_sub(1),
    ))));

    assert!(active_login_snapshot(&active).unwrap().is_none());
}

fn queued_chat_request(
    item_id: &str,
    client_message_id: &str,
) -> CreateChatWithQueuedPromptRequest {
    let fingerprint = json!({
        "conversationRevision": 0
    });
    let snapshot = json!({
        "prompt": "Implement durable queuing",
        "contextFingerprint": fingerprint
    });
    CreateChatWithQueuedPromptRequest {
        workspace_id: 3,
        account_id: Some(7),
        title: "Implement durable queuing".to_string(),
        status: "queued".to_string(),
        generate_title: true,
        item_id: item_id.to_string(),
        client_message_id: client_message_id.to_string(),
        prompt: "Implement durable queuing".to_string(),
        execution_snapshot_json: snapshot.to_string(),
        context_fingerprint_json: fingerprint.to_string(),
        conversation_revision: 0,
    }
}

async fn create_prompt_queue_test_schema(connection: &mut SqliteConnection) {
    sqlx::query(
        "CREATE TABLE chats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workspace_id INTEGER NOT NULL,
                account_id INTEGER,
                title TEXT NOT NULL,
                status TEXT NOT NULL,
                origin TEXT NOT NULL,
                profile_key TEXT,
                title_generation_state TEXT NOT NULL,
                title_fallback TEXT
            )",
    )
    .execute(&mut *connection)
    .await
    .expect("create chats table");
    sqlx::query(
        "CREATE TABLE prompt_queue_items (
                id TEXT PRIMARY KEY,
                client_message_id TEXT NOT NULL UNIQUE,
                workspace_id INTEGER NOT NULL,
                chat_id INTEGER NOT NULL,
                position INTEGER NOT NULL,
                prompt_text TEXT NOT NULL,
                execution_snapshot_json TEXT NOT NULL,
                context_fingerprint_json TEXT NOT NULL,
                conversation_revision INTEGER NOT NULL,
                status TEXT NOT NULL
            )",
    )
    .execute(&mut *connection)
    .await
    .expect("create queue table");
}

#[test]
fn first_queued_prompt_creation_is_atomic() {
    tauri::async_runtime::block_on(async {
        let mut connection = SqliteConnection::connect("sqlite::memory:")
            .await
            .expect("open in-memory database");
        create_prompt_queue_test_schema(&mut connection).await;

        let chat_id = create_chat_with_queued_prompt_transaction(
            &mut connection,
            &queued_chat_request("queue-1", "message-1"),
        )
        .await
        .expect("create queued conversation");
        assert_eq!(chat_id, 1);
        let chat_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM chats")
            .fetch_one(&mut connection)
            .await
            .expect("count chats");
        let queue_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM prompt_queue_items")
            .fetch_one(&mut connection)
            .await
            .expect("count queue items");
        assert_eq!(chat_count, 1);
        assert_eq!(queue_count, 1);

        let failed = create_chat_with_queued_prompt_transaction(
            &mut connection,
            &queued_chat_request("queue-1", "message-2"),
        )
        .await;
        assert_eq!(
            failed.expect_err("duplicate queue item must fail"),
            "The prompt was not added to the queue."
        );
        let chat_count_after_failure: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM chats")
            .fetch_one(&mut connection)
            .await
            .expect("count chats after rollback");
        assert_eq!(chat_count_after_failure, 1);

        let mut shared_request = queued_chat_request("queue-shared", "message-shared");
        shared_request.account_id = None;
        let shared_chat_id =
            create_chat_with_queued_prompt_transaction(&mut connection, &shared_request)
                .await
                .expect("create shared queued conversation");
        let shared_profile: String =
            sqlx::query_scalar("SELECT profile_key FROM chats WHERE id = ?1")
                .bind(shared_chat_id)
                .fetch_one(&mut connection)
                .await
                .expect("load shared queued conversation profile");
        assert_eq!(shared_profile, "default");
    });
}

async fn create_run_event_test_schema(connection: &mut SqliteConnection) {
    sqlx::query(
        "CREATE TABLE run_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            sequence INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            method TEXT,
            payload_json TEXT NOT NULL,
            UNIQUE(run_id, sequence)
        )",
    )
    .execute(connection)
    .await
    .expect("create run events table");
}

fn run_event(run_id: i64, sequence: i64, payload: Value) -> RunEventWrite {
    RunEventWrite {
        run_id,
        sequence,
        event_type: "notification".to_string(),
        method: Some("turn/updated".to_string()),
        payload: IpcJsonValue(payload),
    }
}

#[test]
fn batched_run_event_write_rolls_back_on_failure() {
    tauri::async_runtime::block_on(async {
        let mut connection = SqliteConnection::connect("sqlite::memory:")
            .await
            .expect("open in-memory database");
        create_run_event_test_schema(&mut connection).await;

        let duplicate = vec![
            run_event(7, 1, json!({ "delta": "first" })),
            run_event(7, 1, json!({ "delta": "duplicate" })),
        ];
        assert!(
            append_run_events_in_transaction(&mut connection, &duplicate)
                .await
                .is_err()
        );
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM run_events")
            .fetch_one(&mut connection)
            .await
            .expect("count rolled-back events");
        assert_eq!(count, 0);

        let valid = vec![
            run_event(7, 1, json!({ "delta": "first" })),
            run_event(7, 2, json!({ "delta": "second" })),
        ];
        append_run_events_in_transaction(&mut connection, &valid)
            .await
            .expect("save valid events");
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM run_events")
            .fetch_one(&mut connection)
            .await
            .expect("count committed events");
        assert_eq!(count, 2);
    });
}

#[test]
fn prompt_queue_worktree_fingerprint_tracks_content_changes() {
    let test_root = env::temp_dir().join(format!(
        "orchestrator-prompt-queue-fingerprint-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .expect("clock after epoch")
            .as_nanos()
    ));
    fs::create_dir_all(&test_root).expect("create test repository");
    let git_root = fs::canonicalize(&test_root).expect("canonicalize test repository");
    let root_arg = git_root.to_string_lossy();

    let init = run_command("git", &["-C", root_arg.as_ref(), "init"]);
    assert!(init.ok, "git init failed: {}", init.stderr);
    fs::write(git_root.join("tracked.txt"), b"first\n").expect("write tracked file");
    let add = run_command("git", &["-C", root_arg.as_ref(), "add", "tracked.txt"]);
    assert!(add.ok, "git add failed: {}", add.stderr);
    let commit = run_command(
        "git",
        &[
            "-C",
            root_arg.as_ref(),
            "-c",
            "user.name=Orchestrator Test",
            "-c",
            "user.email=orchestrator@example.invalid",
            "commit",
            "-m",
            "Initial fixture",
        ],
    );
    assert!(commit.ok, "git commit failed: {}", commit.stderr);

    fs::write(git_root.join("tracked.txt"), b"alpha\n").expect("modify tracked file");
    fs::write(git_root.join("untracked.txt"), b"first\n").expect("write untracked file");
    let first =
        prompt_queue_worktree_fingerprint(&git_root, ".").expect("first worktree fingerprint");

    // Both paths retain the same porcelain status and byte length.
    fs::write(git_root.join("tracked.txt"), b"bravo\n").expect("remodify tracked file");
    fs::write(git_root.join("untracked.txt"), b"other\n").expect("remodify untracked file");
    let second =
        prompt_queue_worktree_fingerprint(&git_root, ".").expect("second worktree fingerprint");

    assert_ne!(first, second);
    fs::remove_dir_all(test_root).expect("remove test repository");
}

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

#[cfg(target_os = "macos")]
#[test]
fn checks_desktop_bundles_and_common_cli_locations_on_macos() {
    let home = Path::new("/Users/orchestrator-test");
    let candidates = macos_codex_binary_candidates(Some(home));

    assert!(candidates.contains(&PathBuf::from(
        "/Applications/Codex.app/Contents/Resources/codex"
    )));
    assert!(candidates.contains(&PathBuf::from(
        "/Applications/ChatGPT.app/Contents/Resources/codex"
    )));
    assert!(candidates.contains(&PathBuf::from("/opt/homebrew/bin/codex")));
    assert!(candidates.contains(&home.join(".cargo/bin/codex")));
    assert!(candidates.contains(&home.join(".local/bin/codex")));
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
fn default_profile_uses_local_codex_home() {
    let home = Path::new("/tmp/orchestrator-user-home");
    assert_eq!(default_codex_home_from_home(home), home.join(".codex"));
    assert_eq!(profile_key_for_account(0), "default");
    assert_eq!(profile_key_for_account(12), "account:12");
}

#[test]
fn app_server_profiles_enable_network_without_full_access() {
    let shared_args = codex_app_server_args(false);
    let isolated_args = codex_app_server_args(true);
    let profile_key = format!("permissions.{ASK_FOR_APPROVAL_PERMISSION_PROFILE}");

    assert_eq!(
        &shared_args[..5],
        [
            "app-server",
            "--enable",
            REQUEST_PERMISSIONS_FEATURE,
            "--listen",
            "stdio://"
        ]
    );
    assert!(shared_args.contains(&format!(
        "default_permissions=\"{ASK_FOR_APPROVAL_PERMISSION_PROFILE}\""
    )));
    assert!(shared_args.contains(&format!("{profile_key}.extends=\":workspace\"")));
    assert!(shared_args.contains(&format!("{profile_key}.network.enabled=true")));
    assert!(shared_args.contains(&format!("{profile_key}.network.mode=\"full\"")));
    assert!(!shared_args
        .iter()
        .any(|arg| arg.contains("danger-full-access")));
    assert!(!shared_args
        .iter()
        .any(|arg| arg.contains("cli_auth_credentials_store")));
    assert!(!shared_args.iter().any(|arg| {
        arg.contains("mcp_servers") || arg.to_ascii_lowercase().contains("playwright")
    }));
    assert!(isolated_args
        .iter()
        .any(|arg| arg == "cli_auth_credentials_store=\"file\""));
}

#[test]
fn permission_request_feature_check_requires_the_enabled_native_feature() {
    assert!(experimental_feature_is_enabled(
        &json!({
            "data": [
                {
                    "name": REQUEST_PERMISSIONS_FEATURE,
                    "enabled": true
                }
            ]
        }),
        REQUEST_PERMISSIONS_FEATURE
    ));
    assert!(!experimental_feature_is_enabled(
        &json!({
            "data": [
                {
                    "name": REQUEST_PERMISSIONS_FEATURE,
                    "enabled": false
                }
            ]
        }),
        REQUEST_PERMISSIONS_FEATURE
    ));
    assert!(!experimental_feature_is_enabled(
        &json!({ "data": [] }),
        REQUEST_PERMISSIONS_FEATURE
    ));
}

#[test]
fn permission_profile_check_requires_the_allowed_custom_profile() {
    let profile = ASK_FOR_APPROVAL_PERMISSION_PROFILE;
    assert!(permission_profile_is_available(
        &json!({
            "data": [
                { "id": ":workspace", "allowed": true },
                { "id": profile, "allowed": true }
            ]
        }),
        profile
    ));
    assert!(!permission_profile_is_available(
        &json!({ "data": [{ "id": profile, "allowed": false }] }),
        profile
    ));
    assert!(!permission_profile_is_available(
        &json!({ "data": [{ "id": ":workspace", "allowed": true }] }),
        profile
    ));
}

#[test]
fn pending_requests_are_filtered_by_account() {
    let (sender_one, _receiver_one) = oneshot::channel();
    let (sender_two, _receiver_two) = oneshot::channel();
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
fn native_server_request_registry_deduplicates_within_one_connection() {
    let pending: PendingServerRequestMap = Arc::new(Mutex::new(HashMap::new()));
    let sequence = AtomicU64::new(0);

    let first = register_server_request(&pending, &sequence, 7, 3, json!(9));
    let replay = register_server_request(&pending, &sequence, 7, 3, json!(9));
    let reconnected = register_server_request(&pending, &sequence, 7, 4, json!(9));

    assert_eq!(first, replay);
    assert_ne!(first, reconnected);
    assert_eq!(pending.lock().unwrap().len(), 2);

    resolve_tracked_server_request(&pending, 7, 3, &json!(9));
    let requests = pending.lock().unwrap();
    assert!(!requests.contains_key(&first));
    assert!(requests.contains_key(&reconnected));
}

#[test]
fn native_server_request_claim_is_one_shot_and_bound_to_identity() {
    let pending: PendingServerRequestMap = Arc::new(Mutex::new(HashMap::new()));
    let sequence = AtomicU64::new(0);
    let token = register_server_request(&pending, &sequence, 7, 3, json!(9));

    assert!(claim_server_request(&pending, 7, 3, &token, &json!(9)).is_ok());
    assert!(claim_server_request(&pending, 7, 3, &token, &json!(9))
        .unwrap_err()
        .contains("already submitted"));

    release_server_request_claim(&pending, &token);
    assert!(claim_server_request(&pending, 8, 3, &token, &json!(9))
        .unwrap_err()
        .contains("does not match"));
    assert!(claim_server_request(&pending, 7, 4, &token, &json!(9))
        .unwrap_err()
        .contains("does not match"));
    assert!(claim_server_request(&pending, 7, 3, &token, &json!(10))
        .unwrap_err()
        .contains("does not match"));
    assert!(
        claim_server_request(&pending, 7, 3, "missing-token", &json!(9))
            .unwrap_err()
            .contains("stale or already resolved")
    );
}

#[test]
fn native_server_request_cleanup_invalidates_stale_connections_and_accounts() {
    let pending: PendingServerRequestMap = Arc::new(Mutex::new(HashMap::new()));
    let sequence = AtomicU64::new(0);
    let account_seven_old = register_server_request(&pending, &sequence, 7, 3, json!(9));
    let account_seven_new = register_server_request(&pending, &sequence, 7, 4, json!(10));
    let account_eight = register_server_request(&pending, &sequence, 8, 3, json!(11));

    clear_server_requests_for_generation(&pending, 7, 3);
    {
        let requests = pending.lock().unwrap();
        assert!(!requests.contains_key(&account_seven_old));
        assert!(requests.contains_key(&account_seven_new));
        assert!(requests.contains_key(&account_eight));
    }

    clear_server_requests_for_account(&pending, 7);
    let requests = pending.lock().unwrap();
    assert!(!requests.contains_key(&account_seven_new));
    assert!(requests.contains_key(&account_eight));
}

#[test]
fn stopping_one_profile_rejects_only_its_pending_requests() {
    let (sender_one, receiver_one) = oneshot::channel();
    let (sender_two, _receiver_two) = oneshot::channel();
    let pending: PendingMap = Arc::new(Mutex::new(HashMap::from([
        (
            "1".to_string(),
            PendingResponse {
                account_id: 7,
                sender: sender_one,
            },
        ),
        (
            "2".to_string(),
            PendingResponse {
                account_id: 8,
                sender: sender_two,
            },
        ),
    ])));

    reject_pending_for_account(&pending, 7, "profile stopped");

    assert_eq!(
        receiver_one.blocking_recv().unwrap().unwrap_err(),
        "profile stopped"
    );
    let remaining = pending.lock().unwrap();
    assert!(!remaining.contains_key("1"));
    assert!(remaining.contains_key("2"));
}

#[test]
fn account_events_include_their_owner() {
    let event = CodexMessageEvent {
        account_id: 9,
        profile_key: profile_key_for_account(9),
        message: json!({ "method": "account/updated" }),
        request_token: None,
    };
    let value = serde_json::to_value(event).unwrap();

    assert_eq!(value["accountId"], 9);
    assert_eq!(value["profileKey"], "account:9");
    assert_eq!(value["message"]["method"], "account/updated");
}

#[test]
fn historical_activity_projection_omits_bulk_item_content() {
    let response = json!({
        "data": [
            {
                "type": "commandExecution",
                "id": "command-1",
                "command": "npm test -- --run",
                "status": "completed",
                "durationMs": 1200,
                "aggregatedOutput": "very large command output that must not cross the bridge"
            },
            {
                "type": "reasoning",
                "id": "reasoning-1",
                "content": "private reasoning body"
            },
            {
                "type": "mcpToolCall",
                "id": "tool-1",
                "server": "codex_apps",
                "tool": "github.get_pr_info",
                "status": "completed",
                "durationMs": 800,
                "arguments": {
                    "title": "Read pull request details",
                    "repo_full_name": "openai/orchestrator",
                    "url": "https://github.com/openai/orchestrator/pull/1?token=private",
                    "typed_text": "private input"
                },
                "result": { "content": "very large private result" }
            },
            {
                "type": "fileChange",
                "changes": [
                    {
                        "path": "src/App.tsx",
                        "kind": { "type": "update" },
                        "diff": "--- a/src/App.tsx\n+++ b/src/App.tsx\n-old\n+new\n+another"
                    }
                ]
            }
        ],
        "nextCursor": "older-items"
    });

    let projected = project_historical_turn_activity(&response);
    let value = serde_json::to_value(&projected).unwrap();
    let serialized = value.to_string();

    assert_eq!(value["commands"][0]["command"], "npm test -- --run");
    assert_eq!(value["commands"][0]["durationMs"], 1200);
    assert_eq!(value["editedFiles"][0]["path"], "src/App.tsx");
    assert_eq!(value["editedFiles"][0]["additions"], 2);
    assert_eq!(value["editedFiles"][0]["deletions"], 1);
    assert_eq!(value["toolActivities"][0]["id"], "tool-1");
    assert_eq!(
        value["toolActivities"][0]["title"],
        "Read pull request details"
    );
    assert_eq!(
        value["toolActivities"][0]["safeDetails"][0]["value"],
        "openai/orchestrator"
    );
    assert_eq!(
        value["toolActivities"][0]["safeDetails"][1]["value"],
        "https://github.com"
    );
    assert_eq!(value["nextCursor"], "older-items");
    assert!(!serialized.contains("very large command output"));
    assert!(!serialized.contains("private reasoning body"));
    assert!(!serialized.contains("private input"));
    assert!(!serialized.contains("very large private result"));
    assert!(!serialized.contains("token=private"));
    assert!(!serialized.contains("--- a/src/App.tsx"));
}

#[test]
fn subagent_projection_keeps_visible_turns_and_omits_bulk_content() {
    let response = json!({
        "thread": {
            "id": "child-thread",
            "status": { "type": "idle" },
            "turns": [{
                "id": "child-turn",
                "status": "completed",
                "items": [
                    {
                        "type": "userMessage",
                        "id": "user",
                        "text": "Inspect the API"
                    },
                    {
                        "type": "userMessage",
                        "id": "user-content",
                        "content": [{ "type": "inputText", "text": "Check the routes" }]
                    },
                    {
                        "type": "agentMessage",
                        "id": "assistant",
                        "phase": "final_answer",
                        "text": "The API is valid."
                    },
                    {
                        "type": "reasoning",
                        "id": "reasoning",
                        "summary": [{ "text": "Checked the public contract" }],
                        "content": "hidden chain of thought"
                    },
                    {
                        "type": "commandExecution",
                        "id": "command",
                        "command": "cat .env",
                        "aggregatedOutput": "SECRET_TOKEN=private",
                        "status": "completed"
                    },
                    {
                        "type": "fileChange",
                        "id": "file",
                        "status": "completed",
                        "changes": [{
                            "path": "/tmp/project/src/App.tsx",
                            "diff": "-secret\n+replacement"
                        }]
                    },
                    {
                        "type": "mcpToolCall",
                        "id": "mcp",
                        "server": "playwright",
                        "tool": "browser_type",
                        "arguments": { "text": "password-value" },
                        "result": { "content": "private-result" },
                        "status": "completed"
                    }
                ]
            }]
        }
    });

    let projected = project_subagent_thread("child-thread", &response).unwrap();
    let value = serde_json::to_value(projected).unwrap();
    let serialized = value.to_string();

    assert!(serialized.contains("Inspect the API"));
    assert!(serialized.contains("Check the routes"));
    assert!(serialized.contains("The API is valid."));
    assert!(serialized.contains("Checked the public contract"));
    assert!(serialized.contains("App.tsx"));
    assert!(!serialized.contains("hidden chain of thought"));
    assert!(!serialized.contains("cat .env"));
    assert!(!serialized.contains("SECRET_TOKEN"));
    assert!(!serialized.contains("-secret"));
    assert!(!serialized.contains("password-value"));
    assert!(!serialized.contains("private-result"));
}

#[test]
fn history_index_projection_returns_metrics_without_message_content() {
    let prompt = "private prompt text\nwith another line";
    let final_answer = "private final answer";
    let turn = json!({
        "id": "turn-1",
        "items": [
            {
                "type": "userMessage",
                "text": prompt
            },
            {
                "type": "reasoning",
                "content": "private reasoning content"
            },
            {
                "type": "commandExecution",
                "command": "cat secret.txt",
                "aggregatedOutput": "private command output"
            },
            {
                "type": "fileChange",
                "changes": [{
                    "path": "secret.txt",
                    "diff": "--- a/secret.txt\n+++ b/secret.txt\n-secret\n+private diff"
                }]
            },
            {
                "type": "agentMessage",
                "phase": "final_answer",
                "text": final_answer
            }
        ]
    });

    let hint = project_history_turn_hint(&turn);
    let serialized = serde_json::to_string(&hint).unwrap();

    assert_eq!(hint.turn_id.as_deref(), Some("turn-1"));
    assert_eq!(hint.prompt_characters, prompt.chars().count());
    assert_eq!(hint.prompt_lines, 2);
    assert_eq!(hint.response_characters, final_answer.chars().count());
    assert_eq!(hint.response_lines, 1);
    assert!(!serialized.contains("private prompt text"));
    assert!(!serialized.contains("private final answer"));
    assert!(!serialized.contains("private reasoning content"));
    assert!(!serialized.contains("private command output"));
    assert!(!serialized.contains("private diff"));
}

#[test]
fn transcript_projection_keeps_only_prompt_and_final_answer() {
    let turn = json!({
        "id": "turn-1",
        "status": "completed",
        "startedAt": "2026-07-13T10:00:00Z",
        "completedAt": "2026-07-13T10:00:12Z",
        "durationMs": 12000,
        "tokenUsage": {
            "totalTokens": 4200,
            "modelContextWindow": 128000
        },
        "items": [
            { "type": "userMessage", "text": "Keep this prompt" },
            { "type": "reasoning", "content": "exclude private reasoning" },
            {
                "type": "agentMessage",
                "phase": "commentary",
                "text": "exclude streamed commentary"
            },
            {
                "type": "commandExecution",
                "command": "cat secret.txt",
                "aggregatedOutput": "exclude command output"
            },
            {
                "type": "fileChange",
                "changes": [{
                    "path": "secret.txt",
                    "diff": "exclude raw diff"
                }]
            },
            {
                "type": "agentMessage",
                "phase": "final_answer",
                "text": "Keep only this final answer"
            }
        ]
    });

    let projected = project_external_transcript_turn(&turn).expect("projected turn");
    let serialized = serde_json::to_string(&projected).unwrap();

    assert_eq!(projected.prompt, "Keep this prompt");
    assert_eq!(projected.final_message, "Keep only this final answer");
    assert_eq!(projected.total_tokens, Some(4200));
    assert_eq!(projected.model_context_window, Some(128000));
    assert!(!serialized.contains("exclude private reasoning"));
    assert!(!serialized.contains("exclude streamed commentary"));
    assert!(!serialized.contains("exclude command output"));
    assert!(!serialized.contains("exclude raw diff"));
}

#[test]
fn main_window_can_write_to_sqlite() {
    let capability: Value =
        serde_json::from_str(include_str!("../../capabilities/default.json")).unwrap();
    let permissions = capability["permissions"].as_array().unwrap();

    assert!(permissions
        .iter()
        .any(|permission| permission == "sql:allow-execute"));
}

#[test]
fn main_window_can_start_native_dragging() {
    let capability: Value =
        serde_json::from_str(include_str!("../../capabilities/default.json")).unwrap();
    let permissions = capability["permissions"].as_array().unwrap();

    assert!(permissions
        .iter()
        .any(|permission| permission == "core:window:allow-start-dragging"));
}
