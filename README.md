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

## Codex Prerequisites

Orchestrator expects the `codex` CLI to be available on `PATH`. Use the in-app Codex controls to connect, check auth, and start login. If login cannot be completed in-app, run:

```sh
codex login
```
