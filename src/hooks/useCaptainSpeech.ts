import type { CaptainEvent, CaptainEventType } from "../captain/captain-types.ts"
import type {
  CaptainSpeechIntent,
  CaptainSpeechParams,
  CaptainVoiceFailure,
  CaptainVoiceSettings,
} from "../captain/captain-voice.ts"
import type { Locale } from "../i18n/i18n.ts"

import * as React from "react"
import {
  captainVoiceReducer,
  clampCaptainVoiceRate,
  clampCaptainVoiceVolume,
  createCaptainVoiceState,
  loadCaptainVoiceSettings,
  persistCaptainVoiceSettings,
  sanitizeCaptainSpeechIntent,
} from "../captain/captain-voice.ts"
import { translate } from "../i18n/i18n.ts"

export const CAPTAIN_SPEECH_SEQUENCE_LIMIT = 1_000_000_000
export const CAPTAIN_SPEECH_WATCHDOG_MS = 30_000

let captainSpeechProducerCounter = 0

function allocateCaptainSpeechProducerId(): string | null {
  if (captainSpeechProducerCounter >= Number.MAX_SAFE_INTEGER) return null
  captainSpeechProducerCounter += 1
  return `captain-speech-producer-${captainSpeechProducerCounter}`
}

export interface UseCaptainSpeechOptions {
  readonly epoch: number
  readonly fleetId: string
  readonly taskCancellationVersion: number
  readonly locale: Locale
  readonly onCaptainEvent: (event: CaptainEvent) => void
}

export interface UseCaptainSpeechResult {
  readonly settings: CaptainVoiceSettings
  readonly caption: CaptainSpeechIntent | null
  readonly current: CaptainSpeechIntent | null
  readonly queue: readonly CaptainSpeechIntent[]
  readonly availability: "available" | "unavailable"
  readonly epochStatus: "active" | "blocked"
  readonly lastFailure: CaptainVoiceFailure | null
  readonly request: (intent: unknown) => void
  readonly setEnabled: (enabled: boolean) => void
  readonly setClickOnly: (clickOnly: boolean) => void
  readonly setVolume: (volume: number) => void
  readonly setRate: (rate: number) => void
  readonly mute: () => void
  readonly cancelTaskSpeech: () => void
}

function hasSpeechSynthesis(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.speechSynthesis?.speak === "function" &&
      typeof window.speechSynthesis?.cancel === "function" &&
      typeof globalThis.SpeechSynthesisUtterance === "function"
    )
  } catch {
    return false
  }
}

function cancelNativeSpeech(): void {
  try {
    if (typeof window !== "undefined" && typeof window.speechSynthesis?.cancel === "function") {
      window.speechSynthesis.cancel()
    }
  } catch {
    // Cancellation is best-effort; local reducer state is still cleared atomically.
  }
}

function translateParams(params: CaptainSpeechParams): Record<string, string | number> {
  const translated: Record<string, string | number> = Object.create(null) as Record<string, string | number>
  for (const [key, value] of Object.entries(params))
    translated[key] = typeof value === "boolean" ? Number(value) : value
  return translated
}

function isSafeEpoch(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function utteranceLanguage(locale: Locale): string {
  return locale === "zh-CN" ? "zh-CN" : "en-US"
}

export function useCaptainSpeech({
  epoch,
  fleetId,
  taskCancellationVersion,
  locale,
  onCaptainEvent,
}: UseCaptainSpeechOptions): UseCaptainSpeechResult {
  const [state, dispatch] = React.useReducer(captainVoiceReducer, undefined, () =>
    createCaptainVoiceState(loadCaptainVoiceSettings()),
  )
  const [producerId] = React.useState(allocateCaptainSpeechProducerId)
  const initialEpoch = isSafeEpoch(epoch) ? epoch : null
  const [epochStatus, setEpochStatus] = React.useState<"active" | "blocked">(
    initialEpoch !== null && producerId !== null ? "active" : "blocked",
  )
  const generationRef = React.useRef(0)
  const sequenceRef = React.useRef(0)
  const lifecycleRef = React.useRef(0)
  const epochRef = React.useRef<number | null>(initialEpoch)
  const epochBlockedRef = React.useRef(initialEpoch === null || producerId === null)
  const fleetRef = React.useRef(fleetId)
  const cancellationRef = React.useRef(taskCancellationVersion)
  const activeEventIdRef = React.useRef<string | null>(null)
  const watchdogRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const seenIntentIdsRef = React.useRef(new Set<string>())
  const stateRef = React.useRef(state)
  const localeRef = React.useRef(locale)
  const onEventRef = React.useRef(onCaptainEvent)
  stateRef.current = state
  localeRef.current = locale
  onEventRef.current = onCaptainEvent

  const clearWatchdog = React.useCallback(() => {
    if (watchdogRef.current === null) return
    clearTimeout(watchdogRef.current)
    watchdogRef.current = null
  }, [])

  const nextSequence = React.useCallback((): number | null => {
    if (sequenceRef.current >= CAPTAIN_SPEECH_SEQUENCE_LIMIT) return null
    sequenceRef.current += 1
    return sequenceRef.current
  }, [])

  const emitEvent = React.useCallback(
    (type: CaptainEventType, eventId: string, captionParams: CaptainSpeechParams = {}): boolean => {
      const sequence = nextSequence()
      const currentEpoch = epochRef.current
      if (sequence === null || currentEpoch === null || producerId === null) return false
      const now = Date.now()
      onEventRef.current(
        Object.freeze({
          id: eventId,
          epoch: currentEpoch,
          type,
          source: "speech",
          taskId: producerId,
          sequence,
          startedAt: Number.isFinite(now) ? now : 0,
          expiresAt: null,
          captionKey:
            type === "speech.started"
              ? "captain.reporting"
              : type === "speech.failed"
                ? "captain.failure"
                : "captain.idle",
          captionParams: Object.freeze({ ...captionParams }),
        }),
      )
      return true
    },
    [nextSequence, producerId],
  )

  const cancelCurrentNativeSpeech = React.useCallback(() => {
    generationRef.current += 1
    clearWatchdog()
    const activeEventId = activeEventIdRef.current
    activeEventIdRef.current = null
    if (activeEventId !== null) emitEvent("speech.failed", activeEventId)
    cancelNativeSpeech()
  }, [clearWatchdog, emitEvent])

  const clearSpeech = React.useCallback(() => {
    cancelCurrentNativeSpeech()
    dispatch({ type: "clear_speech" })
  }, [cancelCurrentNativeSpeech])

  const mute = React.useCallback(() => {
    cancelCurrentNativeSpeech()
    dispatch({ type: "mute" })
  }, [cancelCurrentNativeSpeech])

  React.useEffect(() => {
    persistCaptainVoiceSettings(state.settings)
  }, [state.settings])

  React.useLayoutEffect(() => {
    const candidateEpoch = isSafeEpoch(epoch) ? epoch : null
    const lastValidEpoch = epochRef.current

    if (producerId === null) {
      if (!epochBlockedRef.current) clearSpeech()
      epochBlockedRef.current = true
      setEpochStatus("blocked")
      return
    }

    if (lastValidEpoch === null) {
      if (candidateEpoch === null) {
        epochBlockedRef.current = true
        setEpochStatus("blocked")
        return
      }
      epochRef.current = candidateEpoch
      epochBlockedRef.current = false
      sequenceRef.current = 0
      lifecycleRef.current = 0
      seenIntentIdsRef.current.clear()
      setEpochStatus("active")
      return
    }

    if (epochBlockedRef.current) {
      if (candidateEpoch !== null && candidateEpoch > lastValidEpoch) {
        clearSpeech()
        epochRef.current = candidateEpoch
        epochBlockedRef.current = false
        sequenceRef.current = 0
        lifecycleRef.current = 0
        seenIntentIdsRef.current.clear()
        setEpochStatus("active")
      } else {
        setEpochStatus("blocked")
      }
      return
    }

    if (candidateEpoch === lastValidEpoch) return
    clearSpeech()
    if (candidateEpoch !== null && candidateEpoch > lastValidEpoch) {
      epochRef.current = candidateEpoch
      epochBlockedRef.current = false
      sequenceRef.current = 0
      lifecycleRef.current = 0
      seenIntentIdsRef.current.clear()
      setEpochStatus("active")
    } else {
      epochBlockedRef.current = true
      setEpochStatus("blocked")
    }
  }, [clearSpeech, epoch, producerId])

  React.useLayoutEffect(() => {
    if (fleetRef.current === fleetId) return
    fleetRef.current = fleetId
    clearSpeech()
  }, [clearSpeech, fleetId])

  React.useLayoutEffect(() => {
    if (cancellationRef.current === taskCancellationVersion) return
    cancellationRef.current = taskCancellationVersion
    clearSpeech()
  }, [clearSpeech, taskCancellationVersion])

  React.useEffect(() => {
    if (!epochBlockedRef.current && state.current === null && state.queue.length > 0) {
      dispatch({ type: "start_next" })
    }
  }, [state.current, state.queue])

  React.useEffect(() => {
    const intent = state.current
    const currentEpoch = epochRef.current
    if (intent === null) return
    if (epochBlockedRef.current || currentEpoch === null || producerId === null) {
      dispatch({ type: "clear_speech" })
      return
    }
    const speechGeneration = generationRef.current
    if (
      sequenceRef.current > CAPTAIN_SPEECH_SEQUENCE_LIMIT - 2 ||
      lifecycleRef.current >= CAPTAIN_SPEECH_SEQUENCE_LIMIT
    ) {
      dispatch({ type: "finish_current", failure: "event-sequence-exhausted" })
      return
    }
    lifecycleRef.current += 1
    const producerNumber = producerId.slice("captain-speech-producer-".length)
    const eventId = `captain-speech:e${currentEpoch}:p${producerNumber}:l${lifecycleRef.current}`
    if (!hasSpeechSynthesis()) {
      emitEvent("speech.failed", eventId)
      dispatch({ type: "finish_current", failure: "unavailable" })
      return
    }

    let settled = false
    try {
      const currentLocale = localeRef.current
      const utterance = new SpeechSynthesisUtterance(
        translate(currentLocale, intent.messageKey, translateParams(intent.params)),
      )
      utterance.lang = utteranceLanguage(currentLocale)
      utterance.volume = stateRef.current.settings.volume
      utterance.rate = stateRef.current.settings.rate
      const finish = (type: "speech.finished" | "speech.failed", failure?: CaptainVoiceFailure) => {
        if (generationRef.current !== speechGeneration || settled) return
        settled = true
        clearWatchdog()
        activeEventIdRef.current = null
        emitEvent(type, eventId)
        dispatch({ type: "finish_current", failure })
      }
      utterance.onend = () => finish("speech.finished")
      utterance.onerror = () => finish("speech.failed", "synthesis-error")
      activeEventIdRef.current = eventId
      if (!emitEvent("speech.started", eventId)) {
        activeEventIdRef.current = null
        dispatch({ type: "finish_current", failure: "event-sequence-exhausted" })
        return
      }
      watchdogRef.current = setTimeout(() => {
        if (generationRef.current !== speechGeneration || settled) return
        settled = true
        watchdogRef.current = null
        activeEventIdRef.current = null
        emitEvent("speech.failed", eventId)
        cancelNativeSpeech()
        dispatch({ type: "finish_current", failure: "synthesis-error" })
      }, CAPTAIN_SPEECH_WATCHDOG_MS)
      window.speechSynthesis.speak(utterance)
    } catch {
      if (settled) return
      settled = true
      clearWatchdog()
      activeEventIdRef.current = null
      emitEvent("speech.failed", eventId)
      dispatch({ type: "finish_current", failure: "synthesis-error" })
    }
  }, [clearWatchdog, emitEvent, producerId, state.current])

  React.useEffect(() => {
    const handleWindowExit = () => clearSpeech()
    window.addEventListener("beforeunload", handleWindowExit)
    window.addEventListener("pagehide", handleWindowExit)
    return () => {
      window.removeEventListener("beforeunload", handleWindowExit)
      window.removeEventListener("pagehide", handleWindowExit)
      cancelCurrentNativeSpeech()
    }
  }, [cancelCurrentNativeSpeech, clearSpeech])

  const request = React.useCallback((rawIntent: unknown) => {
    const intent = sanitizeCaptainSpeechIntent(rawIntent)
    if (intent === null || seenIntentIdsRef.current.has(intent.id)) return
    if (epochBlockedRef.current || epochRef.current === null) {
      dispatch({ type: "caption_only", intent })
      return
    }
    const settings = stateRef.current.settings
    if (settings.enabled && (!settings.clickOnly || intent.category === "manual")) {
      seenIntentIdsRef.current.add(intent.id)
    }
    dispatch({ type: "request", intent })
  }, [])

  const setEnabled = React.useCallback(
    (enabled: boolean) => {
      if (enabled === true) dispatch({ type: "set_enabled", enabled: true })
      else mute()
    },
    [mute],
  )

  const setClickOnly = React.useCallback(
    (clickOnly: boolean) => {
      const current = stateRef.current.current
      if (clickOnly === true && current !== null && current.category !== "manual") {
        cancelCurrentNativeSpeech()
      }
      dispatch({ type: "set_click_only", clickOnly: clickOnly === true })
    },
    [cancelCurrentNativeSpeech],
  )

  const setVolume = React.useCallback((volume: number) => {
    dispatch({ type: "set_volume", volume: clampCaptainVoiceVolume(volume) })
  }, [])

  const setRate = React.useCallback((rate: number) => {
    dispatch({ type: "set_rate", rate: clampCaptainVoiceRate(rate) })
  }, [])

  return {
    settings: state.settings,
    caption: state.caption,
    current: state.current,
    queue: state.queue,
    availability: hasSpeechSynthesis() ? "available" : "unavailable",
    epochStatus,
    lastFailure: state.lastFailure,
    request,
    setEnabled,
    setClickOnly,
    setVolume,
    setRate,
    mute,
    cancelTaskSpeech: clearSpeech,
  }
}
