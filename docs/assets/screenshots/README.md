# Screenshot capture notes

The README uses genuine Orchestrator screens and a fictional local project, **Taskboard Demo**. Screenshots are documentation, not UI mockups or performance benchmarks.

## Beta.2 refresh — 12 September 2026

- Candidate: `3f0704303ddc2ef8be010d477ddc998176a7ed26` (`0.2.0-beta.2`). The capture build uses the candidate application code unchanged, with a temporary Tauri configuration overriding only the isolated application identifier and initial window dimensions. Release preparation changes publication scripts and documentation only.
- Chat was recaptured from the original isolated Taskboard Demo database and local repository. No personal database was copied. The follow-up asked for a three-row Markdown table based only on the existing overview, with no file inspection, modifications, tests or delegation. The response and its reported **7s / 0 tokens** are retained as displayed; the token figure is not corrected or inferred. The older verification text above it belongs to the original 8 September conversation.
- Chat and Kanban exports: both recaptured in macOS full-screen mode at the maintainer's request, with square edges and no window corners or title-bar buttons. The capture tool returned 1224 × 768 pixels each; the PNG exports retain those dimensions without further resizing or upscaling. The complete account footer at `(0, 714)`–`(251, 768)` was replaced with the existing opaque sidebar background. Every pixel outside that rectangle is unchanged. Metadata was removed without changing decoded pixels; visual inspection and OCR found no remaining account identity or private paths.
- Kanban was recaptured from the same candidate and existing demo board. The target-branch selector shows `codex/readme-demo` immediately before refresh and archive. The two backlog cards and filtering card awaiting local review are unchanged; no cards were rerun, moved, committed or published for this capture.
- The four supporting screenshots retain their original pixels and capture dates. Candidate comparison found no relevant visible change in the scenes: file preview and local diff layouts are unchanged; the subagent image has prose and no table; Analytics has no changed release UI. These historical captures are not relabelled as beta.2 recaptures.
- README preview uses GitHub-rendered Markdown. Desktop (1280-pixel) and narrow (390-pixel) layouts have no horizontal overflow; all six images load with descriptive alt text and links to the matching full-size PNG. Both refreshed images open at 1224 × 768.

## Original capture target — 8 September 2026

- Captured: 8 September 2026.
- Source: `0e821e89562d49837a6789daa461d9e0f8511435` (`0.2.0-beta.1`) plus a separate local standalone Code Mode host packaging fix used for the capture build. No screenshot-specific application code or demo mode is used.
- Appearance: the existing dark theme. The initial temporary configuration requested a 1440 × 900 logical window, but those captures were constrained to approximately 1345 × 768 pixels. The subagent image remains a crop from that initial session. The later full-screen replacements below retain their original resolution without cropping or upscaling.
- Full-screen replacements: the original user-supplied change-review, Kanban and Chat screenshots were captured on 8 September 2026 at 17:53:26, 17:53:37 and 17:54:12 respectively at 3024 × 1892. Change review retains that capture; the Chat and Kanban replacements are documented above. The entire account footer, including its divider, avatar, email and plan label, is replaced with opaque sidebar background. All pixels outside that footer are verified unchanged; embedded metadata is removed.
- Analytics replacement: the user-supplied screenshot captured on 8 September 2026 at 17:44 is retained at its original 2344 × 1462 resolution. Only metadata was removed; its pixels, framing and displayed figures are unchanged.
- File contents: the user-supplied screenshot captured on 8 September 2026 at 17:45 is retained at 3024 × 1892. Its entire account footer is removed with opaque sidebar background, matching Chat, Kanban and change review. The previous dummy email, avatar and subtitle are no longer present. All pixels outside the footer are unchanged, and embedded metadata is removed.
- Subagent corner cleanup: the small white exterior area at the bottom-right rounded window corner is filled with the adjacent drawer background. Only a polygon within the final 17 × 13 pixels is changed; all other pixels, recognised text and the 1067 × 721 framing are unchanged.
- Runtime: an ad-hoc local build of the public source, not a signed installer or an older installed application.
- Isolation: a temporary Tauri configuration overrides only the application identifier and initial window size. Its database and preferences are separate from the normal installation. Do not copy a personal database into the capture instance.
- Project: a small in-memory JavaScript task list, with `createTask`, `toggleTask`, fictional example tasks, and dependency-free `node:test` checks. Initialise a dedicated local Git repository without a remote.

## Reproduce the scenes

Use the capture app's normal controls. Run only a few bounded tasks; do not seed fake success states, manufacture analytics, or run open-ended Goals to populate charts.

| Image | Preparation |
|---|---|
| `chat.png` | Reopen the original overview conversation, then ask for a three-row table covering `createTask`, `toggleTask` and the suggested test improvement, using only the existing context. Request no tools, tests, writes or delegation. Show the genuine table, submitted prompt and composer. |
| `file-contents.png` | With the demo conversation open, expand the workspace in the sidebar and select `package.json`. Show the file tree and the syntax-highlighted contents in the preview drawer. |
| `kanban.png` | Reopen the existing demo board and show its target-branch selector immediately before refresh and archive. Reuse the two backlog cards and genuine filtering card awaiting local review; do not rerun or alter their states. |
| `subagents.png` | Ask the agent to delegate a read-only review of task validation and test coverage to one subagent, then wait for its reply. Open that subagent's inspector with its original instruction and response visible. The supporting image focuses on the conversation and inspector, excluding window chrome and the navigation sidebar. |
| `change-review.png` | Run a card requesting `filterTasks(tasks, status)` for `all`, `active`, and `completed`, with immutable inputs and focused tests. Open the genuine resulting local diff. Do not commit, push, or publish from the card. |
| `analytics.png` | Select only Taskboard Demo in Analytics. Capture local metrics and charts after the demo tasks finish. Crop out the personal account selector and account-level balances or quotas. |

The demo contains two real backlog cards and one filtering card awaiting local review. Its six tests passed in the original session. The retained 8 September Analytics screenshot reflects the four demo runs recorded at that time, including an earlier runtime-diagnostic response recorded as completed by the application; it is not an assertion that every task achieved its objective. Timings include manual approval waits. A single-day chart has limited data, so no historical points have been invented to fill it. The 12 September table response is an additional genuine run and is not retroactively added to the earlier Analytics screenshot.

## Export record

| File | Pixels | Bytes |
|---|---:|---:|
| `chat.png` | 1224 × 768 | 379,737 |
| `file-contents.png` | 3024 × 1892 | 281,145 |
| `kanban.png` | 1224 × 768 | 258,113 |
| `subagents.png` | 1067 × 721 | 458,932 |
| `change-review.png` | 3024 × 1892 | 370,787 |
| `analytics.png` | 2344 × 1462 | 207,681 |

Combined size: **1,956,395 bytes**. Both refreshed exports passed visual, OCR and PNG metadata inspection. Retained images preserve their previously reviewed pixel data and privacy treatment. All six final PNGs contain only `IHDR`, `IDAT` and `IEND` chunks.

## Privacy and export checklist

1. Keep raw captures and working files outside the repository. A raw screenshot can contain private information even when the selected project is fictional.
2. Keep account menus and unrelated drawers closed. Exclude personal names, avatars, email addresses, private workspace names, home-directory paths, notifications, and account-specific usage figures.
3. In exported screenshots only, remove the complete account footer with opaque sidebar background, preserving the full-screen framing. Chat, file contents, Kanban and change review all use this treatment; do not substitute a dummy email, avatar or plan label. Normal composer controls remain unchanged. These privacy edits do not change the authenticated account or application data. Use deterministic pixel editing, not AI generation. Never change task results, diffs, lifecycle states or metrics, and never invent account limits. Any privacy removal must be flattened into pixels, not reversible layers or blur.
4. Export PNGs with metadata removed. Target less than 1 MB per image and 5 MB combined; retain readable text rather than using destructive compression.
5. Inspect each final image at full resolution and use text recognition as a second privacy check. Confirm PNG metadata contains no private strings or source paths. Do not stage an image until these checks pass.
6. Check the README's desktop and narrow layouts, image links, alt text and captions. Full-resolution images should open when clicked.

Only the six reviewed final PNGs and these notes belong in this directory. No account profiles, raw captures, databases, transcripts or private audit output should be committed.

When refreshing the screenshots, update the recorded source revision and capture details, and repeat the privacy review. Cropping and privacy removal must not misrepresent the underlying task results.
