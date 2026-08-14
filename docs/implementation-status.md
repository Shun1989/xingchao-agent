# Xingchao Navigation implementation status

This document separates implemented behavior from planned release work. A passing web build is not evidence that platform signing, commercial content licenses, or a Cubism model exist.

## Implemented in the current baseline

- Wanta upstream is pinned at `470bbe1c0b48322e11d5955f9023362117776f09` on `codex/xingchao-platform`.
- Product branding, original logo, chief-assistant key art, and ten persistent crew themes.
- A domain dictionary plus TypeScript contracts for packs, providers, agents, crews, missions, events, themes, and memory records.
- Ten original crews and sixty original Agent profiles. Persona, professional authority, tool boundaries, delegation, relationships, voice, visuals, and evaluation cases are separate fields.
- Fleet Harbor and Mission Chart routes. The user can enter a goal, receive a deterministic recommendation, change one primary and up to two support crews, inspect the DAG, confirm the crew theme, and dispatch the confirmed mission into the existing Agent kernel.
- Lanxi orchestration rules in the kernel system prompt, using the existing OpenCode task helpers, permission cards, local tools, connectors, and artifact pipeline.
- A versioned content-pack JSON Schema plus manifest validation, path-traversal rejection, file-type allowlist, and unpacked-size limits. Packs cannot declare executable code.
- Eight-state Lanxi visual controller, six expression classes, static key-art fallback, crew overlay contract, and system-TTS preview. This is an adapter seam, not a Cubism model.
- The existing custom-model flow remains the credential boundary: keys stay encrypted through Electron `safeStorage` and are never returned to the renderer. First launch now requires a user-supplied model; OpenConnector stays optional.

## Inherited capabilities retained from Wanta

- Electron/React shell, loopback-only OpenCode sidecar, streaming chat events, approvals, projects, local files and terminal tools.
- Encrypted custom-model credentials, integrated browser, MCP/OpenConnector integration, Skills, connector discovery, artifacts, Word/PDF/Excel/image/code previews, task history, diagnostics, and Windows/macOS build targets.

## Not complete and must not be represented as complete

- A production Live2D Cubism model, motion/expression assets, ten rendered costume overlays, and a Live2D publication-license decision.
- Cloud or local STT/TTS provider adapters beyond the inherited recorder/transcription path and system-TTS preview.
- SQLite/FTS migration and a complete user-facing five-layer memory CRUD/export screen. The contracts exist; the Wanta persistence layer remains the runtime baseline.
- A user-facing content-pack package manager and IPC wiring. The main-process installer core now validates the manifest,
  rejects unsafe archive paths and unchecksummed assets, verifies SHA-256 checksums, and atomically installs an immutable
  `id/version` directory; it is not yet exposed to the renderer.
- Provider-native Anthropic and Google protocol adapters. Current custom models run through OpenAI-compatible endpoints; presets do not change the wire protocol.
- Sixty-agent live-model evaluation. The profiles each carry three executable evaluation cases, but no paid-provider evaluation run was performed.
- Full rebrand of all upstream localized copy and every internal compatibility identifier. IPC, storage, diagnostics, and several update-safe identifiers intentionally remain `wanta` for migration safety.
- Windows signing, macOS Developer ID signing/notarization, updater infrastructure, release server, and public distribution approval.
- Full desktop smoke test in this machine. The renderer and Electron bundles build, but Electron 42.4.0 download was blocked by TLS interception/timeout.

## Verified on 2026-08-13

- `tsgo`: pass.
- `oxlint`: pass.
- Xingchao and operating-profile unit tests: 21/21 pass.
- Vite production build: pass for renderer, main process, and preload.
- Full upstream test invocation is not clean on this Windows host: POSIX path/mode assertions, symlink privileges, and absent Electron binary fail independently of the Xingchao tests.

## Weekly slice on 2026-08-14

- Added the main-process content-pack installer core with fail-closed checksum coverage and staging-directory cleanup.
- Added installer tests for a successful install, path traversal rejection, and checksum mismatch rejection.
- The package-manager UI and IPC boundary remain intentionally unimplemented and must not be represented as complete.
