use serde::Serialize;
use serde_json::Value;
use std::{
    env, fs,
    path::{Path, PathBuf},
    process::Command,
};

const COMPUTER_USE_PLUGIN_NAME: &str = "computer-use";
const SUPPORTED_COMPUTER_USE_PLUGIN_MAJOR: u64 = 1;
#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopRuntimeStatus {
    pub available: bool,
    pub message: Option<String>,
    pub version: Option<String>,
    pub service_compatible: bool,
    pub accessibility_trusted: Option<bool>,
    pub screen_recording_trusted: Option<bool>,
}

#[derive(Clone, Debug)]
struct DesktopRuntime {
    version: String,
    _launcher: PathBuf,
    _skill: PathBuf,
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn desktop_runtime_status() -> DesktopRuntimeStatus {
    #[cfg(not(target_os = "macos"))]
    return DesktopRuntimeStatus {
        available: false,
        message: Some("Desktop Computer Use is currently supported only on macOS.".to_string()),
        version: None,
        service_compatible: false,
        accessibility_trusted: None,
        screen_recording_trusted: None,
    };

    #[cfg(target_os = "macos")]
    return desktop_runtime_status_from(
        resolve_desktop_runtime(),
        Some(accessibility_is_trusted()),
        Some(screen_recording_is_trusted()),
    );
}

fn desktop_runtime_status_from(
    runtime: Result<DesktopRuntime, String>,
    accessibility_trusted: Option<bool>,
    screen_recording_trusted: Option<bool>,
) -> DesktopRuntimeStatus {
    match runtime {
        Ok(runtime) => DesktopRuntimeStatus {
            available: true,
            message: None,
            version: Some(runtime.version),
            service_compatible: true,
            // macOS attributes helper access to the responsible parent process.
            // When Orchestrator launches Computer Use, these non-prompting checks
            // therefore match the toggles shown for Orchestrator in System Settings.
            accessibility_trusted,
            screen_recording_trusted,
        },
        Err(error) => DesktopRuntimeStatus {
            available: false,
            message: Some(error),
            version: None,
            service_compatible: false,
            accessibility_trusted,
            screen_recording_trusted,
        },
    }
}

fn resolve_desktop_runtime() -> Result<DesktopRuntime, String> {
    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Could not resolve the Codex Computer Use plugin directory.".to_string())?;
    let plugin_root = select_highest_compatible_plugin(
        &home
            .join(".codex")
            .join("plugins")
            .join("cache")
            .join("openai-bundled")
            .join(COMPUTER_USE_PLUGIN_NAME),
        SUPPORTED_COMPUTER_USE_PLUGIN_MAJOR,
    )?;
    validate_desktop_plugin(&plugin_root)
}

fn validate_desktop_plugin(plugin_root: &Path) -> Result<DesktopRuntime, String> {
    let canonical = plugin_root
        .canonicalize()
        .map_err(|error| format!("Could not resolve the Computer Use plugin: {error}"))?;
    let manifest: Value = serde_json::from_slice(
        &fs::read(canonical.join(".codex-plugin").join("plugin.json"))
            .map_err(|error| format!("Could not read the Computer Use manifest: {error}"))?,
    )
    .map_err(|error| format!("The Computer Use manifest is invalid: {error}"))?;
    if manifest.get("name").and_then(Value::as_str) != Some(COMPUTER_USE_PLUGIN_NAME) {
        return Err(
            "The resolved Codex plugin is not the trusted Computer Use plugin.".to_string(),
        );
    }
    if manifest.get("license").and_then(Value::as_str) != Some("Proprietary") {
        return Err(
            "The Computer Use provider has an unexpected distribution manifest.".to_string(),
        );
    }
    let version = manifest
        .get("version")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or("The Computer Use plugin has no version.")?
        .to_string();
    let major = parse_version(&version)
        .map(|parts| parts.0)
        .ok_or_else(|| "The Computer Use plugin version is invalid.".to_string())?;
    if major != SUPPORTED_COMPUTER_USE_PLUGIN_MAJOR {
        return Err(format!(
            "Codex Computer Use plugin {version} is not compatible with this Orchestrator build."
        ));
    }
    let mcp_manifest_path = canonical.join(".mcp.json");
    let mcp_manifest: Value =
        serde_json::from_slice(&fs::read(&mcp_manifest_path).map_err(|error| {
            format!("Could not read the Computer Use provider manifest: {error}")
        })?)
        .map_err(|error| format!("The Computer Use provider manifest is invalid: {error}"))?;
    let command = mcp_manifest
        .pointer("/mcpServers/computer-use/command")
        .and_then(Value::as_str)
        .ok_or("The Computer Use provider command is missing.")?;
    let launcher = confined_plugin_path(&canonical, command)?;
    let skill = canonical
        .join("skills")
        .join("computer-use")
        .join("SKILL.md");
    if !launcher.is_file() || !skill.is_file() {
        return Err("The installed Computer Use provider is incomplete.".to_string());
    }
    Ok(DesktopRuntime {
        version,
        _launcher: launcher,
        _skill: skill,
    })
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn computer_use_open_accessibility_settings() -> Result<(), String> {
    open_privacy_settings("Privacy_Accessibility")
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn computer_use_open_screen_recording_settings() -> Result<(), String> {
    open_privacy_settings("Privacy_ScreenCapture")
}

fn open_privacy_settings(pane: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("/usr/bin/open")
            .arg(format!(
                "x-apple.systempreferences:com.apple.preference.security?{pane}"
            ))
            .status()
            .map_err(|error| format!("Could not open macOS privacy settings: {error}"))?;
        return status
            .success()
            .then_some(())
            .ok_or_else(|| "Could not open macOS privacy settings.".to_string());
    }
    #[cfg(not(target_os = "macos"))]
    Err("Computer Use privacy settings are available only on macOS.".to_string())
}

#[cfg(target_os = "macos")]
fn accessibility_is_trusted() -> bool {
    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn AXIsProcessTrusted() -> bool;
    }
    unsafe { AXIsProcessTrusted() }
}

#[cfg(target_os = "macos")]
fn screen_recording_is_trusted() -> bool {
    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
    }
    unsafe { CGPreflightScreenCaptureAccess() }
}

fn select_highest_compatible_plugin(root: &Path, supported_major: u64) -> Result<PathBuf, String> {
    let mut candidates = fs::read_dir(root)
        .map_err(|_| {
            "Codex's bundled Computer Use provider is not installed. Update ChatGPT or Codex and try again."
                .to_string()
        })?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let version = entry.file_name().to_string_lossy().to_string();
            let parsed = parse_version(&version)?;
            (path.is_dir() && parsed.0 == supported_major).then_some((parsed, path))
        })
        .collect::<Vec<_>>();
    candidates.sort_by_key(|(version, _)| *version);
    candidates
        .pop()
        .map(|(_, path)| path)
        .ok_or_else(|| "No compatible installed Computer Use provider was found.".to_string())
}

fn parse_version(value: &str) -> Option<(u64, u64, u64, u64)> {
    let mut parts = value.split('.').map(|part| part.parse::<u64>().ok());
    Some((
        parts.next()??,
        parts.next().flatten().unwrap_or(0),
        parts.next().flatten().unwrap_or(0),
        parts.next().flatten().unwrap_or(0),
    ))
}

fn confined_plugin_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let candidate = root.join(relative);
    let canonical = candidate
        .canonicalize()
        .map_err(|error| format!("Could not resolve the Computer Use provider: {error}"))?;
    if canonical.starts_with(root) {
        Ok(canonical)
    } else {
        Err("The Computer Use provider manifest referenced an unsafe path.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn version_selection_is_numeric_and_major_gated() {
        let root = env::temp_dir().join(format!(
            "orchestrator-computer-use-{}",
            Uuid::new_v4().simple()
        ));
        fs::create_dir_all(root.join("1.0.9")).expect("old runtime");
        fs::create_dir_all(root.join("1.0.10")).expect("new runtime");
        fs::create_dir_all(root.join("2.0.0")).expect("incompatible runtime");
        assert!(select_highest_compatible_plugin(&root, 1)
            .expect("compatible runtime")
            .ends_with("1.0.10"));
        fs::remove_dir_all(root).expect("remove runtime fixture");
    }

    #[test]
    fn invalid_versions_are_rejected() {
        assert_eq!(parse_version("1.0.1000816"), Some((1, 0, 1000816, 0)));
        assert_eq!(parse_version("latest"), None);
    }

    #[test]
    fn compatible_provider_preserves_independent_permission_preflights() {
        for (accessibility, screen_recording) in
            [(false, false), (false, true), (true, false), (true, true)]
        {
            let status = desktop_runtime_status_from(
                Ok(DesktopRuntime {
                    version: "1.0.1000816".to_string(),
                    _launcher: PathBuf::from("computer-use-client-launcher"),
                    _skill: PathBuf::from("SKILL.md"),
                }),
                Some(accessibility),
                Some(screen_recording),
            );

            assert!(status.available);
            assert!(status.service_compatible);
            assert_eq!(status.accessibility_trusted, Some(accessibility));
            assert_eq!(status.screen_recording_trusted, Some(screen_recording));
            assert_eq!(status.message, None);
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn installed_official_provider_reports_available_when_present() {
        let Some(home) = env::var_os("HOME").map(PathBuf::from) else {
            return;
        };
        let provider_root = home.join(".codex/plugins/cache/openai-bundled/computer-use");
        if !provider_root.is_dir() {
            return;
        }

        let status = desktop_runtime_status_from(
            resolve_desktop_runtime(),
            Some(accessibility_is_trusted()),
            Some(screen_recording_is_trusted()),
        );
        assert!(status.available, "{:?}", status.message);
        assert!(status.service_compatible);
        assert!(status.version.is_some());
    }
}
