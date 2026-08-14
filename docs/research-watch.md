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
| Hermes Agent      | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | 230,202 | Verified through the Nous Research organization and repository metadata; MIT.                                                                           |
| Deepseek Hareness | N/A                                                                       |     N/A | No official repository was verified; the supplied name may be misspelled.                                                                               |
| Alice Agent       | N/A                                                                       |     N/A | No official open-source product main repository was verified. `itshen/Alice_methodology` remains methodology-only and is not treated as product source. |

The effective stop threshold is therefore **230,202 Stars**, the highest value among confirmed official public main
repositories above. [Shun1989/xingchao-agent](https://github.com/Shun1989/xingchao-agent) has **0 Stars** in the same
snapshot. The threshold has not been reached, so the weekly iteration continues.

## Publication prerequisite status

- `origin`: `https://github.com/Shun1989/xingchao-agent.git`.
- `upstream`: fetch-only `https://github.com/oomol-lab/wanta.git`; push URL is disabled.
- `gh auth status`: blocked on 2026-08-14 because the active `Shun1989` token is invalid.
- Consequence: local development and commits are allowed; pushing and pull-request creation are prohibited until the
  account is re-authenticated and `viewerPermission` confirms write access.
