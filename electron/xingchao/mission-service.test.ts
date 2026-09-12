import type { Mission } from "../../src/domain/xingchao/types.ts"
import type { MissionRunPersistence, PersistedMissionRunState } from "./mission-store.ts"

import { describe, expect, it, vi } from "vitest"
import { draftMissionForCrews } from "../../src/domain/xingchao/routing.ts"
import { builtinRuntimeFleetIndex } from "../../src/domain/xingchao/runtime-fleet.ts"
import { MissionRunServiceImpl } from "./mission-service.ts"
import { emptyMissionRunState } from "./mission-store.ts"

class MemoryMissionRunStore implements MissionRunPersistence {
  public state: PersistedMissionRunState = emptyMissionRunState()
  public readonly writes: PersistedMissionRunState[] = []

  public async read(): Promise<PersistedMissionRunState> {
    return structuredClone(this.state)
  }

  public async write(state: PersistedMissionRunState): Promise<void> {
    this.state = structuredClone(state)
    this.writes.push(structuredClone(state))
  }
}

function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    ...draftMissionForCrews("完成一次可审计任务", "watchtide", [], builtinRuntimeFleetIndex),
    id: "mission-1",
    ...overrides,
  }
}

function service(
  store: MemoryMissionRunStore,
  options: { now?: () => number; runIds?: string[] } = {},
): MissionRunServiceImpl {
  const runIds = [...(options.runIds ?? ["run-1", "run-2", "run-3"])]
  return new MissionRunServiceImpl({
    createRunId: () => runIds.shift() ?? "run-fallback",
    now: options.now ?? (() => 1_000),
    runtimeFleet: async () => builtinRuntimeFleetIndex.snapshot,
    store,
  })
}

describe("MissionRunServiceImpl admission", () => {
  it("rejects retry when the interrupted attempt never bound an original chat", async () => {
    const store = new MemoryMissionRunStore()
    const target = service(store)
    await target.admit({ mission: mission() })
    await target.failDispatch({ runId: "run-1", reason: "send_failed" })

    await expect(target.admitRetry("run-1", "unrelated-session")).rejects.toThrow(/original chat/i)
    expect(store.state.runs).toHaveLength(1)
  })

  it("retries only the latest interrupted attempt and admits one concurrent retry", async () => {
    const store = new MemoryMissionRunStore()
    const target = service(store)
    await target.admit({ mission: mission() })
    await expect(target.admitRetry("run-1")).rejects.toThrow(/retry/i)
    await target.start({ runId: "run-1", sessionId: "session-1", generationId: "generation-1" })
    await target.settleChatTurn({
      sessionId: "session-1",
      generationId: "generation-1",
      outcome: "failed",
      reason: "agent_error",
    })
    const previous = structuredClone(store.state.runs[0])
    const results = await Promise.allSettled([
      target.admitRetry("run-1", "session-1"),
      target.admitRetry("run-1", "session-1"),
    ])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(store.state.runs).toHaveLength(2)
    expect(store.state.runs[0]).toEqual(previous)
    expect(store.state.runs[1]).toMatchObject({ attempt: 2, status: "admitted", mission: previous!.mission })
    await target.failDispatch({ runId: "run-2", reason: "send_failed" })
    await expect(target.admitRetry("run-1", "session-1")).rejects.toThrow(/latest/i)
  })

  it("preserves the original chat when a retry dispatch fails before start", async () => {
    const store = new MemoryMissionRunStore()
    const target = service(store)
    await target.admit({ mission: mission() })
    await target.start({ runId: "run-1", sessionId: "session-1", generationId: "generation-1" })
    await target.settleChatTurn({
      sessionId: "session-1",
      generationId: "generation-1",
      outcome: "failed",
      reason: "agent_error",
    })
    const retry = await target.admitRetry("run-1", "session-1")

    await expect(
      target.start({ runId: retry.runId, sessionId: "other-session", generationId: "generation-2" }),
    ).rejects.toThrow(/original chat/i)

    await target.failDispatch({ runId: retry.runId, reason: "send_failed" })

    expect((await target.list()).find((run) => run.runId === retry.runId)?.sessionId).toBe("session-1")
    const restarted = service(store)
    expect((await restarted.list()).find((run) => run.runId === retry.runId)?.sessionId).toBe("session-1")
    await expect(restarted.admitRetry(retry.runId, "other-session")).rejects.toThrow(/original chat/i)
    await expect(target.admitRetry(retry.runId, "session-1")).resolves.toMatchObject({
      attempt: 3,
      runId: "run-3",
      status: "admitted",
    })
  })

  it("rejects retry after the fleet changes without appending a run", async () => {
    const store = new MemoryMissionRunStore()
    const target = service(store)
    await target.admit({ mission: mission() })
    await target.start({ runId: "run-1", sessionId: "session-1", generationId: "generation-1" })
    await target.settleChatTurn({
      sessionId: "session-1",
      generationId: "generation-1",
      outcome: "failed",
      reason: "agent_error",
    })
    const changed = new MissionRunServiceImpl({
      store,
      runtimeFleet: async () => ({ ...builtinRuntimeFleetIndex.snapshot, revision: "changed" }),
    })
    await expect(changed.admitRetry("run-1", "session-1")).rejects.toThrow(/revision/i)
    expect(store.state.runs).toHaveLength(1)
  })

  it("shows failed terminal persistence and repairs the original outcome without rerunning", async () => {
    const store = new MemoryMissionRunStore()
    const target = service(store)
    await target.admit({ mission: mission() })
    await target.start({ runId: "run-1", sessionId: "session-1", generationId: "gen-1" })
    const write = vi.spyOn(store, "write").mockRejectedValueOnce(new Error("disk unavailable"))
    await expect(
      target.settleChatTurn({
        sessionId: "session-1",
        generationId: "gen-1",
        outcome: "completed",
        reason: "message_completed",
      }),
    ).rejects.toThrow()
    expect((await target.list())[0]).toMatchObject({ status: "running", persistencePending: true })
    // A late failure must not replace the first observed completed outcome.
    await target.settleChatTurn({
      sessionId: "session-1",
      generationId: "gen-1",
      outcome: "failed",
      reason: "agent_error",
    })
    await target.retrySettlement("run-1")
    expect((await target.list())[0]).toMatchObject({ status: "completed" })
    expect((await target.list())[0]?.persistencePending).toBeFalsy()
    expect(store.state.runs).toHaveLength(1)
    expect(store.state.runs[0]?.events.at(-1)?.reason).toBe("message_completed")
    write.mockRestore()
    await expect(target.admitRetry("run-1")).rejects.toThrow(/retry/i)
  })

  it("durably admits the exact confirmed blueprint with its first ordered event", async () => {
    const store = new MemoryMissionRunStore()
    const target = service(store)

    const run = await target.admit({ mission: mission() })

    expect(run).toMatchObject({
      attempt: 1,
      createdAt: 1_000,
      fleetRevision: builtinRuntimeFleetIndex.snapshot.revision,
      goal: "完成一次可审计任务",
      missionId: "mission-1",
      runId: "run-1",
      status: "admitted",
      updatedAt: 1_000,
    })
    expect(run.events).toEqual([{ at: 1_000, sequence: 1, status: "admitted", type: "mission-admitted" }])
    expect(store.writes).toHaveLength(1)
    expect(store.state.runs[0]?.mission.nodes).toHaveLength(3)
    expect(store.state.nextSequence).toBe(2)
  })

  it("returns the same active run for an identical retried admission without writing again", async () => {
    const store = new MemoryMissionRunStore()
    const target = service(store)
    const input = mission()

    const first = await target.admit({ mission: input })
    const second = await target.admit({ mission: structuredClone(input) })

    expect(second.runId).toBe(first.runId)
    expect(store.writes).toHaveLength(1)
  })

  it("creates a new numbered attempt only after an identical prior run is terminal", async () => {
    const store = new MemoryMissionRunStore()
    const target = service(store)
    const input = mission()
    const first = await target.admit({ mission: input })
    await target.failDispatch({ reason: "send_failed", runId: first.runId })

    const retry = await target.admit({ mission: input })

    expect(retry).toMatchObject({ attempt: 2, runId: "run-2", status: "admitted" })
  })

  it.each([
    ["stale fleet", () => mission({ fleetRevision: "old-pack@1.0.0" }), /fleet revision/i],
    [
      "unknown agent",
      () => {
        const input = mission()
        input.nodes[0] = { ...input.nodes[0]!, agentId: "unknown-agent" }
        return input
      },
      /agent/i,
    ],
    [
      "cyclic graph",
      () => {
        const input = mission()
        input.nodes[0] = { ...input.nodes[0]!, dependsOn: [input.nodes[1]!.id] }
        return input
      },
      /cycle/i,
    ],
    [
      "non-empty artifacts",
      () =>
        mission({
          artifacts: [
            { agentId: "watchtide-captain", id: "artifact-1", nodeId: "chief-review", path: "C:\\secret", version: 1 },
          ],
        }),
      /artifact/i,
    ],
    ["changed duplicate identity", () => mission({ goal: "不同的目标" }), /mission id/i],
  ])("rejects %s without overwriting durable history", async (_label, buildInput, expected) => {
    const store = new MemoryMissionRunStore()
    const target = service(store)
    if (_label === "changed duplicate identity") {
      await target.admit({ mission: mission() })
    }
    const writesBefore = store.writes.length

    await expect(target.admit({ mission: buildInput() })).rejects.toThrow(expected)
    expect(store.writes).toHaveLength(writesBefore)
  })
})

describe("MissionRunServiceImpl lifecycle", () => {
  it("preserves event ordering when the system clock moves backwards", async () => {
    let now = 5000
    const store = new MemoryMissionRunStore()
    const target = service(store, { now: () => now })
    const run = await target.admit({ mission: mission() })
    now = 4000
    await target.start({ runId: run.runId, sessionId: "clock-session", generationId: "clock-generation" })
    now = 3000
    await target.settleChatTurn({
      sessionId: "clock-session",
      generationId: "clock-generation",
      outcome: "completed",
      reason: "message_completed",
    })
    expect((await target.list())[0]?.events.map((event) => event.at)).toEqual([5000, 5000, 5000])
  })
  it("ignores a late terminal callback from an older generation in the same session", async () => {
    const store = new MemoryMissionRunStore()
    const target = service(store)
    const input = mission()
    const first = await target.admit({ mission: input })
    await target.start({ runId: first.runId, sessionId: "shared-session", generationId: "old-generation" })
    await target.settleChatTurn({
      sessionId: "shared-session",
      generationId: "old-generation",
      outcome: "cancelled",
      reason: "user_stopped",
    })
    const retry = await target.admit({ mission: input })
    await target.start({ runId: retry.runId, sessionId: "shared-session", generationId: "new-generation" })
    await target.settleChatTurn({
      sessionId: "shared-session",
      generationId: "old-generation",
      outcome: "completed",
      reason: "message_completed",
    })
    expect((await target.list()).find((run) => run.runId === retry.runId)?.status).toBe("running")
    expect(store.writes).toHaveLength(5)
  })

  it("keeps the admitted state when session-binding persistence fails", async () => {
    const store = new MemoryMissionRunStore()
    const target = service(store)
    const admitted = await target.admit({ mission: mission() })
    vi.spyOn(store, "write").mockRejectedValueOnce(new Error("disk full"))
    await expect(
      target.start({ runId: admitted.runId, sessionId: "session", generationId: "generation" }),
    ).rejects.toThrow("disk full")
    expect((await target.list())[0]?.status).toBe("admitted")
    expect(store.state.runs[0]?.events).toHaveLength(1)
  })
  it("binds a session, settles from the main-process chat outcome, and ignores duplicates", async () => {
    let clock = 1_000
    const store = new MemoryMissionRunStore()
    const target = service(store, { now: () => (clock += 100) })
    const admitted = await target.admit({ mission: mission() })

    const started = await target.start({ runId: admitted.runId, generationId: "generation-1", sessionId: "session-1" })
    const repeated = await target.start({ runId: admitted.runId, generationId: "generation-1", sessionId: "session-1" })
    await target.settleChatTurn({
      outcome: "completed",
      reason: "message_completed",
      generationId: "generation-1",
      sessionId: "session-1",
    })
    await target.settleChatTurn({
      outcome: "failed",
      reason: "agent_error",
      generationId: "generation-1",
      sessionId: "session-1",
    })

    expect(started.status).toBe("running")
    expect(repeated.events).toHaveLength(2)
    const [run] = await target.list()
    expect(run?.status).toBe("completed")
    expect(run?.events).toEqual([
      { at: 1_100, sequence: 1, status: "admitted", type: "mission-admitted" },
      {
        at: 1_200,
        sequence: 2,
        generationId: "generation-1",
        sessionId: "session-1",
        status: "running",
        type: "mission-started",
      },
      {
        at: 1_300,
        reason: "message_completed",
        sequence: 3,
        status: "completed",
        type: "mission-completed",
      },
    ])
    expect(store.writes).toHaveLength(3)
  })

  it("maps explicit user stop to cancellation and an Agent error to failure", async () => {
    let clock = 2_000
    const store = new MemoryMissionRunStore()
    const target = service(store, { now: () => (clock += 10) })
    const first = await target.admit({ mission: mission({ id: "mission-cancel" }) })
    await target.start({ runId: first.runId, generationId: "generation-cancel", sessionId: "session-cancel" })
    await target.settleChatTurn({
      outcome: "cancelled",
      reason: "user_stopped",
      generationId: "generation-cancel",
      sessionId: "session-cancel",
    })
    const second = await target.admit({ mission: mission({ id: "mission-fail" }) })
    await target.start({ runId: second.runId, generationId: "generation-fail", sessionId: "session-fail" })
    await target.settleChatTurn({
      outcome: "failed",
      reason: "agent_error",
      generationId: "generation-fail",
      sessionId: "session-fail",
    })

    expect((await target.list()).map(({ status }) => status)).toEqual(["failed", "cancelled"])
  })

  it("does not write when an ordinary chat session has no running Mission", async () => {
    const store = new MemoryMissionRunStore()
    const target = service(store)

    await target.settleChatTurn({
      outcome: "completed",
      reason: "message_completed",
      generationId: "ordinary-generation",
      sessionId: "ordinary-chat",
    })

    expect(store.writes).toHaveLength(0)
  })

  it("recovers every non-terminal run as blocked exactly once after restart", async () => {
    let clock = 3_000
    const store = new MemoryMissionRunStore()
    const firstProcess = service(store, { now: () => (clock += 10) })
    const admitted = await firstProcess.admit({ mission: mission() })
    await firstProcess.start({ runId: admitted.runId, generationId: "generation-1", sessionId: "session-1" })
    const writesBeforeRestart = store.writes.length

    const restarted = service(store, { now: () => (clock += 10) })
    const [recovered] = await restarted.list()

    expect(recovered?.status).toBe("blocked")
    expect(recovered?.events.at(-1)).toEqual({
      at: 3_030,
      reason: "app_restarted",
      sequence: 3,
      status: "blocked",
      type: "mission-recovery-blocked",
    })
    expect(store.writes).toHaveLength(writesBeforeRestart + 1)

    const secondRestart = service(store, { now: () => (clock += 10) })
    await secondRestart.list()
    expect(store.writes).toHaveLength(writesBeforeRestart + 1)
  })

  it("serializes concurrent admissions without losing runs or event sequences", async () => {
    let clock = 4_000
    const store = new MemoryMissionRunStore()
    const target = service(store, { now: () => (clock += 1) })

    await Promise.all([
      target.admit({ mission: mission({ id: "mission-a" }) }),
      target.admit({ mission: mission({ id: "mission-b" }) }),
      target.admit({ mission: mission({ id: "mission-c" }) }),
    ])

    expect((await target.list()).map(({ missionId }) => missionId)).toEqual(["mission-c", "mission-b", "mission-a"])
    expect(
      store.state.runs.flatMap(({ events }) => events.map(({ sequence }) => sequence)).sort((a, b) => a - b),
    ).toEqual([1, 2, 3])
  })

  it("does not advance in-memory state when a durable write fails", async () => {
    const store = new MemoryMissionRunStore()
    const write = vi.spyOn(store, "write").mockRejectedValueOnce(new Error("disk full"))
    const target = service(store)

    await expect(target.admit({ mission: mission() })).rejects.toThrow(/disk full/i)
    write.mockRestore()
    expect(await target.list()).toEqual([])
  })
})
