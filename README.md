# Orchestrator website

Public product landing page for Orchestrator. Plain HTML, CSS and JavaScript; no build dependencies or analytics scripts.

Publication target: `https://zachealy1.github.io/orchestrator/`, from the `codex/marketing-site` branch of `zachealy1/orchestrator`, repository root. `.nojekyll` serves the static files directly.

## Maintain the page

Update both download URLs, the visible release label and JSON-LD software version in `index.html` when a public release changes. Confirm Mac support, account requirements and signing/notarization status against the release notes before changing them. Keep the source and privacy links current. The optional Homebrew route is maintained separately in `zachealy1/homebrew-tap`; keep its pinned cask version and checksums aligned with the public release.

The PNG files are the project's existing public screenshots and icon. `social-preview.png` is the campaign's original social card. Never add private project screenshots or invent testimonials, user counts, stars or performance claims.

Preview locally with `python3 -m http.server 8765 --bind 127.0.0.1 --directory .`. Check desktop/mobile layouts, all screenshot tabs, keyboard navigation, FAQ disclosures and download destinations before publishing.

GitHub Pages build traffic and maintainer verification are campaign overhead, not organic user growth. Track referral aggregates and public release download counters in the campaign's local growth log.
