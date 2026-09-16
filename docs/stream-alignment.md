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

## Presentation follow-up (2026-09-16)

Re-inspected the installed Codex bundle, now `openai-codex-electron` version
`26.908.70816`. Direct UI inspection of Codex remains unavailable to the
computer-use tool. The reference evidence is the installed application source:

- `app-primary-4af6ed7f68d1.js` segments text into words and remembers settled
  segments. `app-initial-a09fe9cd72bc.css` applies a 150 ms opacity fade with
  `cubic-bezier(.37, .55, .86, .88)`; reduced motion disables it.
- `local-conversation-page-a62e53753522.css` and `app-dddf03d14541.css` use a
  two-second shimmer for working text.
- `conversation-blocks-ff6853707ff6.js` renders muted command summaries as a
  disclosure, with the raw command, output, and exit status in its terminal body.
  Activity expansion uses a short opacity/translation transition.

Orchestrator now implements these presentation behaviors independently. The
scheduler still controls data publication; `StreamingText.tsx` fades only new
text in the main transcript and subagent inspector. Previously visible text
stays settled through Markdown updates, reopening, history, and navigation.
Completion, hidden windows, and reduced motion cancel outstanding fades. The
implementation also resumes fades through React StrictMode's development-only
mount-effect replay.

Token totals inherit the existing metrics font size (`0.83rem`), undoing the
additional `0.85em` reduction. Failed commands keep a compact neutral summary
with a failure icon. Expanding it reveals selectable, bounded terminal output
and the recorded exit code; durations below one second no longer say `for 0s`.
Failures remain visible outside collapsed activity, and open command output
stays open through updates and execution completion.

Validation includes tests for new-word animation, settled Markdown nodes,
StrictMode, visibility/reduced motion, completion, Unicode and Markdown
structure, command disclosure persistence, failure details, and exit-code
replay. A browser review of the shared production components confirmed equal
13.28 px token/elapsed-time text, active word opacity changes, zero word
animations after completion, Enter-key disclosure operation, and readable
failure output at wide and 360 px transcript widths. The browser review used
synthetic stream updates rather than a live model turn.

Command rows and their output panels now appear without an entrance animation.
The command list uses consistent spacing between status groups, and only rows
nested inside a completed group receive the disclosure's top margin. Running
rows and completed group summaries share the same line height. Browser checks
at 720 px and 360 px confirmed equal 18 px surrounding gaps for running,
completed, and failed commands, and unchanged output-panel dimensions and
padding when an expanded command completes.
