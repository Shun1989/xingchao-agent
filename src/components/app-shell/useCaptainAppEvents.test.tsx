// @vitest-environment happy-dom

import type { CaptainAppEventInput } from "./app-shell-types.ts"
import type { CaptainEventType } from "@/captain/captain-types.ts"
import type { AppContextValue } from "@/components/AppContext.ts"
import type { FleetSkinContextValue } from "@/components/fleet-skin-context.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createCaptainAppEventMapperState,
  CaptainAppEventBridge,
  mapCaptainChatLifecycle,
  mapCaptainAppEvents,
  voiceIntentForCaptainEvent,
} from "./useCaptainAppEvents.ts"
import { AppContext } from "@/components/AppContext.ts"
import { useCaptain } from "@/components/captain/captain-context.ts"
import { CaptainOrchestrator } from "@/components/captain/CaptainOrchestrator.tsx"
import { FleetSkinContext } from "@/components/fleet-skin-context.ts"
import { I18nProvider } from "@/i18n/I18nProvider.tsx"
import { resolveFleetSkin } from "@/skins/fleet-skins.ts"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Array<ReturnType<typeof createRoot>> = []

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
    expect(result.events.find((event) => event.source === "chat")?.type).toBe("task.started")
    expect(result.events.find((event) => event.source === "task")?.id).toBe(submittedTask?.id)

    result = mapCaptainChatLifecycle(state, "messageCompleted")
    state = result.state
    expect(result.events.find((event) => event.source === "task")).toMatchObject({
      id: submittedTask?.id,
      type: "task.succeeded",
      captionKey: "captain.success",
    })

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
})

interface FakeChatEvents {
  emit(event: "generationStopped" | "messageCompleted" | "toolCallResult" | "toolCallStarted", sessionId: string): void
  oldListener(event: "toolCallStarted"): ((value: { sessionId: string }) => void) | undefined
  service: AppContextValue["chatService"]
  unsubscribeCount(): number
}

function fakeChatEvents(): FakeChatEvents {
  const listeners = new Map<string, Set<(value: { sessionId: string }) => void>>()
  const all = new Map<string, Array<(value: { sessionId: string }) => void>>()
  let unsubscribes = 0
  const serverEvents = {
    on(event: string, listener: (value: { sessionId: string }) => void) {
      const bucket = listeners.get(event) ?? new Set()
      bucket.add(listener)
      listeners.set(event, bucket)
      all.set(event, [...(all.get(event) ?? []), listener])
      return () => {
        bucket.delete(listener)
        unsubscribes += 1
      }
    },
  }
  return {
    emit(event, sessionId) {
      act(() => {
        for (const listener of listeners.get(event) ?? []) listener({ sessionId })
      })
    },
    oldListener(event) {
      return all.get(event)?.[0]
    },
    service: { serverEvents } as unknown as AppContextValue["chatService"],
    unsubscribeCount: () => unsubscribes,
  }
}

const fleetSkin: FleetSkinContextValue = {
  activeCrewId: "watchtide",
  skin: resolveFleetSkin("watchtide"),
  requestCrew: () => undefined,
  phase: "idle",
  pendingCrewId: null,
  error: null,
  retry: () => undefined,
  preloadCrew: () => undefined,
}

function CaptainProbe() {
  const captain = useCaptain()
  return (
    <output
      data-epoch={captain.epoch}
      data-event-id={captain.snapshot.activeEventId ?? ""}
      data-state={captain.snapshot.state}
    >
      {captain.snapshot.captionKey}
    </output>
  )
}

function renderIntegration(events: FakeChatEvents, value: CaptainAppEventInput) {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  const appContext = { chatService: events.service } as AppContextValue
  let producerKey = 1
  const draw = () => (
    <I18nProvider>
      <FleetSkinContext.Provider value={fleetSkin}>
        <CaptainOrchestrator>
          <AppContext.Provider value={appContext}>
            <CaptainAppEventBridge key={producerKey} input={value} />
            <CaptainProbe />
          </AppContext.Provider>
        </CaptainOrchestrator>
      </FleetSkinContext.Provider>
    </I18nProvider>
  )
  act(() => root.render(draw()))
  return {
    container,
    remountProducer() {
      producerKey += 1
      act(() => root.render(draw()))
    },
    rerender() {
      act(() => root.render(draw()))
    },
  }
}

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount()
  })
  document.body.replaceChildren()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe("useCaptainAppEvents producer lease integration", () => {
  it("unsubscribes, resets at quiescence, uses unique IDs, and rejects an old callback after remount", () => {
    const events = fakeChatEvents()
    const view = renderIntegration(events, input({ activeSessionId: "active", displayedStatus: "streaming" }))
    events.emit("toolCallStarted", "active")
    const before = view.container.querySelector("output")
    const oldEpoch = Number(before?.dataset.epoch)
    const oldId = before?.dataset.eventId ?? ""
    const stale = events.oldListener("toolCallStarted")

    view.remountProducer()
    const after = view.container.querySelector("output")
    expect(events.unsubscribeCount()).toBe(4)
    expect(Number(after?.dataset.epoch)).toBeGreaterThan(oldEpoch)
    expect(after?.dataset.eventId).not.toContain("tool")

    act(() => stale?.({ sessionId: "active" }))
    expect(after?.dataset.eventId).not.toContain("tool")
    events.emit("toolCallStarted", "active")
    expect(after?.dataset.eventId).toContain("tool")
    expect(after?.dataset.eventId).not.toBe(oldId)
  })

  it("uses real tool lifecycle events and ignores payloads for inactive sessions", () => {
    const events = fakeChatEvents()
    const view = renderIntegration(events, input({ activeSessionId: "active", displayedStatus: "streaming" }))
    const probe = view.container.querySelector("output")

    events.emit("toolCallStarted", "inactive-private-session")
    expect(probe?.dataset.eventId).not.toContain("tool")
    events.emit("toolCallStarted", "active")
    expect(probe?.dataset.state).toBe("executing")
    expect(probe?.dataset.eventId).toContain("tool")
    events.emit("toolCallResult", "active")
    expect(probe?.dataset.eventId).not.toContain("tool")
  })

  it("announces actual completion once, retains success across identical rerenders, and cancels stops", () => {
    const cancel = vi.fn()
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { cancel, speak: vi.fn() },
    })
    const completedEvents = fakeChatEvents()
    const completed = renderIntegration(
      completedEvents,
      input({ activeSessionId: "active", displayedStatus: "streaming" }),
    )
    const completedProbe = completed.container.querySelector("output")
    completedEvents.emit("messageCompleted", "active")
    const successId = completedProbe?.dataset.eventId
    expect(completedProbe?.dataset.state).toBe("success")
    expect(completedProbe?.textContent).toBe("captain.success")
    completed.rerender()
    expect(completedProbe?.dataset.state).toBe("success")
    expect(completedProbe?.dataset.eventId).toBe(successId)

    const stoppedEvents = fakeChatEvents()
    const stopped = renderIntegration(
      stoppedEvents,
      input({ activeSessionId: "stopped", displayedStatus: "streaming" }),
    )
    const stoppedProbe = stopped.container.querySelector("output")
    const cancelCount = cancel.mock.calls.length
    stoppedEvents.emit("generationStopped", "stopped")
    expect(stoppedProbe?.dataset.state).not.toBe("success")
    expect(stoppedProbe?.textContent).not.toBe("captain.success")
    expect(cancel.mock.calls.length).toBeGreaterThan(cancelCount)
  })
})
