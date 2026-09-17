# Screenshot capture notes

The README uses genuine native Orchestrator screens and a fictional local project, **Taskboard Demo**. These are documentation screenshots, not performance benchmarks.

## Maintainer capture refresh — 17 September 2026

Five maintainer-supplied full-screen PNGs replace Chat, File contents, Kanban, Subagents and Change review. They were captured in the isolated macOS **Orchestrator README Demo** app built from `2fb362b`. The beta.3 release also includes subsequent sidebar pagination and stream-activity changes from `098457a`; these screenshots do not claim to show that later source revision.

The capture app uses a separate application identifier, database and preferences. At the maintainer's request, a temporary frontend CSS override hides only the local-review publication-blocker notice, which exposed the local demo repository path. This override is not included in the production release. The board's repository-connection banner remains visible, and no remote publication is implied.

The demo repository and pending-review worktrees were restored from the original retained files and recorded diffs after their temporary directory disappeared. The filtering diff remains two files, +42/−1. Existing conversation text, command outcomes, task states and metrics are retained. The board shows one To do, two In review and two Done cards; these are the supplied capture's actual states. The visible `/private/tmp/taskboard-demo-readme` path in historical conversations belongs to the fictional demo.

All five PNGs retain their original framing and dimensions. The complete account footer (divider, avatar, identity and plan) is replaced with opaque sidebar background, RGB `(37, 48, 59)`. The mask is `(0, height − 124)`–`(622, height)`, right and bottom exclusive. The sidebar's vertical divider is preserved. Pixel comparison confirms that every pixel outside this rectangle is unchanged. No task results, diffs, metrics or account limits are invented or retouched. Visual inspection and OCR found no remaining account identity or personal home-directory paths. Metadata is removed; all final PNGs contain only `IHDR`, `IDAT` and `IEND` chunks.

## Retained Analytics capture — 8 September 2026

`analytics.png` retains its previously reviewed bytes at 2344 × 1462. Its source was `0e821e89562d49837a6789daa461d9e0f8511435` plus the local standalone Code Mode host packaging fix. It shows the four genuine demo runs recorded at that time, including an earlier runtime-diagnostic response recorded as completed by the application. This is not an assertion that every task achieved its objective, nor a current account quota or performance benchmark. No historical chart points or later runs are added.

## Reproduce the scenes

Reuse the isolated fictional demo and its real history. Keep raw captures and private working files outside the repository. Do not copy a personal database into the capture app or manufacture success states to populate it.

| Image | Scene |
|---|---|
| `chat.png` | Existing overview conversation and genuine three-row Markdown table, submitted prompt and composer. |
| `file-contents.png` | Files sidebar with `package.json` selected and its syntax-highlighted preview beside Kanban. |
| `kanban.png` | Existing board, real task states and target-branch selector before refresh and archive. |
| `subagents.png` | Existing read-only review conversation and completed subagent inspector, preserving its prompt, findings and failed/completed commands. |
| `change-review.png` | Existing `filterTasks(tasks, status)` local diff, preserving file navigation and review controls. Do not publish or merge solely for a screenshot. |
| `analytics.png` | Retained original demo-workspace activity; account selector and personal quotas are excluded. |

## Export record

| File | Pixels | Bytes |
|---|---:|---:|
| `chat.png` | 3024 × 1896 | 429,604 |
| `file-contents.png` | 3024 × 1896 | 268,456 |
| `kanban.png` | 3024 × 1896 | 341,613 |
| `subagents.png` | 3024 × 1896 | 554,074 |
| `change-review.png` | 3024 × 1898 | 316,694 |
| `analytics.png` | 2344 × 1462 | 207,681 |

Combined size: **2,118,122 bytes**. All images are under 1 MB; the set is under 5 MB. Each README image has descriptive alt text and links to the same full-size PNG.

## Privacy and export checklist

1. Exclude account identities, avatars, email addresses, private workspace names, home-directory paths, notifications and account-specific quotas.
2. Remove the complete account footer in exported screenshots using deterministic pixel editing, not AI generation. Use the opaque sidebar background, with no dummy identity or reversible blur. Preserve all other pixels and normal composer controls.
3. Preserve genuine task results, diffs, lifecycle states and metrics. Document capture-only presentation overrides.
4. Strip metadata and inspect each export visually and with OCR before staging. Keep only reviewed final images and these notes in the screenshot directory.
5. Verify README captions, image links and responsive rendering. Keep raw captures, databases, private audit output and account profiles outside the repository.
