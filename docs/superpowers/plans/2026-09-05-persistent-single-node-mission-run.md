# Persistent Single-node Mission Run Implementation Plan

> **Execution discipline:** follow strict RED -> GREEN -> REFACTOR for every behavior and use independent review before delivery.

**Goal:** Add a durable, main-process-owned execution record for one confirmed Mission dispatched as one existing Agent turn.

**Architecture:** Keep `Mission` as an immutable blueprint and introduce a versioned `MissionRun` state machine. Admit and bind through the unregistered main-process manager within ChatService, persist transitions atomically, settle from internal lifecycle callbacks, and recover unfinished runs as blocked on startup. Only the query/repair facade is registered.

## Execution checkpoint on 2026-09-06

Tasks 1-5 are implemented in the local working tree with the revised main-process design below. The original checkboxes remain a historical task breakdown, not completion evidence; the current verification and remaining work are in `docs/implementation-status.md` and `2026-09-06-delivery-continuation.md`. Task 6 is partially complete. Independent review, formal security scan, final Git audit/commit/push and the user-facing recovery interface are not complete. No reviewer result may be inferred from a dispatched task that failed due to quota.

**Tech stack:** TypeScript 6, Electron, React 19, `@oomol/connection`, Zod 4, Vitest 4, existing atomic-file utilities.

**Spec:** `docs/superpowers/specs/2026-09-05-persistent-single-node-mission-run-design.md`

## Global constraints

- Add no dependency and change no provider/tool permission policy.
- Never persist or return arbitrary exception text, paths, credentials, or raw runtime catalog data.
- Do not change the current prompt into node-level execution claims.
- Do not allow a Mission launch to enter the ordinary queued-message path.
- Do not publish a GitHub Release or write to `upstream`.
- Stop and redesign if admission cannot be proven durable before dispatch.

## Task 1: Domain and transport contracts

- [ ] Add renderer-safe Mission Run status, event, snapshot, and service request/response types in `electron/xingchao/mission-common.ts`.
- [ ] Keep reason values closed and non-sensitive.
- [ ] Add the Mission service to the renderer connection and application context only after its main implementation exists.

## Task 2: Store and schema — TDD

- [ ] Write failing tests for valid atomic round-trip, missing-file initialization, malformed/unsupported/corrupt state rejection, and operational-error propagation.
- [ ] Add the bounded Mission snapshot and persisted-state schemas.
- [ ] Implement `MissionRunStore` with `0600` atomic writes.
- [ ] Run the store tests and refactor only while green.

## Task 3: Main-process lifecycle — TDD

- [ ] Write failing tests for admission and exact first event.
- [ ] Add stale-revision, selected-crew, Agent ownership, dependency, cycle, pending-node, approvals/artifacts, and budget rejection cases.
- [ ] Prove identical active admission and same-session start are idempotent; changed duplicate input and conflicting session binding fail.
- [ ] Prove completion, failure, cancellation, unknown-session settlement, and duplicate terminal events.
- [ ] Prove startup recovery appends one blocked event per non-terminal run and does not repeat on a second startup.
- [ ] Prove concurrent calls preserve every run and unique monotonic event sequence.
- [ ] Implement the serialized `MissionRunServiceImpl` and safe change broadcast.

## Task 4: Chat lifecycle bridge — TDD

- [ ] Add failing ChatService tests for completion, prompt/runtime failure, system interruption, and explicit user stop callback outcomes.
- [x] Add an internal Mission manager dependency and await it at terminal main-process paths.
- [ ] Keep normal renderer server events and session cleanup behavior unchanged.

## Task 5: Dispatch ordering — TDD

- [x] Prove in ChatService integration tests that durable admission/start precede Agent dispatch and renderer text cannot replace the stored goal.
- [x] Forward the confirmed blueprint through the existing send request; no renderer `beforeDispatch` mutation hook is used.
- [x] Prevent Mission launch while the active turn would queue.
- [x] Admit inside the main process before Agent dispatch and record closed dispatch-failure reasons.
- [x] Construct the manager and register its query/repair facade. Renderer history connection remains the next slice.

## Task 6: Documentation and weekly research

- [ ] Update `CONTEXT.md`, `docs/implementation-status.md`, README status wording if needed, and `docs/research-watch.md`.
- [ ] Record at least three current, official, active, clearly licensed GitHub references with dated Stars, primary-source activity evidence, transferable ideas, incompatible/non-transferable parts, and the exact adoption decision.
- [ ] Refresh origin and benchmark Stars without guessing unresolved product identities.

## Task 7: Verification and review

- [ ] Run focused Mission store/service, composer/launch, ChatService, routing, and Voyage tests.
- [ ] Run the full test suite, type check, lint, formatting check, production build, and `git diff --check`.
- [ ] Run a security diff scan because the change adds a renderer-to-main persistence boundary.
- [ ] Request independent code review and fix every validated issue.
- [ ] Audit the final staged file list for credentials, caches, build output, unrelated work, and unverified claims.

## Task 8: Git delivery

- [ ] Create a clear local commit containing only this slice.
- [ ] Re-run `gh auth status`, origin ownership/permission, branch sync, and Star threshold checks.
- [ ] Push the current branch only if every publication prerequisite passes; otherwise leave the verified commit local and report the one minimal user action required.
