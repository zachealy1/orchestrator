# Public beta acceptance record

Status: **not approved for installer publication** until every required gate below has evidence. The planned first release is a free, non-notarized community beta. Apple Developer ID/notarization is not a gate for that explicitly labelled distribution; independent update signatures and all other applicable gates remain required. Public source publication is independent of this checklist. Automated code checks do not replace clean-Mac and real update rehearsals.

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

Do not mark blocked/manual gates passed on the basis of mocks, a build, or a local app launch. Keep CODEX_AUTO_RELEASES_ENABLED and BETA_REHEARSAL_APPROVED false and COMMUNITY_BETA_APPROVED_SHA unset until the corresponding record is reviewed. Failed or missing required integration credentials must remain a failed release check, never a skipped success.

## 2026-09-08 community preparation checks

- JavaScript lockfile security updates: `npm audit` reports zero vulnerabilities, including development dependencies.
- Local preparation on macOS 26.6.2 / Apple Silicon passed 41 release-script tests, 214 Rust tests, lint/binding/architecture checks (no baseline increase), production frontend build and the official bundled-engine isolated install/restart test. The other network-download Rust test remains opt-in. Workflow validation passed with actionlint 1.7.12.
- A local non-notarized Apple Silicon DMG and updater archive passed actual package verification: strict ad-hoc signing, hardened runtime, version/identity/architecture, independent update signature, embedded public key, both runtime components and resource inspection. These are unshipped preparation artifacts, not clean-Mac acceptance or final release packages. SHA-256: DMG `1712ffe2d6dc1a20e0827390b746499e7547b55a56381e4ebe3f5b8e0c654907`; updater `b122a849e7ad2f3519926c5f503e7a5f20cb1a835a50b16d9704150727a93ba5`.
- The unchanged strict native lockfile audit still blocks publication. It reports `RUSTSEC-2026-0235` (`rkyv` 0.7.46), `RUSTSEC-2023-0071` (`rsa` 0.9.10), maintenance/unsoundness warnings and a yanked `spin` version. These are lockfile findings, not proof that every affected crate is in the macOS runtime. Inverse dependency queries do not show `rkyv` or `rsa` in the current selected target graph; review optional/transitive and platform dependencies before changing dependencies or audit policy. No advisory has been suppressed to pass the release.
- Source checks and local rehearsals do not approve either the four-platform clean-machine matrix or a two-version app update. Record final results and artifact hashes before setting publication approval.
