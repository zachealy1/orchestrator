//! A credential-free compatibility gate using the same launch arguments as real tasks.
use crate::{
    codex_app_server_args, experimental_feature_is_enabled, permission_profile_is_available,
    ASK_FOR_APPROVAL_PERMISSION_PROFILE, MULTI_AGENT_V2_FEATURE, PLAN_READ_ONLY_PERMISSION_PROFILE,
    REQUEST_PERMISSIONS_FEATURE,
};
use serde_json::{json, Value};
use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};

struct ProbeChild(Child);
impl Drop for ProbeChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn executable_output(binary: &Path, argument: &str) -> Result<String, String> {
    let deadline = Instant::now() + Duration::from_secs(10);
    let mut child = ProbeChild(
        Command::new(binary)
            .arg(argument)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Could not inspect the Codex engine: {e}"))?,
    );
    let stdout = child.0.stdout.take().ok_or("Missing version output")?;
    let (tx, rx) = mpsc::sync_channel(8);
    std::thread::spawn(move || {
        let mut text = String::new();
        let result = stdout.take(4096).read_to_string(&mut text).map(|_| text);
        let _ = tx.send(result);
    });
    let text = rx
        .recv_timeout(Duration::from_secs(10))
        .map_err(|_| "Codex version check timed out")?
        .map_err(|e| e.to_string())?;
    loop {
        if let Some(status) = child.0.try_wait().map_err(|e| e.to_string())? {
            if !status.success() {
                return Err("Codex version check failed.".into());
            }
            break;
        }
        if Instant::now() >= deadline {
            return Err("Codex version check timed out.".into());
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    Ok(text)
}

pub(crate) fn executable_version(binary: &Path) -> Result<String, String> {
    executable_output(binary, "--version")?
        .trim()
        .strip_prefix("codex-cli ")
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or("Unrecognized Codex engine version".into())
}

pub fn verify_codex_engine(binary: &Path, expected_version: &str) -> Result<(), String> {
    if executable_version(binary)? != expected_version {
        return Err("Codex engine version did not match its release.".into());
    }
    // Starting an anonymous thread does not guarantee that lazy model tools are initialized.
    // Independently launch the required sibling so an incomplete package fails before activation.
    let host = binary.with_file_name("codex-code-mode-host");
    if !fs::symlink_metadata(&host).is_ok_and(|metadata| metadata.is_file()) {
        return Err("The required Code Mode host is missing or is not a regular executable. Reinstall Orchestrator.".into());
    }
    let help = executable_output(&host, "--help")
        .map_err(|error| format!("The Code Mode host could not start: {error}"))?;
    if !help.contains("Usage:") || !help.contains("codex-code-mode-host") {
        return Err("The Code Mode host returned an unexpected startup response.".into());
    }
    let home = std::env::temp_dir().join(format!(
        "orchestrator-engine-probe-{}",
        uuid::Uuid::new_v4()
    ));
    fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    let result = probe_protocol(binary, &home);
    let _ = fs::remove_dir_all(home);
    result.map_err(|e| format!("This Codex release is not compatible with Orchestrator: {e}"))
}

fn probe_protocol(binary: &Path, home: &Path) -> Result<(), String> {
    let mut child = ProbeChild(
        Command::new(binary)
            .args(codex_app_server_args(true))
            // Never load the user's config, credentials, projects, or plugins for a probe.
            .env("CODEX_HOME", home)
            .env_remove("OPENAI_API_KEY")
            .env_remove("CODEX_API_KEY")
            .env_remove("CODEX_ACCESS_TOKEN")
            .current_dir(home)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?,
    );
    let mut stdin = child.0.stdin.take().ok_or("Missing probe input")?;
    let stdout = child.0.stdout.take().ok_or("Missing probe output")?;
    let (tx, rx) = mpsc::sync_channel(8);
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            let mut line = String::new();
            match reader.by_ref().take(2 * 1024 * 1024).read_line(&mut line) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    if !line.ends_with('\n') || tx.send(line).is_err() {
                        break;
                    }
                }
            }
        }
    });
    let deadline = Instant::now() + Duration::from_secs(30);
    let mut id = 0;
    let mut request = |method: &str, params: Value| -> Result<Value, String> {
        id += 1;
        writeln!(
            stdin,
            "{}",
            json!({"id":id,"method":method,"params":params})
        )
        .map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())?;
        loop {
            let line = rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))
                .map_err(|_| format!("No response to {method}"))?;
            let response: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
            if response.get("method").and_then(Value::as_str) == Some("warning") {
                let message = response
                    .pointer("/params/message")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let lower = message.to_lowercase();
                if lower.contains("code mode") || lower.contains("code-mode") {
                    return Err(format!("Code Mode runtime failed to start: {message}"));
                }
            }
            if response.get("id") == Some(&json!(id)) {
                if let Some(error) = response.get("error") {
                    return Err(format!("{method}: {error}"));
                }
                if method == "initialize" {
                    writeln!(stdin, "{}", json!({"method":"initialized"}))
                        .map_err(|e| e.to_string())?;
                    stdin.flush().map_err(|e| e.to_string())?;
                }
                return response
                    .get("result")
                    .cloned()
                    .ok_or(format!("Missing {method} result"));
            }
        }
    };
    request(
        "initialize",
        json!({"clientInfo":{"name":"orchestrator_engine_probe","version":env!("CARGO_PKG_VERSION")},"capabilities":{"experimentalApi":true}}),
    )?;
    let mut features = json!({"data": []});
    let mut cursor = Value::Null;
    loop {
        let page = request("experimentalFeature/list", json!({"limit":100, "cursor":cursor}))?;
        if let Some(data) = page.get("data").and_then(Value::as_array) {
            features["data"].as_array_mut().unwrap().extend(data.iter().cloned());
        }
        cursor = page.get("nextCursor").cloned().unwrap_or(Value::Null);
        if cursor.is_null() { break; }
    }
    for feature in [REQUEST_PERMISSIONS_FEATURE, MULTI_AGENT_V2_FEATURE, "default_mode_request_user_input"] {
        if !experimental_feature_is_enabled(&features, feature) {
            return Err(format!("Required feature {feature} is unavailable"));
        }
    }
    let profiles = request("permissionProfile/list", json!({"limit":100}))?;
    for profile in [
        ASK_FOR_APPROVAL_PERMISSION_PROFILE,
        PLAN_READ_ONLY_PERMISSION_PROFILE,
    ] {
        if !permission_profile_is_available(&profiles, profile) {
            return Err(format!(
                "Required permission profile {profile} is unavailable"
            ));
        }
    }
    let modes = request("collaborationMode/list", json!({}))?;
    for mode in ["plan", "default"] {
        if !modes
            .get("data")
            .and_then(Value::as_array)
            .is_some_and(|data| {
                data.iter()
                    .any(|m| m.get("mode").and_then(Value::as_str) == Some(mode))
            })
        {
            return Err(format!("Required collaboration mode {mode} is unavailable"));
        }
    }
    request("model/list", json!({"limit":1,"includeHidden":false}))?;
    // Exercise thread setup and native execution too, without credentials or model inference.
    let started = request(
        "thread/start",
        json!({"cwd":home,"ephemeral":true,"approvalPolicy":"never","sandbox":"read-only"}),
    )?;
    if started
        .pointer("/thread/id")
        .and_then(Value::as_str)
        .is_none()
    {
        return Err("The engine could not start a verification thread.".into());
    }
    let executed = request(
        "command/exec",
        json!({"command":["/bin/echo","orchestrator-engine-probe"],"cwd":home,"sandboxPolicy":{"type":"readOnly"},"timeoutMs":5000}),
    )?;
    if executed.get("exitCode").and_then(Value::as_i64) != Some(0)
        || executed
            .get("stdout")
            .and_then(Value::as_str)
            .map(str::trim)
            != Some("orchestrator-engine-probe")
    {
        return Err("The engine could not execute the read-only verification command.".into());
    }
    Ok(())
}
