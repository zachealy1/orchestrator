# Orchestrator 0.2.0-beta.2

Free community release for **Apple Silicon and Intel**, ad-hoc signed and **not notarized by Apple**.

Download **Orchestrator_aarch64.dmg** for Apple Silicon or **Orchestrator_x86_64.dmg** for Intel. Both require macOS 15 or later. Read the [installation and macOS first-launch instructions](https://github.com/zachealy1/orchestrator/blob/main/docs/public/INSTALLATION.md).

## Changes

- In-app updates use independently signed packages for both Mac architectures. No Apple account, subscription or paid update service is required.
- Checks happen automatically; **Download update** and **Install and restart** remain separate user actions.
- Unsupported builds and unavailable update feeds offer **Download latest version**, opening the downloads page directly. The raw release-JSON error panel has been removed.
- Installation still waits for active tasks, approvals and repository operations to finish. Application data and the bundled engine retain their existing upgrade handling.

Installed beta.1 copies with the matching updater key can discover this release. Unconfigured source builds and older 0.1.0 copies need manual installation. Keep old installers and back up important data before beta upgrades.

## Packaging and limitations

This release is built with package integrity checks and **is not behaviorally tested**. No test suites, manual testing or update rehearsal were run for it. The package receipts record the source commit, architecture, signature verification and artifact hashes; those checks are not claims of runtime testing.

macOS may require **Open Anyway** at first launch or ask for permissions again after an update. Updater signatures and checksums verify package integrity, not Apple approval. Browser, Computer Use and Plugins remain experimental and can depend on separately installed upstream components.

The bundled engine and GitHub CLI use your own supported accounts. Ordinary AI usage remains subject to those accounts' limits or charges. This release adds no paid update infrastructure.

Report reproducible issues through [public issues](https://github.com/zachealy1/orchestrator/issues/new/choose), without credentials, personal paths or private transcripts.
