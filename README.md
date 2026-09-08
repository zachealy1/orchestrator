<p align="center">
  <img src="src/assets/brand/orchestrator-app-icon.svg" width="88" height="88" alt="Orchestrator app icon">
</p>

<h1 align="center">Orchestrator</h1>

<p align="center">
  A macOS workspace for AI-assisted development.<br>
  Plan tasks, work with agents and review changes in one place.
</p>

<p align="center">
  <a href="https://github.com/zachealy1/orchestrator/actions/workflows/ci.yml"><img src="https://github.com/zachealy1/orchestrator/actions/workflows/ci.yml/badge.svg?branch=main" alt="Source checks"></a>
  &nbsp;·&nbsp; <a href="LICENSE">MIT licensed</a>
  &nbsp;·&nbsp; macOS 15+
</p>

<p align="center">
  <a href="#feature-tour">Feature tour</a> ·
  <a href="#build-from-source">Build from source</a> ·
  <a href="#documentation-and-support">Documentation</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

> **Experimental community beta.** Source is public. The first release, **0.2.0-beta.1**, targets **Apple Silicon only** and is **not notarized by Apple**. See [Releases](https://github.com/zachealy1/orchestrator/releases) for the installer and [installation instructions](docs/public/INSTALLATION.md) before opening it. Installation and updates are manual; Intel packages and the in-app update feed are deferred. Automatic publishing remains paused.

Orchestrator is an independent project, not an OpenAI product. Browser, Computer Use and plugin integrations are experimental and may require separately installed upstream components.

## Your work, in context

Start with a prompt, keep the conversation alongside your workspace, and follow the agent's work as it happens.

[![A real Taskboard Demo conversation in Orchestrator, with the agent's response and prompt composer visible.](docs/assets/screenshots/chat.png)](docs/assets/screenshots/chat.png)

*Real tasks in a fictional local project. Account identity details are removed for privacy; task results and activity are genuine. Click any screenshot to view it at full size.*

## Feature tour

### Inspect file contents

Expand a workspace in the sidebar and select a file to read its contents beside your conversation. Syntax highlighting and line numbers make code and configuration easy to inspect without leaving the chat.

[![Taskboard Demo's expanded workspace file tree and package.json contents in the side-by-side file preview.](docs/assets/screenshots/file-contents.png)](docs/assets/screenshots/file-contents.png)

### Organise work with Kanban

Turn ideas into cards and follow each task from preparation through execution and review. Chat and Kanban share the same workspace, so you can choose the view that fits the work.

[![Taskboard Demo's Kanban board, showing named tasks at different stages of work.](docs/assets/screenshots/kanban.png)](docs/assets/screenshots/kanban.png)

### See what subagents are doing

Inspect a delegated task's original instruction, conversation and activity without losing the parent conversation.

[![The subagent inspector showing a submitted task prompt and a genuine review response for Taskboard Demo.](docs/assets/screenshots/subagents.png)](docs/assets/screenshots/subagents.png)

### Review changes before publishing

Browse changed files, inspect the diff and decide whether to approve the work or request changes. Repository-specific review keeps changes understandable in both single- and multi-repository workspaces.

[![A genuine Taskboard Demo code change in the local review drawer, with file navigation, diff and review controls.](docs/assets/screenshots/change-review.png)](docs/assets/screenshots/change-review.png)

### Understand your activity

Explore local run activity, token totals and outcomes by workspace and date range. Account usage limits are shown separately using the limits Codex actually reports for the selected plan.

[![Local run metrics and activity charts in Analytics, filtered to the fictional Taskboard Demo workspace.](docs/assets/screenshots/analytics.png)](docs/assets/screenshots/analytics.png)

*The screenshot shows demo-project activity, not personal account quotas or a performance benchmark.*

## More ways to work

- **Plans and Goals:** Review a proposed plan before implementation, or pursue an explicit longer-running goal.
- **Generated-image previews:** Explore concepts in the conversation; copy images into a project when you explicitly request an asset.
- **Multi-repository workspaces:** Give agents the workspace context and review changes repository by repository.
- **Keyboard navigation:** Use `⌘K` for actions, `⌘N` for a new chat and `⌘/` for shortcut help.
- **Optional integrations:** Explore Plugins, Browser and Computer Use with their [experimental requirements and limitations](docs/public/INTEGRATIONS.md).

## Build from source

You need macOS, Xcode Command Line Tools, **Node.js 24**, npm and **Rust 1.96.0**. Build each architecture on matching hardware. Normal AI tasks require your own supported Codex account; GitHub authentication is separate.

```sh
git clone https://github.com/zachealy1/orchestrator.git
cd orchestrator
npm ci
npm run tauri dev
```

Build hooks prepare the pinned official standalone Codex engine, GitHub CLI and third-party notices, verifying the runtime downloads. No private-repository access or publishing credentials are required. Ordinary Chat and repository workflows do not require the Codex desktop app, Homebrew or a separately installed Codex CLI. Orchestrator does not redistribute private ChatGPT components.

<details>
<summary>Run checks or create a local development build</summary>

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

A successful build does not establish public-release readiness. See the [contribution guide](CONTRIBUTING.md) and [release acceptance checklist](docs/release-acceptance.md).

</details>

## Installation and updates

Community installers are being prepared for `0.2.0-beta.1`, without an Apple Developer membership. They use ad-hoc app signing and a separate verified update signature, **not Apple notarization**. macOS may block first launch; read the [installation guide](docs/public/INSTALLATION.md) before deciding whether to open the app. Follow [Releases](https://github.com/zachealy1/orchestrator/releases) for availability.

The updater is designed around your choice: checking, downloading, and **Install and restart** are separate steps. Installation waits for owned tasks and consequential repository operations; it does not stop them automatically. The update feed is intentionally absent until the first complete verified release, and unconfigured source builds cannot check for updates. Update signatures authenticate the publisher's update key; they are not Apple approval.

Existing `0.1.0` installations will need one manual installation of the first updater-enabled beta. See [release operations](docs/releasing.md) for engine pinning, upgrade safeguards and the remaining publication gates.

## Documentation and support

- [Installation and updates](docs/public/INSTALLATION.md) · [Troubleshooting and recovery](docs/public/RECOVERY.md)
- [Privacy and local storage](docs/public/PRIVACY.md) · [Permissions and integrations](docs/public/INTEGRATIONS.md)
- [Public download and clone reports](https://github.com/zachealy1/orchestrator/tree/download-metrics) · [Reporting setup and definitions](docs/repository-metrics.md)
- [Report a bug](https://github.com/zachealy1/orchestrator/issues/new/choose) · [Report a vulnerability privately](SECURITY.md)
- [Contribute](CONTRIBUTING.md) · [Architecture](docs/architecture-decomposition.md) · [Screenshot capture notes](docs/assets/screenshots/README.md)

Orchestrator adds no application-user telemetry. Download reports use GitHub's aggregate asset counters: **downloads are not users or successful installations**. AI tasks and connected integrations still communicate with their providers; see the privacy guide before sharing sensitive work.

## Licence

Orchestrator's original source is [MIT licensed](LICENSE), copyright Zac Healy. Dependencies, bundled runtimes and third-party assets retain their own licences and notices. Packaging generates a third-party inventory; it does not relicense those components. `package.json` remains `private: true` to prevent accidental npm publication.
