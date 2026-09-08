//! Run before the SQL plugin applies migrations; VACUUM INTO includes committed WAL data.
use sqlx::{sqlite::SqliteConnectOptions, Connection, SqliteConnection};
use std::path::Path;
use tauri::{AppHandle, Manager};

pub(crate) async fn prepare(app: &AppHandle) -> Result<(), String> {
    let config = app.path().app_config_dir().map_err(|e| e.to_string())?;
    backup_if_needed(
        &config.join("app.db"),
        &config.join("recovery"),
        crate::migrations::MIGRATION_DEFINITIONS
            .last()
            .ok_or("Missing migrations")?
            .version,
    )
    .await
}
async fn backup_if_needed(database: &Path, recovery: &Path, target: i64) -> Result<(), String> {
    if !database.exists() {
        return Ok(());
    }
    let mut connection = SqliteConnection::connect_with(
        &SqliteConnectOptions::new()
            .filename(database)
            .create_if_missing(false)
            .busy_timeout(std::time::Duration::from_secs(15)),
    )
    .await
    .map_err(|_| "Cannot inspect the existing database before upgrade")?;
    let has_migrations: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE name = '_sqlx_migrations'")
            .fetch_one(&mut connection)
            .await
            .map_err(|e| e.to_string())?;
    let current: i64 = if has_migrations == 0 {
        0
    } else {
        sqlx::query_scalar(
            "SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations WHERE success = 1",
        )
        .fetch_one(&mut connection)
        .await
        .map_err(|e| e.to_string())?
    };
    if current > target {
        return Err("This database was upgraded by a newer Orchestrator. Reinstall the newer app; do not downgrade your data.".into());
    }
    if current == target {
        return Ok(());
    }
    std::fs::create_dir_all(recovery).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(recovery, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
    }
    let snapshot = recovery.join(format!(
        "before-schema-{target}-{}.sqlite",
        uuid::Uuid::new_v4()
    ));
    let temporary = snapshot.with_extension("incomplete");
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(&temporary).map_err(|e| e.to_string())?;
    let result = async {
        sqlx::query("VACUUM INTO ?1")
            .bind(temporary.to_string_lossy().as_ref())
            .execute(&mut connection)
            .await
            .map_err(|e| e.to_string())?;
        let mut check = SqliteConnection::connect_with(
            &SqliteConnectOptions::new()
                .filename(&temporary)
                .read_only(true),
        )
        .await
        .map_err(|e| e.to_string())?;
        let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
            .fetch_one(&mut check)
            .await
            .map_err(|e| e.to_string())?;
        if integrity != "ok" {
            return Err("The recovery snapshot failed its integrity check.".into());
        }
        check.close().await.map_err(|e| e.to_string())?;
        std::fs::rename(&temporary, &snapshot).map_err(|e| e.to_string())
    }
    .await;
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result.map_err(|e| format!("Upgrade paused because a safe database backup could not be created. Free disk space and retry. {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn snapshot_contains_committed_wal_and_rejects_downgrade() {
        tauri::async_runtime::block_on(async {
            let root = std::env::temp_dir()
                .join(format!("orchestrator-backup-test-{}", uuid::Uuid::new_v4()));
            std::fs::create_dir(&root).unwrap();
            let path = root.join("app.db");
            let mut db = SqliteConnection::connect_with(
                &SqliteConnectOptions::new()
                    .filename(&path)
                    .create_if_missing(true),
            )
            .await
            .unwrap();
            sqlx::query("PRAGMA journal_mode=WAL")
                .execute(&mut db)
                .await
                .unwrap();
            sqlx::query("CREATE TABLE _sqlx_migrations (version INTEGER, success INTEGER); INSERT INTO _sqlx_migrations VALUES (1,1); CREATE TABLE drafts(text TEXT); INSERT INTO drafts VALUES ('keep me')").execute(&mut db).await.unwrap();
            assert!(backup_if_needed(&path, &root.join("recovery"), 0)
                .await
                .is_err());
            backup_if_needed(&path, &root.join("recovery"), 2)
                .await
                .unwrap();
            let snapshot = std::fs::read_dir(root.join("recovery"))
                .unwrap()
                .next()
                .unwrap()
                .unwrap()
                .path();
            let mut copy =
                SqliteConnection::connect_with(&SqliteConnectOptions::new().filename(snapshot))
                    .await
                    .unwrap();
            let draft: String = sqlx::query_scalar("SELECT text FROM drafts")
                .fetch_one(&mut copy)
                .await
                .unwrap();
            assert_eq!(draft, "keep me");
            copy.close().await.unwrap();
            db.close().await.unwrap();
            std::fs::remove_dir_all(root).unwrap();
        });
    }
}
