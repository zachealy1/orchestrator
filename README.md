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

`npm run prepare:native-runtimes` packages the engine and GitHub CLI before Tauri development or release builds. The pinned engine version and official archive checksums live in `src-tauri/resources/codex-engine/release.json`. Packaging downloads only that official release and runs a credential-free compatibility probe. Build each architecture on matching hardware. If package resources are missing, first-use provisioning downloads and verifies the pinned release; use **Retry engine setup** to retry after an offline first launch.

The engine is stored in Orchestrator's app data directory under `codex-engine/versions/`. Explicit `ORCHESTRATOR_CODEX_BIN` overrides retain priority and are never modified. Normal desktop launches use the managed engine, regardless of other installations on PATH. Existing account profiles and the shared `~/.codex` profile retain their locations and authentication behavior.

### Engine status and models

- Settings shows the selected engine version and whether it is managed or explicitly overridden. Orchestrator does not check for, announce, download, or prepare newer Codex releases. Initial engine provisioning is separate and uses only the pinned release.
- Each app session keeps one engine version across all accounts and tasks. Existing engine integrity checks and recovery to a previous working engine remain in place. Previously prepared updates and their metadata are retained on disk for compatibility but are not activated on startup.
- Model discovery uses the signed-in profile's `model/list`, including its reasoning options. Catalogs refresh at startup, sign-in, account selection, every 15 minutes while visible, and after focus or connectivity returns (with a one-minute throttle). **Refresh models** remains available. Failed refreshes retain that account's last successful list for the current session; late responses from a different account never replace the current account's models.

Updating Orchestrator requires installing a new Orchestrator release. The existing Tauri configuration uses ad hoc signing; a publicly distributed Mac release still needs the project's Developer ID signing and notarization setup.

### Verification

```sh
npm run prepare:codex-engine
cargo test --manifest-path src-tauri/Cargo.toml codex_engine --lib
npx vitest run src/features/codex/useModelCatalog.test.tsx src/features/engine
npm run build
npm run check:bindings
```

The engine preparation command verifies the actual official executable without consuming model tokens or using a user's login. Tests cover first-use import without another installation, unsafe archives, compatibility failures, recovery, inert legacy update metadata, setup retry, account isolation, offline model refresh, and the absence of update controls and polling.
