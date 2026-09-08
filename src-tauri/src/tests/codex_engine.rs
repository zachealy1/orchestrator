use super::*;
use serde_json::json;

#[test]
fn provisioning_rejects_invalid_release_metadata() {
    let release = Release {
        version: "0.153.4".into(),
        target: target().unwrap().into(),
        archive_sha256: "a".repeat(64),
        code_mode_host_archive_sha256: None,
    };
    assert!(release.validate().is_ok());
    assert!(release
        .url()
        .starts_with("https://github.com/openai/codex/releases/download/rust-v0.153.4/"));
    for version in ["0.154.0-beta", "../../bad", "0.154", ""] {
        assert!(Release {
            version: version.into(),
            ..release.clone()
        }
        .validate()
        .is_err());
    }
    assert!(Release {
        target: "untrusted".into(),
        ..release.clone()
    }
    .validate()
    .is_err());
    assert!(Release {
        archive_sha256: "untrusted".into(),
        ..release
    }
    .validate()
    .is_err());
}
fn temporary() -> PathBuf {
    let path =
        std::env::temp_dir().join(format!("orchestrator-engine-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&path).unwrap();
    path
}
#[test]
fn extraction_rejects_extra_entries_and_symlinks() {
    for symlink in [false, true] {
        let root = temporary();
        let archive = root.join("archive.tar.gz");
        let gz = flate2::write::GzEncoder::new(
            fs::File::create(&archive).unwrap(),
            flate2::Compression::default(),
        );
        let mut builder = tar::Builder::new(gz);
        let mut header = tar::Header::new_gnu();
        header.set_mode(0o755);
        if symlink {
            header.set_entry_type(tar::EntryType::Symlink);
            header.set_link_name("/tmp/not-codex").unwrap();
            header.set_size(0);
        } else {
            header.set_size(4);
        }
        header.set_cksum();
        builder
            .append_data(
                &mut header,
                "codex-test",
                if symlink { &b""[..] } else { &b"test"[..] },
            )
            .unwrap();
        if !symlink {
            builder
                .append_data(&mut header, "unexpected", &b"test"[..])
                .unwrap();
        }
        builder.into_inner().unwrap().finish().unwrap();
        assert!(extract_binary(&archive, "codex-test", &root.join("codex")).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
#[test]
fn failed_integrity_check_preserves_active_record() {
    let root = temporary();
    let release = Release {
        version: "0.153.4".into(),
        target: target().unwrap().into(),
        archive_sha256: "a".repeat(64),
        code_mode_host_archive_sha256: None,
    };
    let active = RuntimeRecord {
        release,
        executable_sha256: "b".repeat(64),
        code_mode_host_sha256: None,
    };
    let manager = EngineManager {
        root: root.clone(),
        bundles: vec![],
        disk: DiskState {
            active: Some(active.clone()),
            ..DiskState::default()
        },
        selected: None,
        message: None,
        provision_error: None,
    };
    manager.save().unwrap();
    assert!(manager.verify(&active).is_err());
    let saved: DiskState =
        serde_json::from_slice(&fs::read(root.join("state.json")).unwrap()).unwrap();
    assert_eq!(
        saved.active.unwrap().executable_sha256,
        active.executable_sha256
    );
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn current_session_keeps_its_selected_engine() {
    let root = temporary();
    let mut manager = EngineManager {
        root: root.clone(),
        bundles: vec![],
        disk: DiskState::default(),
        selected: Some((root.join("old-codex"), "0.153.4".into())),
        message: None,
        provision_error: None,
    };
    manager.disk.active = Some(RuntimeRecord {
        release: Release {
            version: "0.154.0".into(),
            target: target().unwrap().into(),
            archive_sha256: "a".repeat(64),
            code_mode_host_archive_sha256: None,
        },
        executable_sha256: "b".repeat(64),
        code_mode_host_sha256: None,
    });
    assert_eq!(manager.ensure_selected().unwrap(), root.join("old-codex"));
    assert_eq!(
        manager
            .status("managed", Some("0.153.4".into()))
            .installed_version
            .as_deref(),
        Some("0.153.4")
    );
    fs::remove_dir_all(root).unwrap();
}

fn fake_runtime(manager: &EngineManager, version: &str, compatible: bool) -> RuntimeRecord {
    let probe = manager.root.join(format!("fake-{version}"));
    let features = if compatible {
        r#"{"data":[{"name":"request_permissions_tool","enabled":true},{"name":"multi_agent_v2","enabled":true}]}"#
    } else {
        r#"{"data":[]}"#
    };
    let script = format!(
        r##"#!/bin/sh
if [ "$1" = "--version" ]; then echo 'codex-cli {version}'; exit 0; fi
if [ "$1" = "--help" ]; then echo 'Usage: codex-code-mode-host [OPTIONS]'; exit 0; fi
while IFS= read -r line; do
case "$line" in
*'"method":"initialize"'*) echo '{{"id":1,"result":{{}}}}';;
*'"method":"experimentalFeature/list"'*) echo '{{"id":2,"result":{features}}}';;
*'"method":"permissionProfile/list"'*) echo '{{"id":3,"result":{{"data":[{{"id":":read-only","allowed":true}},{{"id":"orchestrator_workspace_network_v1","allowed":true}}]}}}}';;
*'"method":"collaborationMode/list"'*) echo '{{"id":4,"result":{{"data":[{{"mode":"plan"}},{{"mode":"default"}}]}}}}';;
*'"method":"model/list"'*) echo '{{"id":5,"result":{{"data":[]}}}}';;
*'"method":"thread/start"'*) echo '{{"id":6,"result":{{"thread":{{"id":"probe"}}}}}}';;
*'"method":"command/exec"'*) echo '{{"id":7,"result":{{"exitCode":0,"stdout":"orchestrator-engine-probe","stderr":""}}}}';;
esac
done
"##
    );
    fs::write(&probe, script).unwrap();
    make_executable(&probe).unwrap();
    let record = RuntimeRecord {
        release: Release {
            version: version.into(),
            target: target().unwrap().into(),
            archive_sha256: if version == pinned_release().version {
                pinned_release().archives[target().unwrap()].clone()
            } else {
                "a".repeat(64)
            },
            code_mode_host_archive_sha256: Some(if version == pinned_release().version {
                pinned_release().code_mode_host_archives[target().unwrap()].clone()
            } else {
                "c".repeat(64)
            }),
        },
        executable_sha256: hash_file(&probe).unwrap(),
        code_mode_host_sha256: Some(hash_file(&probe).unwrap()),
    };
    let binary = manager.binary(&record).unwrap();
    secure_directory(binary.parent().unwrap()).unwrap();
    fs::copy(
        &probe,
        binary.parent().unwrap().join("codex-code-mode-host"),
    )
    .unwrap();
    fs::rename(probe, binary).unwrap();
    record
}
fn test_manager() -> EngineManager {
    EngineManager {
        root: temporary(),
        bundles: vec![],
        disk: DiskState::default(),
        selected: None,
        message: None,
        provision_error: None,
    }
}
#[test]
fn legacy_pending_updates_are_preserved_but_never_activated() {
    let mut manager = test_manager();
    let old = fake_runtime(&manager, &pinned_release().version, true);
    let new = fake_runtime(&manager, "999.0.0", true);
    let legacy = json!({
        "active": old,
        "previous": null,
        "pending": new,
        "latest": new.release,
        "lastCheckedAt": 1234,
    });
    manager.disk = serde_json::from_value(legacy.clone()).unwrap();
    manager.save().unwrap();
    assert_eq!(
        manager.ensure_selected().unwrap(),
        manager.binary(&old).unwrap()
    );
    assert_eq!(
        manager.selected.as_ref().unwrap().1,
        pinned_release().version
    );
    manager.save().unwrap();
    let saved: serde_json::Value =
        serde_json::from_slice(&fs::read(manager.root.join("state.json")).unwrap()).unwrap();
    assert_eq!(saved, legacy);
    assert!(manager.binary(&new).unwrap().exists());
    // The retained metadata remains inert after another application restart.
    manager.selected = None;
    manager.disk = serde_json::from_value(saved).unwrap();
    assert_eq!(
        manager.ensure_selected().unwrap(),
        manager.binary(&old).unwrap()
    );
    let status = serde_json::to_value(manager.status("managed", Some("0.153.4".into()))).unwrap();
    assert!(status.get("pendingVersion").is_none());
    assert!(status.get("latestVersion").is_none());
    assert!(status.get("updateAvailable").is_none());
    assert!(status.get("lastCheckedAt").is_none());
    fs::remove_dir_all(manager.root).unwrap();
}
#[test]
fn incompatible_or_corrupt_active_engine_recovers_previous_engine() {
    for corrupt in [false, true] {
        let mut manager = test_manager();
        let old = fake_runtime(&manager, &pinned_release().version, true);
        let new = fake_runtime(&manager, "999.0.0", false);
        if corrupt {
            fs::write(manager.binary(&new).unwrap(), "bad download").unwrap();
        }
        manager.disk.previous = Some(old.clone());
        manager.disk.active = Some(new);
        manager.save().unwrap();
        assert_eq!(
            manager.ensure_selected().unwrap(),
            manager.binary(&old).unwrap()
        );
        assert!(manager
            .message
            .as_ref()
            .unwrap()
            .contains("Recovering a working engine"));
        let saved: DiskState =
            serde_json::from_slice(&fs::read(manager.root.join("state.json")).unwrap()).unwrap();
        assert_eq!(
            saved.active.unwrap().release.version,
            pinned_release().version
        );
        fs::remove_dir_all(manager.root).unwrap();
    }
}
#[test]
fn current_engine_starts_without_network_or_bundled_or_external_installation() {
    let mut manager = test_manager();
    let old = fake_runtime(&manager, &pinned_release().version, true);
    manager.disk.active = Some(old.clone());
    assert_eq!(
        manager.ensure_selected().unwrap(),
        manager.binary(&old).unwrap()
    );
    assert_eq!(
        manager.selected.as_ref().unwrap().1,
        pinned_release().version
    );
    fs::remove_dir_all(manager.root).unwrap();
}

#[test]
fn first_launch_imports_packaged_engine_without_path_lookup_or_network() {
    let mut manager = test_manager();
    let pinned = pinned_release();
    let mut record = fake_runtime(&manager, &pinned.version, true);
    record.release.archive_sha256 = pinned.archives.get(target().unwrap()).unwrap().clone();
    let bundle = manager.root.join("bundle");
    secure_directory(&bundle).unwrap();
    fs::rename(manager.binary(&record).unwrap(), bundle.join("codex")).unwrap();
    fs::rename(
        manager
            .binary(&record)
            .unwrap()
            .with_file_name("codex-code-mode-host"),
        bundle.join("codex-code-mode-host"),
    )
    .unwrap();
    atomic_json(&bundle.join("runtime.json"), &record).unwrap();
    manager.bundles.push(bundle);
    let path = manager.ensure_selected().unwrap();
    assert_eq!(hash_file(&path).unwrap(), record.executable_sha256);
    assert_eq!(
        manager.disk.active.as_ref().unwrap().release.version,
        pinned.version
    );
    assert!(manager.disk.legacy_metadata.is_empty());
    fs::remove_dir_all(manager.root).unwrap();
}

#[test]
fn app_upgrade_activates_bundled_pin_and_retains_previous_engine() {
    let mut manager = test_manager();
    let old = fake_runtime(&manager, "0.152.0", true);
    manager.disk.active = Some(old.clone());
    let pinned = pinned_release();
    let mut record = fake_runtime(&manager, &pinned.version, true);
    record.release.archive_sha256 = pinned.archives.get(target().unwrap()).unwrap().clone();
    let bundle = manager.root.join("bundle");
    secure_directory(&bundle).unwrap();
    fs::rename(manager.binary(&record).unwrap(), bundle.join("codex")).unwrap();
    fs::rename(
        manager
            .binary(&record)
            .unwrap()
            .with_file_name("codex-code-mode-host"),
        bundle.join("codex-code-mode-host"),
    )
    .unwrap();
    atomic_json(&bundle.join("runtime.json"), &record).unwrap();
    manager.bundles.push(bundle);
    assert_eq!(
        manager.ensure_selected().unwrap(),
        manager.binary(&record).unwrap()
    );
    assert_eq!(
        manager.disk.previous.as_ref().unwrap().release.version,
        "0.152.0"
    );
    manager.selected = None;
    assert_eq!(
        manager.ensure_selected().unwrap(),
        manager.binary(&record).unwrap()
    );
    assert!(manager.binary(&old).unwrap().is_file());
    fs::remove_dir_all(manager.root).unwrap();
}

#[test]
fn failed_bundle_upgrade_reports_recovery_without_changing_active_record() {
    let mut manager = test_manager();
    let old = fake_runtime(&manager, "0.152.0", true);
    manager.disk.active = Some(old.clone());
    manager.save().unwrap();
    let bundle = manager.root.join("broken-bundle");
    secure_directory(&bundle).unwrap();
    fs::write(bundle.join("runtime.json"), "invalid metadata").unwrap();
    manager.bundles.push(bundle);
    assert_eq!(
        manager.ensure_selected().unwrap(),
        manager.binary(&old).unwrap()
    );
    assert!(manager
        .message
        .as_ref()
        .unwrap()
        .contains("could not be activated"));
    assert_eq!(
        manager.disk.active.as_ref().unwrap().release.version,
        "0.152.0"
    );
    fs::remove_dir_all(manager.root).unwrap();
}

#[test]
#[ignore = "Requires a packaged official engine; set ORCHESTRATOR_ENGINE_TEST_BUNDLE"]
fn official_packaged_engine_imports_and_restarts_without_an_external_installation() {
    let mut manager = test_manager();
    let bundle = PathBuf::from(
        std::env::var_os("ORCHESTRATOR_ENGINE_TEST_BUNDLE").expect("packaged runtime directory"),
    );
    manager.bundles.push(bundle);
    let selected = manager.ensure_selected().unwrap();
    assert!(selected.starts_with(manager.root.join("versions")));
    assert_eq!(
        executable_version(&selected).unwrap(),
        pinned_release().version
    );
    // Simulate a subsequent launch with no package resources and no external executable lookup.
    let mut restarted = EngineManager {
        root: manager.root.clone(),
        bundles: vec![],
        disk: serde_json::from_slice(&fs::read(manager.root.join("state.json")).unwrap()).unwrap(),
        selected: None,
        message: None,
        provision_error: None,
    };
    assert_eq!(restarted.ensure_selected().unwrap(), selected);
    // Inventory-only probes used to pass this incomplete installation.
    fs::remove_file(selected.with_file_name("codex-code-mode-host")).unwrap();
    let error = verify_codex_engine(&selected, &pinned_release().version).unwrap_err();
    assert!(
        error.contains("required Code Mode host is missing"),
        "{error}"
    );
    fs::remove_dir_all(manager.root).unwrap();
}

fn copy_bundle(manager: &EngineManager, record: &RuntimeRecord) -> PathBuf {
    let bundle = manager.root.join("bundle");
    secure_directory(&bundle).unwrap();
    for name in ["codex", "codex-code-mode-host"] {
        fs::copy(
            manager.binary(record).unwrap().with_file_name(name),
            bundle.join(name),
        )
        .unwrap();
    }
    atomic_json(&bundle.join("runtime.json"), record).unwrap();
    bundle
}

#[test]
fn legacy_single_binary_install_is_repaired_in_a_new_slot_without_deleting_it() {
    let mut manager = test_manager();
    let record = fake_runtime(&manager, &pinned_release().version, true);
    manager.bundles.push(copy_bundle(&manager, &record));
    let mut legacy_json = serde_json::to_value(&record).unwrap();
    legacy_json
        .as_object_mut()
        .unwrap()
        .remove("codeModeHostSha256");
    legacy_json["release"]
        .as_object_mut()
        .unwrap()
        .remove("codeModeHostArchiveSha256");
    let legacy: RuntimeRecord = serde_json::from_value(legacy_json.clone()).unwrap();
    assert_eq!(serde_json::to_value(&legacy).unwrap(), legacy_json);
    let old_path = manager.binary(&legacy).unwrap();
    secure_directory(old_path.parent().unwrap()).unwrap();
    fs::copy(manager.binary(&record).unwrap(), &old_path).unwrap();
    fs::remove_dir_all(manager.binary(&record).unwrap().parent().unwrap()).unwrap();
    manager.disk.active = Some(legacy);
    manager.save().unwrap();
    let path = manager.ensure_selected().unwrap();
    assert_ne!(path, old_path);
    assert!(old_path.is_file());
    assert!(path.with_file_name("codex-code-mode-host").is_file());
    assert!(manager
        .disk
        .active
        .as_ref()
        .unwrap()
        .code_mode_host_sha256
        .is_some());
    fs::remove_dir_all(manager.root).unwrap();
}

#[test]
fn host_integrity_failures_are_detected_and_repaired_from_the_bundle() {
    for damage in ["missing", "corrupt", "symlink", "not-executable"] {
        let mut manager = test_manager();
        let record = fake_runtime(&manager, &pinned_release().version, true);
        let bundle = copy_bundle(&manager, &record);
        manager.bundles.push(bundle.clone());
        manager.disk.active = Some(record.clone());
        let host = manager
            .binary(&record)
            .unwrap()
            .with_file_name("codex-code-mode-host");
        fs::remove_file(&host).unwrap();
        match damage {
            "corrupt" => fs::write(&host, "damaged").unwrap(),
            "symlink" => {
                std::os::unix::fs::symlink(bundle.join("codex-code-mode-host"), &host).unwrap()
            }
            "not-executable" => {
                use std::os::unix::fs::PermissionsExt;
                fs::copy(bundle.join("codex-code-mode-host"), &host).unwrap();
                fs::set_permissions(&host, fs::Permissions::from_mode(0o600)).unwrap();
            }
            _ => (),
        }
        assert!(manager.verify(&record).is_err());
        manager.ensure_selected().unwrap();
        assert!(fs::symlink_metadata(&host).unwrap().is_file());
        assert!(manager.verify(&record).is_ok());
        fs::remove_dir_all(manager.root).unwrap();
    }
}

#[test]
fn failed_pair_import_leaves_existing_engine_and_saved_state_unchanged() {
    let mut manager = test_manager();
    let record = fake_runtime(&manager, &pinned_release().version, true);
    let bundle = copy_bundle(&manager, &record);
    manager.disk.active = Some(record.clone());
    manager.save().unwrap();
    let before = fs::read(manager.root.join("state.json")).unwrap();
    fs::write(bundle.join("codex-code-mode-host"), "wrong host").unwrap();
    assert!(manager.import_bundle(&bundle).is_err());
    assert_eq!(fs::read(manager.root.join("state.json")).unwrap(), before);
    assert!(manager.verify(&record).is_ok());
    assert!(!fs::read_dir(&manager.root).unwrap().any(|entry| entry
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with("staging-")));
    fs::remove_dir_all(manager.root).unwrap();
}

#[test]
fn host_start_failure_after_staging_does_not_publish_a_partial_runtime() {
    let mut manager = test_manager();
    let record = fake_runtime(&manager, &pinned_release().version, true);
    let bundle = copy_bundle(&manager, &record);
    manager.disk.active = Some(record.clone());
    manager.save().unwrap();
    let before = fs::read(manager.root.join("state.json")).unwrap();
    let host = bundle.join("codex-code-mode-host");
    fs::write(
        &host,
        "#!/bin/sh\necho 'Usage: codex-code-mode-host [OPTIONS]'\nexit 1\n",
    )
    .unwrap();
    let mut broken = record.clone();
    broken.code_mode_host_sha256 = Some(hash_file(&host).unwrap());
    atomic_json(&bundle.join("runtime.json"), &broken).unwrap();
    assert!(manager
        .import_bundle(&bundle)
        .unwrap_err()
        .contains("Code Mode host could not start"));
    assert!(!manager.binary(&broken).unwrap().exists());
    assert!(manager.verify(&record).is_ok());
    assert_eq!(fs::read(manager.root.join("state.json")).unwrap(), before);
    assert!(!fs::read_dir(&manager.root).unwrap().any(|entry| entry
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with("staging-")));
    fs::remove_dir_all(manager.root).unwrap();
}

#[test]
fn probe_rejects_host_failure_even_when_inventory_requests_succeed() {
    let manager = test_manager();
    let record = fake_runtime(&manager, &pinned_release().version, true);
    let binary = manager.binary(&record).unwrap();
    let script = fs::read_to_string(&binary).unwrap();
    fs::write(&binary, script.replace(
        "*'\"method\":\"thread/start\"'*)",
        "*'\"method\":\"thread/start\"'*) echo '{\"method\":\"warning\",\"params\":{\"message\":\"Code Mode is unavailable: host executable was not found\"}}';",
    )).unwrap();
    let error = verify_codex_engine(&binary, &pinned_release().version).unwrap_err();
    assert!(
        error.contains("Code Mode runtime failed to start"),
        "{error}"
    );
    fs::remove_dir_all(manager.root).unwrap();
}

#[test]
fn failed_version_command_is_rejected_even_if_it_prints_a_valid_version() {
    let root = temporary();
    let binary = root.join("codex");
    fs::write(&binary, "#!/bin/sh\necho 'codex-cli 0.153.4'\nexit 1\n").unwrap();
    make_executable(&binary).unwrap();
    assert!(executable_version(&binary).is_err());
    fs::remove_dir_all(root).unwrap();
}

#[test]
#[ignore = "Downloads the pinned official release"]
fn pinned_release_can_be_downloaded_and_provisioned() {
    let mut manager = test_manager();
    let selected = manager.ensure_selected().unwrap();
    assert!(selected.starts_with(manager.root.join("versions")));
    assert_eq!(
        executable_version(&selected).unwrap(),
        pinned_release().version
    );
    assert!(manager.disk.active.is_some());
    fs::remove_dir_all(manager.root).unwrap();
}
