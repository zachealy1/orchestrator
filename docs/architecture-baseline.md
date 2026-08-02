# Architecture Baseline

Recorded before the architecture decomposition on 2026-08-02.

## Static size

| Surface | Baseline |
| --- | ---: |
| `src/App.tsx` | 21,332 lines |
| `src/App.auth.test.tsx` | 14,047 lines |
| `src/App.css` | 6,987 lines |
| `src/db.ts` | 2,280 lines |
| `src/components/TaskChatTranscript.tsx` | 3,923 lines |
| `src/components/VirtuosoTaskChatTranscript.tsx` | 1,887 lines |
| `src-tauri/src/lib.rs` | 9,979 lines |

## Verification baseline

- Frontend: 64 files and 688 tests passed. The monolithic App suite contained 212 tests and completed in approximately 58 seconds on the reference machine.
- Production build: passed; the main JavaScript chunk was approximately 1.06 MB before gzip.
- Rust: 112 tests passed with `--no-default-features`.
- Existing transcript diagnostics cover latest-turn landing, workspace restoration, variable-height rows, manual scrolling, live following, and coordinated drawer resizing.

These figures are regression baselines, not targets. The architecture check prevents growth while feature extraction is underway; its limits are tightened to the acceptance targets as legacy modules are removed.

## Dependency direction

Production dependencies flow in one direction:

`shared` -> `features` -> `app`

- `shared` contains domain-neutral primitives and cannot import feature or app composition.
- `features` own their state, services, types, components, and tests; they cannot import application composition.
- `app` creates services and composes feature controllers and layouts.
- Native calls enter through committed generated bindings and domain clients only.
- App Server payloads remain `unknown` until a feature adapter validates them.
