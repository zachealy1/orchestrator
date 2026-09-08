# Troubleshooting and recovery

## Installer or update is rejected

Check the release, architecture and minimum macOS version. Download again from the official public Releases page. For a trusted non-notarized community beta, follow the app-specific [first-launch instructions](INSTALLATION.md#community-beta-macos-first-launch-warning). Never disable Gatekeeper globally or ignore malware/tampering warnings. Report the exact macOS error with the version and architecture, without private logs.

If the app is running from a disk image or a read-only folder, quit and install it in Applications. If download fails, use **Retry download**. A changed/withdrawn update must be checked and downloaded again; an older cached package is not force-installed.

## Installation says work is still active

Check other workspaces, Goals, subagent activity, queued/starting Kanban attempts, pending approvals and repository publication. Complete or stop that work using its normal controls. The updater deliberately does not cancel it. If interrupted work is still shown, use the existing recovery/stop actions or reopen the app after confirming no work should continue.

## New engine could not be activated

The app verifies its pinned engine before selecting it. If provisioning fails, it may continue the session with the previous verified engine and show a warning; that warning means the new engine was **not** activated. Reinstall the correct release and retry. Explicit custom-engine overrides remain authoritative and can cause compatibility errors.

## Data and recovery

Quit Orchestrator before manually restoring data. Keep the complete application data directory, generated images and relevant worktrees. Do not copy only `app.db` while SQLite is open: recent data may reside in its WAL file. Use a SQLite-aware backup or back up after a clean shutdown.

Schema-changing upgrades create an online SQLite recovery snapshot before applying newer migrations. They do not rewrite old migration history. Do not restore an older app against a newer incompatible database. Normal recovery is a higher-version corrective release; coordinate database restoration with support.

## Useful bug-report details

Include the app version, macOS version, architecture, affected feature, exact steps, expected/actual behavior and whether it repeats. State whether the workspace contains one or several repositories. Attach only redacted screenshots or short errors. Never attach account profiles, authentication files, complete databases or private transcripts.
