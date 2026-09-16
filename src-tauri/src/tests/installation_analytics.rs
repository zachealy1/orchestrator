use super::*;
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::io::{Read, Write};
use tokio::sync::oneshot;

async fn database() -> (DatabaseState, SqlitePool) {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    sqlx::raw_sql(include_str!(
        "../../migrations/048_installation_activity.sql"
    ))
    .execute(&pool)
    .await
    .unwrap();
    (DatabaseState::from_test_pool(pool.clone()), pool)
}

fn configuration(endpoint: &str) -> Configuration {
    Configuration {
        endpoint: endpoint.into(),
        token: "phc_test_only".into(),
        environment: "test".into(),
    }
}

fn day(value: &str) -> DateTime<Utc> {
    value.parse().unwrap()
}

// One request, with a controllable response so cancellation tests never rely on sleeps.
fn server(response: &'static str) -> (String, oneshot::Receiver<Value>, oneshot::Sender<()>) {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let endpoint = format!("http://{}/i/v0/e/?ip=0", listener.local_addr().unwrap());
    let (body_tx, body_rx) = oneshot::channel();
    let (release_tx, release_rx) = oneshot::channel();
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut bytes = Vec::new();
        let (offset, length) = loop {
            let mut buffer = [0; 4096];
            let length = stream.read(&mut buffer).unwrap();
            if length == 0 {
                return;
            }
            bytes.extend_from_slice(&buffer[..length]);
            if let Some(index) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&bytes[..index]).to_lowercase();
                let size: usize = headers
                    .lines()
                    .find_map(|line| line.strip_prefix("content-length: "))
                    .unwrap()
                    .parse()
                    .unwrap();
                break (index + 4, size);
            }
        };
        while bytes.len() < offset + length {
            let mut buffer = [0; 4096];
            let size = stream.read(&mut buffer).unwrap();
            if size == 0 {
                return;
            }
            bytes.extend_from_slice(&buffer[..size]);
        }
        let body = serde_json::from_slice(&bytes[offset..offset + length]).unwrap();
        let _ = body_tx.send(body);
        let _ = release_rx.blocking_recv();
        let _ = stream.write_all(response.as_bytes());
    });
    (endpoint, body_rx, release_tx)
}

const OK: &str = "HTTP/1.1 200 OK\r\nContent-Length: 1\r\nConnection: close\r\n\r\n1";
const UNAVAILABLE: &str = "HTTP/1.1 503 Service Unavailable\r\nRetry-After: 120\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";

#[tokio::test]
async fn identity_and_daily_records_survive_concurrency_restart_and_opt_out() {
    let (db, pool) = database().await;
    let service = AnalyticsService::new(db.clone(), Some(configuration("http://unused"))).unwrap();
    let restarted =
        AnalyticsService::new(db.clone(), Some(configuration("http://unused"))).unwrap();
    let (a, b) = tokio::join!(service.preferences(), restarted.preferences());
    assert!(a.unwrap().enabled && b.unwrap().enabled);
    let identity: String = sqlx::query_scalar("SELECT installation_id FROM installation_analytics")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(Uuid::parse_str(&identity).unwrap().get_version_num(), 4);
    let before = day("2026-09-16T23:59:59Z");
    let after = day("2026-09-17T00:00:01Z");
    let (a, b) = tokio::join!(service.record(before), restarted.record(before));
    a.unwrap();
    b.unwrap();
    restarted.record(before).await.unwrap();
    service.record(after).await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM installation_active_days")
            .fetch_one(&pool)
            .await
            .unwrap(),
        2
    );
    service.set_enabled(false).await.unwrap();
    restarted.record(day("2026-09-18T12:00:00Z")).await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM installation_active_days WHERE status = 'pending'"
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        0
    );
    service.set_enabled(true).await.unwrap();
    service.record(after).await.unwrap(); // cancelled day is still deduplicated
    service.record(day("2026-09-19T12:00:00Z")).await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM installation_active_days")
            .fetch_one(&pool)
            .await
            .unwrap(),
        3
    );
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT installation_id FROM installation_analytics")
            .fetch_one(&pool)
            .await
            .unwrap(),
        identity
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM installation_active_days WHERE active_date = '2026-09-18'"
        )
        .fetch_one(&pool)
        .await
        .unwrap(),
        0
    );
}

#[tokio::test]
async fn failed_delivery_retries_original_payload_after_restart() {
    let (db, pool) = database().await;
    let now = Utc::now();
    let (endpoint, body, release) = server(UNAVAILABLE);
    let service =
        Arc::new(AnalyticsService::new(db.clone(), Some(configuration(&endpoint))).unwrap());
    service.record(now).await.unwrap();
    let task = tokio::spawn({
        let service = service.clone();
        async move { service.send_next(now).await }
    });
    let first = body.await.unwrap();
    release.send(()).unwrap();
    assert!(task.await.unwrap().unwrap());
    let row = sqlx::query("SELECT status, attempts, next_attempt_at FROM installation_active_days")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(row.get::<String, _>("status"), "pending");
    assert_eq!(row.get::<i64, _>("attempts"), 1);
    assert!(row.get::<i64, _>("next_attempt_at") >= now.timestamp() + 120);
    assert!(!service.send_next(now).await.unwrap());
    sqlx::query("UPDATE installation_active_days SET next_attempt_at = 0")
        .execute(&pool)
        .await
        .unwrap();
    let (endpoint, body, release) = server(OK);
    let restarted = Arc::new(AnalyticsService::new(db, Some(configuration(&endpoint))).unwrap());
    let task = tokio::spawn({
        let restarted = restarted.clone();
        async move { restarted.send_next(now).await }
    });
    assert_eq!(body.await.unwrap(), first);
    release.send(()).unwrap();
    assert!(task.await.unwrap().unwrap());
    assert!(!restarted.send_next(now).await.unwrap());
    assert_eq!(first["event"], "active_day");
    assert_eq!(
        first["timestamp"],
        now.to_rfc3339_opts(SecondsFormat::Millis, true)
    );
    let properties = first["properties"].as_object().unwrap();
    let keys: std::collections::BTreeSet<_> = properties.keys().map(String::as_str).collect();
    assert_eq!(
        keys,
        [
            "active_date",
            "app_version",
            "environment",
            "$process_person_profile",
            "$geoip_disable",
            "$ip"
        ]
        .into_iter()
        .collect()
    );
    assert_eq!(properties["$process_person_profile"], false);
    assert_eq!(properties["$geoip_disable"], true);
    assert!(properties["$ip"].is_null());
}

#[tokio::test]
async fn opt_out_cancels_an_in_flight_request_without_waiting_for_the_network() {
    let (db, pool) = database().await;
    let (endpoint, body, release) = server(OK);
    let service = Arc::new(AnalyticsService::new(db, Some(configuration(&endpoint))).unwrap());
    service.record(Utc::now()).await.unwrap();
    let task = tokio::spawn({
        let service = service.clone();
        async move { service.send_next(Utc::now()).await }
    });
    body.await.unwrap();
    service.set_enabled(false).await.unwrap();
    assert!(!tokio::time::timeout(Duration::from_secs(1), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap());
    let _ = release.send(());
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT status FROM installation_active_days")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "cancelled"
    );
}

#[tokio::test]
async fn disabled_builds_and_expired_events_do_not_attempt_delivery() {
    assert!(Configuration::embedded().is_none());
    let (db, pool) = database().await;
    let disabled = AnalyticsService::new(db.clone(), None).unwrap();
    disabled.record(Utc::now()).await.unwrap();
    assert!(!disabled.send_next(Utc::now()).await.unwrap());
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM installation_active_days")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    let enabled = AnalyticsService::new(db, Some(configuration("http://127.0.0.1:1"))).unwrap();
    enabled
        .record(Utc::now() - chrono::Duration::days(36))
        .await
        .unwrap();
    assert!(!enabled.send_next(Utc::now()).await.unwrap());
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT status FROM installation_active_days")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "expired"
    );
}

#[tokio::test]
async fn permanent_errors_stop_retries_and_connection_errors_remain_pending() {
    let (db, pool) = database().await;
    let (endpoint, body, release) =
        server("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    let service =
        Arc::new(AnalyticsService::new(db.clone(), Some(configuration(&endpoint))).unwrap());
    service.record(Utc::now()).await.unwrap();
    let task = tokio::spawn({
        let service = service.clone();
        async move { service.send_next(Utc::now()).await }
    });
    body.await.unwrap();
    release.send(()).unwrap();
    task.await.unwrap().unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT status FROM installation_active_days")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "failed"
    );
    // A later day's event survives a transport failure independently.
    let next = Utc::now() + chrono::Duration::days(1);
    let service = AnalyticsService::new(db, Some(configuration("http://127.0.0.1:1"))).unwrap();
    service.record(next).await.unwrap();
    service.send_next(next).await.unwrap();
    assert_eq!(sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM installation_active_days WHERE status = 'pending' AND attempts = 1").fetch_one(&pool).await.unwrap(), 1);
}

#[test]
fn backoff_and_retry_after_are_bounded_but_respect_server_delays() {
    assert_eq!(retry_delay(0, None), 60);
    assert_eq!(retry_delay(1, None), 120);
    assert_eq!(retry_delay(100, None), 3600);
    assert_eq!(retry_delay(0, Some(7200)), 7200);
    let now = day("2026-09-16T12:00:00Z");
    assert_eq!(retry_after_seconds("120", now), Some(120));
    assert_eq!(
        retry_after_seconds("Wed, 16 Sep 2026 12:02:00 GMT", now),
        Some(120)
    );
    assert_eq!(retry_after_seconds("invalid", now), None);
}

#[tokio::test]
async fn stalled_delivery_times_out_and_remains_retryable() {
    let (db, pool) = database().await;
    let (endpoint, body, release) = server(OK);
    let service = Arc::new(AnalyticsService::new(db, Some(configuration(&endpoint))).unwrap());
    service.record(Utc::now()).await.unwrap();
    let task = tokio::spawn({
        let service = service.clone();
        async move { service.send_next(Utc::now()).await }
    });
    body.await.unwrap();
    assert!(tokio::time::timeout(Duration::from_secs(12), task)
        .await
        .unwrap()
        .unwrap()
        .unwrap());
    let _ = release.send(());
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT status FROM installation_active_days")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "pending"
    );
}
