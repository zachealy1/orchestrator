# Public beta acceptance record

Status: **not approved for signed installer publication** until every required gate below has evidence. Public source publication is independent of this installer checklist. Automated code checks do not replace clean-Mac and real update rehearsals.

Record app/engine versions, source SHA, final package SHA-256 values, tester, date, macOS version and CPU architecture for each run. Use dedicated repositories/branches only. Record every remote branch and commit; do not delete remote test branches without approval.

| Gate | Required evidence | Result |
|---|---|---|
| Developer ID + updater keys | Distinct keys; no secrets in bundle/frontend/log artifacts | Blocked: owner configuration required |
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
| Artifact inspection | codesign/spctl/stapler and signature checks on actual downloads; no private components/dev helpers | Blocked: signed final packages required |
| Reporting | Asset IDs, separate installer/update counts, removed/replaced assets, CSV; no app telemetry | Automated tests plus workflow rehearsal required |
| Security/licence/branding | CSP UI test, native permissions/link/content/file/redaction review, dependency audit and redistribution notices | Blocked: remaining native dependency advisories/maintenance warnings; security and redistribution review required. Production CSP shell/Settings/Analytics/menu rendering checked |

Do not mark blocked/manual gates passed on the basis of mocks, a build, or an unsigned local app launch. Keep CODEX_AUTO_RELEASES_ENABLED and BETA_REHEARSAL_APPROVED false until this record is reviewed. Failed or missing required integration credentials must remain a failed release check, never a skipped success.
