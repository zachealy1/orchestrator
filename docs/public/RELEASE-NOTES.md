# Orchestrator 0.2.0-beta.1

First experimental community download for **Apple Silicon Macs**. This free release is ad-hoc signed, **not notarized by Apple**, and distributed outside the Mac App Store.

Download **Orchestrator_aarch64.dmg**. Read the [installation and macOS first-launch instructions](https://github.com/zachealy1/orchestrator/blob/main/docs/public/INSTALLATION.md). The published checksums verify download integrity, not Apple approval. Never disable Gatekeeper globally.

**Manual installation and updates only.** No automatic update feed or Intel installer is published with this beta. Future versions will be available on the Releases page. Finish active work, quit the app and replace it in Applications. Existing 0.1.0 users also install manually; back up important data first. Application replacement does not intentionally erase chats, account profiles, preferences, generated previews or worktree bindings.

## Included

- Chat, Plans and Goals for working with coding agents.
- Kanban task management, subagent inspection, generated-image previews and change review.
- Single- and multi-repository workspaces, Git workflows and local activity analytics.
- A bundled, version-pinned Codex engine and GitHub CLI; use your own supported accounts. AI usage is subject to your account's limits or charges.

The bundled engine includes the matching Code Mode host, so tool execution does not depend on a missing development runtime component. Installation and startup validate both components before activation.

Browser, Computer Use and Plugins remain experimental. Some capabilities require separately installed upstream components; they are not all included in the standalone app. See the integration guide.

## Testing and limitations

The maintainer reports having tested the app and approved this experimental release on 2026-09-08. This is **not** a claim of clean-machine testing on macOS 15 and 26, Intel validation, or an old-to-new in-app update rehearsal. Automated source tests and actual package checks are separate evidence, recorded in the release verification receipt and repository acceptance record.

Minimum system: Apple Silicon, macOS 15+. The local packaging environment is macOS 26.6.2. Intel, Windows and Linux installers are not included. Browser, Computer Use and plugin capabilities depend on upstream components and permissions and remain experimental.

Known dependency maintenance debt is recorded in the [acceptance record](https://github.com/zachealy1/orchestrator/blob/main/docs/release-acceptance.md); this is not a claim of a warning-free full-lockfile audit. Report reproducible problems through [public issues](https://github.com/zachealy1/orchestrator/issues/new/choose), without credentials, personal paths or private transcripts.
