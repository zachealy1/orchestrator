# Mid-stream questions

Orchestrator implements Codex's native asynchronous questions. The agent can ask
for input and continue independent work while the user chooses an answer.

The implementation was checked against the installed Codex app's webview bundle
and engine on 12 September 2026. The app engine reported 0.154.0-alpha.6.2; the
Orchestrator smoke test passed against its existing pinned 0.153.4 engine.
The public [app-server documentation](https://learn.chatgpt.com/docs/app-server)
describes the separate blocking `item/tool/requestUserInput` flow, which remains
unchanged.

## Native protocol

- Enable `default_mode_request_user_input` in the managed engine's process args.
  Feature discovery must follow `nextCursor`; this flag is beyond the first page.
- `request_user_input_async` returns immediately. Its question arrives as a
  completed `agentMessage` with `delivery: "async"` and ordered
  `questions: [{ title, options? }]`.
- Question IDs are `JSON.stringify(["request_user_input_async", itemId, index])`.
  A legacy async message with no questions uses its item ID and text.
- A reply is one text input passed to `turn/steer` with the original thread,
  `expectedTurnId`, and `clientUserMessageId`. Its text is:

```text
<send_user_message_question_reply>
[{"questionItemId":"…","question":"Which color?","answer":"Green"}]
</send_user_message_question_reply>
```

The question is not a server approval request, and does not move Kanban attempts
to `waiting_user`. Async messages are excluded from final-answer and plan
selection. Subagent answers are steered to the child thread.

## Interaction and persistence

Suggested options are preselected but require explicit submission. Free text is
always available. Ordered questions use Next/Back navigation; the final Submit
sends nonempty answers together. Skip, minimize, and the 30-second display timer
send nothing. Interaction cancels the timer. Questions can be reopened and
answers revised while the originating turn remains active.

An app-owned controller retains drafts across virtualized row unmounts and
workspace navigation. It validates the active turn before delivery, locks pending
submissions, retains drafts after errors, and reuses the message ID when retrying
an unchanged reply. Completion closes the panel; it never starts a new turn to
send a stale answer.

Questions and accepted replies use the existing run-event ledger. Native history
activity pages retain the async items; history restoration deduplicates native
reply echoes and preserves answer order across descending pages. The subagent
inspector renders the native reply text once. No database migration is required.

## Verification

Run `npm run lint`, `npm run build`, the async-question and related transcript,
steering, Plan and Kanban tests, and `cargo test --manifest-path
src-tauri/Cargo.toml --no-default-features --lib`.

`npm run test:live-async-questions` uses an authenticated native engine and a
temporary read-only workspace. It verifies a native question, independent work
before answering, then a steered answer incorporated into the final response.
Set `CODEX_BIN` to use a specific executable; otherwise it uses the installed
Orchestrator engine matching the repository pin. This test makes a model request.
