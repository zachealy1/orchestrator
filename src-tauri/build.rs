fn main() {
    println!("cargo:rerun-if-env-changed=ORCHESTRATOR_UPDATER_PUBLIC_KEY");
    for name in [
        "ORCHESTRATOR_ANALYTICS_ENABLED",
        "ORCHESTRATOR_POSTHOG_HOST",
        "ORCHESTRATOR_POSTHOG_TOKEN",
        "ORCHESTRATOR_ANALYTICS_ENVIRONMENT",
    ] {
        println!("cargo:rerun-if-env-changed={name}");
    }
    if std::env::var("ORCHESTRATOR_ANALYTICS_ENABLED").as_deref() == Ok("1") {
        let host = std::env::var("ORCHESTRATOR_POSTHOG_HOST").unwrap_or_default();
        let token = std::env::var("ORCHESTRATOR_POSTHOG_TOKEN").unwrap_or_default();
        let host =
            url::Url::parse(&host).expect("Enabled analytics requires a PostHog HTTPS origin");
        assert!(
            host.scheme() == "https"
                && host.host_str().is_some()
                && host.username().is_empty()
                && host.password().is_none()
                && host.path() == "/"
                && host.query().is_none()
                && host.fragment().is_none()
                && !token.trim().is_empty(),
            "Enabled analytics requires an HTTPS origin and public project token"
        );
        let environment = std::env::var("ORCHESTRATOR_ANALYTICS_ENVIRONMENT")
            .unwrap_or_else(|_| "production".into());
        assert!(
            matches!(environment.as_str(), "production" | "test"),
            "Analytics environment must be production or test"
        );
        assert!(
            !token.starts_with("phx_") && !token.starts_with("phs_"),
            "Only a public PostHog project token may be embedded"
        );
    }
    tauri_build::build()
}
