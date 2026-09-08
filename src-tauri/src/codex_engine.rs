//! Provision and verify the managed engine without an independent update service.
use crate::engine_probe::{executable_version, verify_codex_engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, Manager};

static ENGINE: OnceLock<Mutex<EngineManager>> = OnceLock::new();
// A ready session must not wait on the provisioning mutex to start another task.
static SESSION_BINARY: OnceLock<PathBuf> = OnceLock::new();
const MAX_ARCHIVE: u64 = 300 * 1024 * 1024;
const MAX_EXECUTABLE: u64 = 600 * 1024 * 1024;

#[derive(Deserialize)]
struct PinnedRelease {
    version: String,
    archives: HashMap<String, String>,
}
fn pinned_release() -> PinnedRelease {
    serde_json::from_str(include_str!("../resources/codex-engine/release.json"))
        .expect("valid pinned release")
}
fn target() -> Result<&'static str, String> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Ok("aarch64-apple-darwin"),
        ("macos", "x86_64") => Ok("x86_64-apple-darwin"),
        _ => Err("Managed Codex engines currently support Apple silicon and Intel Macs.".into()),
    }
}
fn architecture() -> &'static str {
    if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "x64"
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Release {
    version: String,
    target: String,
    archive_sha256: String,
}
impl Release {
    fn archive_name(&self) -> String {
        format!("codex-{}.tar.gz", self.target)
    }
    fn url(&self) -> String {
        format!(
            "https://github.com/openai/codex/releases/download/rust-v{}/{}",
            self.version,
            self.archive_name()
        )
    }
    fn validate(&self) -> Result<(), String> {
        if version_parts(&self.version).is_none()
            || self.target != target()?
            || !valid_hash(&self.archive_sha256)
        {
            return Err("Invalid Codex release metadata.".into());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeRecord {
    release: Release,
    executable_sha256: String,
}
impl RuntimeRecord {
    fn directory(&self) -> Result<String, String> {
        self.release.validate()?;
        if !valid_hash(&self.executable_sha256) {
            return Err("Invalid engine checksum.".into());
        }
        Ok(format!(
            "{}-{}",
            self.release.version, self.executable_sha256
        ))
    }
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiskState {
    active: Option<RuntimeRecord>,
    previous: Option<RuntimeRecord>,
    // Retain old update metadata on disk for compatibility, but never act on it.
    #[serde(flatten)]
    legacy_metadata: HashMap<String, serde_json::Value>,
}
#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CodexEngineStatus {
    pub source: String,
    pub installed_version: Option<String>,
    pub message: Option<String>,
}
struct EngineManager {
    root: PathBuf,
    bundles: Vec<PathBuf>,
    disk: DiskState,
    // Every account in an app session uses the same engine.
    selected: Option<(PathBuf, String)>,
    message: Option<String>,
    provision_error: Option<String>,
}

pub(crate) fn initialize(app: &AppHandle) -> Result<(), String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("codex-engine");
    secure_directory(&root)?;
    let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
    let relative = format!("codex-engine/darwin-{}", architecture());
    let mut bundles = vec![
        resources.join("resources").join(&relative),
        resources.join(&relative),
    ];
    if tauri::is_dev() {
        bundles.push(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("resources")
                .join(relative),
        );
    }
    let (disk, message) = match fs::read(root.join("state.json")) {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(state) => (state, None),
            Err(_) => (
                DiskState::default(),
                Some(
                    "The saved engine settings could not be read. Recovering the packaged engine."
                        .into(),
                ),
            ),
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (DiskState::default(), None),
        Err(e) => return Err(format!("Could not read engine settings: {e}")),
    };
    ENGINE
        .set(Mutex::new(EngineManager {
            root,
            bundles,
            disk,
            selected: None,
            message,
            provision_error: None,
        }))
        .map_err(|_| "Engine manager was already initialized".to_string())
}

pub(crate) fn managed_binary() -> Option<Result<PathBuf, String>> {
    if let Some(binary) = SESSION_BINARY.get() {
        return Some(Ok(binary.clone()));
    }
    ENGINE.get().map(|engine| {
        let binary = engine
            .lock()
            .map_err(|_| "Engine manager is unavailable".to_string())?
            .ensure_selected()?;
        let _ = SESSION_BINARY.set(binary.clone());
        Ok(binary)
    })
}
fn with_manager<T>(
    action: impl FnOnce(&mut EngineManager) -> Result<T, String>,
) -> Result<T, String> {
    let mut manager = ENGINE
        .get()
        .ok_or("Engine manager is unavailable")?
        .lock()
        .map_err(|_| "Engine manager is unavailable")?;
    action(&mut manager)
}

impl EngineManager {
    fn save(&self) -> Result<(), String> {
        atomic_json(&self.root.join("state.json"), &self.disk)
    }
    fn binary(&self, record: &RuntimeRecord) -> Result<PathBuf, String> {
        Ok(self
            .root
            .join("versions")
            .join(record.directory()?)
            .join("codex"))
    }
    fn verify(&self, record: &RuntimeRecord) -> Result<PathBuf, String> {
        let binary = self.binary(record)?;
        if hash_file(&binary)? != record.executable_sha256 {
            return Err("Engine integrity check failed.".into());
        }
        Ok(binary)
    }
    fn select(&mut self, record: RuntimeRecord, probe: bool) -> Result<PathBuf, String> {
        let path = self.verify(&record)?;
        if probe {
            verify_codex_engine(&path, &record.release.version)?;
        }
        self.selected = Some((path.clone(), record.release.version));
        Ok(path)
    }
    fn ensure_selected(&mut self) -> Result<PathBuf, String> {
        if let Some((path, _)) = &self.selected {
            return Ok(path.clone());
        }
        let pinned = pinned_release();
        if let Some(active) = self.disk.active.clone().filter(|record| record.release.version == pinned.version && pinned.archives.get(&record.release.target) == Some(&record.release.archive_sha256)) {
            match self.select(active, true) {
                Ok(path) => return Ok(path),
                Err(error) => {
                    self.message = Some(format!(
                    "The saved engine could not be verified. Recovering a working engine. {error}"
                ))
                }
            }
        }
        if let Some(previous) = self.disk.previous.clone().filter(|record| record.release.version == pinned.version && pinned.archives.get(&record.release.target) == Some(&record.release.archive_sha256)) {
            if let Ok(path) = self.select(previous.clone(), true) {
                self.message = Some("Recovering a working engine matching this app release.".into());
                let old_disk = self.disk.clone();
                self.disk.active = Some(previous);
                if let Err(error) = self.save() { self.disk = old_disk; self.selected = None; return Err(error); }
                return Ok(path);
            }
        }
        let provisioned = if let Some(bundle) = self
            .bundles
            .iter()
            .find(|p| p.join("runtime.json").is_file())
            .cloned()
        {
            self.import_bundle(&bundle)
        } else {
            let pinned = pinned_release();
            let release = Release {
                version: pinned.version,
                target: target()?.into(),
                archive_sha256: pinned
                    .archives
                    .get(target()?)
                    .ok_or("No packaged engine for this platform")?
                    .clone(),
            };
            self.download(&release)
        };
        let record = match provisioned {
            Ok(record) => record,
            Err(error) => {
                // A failed upgrade must not silently masquerade as a successful activation.
                for fallback in [self.disk.active.clone(), self.disk.previous.clone()].into_iter().flatten() {
                    if let Ok(path) = self.select(fallback, true) {
                        self.message = Some(format!("Codex {} could not be activated. Using the previous verified engine for this session. Reinstall Orchestrator to retry. {error}", pinned_release().version));
                        return Ok(path);
                    }
                }
                return Err(format!("Could not activate this app's Codex engine. Reinstall Orchestrator. {error}"));
            }
        };
        let old_disk = self.disk.clone();
        let path = self.select(record.clone(), false)?;
        self.disk.previous = self.disk.active.clone().filter(|old| self.verify(old).is_ok())
            .or_else(|| self.disk.previous.clone().filter(|old| self.verify(old).is_ok()));
        self.disk.active = Some(record);
        if let Err(error) = self.save() {
            self.selected = None;
            self.disk = old_disk;
            return Err(error);
        }
        Ok(path)
    }
    fn import_bundle(&self, bundle: &Path) -> Result<RuntimeRecord, String> {
        let record: RuntimeRecord = serde_json::from_slice(
            &fs::read(bundle.join("runtime.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let pinned = pinned_release();
        record.release.validate()?;
        if record.release.version != pinned.version
            || pinned.archives.get(&record.release.target) != Some(&record.release.archive_sha256)
        {
            return Err(
                "The packaged Codex engine does not match this Orchestrator release.".into(),
            );
        }
        let source = bundle.join("codex");
        if hash_file(&source)? != record.executable_sha256 {
            return Err(
                "The packaged Codex engine failed its integrity check. Reinstall Orchestrator."
                    .into(),
            );
        }
        verify_codex_engine(&source, &record.release.version)?;
        let destination = self.binary(&record)?;
        secure_directory(destination.parent().ok_or("Invalid engine destination")?)?;
        // Version directories are never replaced during an app session.
        if !destination.exists() || hash_file(&destination)? != record.executable_sha256 {
            let temporary = destination.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
            fs::copy(source, &temporary).map_err(|e| e.to_string())?;
            make_executable(&temporary)?;
            fs::rename(&temporary, &destination).map_err(|e| e.to_string())?;
        }
        self.verify(&record)?;
        Ok(record)
    }
    fn download(&self, release: &Release) -> Result<RuntimeRecord, String> {
        release.validate()?;
        let staging = self.root.join(format!("staging-{}", uuid::Uuid::new_v4()));
        secure_directory(&staging)?;
        let result = (|| {
            let archive = staging.join("download.tar.gz");
            download_file(&release.url(), &archive, MAX_ARCHIVE)?;
            if hash_file(&archive)? != release.archive_sha256 {
                return Err("The downloaded Codex engine failed its checksum check. Your current engine is unchanged.".into());
            }
            let binary = staging.join("codex");
            extract_binary(&archive, &format!("codex-{}", release.target), &binary)?;
            make_executable(&binary)?;
            verify_codex_engine(&binary, &release.version)?;
            let record = RuntimeRecord {
                release: release.clone(),
                executable_sha256: hash_file(&binary)?,
            };
            let destination = self.binary(&record)?;
            secure_directory(
                destination
                    .parent()
                    .and_then(Path::parent)
                    .ok_or("Invalid engine destination")?,
            )?;
            fs::remove_file(archive).map_err(|e| e.to_string())?;
            if destination.exists() {
                if self.verify(&record).is_err() {
                    // Repair a corrupted immutable slot using only the already verified staged file.
                    fs::rename(&binary, &destination).map_err(|e| e.to_string())?;
                }
            } else {
                fs::rename(
                    &staging,
                    destination.parent().ok_or("Invalid engine destination")?,
                )
                .map_err(|e| e.to_string())?;
            }
            Ok(record)
        })();
        let _ = fs::remove_dir_all(&staging);
        result
    }
    fn status(&self, source: &str, version: Option<String>) -> CodexEngineStatus {
        CodexEngineStatus {
            source: source.into(),
            installed_version: version,
            message: self
                .provision_error
                .clone()
                .or_else(|| self.message.clone()),
        }
    }
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn codex_engine_status() -> Result<CodexEngineStatus, String> {
    crate::run_blocking_command("read Codex engine status", || {
        with_manager(|m| {
            if let Some(path) = std::env::var_os("ORCHESTRATOR_CODEX_BIN") {
                let version = executable_version(Path::new(&path));
                m.provision_error = version.as_ref().err().cloned();
                return Ok(m.status("override", version.ok()));
            }
            match m.ensure_selected() {
                Ok(binary) => {
                    let _ = SESSION_BINARY.set(binary);
                    m.provision_error = None;
                    Ok(m.status("managed", m.selected.as_ref().map(|s| s.1.clone())))
                }
                Err(error) => {
                    m.provision_error = Some(error);
                    Ok(m.status("unavailable", None))
                }
            }
        })
    })
    .await
}
fn version_parts(version: &str) -> Option<[u64; 3]> {
    let parts: Vec<_> = version.split('.').collect();
    if parts.len() != 3
        || parts
            .iter()
            .any(|p| p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit()))
    {
        return None;
    }
    Some([
        parts[0].parse().ok()?,
        parts[1].parse().ok()?,
        parts[2].parse().ok()?,
    ])
}
fn valid_hash(hash: &str) -> bool {
    hash.len() == 64
        && hash
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
fn hash_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() > MAX_EXECUTABLE {
        return Err("Codex engine file is too large".into());
    }
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(format!("{:x}", digest.finalize()))
}
fn secure_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn make_executable(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    Ok(())
}
fn atomic_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        file.write_all(&serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    let _ = fs::remove_file(temporary);
    result
}
fn download_file(url: &str, destination: &Path, limit: u64) -> Result<(), String> {
    let output = Command::new("/usr/bin/curl")
        .args([
            "--disable",
            "--fail",
            "--location",
            "--silent",
            "--show-error",
            "--proto",
            "=https",
            "--proto-redir",
            "=https",
            "--connect-timeout",
            "15",
            "--max-time",
            "180",
            "--max-filesize",
            &limit.to_string(),
            "--user-agent",
            "Orchestrator-Codex-Engine",
            "--output",
        ])
        .arg(destination)
        .arg(url)
        .output()
        .map_err(|e| format!("Could not download the Codex engine: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "Download failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    if fs::metadata(destination).map_err(|e| e.to_string())?.len() > limit {
        return Err("Download exceeded its size limit.".into());
    }
    Ok(())
}
fn extract_binary(archive: &Path, expected: &str, destination: &Path) -> Result<(), String> {
    let decoder = flate2::read::GzDecoder::new(fs::File::open(archive).map_err(|e| e.to_string())?);
    let mut tar = tar::Archive::new(decoder);
    let mut found = false;
    for entry in tar.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        if found
            || entry.path().map_err(|e| e.to_string())? != Path::new(expected)
            || !entry.header().entry_type().is_file()
            || entry.size() > MAX_EXECUTABLE
        {
            return Err("The Codex archive contained unexpected files.".into());
        }
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(destination)
            .map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut output).map_err(|e| e.to_string())?;
        output.sync_all().map_err(|e| e.to_string())?;
        found = true;
    }
    if !found {
        return Err("The Codex archive did not contain an engine.".into());
    }
    Ok(())
}

#[cfg(test)]
#[path = "tests/codex_engine.rs"]
mod tests;
