import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAnalyticsConfiguration } from "./analytics-config.mjs";

test("analytics is disabled without an explicit build flag", () => {
  validateAnalyticsConfiguration({});
  validateAnalyticsConfiguration({ ORCHESTRATOR_ANALYTICS_ENABLED: "0" });
});

const enabled = {
  ORCHESTRATOR_ANALYTICS_ENABLED: "1",
  ORCHESTRATOR_POSTHOG_HOST: "https://eu.i.posthog.com",
  ORCHESTRATOR_POSTHOG_TOKEN: "phc_test_public_token",
};
test("enabled builds require public ingestion configuration", () => {
  validateAnalyticsConfiguration(enabled);
  for (const change of [
    { ORCHESTRATOR_POSTHOG_TOKEN: "" }, { ORCHESTRATOR_POSTHOG_TOKEN: "phx_admin" },
    { ORCHESTRATOR_POSTHOG_TOKEN: "phs_secret" }, { ORCHESTRATOR_POSTHOG_HOST: "" },
    { ORCHESTRATOR_POSTHOG_HOST: "http://eu.i.posthog.com" },
    { ORCHESTRATOR_POSTHOG_HOST: "https://example.com/path" },
    { ORCHESTRATOR_POSTHOG_HOST: "https://user:pass@example.com" },
    { ORCHESTRATOR_ANALYTICS_ENVIRONMENT: "unknown" },
  ]) assert.throws(() => validateAnalyticsConfiguration({ ...enabled, ...change }));
});
