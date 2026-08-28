# Xingchao Navigation implementation status

This document separates implemented behavior from planned release work. A passing web build is not evidence that platform signing, commercial content licenses, or a Cubism model exist.

## Implemented in the current baseline

- Wanta upstream is pinned at `470bbe1c0b48322e11d5955f9023362117776f09` on `codex/xingchao-platform`.
- Product branding, original logo, chief-assistant key art, and ten persistent crew themes.
- A domain dictionary plus TypeScript contracts for packs, providers, agents, crews, missions, events, themes, and memory records.
- Ten original crews and sixty original Agent profiles. Persona, professional authority, tool boundaries, delegation, relationships, voice, visuals, and evaluation cases are separate fields; only the renderer-safe runtime projection is consumed by imported-fleet UI and planning.
- Fleet Harbor and Mission Chart routes. The user can enter a goal, receive a deterministic recommendation across the active runtime fleet, change one primary and up to two support crews, inspect the DAG, confirm the crew theme, and dispatch a revision-matched mission into the existing Agent kernel.
- Lanxi orchestration rules in the kernel system prompt, using the existing OpenCode task helpers, permission cards, local tools, connectors, and artifact pipeline.
- A versioned content-pack JSON Schema plus manifest validation, path-traversal rejection, file-type allowlist, and unpacked-size limits. Packs cannot declare executable code.
- A user-facing Supply Depot backed by a main-process content-pack service. Users can list, import, select one installed
  version per pack ID, clear that selection, and remove local packs. File selection, compatibility checks,
  path/collision/symlink rejection, SHA-256 coverage, atomic installation, selection/removal confirmation, and selection
  persistence stay outside the renderer.
- Selection and runtime activation are distinct. Valid selected packs are projected into a renderer-safe runtime snapshot;
  imported crews, six-Agent rosters, routing signals, mission planning, and palette themes are active. Projection or refresh
  failure falls back to the complete built-in fleet instead of exposing a partial imported catalog.
- Eight-state Lanxi visual controller, six expression classes, static key-art fallback, crew overlay contract, and system-TTS preview. This is an adapter seam, not a Cubism model.
- The existing custom-model flow remains the credential boundary: keys stay encrypted through Electron `safeStorage` and are never returned to the renderer. First launch now requires a user-supplied model; OpenConnector stays optional.

## Inherited capabilities retained from Wanta

- Electron/React shell, loopback-only OpenCode sidecar, streaming chat events, approvals, projects, local files and terminal tools.
- Encrypted custom-model credentials, integrated browser, MCP/OpenConnector integration, Skills, connector discovery, artifacts, Word/PDF/Excel/image/code previews, task history, diagnostics, and Windows/macOS build targets.

## Not complete and must not be represented as complete

- A production Live2D Cubism model, motion/expression assets, ten rendered costume overlays, and a Live2D publication-license decision.
- Cloud or local STT/TTS provider adapters beyond the inherited recorder/transcription path and system-TTS preview.
- SQLite/FTS migration and a complete user-facing five-layer memory CRUD/export screen. The contracts exist; the Wanta persistence layer remains the runtime baseline.
- Runtime activation of content-pack paths, arbitrary assets, portraits, voices, Skills, full personas, tool declarations,
  or system-prompt roster injection. Imported palette values are active, but package files and executable capabilities are not.
- Provider-native Anthropic and Google protocol adapters. Current custom models run through OpenAI-compatible endpoints; presets do not change the wire protocol.
- Sixty-agent live-model evaluation. The profiles each carry three executable evaluation cases, but no paid-provider evaluation run was performed.
- Full rebrand of all upstream localized copy and every internal compatibility identifier. IPC, storage, diagnostics, and several update-safe identifiers intentionally remain `wanta` for migration safety.
- Windows signing, macOS Developer ID signing/notarization, updater infrastructure, release server, and public distribution approval.

## Verified on 2026-08-13

- `tsgo`: pass.
- `oxlint`: pass.
- Xingchao and operating-profile unit tests: 21/21 pass.
- Vite production build: pass for renderer, main process, and preload.
- Full upstream test invocation is not clean on this Windows host: POSIX path/mode assertions, symlink privileges, and absent Electron binary fail independently of the Xingchao tests.

## Weekly slice on 2026-08-14

- Added the main-process content-pack installer core with fail-closed checksum coverage and staging-directory cleanup.
- Added installer tests for a successful install, path traversal rejection, and checksum mismatch rejection.
- Added the Supply Depot route and a narrow main-process IPC service for list/import/remove operations.
- Added compatibility, reserved-ID, path-collision, symlink, inventory, removal, picker-cancellation, and confirmation tests.
- At the end of that 2026-08-14 slice, imported-pack activation remained intentionally unimplemented.

## Weekly slice on 2026-08-21

- Added a repository-level Git attributes contract that keeps text files on LF across Windows and Unix while excluding
  packaged applications, archives, fonts, documents, and raster assets from text conversion.
- Recovered an auditable Windows worktree after Git had reported 972 false modifications: tracked file content matched
  the index, but cached CRLF sizes conflicted with the LF checkout under the machine-wide `core.autocrlf=true` setting.
- That repository-recovery slice fixed build reproducibility only and did not itself change product behavior.
- As the next activation prerequisite, content-pack validation now requires complete runtime Agent, crew, and theme
  profiles; rejects duplicate IDs, unknown Agent crew assignments, and missing crew themes; and keeps the published JSON
  Schema synchronized with the runtime validator.
- At that prerequisite stage, imported packs were not yet active in fleet selection, routing, mission planning, or themes.
- Added a pure runtime content-catalog builder that keeps built-in IDs stable, namespaces imported crew, Agent, and theme
  IDs plus their internal references, records per-entity pack provenance, rejects selecting multiple versions of one pack,
  and fails closed on ambiguous runtime-ID collisions.
- Added an atomic main-process selection store for installed pack versions. The service accepts only installed versions,
  keeps at most one selected version per pack ID, requires a native confirmation before changing selection, survives app
  restart, clears selections when a selected version is removed, and repairs persisted selections that no longer point to
  a valid installed package.
- An unregistered main-process runtime manager can now build the namespaced catalog from the built-in fleet plus the
  explicitly selected installed versions. It serializes selection, installation, removal, and catalog reads; revalidates
  app-version compatibility after restart; and keeps inventory paths and catalog internals outside the registered RPC
  facade. The Supply Depot now exposes the confirmed selection contract, shows persisted selected/unselected state, and
  explicitly distinguishes persisted selection from successful runtime activation. The current renderer consumes a safe
  projection for crews, rosters, routing, mission planning, and palette themes; the inactive package capabilities listed
  above remain outside the Agent runtime.

## Weekly continuation on 2026-08-23

- Repaired the Windows bootstrap and development launch chain. Node 24 cannot spawn `.cmd` shims directly on this host;
  repository scripts now route child commands through `ComSpec` on Windows while retaining direct spawning elsewhere.
- Bootstrap now detects incomplete runtime outputs and explicitly replays the root `postinstall`. This recovers a checkout
  where pnpm recorded the root lifecycle as pending instead of incorrectly proceeding to `predev` with missing binaries.
- Completed a real Windows Electron smoke test in Chinese locale. Fleet Harbor rendered the built-in 10 crews and 60
  Agents, switching to Forgewake Crew changed its theme and six-Agent roster, Mission Chart accepted a goal and generated
  a crew recommendation plus task DAG, and Supply Depot rendered the trusted built-in 10-crew/60-Agent/10-theme pack.
- No mission execution, paid model request, pack import, installer build, GitHub Release, or public distribution was
  performed during this smoke test.

## Adaptive captain and complete-skin continuation on 2026-08-25

- Completed the manifest-driven global skin runtime and independent captain orchestrator through the deterministic
  visual-regression slice. All ten built-in fleets render complete shared-shell materials, scene layers, captain
  presentation, and fleet-specific visual language; switching is no longer represented by palette changes alone.
- Added adaptive captain `stage`, `companion`, and `compact` presentation modes, explicit mute/voice controls, persistent
  subtitles, reduced-motion behavior, high-contrast behavior, and deterministic turn-lifecycle priorities. This remains
  the approved layered-renderer fallback with a Live2D adapter seam; it is not evidence that a production Cubism model
  or licensed Live2D asset pack exists.
- Added an isolated Electron visual harness with exactly 50 reviewed 1440 × 852 PNG baselines: ten fleets across three
  standard captain modes, plus ten reduced-motion companion and ten high-contrast companion captures. The immutable
  comparison passed 54/54 with zero allowed pixel differences; the URL-confinement policy passed 1/1; the relevant
  captain layout/lifecycle matrix passed 56/56; project type checking and full lint also passed.
- Independent review initially found three Important defects: remote-authority `file:` handling, a double-applied stage
  width that approved an incomplete scene, and a partially frozen clock. All three were reproduced, fixed, covered by
  focused regressions, and independently re-reviewed with zero Critical, Important, or Minor findings remaining.
- As of that 2026-08-25 checkpoint, the complete-skin first version was **not yet accepted**. Electron end-to-end coverage for fleet selection, cross-page
  persistence, restart recovery, explicit voice enable/mute, asset-failure rollback, and accessibility remains Task 12;
  the complete acceptance/documentation gate remains Task 13.
- No paid model call, browser download, push, release, installer publication, or public distribution was performed.

## Adaptive captain complete-skin first-version acceptance on 2026-08-27

- The complete-skin first version is now accepted as a **local deliverable**. All ten built-in fleets atomically switch the
  shared shell, scene backdrop and foreground, component materials, crest, captain presentation, and persisted fleet
  selection. A required-asset failure leaves the prior complete skin active instead of exposing a partial switch.
- The captain is responsive across `stage`, `companion`, and `compact` layouts and reacts to task state. Voice remains
  opt-in and muted by default; explicit enable, key-event narration, one-click mute, persistent captions, reduced motion,
  and high contrast are covered. This is a high-quality layered animated captain with a Live2D interface seam; it is not
  Live2D and does not include a Cubism model or publication license.
- The tracked visual corpus contains exactly 50 reviewed baselines: ten fleets across three standard captain modes, ten
  reduced-motion companion captures, and ten high-contrast companion captures. The tracked skin corpus contains 60
  assets, with provenance recorded for each fleet family.
- The full Windows gate passed: 354 test files passed and 2 skipped; 2,889 tests passed and 19 skipped; type checking,
  lint, formatting of 1,103 files, renderer/main/preload build, all 54 visual scenarios, all 6 Electron end-to-end
  scenarios, and `git diff --check` exited successfully.
- Electron acceptance covers all ten fleet switches, cross-page persistence, restart recovery, explicit voice enable and
  mute, rollback, reduced motion, high contrast, and captain containment without horizontal overflow at 1024x640,
  1280x720, 1440x900, 1920x1080, and 2560x1440. A separate observable development smoke exercised the real desktop
  shell and all ten fleets without the previously reported Windows `0x80000003` application error.
- The Windows crash was isolated to Chromium's sandboxed GPU child in the Playwright Electron harness. Only the Windows
  visual/end-to-end launchers use `--no-sandbox`; the production desktop entry is unchanged. The harness still denies
  unexpected network navigation, uses temporary profile data, and performs no paid or external calls.
- Remaining work is explicitly outside this first-version acceptance: production Live2D/Cubism assets, migration of
  older `safeStorage` profile data, signed installers, release audit, push, and
  public distribution. No paid model call, download, push, release, or publication was performed.

## Windows external-Skill mirror reliability on 2026-08-28

- External Skill mirroring no longer asks Windows to recreate source symbolic links. Links that resolve within the Skill
  root are materialized as ordinary files and directories; links that escape the source root, directory cycles, and
  unsupported filesystem entries fail closed.
- Every copied entry is identity-checked after traversal, and directory inventories are compared before publication, so
  a concurrently replaced file, directory, symlink, or junction aborts the staged mirror instead of crossing the root.
- Managed-directory publication retains its staging, backup, and rollback boundary. Transient Windows `EPERM`, `EACCES`,
  and `EBUSY` rename failures receive three bounded retries; a failed staged publish restores the prior managed mirror.
- Focused filesystem tests exercise a real Windows junction, out-of-root rejection, transient rename recovery, and
  rollback preservation without requiring Developer Mode or administrator symlink privileges.
