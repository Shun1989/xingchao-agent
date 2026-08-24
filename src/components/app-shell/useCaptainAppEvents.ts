import type {
  CaptainCaptionKey,
  CaptainCaptionParams,
  CaptainEventSource,
  CaptainEventType,
} from "@/captain/captain-types.ts"
import type { CaptainSpeechIntent } from "@/captain/captain-voice.ts"
import type { CaptainEventDraft } from "@/components/captain/captain-context.ts"
import type { CaptainAppEventInput } from "./app-shell-types.ts"

import * as React from "react"
import { useCaptain } from "@/components/captain/captain-context.ts"

type CaptainAppChannel = "agent" | "chat" | "error" | "permission" | "route" | "task" | "tool"

interface DesiredCaptainEvent {
  readonly type: CaptainEventType
  readonly source: CaptainEventSource
  readonly taskId: string
  readonly captionKey: CaptainCaptionKey
  readonly captionParams: CaptainCaptionParams
  readonly expiresInMs: number | null
  readonly signature: string
  readonly lifecycleTerminal: boolean
}

interface ActiveCaptainChannel extends DesiredCaptainEvent {
  readonly id: string
}

export interface CaptainAppEventMapperState {
  readonly nextLifecycleId: number
  readonly activeSessionId: string | null
  readonly displayedStatus: CaptainAppEventInput["displayedStatus"] | null
  readonly channels: Readonly<Partial<Record<CaptainAppChannel, ActiveCaptainChannel>>>
}

export interface CaptainAppEventMapResult {
  readonly state: CaptainAppEventMapperState
  readonly events: readonly CaptainEventDraft[]
  readonly sessionChanged: boolean
}

const emptyParams: CaptainCaptionParams = Object.freeze({})

export function createCaptainAppEventMapperState(): CaptainAppEventMapperState {
  return Object.freeze({ nextLifecycleId: 1, activeSessionId: null, displayedStatus: null, channels: Object.freeze({}) })
}

function desired(
  type: CaptainEventType,
  source: CaptainEventSource,
  channel: CaptainAppChannel,
  captionKey: CaptainCaptionKey,
  signature: string,
  options: {
    captionParams?: CaptainCaptionParams
    expiresInMs?: number | null
    lifecycleTerminal?: boolean
  } = {},
): DesiredCaptainEvent {
  return Object.freeze({
    type,
    source,
    taskId: `captain-${channel}`,
    captionKey,
    captionParams: options.captionParams ?? emptyParams,
    expiresInMs: options.expiresInMs ?? null,
    signature,
    lifecycleTerminal: options.lifecycleTerminal === true,
  })
}

function desiredEvents(
  previous: CaptainAppEventMapperState,
  input: CaptainAppEventInput,
): Partial<Record<CaptainAppChannel, DesiredCaptainEvent>> {
  const next: Partial<Record<CaptainAppChannel, DesiredCaptainEvent>> = {
    route: desired("captain.idle", "route", "route", "captain.idle", `route:${input.route}`),
  }

  if (input.agentStatus.status === "starting" || input.agentStatus.status === "model_required") {
    next.agent = desired("assistant.thinking", "task", "agent", "captain.thinking", input.agentStatus.status)
  } else if (input.agentStatus.status === "ready") {
    next.agent = desired("captain.idle", "task", "agent", "captain.idle", "ready")
  } else {
    next.agent = desired("task.failed", "task", "agent", "captain.failure", "error", {
      expiresInMs: 8_000,
      lifecycleTerminal: true,
    })
  }

  if (input.route === "chat") {
    if (input.activeSessionId === null) {
      next.chat = desired("input.listening", "chat", "chat", "captain.listening", "new-chat")
    } else if (input.displayedStatus === "error") {
      next.chat = desired("task.failed", "chat", "chat", "captain.failure", "error", {
        expiresInMs: 8_000,
        lifecycleTerminal: true,
      })
    } else if (input.displayedStatus === "submitted") {
      next.chat = desired("assistant.thinking", "chat", "chat", "captain.thinking", "submitted")
    } else if (input.displayedStatus === "streaming") {
      next.chat = desired("task.started", "chat", "chat", "captain.executing", "streaming")
    }
  }

  const wasRunning = previous.displayedStatus === "submitted" || previous.displayedStatus === "streaming"
  const isRunning = input.displayedStatus === "submitted" || input.displayedStatus === "streaming"
  const sameSession = previous.activeSessionId === input.activeSessionId
  if (input.displayedStatus === "error") {
    next.task = desired("task.failed", "task", "task", "captain.failure", "failed", {
      expiresInMs: 8_000,
      lifecycleTerminal: true,
    })
  } else if (input.activeSessionId !== null && isRunning) {
    next.task = desired(
      "task.started",
      "task",
      "task",
      "captain.executing",
      `running:${input.displayedStatus}`,
    )
  } else if (input.activeSessionId !== null && input.displayedStatus === "ready" && wasRunning && sameSession) {
    next.task = desired("task.succeeded", "task", "task", "captain.success", "succeeded", {
      expiresInMs: 6_000,
      lifecycleTerminal: true,
    })
  }

  const permissionCount = input.pendingPermissions.length
  if (permissionCount > 0) {
    const captionParams = Object.freeze({ count: permissionCount })
    next.permission = desired(
      "permission.required",
      "permission",
      "permission",
      "captain.warning",
      `count:${permissionCount}`,
      { captionParams },
    )
  }

  if (input.activity !== null) {
    next.tool = desired("tool.started", "tool", "tool", "captain.executing", "active")
  }
  if (input.error !== null) {
    next.error = desired("task.failed", "chat", "error", "captain.failure", "present", {
      expiresInMs: 8_000,
      lifecycleTerminal: true,
    })
  }
  return next
}

function eventFrom(active: ActiveCaptainChannel | DesiredCaptainEvent, id: string): CaptainEventDraft {
  return Object.freeze({
    id,
    type: active.type,
    source: active.source,
    taskId: active.taskId,
    captionKey: active.captionKey,
    captionParams: active.captionParams,
    expiresInMs: active.expiresInMs,
  })
}

function dismissal(active: ActiveCaptainChannel): CaptainEventDraft {
  return Object.freeze({
    id: active.id,
    type: "event.dismissed",
    source: active.source,
    taskId: active.taskId,
    captionKey: "captain.idle",
    captionParams: emptyParams,
    expiresInMs: null,
  })
}

/** Pure state diff used by the hook; it never reads or copies free-form fields. */
export function mapCaptainAppEvents(
  previous: CaptainAppEventMapperState,
  input: CaptainAppEventInput,
): CaptainAppEventMapResult {
  const sessionChanged = previous.activeSessionId !== input.activeSessionId
  const desiredByChannel = desiredEvents(previous, input)
  const channels: Partial<Record<CaptainAppChannel, ActiveCaptainChannel>> = { ...previous.channels }
  const events: CaptainEventDraft[] = []
  let nextLifecycleId = previous.nextLifecycleId

  if (sessionChanged) {
    for (const channel of ["chat", "error", "permission", "task", "tool"] as const) {
      const active = channels[channel]
      if (active) events.push(dismissal(active))
      delete channels[channel]
    }
  }

  for (const channel of ["route", "agent", "chat", "task", "permission", "tool", "error"] as const) {
    const wanted = desiredByChannel[channel]
    const active = channels[channel]
    if (!wanted) {
      if (active) {
        events.push(dismissal(active))
        delete channels[channel]
      }
      continue
    }

    if (active?.signature === wanted.signature) continue
    const mustStartLifecycle = !active || active.lifecycleTerminal
    if (mustStartLifecycle) {
      if (active && !active.lifecycleTerminal) events.push(dismissal(active))
      if (nextLifecycleId >= Number.MAX_SAFE_INTEGER) continue
      const id = `captain-app-${channel}-${nextLifecycleId}`
      nextLifecycleId += 1
      channels[channel] = Object.freeze({ ...wanted, id })
      events.push(eventFrom(wanted, id))
      continue
    }

    channels[channel] = Object.freeze({ ...wanted, id: active.id })
    events.push(eventFrom(wanted, active.id))
  }

  return Object.freeze({
    state: Object.freeze({
      nextLifecycleId,
      activeSessionId: input.activeSessionId,
      displayedStatus: input.displayedStatus,
      channels: Object.freeze(channels),
    }),
    events: Object.freeze(events),
    sessionChanged,
  })
}

export function voiceIntentForCaptainEvent(type: CaptainEventType, eventId: string): CaptainSpeechIntent | null {
  if (type === "permission.required") {
    return Object.freeze({
      id: `voice:${eventId}`,
      category: "confirmation",
      messageKey: "captain.voice.confirmation",
      params: emptyParams,
    })
  }
  if (type === "task.succeeded") {
    return Object.freeze({
      id: `voice:${eventId}`,
      category: "completion",
      messageKey: "captain.voice.completion",
      params: emptyParams,
    })
  }
  if (type === "task.failed" || type === "task.warning") {
    return Object.freeze({
      id: `voice:${eventId}`,
      category: "risk",
      messageKey: "captain.voice.risk",
      params: emptyParams,
    })
  }
  return null
}

export function useCaptainAppEvents(input: CaptainAppEventInput): void {
  const captain = useCaptain()
  const mapper = React.useRef(createCaptainAppEventMapperState())
  const hasActivity = input.activity !== null
  const hasError = input.error !== null

  React.useEffect(() => {
    const result = mapCaptainAppEvents(mapper.current, input)
    mapper.current = result.state
    captain.publish(result.events)
    if (result.sessionChanged) captain.cancelTaskSpeech()
    for (const event of result.events) {
      if (event.source !== "task" && event.source !== "permission") continue
      const intent = voiceIntentForCaptainEvent(event.type, event.id)
      if (intent) captain.speech.request(intent)
    }
  }, [
    captain,
    hasActivity,
    hasError,
    input.activeSessionId,
    input.agentStatus.status,
    input.displayedStatus,
    input.pendingPermissions.length,
    input.route,
  ])
}
