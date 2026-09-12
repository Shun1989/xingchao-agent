# Mission History and Recovery Implementation Plan

**Goal:** Let users inspect a persisted Mission attempt, understand interruption, and explicitly retry without losing history.

**Architecture:** Keep lifecycle mutation in the unregistered main-process manager. The renderer queries summaries and requests retry through the existing chat send path using only the prior run ID. A separate repair action may retry a previously captured terminal write; it cannot supply a new outcome.

**Tech stack:** Existing TypeScript, Electron, React, connection services and Vitest; no new dependency.

**Spec:** This extends `../specs/2026-09-05-persistent-single-node-mission-run-design.md` under the user's instruction to complete the previously proposed recovery loop autonomously.

## Constraints

- Preserve the immutable blueprint and old attempts; do not claim automatic resume or node-level scheduling.
- Retry only the latest failed, cancelled or blocked attempt with the current fleet revision. Revalidate in the main process.
- Confirmation explains that a new execution can repeat earlier effects. Existing tool permissions remain unchanged.
- Never expose arbitrary exception text through history. Failed terminal writes remain visibly unresolved.
- No paid model calls, user-data deletion, installer publication or upstream pushes.

## Tasks and acceptance

- [x] Main manager: add `admitRetry(runId, sessionId?)` and atomically validate predecessor status, latest attempt, original session and fleet before creating attempt N+1. Test concurrent duplicate retry, stale fleet, active/completed predecessor and unchanged predecessor events.
- [x] Chat bridge: add optional `missionRetryRunId` to the existing send transport; reject combining it with a Mission blueprint. Use the stored authoritative blueprint for prompt construction. Test retry dispatch and stale retry rejection.
- [x] Persistence repair: capture failed terminal writes internally, project `persistencePending`, and expose `retrySettlement(runId)` without caller-supplied outcome. Test failure visibility, first-outcome retention and repair without another Agent dispatch.
- [x] Renderer: connect `MissionRunService`, add event-refreshed history to Voyage, inspect events, open original conversation, confirm/cancel retry, reject duplicate clicks, and show retryable query/save failures. Test interaction and stale-response handling.
- [x] Integration: wire direct submission and session navigation in AppShell. Run focused tests, type/lint/format, real Electron recovery smoke, then one deterministic full suite and production build.
- [ ] Review and delivery: resolve independent review findings, update implementation status/research and next-stage plan, audit staged files and commit/push only to verified origin.

## Quota checkpoint

Account snapshot at start: weekly 68% remaining; five-hour 100% remaining. Recheck after implementation and after validation. If the tighter remaining window approaches 50% and completing the full product is not feasible, finish this coherent slice, record exact next-stage inputs/acceptance, and stop without consuming a reset credit.

Checkpoint reached on 2026-09-06: weekly 49% remaining, five-hour 88% remaining. Backend prerequisites passed focused checks; UI work and independent review did not complete. Continue from `2026-09-06-delivery-continuation.md` after the user's next authorized run with sufficient usage.
