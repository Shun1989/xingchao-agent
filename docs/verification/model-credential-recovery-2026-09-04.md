# Model credential recovery verification — 2026-09-04

## Accepted scope

This weekly slice distinguishes configured, missing, and undecryptable custom-model credentials; prevents unavailable
credentials from satisfying setup/runtime selection; and gives users an explicit replacement or deletion path without
decrypting the old ciphertext. It also restores deterministic repository lint/format coverage and records the current
GitHub research/Star evidence.

The implementation does not recover plaintext encrypted for another operating-system account, add a provider-native
protocol, call a paid model, publish an installer, or create a GitHub Release.

## Verification evidence

| Gate                         | Result                      | Evidence                                                                                                                                                                                                                |
| ---------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint                         | Pass                        | `corepack pnpm run lint`; exit 0.                                                                                                                                                                                       |
| Format                       | Pass                        | `corepack pnpm run format`; all 1,114 matched files correctly formatted; exit 0.                                                                                                                                        |
| Type check                   | Pass                        | `corepack pnpm run ts-check`; exit 0.                                                                                                                                                                                   |
| Default parallel tests       | Not accepted                | One WebP conversion test exceeded its 5-second limit under full parallel load and caused the next process-spawn assertion to time out: 357 files passed, 2 skipped, 1 failed; 2,906 tests passed, 20 skipped, 2 failed. |
| Deterministic full tests     | Pass                        | `vitest run --no-file-parallelism --maxWorkers 1`; 358 files passed, 2 skipped; 2,908 tests passed, 20 skipped; exit 0 in 162.97 seconds.                                                                               |
| Production build             | Pass with existing warnings | Renderer, Electron main, and preload builds completed; existing chunk-size and `inlineDynamicImports` deprecation warnings remain.                                                                                      |
| Real Electron recovery smoke | Pass                        | `corepack pnpm run smoke:model-credentials`; two isolated Electron launches verified `unavailable -> configured -> missing`; exit 0.                                                                                    |
| Fleet visual regression      | Pass                        | `corepack pnpm run visual:test`; all 54 scenarios passed across ten fleets and their stage, companion, compact, reduced-motion, and high-contrast compositions.                                                         |
| Fleet Electron acceptance    | Pass                        | `corepack pnpm run e2e:fleet-skins`; all 6 scenarios passed for atomic ten-fleet switching, cross-route continuity, restart recovery, opt-in voice, asset rollback, and accessibility.                                  |
| Patch hygiene                | Pass                        | `git diff --check`; exit 0. Local pnpm store, dependencies, build products, and temporary smoke data are excluded.                                                                                                      |

The Electron smoke bundles the production credential/model services, uses a temporary user-data directory, synthetic
invalid ciphertext, dummy credentials, and `.invalid` endpoints. It makes no model request and removes the temporary
root in a `finally` block.

## Security review

The Codex Security diff launcher was attempted with the canonical path, forward-slash path, and Windows extended path.
Each attempt returned `Review changes requires the checked-out Git repository root as the target`, even though local
Git identified the same directory as the repository root. No formal scan was claimed.

A separate read-only local diff review found no new confirmed vulnerability in this slice. It verified that plaintext
credentials remain confined to the main process, renderer summaries expose only status, unavailable selections fall
back in the main process, rollback restores opaque ciphertext, and the smoke path has no network call.

Residual architectural risks remain explicit:

- credential and model metadata use two independent atomic files, so a process crash or a second writer could leave an
  orphan or inconsistent record; the current mutation queue serializes only this main-process service;
- changing an existing custom model endpoint while leaving its API key blank reuses the stored key, an inherited flow
  that should eventually require key re-entry or explicit confirmation when the endpoint changes;
- a completely corrupt credential JSON file or unavailable secure-storage backend is classified as `unavailable`, but
  cannot necessarily be repaired by the per-record replacement path;
- the inherited sidecar still receives runtime provider configuration through a process environment variable.

## Publication boundary

On 2026-09-04, `gh auth status` identified `Shun1989`; GitHub reported push/admin permission on the public
`Shun1989/xingchao-agent` origin. The `oomol-lab/wanta` upstream push URL was `DISABLED`. Publication is limited to an
ordinary non-force push of the current `codex/xingchao-platform` branch to `origin`; no merge or Release is included.
