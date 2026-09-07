# Orchestrator

A token-aware desktop client for local Codex runs. Orchestrator manages repo workspaces, performs advisory preflight checks, structures prompts, starts Codex through `codex app-server`, streams run activity, and stores local analytics in SQLite.

## Stack

- Tauri 2 desktop shell
- React 19 + TypeScript + Vite frontend
- SQLite via the official Tauri SQL plugin
- Codex integration through `codex app-server --listen stdio://`

## Development

Install Rust first if `cargo` is not available:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Then install dependencies and run the app:

```sh
npm install
npm run tauri dev
```

Frontend-only checks:

```sh
npm test
npm run build
```

When running inside Tauri, the app creates `app.db` in the platform app data directory and applies migrations for workspaces, tasks, runs, raw run events, token snapshots, preflight results, and recommendations.

## Managed Codex engine

On Apple silicon and Intel Macs, the packaged app includes a compatible standalone Codex engine. Users do not need the Codex desktop app, Node.js, Homebrew, or a separately installed Codex CLI. Add an account and sign in using Orchestrator's existing account controls.

`npm run prepare:native-runtimes` packages the engine and GitHub CLI before Tauri development or release builds. The pinned engine version and official archive checksums live in `src-tauri/resources/codex-engine/release.json`. Packaging downloads only that official release and runs the same credential-free compatibility probe used for updates. Build each architecture on matching hardware. If package resources are missing, first-use provisioning downloads and verifies the pinned release; use **Check for updates** to retry after an offline first launch.

The engine is stored in Orchestrator's app data directory under `codex-engine/versions/`. Explicit `ORCHESTRATOR_CODEX_BIN` overrides retain priority and are never modified. Normal desktop launches use the managed engine, regardless of other installations on PATH. Existing account profiles and the shared `~/.codex` profile retain their locations and authentication behavior.

### Updates and models

- Orchestrator checks the official `openai/codex` GitHub latest stable release at startup and every six hours while visible, and checks after returning to the app or reconnecting if a check is due. Settings includes the running version, last successful check, release availability, and **Check for updates**. Offline failures preserve the current engine and saved release metadata.
- **Prepare update** downloads the release for this Mac, verifies its published SHA-256 digest, and checks the exact engine version, initialization, permissions, collaboration modes, and model-list protocol in an isolated temporary profile. A newer release is a candidate until that compatibility check passes. Prereleases, missing checksums, and unexpected download sources are rejected.
- Updates use separate immutable version directories and an atomic pending pointer. The running app keeps one engine version across all accounts and tasks. A prepared update is activated only on the next launch, after another integrity and compatibility check. Failed checks retain the previous engine; its files remain available for fallback. The app never stops active tasks or restarts itself to apply an update.
- Model discovery uses the signed-in profile's `model/list`, including its reasoning options. Catalogs refresh at startup, sign-in, account selection, every 15 minutes while visible, and after focus or connectivity returns (with a one-minute throttle). **Refresh models** is independent of engine updates. Failed refreshes retain that account's last successful list for the current session; late responses from a different account never replace the current account's models.

The update mechanism here manages the Codex engine. Updating Orchestrator itself still requires installing a new Orchestrator release. The existing Tauri configuration uses ad hoc signing; a publicly distributed Mac release still needs the project's Developer ID signing and notarization setup.

### Verification

```sh
npm run prepare:codex-engine
cargo test --manifest-path src-tauri/Cargo.toml codex_engine --lib
npx vitest run src/features/codex/useModelCatalog.test.tsx src/features/engine
npm run build
npm run check:bindings
```

The engine preparation command verifies the actual official executable without consuming model tokens or using a user's login. Tests cover first-use import without another installation, numeric release ordering, unsafe archives, compatibility failures, staged activation, rollback, account isolation, offline model refresh, and update controls.
