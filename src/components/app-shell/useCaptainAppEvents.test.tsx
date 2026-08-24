// @vitest-environment happy-dom

import type { CaptainAppEventInput } from "./app-shell-types.ts"
import type { CaptainEventType } from "@/captain/captain-types.ts"

import { describe, expect, it } from "vitest"
import {
  createCaptainAppEventMapperState,
  mapCaptainChatLifecycle,
  mapCaptainAppEvents,
  voiceIntentForCaptainEvent,
} from "./useCaptainAppEvents.ts"

function input(overrides: Partial<CaptainAppEventInput> = {}): CaptainAppEventInput {
  return {
    route: "chat",
    activeSessionId: null,
    displayedStatus: "ready",
    agentStatus: { status: "ready" },
    pendingPermissions: [],
    activity: null,
    error: null,
    ...overrides,
  }
}

function types(events: readonly { type: CaptainEventType }[]): CaptainEventType[] {
  return events.map((event) => event.type)
}

describe("useCaptainAppEvents semantic mapping", () => {
  it("diffs route, listening, submitted, streaming, completion, and failure into stable lifecycle IDs", () => {
    let state = createCaptainAppEventMapperState()
    let result = mapCaptainAppEvents(state, input({ route: "fleet" }))
    state = result.state
    expect(types(result.events)).toContain("captain.idle")

    result = mapCaptainAppEvents(state, input())
    state = result.state
    expect(types(result.events)).toContain("input.listening")

    result = mapCaptainAppEvents(
      state,
      input({ activeSessionId: "session-private-value", displayedStatus: "submitted" }),
    )
    state = result.state
    const submittedTask = result.events.find((event) => event.source === "task" && event.type === "task.started")
    expect(types(result.events)).toContain("assistant.thinking")
    expect(submittedTask).toBeDefined()

    result = mapCaptainAppEvents(
      state,
      input({ activeSessionId: "session-private-value", displayedStatus: "streaming" }),
    )
    state = result.state
    const streamingState = state
    expect(result.events.find((event) => event.source === "chat")?.type).toBe("task.started")
    expect(result.events.find((event) => event.source === "task")?.id).toBe(submittedTask?.id)

    result = mapCaptainChatLifecycle(state, "messageCompleted")
    state = result.state
    expect(result.events.find((event) => event.source === "task")).toMatchObject({
      id: submittedTask?.id,
      type: "task.succeeded",
      captionKey: "captain.success",
    })
    expect(mapCaptainChatLifecycle(state, "messageCompleted").events).toEqual([])
    const stopped = mapCaptainChatLifecycle(streamingState, "generationStopped")
    expect(mapCaptainChatLifecycle(stopped.state, "messageCompleted").events).toEqual([])

    result = mapCaptainAppEvents(
      state,
      input({ activeSessionId: "session-private-value", displayedStatus: "error", error: "PRIVATE ERROR BODY" }),
    )
    expect(types(result.events)).toContain("task.failed")
  })

  it("maps assistant activity to thinking/finalizing semantics, never false tool activity or unsafe payloads", () => {
    const privateValues = [
      "CHAT BODY: launch the missile",
      "rm -rf C:\\private",
      "C:\\Users\\secret\\credential.txt",
      "May I upload your token?",
      "raw tool output with api_key=secret",
      "PRIVATE ERROR BODY",
      "session-private-value",
    ]
    let state = createCaptainAppEventMapperState()
    let result = mapCaptainAppEvents(
      state,
      input({
        activeSessionId: privateValues[6],
        agentStatus: { status: "starting" },
        displayedStatus: "submitted",
        pendingPermissions: [
          {
            id: "permission-1",
            sessionId: privateValues[6],
            action: privateValues[1],
            resources: [privateValues[2]],
            metadata: { question: privateValues[3], credential: "secret" },
          },
        ],
        activity: {
          sessionId: privateValues[6],
          phase: "thinking",
          message: privateValues[4],
          finishReason: privateValues[0],
        },
        error: privateValues[5],
      }),
    )
    state = result.state

    expect(types(result.events)).toEqual(
      expect.arrayContaining(["assistant.thinking", "task.started", "permission.required", "task.failed"]),
    )
    expect(types(result.events)).not.toContain("tool.started")
    expect(result.events.find((event) => event.source === "permission")?.captionParams).toEqual({ count: 1 })
    const serialized = JSON.stringify(result.events)
    for (const privateValue of privateValues) expect(serialized).not.toContain(privateValue)

    result = mapCaptainAppEvents(
      state,
      input({ activeSessionId: privateValues[6], activity: { sessionId: privateValues[6], phase: "finalizing" } }),
    )
    expect(result.events.find((event) => event.source === "chat" && event.type === "task.started")).toMatchObject({
      captionKey: "captain.executing",
    })
    expect(types(result.events)).not.toContain("tool.started")

    result = mapCaptainAppEvents(
      state,
      input({
        activeSessionId: "another-private-session",
        agentStatus: { status: "error", message: privateValues[5] },
      }),
    )
    expect(types(result.events)).toContain("task.failed")
    expect(JSON.stringify(result.events)).not.toContain(privateValues[5])
  })

  it("constructs voice requests only from the closed intent catalog", () => {
    expect(voiceIntentForCaptainEvent("permission.required", "permission-1")).toEqual({
      id: "voice:permission-1",
      category: "confirmation",
      messageKey: "captain.voice.confirmation",
      params: {},
    })
    expect(voiceIntentForCaptainEvent("task.succeeded", "task-1")?.messageKey).toBe("captain.voice.completion")
    expect(voiceIntentForCaptainEvent("task.failed", "task-2")?.messageKey).toBe("captain.voice.risk")
    expect(voiceIntentForCaptainEvent("tool.started", "tool-1")).toBeNull()
  })

  it("latches the first terminal in both orders and resets only for a proven new run", () => {
    let state = mapCaptainAppEvents(
      createCaptainAppEventMapperState(),
      input({ activeSessionId: "active", displayedStatus: "streaming" }),
    ).state

    let terminal = mapCaptainChatLifecycle(state, "messageCompleted")
    expect(types(terminal.events)).toContain("task.succeeded")
    expect(mapCaptainChatLifecycle(terminal.state, "messageCompleted").events).toEqual([])
    expect(mapCaptainChatLifecycle(terminal.state, "generationStopped").events).toEqual([])

    state = mapCaptainAppEvents(
      createCaptainAppEventMapperState(),
      input({ activeSessionId: "active", displayedStatus: "streaming" }),
    ).state
    terminal = mapCaptainChatLifecycle(state, "generationStopped")
    expect(types(terminal.events)).toContain("task.cancelled")
    expect(mapCaptainChatLifecycle(terminal.state, "generationStopped").events).toEqual([])
    expect(mapCaptainChatLifecycle(terminal.state, "messageCompleted").events).toEqual([])

    state = mapCaptainAppEvents(terminal.state, input({ activeSessionId: "active", displayedStatus: "ready" })).state
    state = mapCaptainAppEvents(state, input({ activeSessionId: "active", displayedStatus: "submitted" })).state
    expect(types(mapCaptainChatLifecycle(state, "messageCompleted").events)).toContain("task.succeeded")
  })

  it("requires terminal, quiescent observation, then a later non-running to running transition", () => {
    let state = mapCaptainAppEvents(
      createCaptainAppEventMapperState(),
      input({ activeSessionId: "active", displayedStatus: "streaming" }),
    ).state
    const completed = mapCaptainChatLifecycle(state, "messageCompleted")
    state = completed.state

    const sameRunning = mapCaptainAppEvents(
      state,
      input({
        route: "settings",
        activeSessionId: "active",
        agentStatus: { status: "starting" },
        displayedStatus: "streaming",
        activity: { sessionId: "active", phase: "thinking" },
        pendingPermissions: [{ id: "permission", sessionId: "active", action: "private", resources: [] }],
      }),
    )
    expect(mapCaptainChatLifecycle(sameRunning.state, "generationStopped").events).toEqual([])
    expect(sameRunning.events.filter((event) => event.taskId === "captain-task")).toEqual([])
    expect(sameRunning.state.channels.task?.id).toBe(completed.state.channels.task?.id)

    const quiescent = mapCaptainAppEvents(
      sameRunning.state,
      input({ route: "settings", activeSessionId: "active", displayedStatus: "ready" }),
    )
    expect(mapCaptainChatLifecycle(quiescent.state, "generationStopped").events).toEqual([])

    const nextRun = mapCaptainAppEvents(
      quiescent.state,
      input({ activeSessionId: "active", displayedStatus: "submitted" }),
    )
    expect(nextRun.events.filter((event) => event.source === "task").map((event) => event.type)).toEqual([
      "event.dismissed",
      "task.started",
    ])
    expect(types(mapCaptainChatLifecycle(nextRun.state, "generationStopped").events)).toContain("task.cancelled")
  })

  it("uses the latest quiescent semantic status when the terminal arrives", () => {
    let state = mapCaptainAppEvents(
      createCaptainAppEventMapperState(),
      input({ activeSessionId: "active", displayedStatus: "ready" }),
    ).state
    const completed = mapCaptainChatLifecycle(state, "messageCompleted")

    expect(completed.state.terminalQuiescent).toBe(true)
    const nextRun = mapCaptainAppEvents(
      completed.state,
      input({ activeSessionId: "active", displayedStatus: "submitted" }),
    )

    expect(nextRun.turnStarted).toBe(true)
    expect(nextRun.events.filter((event) => event.source === "task").map((event) => event.type)).toEqual([
      "event.dismissed",
      "task.started",
    ])
  })
})
