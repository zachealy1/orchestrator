# Privacy and local data

Orchestrator does not add device identifiers, an application-usage telemetry service, or a central analytics backend. The Analytics screen's local activity summaries are calculated from locally stored task records. Account plan limits are obtained from the selected Codex account.

Using AI or external integrations still communicates with their providers. Prompts, selected context, tool output and files an agent is permitted to inspect may be sent to OpenAI or a connected service. These services have their own account requirements and privacy policies. Review access settings and tool approvals; do not assume a repository stays offline because the desktop interface is local.

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
