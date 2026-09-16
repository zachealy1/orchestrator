//! Installation activity only. No account identity or application content enters this service.
use crate::database::DatabaseState;
use chrono::{DateTime, SecondsFormat, Utc};
use reqwest::{Client, StatusCode};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::{Row, SqliteConnection};
use std::{sync::Arc, time::Duration};
use tauri::{Manager, State};
use tokio::sync::{watch, Mutex, Notify};
use uuid::Uuid;

const FAILURE: &str = "Installation activity settings are unavailable.";
const RETENTION_SECONDS: i64 = 35 * 86_400;

#[derive(Clone)]
struct Configuration {
    endpoint: String,
    token: String,
    environment: String,
}

impl Configuration {
    fn embedded() -> Option<Self> {
        // Tests/debug executables never send telemetry, even with release variables set.
        if cfg!(any(test, debug_assertions))
            || option_env!("ORCHESTRATOR_ANALYTICS_ENABLED") != Some("1")
        {
            return None;
        }
        let host = option_env!("ORCHESTRATOR_POSTHOG_HOST")?;
        let token = option_env!("ORCHESTRATOR_POSTHOG_TOKEN")?;
        let url = url::Url::parse(host).ok()?;
        if url.scheme() != "https" || token.trim().is_empty() {
            return None;
        }
        Some(Self {
            endpoint: format!("{}/i/v0/e/?ip=0", host.trim_end_matches('/')),
            token: token.into(),
            environment: option_env!("ORCHESTRATOR_ANALYTICS_ENVIRONMENT")
                .unwrap_or("production")
                .into(),
        })
    }
}

#[derive(Clone, Copy, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AnalyticsPreferences {
    pub enabled: bool,
    pub available: bool,
}

pub(crate) struct AnalyticsState(Option<Arc<AnalyticsService>>);

struct AnalyticsService {
    database: DatabaseState,
    configuration: Option<Configuration>,
    client: Client,
    gate: Mutex<()>,
    wake: Notify,
    cancellation: watch::Sender<u64>,
}

#[derive(Debug)]
struct PendingEvent {
    installation_id: String,
    active_date: String,
    event_uuid: String,
    occurred_at: String,
    app_version: String,
    environment: String,
    attempts: i64,
}

impl PendingEvent {
    fn payload(&self, token: &str) -> Value {
        json!({
            "api_key": token,
            "event": "active_day",
            "distinct_id": self.installation_id,
            "uuid": self.event_uuid,
            "timestamp": self.occurred_at,
            "properties": {
                "active_date": self.active_date,
                "app_version": self.app_version,
                "environment": self.environment,
                "$process_person_profile": false,
                "$geoip_disable": true,
                "$ip": null
            }
        })
    }
}

pub(crate) fn initialize(app: &tauri::AppHandle, database: DatabaseState) {
    let service = AnalyticsService::new(database, Configuration::embedded()).map(Arc::new);
    match service {
        Ok(service) => {
            app.manage(AnalyticsState(Some(service.clone())));
            if service.configuration.is_some() {
                tauri::async_runtime::spawn(service.run());
            }
        }
        Err(_) => {
            // Analytics must never prevent the application from starting.
            eprintln!("Installation activity service unavailable.");
            app.manage(AnalyticsState(None));
        }
    }
}

impl AnalyticsService {
    fn new(database: DatabaseState, configuration: Option<Configuration>) -> Result<Self, String> {
        Ok(Self {
            database,
            configuration,
            client: Client::builder()
                .timeout(Duration::from_secs(10))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .map_err(|_| FAILURE.to_string())?,
            gate: Mutex::new(()),
            wake: Notify::new(),
            cancellation: watch::channel(0).0,
        })
    }

    async fn ensure_identity(connection: &mut SqliteConnection) -> Result<(), String> {
        // Atomic INSERT also handles concurrent initializers without replacing an existing ID.
        sqlx::query("INSERT OR IGNORE INTO installation_analytics (singleton, installation_id) VALUES (1, ?)")
            .bind(Uuid::new_v4().to_string())
            .execute(connection).await.map_err(|_| FAILURE.to_string())?;
        Ok(())
    }

    async fn preferences(&self) -> Result<AnalyticsPreferences, String> {
        let _guard = self.gate.lock().await;
        let mut connection = self.database.acquire().await?;
        Self::ensure_identity(&mut connection).await?;
        let enabled: bool =
            sqlx::query_scalar("SELECT enabled FROM installation_analytics WHERE singleton = 1")
                .fetch_one(&mut *connection)
                .await
                .map_err(|_| FAILURE.to_string())?;
        Ok(AnalyticsPreferences {
            enabled,
            available: self.configuration.is_some(),
        })
    }

    async fn set_enabled(&self, enabled: bool) -> Result<AnalyticsPreferences, String> {
        let _guard = self.gate.lock().await;
        let mut connection = self.database.acquire().await?;
        use sqlx::Connection;
        let mut transaction = connection.begin().await.map_err(|_| FAILURE.to_string())?;
        Self::ensure_identity(&mut transaction).await?;
        sqlx::query("UPDATE installation_analytics SET enabled = ? WHERE singleton = 1")
            .bind(enabled)
            .execute(&mut *transaction)
            .await
            .map_err(|_| FAILURE.to_string())?;
        if !enabled {
            // Tombstones retain daily deduplication without keeping anything deliverable.
            sqlx::query(
                "UPDATE installation_active_days SET status = 'cancelled' WHERE status = 'pending'",
            )
            .execute(&mut *transaction)
            .await
            .map_err(|_| FAILURE.to_string())?;
        }
        transaction
            .commit()
            .await
            .map_err(|_| FAILURE.to_string())?;
        self.cancellation
            .send_modify(|generation| *generation = generation.wrapping_add(1));
        self.wake.notify_one();
        Ok(AnalyticsPreferences {
            enabled,
            available: self.configuration.is_some(),
        })
    }

    async fn record(&self, now: DateTime<Utc>) -> Result<(), String> {
        let Some(configuration) = &self.configuration else {
            return Ok(());
        };
        let _guard = self.gate.lock().await;
        let mut connection = self.database.acquire().await?;
        use sqlx::Connection;
        let mut transaction = connection.begin().await.map_err(|_| FAILURE.to_string())?;
        Self::ensure_identity(&mut transaction).await?;
        sqlx::query(
            "INSERT OR IGNORE INTO installation_active_days
             (installation_id, active_date, event_uuid, occurred_at, app_version, environment, next_attempt_at)
             SELECT installation_id, ?, ?, ?, ?, ?, ? FROM installation_analytics
             WHERE singleton = 1 AND enabled = 1"
        )
            .bind(now.format("%Y-%m-%d").to_string())
            .bind(Uuid::new_v4().to_string())
            .bind(now.to_rfc3339_opts(SecondsFormat::Millis, true))
            .bind(env!("CARGO_PKG_VERSION"))
            .bind(&configuration.environment)
            .bind(now.timestamp())
            .execute(&mut *transaction).await.map_err(|_| FAILURE.to_string())?;
        transaction
            .commit()
            .await
            .map_err(|_| FAILURE.to_string())?;
        self.wake.notify_one();
        Ok(())
    }

    async fn next_event(&self, now: DateTime<Utc>) -> Result<Option<PendingEvent>, String> {
        let mut connection = self.database.acquire().await?;
        sqlx::query(
            "UPDATE installation_active_days SET status = 'expired'
                    WHERE status = 'pending' AND occurred_at <= ?",
        )
        .bind(
            (now - chrono::Duration::seconds(RETENTION_SECONDS))
                .to_rfc3339_opts(SecondsFormat::Millis, true),
        )
        .execute(&mut *connection)
        .await
        .map_err(|_| FAILURE.to_string())?;
        let row = sqlx::query(
            "SELECT d.* FROM installation_active_days d
             JOIN installation_analytics a ON a.installation_id = d.installation_id
             WHERE a.enabled = 1 AND d.status = 'pending' AND d.next_attempt_at <= ?
             ORDER BY d.next_attempt_at, d.active_date LIMIT 1",
        )
        .bind(now.timestamp())
        .fetch_optional(&mut *connection)
        .await
        .map_err(|_| FAILURE.to_string())?;
        Ok(row.map(|row| PendingEvent {
            installation_id: row.get("installation_id"),
            active_date: row.get("active_date"),
            event_uuid: row.get("event_uuid"),
            occurred_at: row.get("occurred_at"),
            app_version: row.get("app_version"),
            environment: row.get("environment"),
            attempts: row.get("attempts"),
        }))
    }

    async fn send_next(&self, now: DateTime<Utc>) -> Result<bool, String> {
        let Some(configuration) = &self.configuration else {
            return Ok(false);
        };
        let (event, mut cancellation) = {
            let _guard = self.gate.lock().await;
            let Some(event) = self.next_event(now).await? else {
                return Ok(false);
            };
            (event, self.cancellation.subscribe())
        };
        let response = tokio::select! {
            biased;
            _ = cancellation.changed() => return Ok(false),
            result = self.client.post(&configuration.endpoint)
                .json(&event.payload(&configuration.token)).send() => result,
        };
        let completed_at = Utc::now();
        let (status, delay) = match response {
            Ok(response) if response.status().is_success() => ("sent", 0),
            Ok(response)
                if response.status() == StatusCode::TOO_MANY_REQUESTS
                    || response.status() == StatusCode::REQUEST_TIMEOUT
                    || response.status().is_server_error() =>
            {
                let retry_after = response
                    .headers()
                    .get("retry-after")
                    .and_then(|value| value.to_str().ok())
                    .and_then(|value| retry_after_seconds(value, completed_at));
                ("pending", retry_delay(event.attempts, retry_after))
            }
            Err(_) => ("pending", retry_delay(event.attempts, None)),
            Ok(response) => {
                // Never log the payload, token, response body, or installation ID.
                eprintln!(
                    "Installation activity delivery rejected (HTTP {}).",
                    response.status().as_u16()
                );
                ("failed", 0)
            }
        };
        let _guard = self.gate.lock().await;
        let mut connection = self.database.acquire().await?;
        sqlx::query(
            "UPDATE installation_active_days SET status = ?, attempts = attempts + 1,
                    next_attempt_at = ? WHERE event_uuid = ? AND status = 'pending'",
        )
        .bind(status)
        .bind(completed_at.timestamp().saturating_add(delay))
        .bind(&event.event_uuid)
        .execute(&mut *connection)
        .await
        .map_err(|_| FAILURE.to_string())?;
        Ok(true)
    }

    async fn run(self: Arc<Self>) {
        loop {
            // A bounded queue (at most 35 deliverable days) is drained by one worker.
            loop {
                match self.send_next(Utc::now()).await {
                    Ok(true) => continue,
                    Ok(false) => break,
                    Err(_) => {
                        eprintln!("Installation activity queue unavailable; will retry.");
                        break;
                    }
                }
            }
            tokio::select! {
                _ = self.wake.notified() => {},
                _ = tokio::time::sleep(Duration::from_secs(60)) => {},
            }
        }
    }
}

fn retry_delay(attempts: i64, retry_after: Option<i64>) -> i64 {
    let backoff = (60 * (1_i64 << attempts.clamp(0, 6))).min(3600);
    backoff.max(retry_after.unwrap_or(0))
}

fn retry_after_seconds(value: &str, now: DateTime<Utc>) -> Option<i64> {
    value
        .parse::<i64>()
        .ok()
        .filter(|seconds| *seconds >= 0)
        .or_else(|| {
            DateTime::parse_from_rfc2822(value)
                .ok()
                .map(|date| (date.timestamp() - now.timestamp()).max(0))
        })
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn analytics_record_activity(
    state: State<'_, AnalyticsState>,
) -> Result<(), String> {
    if let Some(service) = &state.0 {
        service.record(Utc::now()).await?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn analytics_get_preferences(
    state: State<'_, AnalyticsState>,
) -> Result<AnalyticsPreferences, String> {
    match &state.0 {
        Some(service) => service.preferences().await,
        None => Ok(AnalyticsPreferences {
            enabled: false,
            available: false,
        }),
    }
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn analytics_set_enabled(
    enabled: bool,
    state: State<'_, AnalyticsState>,
) -> Result<AnalyticsPreferences, String> {
    state
        .0
        .as_ref()
        .ok_or_else(|| FAILURE.to_string())?
        .set_enabled(enabled)
        .await
}

#[cfg(test)]
#[path = "tests/installation_analytics.rs"]
mod tests;
