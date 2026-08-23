import type { CaptainEvent, CaptainEventType } from "./captain-types.ts"

import { describe, expect, it } from "vitest"
import { captainExpressionByState, captainReducer, createCaptainState, tickCaptainState } from "./captain-reducer.ts"

interface EventOptions {
  id: string
  source?: CaptainEvent["source"]
  taskId?: string | null
  sequence?: number
  startedAt?: number
  expiresAt?: number | null
  captionParams?: CaptainEvent["captionParams"]
}

function event(type: CaptainEventType, options: EventOptions): CaptainEvent {
  return {
    id: options.id,
    type,
    source: options.source ?? "task",
    taskId: options.taskId ?? options.id,
    sequence: options.sequence ?? 1,
    startedAt: options.startedAt ?? 0,
    expiresAt: options.expiresAt ?? null,
    captionKey: `captain.test.${type}`,
    captionParams: options.captionParams ?? {},
  }
}

function dismiss(target: CaptainEvent, sequence = target.sequence + 1): CaptainEvent {
  return event("event.dismissed", {
    id: target.id,
    source: target.source,
    taskId: target.taskId,
    sequence,
    startedAt: target.startedAt + 1,
  })
}

describe("captain priority reducer", () => {
  it("preserves all eight states and restores the literal priority chain", () => {
    const ordered = [
      event("captain.idle", { id: "idle" }),
      event("task.succeeded", { id: "success" }),
      event("input.listening", { id: "listening" }),
      event("assistant.thinking", { id: "thinking" }),
      event("task.started", { id: "executing" }),
      event("speech.started", { id: "reporting" }),
      event("permission.required", { id: "warning" }),
      event("task.failed", { id: "failure" }),
    ] as const
    const expected = ["idle", "success", "listening", "thinking", "executing", "reporting", "warning", "failure"]

    let state = createCaptainState()
    ordered.forEach((nextEvent, index) => {
      state = captainReducer(state, nextEvent)
      expect(state.snapshot.state).toBe(expected[index])
    })

    for (let index = ordered.length - 1; index > 0; index -= 1) {
      state = captainReducer(state, dismiss(ordered[index]))
      expect(state.snapshot.state).toBe(expected[index - 1])
    }
    expect(Object.keys(state.activeEvents)).toEqual(["idle"])
  })

  it("ranks failure above warning and resolves equal tiers by sequence, startedAt, then id", () => {
    const warningB = event("permission.required", {
      id: "warning-b",
      taskId: "task-b",
      sequence: 4,
      startedAt: 20,
    })
    const warningA = event("permission.required", {
      id: "warning-a",
      taskId: "task-a",
      sequence: 4,
      startedAt: 20,
    })
    const warningLater = event("task.warning", {
      id: "warning-later",
      taskId: "task-later",
      sequence: 4,
      startedAt: 21,
    })
    const warningHigherSequence = event("task.warning", {
      id: "warning-sequence",
      taskId: "task-sequence",
      sequence: 5,
      startedAt: 1,
    })
    const failure = event("task.failed", {
      id: "failure",
      taskId: "task-failure",
      sequence: 1,
      startedAt: 0,
    })

    let state = createCaptainState()
    state = captainReducer(state, warningB)
    state = captainReducer(state, warningA)
    expect(state.snapshot.activeEventId).toBe("warning-a")
    state = captainReducer(state, warningLater)
    expect(state.snapshot.activeEventId).toBe("warning-later")
    state = captainReducer(state, warningHigherSequence)
    expect(state.snapshot.activeEventId).toBe("warning-sequence")
    state = captainReducer(state, failure)
    expect(state.snapshot.state).toBe("failure")
    expect(state.snapshot.activeEventId).toBe("failure")
  })

  it("restores executing after a higher-priority report expires", () => {
    const executing = event("task.started", {
      id: "task-1",
      taskId: "task-1",
      startedAt: 0,
      expiresAt: 60_000,
    })
    const reporting = event("speech.started", {
      id: "speech-1",
      source: "speech",
      taskId: "task-1",
      startedAt: 10,
      expiresAt: 2_000,
    })

    let state = captainReducer(createCaptainState(), executing)
    state = captainReducer(state, reporting)
    expect(state.snapshot.state).toBe("reporting")
    state = tickCaptainState(state, 2_001)
    expect(state.snapshot.state).toBe("executing")
    expect(Object.keys(state.activeEvents)).toEqual(["task-1"])
  })

  it("keeps two task streams isolated and dismisses only the target warning or task", () => {
    const taskOne = event("task.started", { id: "task-event-1", taskId: "task-1" })
    const taskTwo = event("task.started", { id: "task-event-2", taskId: "task-2" })
    const warning = event("permission.required", {
      id: "warning-2",
      source: "permission",
      taskId: "task-2",
    })

    let state = captainReducer(createCaptainState(), taskOne)
    state = captainReducer(state, taskTwo)
    state = captainReducer(state, warning)
    expect(state.snapshot.state).toBe("warning")
    expect(Object.keys(state.activeEvents).sort()).toEqual(["task-event-1", "task-event-2", "warning-2"])

    state = captainReducer(state, dismiss(warning))
    expect(state.snapshot.state).toBe("executing")
    expect(Object.keys(state.activeEvents).sort()).toEqual(["task-event-1", "task-event-2"])

    state = captainReducer(state, dismiss(taskOne))
    expect(state.snapshot.state).toBe("executing")
    expect(Object.keys(state.activeEvents)).toEqual(["task-event-2"])
  })

  it("rejects late sequence updates only within their source and task stream", () => {
    const currentTaskOne = event("assistant.thinking", {
      id: "thinking-1",
      source: "chat",
      taskId: "task-1",
      sequence: 8,
      startedAt: 8,
    })
    const lateTaskOne = event("task.failed", {
      id: "failure-late",
      source: "chat",
      taskId: "task-1",
      sequence: 7,
      startedAt: 9,
    })
    const independentTaskTwo = event("task.started", {
      id: "executing-2",
      source: "chat",
      taskId: "task-2",
      sequence: 1,
      startedAt: 1,
    })

    let state = captainReducer(createCaptainState(), currentTaskOne)
    const beforeLate = state
    state = captainReducer(state, lateTaskOne)
    expect(state).toBe(beforeLate)
    expect(state.activeEvents["failure-late"]).toBeUndefined()

    state = captainReducer(state, independentTaskTwo)
    expect(state.activeEvents["executing-2"]?.taskId).toBe("task-2")
    expect(state.snapshot.state).toBe("executing")
  })

  it("exposes mouth level only for the reporting winner", () => {
    const report = event("speech.started", {
      id: "speech-1",
      source: "speech",
      captionParams: { mouthLevel: 0.72 },
    })
    const warning = event("permission.required", {
      id: "warning-1",
      source: "permission",
      captionParams: { mouthLevel: 1 },
    })

    let state = captainReducer(createCaptainState(), report)
    expect(state.snapshot.state).toBe("reporting")
    expect(state.snapshot.mouthLevel).toBe(0.72)
    state = captainReducer(state, warning)
    expect(state.snapshot.state).toBe("warning")
    expect(state.snapshot.mouthLevel).toBe(0)
    state = captainReducer(state, dismiss(warning))
    expect(state.snapshot.mouthLevel).toBe(0.72)

    const executingOnly = captainReducer(
      createCaptainState(),
      event("task.started", { id: "task", captionParams: { mouthLevel: 3 } }),
    )
    expect(executingOnly.snapshot.mouthLevel).toBe(0)
  })

  it("stores only frozen safe event fields and primitive caption parameters", () => {
    const unsafeInput = {
      ...event("assistant.thinking", {
        id: "safe-event",
        source: "chat",
        captionParams: { count: 2, allowed: true },
      }),
      rawChatContent: "do not retain me",
      rawToolOutput: { secret: "do not retain me" },
      captionParams: {
        count: 2,
        allowed: true,
        nested: { content: "not a primitive" },
      },
    } as unknown as CaptainEvent

    const state = captainReducer(createCaptainState(), unsafeInput)
    const stored = state.activeEvents["safe-event"] as CaptainEvent & Record<string, unknown>
    expect(Object.keys(stored).sort()).toEqual([
      "captionKey",
      "captionParams",
      "expiresAt",
      "id",
      "sequence",
      "source",
      "startedAt",
      "taskId",
      "type",
    ])
    expect(stored.captionParams).toEqual({ count: 2, allowed: true })
    expect(stored.rawChatContent).toBeUndefined()
    expect(stored.rawToolOutput).toBeUndefined()
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.activeEvents)).toBe(true)
    expect(Object.isFrozen(stored)).toBe(true)
    expect(Object.isFrozen(stored.captionParams)).toBe(true)
    expect(Object.isFrozen(state.snapshot)).toBe(true)
    expect(Object.isFrozen(captainExpressionByState)).toBe(true)
  })
})
