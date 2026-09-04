# Open-source research watch

Evidence in this file is refreshed from first-party GitHub repository pages and the GitHub public API. Star counts are
snapshots, not popularity claims. No source code from the watched projects is copied into Xingchao Navigation.

## 2026-08-14 weekly scan

| Repository                                                          | Stars | License    | Latest push | Relevant design                                                                                                                                | Do not copy                                                        | Xingchao decision                                                                                                                        |
| ------------------------------------------------------------------- | ----: | ---------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [modelstudioai/openwork](https://github.com/modelstudioai/openwork) |    23 | Apache-2.0 | 2026-08-13  | Desktop shell and agent runtime have separate responsibilities; permission confirmation and workspace/session management are first-class.      | Product/provider-specific ModelStudio and Qwen integration.        | Keep Xingchao's Electron main-process security boundary and OpenCode adapter; use the same separation principle, not its implementation. |
| [OpenLoaf/OpenLoaf](https://github.com/OpenLoaf/OpenLoaf)           |    96 | AGPL-3.0   | 2026-05-14  | Secretary → project agent → worker hierarchy and project-scoped memory/skills make delegation ownership visible.                               | AGPL implementation and unbounded cross-project context injection. | Retain one chief assistant, exactly one primary crew, and at most two support crews; keep memory/tool authority explicit.                |
| [Orkas-AI/Orkas](https://github.com/Orkas-AI/Orkas)                 | 1,202 | MIT        | 2026-08-12  | Deferred recipient wake-up avoids agents executing before the commander's dispatch turn is complete; turn-based runaway guards are observable. | Self-modifying skill behavior without a reviewed package boundary. | Consider deferred dispatch for the live multi-crew runtime; require content packs to remain declarative and non-executable.              |

The current implementation slice adopts the shared principle that installable capability/content must cross a narrow,
auditable main-process boundary. Xingchao's implementation is original: it validates its own manifest, rejects unsafe ZIP
entries, requires SHA-256 coverage for every asset, stages writes, and atomically publishes an immutable `id/version`
directory.

## Star benchmark

Snapshot date: 2026-08-14 (GitHub public API).

| Compared object   | Confirmed official public main repository                                 |   Stars | Status                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WorkBuddy         | N/A                                                                       |     N/A | Product name is identifiable, but no official open-source main repository was verified. Unrelated repositories using the same name were excluded.       |
| Hermes Agent      | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | 230,436 | Verified through the Nous Research organization and repository metadata; MIT.                                                                           |
| Deepseek Hareness | N/A                                                                       |     N/A | No official repository was verified; the supplied name may be misspelled.                                                                               |
| Alice Agent       | N/A                                                                       |     N/A | No official open-source product main repository was verified. `itshen/Alice_methodology` remains methodology-only and is not treated as product source. |

The effective stop threshold is therefore **230,436 Stars**, the highest value among confirmed official public main
repositories above. [Shun1989/xingchao-agent](https://github.com/Shun1989/xingchao-agent) has **0 Stars** in the same
snapshot. The threshold has not been reached, so the weekly iteration continues.

## Publication prerequisite status

- `origin`: `https://github.com/Shun1989/xingchao-agent.git`.
- `upstream`: fetch-only `https://github.com/oomol-lab/wanta.git`; push URL is disabled.
- `gh auth status`: authenticated as `Shun1989`; repository permission is `ADMIN`.
- The public repository exists with `origin` configured. Publication is permitted after the current change set passes its
  validation gates.

## 2026-08-14 continuation scan

| Repository                                                          |  Stars | License    | Latest push | Relevant design                                                                                                                                      | Xingchao decision                                                                                                                                  |
| ------------------------------------------------------------------- | -----: | ---------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [aaif-goose/goose](https://github.com/aaif-goose/goose)             | 52,797 | Apache-2.0 | 2026-08-14  | Desktop, CLI, API, extensions, and custom distributions are separate surfaces; preconfigured capability does not require UI/runtime coupling.        | Keep 补给包 declarative and make the main process the only installation authority. Runtime activation remains a later, explicit adapter.           |
| [makecindy/cindy](https://github.com/makecindy/cindy)               |  2,067 | Apache-2.0 | 2026-08-14  | Memory, Skills, automation, MCP, and future plugins remain distinct concepts; its README explicitly marks the plugin marketplace as not yet shipped. | Do not label pack activation or a marketplace complete merely because package import UI exists.                                                    |
| [modelstudioai/openwork](https://github.com/modelstudioai/openwork) |     23 | Apache-2.0 | 2026-08-13  | The desktop shell owns permission confirmation, workspace state, previews, and user interaction while the Agent runtime stays separate.              | Keep archive selection and destructive removal confirmation in the Electron main-process service, returning only redacted pack summaries to React. |

Metadata was read from each repository's GitHub API record and first-party README. No source code was copied.

## 2026-08-21 weekly scan

Star snapshot date: 2026-08-21. Counts below come from first-party GitHub repository pages; GitHub abbreviates Apache
Maka's value on the page, so it is recorded as displayed rather than expanded into a fabricated exact count.

| Repository                                                | Stars | License           | Activity evidence                                                                  | Relevant design                                                                                                                  | Do not copy                                                                               | Xingchao decision                                                                                                                |
| --------------------------------------------------------- | ----: | ----------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| [limboo-ai/limboo](https://github.com/limboo-ai/limboo)   |    89 | MIT               | First-party page current on 2026-08-21; 181 commits and tagged desktop releases.   | Resume verifies repository reality before continuing; release artifacts carry checksums and public provenance attestations.      | Provider-specific Claude/Cursor adapters and its product-specific session implementation. | Treat clean, verified repository state as a publication prerequisite; retain Xingchao's existing runtime and adapter boundaries. |
| [vastsa/PI-Desktop](https://github.com/vastsa/PI-Desktop) |    50 | LGPL-3.0-or-later | First-party page current on 2026-08-21; 1,175 commits and cross-platform releases. | Renderer privileges stay narrow while a host core owns persistence, secrets, permissions, and workspace access.                  | LGPL implementation details, plugin APIs, and Pi-specific runtime behavior.               | Keep Electron main/preload IPC narrow; use only the boundary principle and original Xingchao implementation.                     |
| [apache/maka](https://github.com/apache/maka)             |  2.0k | Apache-2.0        | First-party page current on 2026-08-21; 3,634 commits; entered Apache incubation.  | Model messages, tool calls/results, permission decisions, and termination facts form an append-only, inspectable runtime record. | Incubating APIs and event schemas that are not yet stable contracts for Xingchao.         | Consider append-only mission events for future crash recovery; this week's slice only restores deterministic Git state.          |

No source code was copied. The implemented Git attributes policy is original and fixes a locally reproduced Windows
failure mode: Git reported 972 modified files even though their normalized blobs matched the index.

## Star benchmark refresh on 2026-08-21

| Compared object   | Confirmed official public main repository                                 |   Stars | Status                                                                                                             |
| ----------------- | ------------------------------------------------------------------------- | ------: | ------------------------------------------------------------------------------------------------------------------ |
| WorkBuddy         | N/A                                                                       |     N/A | Search did not verify an official open-source main repository; unrelated same-name repositories remain excluded.   |
| Hermes Agent      | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | 233,866 | Verified through the Nous Research organization and GitHub repository API at 2026-08-21 23:58 +08:00; MIT.         |
| Deepseek Hareness | N/A                                                                       |     N/A | No official repository was verified; the supplied name still appears misspelled or non-public.                     |
| Alice Agent       | N/A                                                                       |     N/A | No official open-source product main repository was verified; `itshen/Alice_methodology` remains methodology-only. |

The effective stop threshold is **233,866 Stars**. On 2026-08-21 at 23:58 +08:00, GitHub repository metadata reports
[Shun1989/xingchao-agent](https://github.com/Shun1989/xingchao-agent) at **0 Stars**. The threshold has not been reached,
so the weekly iteration continues.

## Publication prerequisite status on 2026-08-21

- `origin` remains `https://github.com/Shun1989/xingchao-agent.git`.
- `upstream` remains fetch-only; its push URL is `DISABLED`.
- `gh auth status` succeeds for `Shun1989`; repository metadata reports `viewerPermission: ADMIN` and confirms origin as
  `Shun1989/xingchao-agent`.
- The three audited local commits through `2977376d887952fe54e58b6f89257b458fc29db8` were fast-forward pushed to
  `origin/codex/xingchao-platform`. A read-only remote SHA check matched the local head; upstream remained untouched.

## Star benchmark and Runtime Fleet publication refresh on 2026-08-22

GitHub repository metadata was refreshed after Windows keyring authentication succeeded for `Shun1989`.

| Compared object   | Confirmed official public main repository                                 |   Stars | Status                                                                                                          |
| ----------------- | ------------------------------------------------------------------------- | ------: | --------------------------------------------------------------------------------------------------------------- |
| WorkBuddy         | N/A                                                                       |     N/A | Search returned guides, integrations, and third-party clones, but no verifiable official open-source main repo. |
| Hermes Agent      | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | 234,169 | Official Nous Research repository; MIT; pushed on 2026-08-22.                                                   |
| Deepseek Hareness | N/A                                                                       |     N/A | Exact-name repository search returned no results; the supplied name remains unverified or misspelled.           |
| Alice Agent       | N/A                                                                       |     N/A | Search returned unrelated small projects with no evidence of being the named product's official main repo.      |

The effective stop threshold is therefore **234,169 Stars**. GitHub reports
[Shun1989/xingchao-agent](https://github.com/Shun1989/xingchao-agent) at **0 Stars** on 2026-08-22, so the threshold has
not been reached.

Publication evidence for Runtime Fleet Activation:

- `gh auth status` succeeded for `Shun1989`; token scopes include `repo` and `workflow`.
- GitHub reports `viewerPermission: ADMIN`, default branch `codex/xingchao-platform`, and the expected project owner.
- A fresh focused matrix passed 16 test files / 100 tests before publication.
- Fetch reported 0 behind / 20 ahead; an ordinary non-force push advanced `origin/codex/xingchao-platform` from
  `253440c` through `04bbaa2be2102981d541decc7970ebdde9b81b1d`.
- The upstream push URL remained `DISABLED`; no Release, Prerelease, or installer was created or uploaded.

## 2026-08-25 focused review: MkThingsHQ/mkagent

Snapshot date: 2026-08-25. Evidence was read from the repository metadata, first-party README and architecture/security
documents, selected implementation and tests, release metadata, commit history, contributor API, and public Actions API.
No MkAgent or Craft source code was copied into Xingchao Navigation.

| Repository                                                  | Stars | License    | Activity and maturity evidence                                                                                                                                           |
| ----------------------------------------------------------- | ----: | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [MkThingsHQ/mkagent](https://github.com/MkThingsHQ/mkagent) |   165 | Apache-2.0 | Created 2026-08-09; latest push 2026-08-24; one visible contributor; one v0.1.0 release on 2026-08-10; the latest three CI runs were failing at the 2026-08-25 snapshot. |

MkAgent is a deliberately reduced, local-first Craft Agents distribution. Its `NOTICE` and upstream-sync documentation
pin the inherited Craft OSS baseline and separate unchanged reuse, deliberate Lite seams, and removed features. Its Bun
monorepo exposes Desktop, WebUI, and CLI through a shared server/protocol layer, while the Pi agent SDK runs in a separate
subprocess over JSONL stdio. Sessions use JSONL storage, per-session serialized writes, temporary-file replacement, and a
durability regression that requires a user message to reach disk before an acknowledgement is emitted.

### Xingchao adoption decision

1. **Adopt now as governance, not as a rewrite.** Add a pinned-Wanta lineage manifest and classify audited files as
   strict upstream reuse, Xingchao seam, or intentionally removed/owned behavior. Hash drift and require the appropriate
   regression group for each changed seam. This is the strongest immediate lesson because Xingchao is already a Wanta
   derivative and must survive future upstream syncs without losing security or branding boundaries.
2. **Use the event/durability ideas in Tasks 12–13.** Treat fleet selection, captain state, voice policy, permission
   decisions, rollback, and terminal outcomes as versioned runtime events. Do not acknowledge a user-visible committed
   choice until its persisted state is durable; restart tests must replay the same authoritative state.
3. **Keep a protocol-neutral runtime seam as a later extension point.** Shared DTOs and one runtime serving several
   clients are useful long-term, but WebUI/CLI are not part of the current deliverable. The immediate design should keep
   Electron UI, orchestration, persistence, and provider adapters separable without introducing Bun, Pi, or WebSocket RPC
   merely to resemble MkAgent.
4. **Retain process isolation as a provider hardening option.** A provider runtime subprocess can contain crashes and
   dependency conflicts, and a minimal IPC contract can narrow which code handles credentials even though the subprocess
   still receives them. Adopt it only when a second provider or unstable native/runtime dependency justifies the
   operational cost; do not replace the working Wanta/OpenCode kernel pre-emptively.
5. **Do not copy its weak or immature edges.** MkAgent's current main branch is not green, Windows/macOS packages are
   unsigned/ad-hoc signed, and public history is too short for production reliability claims. Its documented
   multi-window `latest writer wins` model is weaker than Xingchao's explicit producer/epoch rules; JSONL needs schema
   versioning, corruption reporting, locking, and compaction before it can be a durable Xingchao mission ledger. Path
   checks and destructive workspace handling must also be independently threat-modeled rather than inherited by trust.

Apache-2.0 permits compatible reuse when its terms and notices are preserved, but MkAgent itself carries attributed Craft
lineage. Xingchao will therefore absorb the design principles above and keep its implementation original unless a future
change has a specific, reviewed reason to import code with complete Apache/NOTICE attribution.

## 2026-08-28 weekly scan

Snapshot date: 2026-08-28. Metadata, README, latest release, and latest commit evidence came from each first-party GitHub
repository and API. No source code was copied into Xingchao Navigation.

| Repository                                                          |  Stars | License    | Activity evidence                                            | Relevant design                                                                                                                               | Do not copy                                                                          | Xingchao decision                                                                                                       |
| ------------------------------------------------------------------- | -----: | ---------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands)       | 85,331 | MIT        | v1.16.0 and commit `b50c60c` on 2026-08-27                   | One control surface can use local, container, VM, and remote Agent backends, but the README explicitly distinguishes unsandboxed host access. | Its cloud/enterprise topology and provider-specific automation integrations.         | Keep runtime location and authority explicit; external Skills must cross a fail-closed local filesystem boundary.       |
| [aaif-goose/goose](https://github.com/aaif-goose/goose)             | 53,586 | Apache-2.0 | v1.48.0 on 2026-08-27; latest commit `caf5951` on 2026-08-27 | Desktop, CLI, API, providers, MCP extensions, and custom distributions remain separately configurable surfaces.                               | Rust implementation, provider catalog, and distribution-specific extension behavior. | Preserve Xingchao's narrow Skill mirror adapter instead of coupling external Skill layout to the Agent runtime.         |
| [modelstudioai/openwork](https://github.com/modelstudioai/openwork) |     24 | Apache-2.0 | v0.2.1 and commit `27d65b7` on 2026-08-18                    | The desktop owns permission, workspace, preview, and session interaction while the Agent runtime owns execution progress.                     | ModelStudio/Qwen product coupling and its cloud-console path.                        | Retain the Electron main-process authority for filesystem mirroring and expose only diagnostics/status to the renderer. |

This week's implementation is original. The shared lesson adopted is architectural: extension content must be copied
through a bounded host-owned adapter, not trusted to reproduce arbitrary filesystem objects inside the runtime. Xingchao
materializes only in-root links, rejects escaping links and cycles, and publishes through a retry-bounded rollback path.

## Star benchmark refresh on 2026-08-28

| Compared object   | Confirmed official public main repository                                 |   Stars | Status                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| WorkBuddy         | N/A                                                                       |     N/A | Search found Tencent's benchmark plus third-party guides, mirrors, skins, and integrations, but no official open-source product main repository.  |
| Hermes Agent      | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | 237,379 | Official Nous Research repository; MIT; pushed on 2026-08-28.                                                                                     |
| Deepseek Hareness | N/A                                                                       |     N/A | The only exact-name result is an unverified personal zero-Star repository; the supplied name remains likely misspelled.                           |
| Alice Agent       | N/A                                                                       |     N/A | Search returned unrelated same-name personal and organization projects with no evidence identifying the named product's official main repository. |

The effective stop threshold is **237,379 Stars**. GitHub reports
[Shun1989/xingchao-agent](https://github.com/Shun1989/xingchao-agent) at **0 Stars** on 2026-08-28, so the weekly
iteration continues.

## Publication prerequisite status on 2026-08-28

- Windows keyring authentication succeeds for `Shun1989`; GitHub reports `viewerPermission: ADMIN` for the origin.
- `origin` is `https://github.com/Shun1989/xingchao-agent.git`; `upstream` remains fetch-only with push set to `DISABLED`.
- A fresh fetch reported the current branch 0 commits behind and 36 commits ahead before this weekly change.
- After all quality gates passed, commit `81340ec280e084dff17f9c64122b0f2d7369b4e1` was ordinary-pushed to
  `origin/codex/xingchao-platform`; no force push, merge, Release, or upstream write was performed.

## 2026-09-03 GitHub official API/repository snapshot

Snapshot date: 2026-09-03 (Asia/Shanghai). This is a frozen, auditable snapshot: the Stars values below are the
specified values for this date and must not be replaced by a later live API response. `HEAD` is the latest
default-branch commit date in the snapshot; release dates are publication dates. The repository and release links are
first-party GitHub sources. No source code was copied into Xingchao Navigation.

| Repository                                                    |  Stars | License    | HEAD       | Release                                                                            | Relevant design to borrow                                                                                                    | Do not copy                                                                                               | Xingchao adoption decision                                                                                                     |
| ------------------------------------------------------------- | -----: | ---------- | ---------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [oomol-lab/wanta](https://github.com/oomol-lab/wanta)         |     70 | Apache-2.0 | 2026-09-02 | [v0.1.181](https://github.com/oomol-lab/wanta/releases/tag/v0.1.181), 2026-09-02   | A desktop host can own workspace, Skills, permissions, artifacts, runtime lifecycle, and capability-driven adapters.         | OOMOL-specific model/catalog/Console routing, provider behavior, and branding.                            | Keep Wanta as the sole host/runtime baseline; retain Xingchao's original seams and do not add a second host/runtime.           |
| [aaif-goose/goose](https://github.com/aaif-goose/goose)       | 53,854 | Apache-2.0 | 2026-09-02 | [v1.48.0](https://github.com/aaif-goose/goose/releases/tag/v1.48.0), 2026-08-27    | Extension governance: explicit MCP/extension surfaces, provider and distribution configuration, and capability ownership.    | Goose's Rust runtime, provider catalog, ACP/MCP implementation details, and custom-distribution behavior. | Borrow extension governance only; keep Xingchao's narrow main-process install/validation boundary and runtime adapter.         |
| [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands) | 85,989 | MIT        | 2026-09-02 | [v1.16.0](https://github.com/OpenHands/OpenHands/releases/tag/v1.16.0), 2026-08-27 | A control center can make backend selection, agent work, automation, events, and delegated outcomes explicit and recordable. | Agent Canvas/Agent Server code, cloud/enterprise topology, and provider-specific automation integrations. | Borrow structured delegation records only; keep Wanta as the sole host/runtime and preserve the current IPC/adapter contracts. |
| [agno-agi/agno](https://github.com/agno-agi/agno)             | 42,018 | Apache-2.0 | 2026-09-02 | [v3.0.5](https://github.com/agno-agi/agno/releases/tag/v3.0.5), 2026-09-01         | AgentOS is a useful future control-plane reference for serving agents, teams/workflows, sessions, storage/traces, and RBAC.  | Agno's Python/AgentOS runtime, API/data model, deployment templates, and control-plane implementation.    | Future control-plane reference only; introduce no Agno runtime or dependency into the current Wanta baseline.                  |

### Frozen-source audit trail

The field mapping is `stargazers_count` → Stars, `license.spdx_id` → License, latest default-branch commit date →
HEAD, and release `published_at` → release date. The official metadata and release API records are:

- Wanta: [repository metadata API](https://api.github.com/repos/oomol-lab/wanta) and [v0.1.181 release API](https://api.github.com/repos/oomol-lab/wanta/releases/tags/v0.1.181).
- Goose: [repository metadata API](https://api.github.com/repos/aaif-goose/goose) and [v1.48.0 release API](https://api.github.com/repos/aaif-goose/goose/releases/tags/v1.48.0).
- OpenHands: [repository metadata API](https://api.github.com/repos/OpenHands/OpenHands) and [v1.16.0 release API](https://api.github.com/repos/OpenHands/OpenHands/releases/tags/v1.16.0).
- Agno: [repository metadata API](https://api.github.com/repos/agno-agi/agno) and [v3.0.5 release API](https://api.github.com/repos/agno-agi/agno/releases/tags/v3.0.5).

The confidence is high for the official repository identities, licenses, and release links. The 2026-09-03 Stars and
HEAD values are intentionally preserved as the supplied snapshot, not re-derived from a later response.

## Star benchmark refresh on 2026-09-03

The benchmark uses only a confirmed official public product repository. `N/A` is a deliberate unresolved result, not a
zero-star claim and not permission to substitute a similarly named project.

| Compared object   | Confirmed official public main repository                                 |   Stars | License    | Status                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------- | ------: | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| origin            | [Shun1989/xingchao-agent](https://github.com/Shun1989/xingchao-agent)     |       0 | Apache-2.0 | Origin baseline for comparison.                                                                                                                                 |
| WorkBuddy         | N/A                                                                       |     N/A | N/A        | Tencent's [workbuddy-bench](https://github.com/Tencent/workbuddy-bench) is a benchmark/evaluation framework, not the product's main repository; it is excluded. |
| Hermes Agent      | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | 240,115 | MIT        | Confirmed official public main repository; highest confirmed value in this snapshot.                                                                            |
| Deepseek Hareness | N/A                                                                       |     N/A | N/A        | The name cannot be confirmed. Do not replace it with `Harness` or any other similarly named project.                                                            |
| Alice Agent       | N/A                                                                       |     N/A | N/A        | No official open-source product main repository was confirmed under this name.                                                                                  |

The stop threshold is therefore **240,115 Stars**, the highest value among confirmed objects. The threshold is defined
by confirmed identity only; unresolved names do not raise or replace it.

## 2026-09-04 live API refresh

This refresh preserves the frozen 2026-09-03 snapshot above and records the current values returned by the official
GitHub repository and search APIs on 2026-09-04 (Asia/Shanghai). No watched-project source code was copied.

| Repository                                                    |  Stars | License    | Latest push | Current decision                                                                                                                         |
| ------------------------------------------------------------- | -----: | ---------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [oomol-lab/wanta](https://github.com/oomol-lab/wanta)         |     69 | Apache-2.0 | 2026-09-02  | Continue using Wanta as the sole desktop host/runtime baseline.                                                                          |
| [aaif-goose/goose](https://github.com/aaif-goose/goose)       | 53,901 | Apache-2.0 | 2026-09-04  | Retain only the extension-governance lesson; do not import its Rust runtime or provider implementation.                                  |
| [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands) | 86,152 | MIT        | 2026-09-04  | Retain structured delegation/event-record ideas; do not copy Agent Server, cloud topology, or provider-specific automation code.         |
| [agno-agi/agno](https://github.com/agno-agi/agno)             | 42,046 | Apache-2.0 | 2026-09-04  | Keep as a future control-plane reference only; add no Python/AgentOS runtime or dependency to the current Electron/Wanta implementation. |

### Star benchmark refresh on 2026-09-04

| Compared object   | Confirmed official public main repository                                 |   Stars | Status                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| origin            | [Shun1989/xingchao-agent](https://github.com/Shun1989/xingchao-agent)     |       0 | Public Apache-2.0 origin; authenticated account `Shun1989` has push and administrator permission.                                                                        |
| WorkBuddy         | N/A                                                                       |     N/A | Exact-name search found guides, integrations, clones, and Tencent's unlicensed `workbuddy-bench`; the latter is an evaluation framework, not a public product main repo. |
| Hermes Agent      | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | 241,212 | Official Nous Research repository; MIT; pushed on 2026-09-04. This is the highest confirmed comparison value.                                                            |
| Deepseek Hareness | N/A                                                                       |     N/A | Exact-phrase search found only one unverified personal zero-Star repository. The supplied product identity remains unconfirmed and is not replaced with `Harness`.       |
| Alice Agent       | N/A                                                                       |     N/A | Search found several unrelated one-to-three-Star repositories, with no first-party evidence identifying the named product's official public main repository.             |

The effective stop threshold is therefore **241,212 Stars**. Origin remains at **0 Stars**, so the threshold has not
been reached and the weekly iteration continues. `N/A` remains an unresolved identity, never a zero-Star value.

### Publication prerequisite refresh on 2026-09-04

- `gh auth status` succeeds for `Shun1989`; token scopes include `repo` and `workflow`.
- `origin` is `https://github.com/Shun1989/xingchao-agent.git`; GitHub reports a public Apache-2.0 repository with
  `push: true` and `admin: true`.
- `upstream` fetches from `https://github.com/oomol-lab/wanta.git`, while its push URL remains `DISABLED`.
- The checked-out publication branch is `codex/xingchao-platform`. An ordinary push remains contingent on the final
  staged-diff audit and a fresh fetch/ahead-behind check; no Release or upstream write is authorized.
