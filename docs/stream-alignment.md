# App-server stream alignment

The reference inspected on 2026-09-12 was `/Applications/ChatGPT.app/Contents/Resources/app.asar`. Its package identifies as `openai-codex-electron` version `26.908.40834`. The main and webview bundles implement indexed text queues, completion draining, separate command-output batching, and working/worked/stopped activity disclosures. This is evidence of that installed Codex implementation, not a claim about every ChatGPT client.

The [official app-server protocol](https://learn.chatgpt.com/docs/app-server) defines reasoning summary/content indexes and makes completed items authoritative.

## Implementation

- `CodexStreamScheduler` owns presentation buffering and per-thread notification serialization. Original events are recorded at ingress, independently of animation. Buffered updates retain their owning run to prevent routing them to another chat after navigation.
- Text targets include thread, turn, item, profile, and reasoning-part identity. Assistant, plan, and reasoning-content text reveal at 24 UTF-16 code units per frame without splitting surrogate pairs. Reasoning summaries publish together; command output batches every 50 ms.
- Normal completion drains within eight frames. Approval, interruption, error, visibility/reduced-motion changes, and teardown flush immediately. A 16 ms timer publishes text when animation frames are unavailable.
- Recovery/removal clears obsolete presentation buffers and invalidates queued lifecycle handlers. Stored protocol events remain unchanged and replay directly through the reducer, without typing animation.
- Reasoning summaries and content remain separate. Completed items replace streamed text in place; fragments on either side of a user steer retain their positions. Empty identified items reserve chronology without showing empty rows. Legacy lifecycle notifications without item identity retain their generic presentation.
- Main and subagent transcripts share activity rows and disclosures. Completed activity collapses by default. Explicit disclosure choices survive updates; active and failed commands/tools remain visible. Command output is expandable. Historical subagent projections expose only the information supplied by their endpoint.

## Validation

Deterministic tests cover scheduling, completion ordering, visibility fallback, recovery, indexed reasoning, authoritative completion, steering boundaries, command output, transcript disclosures, and replay. Runtime regression tests cover approvals, Goals, generated images, plans, history, file links, typing, and scroll anchoring.

Browser checks use the shared React components with synthetic protocol events to inspect text reveal, command output, completion disclosures, and background/restore behavior. Direct UI inspection of the installed reference app was blocked by the computer-use tool; reference behavior was verified from its bundle. No live model turn is required by the tests.
