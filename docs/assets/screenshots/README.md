# Screenshot capture notes

The README uses genuine Orchestrator screens and a fictional local project, **Taskboard Demo**. Screenshots are documentation, not UI mockups or performance benchmarks.

## Capture target

- Captured: 8 September 2026.
- Source: `0e821e89562d49837a6789daa461d9e0f8511435` (`0.2.0-beta.1`) plus a separate local standalone Code Mode host packaging fix used for the capture build. No screenshot-specific application code or demo mode is used.
- Appearance: the existing dark theme. The initial temporary configuration requested a 1440 × 900 logical window, but those captures were constrained to approximately 1345 × 768 pixels. The subagent image remains a crop from that initial session. The later full-screen replacements below retain their original resolution without cropping or upscaling.
- Full-screen replacements: the user-supplied change-review, Kanban and Chat screenshots captured on 8 September 2026 at 17:53:26, 17:53:37 and 17:54:12 respectively are retained at 3024 × 1892. The entire account footer, including its divider, avatar, email and plan label, is replaced with opaque sidebar background. All pixels outside that footer are verified unchanged; embedded metadata is removed.
- Analytics replacement: the user-supplied screenshot captured on 8 September 2026 at 17:44 is retained at its original 2344 × 1462 resolution. Only metadata was removed; its pixels, framing and displayed figures are unchanged.
- File contents: the user-supplied screenshot captured on 8 September 2026 at 17:45 is retained at 3024 × 1892. Only the account identity is replaced with the disclosed demo identity and metadata is removed; file contents and the rest of the interface are unchanged.
- Runtime: an ad-hoc local build of the public source, not a signed installer or an older installed application.
- Isolation: a temporary Tauri configuration overrides only the application identifier and initial window size. Its database and preferences are separate from the normal installation. Do not copy a personal database into the capture instance.
- Project: a small in-memory JavaScript task list, with `createTask`, `toggleTask`, fictional example tasks, and dependency-free `node:test` checks. Initialise a dedicated local Git repository without a remote.

## Reproduce the scenes

Use the capture app's normal controls. Run only a few bounded tasks; do not seed fake success states, manufacture analytics, or run open-ended Goals to populate charts.

| Image | Preparation |
|---|---|
| `chat.png` | Ask the agent to explain Taskboard Demo in three concise bullets and suggest one improvement, without modifying files. Show its response and the composer. |
| `file-contents.png` | With the demo conversation open, expand the workspace in the sidebar and select `package.json`. Show the file tree and the syntax-highlighted contents in the preview drawer. |
| `kanban.png` | Create clearly named backlog cards and run the completed-task filtering card below. Capture their actual states; do not alter records to make the board look busier. |
| `subagents.png` | Ask the agent to delegate a read-only review of task validation and test coverage to one subagent, then wait for its reply. Open that subagent's inspector with its original instruction and response visible. The supporting image focuses on the conversation and inspector, excluding window chrome and the navigation sidebar. |
| `change-review.png` | Run a card requesting `filterTasks(tasks, status)` for `all`, `active`, and `completed`, with immutable inputs and focused tests. Open the genuine resulting local diff. Do not commit, push, or publish from the card. |
| `analytics.png` | Select only Taskboard Demo in Analytics. Capture local metrics and charts after the demo tasks finish. Crop out the personal account selector and account-level balances or quotas. |

The demo contains two real backlog cards and one filtering card awaiting local review. Its six tests passed. Analytics reflects all four recorded demo runs, including an earlier runtime-diagnostic response recorded as completed by the application; it is not an assertion that every task achieved its objective. Timings include manual approval waits. A single-day chart has limited data, so no historical points have been invented to fill it.

## Export record

| File | Pixels | Bytes |
|---|---:|---:|
| `chat.png` | 3024 × 1892 | 321,562 |
| `file-contents.png` | 3024 × 1892 | 292,407 |
| `kanban.png` | 3024 × 1892 | 318,029 |
| `subagents.png` | 1067 × 721 | 459,075 |
| `change-review.png` | 3024 × 1892 | 370,787 |
| `analytics.png` | 2344 × 1462 | 207,681 |

Combined size: **1,969,541 bytes**. Final exports were visually inspected, checked with OCR, and verified to contain only PNG image-data chunks (`IHDR`, `IDAT`, `IEND`), without embedded text, source paths or other metadata.

## Privacy and export checklist

1. Keep raw captures and working files outside the repository. A raw screenshot can contain private information even when the selected project is fictional.
2. Keep account menus and unrelated drawers closed. Exclude personal names, avatars, email addresses, private workspace names, home-directory paths, notifications, and account-specific usage figures.
3. In exported screenshots only, remove the complete account footer with opaque sidebar background, preserving the full-screen framing. Chat, Kanban and change review use this treatment. The earlier file-contents image retains its disclosed fictional identity: `demo@example.com`, avatar initial `D`, and subtitle `Demo account`. These privacy edits do not change the authenticated account or application data. Use deterministic pixel editing, not AI generation. Never change task results, diffs, lifecycle states or metrics, and never invent account limits. Any privacy replacement must be flattened into pixels, not reversible layers or blur.
4. Export PNGs with metadata removed. Target less than 1 MB per image and 5 MB combined; retain readable text rather than using destructive compression.
5. Inspect each final image at full resolution and use text recognition as a second privacy check. Confirm PNG metadata contains no private strings or source paths. Do not stage an image until these checks pass.
6. Check the README's desktop and narrow layouts, image links, alt text and captions. Full-resolution images should open when clicked.

Only the six reviewed final PNGs and these notes belong in this directory. No account profiles, raw captures, databases, transcripts or private audit output should be committed.

When refreshing the screenshots, update the recorded source revision and capture details, and repeat the privacy review. Cropping, privacy removal and fictional identity substitutions must not misrepresent the underlying task results.
