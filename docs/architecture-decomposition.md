# Architecture Decomposition

Implemented on the architecture refactor branch on 2026-08-02.

## Resulting boundaries

- `src/App.tsx` is a seven-line composition entry point. Application setup lives
  under `src/app`, while account, workspace, conversation, queue, notification,
  run, settings, browser, analytics, and subagent ownership lives under
  `src/features`.
- App-scoped services and bounded caches are created by `AppServices` and expose
  explicit invalidation and disposal. Feature caches are no longer mutable
  module globals.
- Run setup is represented by `RunCoordinator` lifecycle transitions and named
  preparation, persistence, browser, thread, turn, and rollback stages.
- Native Codex events enter through `CodexEventRouter`, which validates event
  envelopes before dispatching them to runtime ownership and reducers.
- Frontend persistence is split into domain repositories. Multi-write business
  operations execute through transaction-backed Rust commands.
- `src-tauri/src/lib.rs` is a 169-line bootstrap. Native implementation is split
  across Codex, Git, database, workspace, media/path, preflight, process,
  notification, browser, migration, and web-preview modules.
- Applied migrations 1-25 are immutable SQL resources with committed checksums.
  A compatibility test applies the full set and resolves it again as an existing
  SQLx database, covering the modified-or-missing migration startup failure.
- Tauri commands and DTOs are generated into `src/generated/tauri.ts` from the
  Rust command registry. Production raw `invoke()` calls are rejected by the
  architecture check.
- Virtuoso is the sole transcript virtualizer. TanStack Virtual remains only in
  code and diff previews.
- The former global App test harness is split into focused runtime suites and
  feature tests. Every test file is below 2,000 lines.

## Static comparison

| Surface | Before | After |
| --- | ---: | ---: |
| `src/App.tsx` | 21,332 | 7 |
| App integration test | 14,047 | 8 suites, each below 1,800 |
| `src/App.css` | 6,987 | 7-line style entry point |
| `src/db.ts` | 2,280 | Removed |
| Legacy transcript | 3,923 | Removed |
| `src-tauri/src/lib.rs` | 9,979 | 169 |

The composition runtime now owns 2 direct state hooks, 11 refs, and 25 effects,
down from 98 state hooks, 128 refs, and 60 effects in the former `App.tsx`.
`continueRunSetup` is a 285-line staged coordinator rather than an approximately
900-line workflow.

The remaining application composition runtime has a 15,900-line downward-only
ratchet. Large renderers have similar ratchets and should continue moving into
feature ownership when their behavior changes.

## Enforced checks

`npm run lint` now checks:

- TypeScript compilation;
- shared -> features -> app dependency direction;
- circular production imports;
- raw Tauri invocation;
- legacy transcript imports;
- transcript virtualizer ownership;
- production and test file-size guardrails;
- generated binding freshness.

Migration checksum, ordering, applied-database compatibility, transactional
rollback, and concurrent transition coverage run in the Rust test suite.

## Verification snapshot

- Frontend: 93 files and 718 tests passed.
- Rust: 116 tests passed with `--no-default-features`.
- Production TypeScript/Vite build passed.
- Architecture and generated-binding checks passed for 139 production modules.
- Rust formatting and repository diff checks passed.
- A read-only comparison against the existing macOS application database found
  zero checksum mismatches across applied migrations 1-25.

The production main JavaScript chunk is approximately 1.10 MB before gzip and
still triggers Vite's 500 kB warning. Route- and feature-level code splitting is
left as explicit follow-up work rather than being mixed into this
behavior-preserving refactor.
