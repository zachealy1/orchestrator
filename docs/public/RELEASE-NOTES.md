# Orchestrator 0.2.0-beta.3

Community beta for **Apple Silicon and Intel on macOS 15+**, ad-hoc signed and **not notarized by Apple**.

Download the [Apple Silicon installer](https://github.com/zachealy1/orchestrator/releases/download/v0.2.0-beta.3/Orchestrator_aarch64.dmg) or [Intel installer](https://github.com/zachealy1/orchestrator/releases/download/v0.2.0-beta.3/Orchestrator_x86_64.dmg). Open the disk image and drag Orchestrator into Applications. Read the [installation and first-launch guidance](https://github.com/zachealy1/orchestrator/blob/main/docs/public/INSTALLATION.md).

## Changes since beta.2

- **Workspace navigation:** switch between Chats, Files and Priority in the sidebar, with keyboard shortcuts, chat pagination and clearer workspace context.
- **GitLab reviews:** connect GitLab.com or self-managed HTTPS hosts and publish draft merge requests. Mixed GitHub/GitLab workspaces track each review through completion. Repositories without a connected destination retain local review.
- **Questions during work:** answer an agent's questions while work continues, including a free-text answer, without losing the surrounding transcript.
- **Streaming and tools:** more consistent activity labels, tool interfaces, rich results and streamed text. Hidden views pause unnecessary updates, streams are batched and Git refreshes adapt to activity.
- **Usage and account settings:** resumed runs recover token usage more reliably; eligible accounts can redeem available Codex usage resets from Settings. Update-check feedback clears when the account popup closes.
- **Git and Kanban fixes:** file references resolve to the active worktree, Git discovery and branch recovery are more robust, branch names preserve whole words, and newly finished cards append to In review.
- **Installation activity:** production builds send minimal daily installation activity to PostHog by default. Disable it in **Settings → Privacy → Share installation activity**; the [privacy guide](https://github.com/zachealy1/orchestrator/blob/main/docs/public/PRIVACY.md) lists the data collected.
- **Documentation:** five refreshed native macOS screenshots show the fictional Taskboard Demo with account details removed.

Installed beta.1 and beta.2 copies with the matching updater key can discover this release through the [beta feed](https://raw.githubusercontent.com/zachealy1/orchestrator/update-feed/beta.json). Unconfigured source builds and older 0.1.0 copies need manual installation. Back up important data before beta upgrades. Older apps may not open a database upgraded by this version; keep backups rather than downgrading an upgraded database.

## Validation and limitations

Required source checks apply before publication. The release workflow verifies the selected source commit, version, both architectures, bundled resources, ad-hoc signatures, updater signatures, installer artwork and artifact hashes. Public verification receipts accompany the installers.

A new manual testing campaign, clean-machine installation or two-version update rehearsal is not claimed for beta.3. Package receipts record `behavioralTesting: "not-performed"`. See the [acceptance record](https://github.com/zachealy1/orchestrator/blob/main/docs/release-acceptance.md) for scope and historical evidence.

macOS may require **Open Anyway** at first launch or ask for permissions again after an update. Updater signatures and checksums verify integrity, not Apple approval. Browser, Computer Use and Plugins remain experimental and can depend on separately installed upstream components.

The bundled engine, GitHub CLI and GitLab CLI use your own supported accounts. Provider usage limits and charges still apply.

Report reproducible issues through [public issues](https://github.com/zachealy1/orchestrator/issues/new/choose), without credentials, personal paths or private transcripts.
