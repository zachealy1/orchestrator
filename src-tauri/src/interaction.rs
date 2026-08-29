use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    env, fs,
    path::{Path, PathBuf},
};

const COMPUTER_USE_PLUGIN_NAME: &str = "computer-use";
const SUPPORTED_COMPUTER_USE_PLUGIN_MAJOR: u64 = 1;
const PINNED_COMPUTER_USE_VERSION: &str = "1.0.1000816";
const PINNED_COMPUTER_USE_MANIFEST_SHA256: &str =
    "41c5b8ef0c2cf4c62e2a51dec6f98d234152ec617573a1ced58831924a4b03a5";
const PINNED_COMPUTER_USE_MCP_SHA256: &str =
    "3516e1755f57daa9cc705c4dc048a149d5561f6d3b18059dc72fff721d7e9a73";
const PINNED_COMPUTER_USE_LAUNCHER_SHA256: &str =
    "096edf245e994f4a9a00177da90969acd2abe7d8acd73dad23844a40aea007f2";

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopRuntimeStatus {
    pub available: bool,
    pub message: Option<String>,
    pub version: Option<String>,
    pub service_compatible: bool,
    pub accessibility_trusted: bool,
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
    let accessibility_trusted = crate::default_browser::accessibility_is_trusted();
    #[cfg(not(target_os = "macos"))]
    return DesktopRuntimeStatus {
        available: false,
        message: Some("Desktop Computer Use is currently supported only on macOS.".to_string()),
        version: None,
        service_compatible: false,
        accessibility_trusted,
    };

    #[cfg(target_os = "macos")]
    match resolve_desktop_runtime() {
        Ok(runtime) => DesktopRuntimeStatus {
            available: accessibility_trusted,
            message: (!accessibility_trusted).then(|| {
                "Allow Orchestrator in macOS Accessibility settings before using desktop control."
                    .to_string()
            }),
            version: Some(runtime.version),
            service_compatible: true,
            accessibility_trusted,
        },
        Err(error) => DesktopRuntimeStatus {
            available: false,
            message: Some(error),
            version: None,
            service_compatible: false,
            accessibility_trusted,
        },
    }
}

fn resolve_desktop_runtime() -> Result<DesktopRuntime, String> {
    let plugin_root = if let Some(value) = env::var_os("ORCHESTRATOR_COMPUTER_USE_PLUGIN_ROOT") {
        PathBuf::from(value)
    } else {
        let home = env::var_os("HOME").map(PathBuf::from).ok_or_else(|| {
            "Could not resolve the Codex Computer Use plugin directory.".to_string()
        })?;
        select_highest_compatible_plugin(
            &home
                .join(".codex")
                .join("plugins")
                .join("cache")
                .join("openai-bundled")
                .join(COMPUTER_USE_PLUGIN_NAME),
            SUPPORTED_COMPUTER_USE_PLUGIN_MAJOR,
        )?
    };
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
    validate_pinned_desktop_runtime(
        &version,
        &canonical.join(".codex-plugin").join("plugin.json"),
        &mcp_manifest_path,
        &launcher,
    )?;
    Ok(DesktopRuntime {
        version,
        _launcher: launcher,
        _skill: skill,
    })
}

fn validate_pinned_desktop_runtime(
    version: &str,
    manifest: &Path,
    mcp_manifest: &Path,
    launcher: &Path,
) -> Result<(), String> {
    if version != PINNED_COMPUTER_USE_VERSION {
        return Err(format!(
            "Codex Computer Use plugin {version} has not been validated with this Orchestrator build."
        ));
    }
    for (label, path, expected) in [
        ("manifest", manifest, PINNED_COMPUTER_USE_MANIFEST_SHA256),
        (
            "provider manifest",
            mcp_manifest,
            PINNED_COMPUTER_USE_MCP_SHA256,
        ),
        ("launcher", launcher, PINNED_COMPUTER_USE_LAUNCHER_SHA256),
    ] {
        let actual = file_sha256(path)?;
        if actual != expected {
            return Err(format!(
                "The installed Computer Use {label} does not match the validated {version} provider."
            ));
        }
    }
    Ok(())
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let bytes =
        fs::read(path).map_err(|error| format!("Could not verify {}: {error}", path.display()))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
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
    fn pinned_desktop_runtime_matches_the_installed_provider_contract() {
        let home = env::var_os("HOME").map(PathBuf::from).expect("home");
        let root = home
            .join(".codex/plugins/cache/openai-bundled/computer-use")
            .join(PINNED_COMPUTER_USE_VERSION);
        if !root.is_dir() {
            return;
        }
        validate_pinned_desktop_runtime(
            PINNED_COMPUTER_USE_VERSION,
            &root.join(".codex-plugin/plugin.json"),
            &root.join(".mcp.json"),
            &root.join("bin/computer-use-client-launcher"),
        )
        .expect("installed pinned Computer Use runtime");
    }
}
