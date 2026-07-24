use serde::Serialize;
use std::time::Duration;
use tokio::{net::TcpStream, time::timeout};
use url::{Host, Url};

const WEB_PREVIEW_PROBE_TIMEOUT: Duration = Duration::from_millis(650);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalWebPreviewProbeResult {
    normalized_url: String,
    reachable: bool,
}

#[tauri::command]
pub(crate) async fn probe_local_web_preview(
    url: String,
) -> Result<LocalWebPreviewProbeResult, String> {
    let (normalized_url, host, port) = normalize_local_web_preview_url(&url)?;
    let probe_host = if host == "localhost" || host.ends_with(".localhost") {
        "127.0.0.1".to_string()
    } else {
        host
    };
    let reachable = timeout(
        WEB_PREVIEW_PROBE_TIMEOUT,
        TcpStream::connect((probe_host.as_str(), port)),
    )
    .await
    .map(|result| result.is_ok())
    .unwrap_or(false);

    Ok(LocalWebPreviewProbeResult {
        normalized_url,
        reachable,
    })
}

fn normalize_local_web_preview_url(value: &str) -> Result<(String, String, u16), String> {
    let mut url = Url::parse(value.trim())
        .map_err(|_| "The web preview address was not a valid URL.".to_string())?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("Web previews support only HTTP and HTTPS addresses.".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Web preview addresses cannot contain credentials.".to_string());
    }

    let host = url
        .host()
        .ok_or_else(|| "The web preview address did not contain a host.".to_string())?;
    let normalized_host = match host {
        Host::Domain(domain) if is_local_domain(domain) => domain.to_ascii_lowercase(),
        Host::Ipv4(address) if address.is_loopback() => address.to_string(),
        Host::Ipv4(address) if address.is_unspecified() => "localhost".to_string(),
        Host::Ipv6(address) if address.is_loopback() => address.to_string(),
        Host::Ipv6(address) if address.is_unspecified() => "localhost".to_string(),
        Host::Ipv4(_) | Host::Ipv6(_) | Host::Domain(_) => {
            return Err("Only local web preview addresses are allowed.".to_string());
        }
    };
    if normalized_host == "localhost" && url.host_str() != Some("localhost") {
        url.set_host(Some("localhost"))
            .map_err(|_| "Could not normalize the web preview address.".to_string())?;
    }
    url.set_query(None);
    url.set_fragment(None);

    let port = url
        .port_or_known_default()
        .ok_or_else(|| "The web preview address did not contain a valid port.".to_string())?;
    Ok((url.to_string(), normalized_host, port))
}

fn is_local_domain(domain: &str) -> bool {
    let normalized = domain.to_ascii_lowercase();
    normalized == "localhost" || normalized.ends_with(".localhost")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, TcpListener};

    #[test]
    fn normalizes_safe_local_preview_urls() {
        let (url, host, port) =
            normalize_local_web_preview_url("http://0.0.0.0:4173/game?token=secret#debug")
                .expect("normalize URL");

        assert_eq!(url, "http://localhost:4173/game");
        assert_eq!(host, "localhost");
        assert_eq!(port, 4173);
    }

    #[test]
    fn rejects_external_and_credentialed_urls() {
        assert!(normalize_local_web_preview_url("https://example.com").is_err());
        assert!(normalize_local_web_preview_url("http://user:secret@localhost:3000").is_err());
        assert!(normalize_local_web_preview_url("file:///tmp/index.html").is_err());
    }

    #[test]
    fn reports_reachable_and_closed_local_ports() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind listener");
        let port = listener.local_addr().expect("listener address").port();
        let reachable = tauri::async_runtime::block_on(probe_local_web_preview(format!(
            "http://localhost:{port}/"
        )))
        .expect("probe listener");
        assert!(reachable.reachable);

        let closed_port = {
            let closed_listener =
                TcpListener::bind(("127.0.0.1", 0)).expect("bind closed listener");
            closed_listener
                .local_addr()
                .expect("closed listener address")
                .port()
        };
        let closed = tauri::async_runtime::block_on(probe_local_web_preview(format!(
            "http://localhost:{closed_port}/"
        )))
        .expect("probe closed port");
        assert!(!closed.reachable);
    }

    #[test]
    fn accepts_only_loopback_ip_addresses() {
        assert!(matches!(
            normalize_local_web_preview_url("http://127.0.0.2:3000"),
            Ok((_, host, _)) if host.parse::<IpAddr>().is_ok_and(|ip| ip.is_loopback())
        ));
        assert!(normalize_local_web_preview_url("http://192.168.1.10:3000").is_err());
    }
}
