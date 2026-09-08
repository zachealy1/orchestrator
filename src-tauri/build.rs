fn main() {
    println!("cargo:rerun-if-env-changed=ORCHESTRATOR_UPDATER_PUBLIC_KEY");
    tauri_build::build()
}
