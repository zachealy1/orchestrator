# Contributing

Orchestrator's original source is MIT licensed. Contributions are welcome as focused pull requests against `main`; by contributing, you agree that your original contribution is available under the same licence. Preserve third-party notices and do not contribute code or assets you cannot license.

Read the [development instructions](README.md#build-from-source) and [architecture guidance](docs/architecture-decomposition.md). Discuss large changes in an issue first. Include reproduction steps, tests and screenshots where they help, using synthetic data rather than real accounts or transcripts.

The public repository has independently published history with maintainer email metadata replaced for privacy. If you have a checkout from before publication, make a fresh clone; do not merge or push the original private history into this repository. Set your Git author email to your GitHub-provided `noreply` address before committing if you do not want your personal address published. GitHub's email privacy setting alone does not change existing commits.

Before opening a pull request, run:

```sh
npm ci
npm run lint
npm test
npm run test:release
npm run check:release
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
git diff --check
```

Never edit generated Tauri bindings by hand; use `npm run generate:bindings`. Keep existing database migrations immutable. Do not increase the recorded architecture baseline to accommodate new debt. Forked pull requests run credential-free checks only; maintainers run credentialed release checks from trusted code in protected environments.

Do not add credentials, local account data, private transcripts, signing material or private audit reports. Public Actions logs and rehearsal artifacts can be downloaded by others. Report vulnerabilities privately using [Security](SECURITY.md), not an ordinary issue.

Installer publication is separate from source contributions. See the [release runbook](docs/releasing.md) and [acceptance checklist](docs/release-acceptance.md). A passing source build does not authorize a signed release.
