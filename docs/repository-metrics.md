# Repository clone and download reporting

The **Public repository metrics** workflow retains GitHub's aggregate clone counts alongside existing release-download reports on the `download-metrics` branch. It runs daily at **04:41 UTC**, after successful signed-release workflows from `main`, and on manual dispatch from `main`. It never writes reports to the source branch or changes the application.

## One-time setup

1. Create a fine-grained GitHub personal access token restricted to **zachealy1/orchestrator** with repository **Administration: read** permission. No administration-write permission is needed. A suitably scoped GitHub App token is also supported if supplied securely by your own token-issuance workflow.
2. Store it in this repository's **Settings → Secrets and variables → Actions** as **`REPO_TRAFFIC_TOKEN`**. Do not paste the token into an issue, commit, workflow file or chat. Set an expiry and rotate it before expiry.
3. After the workflow changes are merged, run **Public repository metrics** manually from `main`. Confirm the run succeeds and inspect `download-metrics/clones/README.md`.

The normal job-scoped `GITHUB_TOKEN` continues to write the metrics branch and read public release assets. It does **not** provide the Administration: read permission required by the traffic endpoint. The traffic secret is used only by the trusted reporting job; ordinary pull-request CI receives no traffic credential. Forks and manual dispatches from non-main branches do not run this job.

The existing writer concurrency group is preserved. Both report types share one non-forced commit/push, so a concurrent branch update is rejected rather than overwritten. Repository name, numeric identity and the Git remote are checked before publishing.

## Retained files

Existing download files and snapshots retain their names and history. Clone records are separate:

| Path on `download-metrics` | Contents |
|---|---|
| `clones/history.json` | Permanent dated clone observations, coverage dates and latest collection health |
| `clones/daily.csv` | Every retained UTC day, clone count, daily unique cloners, status and observation time |
| `clones/monthly.csv` | Observed monthly clone totals, reported days, missing days and partial days |
| `clones/README.md` | Collection health, cumulative observed clones, monthly totals and recent daily activity |
| `clones/collections/*.json` | Timestamped normalized API observations or sanitized failure codes |

The first successful collection can backfill the available GitHub traffic window. Subsequent snapshots **replace the observation for the same UTC date**; rolling totals are never added together. Corrections downward are accepted, duplicate retries do not increase totals, and late/out-of-order snapshots cannot replace newer observations. Older rows are retained when they fall outside GitHub's window.

## Counts, gaps and partial data

- **Reported:** a daily count explicitly returned by GitHub after that UTC day ended. This includes an explicit zero. Later API corrections can still replace it.
- **Partial:** the latest observation was made during that same UTC day. It stays partial until GitHub returns a later observation, even if time passes.
- **Gap:** no daily count has been received. JSON uses `null`, CSV leaves numeric fields blank, and Markdown shows a dash. Omitted days are not inferred from the rolling total.

Monthly and cumulative figures are **observed clone totals for the retained interval**, not guaranteed lifetime totals. Missing and partial days are shown alongside them. A month with no observations has an unavailable total, not zero. The first or current month may cover only part of the calendar month.

Daily **unique cloners are not summed across dates**: the same person can occur on several days. Reports contain no names, emails, device identifiers, cloner identities or application-user telemetry. Clones are repository operations, not installer downloads, installations or active users. All these aggregate reports are public because the metrics branch is public.

## Failure and recovery

Missing/expired credentials, permission denial, rate limits, network failures and malformed responses produce a sanitized failed collection record. Existing observations are preserved, newly uncovered days are added as gaps, and the report displays its last attempt and last success. The workflow pushes that valid failure report **before exiting unsuccessfully**, so failure is visible both in Actions and in the report. No raw API error bodies, credential values or subprocess error output are published.

Download collection and clone collection run independently: failure of either does not discard the other valid report. Corrupt prior clone history fails closed and is not replaced. Fix the credential or connectivity problem and rerun the workflow; a later successful request can recover gaps still covered by GitHub's rolling window. Expired gaps remain unknown.

A workflow that never starts, cannot check out the repository, or cannot push cannot update its report. Check the last-attempt timestamp and Actions status if the report stops advancing. On recovery, missed dates are reconstructed as gaps or backfilled when the API still has them. Do not interpret a stale static report as a current zero.

## Local verification

Run `node --test scripts/release/clone-metrics.test.mjs` for overlap, UTC boundary, failure, persistence, reporting and synthetic-secret tests. `npm run test:release` includes these tests in normal CI. They use isolated temporary directories and fake responses; no remote writes or credentials are required.

For a local report only, securely supply `REPO_TRAFFIC_TOKEN` in the environment and run `node scripts/release/clone-report.mjs /absolute/path/to/a/temporary/metrics-directory`. This command writes local files and exits nonzero on collection failure; it does not commit or push. Do not run `store-download-report.mjs` casually: that command publishes to the metrics branch.

GitHub documents its rolling traffic window, daily UTC buckets and required permissions in the [repository traffic API](https://docs.github.com/en/rest/metrics/traffic#get-repository-clones). Traffic visibility and update frequency are described in [Viewing traffic to a repository](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository).
