# Adaptive captain and fleet-skin verification record

Verification date: 2026-08-27 (Asia/Shanghai)

Scope: the first locally deliverable version of the manifest-driven global skin runtime and independent captain orchestrator.

## Result

Accepted as a local deliverable. All ten built-in fleets meet the complete-skin standard: the shared shell, background,
foreground, component materials, crest, and captain presentation switch together. The captain is responsive and stateful,
voice is explicit opt-in with persistent captions, and an incomplete asset load rolls back the whole presentation.

The captain uses high-quality layered animation with voice-state linkage. A stable renderer boundary is reserved for
Live2D, but this version is not Live2D and contains no Cubism model or publication-license claim.

## Recorded evidence

| Check                       | Verified result                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Type checking               | Passed                                                                                 |
| Lint                        | Passed                                                                                 |
| Formatting                  | Passed; 1,103 files checked                                                            |
| Full unit/integration suite | 354 files passed, 2 skipped; 2,889 tests passed, 19 skipped                            |
| Visual regression           | 54/54 scenarios passed with immutable baselines                                        |
| Electron end-to-end         | 6/6 scenarios passed                                                                   |
| Production build            | Renderer, main process, and preload passed                                             |
| Repository hygiene          | `git diff --check` passed; no credentials or generated build outputs staged            |
| Observable desktop smoke    | Real development shell launched and exercised without the reported `0x80000003` dialog |

## Coverage matrix

The accepted fleet IDs are `watchtide`, `ink-sail`, `brocade-harbor`, `forge-vessel`, `golden-scale`, `helm-order`,
`iron-code`, `lighthouse`, `phantom-wave`, and `rest-harbor`.

Exactly 50 tracked PNG baselines cover:

- 10 fleets x 3 standard captain modes (`stage`, `companion`, `compact`);
- 10 reduced-motion companion captures;
- 10 high-contrast companion captures.

The Electron acceptance suite switches every fleet and verifies atomic background, component, captain, and setting state;
cross-page continuity; restart restoration; default mute; explicit voice enable; one-click mute; persistent captions;
reduced motion; high contrast; and rollback after a required-asset failure. Captain containment and absence of horizontal
overflow are asserted at 1024x640, 1280x720, 1440x900, 1920x1080, and 2560x1440.

## Windows crash resolution

The reported exception code was reproduced as process exit `0x80000003`. Chromium logged that its GPU process was not
usable; the child exited with Windows status `0xC0000135`. The failure occurred only when Playwright launched Electron's
sandboxed Chromium child in this automation session. The Windows-only visual/E2E launcher now supplies `--no-sandbox`.
Production Electron startup, permission policy, local-resource confinement, and the application entry point are unchanged.

## Deliberate exclusions and residual risks

- External Skill mirroring can still record `EPERM` for directory replacement or unprivileged symbolic links on this host.
- Existing encrypted credentials from another Windows profile context can still emit a `safeStorage` decryption warning.
- Production Live2D/Cubism assets, signed installers, notarization, updater infrastructure, and publication are not complete.
- No paid model call, external message, browser download, push, release, or public publication was performed.

These exclusions do not invalidate the complete-skin local acceptance, but they remain blockers for a signed public release.
