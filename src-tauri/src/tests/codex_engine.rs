use super::*;
use serde_json::json;

#[test]
fn provisioning_rejects_invalid_release_metadata() {
    let release = Release {
        version: "0.153.4".into(),
        target: target().unwrap().into(),
        archive_sha256: "a".repeat(64),
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
    };
    let active = RuntimeRecord {
        release,
        executable_sha256: "b".repeat(64),
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
        },
        executable_sha256: "b".repeat(64),
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
while IFS= read -r line; do
case "$line" in
*'"method":"initialize"'*) echo '{{"id":1,"result":{{}}}}';;
*'"method":"experimentalFeature/list"'*) echo '{{"id":2,"result":{features}}}';;
*'"method":"permissionProfile/list"'*) echo '{{"id":3,"result":{{"data":[{{"id":":read-only","allowed":true}},{{"id":"orchestrator_workspace_network_v1","allowed":true}}]}}}}';;
*'"method":"collaborationMode/list"'*) echo '{{"id":4,"result":{{"data":[{{"mode":"plan"}},{{"mode":"default"}}]}}}}';;
*'"method":"model/list"'*) echo '{{"id":5,"result":{{"data":[]}}}}';;
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
            archive_sha256: "a".repeat(64),
        },
        executable_sha256: hash_file(&probe).unwrap(),
    };
    let binary = manager.binary(&record).unwrap();
    secure_directory(binary.parent().unwrap()).unwrap();
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
    let old = fake_runtime(&manager, "0.153.4", true);
    let new = fake_runtime(&manager, "0.154.0", true);
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
    assert_eq!(manager.selected.as_ref().unwrap().1, "0.153.4");
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
        let old = fake_runtime(&manager, "0.153.4", true);
        let new = fake_runtime(&manager, "0.154.0", false);
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
        assert_eq!(saved.active.unwrap().release.version, "0.153.4");
        fs::remove_dir_all(manager.root).unwrap();
    }
}
#[test]
fn current_engine_starts_without_network_or_bundled_or_external_installation() {
    let mut manager = test_manager();
    let old = fake_runtime(&manager, "0.153.4", true);
    manager.disk.active = Some(old.clone());
    assert_eq!(
        manager.ensure_selected().unwrap(),
        manager.binary(&old).unwrap()
    );
    assert_eq!(manager.selected.as_ref().unwrap().1, "0.153.4");
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
