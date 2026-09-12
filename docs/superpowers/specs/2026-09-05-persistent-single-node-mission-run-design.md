# Persistent Single-node Mission Run Design

**Date:** 2026-09-05
**Status:** Implemented under the user's instruction to continue the agreed lifecycle slice; independent review remains outstanding.

## Scope and terminology

A Mission is the user-confirmed blueprint. A Mission Run is one execution attempt with an immutable blueprint, a unique run ID, attempt number, status and ordered events. Domain terms are recorded in `CONTEXT.md`.

The whole confirmed DAG executes as one existing Agent turn. Individual node scheduling, dependency execution, automatic retries, artifact acceptance, and a Mission history/recovery UI are outside this slice.

## Main-process execution boundary

The final design strengthens the initial renderer-hook proposal: the renderer sends the confirmed Mission through the existing `ChatService.sendMessage` request. It does not call admission/start/terminal mutation RPCs.

1. Voyage rejects launch while the current chat turn is busy; launch uses direct composer submission.
2. The composer prepares the actual chat session and forwards the Mission with the normal send request.
3. ChatService asks the unregistered Mission manager to validate and atomically persist admission.
4. The manager generates the authoritative prompt from its persisted blueprint and a current main-process fleet snapshot. Renderer-supplied prompt text cannot substitute another goal.
5. The chat pipeline creates its generation ID and persists the exact `sessionId + generationId` binding before calling the Agent prompt.
6. Verified completion, asynchronous prompt error, preparation failure, runtime interruption, explicit stop, session removal or runtime replacement settle that exact generation.
7. A second click cannot dispatch an already running Mission. An identical blueprint can form a new numbered attempt only after the previous attempt is terminal.

The registered `MissionRunQueryService` exposes `list()`, status-change events, and `retrySettlement(runId)` for a previously captured failed terminal write. The caller cannot choose the terminal outcome. Its manager is an ECMAScript private field. Internal admission/start/settlement methods and the store are not registered for renderer RPC.

## Validation

Main-process admission requires bounded IDs/text/arrays, the exact active fleet revision, one primary and at most two distinct support crews, selected-crew membership for each node, Agent ownership of each node's crew, unique node IDs, known unique dependencies, an acyclic graph, pending nodes, awaiting-confirmation status, and empty approvals/artifacts. Numeric budget metadata must be finite and nonnegative; this slice does not enforce provider token/cost budgets.

Every run stores a whitelist of blueprint fields. Artifact paths, raw runtime catalog objects and exception messages are excluded. Identical retried active admissions return the same run; reuse of a Mission ID with a changed blueprint fails.

## State and events

```text
admitted -> running -> completed | failed | cancelled
admitted -> failed
admitted/running --application restart--> blocked
```

All four terminal states remain closed. Events are `mission-admitted`, `mission-started`, `mission-completed`, `mission-failed`, `mission-cancelled`, and `mission-recovery-blocked`. Reasons are closed codes. Completion means the Agent turn ended after the existing chat-history verification; it does not certify deliverable correctness.

A global sequence identifies event order; each run's event sequence and time cannot go backwards. Clock regression clamps a transition timestamp to the preceding timestamp. Exact generation matching prevents late callbacks from settling a later turn in the same conversation.

## Storage and recovery

`userData/mission-runs.json` uses schema version 1 and the existing same-directory temporary-file/rename helper with mode 0600. A serialized mutation queue builds a candidate state, validates it, writes it, then publishes it in memory. Write failure preserves the previous state.

The ledger is limited to 1,024 runs, 512 events per run, 64 blueprint nodes per run and 16 MiB of serialized UTF-8. Reaching capacity rejects a write; automatic deletion, export and compaction are not implemented.

Only a missing file initializes empty history. Malformed JSON, unsupported version, duplicate/gapped sequences, invalid transitions and operational read errors fail closed. Initialization runs before renderer traffic and is also awaited by every operation. Recovery atomically changes unfinished runs to blocked once; later startups preserve that terminal state.

This is application-restart persistence and atomic replacement, not an fsync-backed power-loss guarantee. A failed terminal write retains its first verified outcome in memory and projects `persistencePending` in queries/events. `retrySettlement` saves that outcome without rerunning the Agent; a late contradictory callback cannot replace it. On process exit the pending in-memory outcome is lost, so startup conservatively marks the durable unfinished run blocked. User-facing repair of that condition is a remaining delivery gap.

## Internal retry prerequisite

The send transport accepts either a confirmed Mission or `missionRetryRunId`, never both. `admitRetry` atomically accepts only the latest failed/cancelled/blocked attempt, checks the current fleet revision, and preserves the previous attempt and blueprint. A bound predecessor requires the same chat session. Concurrent or stale retry requests cannot create another attempt. The renderer history, confirmation and retry controls are not yet connected; these internal contracts are not a completed user-facing recovery feature.

## Acceptance and remaining boundaries

Tests exercise store round-trip/corruption, input validation, duplicate admission, start failure, terminal outcomes, concurrency, exact generation correlation and backward clock movement. Chat integration tests use the production service with a controlled Agent adapter, proving persistence precedes dispatch and verifying completion/stop/error paths without paid calls. A reusable smoke command starts real Electron three times with isolated temporary data, verifies one recovery event and preserves completed runs.

The deterministic full suite, type check, lint, format, build and diff audit are recorded in `docs/implementation-status.md`. Independent review and a formal security scan are not claimed complete when reviewer capacity is unavailable. Real-provider task acceptance, recovery UI, DAG scheduling, signed installers and public release remain separate delivery gates.
