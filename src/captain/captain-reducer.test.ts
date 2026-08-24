import type { CaptainEvent, CaptainEventSource, CaptainEventType } from "./captain-types.ts"

import { describe, expect, it } from "vitest"
import {
  captainExpressionByState,
  captainReducer,
  captainStreamIndexesShareStructure,
  captainStreamSequence,
  createCaptainState,
  resetCaptainState,
  retiredCaptainEventSequence,
  retiredCaptainIndexesShareStructure,
  tickCaptainState,
} from "./captain-reducer.ts"
import { CAPTAIN_CAPTION_KEYS } from "./captain-types.ts"

interface EventOptions {
  id: string
  epoch?: number
  source?: CaptainEvent["source"]
  taskId?: string | null
  sequence?: number
  startedAt?: number
  expiresAt?: number | null
  captionParams?: CaptainEvent["captionParams"]
}

const captionKeyByEventType: Readonly<Record<CaptainEventType, CaptainEvent["captionKey"]>> = {
  "captain.idle": "captain.idle",
  "input.listening": "captain.listening",
  "assistant.thinking": "captain.thinking",
  "task.started": "captain.executing",
  "tool.started": "captain.executing",
  "speech.started": "captain.reporting",
  "permission.required": "captain.warning",
  "task.warning": "captain.warning",
  "task.succeeded": "captain.success",
  "task.failed": "captain.failure",
  "task.cancelled": "captain.idle",
  "speech.finished": "captain.idle",
  "speech.failed": "captain.idle",
  "event.dismissed": "captain.idle",
}

function event(type: CaptainEventType, options: EventOptions): CaptainEvent {
  return {
    id: options.id,
    epoch: options.epoch ?? 0,
    type,
    source: options.source ?? "task",
    taskId: options.taskId ?? options.id,
    sequence: options.sequence ?? 1,
    startedAt: options.startedAt ?? 0,
    expiresAt: options.expiresAt ?? null,
    captionKey: captionKeyByEventType[type],
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
        secret: "SECRET-raw-chat-content",
        toolOutput: "raw tool output",
        nested: { content: "not a primitive" },
      },
    } as unknown as CaptainEvent

    const state = captainReducer(createCaptainState(), unsafeInput)
    const stored = state.activeEvents["safe-event"] as CaptainEvent & Record<string, unknown>
    expect(Object.keys(stored).sort()).toEqual([
      "captionKey",
      "captionParams",
      "epoch",
      "expiresAt",
      "id",
      "sequence",
      "source",
      "startedAt",
      "taskId",
      "type",
    ])
    expect(stored.captionParams).toEqual({ count: 2, allowed: true })
    expect(JSON.stringify(state.snapshot)).not.toContain("SECRET")
    expect(JSON.stringify(state.snapshot)).not.toContain("raw tool output")
    expect(stored.rawChatContent).toBeUndefined()
    expect(stored.rawToolOutput).toBeUndefined()
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.activeEvents)).toBe(true)
    expect(Object.isFrozen(stored)).toBe(true)
    expect(Object.isFrozen(stored.captionParams)).toBe(true)
    expect(Object.isFrozen(state.snapshot)).toBe(true)
    expect(Object.isFrozen(captainExpressionByState)).toBe(true)
  })

  it("rejects captions outside the closed catalog", () => {
    const initial = createCaptainState()
    const arbitraryCaption = {
      ...event("assistant.thinking", { id: "arbitrary-caption" }),
      captionKey: "captain.private.rawPayload",
    } as unknown as CaptainEvent

    expect(captainReducer(initial, arbitraryCaption)).toBe(initial)
    expect(Object.isFrozen(CAPTAIN_CAPTION_KEYS)).toBe(true)
  })

  it.each(["__proto__", "constructor", "toString"])("stores prototype-shaped event IDs as own keys: %s", (id) => {
    const state = captainReducer(createCaptainState(), event("assistant.thinking", { id }))

    expect(Object.hasOwn(state.activeEvents, id)).toBe(true)
    expect(state.activeEvents[id]?.id).toBe(id)
    expect(state.snapshot.activeEventId).toBe(id)
    expect(Object.getPrototypeOf(state.activeEvents)).toBeNull()
    expect(Object.isFrozen(state.latestSequenceByStream)).toBe(true)
    expect(Object.keys(state.latestSequenceByStream).sort()).toEqual(["height", "size"])
  })

  it("permanently retires a terminal lifecycle ID and treats later reuse or dismissal as no-ops", () => {
    const task = event("task.started", {
      id: "task-lifecycle",
      source: "task",
      taskId: "task-1",
      sequence: 4,
    })
    let state = captainReducer(createCaptainState(), task)
    state = captainReducer(state, dismiss(task, 5))

    expect(state.activeEvents[task.id]).toBeUndefined()
    expect(retiredCaptainEventSequence(state.retiredEventIds, task.id)).toBe(5)
    expect(Object.isFrozen(state.retiredEventIds)).toBe(true)
    expect(Object.keys(state.retiredEventIds).sort()).toEqual(["height", "size"])

    const retired = state
    state = captainReducer(
      state,
      event("task.started", {
        id: task.id,
        source: task.source,
        taskId: task.taskId,
        sequence: 99,
        startedAt: 99,
      }),
    )
    expect(state).toBe(retired)
    state = captainReducer(state, dismiss({ ...task, sequence: 99 }, 100))
    expect(state).toBe(retired)

    state = captainReducer(state, event("task.started", { id: "new-lifecycle", taskId: "task-2" }))
    expect(state.activeEvents["new-lifecycle"]?.taskId).toBe("task-2")
  })

  it("retires and watermarks a terminal event that arrives before its start", () => {
    const earlyTerminal = event("event.dismissed", {
      id: "terminal-before-start",
      source: "task",
      taskId: "task-early",
      sequence: 2,
      startedAt: 2,
    })
    let state = captainReducer(createCaptainState(), earlyTerminal)

    expect(retiredCaptainEventSequence(state.retiredEventIds, earlyTerminal.id)).toBe(2)
    expect(captainStreamSequence(state.latestSequenceByStream, "task", "task-early")).toBe(2)
    const retired = state
    state = captainReducer(
      state,
      event("task.started", {
        id: earlyTerminal.id,
        source: earlyTerminal.source,
        taskId: earlyTerminal.taskId,
        sequence: 1,
        startedAt: 1,
      }),
    )
    expect(state).toBe(retired)
    state = captainReducer(
      state,
      event("task.started", {
        id: earlyTerminal.id,
        source: earlyTerminal.source,
        taskId: earlyTerminal.taskId,
        sequence: 3,
        startedAt: 3,
      }),
    )
    expect(state).toBe(retired)
    state = captainReducer(
      state,
      event("task.started", {
        id: earlyTerminal.id,
        source: "task",
        taskId: "another-task",
        sequence: 1,
      }),
    )
    expect(state).toBe(retired)

    state = captainReducer(state, event("task.started", { id: "new-unique-id", taskId: "another-task" }))
    expect(state.activeEvents["new-unique-id"]?.taskId).toBe("another-task")
  })

  it("retires expired IDs at their accepted sequence and refuses higher-sequence resurrection", () => {
    const expiring = event("speech.started", {
      id: "speech-expiring",
      source: "speech",
      taskId: "task-1",
      sequence: 7,
      startedAt: 10,
      expiresAt: 20,
    })
    let state = captainReducer(createCaptainState(), expiring)
    state = tickCaptainState(state, 21)

    expect(state.snapshot.state).toBe("idle")
    expect(retiredCaptainEventSequence(state.retiredEventIds, expiring.id)).toBe(7)
    const retired = state
    state = captainReducer(
      state,
      event("speech.started", {
        id: expiring.id,
        source: expiring.source,
        taskId: expiring.taskId,
        sequence: 70,
        startedAt: 70,
        expiresAt: 80,
      }),
    )
    expect(state).toBe(retired)
  })

  it("allows same-stream active updates while rejecting cross-stream reuse of an active ID", () => {
    const thinking = event("assistant.thinking", {
      id: "shared-active-id",
      source: "chat",
      taskId: "task-1",
      sequence: 1,
    })
    let state = captainReducer(createCaptainState(), thinking)
    state = captainReducer(
      state,
      event("task.started", {
        id: thinking.id,
        source: thinking.source,
        taskId: thinking.taskId,
        sequence: 2,
        startedAt: 2,
      }),
    )
    expect(state.snapshot.state).toBe("executing")
    expect(state.activeEvents[thinking.id]?.sequence).toBe(2)

    const beforeCrossStream = state
    state = captainReducer(
      state,
      event("task.failed", {
        id: thinking.id,
        source: "tool",
        taskId: "task-2",
        sequence: 50,
        startedAt: 50,
      }),
    )
    expect(state).toBe(beforeCrossStream)
    expect(state.snapshot.state).toBe("executing")
  })

  it("accepts only events from the active orchestrator epoch", () => {
    const initial = createCaptainState()
    expect(initial.epoch).toBe(0)

    const staleOrFuture = event("task.started", {
      id: "wrong-epoch",
      epoch: 1,
      taskId: "task-epoch",
      sequence: 999,
    })
    expect(captainReducer(initial, staleOrFuture)).toBe(initial)
  })

  it("resets lifecycle history only into a strictly newer epoch", () => {
    const task = event("task.started", { id: "epoch-task", taskId: "task-epoch", sequence: 1 })
    let state = captainReducer(createCaptainState(), task)
    state = captainReducer(state, dismiss(task, 2))
    expect(state.retiredEventIds.size).toBe(1)
    expect(state.latestSequenceByStream.size).toBe(1)
    expect(captainStreamSequence(state.latestSequenceByStream, "task", "task-epoch")).toBe(2)

    const reset = resetCaptainState(state, 1)
    expect(reset.epoch).toBe(1)
    expect(Object.keys(reset.activeEvents)).toHaveLength(0)
    expect(reset.latestSequenceByStream.size).toBe(0)
    expect(reset.retiredEventIds.size).toBe(0)
    expect(reset.snapshot.state).toBe("idle")
    expect(resetCaptainState(reset, 1)).toBe(reset)
    expect(resetCaptainState(reset, 0)).toBe(reset)
    expect(resetCaptainState(reset, 1.5)).toBe(reset)

    expect(
      captainReducer(
        reset,
        event("task.started", {
          id: "old-epoch-high-sequence",
          epoch: 0,
          sequence: 100_000,
        }),
      ),
    ).toBe(reset)
    const current = captainReducer(
      reset,
      event("task.started", {
        id: "new-epoch-task",
        epoch: 1,
        sequence: 1,
      }),
    )
    expect(current.activeEvents["new-epoch-task"]?.epoch).toBe(1)
  })

  it("keeps thousands of retired IDs in a balanced persistent index", () => {
    const initial = createCaptainState()
    let state = initial
    let midpoint = initial.retiredEventIds
    for (let index = 0; index < 4_096; index += 1) {
      state = captainReducer(
        state,
        event("event.dismissed", {
          id: `bulk-retired-${index.toString().padStart(4, "0")}`,
          source: "task",
          taskId: "bulk-retirement-stream",
          sequence: index + 1,
          startedAt: index + 1,
        }),
      )
      if (index === 2_047) midpoint = state.retiredEventIds
    }

    expect(state.retiredEventIds).not.toBe(midpoint)
    expect(retiredCaptainIndexesShareStructure(midpoint, state.retiredEventIds)).toBe(true)
    expect(Object.isFrozen(state.retiredEventIds)).toBe(true)
    expect(state.retiredEventIds.size).toBe(4_096)
    expect(state.retiredEventIds.height).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(4_096 + 1)))
    expect(midpoint.size).toBe(2_048)
    expect(retiredCaptainEventSequence(midpoint, "bulk-retired-4095")).toBeUndefined()
    expect(retiredCaptainEventSequence(state.retiredEventIds, "bulk-retired-0000")).toBe(1)
    expect(retiredCaptainEventSequence(state.retiredEventIds, "bulk-retired-2047")).toBe(2_048)
    expect(retiredCaptainEventSequence(state.retiredEventIds, "bulk-retired-4095")).toBe(4_096)
    expect(initial.retiredEventIds.size).toBe(0)
  })

  it("keeps canonically equivalent but byte-distinct lifecycle IDs separate", () => {
    const composedId = "retired-é"
    const decomposedId = "retired-e\u0301"
    expect(composedId).not.toBe(decomposedId)

    let state = captainReducer(
      createCaptainState(),
      event("event.dismissed", {
        id: composedId,
        taskId: "unicode-retirement-stream",
        sequence: 1,
      }),
    )
    state = captainReducer(
      state,
      event("event.dismissed", {
        id: decomposedId,
        taskId: "unicode-retirement-stream",
        sequence: 2,
        startedAt: 2,
      }),
    )

    expect(state.retiredEventIds.size).toBe(2)
    expect(retiredCaptainEventSequence(state.retiredEventIds, composedId)).toBe(1)
    expect(retiredCaptainEventSequence(state.retiredEventIds, decomposedId)).toBe(2)
  })

  it("keeps thousands of independent stream watermarks in a balanced persistent index", () => {
    const initial = createCaptainState()
    let state = initial
    let midpoint = initial.latestSequenceByStream
    const startedAt = performance.now()
    for (let index = 0; index < 4_096; index += 1) {
      const source: CaptainEventSource = index % 2 === 0 ? "task" : "tool"
      const taskId = `independent-stream-${index.toString().padStart(4, "0")}`
      state = captainReducer(
        state,
        event("event.dismissed", {
          id: `independent-terminal-${index.toString().padStart(4, "0")}`,
          source,
          taskId,
          sequence: index + 1,
          startedAt: index + 1,
        }),
      )
      if (index === 2_047) midpoint = state.latestSequenceByStream
    }
    const elapsedMs = performance.now() - startedAt

    expect(state.latestSequenceByStream).not.toBe(midpoint)
    expect(captainStreamIndexesShareStructure(midpoint, state.latestSequenceByStream)).toBe(true)
    expect(Object.isFrozen(state.latestSequenceByStream)).toBe(true)
    expect(state.latestSequenceByStream.size).toBe(4_096)
    expect(state.latestSequenceByStream.height).toBeLessThanOrEqual(2 * Math.ceil(Math.log2(4_096 + 1)))
    expect(midpoint.size).toBe(2_048)
    expect(captainStreamSequence(midpoint, "tool", "independent-stream-4095")).toBeUndefined()
    for (let index = 0; index < 4_096; index += 1) {
      const source: CaptainEventSource = index % 2 === 0 ? "task" : "tool"
      expect(
        captainStreamSequence(
          state.latestSequenceByStream,
          source,
          `independent-stream-${index.toString().padStart(4, "0")}`,
        ),
      ).toBe(index + 1)
    }
    expect(initial.latestSequenceByStream.size).toBe(0)
    expect(elapsedMs).toBeLessThan(5_000)
  })

  it("rejects unsafe task IDs at the public stream lookup boundary", () => {
    let state = createCaptainState()
    state = captainReducer(state, {
      ...event("event.dismissed", {
        id: "null-task-stream-terminal",
        sequence: 7,
        startedAt: 7,
      }),
      taskId: null,
    })
    state = captainReducer(
      state,
      event("event.dismissed", {
        id: "ordinary-task-stream-terminal",
        taskId: "ordinary-task-stream",
        sequence: 9,
        startedAt: 9,
      }),
    )

    expect(captainStreamSequence(state.latestSequenceByStream, "task", null)).toBe(7)
    expect(captainStreamSequence(state.latestSequenceByStream, "task", "ordinary-task-stream")).toBe(9)
    for (const unsafeTaskId of [
      "",
      "contains\0nul",
      "contains\nline-feed",
      "contains\rcarriage-return",
      "x".repeat(161),
    ]) {
      expect(captainStreamSequence(state.latestSequenceByStream, "task", unsafeTaskId)).toBeUndefined()
    }
  })
})
