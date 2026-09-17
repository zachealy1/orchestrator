# GitLab UI demo

Run `npm run demo:gitlab`, then open http://127.0.0.1:1425/gitlab-demo.html.

The demo renders the complete production Settings page, application sidebar components, and Kanban workspace. Its separate HTML entry installs Tauri IPC mocks with in-memory sample data. It does not call GitLab, touch native repositories, or store credentials. Use sample tokens only. The normal application entry and production build do not import the demo.

Try these flows:

- **Settings page:** choose the GitLab row in Connections to scroll to its panel, or search settings for `gitlab`. Add a GitLab.com or self-managed host. Browser sign-in and token verification are simulated with a short delay; cancel and disconnect are scoped to that host. `invalid` or `expired` as the token previews an authentication error.
- **Kanban board:** draft GitLab requests show `!42`; the mixed card opens the actual request chooser with GitLab and GitHub hosts. Opening a sample URL displays it in a notice.
- **Local review:** open “Review the empty state copy” to inspect a sample diff and publish a draft merge request using the drawer action.
- **Scenarios:** choose a disconnected host, expired token, or missing CLI to inspect warnings. “Closed, unmerged request” stays in review; “All requests merged” shows completed cards.
- **Retry and archive:** retry the failed publication from its card menu; use the archive toolbar button to inspect a completed self-managed request.
- **Reset:** restores the selected scenario. Changes are discarded on page reload.

Agent execution and unrelated editing operations are outside this demo. Native authentication, publishing, and synchronization still require live integration testing; the scenarios here are fixtures for reviewing the UI.
