# Orchestrator

An independent, MIT-licensed macOS workspace for AI-assisted development. Orchestrator brings Chat, Plans, Goals, Kanban, subagents, generated-image previews, repository review and account usage limits into one desktop application.

## Release status — source first

**Signed installers are not yet available.** The source is available ahead of the first signed beta, `0.2.0-beta.1`. Signing, dependency-security review and clean-Mac installation/update acceptance remain release gates. Automatic publishing is paused. Build success or public source access does not mean the app is ready for end-user distribution.

The supported release target is macOS 15 and later on Apple Silicon and Intel. Browser, Computer Use and plugin APIs are **experimental** and can depend on separately installed upstream components. Orchestrator is not an OpenAI product and does not redistribute private ChatGPT components.

- [Installers and release notes](https://github.com/zachealy1/orchestrator/releases) — pending the signed beta
- [Installation and updates](docs/public/INSTALLATION.md)
- [Privacy and local data](docs/public/PRIVACY.md)
- [Permissions and experimental integrations](docs/public/INTEGRATIONS.md)
- [Troubleshooting and recovery](docs/public/RECOVERY.md)
- [Public download reports and CSV](https://github.com/zachealy1/orchestrator/tree/download-metrics)
- [Report a bug](https://github.com/zachealy1/orchestrator/issues/new/choose) · [Report a vulnerability privately](SECURITY.md)

## Build from source

Use macOS with Xcode Command Line Tools, Node.js 24, npm and Rust 1.96.0. Build each architecture on matching hardware. Source builds need development tools; eventual signed installers will not.

```sh
git clone https://github.com/zachealy1/orchestrator.git
cd orchestrator
npm ci
npm run tauri dev
```

Tauri's build hooks download the pinned official standalone Codex engine and GitHub CLI, verify their checksums, and prepare third-party notices. No private-repository access or publishing credentials are required. Normal tasks need your own supported Codex account; GitHub authentication is separate.

```sh
npm run lint
npm test
npm run test:release
npm run check:release
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
# Local ad-hoc package for development, not public distribution:
npm run tauri build -- --bundles app
```

## Engine and app updates

The packaged app includes a pinned standalone Codex engine. Ordinary Chat and repository workflows do not require the Codex desktop app, Homebrew or a separately installed CLI. Each app session keeps one engine version. A newer app provisions and verifies its bundled pin before activation, preserving the previous engine for recovery. Explicit `ORCHESTRATOR_CODEX_BIN` overrides remain supported. Model lists refresh automatically per account.

App updates use a signed, fixed [beta feed](https://raw.githubusercontent.com/zachealy1/orchestrator/update-feed/beta.json). The feed is intentionally absent until the first complete signed release. Updates are checked periodically, but download and **Install and restart** are separate user actions in the account menu, also accessible when signed out. Installation waits for all owned work and consequential repository operations to finish; it never stops tasks automatically.

Existing `0.1.0` installations need one manual installation of the first signed beta. Unconfigured source builds show a configuration error when checking updates; no signing secret ships in the source. See [release operations](docs/releasing.md) and the [acceptance checklist](docs/release-acceptance.md).

## Data and download reporting

Chats and activity are stored locally in SQLite; account profiles and generated previews retain their documented local storage locations. Back up important work and review agent changes. The application adds no user telemetry. Public statistics use GitHub's aggregate release-asset counters and describe **downloads**, not people, successful installations or active users. Retries and automated verification can contribute.

## Contributing and licence

See [CONTRIBUTING.md](CONTRIBUTING.md). Orchestrator's original source is available under the [MIT licence](LICENSE), copyright Zac Healy. Dependencies, bundled runtimes and third-party assets retain their own licences and notices. Packaging generates an inventory under `src-tauri/resources/notices/`; it does not relicense third-party code. `package.json` intentionally remains `private: true` to prevent accidental npm publication.
