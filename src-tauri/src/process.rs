use super::*;

pub(crate) fn validate_account_id(account_id: i64) -> Result<(), String> {
    if account_id > 0 {
        Ok(())
    } else {
        Err("Codex account id must be a positive integer".to_string())
    }
}

pub(crate) fn account_profile_root(base: &Path, account_id: i64) -> Result<PathBuf, String> {
    validate_account_id(account_id)?;
    Ok(base.join("codex-accounts").join(account_id.to_string()))
}

pub(crate) fn codex_profile_root(app: &AppHandle, account_id: i64) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Orchestrator app data: {error}"))?;
    account_profile_root(&app_data, account_id)
}

pub(crate) fn ensure_codex_home(app: &AppHandle, account_id: i64) -> Result<PathBuf, String> {
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
        fs::set_permissions(&codex_home, fs::Permissions::from_mode(0o700)).map_err(|error| {
            format!(
                "Could not secure isolated Codex home {}: {error}",
                codex_home.display()
            )
        })?;
    }

    Ok(codex_home)
}

pub(crate) fn ensure_codex_home_for_account(
    app: &AppHandle,
    account_id: i64,
) -> Result<PathBuf, String> {
    if account_id == 0 {
        ensure_default_codex_home()
    } else {
        ensure_codex_home(app, account_id)
    }
}

pub(crate) fn default_codex_home_from_home(home: &Path) -> PathBuf {
    home.join(".codex")
}

pub(crate) fn ensure_default_codex_home() -> Result<PathBuf, String> {
    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Could not resolve HOME for the default Codex profile".to_string())?;
    let codex_home = default_codex_home_from_home(&home);
    fs::create_dir_all(&codex_home).map_err(|error| {
        format!(
            "Could not create default Codex home {}: {error}",
            codex_home.display()
        )
    })?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&codex_home, fs::Permissions::from_mode(0o700)).map_err(|error| {
            format!(
                "Could not secure default Codex home {}: {error}",
                codex_home.display()
            )
        })?;
    }

    Ok(codex_home)
}

pub(crate) fn codex_app_server_args(
    isolated_file_store: bool,
    playwright_runtime: Option<&PlaywrightRuntime>,
) -> Vec<String> {
    let profile_key = format!("permissions.{ASK_FOR_APPROVAL_PERMISSION_PROFILE}");
    let mut args = vec![
        "app-server".to_string(),
        "--enable".to_string(),
        REQUEST_PERMISSIONS_FEATURE.to_string(),
        "--listen".to_string(),
        "stdio://".to_string(),
        "-c".to_string(),
        format!("default_permissions=\"{ASK_FOR_APPROVAL_PERMISSION_PROFILE}\""),
        "-c".to_string(),
        format!(
            "{profile_key}.description=\"Workspace access with internet and TCP listeners for Orchestrator Ask for approval\""
        ),
        "-c".to_string(),
        format!("{profile_key}.extends=\":workspace\""),
        "-c".to_string(),
        format!("{profile_key}.network.enabled=true"),
        "-c".to_string(),
        format!("{profile_key}.network.mode=\"full\""),
    ];
    if isolated_file_store {
        args.extend([
            "-c".to_string(),
            "cli_auth_credentials_store=\"file\"".to_string(),
        ]);
    }
    if let Some(runtime) = playwright_runtime {
        browser_sessions::append_playwright_app_server_args(&mut args, runtime);
    }
    args
}

pub(crate) fn experimental_feature_is_enabled(response: &Value, feature_name: &str) -> bool {
    response
        .get("data")
        .and_then(Value::as_array)
        .is_some_and(|features| {
            features.iter().any(|feature| {
                feature.get("name").and_then(Value::as_str) == Some(feature_name)
                    && feature.get("enabled").and_then(Value::as_bool) == Some(true)
            })
        })
}

pub(crate) fn permission_profile_is_available(response: &Value, profile_id: &str) -> bool {
    response
        .get("data")
        .and_then(Value::as_array)
        .is_some_and(|profiles| {
            profiles.iter().any(|profile| {
                profile.get("id").and_then(Value::as_str) == Some(profile_id)
                    && profile.get("allowed").and_then(Value::as_bool) == Some(true)
            })
        })
}

pub(crate) fn resolve_codex_binary() -> Result<PathBuf, String> {
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
        let home = env::var_os("HOME").map(PathBuf::from);
        if let Some(path) = macos_codex_binary_candidates(home.as_deref())
            .into_iter()
            .find(|path| path.is_file())
        {
            return Ok(path);
        }
    }

    Err(
        "Codex CLI was not found. Install Codex or ChatGPT Desktop, add `codex` to PATH, or set ORCHESTRATOR_CODEX_BIN."
            .to_string(),
    )
}

#[cfg(target_os = "macos")]
pub(crate) fn macos_codex_binary_candidates(home: Option<&Path>) -> Vec<PathBuf> {
    let mut candidates = vec![
        PathBuf::from("/Applications/Codex.app/Contents/Resources/codex"),
        PathBuf::from("/Applications/ChatGPT.app/Contents/Resources/codex"),
        PathBuf::from("/opt/homebrew/bin/codex"),
        PathBuf::from("/usr/local/bin/codex"),
    ];

    if let Some(home) = home {
        candidates.extend([
            home.join("Applications/Codex.app/Contents/Resources/codex"),
            home.join("Applications/ChatGPT.app/Contents/Resources/codex"),
            home.join(".cargo/bin/codex"),
            home.join(".local/bin/codex"),
            home.join(".npm-global/bin/codex"),
            home.join("Library/pnpm/codex"),
            home.join(".local/share/pnpm/codex"),
        ]);
    }

    candidates
}

pub(crate) fn find_codex_on_path(path_value: Option<std::ffi::OsString>) -> Option<PathBuf> {
    let executable = if cfg!(windows) { "codex.exe" } else { "codex" };

    path_value
        .into_iter()
        .flat_map(|value| env::split_paths(&value).collect::<Vec<_>>())
        .map(|directory| directory.join(executable))
        .find(|path| path.is_file())
}

pub(crate) async fn run_blocking_command<T, F>(
    operation: &'static str,
    task: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("Failed to {operation}: {error}"))?
}

pub(crate) fn run_command(program: impl AsRef<OsStr>, args: &[&str]) -> CommandProbe {
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

pub(crate) fn run_command_raw(program: impl AsRef<OsStr>, args: &[&str]) -> CommandProbe {
    match Command::new(program).args(args).output() {
        Ok(output) => CommandProbe {
            ok: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        },
        Err(err) => CommandProbe {
            ok: false,
            stdout: String::new(),
            stderr: err.to_string(),
        },
    }
}

pub(crate) fn run_command_with_stdin(
    program: impl AsRef<OsStr>,
    args: &[String],
    stdin_text: &str,
) -> Result<CommandProbe, String> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Unable to start Git: {error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(stdin_text.as_bytes())
            .map_err(|error| format!("Unable to send the saved diff to Git: {error}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|error| format!("Unable to read Git output: {error}"))?;
    Ok(CommandProbe {
        ok: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    })
}

pub(crate) fn run_command_with_stdin_timeout(
    program: impl AsRef<OsStr>,
    args: &[String],
    stdin_text: &str,
    env_var: Option<(&str, &OsStr)>,
    timeout: Duration,
    operation: &str,
) -> Result<CommandProbe, String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some((key, value)) = env_var {
        command.env(key, value);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start Codex {operation}: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| format!("Failed to capture Codex {operation} output"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| format!("Failed to capture Codex {operation} errors"))?;
    let stdout_reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut reader = BufReader::new(stdout);
        reader.read_to_end(&mut bytes).map(|_| bytes)
    });
    let stderr_reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut reader = BufReader::new(stderr);
        reader.read_to_end(&mut bytes).map(|_| bytes)
    });
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(stdin_text.as_bytes())
            .map_err(|error| format!("Failed to send input for Codex {operation}: {error}"))?;
    }

    let started_at = Instant::now();
    let (ok, timed_out) = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Failed to inspect Codex {operation}: {error}"))?
        {
            break (status.success(), false);
        }

        if started_at.elapsed() >= timeout {
            let _ = child.kill();
            child
                .wait()
                .map_err(|error| format!("Failed to stop Codex {operation}: {error}"))?;
            break (false, true);
        }

        std::thread::sleep(Duration::from_millis(100));
    };

    let stdout = stdout_reader
        .join()
        .map_err(|_| format!("Failed to read Codex {operation} output"))?
        .map_err(|error| format!("Failed to read Codex {operation} output: {error}"))?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| format!("Failed to read Codex {operation} errors"))?
        .map_err(|error| format!("Failed to read Codex {operation} errors: {error}"))?;
    let stdout = String::from_utf8_lossy(&stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&stderr).trim().to_string();

    Ok(CommandProbe {
        ok,
        stdout,
        stderr: if timed_out {
            if stderr.is_empty() {
                format!("Timed out during Codex {operation}")
            } else {
                format!("Timed out during Codex {operation}: {stderr}")
            }
        } else {
            stderr
        },
    })
}

pub(crate) fn run_command_bytes(program: impl AsRef<OsStr>, args: &[&str]) -> CommandBytesProbe {
    match Command::new(program).args(args).output() {
        Ok(output) => CommandBytesProbe {
            ok: output.status.success(),
            stdout: output.stdout,
        },
        Err(_) => CommandBytesProbe {
            ok: false,
            stdout: Vec::new(),
        },
    }
}

pub(crate) fn output_detail(probe: &CommandProbe) -> Option<String> {
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
