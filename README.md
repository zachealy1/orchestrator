# Orchestrator website

Public product landing page for Orchestrator. Plain HTML, CSS and JavaScript; no build dependencies or analytics scripts.

The Workspace design uses the application's slate palette, a fixed desktop sidebar, a compact mobile navigation bar, original product screenshots, and a Homebrew copy control. Colour tokens come from the app's `src/styles/tokens-and-primitives.css`; secondary text is slightly brighter on the website for readability. The FAQ remains available in a disclosure below the download panel.

Publication target: `https://zachealy1.github.io/orchestrator/`, from the `codex/marketing-site` branch of `zachealy1/orchestrator`, repository root. `.nojekyll` serves the static files directly.

## Maintain the page

Update both download URLs, the visible release label and JSON-LD software version in `index.html` when a public release changes. Confirm Mac support, account requirements and signing/notarization status against the release notes before changing them. Keep the source and privacy links current. The optional Homebrew route is maintained separately in `zachealy1/homebrew-tap`; keep its pinned cask version and checksums aligned with the public release.

The PNG files are the project's existing public screenshots and icon. `social-preview.png` is the campaign's original social card. Never add private project screenshots or invent testimonials, user counts, stars or performance claims.

Preview locally with `python3 -m http.server 8765 --bind 127.0.0.1 --directory .`. Check desktop/mobile layouts, all screenshot tabs, keyboard navigation, FAQ disclosures and download destinations before publishing.

Check at 320px, 390px, 768px, 1024px and a full desktop width. Navigation should highlight the section in view and hash links should clear the mobile header. The Homebrew button copies the exact command shown; if clipboard access fails it selects the command and offers keyboard-copy guidance. Without JavaScript the original task screenshot, source links, download links and FAQ remain available.

The public IndexNow verification text file and sitemap are part of the deployed branch. Preserve both when publishing a redesign. Do not put design drafts or private campaign logs in this branch.

GitHub Pages build traffic and maintainer verification are campaign overhead, not organic user growth. Track referral aggregates and public release download counters in the campaign's local growth log.
