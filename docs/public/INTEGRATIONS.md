# Permissions and experimental integrations

Core tasks use Orchestrator's bundled standalone Codex app-server. A separate ChatGPT/Codex desktop application is not required for this engine. Each app release pins an engine tested with that release; the engine is not independently replaced while tasks are running.

The beta retains Plugins, Browser and Computer Use. Some upstream plugin and app-server interfaces are experimental and are not promised as officially production-supported integrations. Browser capabilities can depend on external plugins and runtime components from a separately installed compatible ChatGPT/Codex desktop app. Availability varies by account and installation. **These integrations are not all self-contained.** Orchestrator does not redistribute private ChatGPT application components.

## macOS permissions

- **Accessibility** allows an enabled computer-use integration to control applications.
- **Screen Recording** allows it to observe screen content. Screens can contain sensitive data.
- **Notifications** are optional and controlled in Settings/macOS settings.
- Workspace and external-service access should be granted only for work you intend an agent to perform.

Grant permissions to the actual copy in Applications. A development build or another installation can appear separately in macOS permission settings. If permissions appear enabled but the app reports otherwise, quit and reopen the Applications copy before retrying.

Installing a plugin does not guarantee its host capabilities or permissions are available. A missing Browser runtime warning describes an unavailable capability; signing in again will not necessarily supply that runtime.

Repository operations use Git and the bundled GitHub CLI. Authenticate GitHub separately when needed. Branch management in multi-repository workspaces is terminal-managed; Commit and Push retains a repository selector. Always review the selected repository and changes before publication.
