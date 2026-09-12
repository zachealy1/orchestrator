# Orchestrator 0.2.0-beta.2

Community beta for **Apple Silicon and Intel on macOS 15+**, ad-hoc signed and **not notarized by Apple**.

Download the [Apple Silicon installer](https://github.com/zachealy1/orchestrator/releases/download/v0.2.0-beta.2/Orchestrator_aarch64.dmg) or [Intel installer](https://github.com/zachealy1/orchestrator/releases/download/v0.2.0-beta.2/Orchestrator_x86_64.dmg). Open the disk image and drag Orchestrator into Applications. Read the [installation and first-launch guidance](https://github.com/zachealy1/orchestrator/blob/main/docs/public/INSTALLATION.md).

## Changes since beta.1

- **In-app updates:** independently signed packages for both Mac architectures, with automatic availability checks and separate **Download update** and **Install and restart** actions. Installation waits for active work to finish. Unsupported builds or unavailable feeds offer **Download latest version** directly, without a raw release-JSON error panel. Update and bug-report actions are available after sign-in.
- **Native spellcheck:** macOS spelling checks and red underlines are enabled for prose inputs across the application.
- **Conversation order:** steer prompts appear where they were submitted in the activity stream. Prompt submission preserves the user's selected intent through the queue and execution flow.
- **Readable tables:** agent output uses improved Markdown table layout, cell wrapping and overflow handling in transcripts.
- **Kanban target branches:** choose the branch used for new card branches and pull requests from the board toolbar, immediately before refresh and archive. Edit-card dropdowns no longer retain an unwanted blue highlight.
- **Settings:** the About Orchestrator section displays the application version, warning details open on click, and section dividers and headings are more consistent.
- **Approval labels:** tooltips use concise descriptions without redundant action prefixes.
- **Installer presentation:** the macOS disk image uses a standard drag-to-Applications layout with dedicated background artwork.
- **Documentation:** refreshed Chat and Kanban screenshots show the current interface using genuine activity in the fictional Taskboard Demo.

Installed beta.1 copies with the matching updater key can discover this release through the [beta feed](https://raw.githubusercontent.com/zachealy1/orchestrator/update-feed/beta.json). Unconfigured source builds and older 0.1.0 copies need manual installation. Keep previous installers and back up important data before beta upgrades.

## Testing and packaging

The maintainer reports manually testing the changes and has accepted this community release. Existing required repository CI checks still apply. Packaging verifies the exact source commit, version, architectures, bundled resources, ad-hoc signatures, updater signatures, installer artwork and artifact hashes.

No additional installer or update rehearsal is claimed. Generated receipts record `behavioralTesting: "not-performed"` for the packaging job; this does not describe the maintainer's separate manual testing. See the [acceptance record](https://github.com/zachealy1/orchestrator/blob/main/docs/release-acceptance.md) for scope and historical limitations.

macOS may require **Open Anyway** at first launch or ask for permissions again after an update. Updater signatures and checksums verify integrity, not Apple approval. Browser, Computer Use and Plugins remain experimental and can depend on separately installed upstream components.

The bundled engine and GitHub CLI use your own supported accounts. Account usage limits or charges still apply; this release adds no paid update infrastructure.

Report reproducible issues through [public issues](https://github.com/zachealy1/orchestrator/issues/new/choose), without credentials, personal paths or private transcripts.
