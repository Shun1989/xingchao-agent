import { storageKey } from "../../electron/branding.ts"

export const CAPTAIN_VOICE_CATEGORIES = Object.freeze([
  "welcome",
  "confirmation",
  "completion",
  "risk",
  "manual",
] as const)
export type CaptainVoiceCategory = (typeof CAPTAIN_VOICE_CATEGORIES)[number]

export const CAPTAIN_SPEECH_MESSAGE_KEYS = Object.freeze([
  "captain.voice.welcome",
  "captain.voice.confirmation",
  "captain.voice.completion",
  "captain.voice.risk",
  "captain.voice.manual",
] as const)
export type CaptainSpeechMessageKey = (typeof CAPTAIN_SPEECH_MESSAGE_KEYS)[number]
export type CaptainSpeechParam = number | boolean
export type CaptainSpeechParams = Readonly<Record<string, CaptainSpeechParam>>

export interface CaptainSpeechIntent {
  readonly id: string
  readonly category: CaptainVoiceCategory
  readonly messageKey: CaptainSpeechMessageKey
  readonly params: CaptainSpeechParams
}

export interface CaptainVoiceSettings {
  readonly enabled: boolean
  readonly clickOnly: boolean
  readonly volume: number
  readonly rate: number
}

export type CaptainVoiceFailure = "unavailable" | "synthesis-error" | "event-sequence-exhausted"

export interface CaptainVoiceState {
  readonly settings: CaptainVoiceSettings
  readonly caption: CaptainSpeechIntent | null
  readonly current: CaptainSpeechIntent | null
  readonly queue: readonly CaptainSpeechIntent[]
  readonly lastFailure: CaptainVoiceFailure | null
}

export type CaptainVoiceAction =
  | { readonly type: "request"; readonly intent: unknown }
  | { readonly type: "caption_only"; readonly intent: unknown }
  | { readonly type: "set_enabled"; readonly enabled: boolean }
  | { readonly type: "set_click_only"; readonly clickOnly: boolean }
  | { readonly type: "set_volume"; readonly volume: number }
  | { readonly type: "set_rate"; readonly rate: number }
  | { readonly type: "start_next" }
  | { readonly type: "finish_current"; readonly failure?: CaptainVoiceFailure }
  | { readonly type: "clear_speech" }
  | { readonly type: "mute" }

export const captainVoiceStorageKey = storageKey("captainVoice")
export const DEFAULT_CAPTAIN_VOICE_SETTINGS: CaptainVoiceSettings = Object.freeze({
  enabled: false,
  clickOnly: false,
  volume: 0.85,
  rate: 1,
})

const CATEGORY_SET = new Set<CaptainVoiceCategory>(CAPTAIN_VOICE_CATEGORIES)
const MESSAGE_KEY_SET = new Set<CaptainSpeechMessageKey>(CAPTAIN_SPEECH_MESSAGE_KEYS)
const MESSAGE_KEY_BY_CATEGORY: Readonly<Record<CaptainVoiceCategory, CaptainSpeechMessageKey>> = Object.freeze({
  welcome: "captain.voice.welcome",
  confirmation: "captain.voice.confirmation",
  completion: "captain.voice.completion",
  risk: "captain.voice.risk",
  manual: "captain.voice.manual",
})
const INTENT_FIELDS = new Set(["id", "category", "messageKey", "params"])
const MAX_QUEUED_SPEECH_INTENTS = 32
const SENSITIVE_PARAM_NAME = /chat|tool|credential|private|file|text|prompt|message|input|output|secret|token|path/iu

function clampFinite(value: unknown, minimum: number, maximum: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback
}

export function clampCaptainVoiceVolume(value: unknown): number {
  return clampFinite(value, 0, 1, DEFAULT_CAPTAIN_VOICE_SETTINGS.volume)
}

export function clampCaptainVoiceRate(value: unknown): number {
  return clampFinite(value, 0.5, 2, DEFAULT_CAPTAIN_VOICE_SETTINGS.rate)
}

function frozenSettings(value: CaptainVoiceSettings): CaptainVoiceSettings {
  return Object.freeze({
    enabled: value.enabled,
    clickOnly: value.clickOnly,
    volume: clampCaptainVoiceVolume(value.volume),
    rate: clampCaptainVoiceRate(value.rate),
  })
}

function parseCaptainVoiceSettings(value: unknown): CaptainVoiceSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return DEFAULT_CAPTAIN_VOICE_SETTINGS
  const candidate = value as Record<string, unknown>
  const keys = Object.keys(candidate)
  if (
    keys.length !== 4 ||
    !Object.hasOwn(candidate, "enabled") ||
    !Object.hasOwn(candidate, "clickOnly") ||
    !Object.hasOwn(candidate, "volume") ||
    !Object.hasOwn(candidate, "rate") ||
    typeof candidate.enabled !== "boolean" ||
    typeof candidate.clickOnly !== "boolean" ||
    typeof candidate.volume !== "number" ||
    !Number.isFinite(candidate.volume) ||
    typeof candidate.rate !== "number" ||
    !Number.isFinite(candidate.rate)
  ) {
    return DEFAULT_CAPTAIN_VOICE_SETTINGS
  }
  return frozenSettings({
    enabled: candidate.enabled,
    clickOnly: candidate.clickOnly,
    volume: clampCaptainVoiceVolume(candidate.volume),
    rate: clampCaptainVoiceRate(candidate.rate),
  })
}

export function serializeCaptainVoiceSettings(settings: CaptainVoiceSettings): string {
  const safe = parseCaptainVoiceSettings(settings)
  return JSON.stringify({ enabled: safe.enabled, clickOnly: safe.clickOnly, volume: safe.volume, rate: safe.rate })
}

export function loadCaptainVoiceSettings(storage?: Pick<Storage, "getItem">): CaptainVoiceSettings {
  try {
    const raw = (storage ?? globalThis.localStorage)?.getItem(captainVoiceStorageKey)
    if (raw === undefined || raw === null) return DEFAULT_CAPTAIN_VOICE_SETTINGS
    return parseCaptainVoiceSettings(JSON.parse(raw) as unknown)
  } catch {
    return DEFAULT_CAPTAIN_VOICE_SETTINGS
  }
}

export function persistCaptainVoiceSettings(
  settings: CaptainVoiceSettings,
  storage?: Pick<Storage, "setItem">,
): boolean {
  try {
    const target = storage ?? globalThis.localStorage
    target?.setItem(captainVoiceStorageKey, serializeCaptainVoiceSettings(settings))
    return target !== undefined
  } catch {
    return false
  }
}

function isSafeIntentId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/u.test(value)
}

function sanitizeParams(value: unknown): CaptainSpeechParams | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const safe: Record<string, CaptainSpeechParam> = Object.create(null) as Record<string, CaptainSpeechParam>
  for (const [key, parameter] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(key) || SENSITIVE_PARAM_NAME.test(key)) return null
    if (typeof parameter === "boolean") {
      safe[key] = parameter
      continue
    }
    if (typeof parameter !== "number" || !Number.isFinite(parameter)) return null
    safe[key] = parameter
  }
  return Object.freeze(safe)
}

/** Reconstructs the closed semantic envelope; caller-provided prose and payload fields are rejected. */
export function sanitizeCaptainSpeechIntent(value: unknown): CaptainSpeechIntent | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (Object.keys(candidate).some((key) => !INTENT_FIELDS.has(key))) return null
  if (!isSafeIntentId(candidate.id)) return null
  if (typeof candidate.category !== "string" || !CATEGORY_SET.has(candidate.category as CaptainVoiceCategory))
    return null
  if (
    typeof candidate.messageKey !== "string" ||
    !MESSAGE_KEY_SET.has(candidate.messageKey as CaptainSpeechMessageKey)
  ) {
    return null
  }
  const category = candidate.category as CaptainVoiceCategory
  const messageKey = candidate.messageKey as CaptainSpeechMessageKey
  if (MESSAGE_KEY_BY_CATEGORY[category] !== messageKey) return null
  const params = sanitizeParams(candidate.params)
  if (params === null) return null
  return Object.freeze({ id: candidate.id, category, messageKey, params })
}

export function createCaptainVoiceState(
  settings: CaptainVoiceSettings = DEFAULT_CAPTAIN_VOICE_SETTINGS,
): CaptainVoiceState {
  return Object.freeze({
    settings: parseCaptainVoiceSettings(settings),
    caption: null,
    current: null,
    queue: Object.freeze([]),
    lastFailure: null,
  })
}

function freezeState(state: CaptainVoiceState): CaptainVoiceState {
  return Object.freeze({ ...state, queue: Object.freeze([...state.queue]) })
}

function withSettings(state: CaptainVoiceState, settings: CaptainVoiceSettings): CaptainVoiceState {
  return freezeState({ ...state, settings: frozenSettings(settings) })
}

export function captainVoiceReducer(state: CaptainVoiceState, action: CaptainVoiceAction): CaptainVoiceState {
  switch (action.type) {
    case "caption_only": {
      const intent = sanitizeCaptainSpeechIntent(action.intent)
      return intent === null ? state : freezeState({ ...state, caption: intent })
    }
    case "request": {
      const intent = sanitizeCaptainSpeechIntent(action.intent)
      if (intent === null) return state
      const captioned = { ...state, caption: intent }
      if (!state.settings.enabled) return freezeState(captioned)
      if (state.settings.clickOnly && intent.category !== "manual") return freezeState(captioned)
      if (state.current?.id === intent.id || state.queue.some((queued) => queued.id === intent.id)) {
        return freezeState(captioned)
      }
      if (state.queue.length >= MAX_QUEUED_SPEECH_INTENTS) return freezeState(captioned)
      return freezeState({ ...captioned, queue: [...state.queue, intent], lastFailure: null })
    }
    case "set_enabled":
      return action.enabled
        ? withSettings(state, { ...state.settings, enabled: true })
        : captainVoiceReducer(state, { type: "mute" })
    case "set_click_only": {
      const next = withSettings(state, { ...state.settings, clickOnly: action.clickOnly })
      if (!action.clickOnly) return next
      return freezeState({
        ...next,
        current: next.current?.category === "manual" ? next.current : null,
        queue: next.queue.filter((intent) => intent.category === "manual"),
      })
    }
    case "set_volume":
      return withSettings(state, { ...state.settings, volume: clampCaptainVoiceVolume(action.volume) })
    case "set_rate":
      return withSettings(state, { ...state.settings, rate: clampCaptainVoiceRate(action.rate) })
    case "start_next": {
      if (state.current !== null || state.queue.length === 0) return state
      return freezeState({ ...state, current: state.queue[0] ?? null, queue: state.queue.slice(1) })
    }
    case "finish_current":
      return freezeState({ ...state, current: null, lastFailure: action.failure ?? null })
    case "clear_speech":
      return freezeState({ ...state, current: null, queue: [] })
    case "mute":
      return freezeState({
        ...state,
        settings: frozenSettings({ ...state.settings, enabled: false }),
        current: null,
        queue: [],
      })
  }
}
