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
- The existing custom-model flow remains the credential boundary: keys stay encrypted through Electron `safeStorage` and are never returned to the renderer. Missing, usable, and undecryptable credentials are distinguished; an undecryptable model is not treated as configured or selectable, and users can explicitly replace its key or delete it without decrypting the old ciphertext. First launch requires a user-supplied usable model; OpenConnector stays optional.

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
- A persistent multi-Agent mission scheduler. A confirmed Mission now has an atomic single-turn run ledger, restart-to-blocked recovery, user-facing run history, guarded whole-run retries and failed-write repair. Individual DAG node admission, dependency-aware scheduling, per-node retries and deliverable acceptance remain unimplemented.
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
- Remaining work is explicitly outside this first-version acceptance: production Live2D/Cubism assets, automatic
  cross-account recovery of old `safeStorage` plaintext (which is impossible without the source account key), signed installers, release audit, push, and
  public distribution. No paid model call, download, push, release, or publication was performed.

## Four-plane fleet scene integration on 2026-09-02

- Promoted `scene.midground` and `scene.light` into the closed fleet-skin asset contract. The built-in registry now
  contains exactly 80 assets across ten crews and eight roles; every manifest binds same-crew backdrop, midground,
  light, foreground, captain, and crest resources.
- Atomic switching treats backdrop and midground as required resources. Light and foreground remain optional
  decoration: either may degrade without exposing a partially switched required scene.
- The shared application scene and layered captain renderer now compose backdrop, midground, scrim, captain,
  transparent light, and foreground planes. Reduced-motion mode removes decorative light/foreground motion through the
  existing accessibility contract.
- Repaired visual-Harness drift left by the captain-layout extraction: the Harness now resolves a
  `CaptainLayoutDecision` through the same layout function used by the application instead of passing removed legacy
  props to `CaptainHost`.
- Regenerated and reviewed all 50 tracked 1440 × 852 visual baselines after inspecting the ten standard stage
  compositions for face/figure integrity, control and text readability, clear work areas, transparent-edge intensity,
  and fleet distinction. The update run passed all 54 visual scenarios with zero test failures.
- The immutable screenshot gate permits at most 64 differing pixels per capture. Repeated Windows/Electron runs showed
  5-51 GPU/WebP edge pixels of variance with identical layout, so a zero-pixel threshold was not reproducible; 64
  remains below a visible composition change.
- No paid model call, network download, push, release, installer publication, or public distribution was performed.

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

## Weekly credential-recovery slice on 2026-09-04

- Restored deterministic repository quality gates by excluding local `.worktrees` and `.pnpm-store` dependency trees
  from lint and formatting scans, and normalized the eight tracked files that the formatter had identified. The local
  pnpm store remains untracked and was not deleted or staged.
- The public custom-model catalog now derives `configured`, `missing`, or `unavailable` from the secure credential store
  instead of trusting stale metadata. An unavailable custom model falls back to the built-in runtime choice and no
  longer satisfies setup or chat readiness checks.
- Explicit replacement no longer decrypts the prior ciphertext first. Credential mutation and metadata persistence form
  a coordinated transaction: a metadata failure restores the prior opaque ciphertext exactly, while delete works for
  ciphertext that the current operating-system account cannot decrypt. Ciphertext never crosses the main-process API.
- The model editor explains that the saved key cannot be unlocked, requires a newly entered Key before Save is enabled,
  and retains deletion as a recovery option.
- Added a reusable, network-free `smoke:model-credentials` acceptance path. It bundles the production credential/model
  services, starts real Electron twice against a temporary user-data directory, classifies synthetic invalid ciphertext,
  replaces it with a dummy Key after restart, deletes the model, and removes the temporary directory.
- The deterministic full gate passed 358 test files with 2 skipped and 2,908 tests with 20 skipped; lint, formatting of
  1,115 files, type checking, renderer/main/preload build, the real Electron credential smoke, all 54 fleet visual
  scenarios, all 6 fleet Electron end-to-end scenarios, and `git diff --check` also passed. The default parallel test run
  still exposes a documented Windows load-sensitive timeout in the external WebP conversion test; the same complete suite
  passes with file parallelism disabled and one worker.
- The next single highest-priority slice is a main-process-owned, persistent single-node Mission lifecycle with explicit
  admission, event records, recovery, and tests; only after that boundary is proven should execution expand to a DAG.

## Local Mission lifecycle checkpoint on 2026-09-06

- The uncommitted working tree now persists one confirmed Mission as one Agent turn: host-validated admission,
  immutable blueprint, exact session/generation binding, ordered terminal events and restart-to-blocked recovery.
  This does not implement individual DAG node scheduling or certify deliverable correctness.
- Internal retry accepts only the latest failed/cancelled/blocked attempt, revalidates the fleet, requires the original
  chat session when bound, and atomically creates one new attempt without changing its predecessor. Chat dispatch
  reconstructs the stored goal instead of trusting renderer text. Concurrent duplicate/stale requests are rejected.
- A failed terminal write preserves the first verified outcome in memory and exposes `persistencePending` in the
  query/event projection. Repair can retry that exact write without invoking the Agent. Restart still conservatively
  blocks unresolved durable runs rather than inventing their outcome.
- Latest focused verification: 4 files and 141 tests passed, covering store, manager, ChatService and Voyage launch.
  The real Electron smoke passed three isolated launches, preserving completed runs and appending recovery once.
  The preceding full-suite checkpoint passed 2,937 tests with 20 skipped; it predates the final four retry/repair tests
  and must not be presented as a full-suite rerun of this final checkpoint.
- Final checkpoint type checking, lint, formatting (1,126 files), renderer/main/preload production build and
  `git diff --check` passed. The build retains large-chunk and deprecated `inlineDynamicImports` warnings; these are
  not installer or release acceptance. The smoke removed its own temporary profile and bundle directories.
- User-facing run history, confirmation/retry controls, original-chat navigation and save-failure notifications are
  **not implemented**. Renderer transport fields are prerequisites only, not a completed recovery interface.
- Independent review and the formal security scan are **not completed**. Both delegated tasks failed on account usage
  limits. Git audit/commit/push, paid-provider task acceptance, signed installers and public distribution remain undone.
- The user requested a checkpoint near 50% remaining usage; the weekly window reached 49% remaining. Development
  expansion stopped and the exact continuation is recorded in
  `docs/superpowers/plans/2026-09-06-delivery-continuation.md`. No reset credit was consumed.

## Mission recovery interface acceptance on 2026-09-10

- Mission Chart now shows durable run history with goal, attempt, status, timestamps and events ordered by their
  persisted sequence. A completed status is described as the Agent turn ending, not acceptance of its deliverable.
- Retrying is a confirmed new execution, never checkpoint resume. The renderer and main process require the latest
  failed/cancelled/blocked attempt, the current fleet revision, no pending settlement write and the exact original chat.
  Records without an original chat cannot be redirected into an arbitrary conversation and instead require replanning.
- The retry confirmation warns about repeated effects, cancel sends nothing and an in-flight guard prevents duplicate
  dispatch. Rejected attempts preserve the existing history and expose only localized generic errors.
- A failed terminal write raises an application-wide notification and can be repaired from Mission Chart without
  executing the Agent again. The main process retains the first verified terminal outcome as the repair source.
- The isolated real-Electron acceptance passed with main/renderer IPC, restart-to-blocked recovery, original-chat
  navigation, cancel, one preserved predecessor plus one completed retry, failed-write repair, no external model call and
  no horizontal overflow at 1024 x 640.
- The deterministic full gate passed 363 test files with 2 skipped and 2,962 tests with 20 skipped. Type checking, lint,
  formatting of 1,139 files, renderer boundary scanning, `git diff --check` and renderer/main/preload production builds
  also passed. The build retains the documented large-chunk and deprecated `inlineDynamicImports` warnings.
- This is local product acceptance only. Paid-provider behavior, retention/export and corrupt-ledger recovery, signed
  installers, release publication and per-node Mission scheduling remain separate delivery gates.

## Mission recovery delivery verification on 2026-09-12

- Fixed three acceptance defects: synthetic compaction continuations retain the active Mission failure boundary;
  external Agent runtime errors no longer require OpenCode-specific transcript error evidence; retries that fail
  before start retain their original conversation through the durable attempt history, including after restart.
- The full deterministic suite passed 363 files with 2 skipped: 2,965 tests passed and 20 skipped. Type checking,
  lint, formatting of 1,139 files and renderer/main/preload production builds passed. Existing large-chunk and
  deprecated `inlineDynamicImports` build warnings remain.
- Both real Electron Mission smoke paths passed: three-launch restart recovery and the IPC recovery interface,
  original-chat navigation, cancelled confirmation, preserved retry history, write repair and 1024 x 640 containment.
- All 54 immutable fleet visual scenarios and all 6 fleet Electron end-to-end scenarios passed.
- Independent review identified the external-Agent error defect; its failing regression was reproduced and fixed.
  The reviewer subsequently hit an account usage limit, so post-fix independent re-review and a formal security scan
  are not claimed. The coordinator completed the remaining fixes and regression checks.
- Real-provider acceptance still requires the user's provider choice and spending ceiling. No paid model request,
  signed installer or public application release is represented by these local checks.

## Mission backups and corrupt-ledger recovery on 2026-09-12

- Mission Chart now exposes native-file-dialog JSON export of the full validated Mission ledger. The renderer
  cannot choose filesystem paths or supply replacement ledger contents through IPC. Pending settlement writes must
  be repaired before export; exporting does not delete records or copy the credential store.
- History is retained without automatic deletion. The interface shows the record count and warns near the existing
  1,024-record or 16 MiB limit. Archive rotation/deletion is not implemented; export does not free ledger capacity.
- Malformed JSON, unsupported formats and invalid event histories are distinguished from operational read failures.
  Only a corrupt ledger in a process that has not loaded live Mission state can be restored from a validated backup.
  Native confirmation defaults to cancellation. The original damaged bytes are preserved in a uniquely named
  `mission-runs.corrupt-*.json` file before atomic replacement; active backup entries become blocked, never auto-run.
- Backups restore only Mission records, not conversations or deliverable files. Entries newer than the chosen backup
  cannot be recreated. Normal healthy history cannot be replaced through this recovery action.
- The real Electron smoke exercises full export plus a second isolated launch with corruption, recovery via IPC and
  preserved original bytes. File selection/confirmation is scripted in that harness; native-dialog cancellation,
  format validation and default-cancel semantics have separate tests. Independent code review found no defects.
- Final verification passed 366 test files with 2 skipped: 2,981 tests passed and 20 skipped. Type checking, lint,
  formatting of 1,144 files, renderer boundary tests, the extended Electron Mission smoke, production builds and
  `git diff --check` passed. Existing build chunk-size/deprecation warnings remain; this is not installer acceptance.

## Mission retry and dispatch-save repair on 2026-09-16

- Mission retries now keep history mounted until direct dispatch succeeds. Permission persistence and dispatch
  failures remain on the history route, preserving actionable error feedback; ordinary chat navigation is unchanged.
- A pre-start dispatch failure whose terminal write fails is retained as a pending settlement, emits the existing
  persistence notification, and can be repaired without invoking the Agent. The first failure reason survives late
  outcomes and duplicate repair requests. Pending writes block admission replay, start, prompt retrieval and export.
- Added real-hook regressions for permission failure, dispatch failure, original-session routing and ordinary sends.
  The isolated Electron IPC smoke now repairs both chat completion and dispatch failure, checks that repair creates
  no new run, and still verifies retry history, backup export, corruption recovery and 1024 x 640 containment.
- The full deterministic suite passed 367 test files with 2 skipped: 2,989 tests passed and 20 skipped. Type checking,
  lint, formatting, production renderer/main/preload builds, the real Electron smoke and `git diff --check` passed.
  Existing large-chunk and deprecated `inlineDynamicImports` build warnings remain.
- An earlier independent review identified the two repaired defects; post-fix independent re-review was unavailable
  due to account usage limits. No new independent review or formal security-scan success is claimed.
- This checkpoint is local and uncommitted. It preserves the existing Agent read-permission changes and Windows
  candidate notes. No paid provider request, installer rebuild or public release was performed in this checkpoint.
- The supplied WebCodex article was checked against primary documentation. See
  `docs/webcodex-method-2026-09-16.md` for the connection method and its distinction from an in-app model provider.

## Windows signed-candidate preparation on 2026-09-16

- The release target is a signed Windows x64 stable build. The user has no signing certificate yet; no unsigned
  public release is authorized or represented by this checkpoint.
- Replaced upstream publication with a manual artifact-only signed-candidate workflow. The installer and executable
  must have valid matching publisher signatures and timestamps. Missing signing credentials fail closed.
- Fixed the project update repository, beta selection, downgrade policy and renamed-asset metadata. Retained Chromium
  notices and added a complete ASAR integrity gate after discovering a corrupt earlier local archive.
- Final local verification passed 371 test files with 2 skipped: 3,000 tests passed and 20 skipped. Type checking, lint,
  formatting of 1,156 files, production builds, the unsigned NSIS build, archive validation, isolated packaged startup
  and restart smoke, and `git diff --check` passed. Independent review closed the release fixes.
- No hosted CI, paid provider call, signed install/upgrade/uninstall or public release was performed. Source changes
  remain local and uncommitted. See `docs/windows-release-readiness.md` for artifact identity, remaining acceptance
  gates and unresolved dependency notice metadata; see `docs/release.md` for the signing and promotion runbook.
