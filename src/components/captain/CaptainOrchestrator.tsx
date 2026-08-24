import type { CaptainEventDraft, CaptainProducerLease } from "./captain-context.ts"
import type { CaptainCaptionParams, CaptainEvent } from "@/captain/captain-types.ts"

import * as React from "react"
import { CaptainContext } from "./captain-context.ts"
import { captainReducer, createCaptainState, resetCaptainState, tickCaptainState } from "@/captain/captain-reducer.ts"
import { useFleetSkin } from "@/components/fleet-skin-context.ts"
import { useCaptainSpeech } from "@/hooks/useCaptainSpeech.ts"
import { useI18n } from "@/i18n"

const CAPTAIN_TICK_MS = 250
const SAFE_CAPTION_PARAMS = new Set(["attempt", "count", "mouthLevel"])
const producerCounterHost = globalThis as typeof globalThis & { __wantaCaptainProducerSequence__?: number }

function allocateProducerId(): string | null {
  const current = producerCounterHost.__wantaCaptainProducerSequence__ ?? 0
  if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) return null
  const next = current + 1
  producerCounterHost.__wantaCaptainProducerSequence__ = next
  return `captain-app-producer-${next}`
}

interface ActiveLeaseToken {
  readonly id: string
  readonly epoch: number
  active: boolean
}

function safeNow(): number {
  const now = Date.now()
  return Number.isFinite(now) ? now : 0
}

function safeCaptionParams(params: CaptainCaptionParams | undefined): CaptainCaptionParams {
  if (!params) return Object.freeze({})
  const safe: Record<string, number | boolean> = Object.create(null) as Record<string, number | boolean>
  for (const [key, value] of Object.entries(params)) {
    if (!SAFE_CAPTION_PARAMS.has(key)) continue
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) safe[key] = value
  }
  return Object.freeze(safe)
}

/**
 * The sole owner of the captain reducer and Web Speech hook. Mounted app-event
 * producers receive fixed-epoch leases; only a quiescent release advances it.
 */
export function CaptainOrchestrator({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n()
  const fleetSkin = useFleetSkin()
  const [state, setState] = React.useState(() => createCaptainState(safeNow(), 0))
  const [taskCancellationVersion, setTaskCancellationVersion] = React.useState(0)
  const sequences = React.useRef(new Map<string, number>())
  const activeLeaseRef = React.useRef<ActiveLeaseToken | null>(null)
  const epochAvailableRef = React.useRef(true)
  const epochRef = React.useRef(state.epoch)
  epochRef.current = state.epoch

  const acceptEvent = React.useCallback((event: CaptainEvent) => {
    setState((current) => captainReducer(current, event))
  }, [])

  const speech = useCaptainSpeech({
    epoch: state.epoch,
    fleetId: fleetSkin.skin?.identity.crewId ?? "watchtide",
    taskCancellationVersion,
    locale,
    onCaptainEvent: acceptEvent,
  })
  const speechRef = React.useRef(speech)
  speechRef.current = speech

  const publishForLease = React.useCallback((lease: ActiveLeaseToken, drafts: readonly CaptainEventDraft[]) => {
    if (drafts.length === 0) return
    if (!lease.active || activeLeaseRef.current !== lease || epochRef.current !== lease.epoch) return
    const now = safeNow()
    setState((current) => {
      if (!lease.active || activeLeaseRef.current !== lease || current.epoch !== lease.epoch) return current
      let next = current
      for (const draft of drafts) {
        const stream = `${draft.source}\0${draft.taskId ?? ""}`
        const previousSequence = sequences.current.get(stream) ?? 0
        if (previousSequence >= Number.MAX_SAFE_INTEGER) continue
        const sequence = previousSequence + 1
        sequences.current.set(stream, sequence)
        const duration = draft.expiresInMs
        const event: CaptainEvent = Object.freeze({
          id: draft.id,
          epoch: lease.epoch,
          type: draft.type,
          source: draft.source,
          taskId: draft.taskId,
          sequence,
          startedAt: now,
          expiresAt: typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? now + duration : null,
          captionKey: draft.captionKey,
          captionParams: safeCaptionParams(draft.captionParams),
        })
        next = captainReducer(next, event)
      }
      return next
    })
  }, [])

  const cancelTaskSpeech = React.useCallback(() => {
    speechRef.current.cancelTaskSpeech()
    setTaskCancellationVersion((version) => (version >= Number.MAX_SAFE_INTEGER ? version : version + 1))
  }, [])

  const acquireProducer = React.useCallback((): CaptainProducerLease | null => {
    if (activeLeaseRef.current !== null || !epochAvailableRef.current) return null
    const producerId = allocateProducerId()
    if (!producerId) return null
    const token: ActiveLeaseToken = {
      id: producerId,
      epoch: epochRef.current,
      active: true,
    }
    activeLeaseRef.current = token
    return Object.freeze({
      id: token.id,
      epoch: token.epoch,
      publish: (events: readonly CaptainEventDraft[]) => publishForLease(token, events),
      cancelTaskSpeech: () => {
        if (token.active && activeLeaseRef.current === token) cancelTaskSpeech()
      },
      release: (terminalEvents: readonly CaptainEventDraft[]) => {
        if (!token.active || activeLeaseRef.current !== token) return
        token.active = false
        activeLeaseRef.current = null
        speechRef.current.cancelTaskSpeech()
        setTaskCancellationVersion((version) => (version >= Number.MAX_SAFE_INTEGER ? version : version + 1))
        const now = safeNow()
        const terminalCaptainEvents: CaptainEvent[] = []
        for (const draft of terminalEvents) {
          const stream = `${draft.source}\0${draft.taskId ?? ""}`
          const previousSequence = sequences.current.get(stream) ?? 0
          if (previousSequence >= Number.MAX_SAFE_INTEGER) continue
          const sequence = previousSequence + 1
          sequences.current.set(stream, sequence)
          terminalCaptainEvents.push(
            Object.freeze({
              id: draft.id,
              epoch: token.epoch,
              type: draft.type,
              source: draft.source,
              taskId: draft.taskId,
              sequence,
              startedAt: now,
              expiresAt: null,
              captionKey: draft.captionKey,
              captionParams: safeCaptionParams(draft.captionParams),
            }),
          )
        }
        if (token.epoch >= Number.MAX_SAFE_INTEGER) {
          epochAvailableRef.current = false
          setState((current) => {
            if (current.epoch !== token.epoch) return current
            let terminalized = current
            for (const event of terminalCaptainEvents) terminalized = captainReducer(terminalized, event)
            return terminalized
          })
          return
        }
        const nextEpoch = token.epoch + 1
        epochRef.current = nextEpoch
        sequences.current.clear()
        setState((current) => {
          if (current.epoch !== token.epoch) return current
          let terminalized = current
          for (const event of terminalCaptainEvents) terminalized = captainReducer(terminalized, event)
          return resetCaptainState(terminalized, nextEpoch, now)
        })
      },
    })
  }, [cancelTaskSpeech, publishForLease])

  React.useEffect(() => {
    const timer = window.setInterval(() => setState((current) => tickCaptainState(current, safeNow())), CAPTAIN_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const value = React.useMemo(
    () => ({ epoch: state.epoch, snapshot: state.snapshot, speech, acquireProducer }),
    [acquireProducer, speech, state.epoch, state.snapshot],
  )
  return <CaptainContext.Provider value={value}>{children}</CaptainContext.Provider>
}
