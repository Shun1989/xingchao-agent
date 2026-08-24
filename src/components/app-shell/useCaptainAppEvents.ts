import type { ChatService } from "../../../electron/chat/common.ts"
import type { CaptainAppEventInput } from "./app-shell-types.ts"
import type {
  CaptainCaptionKey,
  CaptainCaptionParams,
  CaptainEventSource,
  CaptainEventType,
} from "@/captain/captain-types.ts"
import type { CaptainSpeechIntent } from "@/captain/captain-voice.ts"
import type { CaptainEventDraft, CaptainProducerLease } from "@/components/captain/captain-context.ts"
import type { ConnectionClientService } from "@oomol/connection"

import * as React from "react"
import { useCaptain } from "@/components/captain/captain-context.ts"

type CaptainAppChannel = "activity" | "agent" | "chat" | "error" | "permission" | "route" | "task" | "tool"
type CaptainChatLifecycleKind = "generationStopped" | "messageCompleted" | "toolCallResult" | "toolCallStarted"

export type CaptainLifecycleEvent =
  | {
      readonly kind: "tool.started"
      readonly sessionId: string
      readonly callId: string
      readonly partId: string
    }
  | {
      readonly kind: "tool.result"
      readonly sessionId: string
      readonly callId: string
      readonly partId: string
    }
  | { readonly kind: "turn.completed"; readonly sessionId: string }
  | { readonly kind: "turn.stopped"; readonly sessionId: string }

export interface CaptainLifecycleSource {
  subscribe(listener: (event: CaptainLifecycleEvent) => void): () => void
}

export function createCaptainLifecycleSource(
  serverEvents: ConnectionClientService<ChatService>["serverEvents"],
): CaptainLifecycleSource {
  return Object.freeze({
    subscribe(listener: (event: CaptainLifecycleEvent) => void): () => void {
      const unsubscribes = [
        serverEvents.on("toolCallStarted", (event) =>
          listener({ kind: "tool.started", sessionId: event.sessionId, callId: event.callId, partId: event.partId }),
        ),
        serverEvents.on("toolCallResult", (event) =>
          listener({ kind: "tool.result", sessionId: event.sessionId, callId: event.callId, partId: event.partId }),
        ),
        serverEvents.on("messageCompleted", (event) =>
          listener({ kind: "turn.completed", sessionId: event.sessionId }),
        ),
        serverEvents.on("generationStopped", (event) => listener({ kind: "turn.stopped", sessionId: event.sessionId })),
      ]
      return () => {
        for (const unsubscribe of unsubscribes) unsubscribe()
      }
    },
  })
}

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
  readonly producerId: string
  readonly nextLifecycleId: number
  readonly activeToolCount: number
  readonly terminalKind: "completed" | "stopped" | null
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
// Tool state is owned exclusively by the exact lifecycle adapter. App-input diffs must not
// infer its absence and dismiss a real tool event that arrived earlier in the same commit.
const orderedChannels = ["route", "agent", "chat", "activity", "task", "permission", "error"] as const

export function createCaptainAppEventMapperState(producerId = "standalone"): CaptainAppEventMapperState {
  return Object.freeze({
    producerId,
    nextLifecycleId: 1,
    activeToolCount: 0,
    terminalKind: null,
    activeSessionId: null,
    displayedStatus: null,
    channels: Object.freeze({}),
  })
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

function desiredEvents(input: CaptainAppEventInput): Partial<Record<CaptainAppChannel, DesiredCaptainEvent>> {
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

  const isRunning = input.displayedStatus === "submitted" || input.displayedStatus === "streaming"
  if (input.displayedStatus === "error") {
    next.task = desired("task.failed", "task", "task", "captain.failure", "failed", {
      expiresInMs: 8_000,
      lifecycleTerminal: true,
    })
  } else if (input.activeSessionId !== null && isRunning) {
    next.task = desired("task.started", "task", "task", "captain.executing", `running:${input.displayedStatus}`)
  }

  const permissionCount = input.pendingPermissions.length
  if (permissionCount > 0) {
    next.permission = desired(
      "permission.required",
      "permission",
      "permission",
      "captain.warning",
      `count:${permissionCount}`,
      { captionParams: Object.freeze({ count: permissionCount }) },
    )
  }

  if (input.activity !== null) {
    const finalizing = input.activity.phase === "finalizing"
    next.activity = desired(
      finalizing ? "task.started" : "assistant.thinking",
      "chat",
      "activity",
      finalizing ? "captain.executing" : "captain.thinking",
      finalizing ? "finalizing" : "thinking",
    )
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

function nextId(state: CaptainAppEventMapperState, channel: CaptainAppChannel): string | null {
  if (state.nextLifecycleId >= Number.MAX_SAFE_INTEGER) return null
  return `captain-app-${state.producerId}-${channel}-${state.nextLifecycleId}`
}

/** Pure state diff used by the hook; it never reads or copies free-form fields. */
export function mapCaptainAppEvents(
  previous: CaptainAppEventMapperState,
  input: CaptainAppEventInput,
): CaptainAppEventMapResult {
  const sessionChanged = previous.activeSessionId !== input.activeSessionId
  const desiredByChannel = desiredEvents(input)
  const channels: Partial<Record<CaptainAppChannel, ActiveCaptainChannel>> = { ...previous.channels }
  const events: CaptainEventDraft[] = []
  let nextLifecycleId = previous.nextLifecycleId

  if (sessionChanged) {
    for (const channel of ["chat", "activity", "error", "permission", "task", "tool"] as const) {
      const active = channels[channel]
      if (active) events.push(dismissal(active))
      delete channels[channel]
    }
  }

  for (const channel of orderedChannels) {
    const wanted = desiredByChannel[channel]
    const active = channels[channel]
    if (!wanted) {
      if (active && !active.lifecycleTerminal) {
        events.push(dismissal(active))
        delete channels[channel]
      }
      continue
    }
    if (active?.signature === wanted.signature) continue
    const mustStartLifecycle = !active || active.lifecycleTerminal
    if (mustStartLifecycle) {
      if (active) events.push(dismissal(active))
      const id = nextId({ ...previous, nextLifecycleId }, channel)
      if (!id) continue
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
      producerId: previous.producerId,
      nextLifecycleId,
      activeToolCount: sessionChanged ? 0 : previous.activeToolCount,
      terminalKind:
        sessionChanged || channels.task?.signature.startsWith("running:") === true ? null : previous.terminalKind,
      activeSessionId: input.activeSessionId,
      displayedStatus: input.displayedStatus,
      channels: Object.freeze(channels),
    }),
    events: Object.freeze(events),
    sessionChanged,
  })
}

/** Maps only a closed lifecycle kind after the caller proves active-session equality. */
export function mapCaptainChatLifecycle(
  previous: CaptainAppEventMapperState,
  kind: CaptainChatLifecycleKind,
): CaptainAppEventMapResult {
  if (previous.terminalKind !== null) {
    return Object.freeze({ state: previous, events: Object.freeze([]), sessionChanged: false })
  }
  const channels: Partial<Record<CaptainAppChannel, ActiveCaptainChannel>> = { ...previous.channels }
  const events: CaptainEventDraft[] = []
  let nextLifecycleId = previous.nextLifecycleId
  let activeToolCount = previous.activeToolCount

  if (kind === "toolCallStarted") {
    activeToolCount += 1
    if (!channels.tool) {
      const wanted = desired("tool.started", "tool", "tool", "captain.executing", "active")
      const id = nextId(previous, "tool")
      if (id) {
        nextLifecycleId += 1
        channels.tool = Object.freeze({ ...wanted, id })
        events.push(eventFrom(wanted, id))
      }
    }
  } else if (kind === "toolCallResult") {
    activeToolCount = Math.max(0, activeToolCount - 1)
    if (activeToolCount === 0 && channels.tool) {
      events.push(dismissal(channels.tool))
      delete channels.tool
    }
  } else {
    activeToolCount = 0
    for (const channel of ["chat", "activity", "tool"] as const) {
      const active = channels[channel]
      if (active) events.push(dismissal(active))
      delete channels[channel]
    }
    const wanted =
      kind === "messageCompleted"
        ? desired("task.succeeded", "task", "task", "captain.success", "completed", {
            expiresInMs: 6_000,
            lifecycleTerminal: true,
          })
        : desired("task.cancelled", "task", "task", "captain.idle", "stopped", { lifecycleTerminal: true })
    const current = channels.task
    const id = current?.id ?? nextId(previous, "task")
    if (id) {
      if (!current) nextLifecycleId += 1
      channels.task = Object.freeze({ ...wanted, id })
      events.push(eventFrom(wanted, id))
    }
  }

  return Object.freeze({
    state: Object.freeze({
      producerId: previous.producerId,
      nextLifecycleId,
      activeToolCount,
      terminalKind:
        kind === "messageCompleted" ? "completed" : kind === "generationStopped" ? "stopped" : previous.terminalKind,
      activeSessionId: previous.activeSessionId,
      displayedStatus: previous.displayedStatus,
      channels: Object.freeze(channels),
    }),
    events: Object.freeze(events),
    sessionChanged: false,
  })
}

function terminalEventsForUnmount(state: CaptainAppEventMapperState): readonly CaptainEventDraft[] {
  return Object.freeze(
    Object.values(state.channels).flatMap((active) => {
      if (!active) return []
      if (active.source !== "task") return [dismissal(active)]
      return [
        Object.freeze({
          id: active.id,
          type: "task.cancelled" as const,
          source: active.source,
          taskId: active.taskId,
          captionKey: "captain.idle" as const,
          captionParams: emptyParams,
          expiresInMs: null,
        }),
      ]
    }),
  )
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

export function useCaptainAppEvents(input: CaptainAppEventInput, lifecycleSource: CaptainLifecycleSource): void {
  const captain = useCaptain()
  const lease = React.useRef<CaptainProducerLease | null>(null)
  const mapper = React.useRef<CaptainAppEventMapperState | null>(null)
  const speechRequest = React.useRef(captain.speech.request)
  const lifecycleGeneration = React.useRef<{
    active: boolean
    pending: CaptainLifecycleEvent[]
    process: ((event: CaptainLifecycleEvent) => void) | null
    sessionId: string | null
  } | null>(null)
  speechRequest.current = captain.speech.request
  const hasActivity = input.activity !== null
  const hasError = input.error !== null

  const publishResult = React.useCallback((result: CaptainAppEventMapResult, stopSpeech = false) => {
    mapper.current = result.state
    const currentLease = lease.current
    if (!currentLease) return
    currentLease.publish(result.events)
    if (result.sessionChanged || stopSpeech) currentLease.cancelTaskSpeech()
    for (const event of result.events) {
      if (event.source !== "task" && event.source !== "permission") continue
      const intent = voiceIntentForCaptainEvent(event.type, event.id)
      if (intent) speechRequest.current(intent)
    }
  }, [])

  React.useInsertionEffect(() => {
    const generation = {
      active: true,
      pending: [] as CaptainLifecycleEvent[],
      process: null as ((event: CaptainLifecycleEvent) => void) | null,
      sessionId: input.activeSessionId,
    }
    lifecycleGeneration.current = generation
    const unsubscribe = lifecycleSource.subscribe((event) => {
      if (!generation.active || event.sessionId !== generation.sessionId) return
      if (generation.process) generation.process(event)
      else generation.pending.push(event)
    })
    return () => {
      generation.active = false
      unsubscribe()
      generation.pending.length = 0
      generation.process = null
      if (lifecycleGeneration.current === generation) lifecycleGeneration.current = null
    }
  }, [input.activeSessionId, lifecycleSource])

  React.useLayoutEffect(() => {
    const generation = lifecycleGeneration.current
    if (!generation || !generation.active || generation.sessionId !== input.activeSessionId) return
    const producerLease = captain.acquireProducer()
    if (!producerLease) return
    lease.current = producerLease
    mapper.current = createCaptainAppEventMapperState(producerLease.id)
    publishResult(mapCaptainAppEvents(mapper.current, input))
    const sessionId = input.activeSessionId
    const activeTools = new Set<string>()
    const retiredTools = new Set<string>()
    const process = (event: CaptainLifecycleEvent) => {
      if (!generation.active || event.sessionId !== sessionId || mapper.current === null) return
      if (event.kind === "turn.completed" || event.kind === "turn.stopped") {
        activeTools.clear()
        retiredTools.clear()
        const kind = event.kind === "turn.completed" ? "messageCompleted" : "generationStopped"
        const result = mapCaptainChatLifecycle(mapper.current, kind)
        publishResult(
          result,
          result.events.some((captainEvent) => captainEvent.type === "task.cancelled"),
        )
        return
      }
      const opaqueKey = `${event.callId.length}:${event.callId}${event.partId}`
      if (event.kind === "tool.started") {
        if (retiredTools.has(opaqueKey) || activeTools.has(opaqueKey)) return
        const wasEmpty = activeTools.size === 0
        activeTools.add(opaqueKey)
        if (wasEmpty) publishResult(mapCaptainChatLifecycle(mapper.current, "toolCallStarted"))
        return
      }
      if (retiredTools.has(opaqueKey)) return
      retiredTools.add(opaqueKey)
      if (!activeTools.delete(opaqueKey)) return
      if (activeTools.size === 0) publishResult(mapCaptainChatLifecycle(mapper.current, "toolCallResult"))
    }
    generation.process = process
    for (const event of generation.pending.splice(0)) process(event)
    return () => {
      generation.process = null
      activeTools.clear()
      retiredTools.clear()
      const current = mapper.current
      lease.current = null
      mapper.current = null
      producerLease.release(current ? terminalEventsForUnmount(current) : [])
    }
  }, [captain.acquireProducer, input.activeSessionId, lifecycleSource, publishResult])

  React.useEffect(() => {
    if (mapper.current) publishResult(mapCaptainAppEvents(mapper.current, input))
  }, [
    hasActivity,
    hasError,
    input.activeSessionId,
    input.agentStatus.status,
    input.displayedStatus,
    input.pendingPermissions.length,
    input.route,
    publishResult,
  ])
}

/** AppShell's real zero-DOM integration boundary; remounting it releases the producer lease. */
export function CaptainAppEventBridge({
  input,
  lifecycleSource,
}: {
  readonly input: CaptainAppEventInput
  readonly lifecycleSource: CaptainLifecycleSource
}) {
  useCaptainAppEvents(input, lifecycleSource)
  return null
}
