# Privacy and local data

Production releases include minimal installation activity tracking through PostHog, with an opt-out in Settings. The Analytics screen's local activity summaries are calculated from locally stored task records. Account plan limits are obtained from the selected Codex account.

Using AI or external integrations still communicates with their providers. Prompts, selected context, tool output and files an agent is permitted to inspect may be sent to OpenAI or a connected service. These services have their own account requirements and privacy policies. Review access settings and tool approvals; do not assume a repository stays offline because the desktop interface is local.

## Installation activity

Production releases share one `active_day` event on the first app opening, return
to focus, or interaction each UTC day. The event contains a random installation
ID, an event ID, the first activity timestamp and UTC date, app version, and release
environment. This measures active installations over 1, 7, and 30 days; it does not
identify a person or connect your Codex accounts.

Events go to PostHog's EU Cloud. Person-profile creation and location enrichment
are disabled, and the project discards client IP data from analytics. As with any
network request, the service still receives your connection. Prompts, files,
repository paths, email addresses, account details, screenshots, and interaction
contents are not included. There is no automatic click capture or session replay.

Turn off **Settings → Privacy → Share installation activity** to stop collection
and discard pending delivery. The app attempts to cancel any in-flight request;
already received events remain in PostHog. Re-enabling sends current activity only.
Offline events can be retried for up to 35 days with their original dates. The ID
and daily deduplication records remain in your local application data across
upgrades and account changes. Clearing that data creates a new ID; copying it to
another computer can share the ID. Development, test, unconfigured builds, and
release rehearsals do not send activity.

The app's Analytics screen continues to show local task usage. Installation
activity is a separate maintainer dashboard; GitHub download counts are separate
again. See the [implementation and metric definitions](../installation-activity.md).

## Local storage

- Application data includes a SQLite database, chats, task events, account/profile settings, drafts and worktree bindings in Orchestrator's macOS application support/configuration directories, identified by `com.zachealy.orchestrator`.
- Added Codex accounts have isolated profile directories. The shared Codex account uses the user's existing Codex profile. Authentication material is sensitive; local profile files must not be shared as diagnostic attachments.
- Generated previews use `~/.codex/generated_images/<thread-id>/`. Explicitly requested project assets may also be copied to a workspace. Existing isolated images are retained for compatibility.
- Isolated Kanban worktrees and repositories contain real user files. Removing the app bundle does not clean them up or delete application data.
- Before an upgrade that applies newer database migrations, a SQLite-aware recovery snapshot is stored under the application's `recovery` directory. It includes private data and is not uploaded automatically. Draft recovery for an update is local WebView storage.

Use FileVault and normal macOS account protections for local data. Orchestrator does not claim that all local account or transcript files are independently encrypted.

## Download counts

GitHub exposes aggregate release-asset download counts. The public report groups these counts by version, architecture and installer/update package. Counts are **downloads**, not unique people, completed installations or active users. Retries and automated verification count too. No application-user identifiers are sent to produce this report. GitHub handles the download request and may maintain its own service logs.

Bug reports are public unless submitted through a private security channel. Redact credentials, personal details, repository paths/content and transcripts before posting.
