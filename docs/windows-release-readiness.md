# Windows release readiness

## Target and current decision

On 2026-09-17, the user changed the first-release target from signed stable to **unsigned Windows x64 public beta**, declining the signing budget. The publisher is an individual resident in mainland China. No certificate purchase is required for the selected beta path. No public release, tag, upload, signing-key creation, or paid model call has been performed in this preparation run.

The signed-candidate workflow remains separate and fails when signing credentials are missing. The new beta path must validate the actual unsigned state, publish only beta metadata, retain archive verification and disclose its acceptance boundaries. See [the beta runbook](windows-beta.md). Unsigned authorization does not waive the existing third-party redistribution blocker or turn a local package into a public release.

## Engineering work

- Mission retry keeps its history visible until dispatch succeeds. Failed dispatch-result persistence can be repaired without another Agent execution.
- The inherited upstream OSS publishing workflow has been replaced with a Windows-only, manually dispatched candidate build. Packaging and runtime updates now target this project's GitHub repository.
- Signed candidate staging checks the installer and application executable for valid Authenticode signatures, matching publisher certificates and timestamps before uploading an Actions artifact.
- Windows packaging retains Chromium attribution. The post-pack hook parses package metadata, checks the entry point and validates every regular ASAR entry against its SHA-256 integrity record, including unpacked files.
- A real packaged-process probe covers isolated first-run onboarding, model-dialog validation and cancellation, restart, and profile-marker preservation. It uses a fixed Chinese locale and does not configure or call a model. It is not an installer lifecycle test.

## Packaging defect found during acceptance

The earlier local package at `release/0.1.0/win-unpacked/resources/app.asar` is not a valid candidate: extracting its `package.json` produces unrelated JavaScript text and Electron exits before loading the app. Both Electron's startup exception and the packaging tool's independent ASAR reader confirmed the bad bytes. The original cause of that archive corruption has not been established.

The engineering build under `release/readiness-2026-09-16/` passed archive validation and reached the real first-run interface. It remains unsigned. Do not distribute the old package or describe the new engineering build as a signed release.

## Final local evidence (2026-09-16)

- Full deterministic suite: 371 files passed, 2 skipped; 3,000 tests passed, 20 skipped.
- Type checking, lint, formatting of 1,156 files, production renderer/main/preload builds and `git diff --check` passed. Existing large-chunk and deprecated `inlineDynamicImports` build warnings remain.
- Independent review closed the locale-dependent smoke failure, staged asset-name mismatch and beta-provider selection issues. The actual installed GitHub provider fixture skips alpha/custom prereleases when beta is selected, and downgrade remains disabled.
- Final-source Windows NSIS build completed with `--publish never`. Its post-pack archive gate and a separate archive validation both passed. The real packaged probe passed with the default sandbox, a fixed locale and an isolated temporary profile; it made no model request.
- Engineering installer: `release/readiness-2026-09-16/星潮航局-0.1.0-Setup.exe`, 276,162,584 bytes. SHA-256: `0A84525073A14D346E5BAEB006B3CA352660CFB750ACF03386C3E5BF87BE2F4F`. Windows Authenticode result: `NotSigned`.
- Source changes remain local and uncommitted. The hosted Actions workflow, signed installer lifecycle and public update service were not executed by these local checks.

## Remaining signed-stable gates (deferred)

1. Confirm a provider's acceptance of the mainland-China individual applicant, approve the signing budget and complete identity validation. The current workflow only supports an electron-builder-compatible PFX secret; it is not yet integrated with a token/HSM or cloud signing service. Newly issued publicly trusted certificates cannot be assumed to provide an exportable PFX. Adapt the signing integration before building a public candidate. See the [individual signing decision](release.md#individual-publisher-signing-decision) for the proposed SSL.com enquiry and cost estimate. Never place a private key or password in Git or chat.
2. Build the signed candidate from the final reviewed source and verify the actual downloaded signatures, publisher identity and timestamps.
3. Run real-provider Mission acceptance: successful files, permission decisions, cancellation, provider failure and restart. Existing deterministic tests and no-model packaged probes do not replace this.
4. Test install, upgrade and uninstall of that signed candidate on a clean supported Windows system; verify user data retention.
5. Finish exact-candidate dependency/binary notices review and verify the live GitHub update path before public promotion.

## Current beta distribution blockers

The unsigned beta target is `0.1.0-beta.1`.

- The user authorized replacement of the two connection dependencies. `electron/ipc/` is a new
  first-party implementation derived from application contracts and tests, not their source or
  declarations. Fourteen services now have exhaustive method allowlists. Both packages have been
  removed from the manifest, lockfile and installed dependency graph. Older candidate binaries
  still contain the removed code and must not be distributed; use the post-migration evidence below.
- The local GitHub CLI credential returned 401. The connected repository API confirmed the public
  target `Shun1989/xingchao-agent` and an empty release list; the user is restoring local login.
  Upload access has not yet been confirmed restored.

Identified notice omissions for khroma, Univer telemetry, Claude SDK, Lark CLI and ripgrep have
been addressed in source packaging. The first three retain their original license files under
`resources/licenses/`; Lark and ripgrep have version-specific attribution and the complete MIT
text in `THIRD_PARTY_NOTICES.md`. The actual candidate must contain these before acceptance. This
does not establish a complete transitive inventory or satisfaction of Claude's commercial terms.

## Historical pre-migration unsigned beta evidence (2026-09-17)

- Version: `0.1.0-beta.1`. The reviewed beta workflow is separate from signed stable and has not
  been run on GitHub Actions. No release, tag, upload, commit or push was performed.
- Focused verification: 8 test files / 25 tests passed, including the installed builder's actual
  update-metadata generation behavior. Full TypeScript, lint and format checks (1,162 files), plus
  `git diff --check`, passed. The earlier 3,000-test suite result is historical; a second complete
  suite was not run for this packaging-only change.
- Production build and final NSIS packaging passed. Actual output includes `beta.yml`, no
  `latest.yml`, and an embedded GitHub feed explicitly set to `beta` and `prerelease`. Independent
  review closed the missing explicit channel parameter after a real build exposed it.
- Actual installer and application executable both report Authenticode `NotSigned`. ASAR integrity
  and packaged clean onboarding, model-dialog validation/cancel, restart and temporary-profile
  preservation passed. No model call was made by this probe.
- The local staged candidate is `release/0.1.0-beta.1/candidate/`. Its 13 SHA-256 entries were
  independently recomputed; beta SHA-512/size, renamed-asset size metadata and original license
  bytes in both staging and installed resources also match.
- Installer: `xingchao-navigation-setup-0.1.0-beta.1.exe`, 276,167,766 bytes. SHA-256:
  `19965751615d98a35d9ef8f503286bfec58727ed4255425c6baf779ff71cae2a`.
- This is a local candidate only. Dependency authorization, complete notices review, real-provider
  acceptance and installer lifecycle checks remain outstanding; it must not be publicly uploaded
  merely because these engineering checks passed.

## Current first-party IPC candidate evidence (2026-09-17)

- Replaced both connection dependencies with first-party `electron/ipc/` code. No removed-package
  implementation or declarations were consulted or copied. Fourteen shared service descriptors
  contain 150 explicit invocation methods; internal and inherited methods are not exposed.
- Manifest, lockfile and the synchronized installed dependency graph exclude both removed
  packages. The frozen-lockfile install succeeded without postinstall scripts. The lockfile
  removed five no-longer-needed packages without upgrading unrelated dependencies.
- Full deterministic suite with four workers: **3,018 passed, 20 skipped, zero failures**.
  The first run exposed the pure-module allowlist migration and an unrelated image-conversion
  timeout under load; the allowlist was updated, the isolated image test passed unchanged, and
  the full rerun passed. A final focused run passed all 15 IPC/dependency/boundary tests.
- Type checking, lint, formatting (1,170 files) and diff checks passed. Independent read-only
  implementation review found no actionable issues. Production renderer/main/preload build passed;
  the existing chunk-size and deprecated `inlineDynamicImports` warnings remain.
- Real sandboxed Electron acceptance passed concurrent calls, null/undefined, synchronous and
  asynchronous service failures, internal-method rejection, event unsubscribe/resubscribe and
  renderer reload. Existing Mission history/retry/export/corrupt-ledger recovery assertions passed.
- Rebuilt NSIS with `--publish never` into `release/ipc-2026-09-17/`. An independent ASAR pass
  validated all entry integrity records and scanned **335 compiled scripts**: no removed package
  identifiers or old bridge marker; both main and preload contain the new RPC channel.
- Packaged clean onboarding, model-dialog validation/cancel, restart and isolated-profile
  preservation passed with the default sandbox. No model request was made.
- Current candidate: `release/ipc-2026-09-17/candidate/`. Installer and application signatures
  both report **NotSigned**. All 13 staged SHA-256 entries, beta SHA-512/size, installer bytes,
  asset-name metadata and staged/installed license copies were independently verified.
- Installer: `xingchao-navigation-setup-0.1.0-beta.1.exe`, **276,159,975 bytes**. SHA-256:
  `b84009654521a12466047cfdd9922f6c2e31c2664ccf41eb4d6193cb70c0143d`.
- The specific IPC dependency blocker is resolved for this rebuilt candidate, not for historical
  binaries. No GitHub release/tag/upload or commit/push was performed. Remaining notice inventory,
  real-provider acceptance, installer lifecycle and public-download/update checks are separate.

## Historical pre-migration dependency notice inventory

A read-only `corepack pnpm licenses list --json` completed outside the filesystem sandbox. Eight installed package groups report `Unknown` license metadata:

- `@anthropic-ai/claude-agent-sdk@0.3.226`
- `@anthropic-ai/claude-agent-sdk-win32-x64@0.3.226`
- `@oomol/connection@0.2.28`
- `@oomol/connection-electron-adapter@0.2.12`
- `@univerjs/telemetry@0.25.1`
- `khroma@2.1.0`
- `opencode-windows-x64@1.18.10`
- `opencode-windows-x64-baseline@1.18.10`

Unknown package metadata does not establish a prohibition or a permission. The installed Claude SDK points to its separate legal terms; the two installed OOMOL connection packages do not include a top-level license file. The exact shipped subset, upstream terms and notice texts must be resolved before marking this gate complete. Retaining Chromium notices closes one concrete packaging omission, not the entire notices review.
