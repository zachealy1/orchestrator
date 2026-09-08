//! Application updates only: never an independent engine updater or account service.
use crate::{database::DatabaseState, models::CodexState, update_gate};
use serde::Serialize;
use std::{sync::Mutex, time::Duration};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

const ENDPOINT: &str =
    "https://raw.githubusercontent.com/zachealy1/orchestrator/update-feed/beta.json";
const DOWNLOADS: &str = "https://github.com/zachealy1/orchestrator/releases";
const PUBLIC_KEY: Option<&str> = option_env!("ORCHESTRATOR_UPDATER_PUBLIC_KEY");

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppUpdateState {
    pub phase: String,
    pub version: Option<String>,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub error: Option<String>,
    pub manual_url: String,
}
impl Default for AppUpdateState {
    fn default() -> Self {
        Self {
            phase: "idle".into(),
            version: None,
            downloaded_bytes: 0,
            total_bytes: None,
            error: None,
            manual_url: DOWNLOADS.into(),
        }
    }
}
#[derive(Default)]
struct Inner {
    state: AppUpdateState,
    candidate: Option<Update>,
    bytes: Option<Vec<u8>>,
    busy: bool,
}
#[derive(Default)]
pub(crate) struct AppUpdateService(Mutex<Inner>);

impl AppUpdateService {
    fn change(&self, app: &AppHandle, edit: impl FnOnce(&mut Inner)) -> AppUpdateState {
        let mut inner = self.0.lock().unwrap_or_else(|e| e.into_inner());
        edit(&mut inner);
        let state = inner.state.clone();
        let _ = app.emit("app-update:state", &state);
        state
    }
    fn begin(&self, phase: &str) -> Result<(), String> {
        let mut inner = self.0.lock().map_err(|_| "Update service is unavailable")?;
        if inner.busy {
            return Err("An update operation is already in progress.".into());
        }
        inner.busy = true;
        inner.state.phase = phase.into();
        inner.state.error = None;
        Ok(())
    }
}

fn validate_candidate(
    version: &str,
    current: &str,
    url: &url::Url,
    signature: &str,
) -> Result<(), String> {
    let next = semver::Version::parse(version).map_err(|_| "Invalid update version")?;
    let current = semver::Version::parse(current).map_err(|_| "Invalid application version")?;
    let arch = if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        "x86_64"
    };
    let expected_path = format!("/zachealy1/orchestrator/releases/download/v{version}/Orchestrator_{arch}.app.tar.gz");
    if next <= current
        || url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || url.path() != expected_path
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || signature.trim().is_empty()
    {
        return Err("This update package is not a valid newer Orchestrator release.".into());
    }
    Ok(())
}
async fn candidate(app: &AppHandle) -> Result<Option<Update>, String> {
    let key = PUBLIC_KEY.filter(|key| !key.trim().is_empty())
        .ok_or("App updates are not configured in this build. Install a signed public beta from the downloads page.")?;
    let mut update = app
        .updater_builder()
        .pubkey(key.trim())
        .endpoints(vec![ENDPOINT
            .parse()
            .map_err(|_| "Invalid update endpoint")?])
        .map_err(|e| e.to_string())?
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    if let Some(item) = &mut update {
        validate_candidate(
            &item.version,
            &item.current_version,
            &item.download_url,
            &item.signature,
        )?;
        item.timeout = Some(Duration::from_secs(900));
    }
    Ok(update)
}

#[tauri::command]
#[specta::specta]
pub(crate) fn app_update_state(service: State<'_, AppUpdateService>) -> AppUpdateState {
    service
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .state
        .clone()
}
#[tauri::command]
#[specta::specta]
pub(crate) async fn app_update_check(
    app: AppHandle,
    service: State<'_, AppUpdateService>,
) -> Result<AppUpdateState, String> {
    {
        let inner = service
            .0
            .lock()
            .map_err(|_| "Update service is unavailable")?;
        if inner.busy || inner.bytes.is_some() {
            return Ok(inner.state.clone());
        }
    }
    service.begin("checking")?;
    service.change(&app, |_| {});
    let result = candidate(&app).await;
    Ok(service.change(&app, |inner| {
        inner.busy = false;
        match result {
            Ok(update) => {
                inner.state.version = update.as_ref().map(|u| u.version.clone());
                inner.state.phase = if update.is_some() {
                    "available"
                } else {
                    "idle"
                }
                .into();
                inner.candidate = update;
            }
            Err(error) => {
                inner.state.phase = if inner.candidate.is_some() {
                    "available"
                } else {
                    "idle"
                }
                .into();
                inner.state.error = Some(error);
            }
        }
    }))
}
#[tauri::command]
#[specta::specta]
pub(crate) async fn app_update_download(
    app: AppHandle,
    service: State<'_, AppUpdateService>,
) -> Result<AppUpdateState, String> {
    service.begin("downloading")?;
    service.change(&app, |inner| {
        inner.state.downloaded_bytes = 0;
        inner.bytes = None;
    });
    let result = async {
        let update = candidate(&app)
            .await?
            .ok_or("This update has been withdrawn. Check again later.")?;
        service.change(&app, |inner| {
            inner.state.version = Some(update.version.clone());
        });
        let bytes = update
            .download(
                |chunk, total| {
                    service.change(&app, |inner| {
                        inner.state.downloaded_bytes += chunk as u64;
                        inner.state.total_bytes = total;
                    });
                },
                || {},
            )
            .await
            .map_err(|e| format!("Update download or signature verification failed: {e}"))?;
        validate_package(&bytes, &update.version)?;
        Ok::<_, String>((update, bytes))
    }
    .await;
    Ok(service.change(&app, |inner| {
        inner.busy = false;
        match result {
            Ok((update, bytes)) => {
                inner.candidate = Some(update);
                inner.bytes = Some(bytes);
                inner.state.phase = "ready".into();
            }
            Err(error) => {
                inner.state.phase = "download-error".into();
                inner.state.error = Some(error);
            }
        }
    }))
}

async fn assert_idle(app: &AppHandle) -> Result<(), String> {
    let codex = app.state::<CodexState>();
    if !codex
        .pending
        .lock()
        .map_err(|_| "Cannot check active requests")?
        .is_empty()
        || !codex
            .pending_server_requests
            .lock()
            .map_err(|_| "Cannot check approvals")?
            .is_empty()
    {
        return Err("Finish pending requests and approvals before installing.".into());
    }
    let database = app.state::<DatabaseState>();
    let mut connection = database.acquire().await?;
    let busy: i64 = sqlx::query_scalar("SELECT
        EXISTS(SELECT 1 FROM kanban_attempts WHERE status IN ('provisioning','starting','running','waiting_user','waiting_approval','pause_requested','stop_requested'))
        OR EXISTS(SELECT 1 FROM kanban_operations WHERE status = 'applying')
        OR EXISTS(SELECT 1 FROM kanban_local_reviews WHERE status IN ('committing','merging'))
        OR EXISTS(SELECT 1 FROM prompt_queue_items WHERE status IN ('starting','steering','active')
            OR (auto_send_enabled = 1 AND status IN ('queued','scheduled-next')))
        OR EXISTS(SELECT 1 FROM kanban_pull_requests WHERE publication_status IN ('queued','publishing'))")
        .fetch_one(&mut *connection).await.map_err(|_| "Cannot verify background work. Update installation was blocked.")?;
    if busy != 0 {
        return Err("Finish background work and publication, or disable automatic sending for queued prompts before installing.".into());
    }
    sqlx::query("PRAGMA wal_checkpoint(FULL)")
        .execute(&mut *connection)
        .await
        .map_err(|_| "Could not flush application data. Installation was cancelled.")?;
    Ok(())
}
#[tauri::command]
#[specta::specta]
pub(crate) async fn app_update_install(
    app: AppHandle,
    service: State<'_, AppUpdateService>,
) -> Result<AppUpdateState, String> {
    service.begin("installing")?;
    let result = async {
        let _exclusive = update_gate::install()?;
        assert_idle(&app).await?;
        let current = match candidate(&app).await? {
            Some(update) => update,
            None => {
                service.change(&app, |inner| {
                    inner.bytes = None;
                    inner.candidate = None;
                    inner.state.version = None;
                });
                return Err("This update was withdrawn. Check for updates again later.".into());
            }
        };
        let (downloaded, bytes) = {
            let mut inner = service
                .0
                .lock()
                .map_err(|_| "Update service is unavailable")?;
            let downloaded = inner.candidate.clone().ok_or("Download an update first.")?;
            if downloaded.version != current.version
                || downloaded.signature != current.signature
                || downloaded.download_url != current.download_url
            {
                inner.bytes = None;
                inner.state.version = Some(current.version.clone());
                inner.candidate = Some(current.clone());
                return Err(
                    "The available package changed. Check for updates and download it again."
                        .into(),
                );
            }
            (
                downloaded,
                inner.bytes.take().ok_or("Download an update first.")?,
            )
        };
        // Do not request elevated privileges or bypass Gatekeeper for read-only installs.
        let executable = std::env::current_exe().map_err(|e| e.to_string())?;
        let bundle = executable
            .ancestors()
            .nth(3)
            .ok_or("Cannot locate the application bundle")?;
        let parent = bundle
            .parent()
            .ok_or("Cannot locate the application folder")?;
        let probe = parent.join(format!(".orchestrator-update-{}", uuid::Uuid::new_v4()));
        let writable = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&probe);
        if writable.is_err() {
            return Err(
                "This app cannot replace itself here. Install the update from the downloads page."
                    .into(),
            );
        }
        drop(writable);
        std::fs::remove_file(&probe).map_err(|e| e.to_string())?;
        downloaded
            .install(&bytes)
            .map_err(|e| format!("Installation failed. Use the manual installer. {e}"))?;
        app.restart();
        #[allow(unreachable_code)]
        Ok::<(), String>(())
    }
    .await;
    Ok(service.change(&app, |inner| {
        inner.busy = false;
        inner.state.phase = if inner.bytes.is_some() {
            "ready"
        } else if inner.state.version.is_some() {
            "download-error"
        } else {
            "idle"
        }
        .into();
        inner.state.error = result.err();
    }))
}

fn validate_package(bytes: &[u8], expected_version: &str) -> Result<(), String> {
    use std::io::Read;
    let gzip = flate2::read::GzDecoder::new(bytes);
    let mut archive = tar::Archive::new(gzip);
    let mut matched = false;
    let mut metadata = false;
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().map_err(|e| e.to_string())?.into_owned();
        if path.is_absolute()
            || !path.starts_with("Orchestrator.app")
            || path
                .components()
                .any(|part| matches!(part, std::path::Component::ParentDir))
        {
            return Err("Update archive contains an unsafe path.".into());
        }
        if path == std::path::Path::new("Orchestrator.app/Contents/Info.plist") {
            if metadata || !entry.header().entry_type().is_file() || entry.size() > 1024 * 1024 {
                return Err("Invalid application metadata in update.".into());
            }
            let mut contents = Vec::new();
            entry
                .read_to_end(&mut contents)
                .map_err(|e| e.to_string())?;
            let value = plist::Value::from_reader(std::io::Cursor::new(contents))
                .map_err(|e| e.to_string())?;
            let dictionary = value
                .as_dictionary()
                .ok_or("Invalid application metadata")?;
            let text = |key: &str| dictionary.get(key).and_then(plist::Value::as_string);
            // Bind the signed payload to the advertised version. A valid old
            // signature must not permit replay under a forged newer manifest.
            if text("CFBundleIdentifier") != Some("com.zachealy.orchestrator")
                || text("CFBundleShortVersionString") != Some(expected_version)
                || text("CFBundleVersion") != Some(expected_version)
                || text("CFBundleExecutable") != Some("orchestrator")
            {
                return Err(
                    "The signed application does not match this update's identity or version."
                        .into(),
                );
            }
            metadata = true;
        }
        if path == std::path::Path::new("Orchestrator.app/Contents/MacOS/orchestrator") {
            if matched || !entry.header().entry_type().is_file() {
                return Err("Invalid application executable in update.".into());
            }
            let mut header = [0u8; 8];
            entry.read_exact(&mut header).map_err(|e| e.to_string())?;
            let cpu = if cfg!(target_arch = "aarch64") {
                0x0100000cu32
            } else {
                0x01000007u32
            };
            if u32::from_le_bytes(header[..4].try_into().unwrap()) != 0xfeedfacf
                || u32::from_le_bytes(header[4..].try_into().unwrap()) != cpu
            {
                return Err(
                    "This update is for a different Mac architecture. Use the matching installer."
                        .into(),
                );
            }
            matched = true;
        }
    }
    if !matched || !metadata {
        return Err("The update does not contain an Orchestrator application.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn updater_configuration_initializes_without_a_development_signing_key() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let _: tauri_plugin_updater::Config =
            serde_json::from_value(config["plugins"]["updater"].clone()).unwrap();
    }
    #[test]
    fn validates_newer_beta_versions_and_trusted_artifacts() {
        let arch = if cfg!(target_arch = "aarch64") {
            "aarch64"
        } else {
            "x86_64"
        };
        let url = format!("https://github.com/zachealy1/orchestrator/releases/download/v0.2.0-beta.2/Orchestrator_{arch}.app.tar.gz").parse().unwrap();
        assert!(validate_candidate("0.2.0-beta.2", "0.2.0-beta.1", &url, "signature").is_ok());
        for version in ["bad", "0.1.0", "0.2.0-beta.1"] {
            assert!(validate_candidate(version, "0.2.0-beta.1", &url, "signature").is_err());
        }
        assert!(validate_candidate(
            "0.2.0-beta.2",
            "0.2.0-beta.1",
            &"https://example.com/app.tar.gz".parse().unwrap(),
            "signature"
        )
        .is_err());
        assert!(validate_candidate("0.2.0-beta.2", "0.2.0-beta.1", &url, "").is_err());
        let retired = format!("https://github.com/zachealy1/orchestrator-releases/releases/download/v0.2.0-beta.2/Orchestrator_{arch}.app.tar.gz").parse().unwrap();
        assert!(validate_candidate("0.2.0-beta.2", "0.2.0-beta.1", &retired, "signature").is_err());
    }
    #[test]
    fn rejects_wrong_architecture_even_if_a_signed_manifest_names_the_wrong_file() {
        let cpu: u32 = if cfg!(target_arch = "aarch64") {
            0x0100000c
        } else {
            0x01000007
        };
        for (candidate, advertised, expected) in [
            (cpu, "0.2.0-beta.2", true),
            (0, "0.2.0-beta.2", false),
            (cpu, "0.2.0-beta.3", false),
        ] {
            let mut bytes = Vec::new();
            bytes.extend(0xfeedfacfu32.to_le_bytes());
            bytes.extend(candidate.to_le_bytes());
            let gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
            let mut tar = tar::Builder::new(gz);
            let mut header = tar::Header::new_gnu();
            header.set_mode(0o755);
            header.set_size(8);
            header.set_cksum();
            tar.append_data(
                &mut header,
                "Orchestrator.app/Contents/MacOS/orchestrator",
                &bytes[..],
            )
            .unwrap();
            let metadata = br#"<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.zachealy.orchestrator</string><key>CFBundleExecutable</key><string>orchestrator</string><key>CFBundleShortVersionString</key><string>0.2.0-beta.2</string><key>CFBundleVersion</key><string>0.2.0-beta.2</string></dict></plist>"#;
            let mut header = tar::Header::new_gnu();
            header.set_mode(0o644);
            header.set_size(metadata.len() as u64);
            header.set_cksum();
            tar.append_data(
                &mut header,
                "Orchestrator.app/Contents/Info.plist",
                &metadata[..],
            )
            .unwrap();
            let archive = tar.into_inner().unwrap().finish().unwrap();
            assert_eq!(validate_package(&archive, advertised).is_ok(), expected);
        }
    }
}
