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
| Hermes Agent      | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | 233,794 | Verified through the Nous Research organization and GitHub public repository API on 2026-08-21; MIT.               |
| Deepseek Hareness | N/A                                                                       |     N/A | No official repository was verified; the supplied name still appears misspelled or non-public.                     |
| Alice Agent       | N/A                                                                       |     N/A | No official open-source product main repository was verified; `itshen/Alice_methodology` remains methodology-only. |

The effective stop threshold is **233,794 Stars**. The current `stargazers_count` for
[Shun1989/xingchao-agent](https://github.com/Shun1989/xingchao-agent) is **not verified in this run**: `gh auth status`
reports an invalid Shun1989 token, authenticated repository metadata returns HTTP 401, and the public API endpoint was
not reachable through this host's TLS path. The previous value is not reused as if current, so the stop comparison is
blocked rather than guessed.

## Publication prerequisite status on 2026-08-21

- `origin` remains `https://github.com/Shun1989/xingchao-agent.git`.
- `upstream` remains fetch-only; its push URL is `DISABLED`.
- `gh auth status` reports that the active Shun1989 token is invalid. Push permission is therefore not verified, and no
  push is permitted until `gh auth login -h github.com` succeeds and `viewerPermission` is read from the origin repository.
