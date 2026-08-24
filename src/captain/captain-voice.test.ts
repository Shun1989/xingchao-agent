// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest"
import { storageKey } from "../../electron/branding.ts"
import {
  CAPTAIN_SPEECH_MESSAGE_KEYS,
  CAPTAIN_VOICE_CATEGORIES,
  captainVoiceReducer,
  captainVoiceStorageKey,
  createCaptainVoiceState,
  loadCaptainVoiceSettings,
  sanitizeCaptainSpeechIntent,
  serializeCaptainVoiceSettings,
} from "./captain-voice.ts"

const welcome = {
  id: "welcome-1",
  category: "welcome",
  messageKey: "captain.voice.welcome",
  params: { returning: true },
} as const

describe("captain voice policy", () => {
  beforeEach(() => localStorage.clear())

  it("is silent by default and keeps a safe caption without queueing speech", () => {
    const initial = createCaptainVoiceState()
    expect(initial.settings).toEqual({ enabled: false, clickOnly: false, volume: 0.85, rate: 1 })

    const next = captainVoiceReducer(initial, { type: "request", intent: welcome })
    expect(next.caption).toEqual(welcome)
    expect(next.queue).toEqual([])
    expect(next.current).toBeNull()
  })

  it("queues automatic critical events only after explicit enable and manual speech in click-only mode", () => {
    let state = createCaptainVoiceState()
    state = captainVoiceReducer(state, { type: "set_enabled", enabled: true })
    state = captainVoiceReducer(state, { type: "request", intent: welcome })
    expect(state.queue).toEqual([welcome])

    state = captainVoiceReducer(state, { type: "set_click_only", clickOnly: true })
    state = captainVoiceReducer(state, {
      type: "request",
      intent: { id: "done-1", category: "completion", messageKey: "captain.voice.completion", params: {} },
    })
    expect(state.queue).toEqual([])

    const manual = { id: "manual-1", category: "manual", messageKey: "captain.voice.manual", params: {} } as const
    state = captainVoiceReducer(state, { type: "request", intent: manual })
    expect(state.queue).toEqual([manual])
    expect(state.caption).toEqual(manual)
  })

  it("exposes exactly the approved categories and catalogued message IDs", () => {
    expect(CAPTAIN_VOICE_CATEGORIES).toEqual(["welcome", "confirmation", "completion", "risk", "manual"])
    expect(CAPTAIN_SPEECH_MESSAGE_KEYS).toEqual([
      "captain.voice.welcome",
      "captain.voice.confirmation",
      "captain.voice.completion",
      "captain.voice.risk",
      "captain.voice.manual",
    ])
  })

  it("rejects category/key mismatches, arbitrary text, sensitive fields, and unsafe params", () => {
    expect(sanitizeCaptainSpeechIntent({ ...welcome, messageKey: "captain.voice.manual" })).toBeNull()
    expect(sanitizeCaptainSpeechIntent({ ...welcome, text: "read my chat" })).toBeNull()
    expect(sanitizeCaptainSpeechIntent({ ...welcome, credential: "secret" })).toBeNull()
    expect(sanitizeCaptainSpeechIntent({ ...welcome, params: { rawToolOutput: "secret" } })).toBeNull()
    expect(sanitizeCaptainSpeechIntent({ ...welcome, params: { privateFile: true } })).toBeNull()
    expect(sanitizeCaptainSpeechIntent({ ...welcome, params: { rawChat: 1 } })).toBeNull()
    expect(sanitizeCaptainSpeechIntent({ ...welcome, params: { count: Number.POSITIVE_INFINITY } })).toBeNull()
    expect(sanitizeCaptainSpeechIntent({ ...welcome, params: { "../file": 1 } })).toBeNull()
    expect(sanitizeCaptainSpeechIntent(welcome)).toEqual(welcome)
  })

  it("mutes atomically and clears current plus queued speech while preserving the caption", () => {
    let state = captainVoiceReducer(createCaptainVoiceState(), { type: "set_enabled", enabled: true })
    state = captainVoiceReducer(state, { type: "request", intent: welcome })
    state = captainVoiceReducer(state, { type: "start_next" })
    state = captainVoiceReducer(state, {
      type: "request",
      intent: { id: "risk-1", category: "risk", messageKey: "captain.voice.risk", params: {} },
    })
    expect(state.current?.id).toBe("welcome-1")
    expect(state.queue).toHaveLength(1)

    state = captainVoiceReducer(state, { type: "mute" })
    expect(state.settings.enabled).toBe(false)
    expect(state.current).toBeNull()
    expect(state.queue).toEqual([])
    expect(state.caption?.id).toBe("risk-1")
  })

  it("clamps persisted volume/rate, fails closed, and persists only the four settings", () => {
    expect(captainVoiceStorageKey).toBe(storageKey("captainVoice"))
    localStorage.setItem(
      captainVoiceStorageKey,
      JSON.stringify({ enabled: true, clickOnly: true, volume: 7, rate: -4, credential: "must-not-survive" }),
    )
    expect(loadCaptainVoiceSettings()).toEqual({ enabled: false, clickOnly: false, volume: 0.85, rate: 1 })

    localStorage.setItem(
      captainVoiceStorageKey,
      JSON.stringify({ enabled: true, clickOnly: true, volume: 7, rate: -4 }),
    )
    expect(loadCaptainVoiceSettings()).toEqual({ enabled: true, clickOnly: true, volume: 1, rate: 0.5 })

    expect(serializeCaptainVoiceSettings({ enabled: true, clickOnly: false, volume: -1, rate: 99 } as never)).toBe(
      JSON.stringify({ enabled: true, clickOnly: false, volume: 0, rate: 2 }),
    )

    localStorage.setItem(captainVoiceStorageKey, "not-json")
    expect(loadCaptainVoiceSettings()).toEqual({ enabled: false, clickOnly: false, volume: 0.85, rate: 1 })
    localStorage.setItem(
      captainVoiceStorageKey,
      JSON.stringify({ enabled: "true", clickOnly: 1, volume: "1", rate: null }),
    )
    expect(loadCaptainVoiceSettings()).toEqual({ enabled: false, clickOnly: false, volume: 0.85, rate: 1 })
    localStorage.setItem(captainVoiceStorageKey, JSON.stringify({ enabled: true, clickOnly: false, volume: 1 }))
    expect(loadCaptainVoiceSettings()).toEqual({ enabled: false, clickOnly: false, volume: 0.85, rate: 1 })
  })
})
