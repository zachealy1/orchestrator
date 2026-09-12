//! Provider-specific operations used by the shared Kanban publication state machine.
use crate::{github_cli, gitlab_cli, DatabaseState};
use std::path::Path;
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Repository {
    pub provider: String,
    pub host: String,
    pub owner: String,
    pub name: String,
    pub project_id: Option<i64>,
}
impl Repository {
    pub fn path(&self) -> String {
        format!("{}/{}", self.owner, self.name)
    }
    pub async fn validate(&mut self, app: &AppHandle) -> Result<(), String> {
        if self.provider == "github" {
            github_cli::ensure_repository_access(app, &self.owner, &self.name).await
        } else {
            self.project_id =
                Some(gitlab_cli::ensure_repository_access(app, &self.host, &self.path()).await?);
            Ok(())
        }
    }
    fn project_id(&self) -> Result<i64, String> {
        self.project_id
            .ok_or("The saved GitLab project ID is missing. Retry publication.".into())
    }
    pub async fn push(
        &self,
        app: &AppHandle,
        worktree: &Path,
        remote: &str,
        source: &str,
        branch: &str,
        ensure_base: bool,
    ) -> Result<(), String> {
        if self.provider == "gitlab" {
            gitlab_cli::push_ref(
                app,
                &self.host,
                &self.path(),
                worktree,
                source,
                branch,
                ensure_base,
            )
            .await
        } else if ensure_base {
            github_cli::ensure_base_branch(
                app,
                worktree,
                remote,
                &self.owner,
                &self.name,
                source,
                branch,
            )
            .await
        } else {
            github_cli::push_branch(app, worktree, remote, &self.owner, &self.name, branch).await
        }
    }
    pub async fn find(
        &self,
        app: &AppHandle,
        head: &str,
        base: &str,
    ) -> Result<Option<github_cli::GithubPullRequest>, String> {
        if self.provider == "github" {
            github_cli::find_pull_request(app, &self.owner, &self.name, head, base).await
        } else {
            gitlab_cli::find_merge_request(app, &self.host, self.project_id()?, head, base).await
        }
    }
    pub async fn create(
        &self,
        app: &AppHandle,
        head: &str,
        base: &str,
        title: &str,
        body: &str,
    ) -> Result<github_cli::GithubPullRequest, String> {
        if self.provider == "github" {
            github_cli::create_pull_request(app, &self.owner, &self.name, head, base, title, body)
                .await
        } else {
            gitlab_cli::create_merge_request(
                app,
                &self.host,
                self.project_id()?,
                head,
                base,
                title,
                body,
            )
            .await
        }
    }
    pub async fn view(
        &self,
        app: &AppHandle,
        number: i64,
    ) -> Result<github_cli::GithubPullRequest, String> {
        if self.provider == "github" {
            github_cli::view_pull_request(app, &self.owner, &self.name, number).await
        } else {
            gitlab_cli::view_merge_request(app, &self.host, self.project_id()?, number).await
        }
    }
}

pub(crate) fn parse_remote(remote: &str, gitlab_hosts: &[String]) -> Result<Repository, String> {
    let value = remote.trim().trim_end_matches('/');
    let expanded = if let Some(scp) = value.strip_prefix("git@") {
        let (host, path) = scp.split_once(':').ok_or("Unsupported SSH origin.")?;
        format!("ssh://git@{host}/{path}")
    } else {
        value.to_string()
    };
    let url = url::Url::parse(&expanded)
        .map_err(|_| "The repository origin is not a supported remote.")?;
    if !matches!(url.scheme(), "https" | "ssh")
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || (url.scheme() == "https" && !url.username().is_empty())
        || (url.scheme() == "ssh" && url.username() != "git")
    {
        return Err("Use an HTTPS or git SSH origin without embedded credentials.".into());
    }
    let hostname = url
        .host_str()
        .ok_or("The origin hostname is missing.")?
        .to_ascii_lowercase();
    // SSH ports describe transport, not the API port. A configured HTTPS host with
    // the same hostname is usable only when the mapping is unambiguous.
    let mut host = if url.scheme() == "https" {
        gitlab_cli::normalize_host(&format!(
            "https://{}",
            &url[url::Position::BeforeHost..url::Position::AfterPort]
        ))?
    } else {
        hostname.clone()
    };
    if url.scheme() == "ssh"
        && hostname != "github.com"
        && !gitlab_hosts.contains(&host)
        && hostname != "gitlab.com"
    {
        let matches: Vec<_> = gitlab_hosts
            .iter()
            .filter(|h| {
                url::Url::parse(&format!("https://{h}"))
                    .ok()
                    .and_then(|u| u.host_str().map(str::to_string))
                    .as_deref()
                    == Some(hostname.as_str())
            })
            .collect();
        if matches.len() == 1 {
            host = matches[0].clone();
        }
    }
    let provider = if host == "github.com" {
        "github"
    } else if host == "gitlab.com" || gitlab_hosts.contains(&host) {
        "gitlab"
    } else {
        return Err(format!(
            "Connect GitLab host {host} in Settings, or use local review for this origin."
        ));
    };
    let raw_path = url.path().trim_start_matches('/');
    let path = raw_path.strip_suffix(".git").unwrap_or(raw_path);
    if path.contains('%')
        || path.contains('\\')
        || path
            .split('/')
            .any(|s| s.is_empty() || s == "." || s == "..")
    {
        return Err("The origin has an invalid project path.".into());
    }
    let (owner, name) = path
        .rsplit_once('/')
        .ok_or("The origin must include a namespace and project.")?;
    if provider == "github" && owner.contains('/') {
        return Err("GitHub origins require an owner and repository.".into());
    }
    Ok(Repository {
        provider: provider.into(),
        host,
        owner: owner.into(),
        name: name.into(),
        project_id: None,
    })
}
pub(crate) async fn resolve(app: &AppHandle, remote: &str) -> Result<Repository, String> {
    parse_remote(remote, &gitlab_cli::configured_hosts(app).await?)
}

pub(crate) async fn card_destination(app: &AppHandle, card_id: &str) -> Result<String, String> {
    let mut db = app.state::<DatabaseState>().acquire().await?;
    let paths: Vec<String> = sqlx::query_scalar("SELECT repository_path FROM kanban_repository_bindings WHERE card_id=?1 AND state != 'removed'")
        .bind(card_id).fetch_all(&mut *db).await.map_err(|e| e.to_string())?;
    drop(db);
    if paths.is_empty() {
        return Err("This card has no repositories to publish.".into());
    }
    let hosts = gitlab_cli::configured_hosts(app).await?;
    let repositories = tauri::async_runtime::spawn_blocking(move || {
        paths
            .iter()
            .map(|path| {
                let output = std::process::Command::new("git")
                    .arg("-C")
                    .arg(path)
                    .args(["remote", "get-url", "origin"])
                    .output()
                    .map_err(|_| format!("Cannot read the origin for {path}."))?;
                if !output.status.success() {
                    return Err(format!(
                        "Repository {path} needs an origin to publish review requests."
                    ));
                }
                parse_remote(&String::from_utf8_lossy(&output.stdout), &hosts)
            })
            .collect::<Result<Vec<_>, String>>()
    })
    .await
    .map_err(|_| "Repository discovery stopped unexpectedly.".to_string())??;
    let mut github = false;
    let mut gitlab = false;
    for repository in &repositories {
        if repository.provider == "github" {
            if !github && !github_cli::github_review_available(app).await {
                return Err("Connect GitHub in Settings to publish this card.".into());
            }
            github = true;
        } else {
            if !gitlab_cli::connected(app, &repository.host).await {
                return Err(format!(
                    "Connect GitLab host {} in Settings to publish this card.",
                    repository.host
                ));
            }
            gitlab = true;
        }
    }
    Ok(match (github, gitlab) {
        (true, true) => "mixed",
        (true, false) => "github",
        _ => "gitlab",
    }
    .into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn providers_and_nested_namespaces() {
        let hosts = vec!["code.example:8443".into()];
        for remote in [
            "https://gitlab.com/team/sub/project.git",
            "git@gitlab.com:team/sub/project.git",
            "ssh://git@gitlab.com:2222/team/sub/project.git",
        ] {
            let p = parse_remote(remote, &hosts).unwrap();
            assert_eq!(p.provider, "gitlab");
            assert_eq!(p.path(), "team/sub/project");
        }
        assert_eq!(
            parse_remote("git@code.example:g/p.git", &hosts)
                .unwrap()
                .host,
            "code.example:8443"
        );
        assert_eq!(
            parse_remote("https://code.example:8443/g/p", &hosts)
                .unwrap()
                .host,
            "code.example:8443"
        );
        assert_eq!(
            parse_remote("git@github.com:g/p.git", &hosts)
                .unwrap()
                .provider,
            "github"
        );
        for remote in [
            "https://unknown.example/g/p",
            "http://gitlab.com/g/p",
            "https://token@gitlab.com/g/p",
            "https://github.com/g/sub/p",
            "https://gitlab.com/g/p?token=x",
            "file:///tmp/repo",
        ] {
            assert!(parse_remote(remote, &hosts).is_err(), "{remote}");
        }
    }
}

#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReviewConnectionRequirement {
    pub repository_path: String,
    pub provider: Option<String>,
    pub host: Option<String>,
    pub message: Option<String>,
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn review_connection_requirements(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Vec<ReviewConnectionRequirement>, String> {
    let hosts = gitlab_cli::configured_hosts(&app).await?;
    let remotes = tauri::async_runtime::spawn_blocking(move || paths.into_iter().map(|path| {
        let repository = std::process::Command::new("git").arg("-C").arg(&path).args(["remote", "get-url", "origin"]).output()
            .map_err(|_| "Could not read the repository origin.".to_string()).and_then(|out| {
                if !out.status.success() { Err("Add a supported origin to publish this repository, or use local review.".into()) }
                else { parse_remote(&String::from_utf8_lossy(&out.stdout), &hosts) }
            });
        (path, repository)
    }).collect::<Vec<_>>()).await.map_err(|_| "Repository discovery stopped unexpectedly.".to_string())?;
    let mut result = Vec::new();
    for (repository_path, repository) in remotes {
        match repository {
            Ok(repository) => {
                let connected = if repository.provider == "github" {
                    github_cli::github_review_available(&app).await
                } else {
                    gitlab_cli::connected(&app, &repository.host).await
                };
                let message = (!connected).then(|| format!("Connect {} in Settings. Completed cards using this repository will use local review until it is connected.", repository.host));
                result.push(ReviewConnectionRequirement {
                    repository_path,
                    provider: Some(repository.provider),
                    host: Some(repository.host),
                    message,
                });
            }
            Err(error) => result.push(ReviewConnectionRequirement {
                repository_path,
                provider: None,
                host: None,
                message: Some(error),
            }),
        }
    }
    Ok(result)
}
