# Browser and Computer Use interaction platform

Orchestrator follows the Codex capability split and delegates provider security
to installed OpenAI plugins. It does not bundle a browser extension, native
messaging host, or private provider runtime.

## Browser

Web work uses the OpenAI Browser plugin and its isolated in-app profile. The
profile is separate from the user's regular browsers and task tabs are opened
only when the plugin is used. Browser readiness is derived from Codex plugin
state. Downloads, browser-data clearing, and any capability-gated profile import
are configured in Browser settings.

Access to Chrome and other external browsers comes from their own installed
plugins. Missing capabilities direct the user to Plugins; there is no local
fallback transport.

## Computer Use

Desktop control uses the OpenAI Computer Use skill and MCP server. It is gated
by the user's Any App preference and by macOS Screen Recording and Accessibility
permissions. Connected control plugins and always-allowed applications are
managed independently, and persistent application grants can be revoked from
settings.

Semantic connectors and Browser remain preferable to desktop coordinates.
Security settings, authentication prompts, and other sensitive actions continue
through explicit approval or manual workflows.

## Plugins

Codex app-server is the source of truth for marketplaces, installation,
enablement, policy, authentication requirements, component readiness, and
uninstallation. Plugin mutations refresh the skill catalog and apply to new
tasks.

## Interaction coordination

Every active provider surface participates in the shared interaction
coordinator. Confirmation, pause, takeover, recovery, stop, redaction, and
generation invalidation are provider-independent. Only one surface owns the
input lease, and reconnecting or resuming invalidates stale observations.

Routine telemetry excludes screenshots, page or accessibility text, field
values, clipboard contents, credentials, and raw tool arguments. Consequential
or uncertain actions are not automatically replayed.

## Release gates

CI covers plugin policy and lifecycle operations, Browser preferences and data
cleanup, Computer Use permissions and grants, least-privilege migrations,
interaction cancellation and redaction, generated interfaces, packaged
resources, and macOS integration against installed OpenAI plugins.
