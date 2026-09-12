# Installation and updates

**0.2.0-beta.2 is an experimental community release for Apple Silicon and Intel.** It is ad-hoc signed, **not notarized by Apple**, and does not identify a verified Apple Developer. Check [Releases](https://github.com/zachealy1/orchestrator/releases) for the installer and its testing limitations. Choose the installer matching your Mac. The maintainer reports manual testing of the changes; packaging checks integrity without a separate installer or update rehearsal. See the [acceptance record](../release-acceptance.md).

1. In Apple menu → About This Mac, check whether your Mac has an Apple chip or Intel processor and runs macOS 15 or later. This is the minimum system requirement, not a claim of testing on every supported macOS version.
2. Download [Orchestrator_aarch64.dmg for Apple Silicon](https://github.com/zachealy1/orchestrator/releases/download/v0.2.0-beta.2/Orchestrator_aarch64.dmg) or [Orchestrator_x86_64.dmg for Intel](https://github.com/zachealy1/orchestrator/releases/download/v0.2.0-beta.2/Orchestrator_x86_64.dmg).
3. Open the disk image and drag Orchestrator to Applications. Eject the disk image, then launch the Applications copy.
4. Sign in with your own supported Codex account. Orchestrator includes a standalone Codex engine and GitHub CLI; it does not require a development toolchain for normal use. GitHub authentication is separate from Codex authentication.
5. Add a workspace and review its access/approval settings before sending a task. Test changes in a dedicated repository first.

## Community beta: macOS first-launch warning

macOS may block the non-notarized community beta because Apple cannot verify its developer or check its notarization. Only proceed if you obtained the exact release from this project's Releases page, reviewed its limitations and trust the source.

After the first launch attempt, open **System Settings → Privacy & Security**. If macOS offers **Open Anyway** for Orchestrator, you can use that app-specific exception, confirm and open the app. This is your decision, not an automatic installer step. An organisation-managed Mac may prohibit exceptions; contact its administrator instead.

Do not ignore a malware or damaged/tampered-app warning. Do not disable Gatekeeper globally, remove quarantine with terminal commands or change system security settings to force installation. Download again and report the exact error if the expected app-specific exception is unavailable. See [Apple's guidance for safely opening apps](https://support.apple.com/en-us/102445).

The published SHA-256 checksums help detect a corrupted download. They and Orchestrator's update signatures are **not Apple notarization or a guarantee that beta software is safe**. Developer ID/notarized releases, if provided later, will be explicitly labelled.

## Updates are your choice

The app checks for Orchestrator updates on startup, every six hours while open, and on returning online or to the foreground when the last check is old enough. It does not download updates automatically.

Open the account menu, then choose **Download update**. After download and signature verification, choose **Install and restart** separately. Finish active work first, including tasks in other workspaces, approvals, Goals, Kanban attempts and repository operations. Orchestrator will not stop work for you.

Sign in to access the account menu's update and support controls. Update packages are independent of the selected account and workspace.

Both architecture packages are available through the signed [beta updater feed](https://raw.githubusercontent.com/zachealy1/orchestrator/update-feed/beta.json). Installed beta.1 copies with the matching updater key can discover beta.2. Unconfigured source builds and existing **0.1.0** installations require a manual installation. Installing the application does not intentionally erase chats, accounts, generated images or worktrees. Keep backups before beta upgrades. Updates carry an independent cryptographic signature checked by Orchestrator; community updates remain non-notarized and macOS permission prompts may recur.

If updating is unsupported or the feed is unavailable, the menu shows **Download latest version**. Selecting it opens the Releases page directly. A user-triggered check that discovers unavailable updates also opens Releases, without a raw error panel. Background checks never open your browser, and temporary feed failures can recover on a later check. If an app cannot replace itself, use the same downloads action and replace it in Applications after quitting. Use only the app-specific first-launch procedure above; never disable macOS security protections globally. Keep the previous installer available for recovery, but do not downgrade an upgraded database into incompatible older software.
