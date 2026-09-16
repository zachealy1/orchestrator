# Installation activity

Orchestrator emits only `active_day` when a user opens the app, focuses it, types,
clicks, or scrolls with a wheel/trackpad. Automatic transcript scrolling, idle
windows, and background agents do not qualify. A random UUID in the local SQLite
database identifies the installation independently of signed-in accounts.

Daily uniqueness and event delivery are owned by Rust. Migration 49 appends
installation preferences and the durable daily event queue without changing
existing migrations. The frontend passes no activity details through IPC.
Requests use PostHog's HTTPS capture API, a ten-second timeout, and no redirects.
Retries preserve the event UUID, first-use timestamp, version, and environment.
Pending events expire after 35 days; daily tombstones remain for deduplication.
Disabling **Settings → Privacy → Share installation activity** clears pending
delivery and cancels the current request when possible. Already accepted events
cannot be recalled by the toggle. Re-enabling does not backfill disabled days.

## Production configuration

Production project: [EU Cloud project 275534](https://eu.posthog.com/project/275534).

The release workflows consume these repository variables:

| Variable | Value |
| --- | --- |
| `ORCHESTRATOR_POSTHOG_HOST` | `https://eu.i.posthog.com` |
| `ORCHESTRATOR_POSTHOG_TOKEN` | The project's public, write-only token |

Signed public and community releases explicitly set
`ORCHESTRATOR_ANALYTICS_ENABLED=1` and
`ORCHESTRATOR_ANALYTICS_ENVIRONMENT=production`. Signed rehearsals set the enable
flag to `0`. Unconfigured builds, debug builds, tests, and browser previews never
send. Enabled release validation rejects missing or invalid configuration.
Administrative or personal API keys must never enter an application build.

The wire payload is limited to event name, UUID, installation `distinct_id`,
timestamp, `active_date`, `app_version`, and `environment`. Privacy controls
`$process_person_profile=false`, `$geoip_disable=true`, `$ip=null`, and `ip=0`
disable person-profile creation and request IP/location enrichment.
The production project has **Discard client IP data** enabled (verified during
setup). Keep this setting enabled. PostHog still receives a network connection from the device; these
settings control analytics enrichment/storage, not network-level visibility.

## Dashboard

The source-controlled queries and insight definitions are in
[`scripts/analytics/dashboard.mjs`](../scripts/analytics/dashboard.mjs).
Use `uniqExact(distinct_id)` across each complete date window, filtered to
production `active_day`. Never sum daily unique counts for WAU or MAU.

| Card | Inclusive UTC activity dates |
| --- | --- |
| DAU | Today |
| WAU | Today minus 6 days through today |
| MAU | Today minus 29 days through today |
| Daily history | Daily distinct counts for the last 30 UTC dates |

These queries use the stored UTC activity date, so the project's display timezone
cannot change the metric boundary and delayed offline delivery is assigned to the
original day. Today's cards are partial. No fleet metrics or administrative
credentials are added to the app's local token/run analytics.

## Validation and limitations

Run `npm test`, `npm run lint`, `npm run test:release`, `npm run check:release`,
`npm run build`, and `cargo test --locked --manifest-path src-tauri/Cargo.toml`.
Default native tests use an isolated database and local HTTP servers; they never
contact PostHog. They cover concurrent initialization, persistence, midnight, backoff,
original retry payloads, expiry, cancellation, and permanent HTTP errors.

One PostHog project is sufficient. Live verification can use the existing project's
host/token with `ORCHESTRATOR_ANALYTICS_ENVIRONMENT=test`; all operator dashboard
queries filter to `production`. A separate test project is optional. Use disposable app data.
Open/focus repeatedly, restart, disable/re-enable, and exercise offline recovery.
Verify one logical event per UTC date, stable identity, the expected property
allowlist, no person profile, and no retained client IP or GeoIP properties.
Never label fixture events `environment=production`.

The ignored native test `live_capture_test_environment` exercises the actual
queue and HTTP client with disposable databases and forces `environment=test`.
To run it explicitly, set `RUN_POSTHOG_LIVE_TEST=1`, `POSTHOG_TEST_HOST`, and
`POSTHOG_TEST_PROJECT_TOKEN` (a public project token), then run:

```sh
cargo test --locked --manifest-path src-tauri/Cargo.toml live_capture_test_environment -- --ignored --nocapture
```

The printed fixture manifest contains synthetic IDs and expected counts for its
UTC activity date. This check passed against project 275534 on 2026-09-16:
ten requests, including four exact replays, produced six stored logical events.
PostHog SQL returned the expected distinct counts: DAU 1, WAU 2, MAU 3.
All six inspected events retained their original activity dates and stored only
the three application properties and the two privacy flags; no IP or location
properties were present. The project's `persons` table contained zero profiles.
Refreshing all four production dashboard tiles after ingestion kept DAU, WAU,
and MAU at zero and history empty, confirming that test events are excluded.

Final source validation on 2026-09-16 passed: all 1,472 frontend tests across 211
files (`--maxWorkers=1`), all 46 release tests, lint/generated bindings/architecture,
the frontend production build, and `cargo check --release --locked --lib` with
production analytics explicitly enabled. The seven default native analytics tests
and the separately invoked live-ingestion test also passed. Packaging, signing,
and installation/launch smoke testing of the final release artifact remain normal
release gates; this source review did not produce a signed distribution package.

Counts represent installations, not people. Clearing application data creates a
new ID; copying that data can share an ID. Device clock errors affect the UTC date.
At-least-once delivery can retry a successfully received event after a lost
acknowledgement; distinct-ID reporting remains unchanged. Opt-outs, offline devices,
and expired events undercount actual activity. A public write-only token cannot
prevent someone from submitting fabricated events; these are product metrics,
not a billing or security audit.

## Reapplying the dashboard

The live dashboard is [Orchestrator installation activity](https://eu.posthog.com/project/275534/dashboard/957136).
All four tiles were saved and verified on 2026-09-16. Each query ran successfully
in PostHog; the production project had no events, so the counts were zero and
history was empty. The UTC expression uses `toDate(toTimeZone(now(), 'UTC'))`:
PostHog's HogQL rejects the two-argument form of `toDate`.
Live ingestion was verified in the same project using only `environment=test`
events. No additional project or billing change is needed.
To preview the four saved insight definitions, run
`node scripts/analytics/setup-dashboard.mjs`.
To validate the SQL against PostHog and create/update the four tiles idempotently,
set `POSTHOG_PERSONAL_API_KEY` in a local shell and run
`node scripts/analytics/setup-dashboard.mjs --apply`.
Use a credential with query access and dashboard/insight read/write scopes, solely
for this setup step. Never put this credential in application release variables.
The script prints only the dashboard URL on success and verifies the saved tiles.
