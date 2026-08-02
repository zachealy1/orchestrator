use super::*;

mod core_database;
mod git;
mod migrations;
mod workspace_media;

fn test_directory(name: &str) -> PathBuf {
    let directory = env::temp_dir().join(format!(
        "orchestrator-{name}-{}-{}",
        std::process::id(),
        next_test_id()
    ));
    fs::create_dir_all(&directory).expect("create test directory");
    directory
}

fn remove_test_directory(directory: PathBuf) {
    fs::remove_dir_all(directory).expect("remove test directory");
}

fn next_test_id() -> u64 {
    static NEXT_TEST_ID: AtomicU64 = AtomicU64::new(1);
    NEXT_TEST_ID.fetch_add(1, Ordering::Relaxed)
}
