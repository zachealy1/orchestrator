# Screenshot capture notes

The README uses genuine Orchestrator screens and a fictional local project, **Taskboard Demo**. Screenshots are documentation, not UI mockups or performance benchmarks.

## Maintainer capture refresh — 12 September 2026

- Candidate: `3f0704303ddc2ef8be010d477ddc998176a7ed26` (`0.2.0-beta.2`). The capture build uses the candidate application code unchanged, with a temporary Tauri configuration overriding only the isolated application identifier and initial window dimensions. Release preparation changes publication scripts and documentation only.
- Chat was recaptured from the original isolated Taskboard Demo database and local repository. No personal database was copied. The follow-up asked for a three-row Markdown table based only on the existing overview, with no file inspection, modifications, tests or delegation. The response and its reported **7s / 0 tokens** are retained as displayed; the token figure is not corrected or inferred. The older verification text above it belongs to the original 8 September conversation.
- The maintainer supplied three full-screen PNGs from the same isolated capture app: `Screenshot 2026-09-12 at 13.38.45.png` replaces Chat, `Screenshot 2026-09-12 at 13.39.01.png` replaces Kanban, and `Screenshot 2026-09-12 at 13.39.24.png` replaces Subagents. They supersede the earlier 1224 × 768 Chat and Kanban exports and the 1067 × 721 subagent crop.
- All three exports retain the original **3024 × 1898** resolution, square edges and full-screen framing without cropping, resizing or upscaling. The complete account footer, including the horizontal divider, avatar, email and plan label, at `(0, 1774)`–`(622, 1898)` (right and bottom exclusive) was replaced with the existing opaque sidebar background, RGB `(37, 48, 59)`. The sidebar's vertical divider is preserved. Every pixel outside that rectangle is unchanged. Embedded metadata was removed; visual inspection and OCR found no remaining account identity or personal home-directory paths.
- Kanban was recaptured from the same candidate and existing demo board. The target-branch selector shows `codex/readme-demo` immediately before refresh and archive. The two backlog cards and filtering card awaiting local review are unchanged; no cards were rerun, moved, committed or published for this capture.
- Subagents shows the existing parent conversation alongside the completed inspector, including the original prompt, command outcomes and findings. The displayed **5m 16s / 555,145 tokens**, failed and completed command labels, context figures and review results are preserved. The visible `/private/tmp/taskboard-demo-readme` path is the fictional temporary demo repository. No new runs were requested to produce these replacement images.
- File contents, change review and Analytics retain their original bytes and capture dates. Only the three equivalent screenshots supplied by the maintainer are replaced.
- README preview uses GitHub-rendered Markdown. Desktop (1280-pixel) and narrow (390-pixel) layouts have no horizontal overflow; all six images load with descriptive alt text and links to the matching full-size PNG. The three refreshed images open at 3024 × 1898.

## Original capture target — 8 September 2026

- Captured: 8 September 2026.
- Source: `0e821e89562d49837a6789daa461d9e0f8511435` (`0.2.0-beta.1`) plus a separate local standalone Code Mode host packaging fix used for the capture build. No screenshot-specific application code or demo mode is used.
- Appearance: the existing dark theme. The initial temporary configuration requested a 1440 × 900 logical window, but those captures were constrained to approximately 1345 × 768 pixels. The original subagent crop from that session was superseded by the 12 September full-screen capture. The later full-screen replacements below retain their original resolution without cropping or upscaling.
- Full-screen replacements: the original user-supplied change-review, Kanban and Chat screenshots were captured on 8 September 2026 at 17:53:26, 17:53:37 and 17:54:12 respectively at 3024 × 1892. Change review retains that capture; the Chat and Kanban replacements are documented above. The entire account footer, including its divider, avatar, email and plan label, is replaced with opaque sidebar background. All pixels outside that footer are verified unchanged; embedded metadata is removed.
- Analytics replacement: the user-supplied screenshot captured on 8 September 2026 at 17:44 is retained at its original 2344 × 1462 resolution. Only metadata was removed; its pixels, framing and displayed figures are unchanged.
- File contents: the user-supplied screenshot captured on 8 September 2026 at 17:45 is retained at 3024 × 1892. Its entire account footer is removed with opaque sidebar background, matching Chat, Kanban and change review. The previous dummy email, avatar and subtitle are no longer present. All pixels outside the footer are unchanged, and embedded metadata is removed.
- Original subagent corner cleanup: the small white exterior area at the bottom-right rounded window corner was filled with the adjacent drawer background. Only a polygon within the final 17 × 13 pixels changed; all other pixels, recognised text and the 1067 × 721 framing were unchanged. This earlier image has now been replaced.
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
| `subagents.png` | Reopen the existing task-validation and test-coverage review conversation and its completed subagent inspector. Show the original instruction, command outcomes and findings alongside the parent conversation in full screen. Preserve the genuine run results and metrics. |
| `change-review.png` | Run a card requesting `filterTasks(tasks, status)` for `all`, `active`, and `completed`, with immutable inputs and focused tests. Open the genuine resulting local diff. Do not commit, push, or publish from the card. |
| `analytics.png` | Select only Taskboard Demo in Analytics. Capture local metrics and charts after the demo tasks finish. Crop out the personal account selector and account-level balances or quotas. |

The demo contains two real backlog cards and one filtering card awaiting local review. Its six tests passed in the original session. The retained 8 September Analytics screenshot reflects the four demo runs recorded at that time, including an earlier runtime-diagnostic response recorded as completed by the application; it is not an assertion that every task achieved its objective. Timings include manual approval waits. A single-day chart has limited data, so no historical points have been invented to fill it. The 12 September table response is an additional genuine run and is not retroactively added to the earlier Analytics screenshot.

## Export record

| File | Pixels | Bytes |
|---|---:|---:|
| `chat.png` | 3024 × 1898 | 343,614 |
| `file-contents.png` | 3024 × 1892 | 281,145 |
| `kanban.png` | 3024 × 1898 | 278,898 |
| `subagents.png` | 3024 × 1898 | 496,683 |
| `change-review.png` | 3024 × 1892 | 370,787 |
| `analytics.png` | 2344 × 1462 | 207,681 |

Combined size: **1,978,808 bytes**. All three refreshed exports passed visual, OCR and PNG metadata inspection, plus a pixel comparison confirming that only the account footer changed. Retained images preserve their previously reviewed pixel data and privacy treatment. All six final PNGs contain only `IHDR`, `IDAT` and `IEND` chunks.

## Privacy and export checklist

1. Keep raw captures and working files outside the repository. A raw screenshot can contain private information even when the selected project is fictional.
2. Keep account menus and unrelated drawers closed. Exclude personal names, avatars, email addresses, private workspace names, home-directory paths, notifications, and account-specific usage figures.
3. In exported screenshots only, remove the complete account footer with opaque sidebar background, preserving the full-screen framing. Chat, file contents, Kanban, Subagents and change review all use this treatment; do not substitute a dummy email, avatar or plan label. Normal composer controls remain unchanged. These privacy edits do not change the authenticated account or application data. Use deterministic pixel editing, not AI generation. Never change task results, diffs, lifecycle states or metrics, and never invent account limits. Any privacy removal must be flattened into pixels, not reversible layers or blur.
4. Export PNGs with metadata removed. Target less than 1 MB per image and 5 MB combined; retain readable text rather than using destructive compression.
5. Inspect each final image at full resolution and use text recognition as a second privacy check. Confirm PNG metadata contains no private strings or source paths. Do not stage an image until these checks pass.
6. Check the README's desktop and narrow layouts, image links, alt text and captions. Full-resolution images should open when clicked.

Only the six reviewed final PNGs and these notes belong in this directory. No account profiles, raw captures, databases, transcripts or private audit output should be committed.

When refreshing the screenshots, update the recorded source revision and capture details, and repeat the privacy review. Cropping and privacy removal must not misrepresent the underlying task results.
