// @vitest-environment happy-dom

import type { CaptainEvent } from "../captain/captain-types.ts"
import type { CaptainSpeechIntent } from "../captain/captain-voice.ts"

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { captainReducer, createCaptainState, retiredCaptainEventSequence } from "../captain/captain-reducer.ts"
import { useCaptainSpeech } from "./useCaptainSpeech.ts"

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class FakeUtterance {
  text: string
  volume = 1
  rate = 1
  lang = ""
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(text: string) {
    this.text = text
  }
}

interface HarnessProps {
  epoch: number
  fleetId: string
  taskCancellationVersion: number
}

type SpeechHook = ReturnType<typeof useCaptainSpeech>
const roots: Array<ReturnType<typeof createRoot>> = []

function renderHook(props: HarnessProps, onEvent: (event: CaptainEvent) => void) {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  let latest: SpeechHook | null = null
  function Probe(next: HarnessProps) {
    latest = useCaptainSpeech({ ...next, locale: "en", onCaptainEvent: onEvent })
    return null
  }
  act(() => root.render(<Probe {...props} />))
  return {
    get current(): SpeechHook {
      if (latest === null) throw new Error("hook not ready")
      return latest
    },
    rerender(next: HarnessProps) {
      act(() => root.render(<Probe {...next} />))
    },
    unmount() {
      act(() => root.unmount())
      roots.splice(roots.indexOf(root), 1)
    },
  }
}

const welcome: CaptainSpeechIntent = {
  id: "welcome-1",
  category: "welcome",
  messageKey: "captain.voice.welcome",
  params: {},
}

function installSpeechSynthesis() {
  const utterances: FakeUtterance[] = []
  const synthesis = {
    cancel: vi.fn(),
    speak: vi.fn((utterance: FakeUtterance) => utterances.push(utterance)),
  }
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synthesis })
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: FakeUtterance })
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { configurable: true, value: FakeUtterance })
  return { synthesis, utterances }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.replaceChildren()
  Reflect.deleteProperty(window, "speechSynthesis")
  Reflect.deleteProperty(window, "SpeechSynthesisUtterance")
  Reflect.deleteProperty(globalThis, "SpeechSynthesisUtterance")
})

describe("useCaptainSpeech", () => {
  it("speaks catalogued localized text only after explicit enable and emits bounded epoch events", () => {
    const { synthesis, utterances } = installSpeechSynthesis()
    const events: CaptainEvent[] = []
    const harness = renderHook({ epoch: 7, fleetId: "watchtide", taskCancellationVersion: 0 }, (event) =>
      events.push(event),
    )

    act(() => harness.current.request(welcome))
    expect(synthesis.speak).not.toHaveBeenCalled()
    expect(harness.current.caption).toEqual(welcome)

    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))
    expect(synthesis.speak).toHaveBeenCalledTimes(1)
    expect(utterances[0]).toMatchObject({ text: "Welcome aboard. The captain is ready.", lang: "en-US" })
    expect(events[0]).toMatchObject({
      epoch: 7,
      type: "speech.started",
      source: "speech",
      sequence: 1,
      taskId: expect.stringMatching(/^captain-speech-producer-/u),
    })
    expect(events[0]?.captionParams).toEqual({})
    expect(Number.isSafeInteger(events[0]?.sequence)).toBe(true)

    act(() => utterances[0]?.onend?.())
    expect(events[1]).toMatchObject({ epoch: 7, id: events[0]?.id, type: "speech.finished", sequence: 2 })
    expect(events[1]!.sequence).toBeGreaterThan(events[0]!.sequence)
    harness.unmount()
  })

  it("one-click mute, fleet changes, task cancellation, page cleanup, and unmount cancel all speech", () => {
    const { synthesis } = installSpeechSynthesis()
    const harness = renderHook({ epoch: 3, fleetId: "watchtide", taskCancellationVersion: 0 }, () => undefined)
    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))
    act(() => harness.current.request({ ...welcome, id: "welcome-2" }))

    act(() => harness.current.mute())
    expect(synthesis.cancel).toHaveBeenCalledTimes(1)
    expect(harness.current.current).toBeNull()
    expect(harness.current.queue).toEqual([])

    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request({ ...welcome, id: "welcome-3" }))
    harness.rerender({ epoch: 3, fleetId: "ink-sail", taskCancellationVersion: 0 })
    expect(synthesis.cancel).toHaveBeenCalledTimes(2)

    act(() => harness.current.request({ ...welcome, id: "welcome-4" }))
    harness.rerender({ epoch: 3, fleetId: "ink-sail", taskCancellationVersion: 1 })
    expect(synthesis.cancel).toHaveBeenCalledTimes(3)

    window.dispatchEvent(new Event("beforeunload"))
    expect(synthesis.cancel).toHaveBeenCalledTimes(4)
    harness.unmount()
    expect(synthesis.cancel).toHaveBeenCalledTimes(5)
  })

  it("retires an active reporting event when mute cancels native speech", () => {
    const { synthesis } = installSpeechSynthesis()
    const events: CaptainEvent[] = []
    const harness = renderHook({ epoch: 4, fleetId: "watchtide", taskCancellationVersion: 0 }, (event) =>
      events.push(event),
    )
    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))
    act(() => harness.current.mute())

    expect(synthesis.cancel).toHaveBeenCalledOnce()
    expect(events.map((event) => event.type)).toEqual(["speech.started", "speech.failed"])
    expect(events[1]).toMatchObject({ id: events[0]?.id, epoch: 4, sequence: 2 })
    harness.unmount()
  })

  it("emits a terminal event before unmount cancels an active utterance", () => {
    installSpeechSynthesis()
    const events: CaptainEvent[] = []
    const harness = renderHook({ epoch: 6, fleetId: "watchtide", taskCancellationVersion: 0 }, (event) =>
      events.push(event),
    )
    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))
    harness.unmount()
    expect(events.map((event) => event.type)).toEqual(["speech.started", "speech.failed"])
    expect(events[1]).toMatchObject({ id: events[0]?.id, epoch: 6, sequence: 2 })
  })

  it("does not replay the current utterance when volume or rate changes", () => {
    const { synthesis } = installSpeechSynthesis()
    const harness = renderHook({ epoch: 1, fleetId: "watchtide", taskCancellationVersion: 0 }, () => undefined)
    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))
    act(() => {
      harness.current.setVolume(0.2)
      harness.current.setRate(1.4)
    })
    expect(synthesis.speak).toHaveBeenCalledOnce()
    harness.unmount()
  })

  it("click-only mode cancels an automatic utterance and still permits manual speech", () => {
    const { synthesis, utterances } = installSpeechSynthesis()
    const harness = renderHook({ epoch: 1, fleetId: "watchtide", taskCancellationVersion: 0 }, () => undefined)
    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))
    act(() => harness.current.setClickOnly(true))
    expect(synthesis.cancel).toHaveBeenCalledOnce()
    expect(harness.current.current).toBeNull()

    act(() =>
      harness.current.request({
        id: "manual-1",
        category: "manual",
        messageKey: "captain.voice.manual",
        params: {},
      }),
    )
    expect(utterances.at(-1)?.text).toBe("The captain's status report is ready.")
    harness.unmount()
  })

  it("reports a synchronous synthesis failure without throwing or losing the caption", () => {
    const { synthesis } = installSpeechSynthesis()
    synthesis.speak.mockImplementationOnce(() => {
      throw new Error("native TTS failed")
    })
    const events: CaptainEvent[] = []
    const harness = renderHook({ epoch: 5, fleetId: "watchtide", taskCancellationVersion: 0 }, (event) =>
      events.push(event),
    )
    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))
    expect(harness.current.caption).toEqual(welcome)
    expect(harness.current.lastFailure).toBe("synthesis-error")
    expect(events.map((event) => event.type)).toEqual(["speech.started", "speech.failed"])
    harness.unmount()
  })

  it("accepts only the first native terminal callback for an utterance", () => {
    const { utterances } = installSpeechSynthesis()
    const events: CaptainEvent[] = []
    const harness = renderHook({ epoch: 2, fleetId: "watchtide", taskCancellationVersion: 0 }, (event) =>
      events.push(event),
    )
    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))
    act(() => {
      utterances[0]?.onend?.()
      utterances[0]?.onerror?.()
    })
    expect(events.map((event) => event.type)).toEqual(["speech.started", "speech.finished"])
    expect(harness.current.lastFailure).toBeNull()
    harness.unmount()
  })

  it("keeps captions and emits speech.failed when system TTS is unavailable", () => {
    const events: CaptainEvent[] = []
    const harness = renderHook({ epoch: 11, fleetId: "watchtide", taskCancellationVersion: 0 }, (event) =>
      events.push(event),
    )
    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))

    expect(harness.current.caption).toEqual(welcome)
    expect(harness.current.availability).toBe("unavailable")
    expect(harness.current.lastFailure).toBe("unavailable")
    expect(events.map((event) => event.type)).toEqual(["speech.failed"])
    expect(events[0]?.epoch).toBe(11)
    harness.unmount()
  })

  it("applies clamped settings to utterances and persists no payload fields", () => {
    const { utterances } = installSpeechSynthesis()
    const harness = renderHook({ epoch: 1, fleetId: "watchtide", taskCancellationVersion: 0 }, () => undefined)
    act(() => {
      harness.current.setEnabled(true)
      harness.current.setVolume(9)
      harness.current.setRate(0)
    })
    act(() => harness.current.request(welcome))
    expect(utterances[0]).toMatchObject({ volume: 1, rate: 0.5 })
    expect(JSON.parse(localStorage.getItem("wanta.captainVoice") ?? "null")).toEqual({
      enabled: true,
      clickOnly: false,
      volume: 1,
      rate: 0.5,
    })
    harness.unmount()
  })

  it("never reaches microphone APIs", () => {
    installSpeechSynthesis()
    const getUserMedia = vi.fn()
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } })
    const harness = renderHook({ epoch: 1, fleetId: "watchtide", taskCancellationVersion: 0 }, () => undefined)
    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))
    expect(getUserMedia).not.toHaveBeenCalled()
    harness.unmount()
  })

  it("treats a native adapter without cancel as unavailable and never calls speak", () => {
    const speak = vi.fn()
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speak } })
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", { configurable: true, value: FakeUtterance })
    const events: CaptainEvent[] = []
    const harness = renderHook({ epoch: 1, fleetId: "watchtide", taskCancellationVersion: 0 }, (event) =>
      events.push(event),
    )
    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))
    expect(speak).not.toHaveBeenCalled()
    expect(harness.current.availability).toBe("unavailable")
    expect(events.map((event) => event.type)).toEqual(["speech.failed"])
    harness.unmount()
  })

  it("keeps an invalid initial epoch blocked and never speaks or emits", () => {
    const { synthesis } = installSpeechSynthesis()
    const events: CaptainEvent[] = []
    const harness = renderHook({ epoch: Number.NaN, fleetId: "watchtide", taskCancellationVersion: 0 }, (event) =>
      events.push(event),
    )
    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))
    expect(harness.current.caption).toEqual(welcome)
    expect(harness.current.epochStatus).toBe("blocked")
    expect(synthesis.speak).not.toHaveBeenCalled()
    expect(events).toEqual([])
    harness.unmount()
  })

  it("blocks a lowered epoch until a strictly higher epoch arrives", () => {
    const { synthesis, utterances } = installSpeechSynthesis()
    const events: CaptainEvent[] = []
    const harness = renderHook({ epoch: 7, fleetId: "watchtide", taskCancellationVersion: 0 }, (event) =>
      events.push(event),
    )
    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))
    expect(synthesis.speak).toHaveBeenCalledTimes(1)

    harness.rerender({ epoch: 6, fleetId: "watchtide", taskCancellationVersion: 0 })
    expect(events.at(-1)).toMatchObject({ epoch: 7, type: "speech.failed" })
    act(() => harness.current.request({ ...welcome, id: "blocked-6" }))
    expect(harness.current.epochStatus).toBe("blocked")
    expect(synthesis.speak).toHaveBeenCalledTimes(1)

    harness.rerender({ epoch: 7, fleetId: "watchtide", taskCancellationVersion: 0 })
    act(() => harness.current.request({ ...welcome, id: "blocked-7" }))
    expect(harness.current.epochStatus).toBe("blocked")
    expect(synthesis.speak).toHaveBeenCalledTimes(1)

    harness.rerender({ epoch: 8, fleetId: "watchtide", taskCancellationVersion: 0 })
    act(() => harness.current.request({ ...welcome, id: "active-8" }))
    expect(harness.current.epochStatus).toBe("active")
    expect(synthesis.speak).toHaveBeenCalledTimes(2)
    expect(events.at(-1)).toMatchObject({ epoch: 8, sequence: 1, type: "speech.started" })
    act(() => utterances.at(-1)?.onend?.())
    harness.unmount()
  })

  it("uses a unique Task 7 producer stream across same-epoch remounts", () => {
    const { utterances } = installSpeechSynthesis()
    const events: CaptainEvent[] = []
    let reducerState = createCaptainState(0, 9)
    const onEvent = (event: CaptainEvent) => {
      events.push(event)
      reducerState = captainReducer(reducerState, event)
    }

    let harness = renderHook({ epoch: 9, fleetId: "watchtide", taskCancellationVersion: 0 }, onEvent)
    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))
    act(() => utterances.at(-1)?.onend?.())
    harness.unmount()

    harness = renderHook({ epoch: 9, fleetId: "watchtide", taskCancellationVersion: 0 }, onEvent)
    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))
    act(() => utterances.at(-1)?.onend?.())
    harness.unmount()

    expect(events.map((event) => event.sequence)).toEqual([1, 2, 1, 2])
    expect(events[0]?.taskId).not.toBe(events[2]?.taskId)
    expect(events[0]?.id).not.toBe(events[2]?.id)
    expect(retiredCaptainEventSequence(reducerState.retiredEventIds, events[0]!.id)).toBe(2)
    expect(retiredCaptainEventSequence(reducerState.retiredEventIds, events[2]!.id)).toBe(2)
    expect(reducerState.snapshot.state).toBe("idle")
  })

  it("fails a silent native utterance exactly once after the 30 second watchdog", () => {
    vi.useFakeTimers()
    const { synthesis, utterances } = installSpeechSynthesis()
    const events: CaptainEvent[] = []
    const harness = renderHook({ epoch: 3, fleetId: "watchtide", taskCancellationVersion: 0 }, (event) =>
      events.push(event),
    )
    act(() => harness.current.setEnabled(true))
    act(() => harness.current.request(welcome))
    act(() => vi.advanceTimersByTime(30_000))
    expect(synthesis.cancel).toHaveBeenCalledOnce()
    expect(events.map((event) => event.type)).toEqual(["speech.started", "speech.failed"])
    expect(harness.current.lastFailure).toBe("synthesis-error")
    act(() => {
      utterances[0]?.onend?.()
      vi.advanceTimersByTime(30_000)
    })
    expect(events).toHaveLength(2)
    harness.unmount()
    vi.useRealTimers()
  })

  it("continues with the next queued intent after the watchdog retires a silent utterance", () => {
    vi.useFakeTimers()
    const { synthesis, utterances } = installSpeechSynthesis()
    const events: CaptainEvent[] = []
    const harness = renderHook({ epoch: 3, fleetId: "watchtide", taskCancellationVersion: 0 }, (event) =>
      events.push(event),
    )
    act(() => harness.current.setEnabled(true))
    act(() => {
      harness.current.request(welcome)
      harness.current.request({
        id: "risk-after-timeout",
        category: "risk",
        messageKey: "captain.voice.risk",
        params: {},
      })
    })
    act(() => vi.advanceTimersByTime(30_000))
    expect(synthesis.speak).toHaveBeenCalledTimes(2)
    expect(events.map((event) => event.type)).toEqual(["speech.started", "speech.failed", "speech.started"])
    act(() => utterances.at(-1)?.onend?.())
    harness.unmount()
    vi.useRealTimers()
  })

  it("never replays a completed intent ID in one epoch and keeps public callbacks stable", () => {
    const { synthesis, utterances } = installSpeechSynthesis()
    const harness = renderHook({ epoch: 2, fleetId: "watchtide", taskCancellationVersion: 0 }, () => undefined)
    act(() => harness.current.setEnabled(true))
    const callbacks = {
      request: harness.current.request,
      setEnabled: harness.current.setEnabled,
      setClickOnly: harness.current.setClickOnly,
      setVolume: harness.current.setVolume,
      setRate: harness.current.setRate,
      mute: harness.current.mute,
      cancelTaskSpeech: harness.current.cancelTaskSpeech,
    }
    act(() => harness.current.request(welcome))
    act(() => utterances[0]?.onend?.())
    act(() => harness.current.request(welcome))
    expect(synthesis.speak).toHaveBeenCalledOnce()
    expect(harness.current.request).toBe(callbacks.request)
    expect(harness.current.setEnabled).toBe(callbacks.setEnabled)
    expect(harness.current.setClickOnly).toBe(callbacks.setClickOnly)
    expect(harness.current.setVolume).toBe(callbacks.setVolume)
    expect(harness.current.setRate).toBe(callbacks.setRate)
    expect(harness.current.mute).toBe(callbacks.mute)
    expect(harness.current.cancelTaskSpeech).toBe(callbacks.cancelTaskSpeech)
    harness.rerender({ epoch: 3, fleetId: "watchtide", taskCancellationVersion: 0 })
    act(() => harness.current.request(welcome))
    expect(synthesis.speak).toHaveBeenCalledTimes(2)
    harness.unmount()
  })
})
