import type { CaptainCaptionParams, CaptainEvent } from "@/captain/captain-types.ts"
import type { CaptainEventDraft } from "./captain-context.ts"

import * as React from "react"
import { captainReducer, createCaptainState, tickCaptainState } from "@/captain/captain-reducer.ts"
import { useFleetSkin } from "@/components/fleet-skin-context.ts"
import { useCaptainSpeech } from "@/hooks/useCaptainSpeech.ts"
import { useI18n } from "@/i18n"
import { CaptainContext } from "./captain-context.ts"

const CAPTAIN_TICK_MS = 250
const SAFE_CAPTION_PARAMS = new Set(["attempt", "count", "mouthLevel"])

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
 * The sole owner of the captain reducer and Web Speech hook. Its epoch remains
 * live for this provider lifetime, so no reducer reset can race an old producer.
 */
export function CaptainOrchestrator({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n()
  const fleetSkin = useFleetSkin()
  const [state, setState] = React.useState(() => createCaptainState(safeNow(), 0))
  const [taskCancellationVersion, setTaskCancellationVersion] = React.useState(0)
  const sequences = React.useRef(new Map<string, number>())
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

  const publish = React.useCallback((drafts: readonly CaptainEventDraft[]) => {
    if (drafts.length === 0) return
    const now = safeNow()
    setState((current) => {
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
          epoch: epochRef.current,
          type: draft.type,
          source: draft.source,
          taskId: draft.taskId,
          sequence,
          startedAt: now,
          expiresAt:
            typeof duration === "number" && Number.isFinite(duration) && duration > 0 ? now + duration : null,
          captionKey: draft.captionKey,
          captionParams: safeCaptionParams(draft.captionParams),
        })
        next = captainReducer(next, event)
      }
      return next
    })
  }, [])

  const cancelTaskSpeech = React.useCallback(() => {
    setTaskCancellationVersion((version) => (version >= Number.MAX_SAFE_INTEGER ? version : version + 1))
  }, [])

  React.useEffect(() => {
    const timer = window.setInterval(() => setState((current) => tickCaptainState(current, safeNow())), CAPTAIN_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  const value = React.useMemo(
    () => ({ epoch: state.epoch, snapshot: state.snapshot, speech, publish, cancelTaskSpeech }),
    [cancelTaskSpeech, publish, speech, state.epoch, state.snapshot],
  )
  return <CaptainContext.Provider value={value}>{children}</CaptainContext.Provider>
}
