# Tauri SQLite Starter

A Tauri 2 desktop app scaffold with React, TypeScript, Vite, and SQLite.

## Stack

- Tauri 2 desktop shell
- React 19 + TypeScript + Vite frontend
- SQLite via the official Tauri SQL plugin

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

The frontend can also be previewed without the Tauri runtime:

```sh
npm run dev
```

When running inside Tauri, the app creates `app.db` in the platform app data directory and applies the startup migration automatically.
