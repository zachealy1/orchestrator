# Public beta acceptance record

## Community beta.2 acceptance — 2026-09-12

The maintainer reports having manually tested the release-branch changes and explicitly requested publication of **0.2.0-beta.2** for Apple Silicon and Intel on macOS 15+. Accept that report without adding another application-testing campaign or release rehearsal. The report does not identify individual scenarios, hardware, macOS versions, a clean-machine installation, or a two-version updater rehearsal; none of those results are inferred.

The selected candidate is `3f0704303ddc2ef8be010d477ddc998176a7ed26`. Release preparation changes documentation, screenshots and publication guards, while retaining version 0.2.0-beta.2. Merge preparation into `release`, then merge `release` into `main` through ordinary pull requests and required `checks`. Publish from the resulting exact main SHA, which the version tag, workflow checkout and generated package receipts must all identify.

Packaging verifies source/version/architecture, bundled resources, ad-hoc signing, independently signed updater packages, installer artwork and uploaded hashes. Each generated receipt retains `behavioralTesting: "not-performed"`: that field describes the packaging job, which does not launch the installer or perform an update rehearsal. It does not negate the maintainer's manual-testing report. Integrity results are generated from the actual packages, not asserted in advance.

Existing required CI, code-owner review rules and signing/publication environment approvals remain in effect. Community publication requires no Apple account, notarization, dedicated AI test account or separate testing-approval SHA. Publish both architectures before creating the updater feed; preserve beta.1 and all published artifacts unchanged. Screenshot recapture is documentation work using the isolated fictional demo, not a release-acceptance test campaign.

The earlier records below remain historical evidence and limitations. Their pending/manual gates apply to the distributions described there, not additional gates for this community release. The separate notarized and automated engine-upgrade workflows retain their own validation requirements.

## Manual experimental beta approval — 2026-09-08

The maintainer reports having tested the application and explicitly requested release after the Apple-Silicon-only/manual-update option was explained. Accept that report for this limited distribution; no additional account credentials or hardware matrix is required. Do not infer the tester's macOS version, specific scenarios or a clean-machine/two-version update pass from that statement.

- Publish only the Apple Silicon installer, its source-bound verification receipt and checksums, after required source checks and actual package verification pass.
- No Intel artifact, no update feed, no unattended publishing. The existing updater-enabled workflows retain their gates and unapproved status.
- Preserve normal main-branch review/protection and source integrity checks. A manual approval is specific to one exact SHA and does not authorize an updater-enabled publication.
- Minimum macOS 15 is a build requirement; local package verification on macOS 26.6.2 is not validation of every supported OS version.

### Dependency applicability review for this limited release

The full native lockfile audit remains non-zero. Inspection on 2026-09-08 used the locked Apple Silicon normal/build dependency graph (`cargo tree --locked --target aarch64-apple-darwin --edges normal,build`). `rkyv` 0.7.46 / RUSTSEC-2026-0235, `rsa` 0.9.10 / RUSTSEC-2023-0071, `glib` 0.18.5 / RUSTSEC-2024-0429 and `proc-macro-error` 1.0.4 are absent from that graph, so these findings do not describe code compiled into this macOS package. They remain relevant to other feature/target configurations and the full lockfile audit; no global ignore is added.

Known maintenance debt in the selected graph: `paste` 1.0.15 is a Specta/Tauri compile-time macro dependency; the five `unic-*` 0.9 crates are Tauri/urlpattern dependencies. The reported notices concern lack of maintenance, not an identified runtime vulnerability. These remain disclosed follow-up work rather than being labelled resolved. The yanked SQLite/flume dependency `spin` 0.9.8 has been updated to the compatible 0.9.9 patch; no blanket audit exemption is introduced. New vulnerability findings require a new applicability review before another release.

## Historical deferred acceptance matrix

Record app/engine versions, source SHA, final package SHA-256 values, tester, date, macOS version and CPU architecture for each run. Use dedicated repositories/branches only. Record every remote branch and commit; do not delete remote test branches without approval.

| Gate | Required evidence | Result |
|---|---|---|
| Community updater key | Independent key; secure backup; no secrets in bundle/frontend/log artifacts | Configured and signature-verified on 2026-09-08; final package inspection pending |
| Developer ID + notarization | Required only for the separate notarized workflow | Not applicable to community beta; Apple credentials remain unconfigured |
| Dedicated test account | Required isolated authenticated Plan/Goal smoke checks | Blocked: release-smoke account/model credentials are not configured |
| Public source and unified distribution | MIT source, audited history, consolidated documentation, public aggregate reports | Source audit and consolidation are separate from installer approval; no installer or manifest has been published |
| Clean Apple Silicon installation | macOS 15 and 26, no dev tools/profile; first sign-in | Blocked: clean-machine testing required |
| Clean Intel installation | macOS 15 and 26, no dev tools/profile; first sign-in | Blocked: clean-machine testing required |
| Chat, Plan, Goals, subagents | Prompts, approval/edit/reject, continuations, stopping, history after restart | Pending signed-build manual test |
| Kanban | Create/edit/duplicate, start/retry/resume, review, request changes, archive/cleanup | Pending signed-build manual test |
| Images | Preview-only concepts, intentional project assets, edits, history | Pending signed-build manual test |
| Plugins, Browser, Computer Use | Existing features and missing-runtime/permission errors remain usable and documented | Pending signed-build manual test |
| Analytics and navigation | Account limits, local filters, shortcuts, state preservation | Pending signed-build manual test |
| Single/multi-repository Git | Harmless change, diff selection, each commit/push combination, exact remote SHA and target isolation | Pending dedicated repo/branch test |
| Update UI | Signed-out/in access; notification dismissal across navigation; keyboard; progress; retry; separate restart | Partial: account-menu placement, manual configuration error/link, navigation and keyboard palette checked in ad-hoc production rehearsal; signed-out states covered by component tests; signed update rehearsal pending |
| Safe installation | Hidden runs/subagents, active Goals, queued starts, approvals, Kanban/publication/Git all block; no automatic stops | Pending signed-build manual test |
| Data and engine upgrade | Old→new selects pinned engine; chats/accounts/preferences/drafts/images/worktrees preserved | Pending two-version rehearsal |
| Update failure cases | Offline/interrupted/invalid signature/wrong architecture/withdrawn candidate/permission error | Pending two-version rehearsal |
| Engine failure | Corrupt/incompatible bundle gives explicit recovery warning, session immutable | Automated tests plus signed rehearsal required |
| Release races | Duplicate upstream, main changed, one architecture fails, partial upload, feed compare-and-swap conflict | Automated tests plus workflow rehearsal required |
| Artifact inspection | Community: strict ad-hoc codesign, hardened runtime, updater signature, identity, architecture and runtime resources on actual downloads. Notarized: additionally Developer ID/spctl/stapler | Pending final packages from both architectures |
| Reporting | Asset IDs, separate installer/update counts, removed/replaced assets, CSV; no app telemetry | Automated tests plus workflow rehearsal required |
| Security/licence/branding | CSP UI test, native permissions/link/content/file/redaction review, dependency audit and redistribution notices | Blocked: remaining native dependency advisories/maintenance warnings; security and redistribution review required. Production CSP shell/Settings/Analytics/menu rendering checked |

In the rows above, “signed-build” testing means the actual selected distribution's packages, including an ad-hoc app plus independently signed updater for community beta. Community acceptance must additionally record first-launch Open Anyway behaviour and any recurring Accessibility/Screen Recording prompts after updates on both supported architectures and macOS versions. Never turn off Gatekeeper globally.

These historical blocked/manual results have not been marked passed. CODEX_AUTO_RELEASES_ENABLED and BETA_REHEARSAL_APPROVED remain false for the separate notarized automation. The current community policy does not require COMMUNITY_BETA_APPROVED_SHA or authenticated integration checks.

## 2026-09-08 community preparation checks

- JavaScript lockfile security updates: `npm audit` reports zero vulnerabilities, including development dependencies.
- Local preparation on macOS 26.6.2 / Apple Silicon passed 41 release-script tests, 214 Rust tests, lint/binding/architecture checks (no baseline increase), production frontend build and the official bundled-engine isolated install/restart test. The other network-download Rust test remains opt-in. Workflow validation passed with actionlint 1.7.12.
- A local non-notarized Apple Silicon DMG and updater archive passed actual package verification: strict ad-hoc signing, hardened runtime, version/identity/architecture, independent update signature, embedded public key, both runtime components and resource inspection. These are unshipped preparation artifacts, not clean-Mac acceptance or final release packages. SHA-256: DMG `1712ffe2d6dc1a20e0827390b746499e7547b55a56381e4ebe3f5b8e0c654907`; updater `b122a849e7ad2f3519926c5f503e7a5f20cb1a835a50b16d9704150727a93ba5`.
- At preparation time, the strict native lockfile audit blocked the updater-enabled workflows. It reported `RUSTSEC-2026-0235` (`rkyv` 0.7.46), `RUSTSEC-2023-0071` (`rsa` 0.9.10), maintenance/unsoundness warnings and a yanked `spin` version. See the subsequent target-specific review and `spin` patch above. No advisory has been globally suppressed to pass the release.
- Source checks and local rehearsals do not approve either the four-platform clean-machine matrix or a two-version app update. Record final results and artifact hashes before setting publication approval.
