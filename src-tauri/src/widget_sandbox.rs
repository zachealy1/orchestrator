use crate::*;
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub(crate) struct WidgetSandboxState(Mutex<HashMap<String, (String, String)>>);
const MAX_WIDGET_BYTES: usize = 4 * 1024 * 1024;

fn domains(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter_map(|s| url::Url::parse(s).ok())
        .filter(|u| {
            u.scheme() == "https"
                && u.username().is_empty()
                && u.password().is_none()
                && u.host_str()
                    .is_some_and(|host| !host.contains([';', '\'', '"', '*']))
        })
        .map(|u| u.origin().ascii_serialization())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>()
        .join(" ")
}
pub(crate) fn widget_csp(policy: &Value) -> String {
    let resources = domains(policy.get("resourceDomains"));
    let connect = domains(policy.get("connectDomains"));
    let connect = if connect.is_empty() {
        "'none'"
    } else {
        &connect
    };
    format!("default-src 'none'; script-src 'unsafe-inline' {resources}; style-src 'unsafe-inline' {resources}; img-src data: blob: {resources}; media-src data: blob: {resources}; font-src data: {resources}; connect-src {connect}; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")
}

#[tauri::command]
#[specta::specta]
pub(crate) fn widget_sandbox_create(
    html: String,
    policy: IpcJsonValue,
    state: State<'_, WidgetSandboxState>,
) -> Result<String, String> {
    if html.len() > MAX_WIDGET_BYTES {
        return Err("Tool interface exceeds the preview limit".into());
    }
    let mut views = state.0.lock().map_err(|_| "Widget storage unavailable")?;
    if views.len() >= 32 {
        return Err("Close another tool interface before opening this one".into());
    }
    let token = uuid::Uuid::new_v4().to_string();
    views.insert(token.clone(), (html, widget_csp(&policy.0)));
    Ok(token)
}

#[tauri::command]
#[specta::specta]
pub(crate) fn widget_sandbox_close(token: String, state: State<'_, WidgetSandboxState>) {
    if let Ok(mut views) = state.0.lock() {
        views.remove(&token);
    }
}

pub(crate) fn response(
    app: &AppHandle,
    request: &tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let path = request.uri().path().trim_start_matches('/');
    let (token, resource) = path.split_once('/').unwrap_or(("", ""));
    let view = app
        .state::<WidgetSandboxState>()
        .0
        .lock()
        .ok()
        .and_then(|s| s.get(token).cloned());
    let (body, policy, status) = match (view, resource) {
        (Some(_), "proxy") => (include_str!("widget_proxy.html").to_string(), "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src orchestrator-widget: http://orchestrator-widget.localhost; object-src 'none'; base-uri 'none'".to_string(), 200),
        (Some((html, policy)), "view") => (html, policy, 200),
        _ => ("Tool interface unavailable".into(), "default-src 'none'".into(), 404),
    };
    tauri::http::Response::builder()
        .status(status)
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Content-Security-Policy", policy)
        .header("Cache-Control", "no-store")
        .header("Referrer-Policy", "no-referrer")
        .body(body.into_bytes())
        .expect("Static widget response headers")
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn save_activity_resource(
    app: AppHandle,
    name: String,
    text: Option<String>,
    blob: Option<String>,
) -> Result<bool, String> {
    let bytes = if let Some(text) = text {
        text.into_bytes()
    } else {
        let blob = blob.ok_or("Resource has no downloadable content")?;
        if blob.len() > 24 * 1024 * 1024 {
            return Err("Resource exceeds the download limit".into());
        }
        BASE64_STANDARD
            .decode(blob)
            .map_err(|_| "Invalid resource encoding")?
    };
    if bytes.len() > 16 * 1024 * 1024 {
        return Err("Resource exceeds the download limit".into());
    }
    let filename = Path::new(&name)
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("artifact")
        .to_string();
    let (sender, receiver) = oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(filename)
        .save_file(move |path| {
            let _ = sender.send(path);
        });
    let Some(path) = receiver.await.map_err(|_| "Download cancelled")? else {
        return Ok(false);
    };
    fs::write(
        path.into_path().map_err(|_| "Invalid download path")?,
        bytes,
    )
    .map_err(|_| "Could not save resource")?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn policy_does_not_grant_parent_or_arbitrary_frame_access() {
        let csp = widget_csp(
            &json!({"resourceDomains":["https://cdn.example/path", "javascript:alert(1)", "http://localhost:1420", "https://bad.example;script-src *"], "connectDomains":["https://api.example"]}),
        );
        assert!(csp.contains("https://cdn.example"));
        assert!(csp.contains("connect-src https://api.example"));
        assert!(csp.contains("frame-src 'none'"));
        assert!(!csp.contains("localhost"));
        assert!(!csp.contains("javascript:"));
        assert!(!csp.contains("script-src *"));
    }
    #[test]
    fn empty_policy_blocks_all_network_access_and_nested_frames() {
        let csp = widget_csp(&json!({}));
        assert!(csp.contains("connect-src 'none'"));
        assert!(csp.contains("frame-src 'none'"));
        assert!(csp.contains("form-action 'none'"));
        assert!(!csp.contains("unsafe-eval"));
    }
}
