use crate::{
    git::generate_workspace_repository_commit_message_blocking,
    kanban_git::{
        kanban_git_commit, kanban_git_status, KanbanGitBindingRequest, KanbanGitCommitRequest,
        KanbanGitRepositoryBinding,
    },
    models::WorkspaceCommitIntentContext,
    DatabaseState,
};
use reqwest::{header, Client, StatusCode};
use serde::{Deserialize, Serialize};
use sqlx::{pool::PoolConnection, Connection, Row, Sqlite};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Mutex, OnceLock, RwLock},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

const GITHUB_API: &str = "https://api.github.com";
const GITHUB_DEVICE_URL: &str = "https://github.com/login/device/code";
const GITHUB_TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const KEYCHAIN_SERVICE: &str = "com.orchestrator.github";
const KEYCHAIN_ACCOUNT: &str = "github-app-user-token";
const KEYCHAIN_CLIENT_ID_ACCOUNT: &str = "github-app-client-id";

static GITHUB_CLIENT_ID: OnceLock<RwLock<Option<String>>> = OnceLock::new();

pub(crate) async fn github_review_available(app: &AppHandle) -> bool {
    let Ok(mut connection) = open_database(app).await else {
        return false;
    };
    let connected: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM github_connections WHERE id = 1 AND status = 'connected'",
    )
    .fetch_one(&mut *connection)
    .await
    .unwrap_or(0);
    if connected == 0 {
        return false;
    }
    let Ok(token) = access_token().await else {
        return false;
    };
    github_get::<GithubUser>("/user", &token).await.is_ok()
}

#[derive(Default)]
pub(crate) struct GithubState {
    pending_device_flow: Mutex<Option<PendingDeviceFlow>>,
}

struct PendingDeviceFlow {
    device_code: String,
    expires_at: Instant,
    interval: Duration,
    next_poll_at: Instant,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GithubRepositoryAccess {
    pub installation_id: i64,
    pub owner: String,
    pub name: String,
    pub full_name: String,
    pub private: bool,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GithubConnectionStatus {
    pub available: bool,
    pub connected: bool,
    pub login: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub status: String,
    pub message: Option<String>,
    pub repositories: Vec<GithubRepositoryAccess>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GithubDeviceAuthorization {
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in_seconds: u64,
    pub interval_seconds: u64,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KanbanPullRequestDto {
    pub source_repository_path: String,
    pub relative_path: String,
    pub owner: Option<String>,
    pub repository: Option<String>,
    pub number: Option<i64>,
    pub url: Option<String>,
    pub base_branch: String,
    pub head_branch: String,
    pub draft: bool,
    pub state: String,
    pub publication_status: String,
    pub error: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GithubPublicationResult {
    pub card_id: String,
    pub pull_requests: Vec<KanbanPullRequestDto>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct StoredToken {
    access_token: String,
    refresh_token: Option<String>,
    expires_at_unix: Option<u64>,
    refresh_token_expires_at_unix: Option<u64>,
}

#[derive(Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: Option<u64>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    refresh_token_expires_in: Option<u64>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Deserialize)]
struct GithubUser {
    id: i64,
    login: String,
    name: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct GithubInstallationAccount {
    login: String,
    #[serde(rename = "type")]
    account_type: String,
}

#[derive(Deserialize)]
struct GithubInstallation {
    id: i64,
    account: GithubInstallationAccount,
    repository_selection: String,
}

#[derive(Deserialize)]
struct InstallationsResponse {
    installations: Vec<GithubInstallation>,
}

#[derive(Deserialize)]
struct GithubRepositoryOwner {
    login: String,
}

#[derive(Deserialize)]
struct GithubRepository {
    id: i64,
    name: String,
    full_name: String,
    private: bool,
    owner: GithubRepositoryOwner,
}

#[derive(Deserialize)]
struct RepositoriesResponse {
    repositories: Vec<GithubRepository>,
}

#[derive(Deserialize)]
struct GithubPullRequest {
    number: i64,
    html_url: String,
    state: String,
    draft: Option<bool>,
    merged_at: Option<String>,
}

#[derive(Serialize)]
struct CreatePullRequest<'a> {
    title: &'a str,
    head: &'a str,
    base: &'a str,
    body: &'a str,
    draft: bool,
}

fn validate_github_client_id(value: &str) -> Result<String, String> {
    let value = value.trim();
    if !(16..=128).contains(&value.len())
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'.')
    {
        return Err("Enter a valid GitHub App client ID.".to_string());
    }
    Ok(value.to_string())
}

#[cfg(target_os = "macos")]
fn load_client_id() -> Option<String> {
    security_framework::passwords::get_generic_password(
        KEYCHAIN_SERVICE,
        KEYCHAIN_CLIENT_ID_ACCOUNT,
    )
    .ok()
    .and_then(|value| String::from_utf8(value).ok())
    .and_then(|value| validate_github_client_id(&value).ok())
}

#[cfg(not(target_os = "macos"))]
fn load_client_id() -> Option<String> {
    None
}

#[cfg(target_os = "macos")]
fn store_client_id(client_id: &str) -> Result<(), String> {
    security_framework::passwords::set_generic_password(
        KEYCHAIN_SERVICE,
        KEYCHAIN_CLIENT_ID_ACCOUNT,
        client_id.as_bytes(),
    )
    .map_err(|_| "The GitHub App client ID could not be saved in macOS Keychain.".to_string())
}

#[cfg(not(target_os = "macos"))]
fn store_client_id(_client_id: &str) -> Result<(), String> {
    Err("GitHub connection setup is unavailable on this platform.".to_string())
}

fn configured_github_client_id() -> Option<String> {
    std::env::var("ORCHESTRATOR_GITHUB_CLIENT_ID")
        .ok()
        .and_then(|value| validate_github_client_id(&value).ok())
        .or_else(|| {
            option_env!("ORCHESTRATOR_GITHUB_CLIENT_ID")
                .and_then(|value| validate_github_client_id(value).ok())
        })
        .or_else(load_client_id)
}

fn github_client_id() -> Option<String> {
    GITHUB_CLIENT_ID
        .get_or_init(|| RwLock::new(configured_github_client_id()))
        .read()
        .ok()
        .and_then(|value| value.clone())
}

fn github_client_secret() -> Option<&'static str> {
    option_env!("ORCHESTRATOR_GITHUB_CLIENT_SECRET").filter(|value| !value.trim().is_empty())
}

fn github_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("Orchestrator/0.1")
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "GitHub networking could not be initialized.".to_string())
}

async fn open_database(app: &AppHandle) -> Result<PoolConnection<Sqlite>, String> {
    app.state::<DatabaseState>().acquire().await
}

#[cfg(target_os = "macos")]
fn store_token(token: &StoredToken) -> Result<(), String> {
    let value = serde_json::to_vec(token)
        .map_err(|_| "The GitHub credential could not be encoded.".to_string())?;
    security_framework::passwords::set_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, &value)
        .map_err(|_| "The GitHub credential could not be saved in macOS Keychain.".to_string())
}

#[cfg(not(target_os = "macos"))]
fn store_token(_token: &StoredToken) -> Result<(), String> {
    Err("Secure GitHub credential storage is unavailable on this platform.".to_string())
}

#[cfg(target_os = "macos")]
fn load_token() -> Result<StoredToken, String> {
    let value =
        security_framework::passwords::get_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
            .map_err(|_| "Reconnect GitHub to continue.".to_string())?;
    serde_json::from_slice(&value)
        .map_err(|_| "The stored GitHub credential is invalid. Reconnect GitHub.".to_string())
}

#[cfg(not(target_os = "macos"))]
fn load_token() -> Result<StoredToken, String> {
    Err("Secure GitHub credential storage is unavailable on this platform.".to_string())
}

#[cfg(target_os = "macos")]
fn delete_token() {
    let _ =
        security_framework::passwords::delete_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
}

#[cfg(not(target_os = "macos"))]
fn delete_token() {}

fn unix_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

async fn access_token() -> Result<String, String> {
    let mut token = load_token()?;
    if token
        .expires_at_unix
        .is_some_and(|expires| expires <= unix_now() + 60)
    {
        let refresh_token = token.refresh_token.as_deref().ok_or_else(|| {
            "The GitHub connection expired. Reconnect GitHub in Settings.".to_string()
        })?;
        let client_id = github_client_id().ok_or_else(|| {
            "The GitHub connection cannot be refreshed in this build.".to_string()
        })?;
        let client_secret = github_client_secret().ok_or_else(|| {
            "The GitHub connection expired. Reconnect GitHub in Settings.".to_string()
        })?;
        let response: TokenResponse = github_client()?
            .post(GITHUB_TOKEN_URL)
            .header(header::ACCEPT, "application/json")
            .form(&[
                ("client_id", client_id.as_str()),
                ("client_secret", client_secret),
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh_token),
            ])
            .send()
            .await
            .map_err(|_| "The GitHub connection could not be refreshed.".to_string())?
            .json()
            .await
            .map_err(|_| "GitHub returned an invalid refresh response.".to_string())?;
        if let Some(error) = response.error {
            return Err(response.error_description.unwrap_or(error));
        }
        let now = unix_now();
        token = StoredToken {
            access_token: response
                .access_token
                .ok_or_else(|| "GitHub did not return a refreshed access token.".to_string())?,
            refresh_token: response.refresh_token.or(token.refresh_token),
            expires_at_unix: response.expires_in.map(|seconds| now + seconds),
            refresh_token_expires_at_unix: response
                .refresh_token_expires_in
                .map(|seconds| now + seconds)
                .or(token.refresh_token_expires_at_unix),
        };
        store_token(&token)?;
    }
    Ok(token.access_token)
}

async fn github_get<T: for<'de> Deserialize<'de>>(path: &str, token: &str) -> Result<T, String> {
    let response = github_client()?
        .get(format!("{GITHUB_API}{path}"))
        .bearer_auth(token)
        .header(header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|_| "GitHub could not be reached.".to_string())?;
    if response.status() == StatusCode::UNAUTHORIZED {
        return Err(
            "The GitHub connection is no longer authorized. Reconnect in Settings.".to_string(),
        );
    }
    if !response.status().is_success() {
        return Err(format!(
            "GitHub returned HTTP {}.",
            response.status().as_u16()
        ));
    }
    response
        .json()
        .await
        .map_err(|_| "GitHub returned an invalid response.".to_string())
}

async fn refresh_installations(app: &AppHandle, token: &str) -> Result<(), String> {
    let installations: InstallationsResponse =
        github_get("/user/installations?per_page=100", token).await?;
    let mut connection = open_database(app).await?;
    let mut transaction = connection
        .begin()
        .await
        .map_err(|error| format!("GitHub access could not be saved: {error}"))?;
    sqlx::query("DELETE FROM github_installation_repositories")
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("GitHub repositories could not be refreshed: {error}"))?;
    sqlx::query("DELETE FROM github_installations")
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("GitHub installations could not be refreshed: {error}"))?;
    for installation in installations.installations {
        sqlx::query(
            "INSERT INTO github_installations (
                installation_id, account_login, account_type, repository_selection
             ) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(installation.id)
        .bind(&installation.account.login)
        .bind(&installation.account.account_type)
        .bind(&installation.repository_selection)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("GitHub installation access could not be saved: {error}"))?;
        let repositories: RepositoriesResponse = github_get(
            &format!(
                "/user/installations/{}/repositories?per_page=100",
                installation.id
            ),
            token,
        )
        .await?;
        for repository in repositories.repositories {
            sqlx::query(
                "INSERT INTO github_installation_repositories (
                    installation_id, repository_id, owner, name, full_name, private
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .bind(installation.id)
            .bind(repository.id)
            .bind(repository.owner.login)
            .bind(repository.name)
            .bind(repository.full_name)
            .bind(repository.private)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("GitHub repository access could not be saved: {error}"))?;
        }
    }
    transaction
        .commit()
        .await
        .map_err(|error| format!("GitHub access could not be saved: {error}"))
}

pub(crate) async fn load_card_pull_requests(
    connection: &mut sqlx::SqliteConnection,
    card_id: &str,
) -> Result<Vec<KanbanPullRequestDto>, String> {
    let rows = sqlx::query(
        "SELECT source_repository_path, relative_path, owner, repository,
                pull_request_number, pull_request_url, base_branch, head_branch,
                draft, pull_request_state, publication_status, last_error, updated_at
         FROM kanban_pull_requests WHERE card_id = ?1 ORDER BY relative_path",
    )
    .bind(card_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Pull request state could not be loaded: {error}"))?;
    Ok(rows
        .into_iter()
        .map(|row| KanbanPullRequestDto {
            source_repository_path: row.get("source_repository_path"),
            relative_path: row.get("relative_path"),
            owner: row.get("owner"),
            repository: row.get("repository"),
            number: row.get("pull_request_number"),
            url: row.get("pull_request_url"),
            base_branch: row.get("base_branch"),
            head_branch: row.get("head_branch"),
            draft: row.get::<i64, _>("draft") != 0,
            state: row.get("pull_request_state"),
            publication_status: row.get("publication_status"),
            error: row.get("last_error"),
            updated_at: row.get("updated_at"),
        })
        .collect())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn github_connection_status(
    app: AppHandle,
) -> Result<GithubConnectionStatus, String> {
    let mut connection = open_database(&app).await?;
    let row = sqlx::query(
        "SELECT login, display_name, avatar_url, status FROM github_connections WHERE id = 1",
    )
    .fetch_optional(&mut *connection)
    .await
    .map_err(|error| format!("GitHub connection state could not be loaded: {error}"))?;
    let repositories = sqlx::query(
        "SELECT installation_id, owner, name, full_name, private
         FROM github_installation_repositories ORDER BY full_name",
    )
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("GitHub repository access could not be loaded: {error}"))?
    .into_iter()
    .map(|row| GithubRepositoryAccess {
        installation_id: row.get("installation_id"),
        owner: row.get("owner"),
        name: row.get("name"),
        full_name: row.get("full_name"),
        private: row.get::<i64, _>("private") != 0,
    })
    .collect();
    let available = github_client_id().is_some() && cfg!(target_os = "macos");
    Ok(match row {
        Some(row) => GithubConnectionStatus {
            available,
            connected: row.get::<String, _>("status") == "connected" && load_token().is_ok(),
            login: row.get("login"),
            display_name: row.get("display_name"),
            avatar_url: row.get("avatar_url"),
            status: row.get("status"),
            message: None,
            repositories,
        },
        None => GithubConnectionStatus {
            available,
            connected: false,
            login: None,
            display_name: None,
            avatar_url: None,
            status: if available {
                "disconnected"
            } else {
                "unavailable"
            }
            .to_string(),
            message: (!available).then(|| {
                "Enter the public client ID for your Orchestrator GitHub App to connect this local build."
                    .to_string()
            }),
            repositories,
        },
    })
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn github_configure_client_id(
    app: AppHandle,
    client_id: String,
) -> Result<GithubConnectionStatus, String> {
    if !cfg!(target_os = "macos") {
        return Err("GitHub connection setup is unavailable on this platform.".to_string());
    }
    let client_id = validate_github_client_id(&client_id)?;
    store_client_id(&client_id)?;
    let configured = GITHUB_CLIENT_ID.get_or_init(|| RwLock::new(None));
    *configured
        .write()
        .map_err(|_| "GitHub connection setup could not be updated.".to_string())? =
        Some(client_id);
    github_connection_status(app).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn github_begin_device_authorization(
    state: State<'_, GithubState>,
) -> Result<GithubDeviceAuthorization, String> {
    let client_id = github_client_id().ok_or_else(|| {
        "Configure the Orchestrator GitHub App client ID in Settings first.".to_string()
    })?;
    let response = github_client()?
        .post(GITHUB_DEVICE_URL)
        .header(header::ACCEPT, "application/json")
        .form(&[("client_id", client_id.as_str())])
        .send()
        .await
        .map_err(|_| "GitHub device authorization could not be started.".to_string())?;
    if !response.status().is_success() {
        return Err("GitHub device authorization could not be started.".to_string());
    }
    let response: DeviceCodeResponse = response
        .json()
        .await
        .map_err(|_| "GitHub returned an invalid device authorization response.".to_string())?;
    let interval = Duration::from_secs(response.interval.unwrap_or(5).max(1));
    *state.pending_device_flow.lock().unwrap() = Some(PendingDeviceFlow {
        device_code: response.device_code,
        expires_at: Instant::now() + Duration::from_secs(response.expires_in),
        interval,
        next_poll_at: Instant::now(),
    });
    Ok(GithubDeviceAuthorization {
        user_code: response.user_code,
        verification_uri: response.verification_uri,
        expires_in_seconds: response.expires_in,
        interval_seconds: interval.as_secs(),
    })
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn github_poll_device_authorization(
    app: AppHandle,
    state: State<'_, GithubState>,
) -> Result<GithubConnectionStatus, String> {
    let client_id =
        github_client_id().ok_or_else(|| "GitHub is unavailable in this build.".to_string())?;
    let device_code = {
        let mut pending = state.pending_device_flow.lock().unwrap();
        let flow = pending
            .as_mut()
            .ok_or_else(|| "Start GitHub connection again.".to_string())?;
        if Instant::now() >= flow.expires_at {
            *pending = None;
            return Err("GitHub authorization expired. Try again.".to_string());
        }
        if Instant::now() < flow.next_poll_at {
            return Err("authorization_pending".to_string());
        }
        flow.next_poll_at = Instant::now() + flow.interval;
        flow.device_code.clone()
    };
    let response: TokenResponse = github_client()?
        .post(GITHUB_TOKEN_URL)
        .header(header::ACCEPT, "application/json")
        .form(&[
            ("client_id", client_id.as_str()),
            ("device_code", device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|_| "GitHub authorization could not be checked.".to_string())?
        .json()
        .await
        .map_err(|_| "GitHub returned an invalid authorization response.".to_string())?;
    if let Some(error) = response.error {
        if error == "authorization_pending" || error == "slow_down" {
            return Err("authorization_pending".to_string());
        }
        return Err(response.error_description.unwrap_or(error));
    }
    let access_token = response
        .access_token
        .ok_or_else(|| "GitHub did not return an access token.".to_string())?;
    let now = unix_now();
    let stored = StoredToken {
        access_token: access_token.clone(),
        refresh_token: response.refresh_token,
        expires_at_unix: response.expires_in.map(|seconds| now + seconds),
        refresh_token_expires_at_unix: response
            .refresh_token_expires_in
            .map(|seconds| now + seconds),
    };
    store_token(&stored)?;
    let user: GithubUser = github_get("/user", &access_token).await?;
    let mut connection = open_database(&app).await?;
    sqlx::query(
        "INSERT INTO github_connections (
            id, github_user_id, login, display_name, avatar_url, token_key, status
         ) VALUES (1, ?1, ?2, ?3, ?4, ?5, 'connected')
         ON CONFLICT(id) DO UPDATE SET github_user_id = excluded.github_user_id,
            login = excluded.login, display_name = excluded.display_name,
            avatar_url = excluded.avatar_url, token_key = excluded.token_key,
            status = 'connected', updated_at = CURRENT_TIMESTAMP",
    )
    .bind(user.id)
    .bind(user.login)
    .bind(user.name)
    .bind(user.avatar_url)
    .bind(KEYCHAIN_ACCOUNT)
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("GitHub connection state could not be saved: {error}"))?;
    drop(connection);
    refresh_installations(&app, &access_token).await?;
    *state.pending_device_flow.lock().unwrap() = None;
    github_connection_status(app).await
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn github_disconnect(
    app: AppHandle,
    state: State<'_, GithubState>,
) -> Result<(), String> {
    *state.pending_device_flow.lock().unwrap() = None;
    delete_token();
    let mut connection = open_database(&app).await?;
    sqlx::query("DELETE FROM github_connections WHERE id = 1")
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("GitHub could not be disconnected: {error}"))?;
    sqlx::query("DELETE FROM github_installations")
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("GitHub access metadata could not be removed: {error}"))?;
    Ok(())
}

fn git_output(path: &Path, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Git could not be started: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            "Git operation failed.".to_string()
        } else {
            detail
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn parse_github_remote(remote: &str) -> Result<(String, String), String> {
    let value = remote.trim().trim_end_matches('/');
    let path = if let Some(path) = value.strip_prefix("git@github.com:") {
        path.to_string()
    } else if let Some(path) = value.strip_prefix("ssh://git@github.com/") {
        path.to_string()
    } else {
        let parsed = url::Url::parse(value)
            .map_err(|_| "The repository origin is not a supported GitHub remote.".to_string())?;
        if parsed.host_str() != Some("github.com")
            || parsed.scheme() != "https"
            || !parsed.username().is_empty()
            || parsed.password().is_some()
        {
            return Err("Only github.com repository remotes are supported.".to_string());
        }
        parsed.path().trim_start_matches('/').to_string()
    };
    let path = path.trim_end_matches(".git");
    let mut parts = path.split('/');
    let owner = parts.next().unwrap_or_default();
    let repository = parts.next().unwrap_or_default();
    if owner.is_empty() || repository.is_empty() || parts.next().is_some() {
        return Err("The GitHub repository could not be identified from origin.".to_string());
    }
    Ok((owner.to_string(), repository.to_string()))
}

fn credential_helper_path() -> Result<PathBuf, String> {
    let path =
        std::env::temp_dir().join(format!("orchestrator-github-credential-{}", Uuid::new_v4()));
    fs::write(
        &path,
        "#!/bin/sh\nif [ \"$1\" = get ]; then\n  printf 'username=x-access-token\\npassword=%s\\n' \"$ORCHESTRATOR_GITHUB_TOKEN\"\nfi\n",
    )
    .map_err(|_| "The temporary GitHub credential helper could not be created.".to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).map_err(|_| {
            "The temporary GitHub credential helper could not be secured.".to_string()
        })?;
    }
    Ok(path)
}

fn push_with_token(
    binding: &KanbanGitRepositoryBinding,
    token: &str,
    owner: &str,
    repository: &str,
) -> Result<String, String> {
    let helper = credential_helper_path()?;
    let helper_config = format!("credential.helper={}", helper.to_string_lossy());
    let remote = format!("https://github.com/{owner}/{repository}.git");
    let refspec = format!("{}:refs/heads/{}", binding.card_branch, binding.card_branch);
    let output = Command::new("git")
        .arg("-C")
        .arg(&binding.worktree_path)
        .args([
            "-c",
            "credential.helper=",
            "-c",
            &helper_config,
            "push",
            "--porcelain",
            &remote,
            &refspec,
        ])
        .env("ORCHESTRATOR_GITHUB_TOKEN", token)
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("Git push could not be started: {error}"));
    let _ = fs::remove_file(&helper);
    let output = output?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if detail.is_empty() {
            "GitHub rejected the branch push.".to_string()
        } else {
            detail
        });
    }
    Ok(git_output(
        Path::new(&binding.worktree_path),
        &["rev-parse", "HEAD^{commit}"],
    )?)
}

async fn ensure_repository_access(
    app: &AppHandle,
    owner: &str,
    repository: &str,
) -> Result<(), String> {
    let mut connection = open_database(app).await?;
    let allowed: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM github_installation_repositories
         WHERE lower(owner) = lower(?1) AND lower(name) = lower(?2)",
    )
    .bind(owner)
    .bind(repository)
    .fetch_one(&mut *connection)
    .await
    .map_err(|error| format!("GitHub repository access could not be checked: {error}"))?;
    if allowed == 0 {
        return Err(format!(
            "Install the Orchestrator GitHub App for {owner}/{repository}, then reconnect."
        ));
    }
    Ok(())
}

async fn upsert_publication_error(app: &AppHandle, card_id: &str, source_path: &str, error: &str) {
    if let Ok(mut connection) = open_database(app).await {
        let _ = sqlx::query(
            "UPDATE kanban_pull_requests SET publication_status = 'failed', last_error = ?1,
                    attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP
             WHERE card_id = ?2 AND source_repository_path = ?3",
        )
        .bind(error)
        .bind(card_id)
        .bind(source_path)
        .execute(&mut *connection)
        .await;
    }
    let _ = touch_card_board(app, card_id).await;
}

async fn touch_card_board(app: &AppHandle, card_id: &str) -> Result<(), String> {
    let mut connection = open_database(app).await?;
    sqlx::query(
        "UPDATE kanban_boards SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
         WHERE workspace_id = (SELECT workspace_id FROM kanban_cards WHERE id = ?1)",
    )
    .bind(card_id)
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("The Kanban board could not be refreshed: {error}"))?;
    Ok(())
}

fn diff_totals(path: &Path, base_commit: &str) -> (u64, u64, usize) {
    let output = git_output(
        path,
        &["diff", "--numstat", &format!("{base_commit}..HEAD")],
    )
    .unwrap_or_default();
    let mut additions = 0;
    let mut deletions = 0;
    let mut files = 0;
    for line in output.lines() {
        let mut fields = line.splitn(3, '\t');
        let added = fields.next().unwrap_or_default();
        let deleted = fields.next().unwrap_or_default();
        if fields.next().is_none() {
            continue;
        }
        files += 1;
        additions += added.parse::<u64>().unwrap_or(0);
        deletions += deleted.parse::<u64>().unwrap_or(0);
    }
    (additions, deletions, files)
}

fn safe_pull_request_text(value: &str, limit: usize) -> String {
    const SENSITIVE_MARKERS: &[&str] = &[
        "authorization:",
        "api_key",
        "apikey",
        "access_token",
        "refresh_token",
        "client_secret",
        "password",
        "device code",
        "one-time code",
        "otp:",
    ];
    let mut in_fence = false;
    let mut omitted = false;
    let mut safe = String::new();
    for line in value.lines() {
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
            if !omitted {
                safe.push_str("[Technical details omitted.]\n");
                omitted = true;
            }
            continue;
        }
        if in_fence {
            continue;
        }
        let lower = line.to_ascii_lowercase();
        if SENSITIVE_MARKERS
            .iter()
            .any(|marker| lower.contains(marker))
        {
            if !omitted {
                safe.push_str("[Sensitive details omitted.]\n");
                omitted = true;
            }
            continue;
        }
        safe.push_str(line);
        safe.push('\n');
        if safe.chars().count() >= limit {
            break;
        }
    }
    safe.chars()
        .take(limit)
        .collect::<String>()
        .trim()
        .to_string()
}

async fn publish_record(
    app: AppHandle,
    card_id: String,
    binding: KanbanGitRepositoryBinding,
) -> Result<(), String> {
    let token = access_token().await?;
    let remote = git_output(
        Path::new(&binding.source_repository_path),
        &["remote", "get-url", "origin"],
    )?;
    let (owner, repository) = parse_github_remote(&remote)?;
    ensure_repository_access(&app, &owner, &repository).await?;
    let mut connection = open_database(&app).await?;
    let card = sqlx::query(
        "SELECT card.title, card.description, card.account_id, card.model, card.chat_id,
                workspace.path AS workspace_path
         FROM kanban_cards card JOIN workspaces workspace ON workspace.id = card.workspace_id
         WHERE card.id = ?1 AND card.deleted_at IS NULL",
    )
    .bind(&card_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(|_| "The Kanban card is no longer available.".to_string())?;
    let title: String = card.get("title");
    let objective: String = card.get("description");
    let account_id: Option<i64> = card.get("account_id");
    let model: Option<String> = card.get("model");
    let chat_id: i64 = card.get("chat_id");
    let implementation_outcome: Option<String> = sqlx::query_scalar(
        "SELECT final_message FROM runs WHERE chat_id = ?1 AND final_message IS NOT NULL
         ORDER BY turn_index DESC, id DESC LIMIT 1",
    )
    .bind(chat_id)
    .fetch_optional(&mut *connection)
    .await
    .unwrap_or(None);
    sqlx::query(
        "UPDATE kanban_pull_requests SET owner = ?1, repository = ?2,
                publication_status = 'publishing', last_error = NULL,
                attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP
         WHERE card_id = ?3 AND source_repository_path = ?4",
    )
    .bind(&owner)
    .bind(&repository)
    .bind(&card_id)
    .bind(&binding.source_repository_path)
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("Publication state could not be saved: {error}"))?;
    drop(connection);

    let status = kanban_git_status(
        app.clone(),
        KanbanGitBindingRequest {
            binding: binding.clone(),
        },
    )
    .await?;
    let mut next_binding = binding;
    if status.has_changes {
        let context = WorkspaceCommitIntentContext {
            objective: Some(objective.clone()),
            approved_plan: None,
            implementation_outcome: implementation_outcome.clone(),
        };
        let app_for_generation = app.clone();
        let worktree = next_binding.worktree_path.clone();
        let message = tauri::async_runtime::spawn_blocking(move || {
            generate_workspace_repository_commit_message_blocking(
                app_for_generation,
                worktree.clone(),
                Some(worktree),
                account_id,
                Some(true),
                model,
                Some(context),
            )
        })
        .await
        .map_err(|_| "Commit message generation stopped unexpectedly.".to_string())??;
        next_binding = kanban_git_commit(
            app.clone(),
            KanbanGitCommitRequest {
                binding: next_binding,
                message: message.message,
                stage_all: true,
            },
        )
        .await?
        .binding;
    }
    let head_commit = git_output(
        Path::new(&next_binding.worktree_path),
        &["rev-parse", "HEAD^{commit}"],
    )?;
    let ahead = git_output(
        Path::new(&next_binding.worktree_path),
        &[
            "rev-list",
            "--count",
            &format!("{}..HEAD", next_binding.base_commit),
        ],
    )?
    .parse::<u64>()
    .unwrap_or(0);
    if ahead == 0 {
        let mut connection = open_database(&app).await?;
        sqlx::query(
            "UPDATE kanban_pull_requests SET publication_status = 'nothing_to_publish',
                    head_commit = ?1, last_error = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE card_id = ?2 AND source_repository_path = ?3",
        )
        .bind(head_commit)
        .bind(&card_id)
        .bind(&next_binding.source_repository_path)
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Publication state could not be saved: {error}"))?;
        drop(connection);
        touch_card_board(&app, &card_id).await?;
        return Ok(());
    }
    let head_commit = push_with_token(&next_binding, &token, &owner, &repository)?;
    let client = github_client()?;
    let existing_url = format!(
        "{GITHUB_API}/repos/{owner}/{repository}/pulls?state=all&head={owner}:{}&base={}",
        next_binding.card_branch, next_binding.base_branch
    );
    let response = client
        .get(existing_url)
        .bearer_auth(&token)
        .header(header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|_| "GitHub could not be reached while checking pull requests.".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "GitHub could not check existing pull requests (HTTP {}).",
            response.status().as_u16()
        ));
    }
    let existing: Vec<GithubPullRequest> = response
        .json()
        .await
        .map_err(|_| "GitHub returned an invalid pull request response.".to_string())?;
    let pull_request = if let Some(existing) = existing.into_iter().next() {
        existing
    } else {
        let summary = implementation_outcome
            .unwrap_or_else(|| "The agent completed the requested card work.".to_string());
        let (additions, deletions, changed_files) = diff_totals(
            Path::new(&next_binding.worktree_path),
            &next_binding.base_commit,
        );
        let body = format!(
            "## Objective\n{}\n\n## Agent summary\n{}\n\n## Changes\n{} files changed, +{} -{}\n\n---\nOrchestrator card `{}`",
            safe_pull_request_text(&objective, 4_000),
            safe_pull_request_text(&summary, 6_000),
            changed_files,
            additions,
            deletions,
            card_id,
        );
        let response = client
            .post(format!("{GITHUB_API}/repos/{owner}/{repository}/pulls"))
            .bearer_auth(&token)
            .header(header::ACCEPT, "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .json(&CreatePullRequest {
                title: &title,
                head: &next_binding.card_branch,
                base: &next_binding.base_branch,
                body: &body,
                draft: true,
            })
            .send()
            .await
            .map_err(|_| {
                "GitHub could not be reached while creating the pull request.".to_string()
            })?;
        if !response.status().is_success() {
            return Err(format!(
                "GitHub could not create the pull request (HTTP {}).",
                response.status().as_u16()
            ));
        }
        response
            .json()
            .await
            .map_err(|_| "GitHub returned an invalid pull request response.".to_string())?
    };
    let state = if pull_request.merged_at.is_some() {
        "merged"
    } else {
        pull_request.state.as_str()
    };
    let publication = if state == "merged" {
        "merged"
    } else if state == "closed" {
        "closed"
    } else if pull_request.draft.unwrap_or(false) {
        "draft"
    } else {
        "ready"
    };
    let mut connection = open_database(&app).await?;
    sqlx::query(
        "UPDATE kanban_pull_requests SET pull_request_number = ?1, pull_request_url = ?2,
                head_commit = ?3, draft = ?4, pull_request_state = ?5,
                publication_status = ?6, last_error = NULL,
                last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE card_id = ?7 AND source_repository_path = ?8",
    )
    .bind(pull_request.number)
    .bind(pull_request.html_url)
    .bind(head_commit)
    .bind(pull_request.draft.unwrap_or(false))
    .bind(state)
    .bind(publication)
    .bind(&card_id)
    .bind(&next_binding.source_repository_path)
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("Pull request state could not be saved: {error}"))?;
    drop(connection);
    touch_card_board(&app, &card_id).await?;
    Ok(())
}

pub(crate) async fn enqueue_card_publication(
    app: AppHandle,
    card_id: String,
) -> Result<(), String> {
    let mut connection = open_database(&app).await?;
    let rows = sqlx::query(
        "SELECT binding_json FROM kanban_repository_bindings WHERE card_id = ?1 AND state != 'removed'",
    )
    .bind(&card_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Card repositories could not be loaded: {error}"))?;
    let bindings = rows
        .into_iter()
        .filter_map(|row| {
            serde_json::from_str::<KanbanGitRepositoryBinding>(
                &row.get::<String, _>("binding_json"),
            )
            .ok()
        })
        .collect::<Vec<_>>();
    for binding in &bindings {
        sqlx::query(
            "INSERT INTO kanban_pull_requests (
                card_id, source_repository_path, relative_path, base_branch, head_branch
             ) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(card_id, source_repository_path) DO UPDATE SET
                relative_path = excluded.relative_path, base_branch = excluded.base_branch,
                head_branch = excluded.head_branch,
                publication_status = CASE
                    WHEN kanban_pull_requests.pull_request_number IS NULL THEN 'queued'
                    ELSE kanban_pull_requests.publication_status END,
                updated_at = CURRENT_TIMESTAMP",
        )
        .bind(&card_id)
        .bind(&binding.source_repository_path)
        .bind(&binding.relative_path)
        .bind(&binding.base_branch)
        .bind(&binding.card_branch)
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Publication could not be queued: {error}"))?;
    }
    let eligible_rows = sqlx::query(
        "SELECT source_repository_path FROM kanban_pull_requests
         WHERE card_id = ?1
           AND pull_request_number IS NULL
           AND publication_status IN ('queued', 'failed', 'nothing_to_publish')",
    )
    .bind(&card_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Publication state could not be loaded: {error}"))?;
    let eligible_paths = eligible_rows
        .into_iter()
        .map(|row| row.get::<String, _>("source_repository_path"))
        .collect::<HashSet<_>>();
    drop(connection);
    touch_card_board(&app, &card_id).await?;
    for binding in bindings
        .into_iter()
        .filter(|binding| eligible_paths.contains(&binding.source_repository_path))
    {
        let app = app.clone();
        let card = card_id.clone();
        tauri::async_runtime::spawn(async move {
            let source = binding.source_repository_path.clone();
            if let Err(error) = publish_record(app.clone(), card.clone(), binding).await {
                upsert_publication_error(&app, &card, &source, &error).await;
            }
        });
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn github_publish_kanban_card(
    app: AppHandle,
    card_id: String,
) -> Result<GithubPublicationResult, String> {
    let mut connection = open_database(&app).await?;
    let card = sqlx::query(
        "SELECT review_channel,
                EXISTS(SELECT 1 FROM kanban_pull_requests
                       WHERE card_id = kanban_cards.id AND pull_request_number IS NOT NULL)
                    AS has_pr,
                EXISTS(SELECT 1 FROM kanban_local_reviews
                       WHERE card_id = kanban_cards.id
                         AND merge_started = 1) AS local_started
         FROM kanban_cards WHERE id = ?1 AND stage = 'in_review' AND deleted_at IS NULL",
    )
    .bind(&card_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(|error| format!("The review destination could not be checked: {error}"))?
    .ok_or_else(|| "Only a completed card in review can be published.".to_string())?;
    let has_pr = card.get::<i64, _>("has_pr") != 0;
    let local_started = card.get::<i64, _>("local_started") != 0;
    if card.get::<Option<String>, _>("review_channel").as_deref() == Some("local") {
        if local_started {
            return Err(
                "Local merging has already started, so this card cannot switch to GitHub review."
                    .to_string(),
            );
        }
        if has_pr {
            return Err("This card already has a pull request.".to_string());
        }
        access_token().await?;
        sqlx::query(
            "UPDATE kanban_cards SET review_channel = 'github',
                 state_version = state_version + 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1 AND review_channel = 'local'",
        )
        .bind(&card_id)
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("GitHub review could not be selected: {error}"))?;
        sqlx::query("DELETE FROM kanban_local_reviews WHERE card_id = ?1")
            .bind(&card_id)
            .execute(&mut *connection)
            .await
            .map_err(|error| format!("Local review state could not be cleared: {error}"))?;
    }
    drop(connection);
    enqueue_card_publication(app.clone(), card_id.clone()).await?;
    let mut connection = open_database(&app).await?;
    Ok(GithubPublicationResult {
        card_id: card_id.clone(),
        pull_requests: load_card_pull_requests(&mut connection, &card_id).await?,
    })
}

async fn sync_pull_request(
    app: &AppHandle,
    token: &str,
    row: &sqlx::sqlite::SqliteRow,
) -> Result<bool, String> {
    let owner: String = row.get("owner");
    let repository: String = row.get("repository");
    let number: i64 = row.get("pull_request_number");
    let mut request = github_client()?
        .get(format!(
            "{GITHUB_API}/repos/{owner}/{repository}/pulls/{number}"
        ))
        .bearer_auth(token)
        .header(header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");
    if let Some(etag) = row.get::<Option<String>, _>("etag") {
        request = request.header(header::IF_NONE_MATCH, etag);
    }
    let response = request
        .send()
        .await
        .map_err(|_| "GitHub pull request status could not be refreshed.".to_string())?;
    if response.status() == StatusCode::NOT_MODIFIED {
        return Ok(false);
    }
    if !response.status().is_success() {
        return Err(format!(
            "GitHub returned HTTP {} while refreshing a pull request.",
            response.status().as_u16()
        ));
    }
    let etag = response
        .headers()
        .get(header::ETAG)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let pull_request: GithubPullRequest = response
        .json()
        .await
        .map_err(|_| "GitHub returned an invalid pull request response.".to_string())?;
    let state = if pull_request.merged_at.is_some() {
        "merged"
    } else {
        pull_request.state.as_str()
    };
    let publication = if state == "merged" {
        "merged"
    } else if state == "closed" {
        "closed"
    } else if pull_request.draft.unwrap_or(false) {
        "draft"
    } else {
        "ready"
    };
    let mut connection = open_database(app).await?;
    sqlx::query(
        "UPDATE kanban_pull_requests SET draft = ?1, pull_request_state = ?2,
                publication_status = ?3, pull_request_url = ?4, last_error = NULL,
                etag = ?5, last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?6",
    )
    .bind(pull_request.draft.unwrap_or(false))
    .bind(state)
    .bind(publication)
    .bind(pull_request.html_url)
    .bind(etag)
    .bind(row.get::<i64, _>("id"))
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("Pull request state could not be saved: {error}"))?;
    Ok(true)
}

async fn complete_merged_cards(app: &AppHandle) -> Result<u64, String> {
    let mut connection = open_database(app).await?;
    let card_ids = sqlx::query_scalar::<_, String>(
        "SELECT card.id FROM kanban_cards card
         WHERE card.stage = 'in_review' AND card.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM kanban_pull_requests pr WHERE pr.card_id = card.id)
           AND NOT EXISTS (
             SELECT 1 FROM kanban_pull_requests pr
             WHERE pr.card_id = card.id AND pr.publication_status != 'merged'
           )",
    )
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Merged cards could not be reconciled: {error}"))?;
    for card_id in &card_ids {
        sqlx::query(
            "UPDATE kanban_cards SET stage = 'done', review_state = 'approved',
                    approved_at = CURRENT_TIMESTAMP, state_version = state_version + 1,
                    updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        )
        .bind(&card_id)
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Merged card state could not be saved: {error}"))?;
        sqlx::query(
            "UPDATE kanban_boards SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
             WHERE workspace_id = (SELECT workspace_id FROM kanban_cards WHERE id = ?1)",
        )
        .bind(&card_id)
        .execute(&mut *connection)
        .await
        .map_err(|error| format!("Merged board state could not be saved: {error}"))?;
    }
    Ok(card_ids.len() as u64)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn github_sync_kanban_pull_requests(
    app: AppHandle,
    workspace_id: Option<i64>,
) -> Result<u64, String> {
    let token = access_token().await?;
    let mut connection = open_database(&app).await?;
    let stale_publications = sqlx::query(
        "SELECT pr.card_id, pr.source_repository_path, binding.binding_json
         FROM kanban_pull_requests pr
         JOIN kanban_cards card ON card.id = pr.card_id
         JOIN kanban_repository_bindings binding
           ON binding.card_id = pr.card_id
          AND binding.repository_path = pr.source_repository_path
         WHERE pr.pull_request_number IS NULL
           AND pr.publication_status IN ('queued', 'publishing')
           AND pr.updated_at <= datetime('now', '-2 minutes')
           AND binding.state != 'removed'
           AND (?1 IS NULL OR card.workspace_id = ?1)",
    )
    .bind(workspace_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Pending publications could not be recovered: {error}"))?;
    let rows = sqlx::query(
        "SELECT pr.id, pr.owner, pr.repository, pr.pull_request_number, pr.etag
         FROM kanban_pull_requests pr JOIN kanban_cards card ON card.id = pr.card_id
         WHERE pr.pull_request_number IS NOT NULL
           AND pr.publication_status IN ('draft','ready','closed','merged')
           AND (?1 IS NULL OR card.workspace_id = ?1)",
    )
    .bind(workspace_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(|error| format!("Pull requests could not be loaded: {error}"))?;
    drop(connection);
    let mut synced = 0_u64;
    for row in stale_publications {
        let card_id: String = row.get("card_id");
        let source_path: String = row.get("source_repository_path");
        let binding = match serde_json::from_str::<KanbanGitRepositoryBinding>(
            &row.get::<String, _>("binding_json"),
        ) {
            Ok(binding) => binding,
            Err(_) => {
                upsert_publication_error(
                    &app,
                    &card_id,
                    &source_path,
                    "The saved repository publication state is invalid.",
                )
                .await;
                synced += 1;
                continue;
            }
        };
        if let Err(error) = publish_record(app.clone(), card_id.clone(), binding).await {
            upsert_publication_error(&app, &card_id, &source_path, &error).await;
        }
        synced += 1;
    }
    for row in &rows {
        if matches!(sync_pull_request(&app, &token, row).await, Ok(true)) {
            synced += 1;
        }
    }
    synced += complete_merged_cards(&app).await?;
    Ok(synced)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn github_complete_kanban_without_pull_request(
    app: AppHandle,
    card_id: String,
) -> Result<(), String> {
    let mut connection = open_database(&app).await?;
    let (total, invalid): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(
             CASE WHEN publication_status != 'nothing_to_publish' THEN 1 ELSE 0 END
         ), 0)
         FROM kanban_pull_requests WHERE card_id = ?1",
    )
    .bind(&card_id)
    .fetch_one(&mut *connection)
    .await
    .map_err(|error| format!("Publication state could not be checked: {error}"))?;
    if total == 0 || invalid > 0 {
        return Err("This card still has work to publish or an existing pull request.".to_string());
    }
    sqlx::query(
        "UPDATE kanban_cards SET stage = 'done', review_state = 'approved',
                approved_at = CURRENT_TIMESTAMP, state_version = state_version + 1,
                updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND stage = 'in_review'",
    )
    .bind(&card_id)
    .execute(&mut *connection)
    .await
    .map_err(|error| format!("The card could not be completed: {error}"))?;
    drop(connection);
    touch_card_board(&app, &card_id).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{parse_github_remote, safe_pull_request_text, validate_github_client_id};

    #[test]
    fn validates_public_github_client_ids() {
        assert_eq!(
            validate_github_client_id("  Iv1.0000000000000000  ").unwrap(),
            "Iv1.0000000000000000"
        );
        assert_eq!(
            validate_github_client_id("Iv10000000000000000").unwrap(),
            "Iv10000000000000000"
        );
        assert!(validate_github_client_id("too-short").is_err());
        assert!(validate_github_client_id("Iv1_invalid_client_id").is_err());
    }

    #[test]
    fn parses_supported_github_remotes() {
        assert_eq!(
            parse_github_remote("git@github.com:openai/codex.git").unwrap(),
            ("openai".to_string(), "codex".to_string())
        );
        assert_eq!(
            parse_github_remote("https://github.com/openai/codex.git").unwrap(),
            ("openai".to_string(), "codex".to_string())
        );
        assert!(parse_github_remote("https://example.com/openai/codex.git").is_err());
        assert!(parse_github_remote("http://github.com/openai/codex.git").is_err());
        assert!(parse_github_remote("https://token@github.com/openai/codex.git").is_err());
        assert!(parse_github_remote("git@github.com:openai/codex/extra.git").is_err());
    }

    #[test]
    fn pull_request_text_omits_secrets_and_fenced_output() {
        let safe = safe_pull_request_text(
            "Implemented login.\n```sh\nexport API_KEY=secret\n```\nPassword: hidden\nTests pass.",
            1_000,
        );
        assert!(safe.contains("Implemented login."));
        assert!(safe.contains("Tests pass."));
        assert!(!safe.contains("API_KEY"));
        assert!(!safe.contains("hidden"));
    }
}
