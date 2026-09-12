# Public source and release operations

## One repository, separate release gates

`zachealy1/orchestrator` is the canonical home for MIT-licensed source, documentation, releases, issues and aggregate download reports. The community distribution supports Apple Silicon and Intel with independently signed in-app updates. Releases are manually dispatched; unattended engine releases remain paused. Never describe ad-hoc signing or an updater signature as Apple approval.

The next community release is `0.2.0-beta.2`. Synchronize package.json, package-lock.json, Cargo.toml, Cargo.lock and tauri.conf.json. Release artifacts belong to this repository's Releases page. The fixed feed is `https://raw.githubusercontent.com/zachealy1/orchestrator/update-feed/beta.json`. It is created only after the first complete verified release, not as an empty placeholder and not through GitHub's latest-release shortcut.

## Repository protections

Protect `main` and `release`: require pull requests and the `checks` status, strict up-to-date checks, code-owner review for release-sensitive changes, resolved conversations, no force pushes or deletion. Apply protection to administrators. Keep `.github/CODEOWNERS` current. Community preparation PRs target `release`, followed by a `release` → `main` PR. All publication workflows execute from `main`; the separate notarized and engine-upgrade workflows retain their existing gates. Leave the general approval count at zero so narrowly scoped engine-pin PRs can merge automatically after required validation; code-owner review remains required for owned workflow/runtime security files. A solo maintainer cannot approve their own code-owned changes; obtain an independent reviewer or use a separately approved, auditable protection-policy change, never a blanket automation bypass.

Protect version tags against updates and deletion. Permit new release tags from the publishing job without permitting replacement. The `update-feed` and `download-metrics` data branches are automation outputs, not alternate application source branches. Publishing never writes directly to main.

Enable secret scanning, push protection, dependency alerts and private vulnerability reporting where supported. Require approval for outside-contributor Actions runs. Public pull requests receive only a read-only token and no signing/test credentials; never use `pull_request_target` to execute contributor code. Keep workflow actions pinned to reviewed commit SHAs.

## Secure configuration

Protected `engine-upgrades` and `release-smoke` environments allow only workflow executions from `main`. `public-beta-signing` and `public-beta-publishing` must allow `main`. Existing permission for `release` does not authorize community publication: the workflow and staging guards require `main`. Require a maintainer's approval for signing/publication; branch selection does not remove that approval or branch protection.

- Engine automation App, installed only on this repository: `ENGINE_AUTOMATION_APP_ID`, `ENGINE_AUTOMATION_APP_PRIVATE_KEY`; repository-scoped contents/PR/actions permissions. It creates narrowly scoped PRs and dispatches validation/publication. No administrative bypass permission.
- Publishing and report jobs use their job-scoped `GITHUB_TOKEN` with contents-write access. No cross-repository publishing App or credential is needed.
- Only the notarized workflow requires Apple credentials in the signing environment: `APPLE_CERTIFICATE` (base64 Developer ID Application P12), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID`. The community workflow neither receives nor uses them.
- Separate updater key: `TAURI_SIGNING_PRIVATE_KEY` and non-empty `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in the signing environment; matching `ORCHESTRATOR_UPDATER_PUBLIC_KEY` repository variable. Back up private keys securely. Never put secrets in VITE-prefixed variables. Consolidation does not rotate keys.
- Dedicated release-smoke credentials (`RELEASE_TEST_CODEX_AUTH_JSON`, `RELEASE_TEST_MODEL`) apply only to the separate notarized/engine-upgrade validation workflow. The community workflow does not require or use an AI test account.
- Keep `CODEX_AUTO_RELEASES_ENABLED=false` and `BETA_REHEARSAL_APPROVED=false` for the deferred notarized automation. `COMMUNITY_BETA_APPROVED_SHA` is obsolete and is not read by the community release path.

All Actions logs and uploaded rehearsal packages must be treated as **public**. Signing subprocess output and credentialed transcripts are withheld, including failure paths, rather than relying only on GitHub masking. Synthetic-secret tests guard that behavior. Do not upload profiles, private audit reports, source worktrees or raw smoke-test output. Debug sensitive failures locally using dedicated credentials; use private vulnerability reports for security details.

## Free community publication

For beta.2, the maintainer reported manual testing on 2026-09-12 and requested no additional application-testing campaign or release rehearsal. Keep the repository's existing required CI checks. A manual dispatch selects the exact source commit to publish from `main`, after the preparation PR merges into `release` and the release PR merges into `main`. GitHub's existing branch and signing/publishing environment access controls still apply; approval alone is not evidence of testing. The separate notarized workflow retains its own validation policy.

This path uses standard public GitHub-hosted macOS runners and draft GitHub Release assets for package handoff. It requires no Apple account, paid runner, artifact-storage purchase, download service or AI test account. Keep the repository public and do not substitute larger runners. See [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

1. Reuse the existing `ORCHESTRATOR_UPDATER_PUBLIC_KEY` variable and `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets in `public-beta-signing`. Do not rotate the key: released clients embed its public half. No Apple credentials are supplied to community jobs.
2. Synchronize the application version (keep `0.2.0-beta.2` for this release), then merge preparation into `release` and `release` into `main` through ordinary pull requests. Preserve required reviews and the `checks` job. Record the resulting main SHA and wait for its required checks, then dispatch **Community public beta** using the `main` workflow ref and that exact 40-character SHA. There is no rehearsal input, separate testing-approval SHA, validation job or dedicated-account requirement.
3. The workflow creates a draft `community-build-<run-id>-<attempt>` for package handoff. Standard Apple Silicon and Intel runners build explicit ad-hoc signatures, hardened runtime, DMGs and Tauri updater archives. Build preparation validates bundled files without executing the engine. Package inspection checks identity, version, architecture, bundled resources, updater signatures and hashes; it does not launch the application or run behavioral tests.
4. Each architecture uploads only its DMG, updater archive, signature, checksum file and package receipt. Receipts record `behavioralTesting: "not-performed"` for the packaging job, which performs no separate installer or update rehearsal. This does not negate maintainer-reported manual testing in the acceptance notes. Profiles, logs and source worktrees are never uploaded. Drafts are retained and never overwritten with different bytes.
5. After both builds finish, publication rechecks the source-bound receipts and uploaded hashes. It creates an immutable versioned release at the selected SHA, then creates or advances `beta.json` on `update-feed` with both `darwin-aarch64` and `darwin-x86_64`. The manifest contains the actual signature text and the fixed versioned GitHub asset URLs. A build/upload failure leaves the previous feed unchanged; concurrent publication cannot force-overwrite it.
6. Release notes describe package integrity verification and the maintainer's manual-testing report without claiming an installer or update rehearsal. The app is not notarized by Apple. Verify the public release has all ten expected assets, tag and receipts match the final main SHA, README download URLs resolve, and the feed contains both published architecture packages with their verified signatures. **Public repository metrics** follows a successful publication from `main` through its existing completion hook; confirm that run succeeds. Keep unattended Codex publication disabled.

If packaging fails, leave publication and the feed untouched. If publication succeeds but feed creation fails, record the partial result and recover only the feed step after re-verifying the public tag, all assets, receipts, signatures and manifest URLs. Do not rerun the publisher against an already public version, replace assets or force-update the feed.

The first manual `0.2.0-beta.1` release remains immutable. Installed copies that already contain the matching public key can discover a newer feed release; `0.1.0` or unconfigured source builds need manual installation. No one-time reinstall is required solely because the first beta was distributed through a manual download.

The shared packager defaults to `notarized`; only `RELEASE_DISTRIBUTION=community` selects the free path. Unknown modes fail closed. Community releases remain beta-labelled. A previously notarized feed cannot be silently replaced with community packages.

## Developer ID/notarized rehearsal and publication

1. Complete [release acceptance](release-acceptance.md), dependency security review, licensing and branding checks. Do not suppress failed gates automatically.
2. Merge reviewed source, then dispatch **Signed public beta** from main using its exact 40-character source SHA and `rehearsal=true`. Validation runs on macOS 15/26 and ARM/Intel; separate trusted signing jobs build both architectures.
3. Download the rehearsal artifacts and test on clean Macs. These artifacts are publicly accessible, not private test storage. Verify Developer ID, hardened runtime, notarization and package contents on the actual downloaded DMG and updater archive.
4. Record artifact hashes and the tested SHA in a sanitized acceptance record; keep account details and raw logs outside the public repository. Test old-to-new updates, all background-work safety gates and real Git operations in dedicated test repositories.
5. Deliberately approve `BETA_REHEARSAL_APPROVED`, then dispatch the same source SHA with `rehearsal=false`. The workflow revalidates and rebuilds; signatures/timestamps may change, so verify final downloaded packages too.
6. The publisher verifies the version at that SHA and main ancestry, rejects conflicting tags and published versions, and creates the tag at the **tested SHA**, never current main. Draft uploads can resume only with byte-identical assets; replacements are forbidden.
7. Only after both architectures and all uploaded hashes pass does it expose the release and update `beta.json` on `update-feed`. The feed update is one non-forced Git ref change based on the previously read revision. Missing assets, concurrent publication or a stale revision leave the previous feed unchanged. A completed release without a feed advance requires explicit maintainer review, not overwriting the feed or assets.

## Automatic stable Codex upgrades

After a notarized beta and its acceptance review, enable `CODEX_AUTO_RELEASES_ENABLED` deliberately. The hourly watcher accepts only newer stable official releases with both macOS archives and upstream SHA-256 metadata. Already processed candidate PRs are not duplicated. Failed/closed candidates need maintainer-directed recovery.

A standalone trusted-base guard permits only the engine pin and synchronized app-version fields. Credential-free engine probes, version-specific consumed-protocol comparison, source/Rust/security/binding checks and required isolated Plan/Goal tests gate merging. Never automatically rewrite app behavior, weaken tests or expand the allowlist to make a candidate pass.

The runtime is a version-matched pair: `codex` and `codex-code-mode-host`. Pin and verify the official archive checksums for both components on both architectures. Build preparation, native provisioning and final-package checks must preserve both executables as siblings. Community build preparation and packaging use file-integrity inspection only; engine-upgrade validation and normal runtime activation retain the executable probe. The credential-free probe launches both executables, starts an ephemeral thread and executes a harmless read-only command; inventory responses alone do not prove the tool runtime can start. Missing hosts, startup failures and host warnings block activation. Required authenticated smoke tests still verify model-driven tool execution. Legacy single-executable caches remain on disk and are replaced by a new complete runtime slot on the next application launch, never underneath active tasks.

The merge step rejects a changed main base or candidate head. The signed workflow then validates the exact merged commit again before packaging/tagging. Required main checks and reviews still apply; lack of approval blocks automation safely. Failures update one sanitized public tracking issue with workflow status, never credentials or private transcripts. Security-sensitive detail belongs in a private advisory. Pause with the variable; correct a released problem with a higher version rather than silently downgrading.

## Public download reports

The daily and successful-publication workflow reads release-asset counters and writes Markdown, totals CSV, observed daily-change CSV and timestamped snapshots to `download-metrics`. It validates the exact repository name and numeric identity, preserves that branch's history and uses asset IDs to distinguish replaced files. Missing assets retain historical totals; counter decreases are flagged, never rendered as negative new downloads.

Counts mean **downloads**, not users, installations or active users. Verification and retries count. No app identifiers or telemetry are collected. `daily.csv` sums observed increases by UTC snapshot date, not exact event timestamps; initial lifetime totals are excluded. Both reports and GitHub's underlying counters are public.

## Recovery and compatibility

The first updater-enabled beta requires a manual install over 0.1.0. Downloads are opt-in and installation is separate. Keep old installers available. The managed engine is session-pinned, and a failed activation retains its verified predecessor with a visible warning.

Applied SQL migrations remain immutable. Future schema changes make a SQLite-aware `VACUUM INTO` backup; newer databases are rejected by older code. Prefer a higher-version corrective release, not an automatic database downgrade. Account data, previews, drafts and worktree bindings must survive updates.

## References

- [GitHub visibility and exposed Actions history](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility)
- [GitHub Actions security](https://docs.github.com/en/actions/reference/security/secure-use)
- [Tauri updater](https://v2.tauri.app/plugin/updater/) and [macOS signing](https://v2.tauri.app/distribute/sign/macos/)
- [Codex app-server](https://learn.chatgpt.com/docs/app-server)
- [GitHub release-asset counters](https://docs.github.com/en/rest/releases/assets)
