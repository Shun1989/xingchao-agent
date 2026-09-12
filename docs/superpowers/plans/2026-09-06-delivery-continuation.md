# Delivery Continuation Checkpoint

**Status:** Local acceptance refreshed on 2026-09-12: three review/verification defects fixed; 2,965 tests passed, type/lint/format/build, both real Electron Mission smoke checks and all 60 fleet visual/end-to-end scenarios passed. Ready for ordinary origin delivery. Independent post-fix re-review is unavailable due to reviewer account limits. The next product gate is real-provider acceptance with an explicit provider and budget.

**Goal:** Finish the Mission recovery interface before expanding orchestration or distribution.

## Exact starting state

- Work in the existing `codex/xingchao-platform` checkout. Preserve its uncommitted Mission lifecycle slice; do not reset or recreate it.
- Latest published baseline at pause is `19ce2b3`. The local continuation has not been committed or pushed.
- Main-process admission, generation binding, terminal events and restart-to-blocked recovery exist. `MissionRunServiceImpl.admitRetry(runId, sessionId?)` creates the next attempt only from the latest retryable predecessor; ChatService passes the actual session ID.
- `MissionRunSummary` and `MissionRunChangedEvent` optionally carry `persistencePending`. `MissionRunService` exposes `list()` and `retrySettlement(runId)`. Repair uses the host-captured first terminal outcome, not a renderer-supplied status.
- `missionRetryRunId` is forwarded by the chat/composer transport, but no history interface or retry button is wired yet. This is an internal prerequisite, not user-facing completion.
- Two independent agent tasks failed on usage limits without producing UI work or a review result. Do not count them as completed review.
- At the latest checkpoint the account's weekly window had 49% remaining and its five-hour window had 88% remaining. No reset credit was used.

## Next single priority: usable recovery interface

1. Connect `MissionRunService` in `src/main.tsx` and `src/components/AppContext.ts`, mirroring the existing content-pack client. Update typed AppContext fixtures.
2. Add `src/hooks/useMissionRuns.ts`: load summaries; subscribe to `missionRunChanged`; discard stale async responses after a newer refresh or unmount; show a safe generic read error and allow refresh; call `retrySettlement` for repair. Do not render raw exceptions.
3. Add `src/routes/Voyage/MissionHistory.tsx` with `onRetry(run)`, `onOpenSession(sessionId)` and `activeSessionId` props. Show goal, attempt, state, timestamps, ordered events and original-chat navigation. Describe completed as turn-ended, not deliverable-accepted.
4. Retry requires the latest failed/cancelled/blocked attempt, matching fleet revision, no pending write, and the original session when one exists. If the original chat is not selected, offer navigation and ask the user to return to the chart. A missing original conversation must lead to replanning, not an arbitrary substitute context.
5. Confirmation must explain new execution versus checkpoint resume and possible repeated effects. Cancel sends nothing. Keep an in-flight ref so repeated clicks cannot dispatch twice. On rejection keep the original history visible and show a retryable generic error.
6. Wire Voyage and AppShell: `sendNow({text: localizedRetryLabel, mode: "build", missionRetryRunId: run.runId})`; reject busy chat and mismatched session; use the existing session navigation helper. Add an application-wide save-failure notification from `missionRunChanged.persistencePending`, with a route to history. The main process already reconstructs the authoritative prompt.
7. Add matching Chinese/English keys. Use existing button/dialog primitives, visible focus and alert semantics.

## Verification and completion criteria

- Hook tests: initial load, event refresh, out-of-order response, read failure, unmount, repair failure/success.
- UI tests: confirmation/cancel, double click, old attempt, stale fleet, wrong session, ordered events, generic errors and repair without execution.
- Extend the isolated real-Electron smoke with a recovered blocked attempt, one retry, preserved predecessor, and failed-write repair; no paid provider calls.
- Run focused tests, type check, lint and formatting once after edits; then the deterministic full suite (`vitest run --no-file-parallelism --maxWorkers=1`) and production build without competing heavy tasks. Run the fleet visual/end-to-end gates if shared layout changes.
- Independently review the lifecycle and retry boundaries. Resolve concrete findings; do not represent an unavailable formal security scan as passed.
- Update the implementation/research documents, audit only relevant staged files, refresh GitHub identity/origin permissions and branch synchronization, then commit and ordinary-push only to project origin. No upstream write, force push, Release or installer publication.

## Subsequent delivery gates, in order

1. Real-provider task acceptance with an explicitly approved provider/budget: successful output, permissions, cancellation, provider/network failure and restart. Confirm actual artifacts rather than inferring success from final text.
2. Mission retention/export and actionable corrupt-ledger recovery, without silently deleting user records.
3. Release-candidate install/upgrade/uninstall checks on a clean Windows profile, then signing/distribution configuration. macOS requires its own evidence if advertised.
4. Dependency-aware node scheduling and per-node retries only after the single-turn boundary is accepted. Live2D and extra voices remain optional scope, not substitutes for these gates.
