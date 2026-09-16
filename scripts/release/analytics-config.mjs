// Public ingestion configuration only. Administrative credentials never enter app builds.
export function validateAnalyticsConfiguration(env = process.env) {
  const enabled = env.ORCHESTRATOR_ANALYTICS_ENABLED;
  if (enabled && !["0", "1"].includes(enabled)) throw new Error("ORCHESTRATOR_ANALYTICS_ENABLED must be 0 or 1");
  if (enabled !== "1") return;
  const token = env.ORCHESTRATOR_POSTHOG_TOKEN?.trim();
  if (!token || /^(phx_|phs_)/.test(token)) {
    throw new Error("Enabled analytics requires a public PostHog project token, never a personal or secret API key");
  }
  let host;
  try { host = new URL(env.ORCHESTRATOR_POSTHOG_HOST); } catch {
    throw new Error("Enabled analytics requires ORCHESTRATOR_POSTHOG_HOST");
  }
  if (host.protocol !== "https:" || !host.hostname || host.username || host.password
      || host.search || host.hash || !["", "/"].includes(host.pathname)) {
    throw new Error("PostHog host must be an HTTPS origin without credentials, path, query, or fragment");
  }
  if (!["production", "test"].includes(env.ORCHESTRATOR_ANALYTICS_ENVIRONMENT ?? "production")) {
    throw new Error("Analytics environment must be production or test");
  }
}
