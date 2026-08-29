# Browser and Computer Use interaction platform

This document is the operational contract for Orchestrator's Browser Use and
macOS Computer Use capabilities. The implementation wraps installed OpenAI
providers; it does not vendor their proprietary implementation.

## Control plane

Every enabled run owns one `InteractionSession`. The coordinator accepts only
the following lifecycle:

`provisioning -> observing -> awaiting-model -> acting -> verifying -> observing`

Confirmation, recovery, pause, takeover, stopping, and terminal states are
explicit side paths. Only one surface owns the input lease. Resume increments
surface generations and drops every old observation.

Provider-independent observations bind semantic references to a surface and
generation. Visual targets additionally bind the screenshot identifier,
viewport, and scale. Mutating actions have an expected effect and one of six
results: `applied`, `no_effect`, `uncertain`, `blocked`, `stale`, or `failed`.
An acknowledgement from a provider is not evidence that a UI mutation worked.

The retry policy permits a second attempt only for idempotent actions or a
definitive `no_effect`. Consequential and uncertain actions are never replayed.
Two identical no-progress fingerprints enter recovery. Resume, focus changes,
navigation, resize, and provider reconnection invalidate cached grounding.

## Providers

### Default browser

Chrome, Edge, and Brave use the Browser Bridge extension and a session-scoped
backend around the installed OpenAI Browser runtime. Each run creates its own
tab. Existing tabs are invisible to the model until the user explicitly
attaches one. Created tabs are closed at turn end unless marked as a deliverable
or handoff; attached tabs are restored rather than closed.

The backend process starts with an empty environment and an explicit allowlist.
The Codex command environment uses `inherit = "core"`, enables Codex's default
secret-name exclusions, and strips common cloud, token, key, password, and
credential variables before restoring only the session-scoped Browser values.
Uploads and clipboard access are disabled. Downloads require the provider's
action-time security gate, land in a `0700` session staging directory, are never
opened automatically, and are removed with the session. Full CDP is disabled
unless Developer Mode was captured for that task; the provider still applies
its site/action gate.

The extension may reconnect once without replaying an action. A disconnect
pauses input and preserves task tabs. Failure to reconnect within the bounded
window terminates the provider.

Safari is capability-gated and is not production-enabled until it passes the
same matrix as Chromium providers. Development builds can opt into its adapter
with `ORCHESTRATOR_ENABLE_EXPERIMENTAL_SAFARI=1`.

### macOS desktop

Desktop Use activates the installed OpenAI Computer Use skill and MCP provider.
The adapter validates the installed provider version, manifest, confined
launcher, and checksums before exposing the capability. The provider supplies
macOS accessibility observations and actions, screenshot fallback, application
permissions, settling, and local-user takeover behavior. Missing Accessibility
permission or a mismatched provider disables Desktop Use with setup guidance.

Structured connectors and browser semantics remain preferred over desktop
coordinates. Terminal applications, ChatGPT/Codex, administrator prompts, and
security/privacy settings are reserved for their dedicated approval or manual
workflows.

## User control

The interaction panel shows the active surface, current provider activity,
connection/recovery state, and a temporary live browser preview. Preview image
data stays in memory and is never written to routine telemetry.

- **Pause** blocks new provider input and retains the session.
- **Take Over** pauses and detaches provider control before focusing the browser.
- **Resume** takes a fresh observation and invalidates prior references.
- **Stop** interrupts the Codex turn and provider. It is not a browser-only
  disconnect action.

Existing-tab attachment, action confirmation, and surface access are separate
grants. Confirmation identity includes the action, observation, generation,
destination, and expected effect, preventing replay after navigation.

## Data handling and diagnostics

Routine storage contains only session state, provider versions, action kind,
grounding category, policy outcome, result category, hashes, retry count, and
timings. It never stores screenshots, DOM/accessibility text, field values,
clipboard contents, passwords, page text, tool arguments, or generated code.
Detailed redacted step diagnostics are opt-in. Session directories are private
and removed on provider shutdown.

## Supported-provider matrix

| Surface | Provider | Production state |
| --- | --- | --- |
| Browser | Chrome + Browser Bridge | Supported |
| Browser | Edge + Browser Bridge | Supported |
| Browser | Brave + Browser Bridge | Supported |
| Browser | Safari MCP | Experimental, disabled by default |
| Desktop | macOS Computer Use provider | Opt-in, requires Accessibility |

Provider versions and critical artifacts are pinned in the native adapters.
Updating an installed provider requires updating its contract tests and pinned
checksums in the same release.

## Release gates

CI must pass TypeScript, provider contract, extension, migration, redaction,
cancellation, coordinator freshness, confirmation binding, and native tests.
Production promotion additionally requires real-provider browser/desktop and
cross-surface fixtures, prompt-injection cases, failure injection, keyboard and
VoiceOver validation, and the success/latency/safety thresholds in the approved
Computer Use rollout plan. Any confirmation bypass or post-stop input blocks a
release immediately.
