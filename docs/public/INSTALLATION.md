# Installation and updates

**Signed installers are not available yet.** These instructions describe the forthcoming signed beta. Source publication and local development builds do not satisfy installer release gates. Check [Releases](https://github.com/zachealy1/orchestrator/releases) for availability.

1. In Apple menu → About This Mac, check whether your Mac has an Apple chip or Intel processor and runs macOS 15 or later.
2. Download the matching `.dmg` from the public Releases page. The `.app.tar.gz` files are packages for the in-app updater, not the normal first-install download.
3. Open the disk image and drag Orchestrator to Applications. Eject the disk image, then launch the Applications copy.
4. Sign in with your own supported Codex account. Orchestrator includes a standalone Codex engine and GitHub CLI; it does not require a development toolchain for normal use. GitHub authentication is separate from Codex authentication.
5. Add a workspace and review its access/approval settings before sending a task. Test changes in a dedicated repository first.

## Updates are your choice

The app checks for Orchestrator updates on startup, every six hours while open, and on returning online or to the foreground when the last check is old enough. It does not download updates automatically.

Open the account menu, then choose **Download update**. After download and signature verification, choose **Install and restart** separately. Finish active work first, including tasks in other workspaces, approvals, Goals, Kanban attempts and repository operations. Orchestrator will not stop work for you.

Update and support controls are also available from the menu beside the sign-in button when signed out. Updates are independent of the selected account and workspace.

Existing unsigned/development **0.1.0** installations require one manual installation of the first signed, updater-enabled beta. Installing the application does not intentionally erase chats, accounts, generated images or worktrees. Keep backups before beta upgrades.

If an app cannot replace itself, download the installer manually and replace it in Applications after quitting. Never disable Gatekeeper or remove macOS security protections to install an update. Keep the previous installer available for recovery, but do not downgrade an upgraded database into incompatible older software.
