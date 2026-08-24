import type {
  CaptainCaptionKey,
  CaptainCaptionParams,
  CaptainCaptionPrimitive,
  CaptainEvent,
  CaptainEventSource,
  CaptainEventType,
  CaptainExpression,
  CaptainReducerState,
  CaptainRetiredEventIndex,
  CaptainSnapshot,
  CaptainState,
  CaptainStreamSequenceIndex,
} from "./captain-types.ts"

import { CAPTAIN_CAPTION_KEYS } from "./captain-types.ts"

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

const CAPTAIN_CAPTION_KEY_SET = new Set<CaptainCaptionKey>(CAPTAIN_CAPTION_KEYS)

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

function emptyRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>
}

function compareExactStrings(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

interface PersistentStringNode {
  readonly key: string
  readonly value: number
  readonly height: number
  readonly left: PersistentStringNode | null
  readonly right: PersistentStringNode | null
}

interface InternalPersistentStringIndex {
  readonly size: number
  readonly height: number
  readonly root: PersistentStringNode | null
}

function nodeHeight(node: PersistentStringNode | null): number {
  return node?.height ?? 0
}

function persistentStringNode(
  key: string,
  value: number,
  left: PersistentStringNode | null,
  right: PersistentStringNode | null,
): PersistentStringNode {
  return Object.freeze({ key, value, height: Math.max(nodeHeight(left), nodeHeight(right)) + 1, left, right })
}

function rotatePersistentRight(root: PersistentStringNode): PersistentStringNode {
  const pivot = root.left
  if (pivot === null) return root
  const movedRoot = persistentStringNode(root.key, root.value, pivot.right, root.right)
  return persistentStringNode(pivot.key, pivot.value, pivot.left, movedRoot)
}

function rotatePersistentLeft(root: PersistentStringNode): PersistentStringNode {
  const pivot = root.right
  if (pivot === null) return root
  const movedRoot = persistentStringNode(root.key, root.value, root.left, pivot.left)
  return persistentStringNode(pivot.key, pivot.value, movedRoot, pivot.right)
}

function balancePersistentNode(root: PersistentStringNode): PersistentStringNode {
  const balance = nodeHeight(root.left) - nodeHeight(root.right)
  if (balance > 1 && root.left !== null) {
    const left = nodeHeight(root.left.left) < nodeHeight(root.left.right) ? rotatePersistentLeft(root.left) : root.left
    return rotatePersistentRight(persistentStringNode(root.key, root.value, left, root.right))
  }
  if (balance < -1 && root.right !== null) {
    const right =
      nodeHeight(root.right.right) < nodeHeight(root.right.left) ? rotatePersistentRight(root.right) : root.right
    return rotatePersistentLeft(persistentStringNode(root.key, root.value, root.left, right))
  }
  return root
}

function setPersistentStringNode(root: PersistentStringNode | null, key: string, value: number): PersistentStringNode {
  if (root === null) return persistentStringNode(key, value, null, null)
  const comparison = compareExactStrings(key, root.key)
  if (comparison === 0) return root.value === value ? root : persistentStringNode(key, value, root.left, root.right)
  const next =
    comparison < 0
      ? persistentStringNode(root.key, root.value, setPersistentStringNode(root.left, key, value), root.right)
      : persistentStringNode(root.key, root.value, root.left, setPersistentStringNode(root.right, key, value))
  return balancePersistentNode(next)
}

function internalPersistentIndex(
  index: CaptainRetiredEventIndex | CaptainStreamSequenceIndex,
): InternalPersistentStringIndex {
  return index as unknown as InternalPersistentStringIndex
}

function persistentStringIndex(root: PersistentStringNode | null, size: number): InternalPersistentStringIndex {
  const index = { size, height: nodeHeight(root) } as InternalPersistentStringIndex
  Object.defineProperty(index, "root", { value: root, enumerable: false })
  return Object.freeze(index)
}

const emptyRetiredEventIndex = persistentStringIndex(null, 0) as unknown as CaptainRetiredEventIndex
const emptyStreamSequenceIndex = persistentStringIndex(null, 0) as unknown as CaptainStreamSequenceIndex

function persistentStringValue(
  index: CaptainRetiredEventIndex | CaptainStreamSequenceIndex,
  key: string,
): number | undefined {
  let node = internalPersistentIndex(index).root
  while (node !== null) {
    const comparison = compareExactStrings(key, node.key)
    if (comparison === 0) return node.value
    node = comparison < 0 ? node.left : node.right
  }
  return undefined
}

function setPersistentStringValue<T extends CaptainRetiredEventIndex | CaptainStreamSequenceIndex>(
  index: T,
  key: string,
  value: number,
): T {
  const current = persistentStringValue(index, key)
  if (current === value) return index
  const root = setPersistentStringNode(internalPersistentIndex(index).root, key, value)
  return persistentStringIndex(root, index.size + (current === undefined ? 1 : 0)) as unknown as T
}

function retireCaptainEvent(index: CaptainRetiredEventIndex, id: string, sequence: number): CaptainRetiredEventIndex {
  if (retiredCaptainEventSequence(index, id) !== undefined) return index
  return setPersistentStringValue(index, id, sequence)
}

export function retiredCaptainEventSequence(index: CaptainRetiredEventIndex, id: string): number | undefined {
  return persistentStringValue(index, id)
}

function persistentNodesShare(left: PersistentStringNode | null, right: PersistentStringNode | null): boolean {
  if (left === null) return false
  let matching = right
  while (matching !== null) {
    const comparison = compareExactStrings(left.key, matching.key)
    if (comparison === 0) break
    matching = comparison < 0 ? matching.left : matching.right
  }
  if (matching === left) return true
  return persistentNodesShare(left.left, right) || persistentNodesShare(left.right, right)
}

/** Read-only diagnostic proving that persistent index versions retain unchanged AVL nodes. */
export function retiredCaptainIndexesShareStructure(
  left: CaptainRetiredEventIndex,
  right: CaptainRetiredEventIndex,
): boolean {
  return persistentNodesShare(internalPersistentIndex(left).root, internalPersistentIndex(right).root)
}

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
  return typeof value === "string" && CAPTAIN_CAPTION_KEY_SET.has(value as CaptainCaptionKey)
}

function isCaptionPrimitive(value: unknown): value is CaptainCaptionPrimitive {
  return typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))
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
    !Number.isSafeInteger(value.epoch) ||
    value.epoch < 0 ||
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
    epoch: value.epoch,
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
  return streamIdFromParts(event.source, event.taskId)
}

function streamIdFromParts(source: CaptainEventSource, taskId: string | null): string {
  return `${source}\0${taskId ?? ""}`
}

/** Exact lookup for one producer stream's latest accepted sequence. */
export function captainStreamSequence(
  index: CaptainStreamSequenceIndex,
  source: CaptainEventSource,
  taskId: string | null,
): number | undefined {
  if (!CAPTAIN_EVENT_SOURCES.has(source) || (taskId !== null && !isSafeIdentifier(taskId))) return undefined
  return persistentStringValue(index, streamIdFromParts(source, taskId))
}

/** Read-only diagnostic proving that stream-index versions retain unchanged AVL nodes. */
export function captainStreamIndexesShareStructure(
  left: CaptainStreamSequenceIndex,
  right: CaptainStreamSequenceIndex,
): boolean {
  return persistentNodesShare(internalPersistentIndex(left).root, internalPersistentIndex(right).root)
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
  return compareExactStrings(candidate.id, winner.id) < 0
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
      captionKey: "captain.idle",
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
  latestSequenceByStream: CaptainStreamSequenceIndex,
  retiredEventIds: CaptainRetiredEventIndex,
  now: number,
  epoch: number,
): CaptainReducerState {
  const frozenEvents = Object.freeze(activeEvents)
  return Object.freeze({
    epoch,
    activeEvents: frozenEvents,
    latestSequenceByStream,
    retiredEventIds,
    snapshot: snapshotFor(frozenEvents),
    now,
  })
}

interface ExpiryResult {
  activeEvents: Record<string, CaptainEvent>
  retiredEventIds: CaptainRetiredEventIndex
  changed: boolean
}

function retireExpiredEvents(
  activeEvents: Readonly<Record<string, CaptainEvent>>,
  retiredEventIds: CaptainRetiredEventIndex,
  now: number,
): ExpiryResult {
  const nextActive = emptyRecord<CaptainEvent>()
  let nextRetired = retiredEventIds
  let changed = false
  for (const [id, event] of Object.entries(activeEvents)) {
    if (event.expiresAt === null || event.expiresAt > now) {
      nextActive[id] = event
      continue
    }
    changed = true
    nextRetired = retireCaptainEvent(nextRetired, id, event.sequence)
  }
  return { activeEvents: nextActive, retiredEventIds: nextRetired, changed }
}

export function createCaptainState(now = 0, epoch = 0): CaptainReducerState {
  const safeNow = Number.isFinite(now) ? now : 0
  const safeEpoch = Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : 0
  return freezeState(emptyRecord<CaptainEvent>(), emptyStreamSequenceIndex, emptyRetiredEventIndex, safeNow, safeEpoch)
}

export function captainReducer(state: CaptainReducerState, input: CaptainEvent): CaptainReducerState {
  const event = sanitizeEvent(input)
  if (event === null) return state
  if (event.epoch !== state.epoch) return state
  if (retiredCaptainEventSequence(state.retiredEventIds, event.id) !== undefined) return state

  const existing = Object.hasOwn(state.activeEvents, event.id) ? state.activeEvents[event.id] : undefined
  if (existing !== undefined && !sameStream(existing, event)) return state

  const stream = streamId(event)
  const latestSequence = captainStreamSequence(state.latestSequenceByStream, event.source, event.taskId)
  if (latestSequence !== undefined && event.sequence <= latestSequence) return state

  const now = Math.max(state.now, event.startedAt)
  const expiry = retireExpiredEvents(state.activeEvents, state.retiredEventIds, now)
  const activeEvents = expiry.activeEvents
  let retiredEventIds = expiry.retiredEventIds
  if (retiredCaptainEventSequence(retiredEventIds, event.id) !== undefined) {
    return freezeState(activeEvents, state.latestSequenceByStream, retiredEventIds, now, state.epoch)
  }

  const latestSequenceByStream = setPersistentStringValue(state.latestSequenceByStream, stream, event.sequence)

  if (TERMINAL_EVENT_TYPES.has(event.type)) {
    delete activeEvents[event.id]
    retiredEventIds = retireCaptainEvent(retiredEventIds, event.id, event.sequence)
  } else if (event.expiresAt === null || event.expiresAt > now) {
    activeEvents[event.id] = event
  } else {
    retiredEventIds = retireCaptainEvent(retiredEventIds, event.id, event.sequence)
  }

  return freezeState(activeEvents, latestSequenceByStream, retiredEventIds, now, state.epoch)
}

export function tickCaptainState(state: CaptainReducerState, now: number): CaptainReducerState {
  if (!Number.isFinite(now) || now <= state.now) return state
  const expiry = retireExpiredEvents(state.activeEvents, state.retiredEventIds, now)
  return freezeState(expiry.activeEvents, state.latestSequenceByStream, expiry.retiredEventIds, now, state.epoch)
}

/**
 * Clears one quiescent orchestrator session. The caller must stop old producers
 * before advancing the epoch; stale events are rejected by their old epoch.
 */
export function resetCaptainState(state: CaptainReducerState, nextEpoch: number, now = state.now): CaptainReducerState {
  if (!Number.isSafeInteger(nextEpoch) || nextEpoch <= state.epoch) return state
  const nextNow = Number.isFinite(now) ? Math.max(state.now, now) : state.now
  return freezeState(emptyRecord<CaptainEvent>(), emptyStreamSequenceIndex, emptyRetiredEventIndex, nextNow, nextEpoch)
}
