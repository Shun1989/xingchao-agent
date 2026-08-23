import type {
  CaptainCaptionKey,
  CaptainCaptionParams,
  CaptainCaptionPrimitive,
  CaptainEvent,
  CaptainEventSource,
  CaptainEventType,
  CaptainExpression,
  CaptainReducerState,
  CaptainSnapshot,
  CaptainState,
} from "./captain-types.ts"

const CAPTAIN_EVENT_TYPES = new Set<CaptainEventType>([
  "captain.idle",
  "input.listening",
  "assistant.thinking",
  "task.started",
  "tool.started",
  "speech.started",
  "permission.required",
  "task.warning",
  "task.succeeded",
  "task.failed",
  "task.cancelled",
  "speech.finished",
  "speech.failed",
  "event.dismissed",
])

const CAPTAIN_EVENT_SOURCES = new Set<CaptainEventSource>([
  "route",
  "chat",
  "task",
  "tool",
  "permission",
  "speech",
  "legacy",
])

const TERMINAL_EVENT_TYPES = new Set<CaptainEventType>([
  "task.cancelled",
  "speech.finished",
  "speech.failed",
  "event.dismissed",
])

const stateByEventType: Readonly<Partial<Record<CaptainEventType, CaptainState>>> = Object.freeze({
  "captain.idle": "idle",
  "input.listening": "listening",
  "assistant.thinking": "thinking",
  "task.started": "executing",
  "tool.started": "executing",
  "speech.started": "reporting",
  "permission.required": "warning",
  "task.warning": "warning",
  "task.succeeded": "success",
  "task.failed": "failure",
})

const priorityByState: Readonly<Record<CaptainState, number>> = Object.freeze({
  idle: 0,
  success: 1,
  listening: 2,
  thinking: 3,
  executing: 4,
  reporting: 5,
  warning: 6,
  failure: 7,
})

export const captainExpressionByState: Readonly<Record<CaptainState, CaptainExpression>> = Object.freeze({
  idle: "neutral",
  listening: "attentive",
  thinking: "focused",
  executing: "focused",
  reporting: "warm",
  warning: "concerned",
  success: "bright",
  failure: "concerned",
})

const emptyCaptionParams: CaptainCaptionParams = Object.freeze({})

function hasUnsafeControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code === 0 || code === 10 || code === 13) return true
  }
  return false
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160 && !hasUnsafeControlCharacter(value)
}

function isCaptionKey(value: unknown): value is CaptainCaptionKey {
  return typeof value === "string" && value.length <= 160 && /^captain(?:\.[A-Za-z0-9_-]+)+$/u.test(value)
}

function isCaptionPrimitive(value: unknown): value is CaptainCaptionPrimitive {
  if (value === null || typeof value === "boolean") return true
  if (typeof value === "number") return Number.isFinite(value)
  return typeof value === "string" && value.length <= 256 && !hasUnsafeControlCharacter(value)
}

function sanitizeCaptionParams(value: unknown): CaptainCaptionParams {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return emptyCaptionParams
  const sanitized: Record<string, CaptainCaptionPrimitive> = {}
  for (const [key, parameter] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(key) || !isCaptionPrimitive(parameter)) continue
    sanitized[key] = parameter
  }
  return Object.freeze(sanitized)
}

function sanitizeEvent(value: CaptainEvent): CaptainEvent | null {
  if (
    !isSafeIdentifier(value.id) ||
    !CAPTAIN_EVENT_TYPES.has(value.type) ||
    !CAPTAIN_EVENT_SOURCES.has(value.source) ||
    (value.taskId !== null && !isSafeIdentifier(value.taskId)) ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 0 ||
    !Number.isFinite(value.startedAt) ||
    (value.expiresAt !== null && (!Number.isFinite(value.expiresAt) || value.expiresAt <= value.startedAt)) ||
    !isCaptionKey(value.captionKey)
  ) {
    return null
  }

  return Object.freeze({
    id: value.id,
    type: value.type,
    source: value.source,
    taskId: value.taskId,
    sequence: value.sequence,
    startedAt: value.startedAt,
    expiresAt: value.expiresAt,
    captionKey: value.captionKey,
    captionParams: sanitizeCaptionParams(value.captionParams),
  })
}

function streamId(event: CaptainEvent): string {
  return `${event.source}\0${event.taskId ?? ""}`
}

function sameStream(left: CaptainEvent, right: CaptainEvent): boolean {
  return left.source === right.source && left.taskId === right.taskId
}

function presentingState(event: CaptainEvent): CaptainState | null {
  return stateByEventType[event.type] ?? null
}

function winnerIsPreferred(candidate: CaptainEvent, winner: CaptainEvent): boolean {
  const candidateState = presentingState(candidate)
  const winnerState = presentingState(winner)
  if (candidateState === null) return false
  if (winnerState === null) return true

  const priorityDifference = priorityByState[candidateState] - priorityByState[winnerState]
  if (priorityDifference !== 0) return priorityDifference > 0
  if (candidate.sequence !== winner.sequence) return candidate.sequence > winner.sequence
  if (candidate.startedAt !== winner.startedAt) return candidate.startedAt > winner.startedAt
  return candidate.id.localeCompare(winner.id) < 0
}

function presentationWinner(activeEvents: Readonly<Record<string, CaptainEvent>>): CaptainEvent | null {
  let winner: CaptainEvent | null = null
  for (const activeEvent of Object.values(activeEvents)) {
    if (presentingState(activeEvent) === null) continue
    if (winner === null || winnerIsPreferred(activeEvent, winner)) winner = activeEvent
  }
  return winner
}

function reportingMouthLevel(event: CaptainEvent, state: CaptainState): number {
  if (state !== "reporting") return 0
  const level = event.captionParams.mouthLevel
  return typeof level === "number" && Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0
}

function snapshotFor(activeEvents: Readonly<Record<string, CaptainEvent>>): CaptainSnapshot {
  const winner = presentationWinner(activeEvents)
  if (winner === null) {
    return Object.freeze({
      state: "idle",
      expression: captainExpressionByState.idle,
      captionKey: "captain.state.idle",
      captionParams: emptyCaptionParams,
      mouthLevel: 0,
      activeEventId: null,
      taskId: null,
    })
  }

  const state = presentingState(winner) ?? "idle"
  return Object.freeze({
    state,
    expression: captainExpressionByState[state],
    captionKey: winner.captionKey,
    captionParams: winner.captionParams,
    mouthLevel: reportingMouthLevel(winner, state),
    activeEventId: winner.id,
    taskId: winner.taskId,
  })
}

function freezeState(
  activeEvents: Record<string, CaptainEvent>,
  latestSequenceByStream: Record<string, number>,
  now: number,
): CaptainReducerState {
  const frozenEvents = Object.freeze(activeEvents)
  return Object.freeze({
    activeEvents: frozenEvents,
    latestSequenceByStream: Object.freeze(latestSequenceByStream),
    snapshot: snapshotFor(frozenEvents),
    now,
  })
}

function unexpiredEvents(
  activeEvents: Readonly<Record<string, CaptainEvent>>,
  now: number,
): Record<string, CaptainEvent> {
  return Object.fromEntries(
    Object.entries(activeEvents).filter(([, event]) => event.expiresAt === null || event.expiresAt > now),
  )
}

export function createCaptainState(now = 0): CaptainReducerState {
  const safeNow = Number.isFinite(now) ? now : 0
  return freezeState({}, {}, safeNow)
}

export function captainReducer(state: CaptainReducerState, input: CaptainEvent): CaptainReducerState {
  const event = sanitizeEvent(input)
  if (event === null) return state

  const existing = state.activeEvents[event.id]
  if (existing !== undefined && !sameStream(existing, event)) return state

  const stream = streamId(event)
  const latestSequence = state.latestSequenceByStream[stream]
  if (latestSequence !== undefined && event.sequence <= latestSequence) return state

  const now = Math.max(state.now, event.startedAt)
  const activeEvents = unexpiredEvents(state.activeEvents, now)
  const latestSequenceByStream = { ...state.latestSequenceByStream, [stream]: event.sequence }

  if (TERMINAL_EVENT_TYPES.has(event.type)) {
    const target = activeEvents[event.id]
    if (target !== undefined && sameStream(target, event)) delete activeEvents[event.id]
  } else if (event.expiresAt === null || event.expiresAt > now) {
    activeEvents[event.id] = event
  }

  return freezeState(activeEvents, latestSequenceByStream, now)
}

export function tickCaptainState(state: CaptainReducerState, now: number): CaptainReducerState {
  if (!Number.isFinite(now) || now <= state.now) return state
  return freezeState(unexpiredEvents(state.activeEvents, now), { ...state.latestSequenceByStream }, now)
}
