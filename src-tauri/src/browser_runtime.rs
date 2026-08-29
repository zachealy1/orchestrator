use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const LEGACY_NATIVE_HOST_NAME: &str = "com.zachealy.orchestrator.browser.json";

#[tauri::command]
#[specta::specta]
pub(crate) async fn browser_data_clear(app: AppHandle) -> Result<(), String> {
    let profile = browser_profile_path(&app)?;
    if profile.exists() {
        fs::remove_dir_all(&profile)
            .map_err(|error| format!("Could not clear in-app browser data: {error}"))?;
    }
    fs::create_dir_all(&profile)
        .map_err(|error| format!("Could not recreate the in-app browser profile: {error}"))
}

pub(crate) fn cleanup_legacy_browser_runtime(app: &AppHandle) -> Result<(), String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve Orchestrator app data: {error}"))?;
    for path in [
        app_data.join("browser-bridge"),
        app_data.join("browser-sessions"),
    ] {
        if path.exists() {
            fs::remove_dir_all(&path).map_err(|error| {
                format!("Could not remove legacy browser runtime files: {error}")
            })?;
        }
    }
    for manifest in legacy_native_host_manifest_paths() {
        if manifest.exists() {
            fs::remove_file(&manifest).map_err(|error| {
                format!("Could not remove legacy browser native-host manifest: {error}")
            })?;
        }
    }
    if let Ok(entries) = fs::read_dir("/tmp") {
        for entry in entries.filter_map(Result::ok) {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("orchestrator-browser-") && name.ends_with(".sock") {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    Ok(())
}

fn browser_profile_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("browser").join("profile"))
        .map_err(|error| format!("Could not resolve the in-app browser profile: {error}"))
}

fn legacy_native_host_manifest_paths() -> Vec<PathBuf> {
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
            .join(LEGACY_NATIVE_HOST_NAME)
    })
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleanup_targets_only_the_orchestrator_native_host_manifest() {
        assert!(legacy_native_host_manifest_paths().iter().all(|path| {
            path.file_name().and_then(|name| name.to_str())
                == Some(LEGACY_NATIVE_HOST_NAME)
        }));
    }
}
