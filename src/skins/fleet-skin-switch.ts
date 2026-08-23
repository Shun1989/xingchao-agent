import type { BuiltinCrewId, CrewId } from "../domain/xingchao/types.ts"
import type { FleetSkinAssetId, FleetSkinFontFamily } from "./fleet-skin-schema.ts"
import type { ReadonlyFleetSkinManifest } from "./fleet-skins.ts"

import { isBuiltinFleetSkinId, resolveFleetSkin } from "./fleet-skins.ts"

export type FleetSkinFontResourceId = `font:${FleetSkinFontFamily}`
export type FleetSkinResourceId = FleetSkinAssetId | FleetSkinFontResourceId

export type FleetSkinSwitchError = "invalid-resource-set" | "required-asset-failed" | "unknown-crew"

export type FleetSkinSwitchEffect =
  | {
      type: "preload-resources"
      generation: number
      required: readonly FleetSkinResourceId[]
      optional: readonly FleetSkinAssetId[]
    }
  | { type: "persist-crew"; crewId: BuiltinCrewId }
  | { type: "report-error"; code: FleetSkinSwitchError }

export interface FleetSkinSwitchPending {
  crewId: BuiltinCrewId
  manifest: ReadonlyFleetSkinManifest
  generation: number
  required: readonly FleetSkinResourceId[]
  optional: readonly FleetSkinAssetId[]
  ready: readonly FleetSkinResourceId[]
  failedOptional: readonly FleetSkinAssetId[]
  preloadIssued: boolean
}

export interface FleetSkinSwitchState {
  committedCrewId: BuiltinCrewId
  committedManifest: ReadonlyFleetSkinManifest
  pending: FleetSkinSwitchPending | null
  phase: "idle" | "loading" | "committed" | "error"
  error: FleetSkinSwitchError | null
  effect: FleetSkinSwitchEffect | null
  /**
   * A consumer must acknowledge the observed version with `effect.consumed`.
   * Acknowledging an older version never clears a newer command.
   */
  effectVersion: number
  /** Highest accepted request generation, including a rejected unknown crew. */
  generation: number
  degradedOptional: readonly FleetSkinAssetId[]
}

export interface FleetSkinSwitchRequestEvent {
  type: "request"
  crewId: CrewId
  generation: number
  required: readonly FleetSkinResourceId[]
  optional?: readonly FleetSkinAssetId[]
}

export interface PreparedFleetSkinSwitchRequestEvent extends FleetSkinSwitchRequestEvent {
  optional: readonly FleetSkinAssetId[]
}

export type FleetSkinSwitchEvent =
  | FleetSkinSwitchRequestEvent
  | {
      type: "asset.ready"
      generation: number
      assetId: string
      required: boolean
    }
  | {
      type: "asset.failed"
      generation: number
      assetId: string
      required: boolean
    }
  | { type: "effect.consumed"; version: number }

function localFontResourceId(family: FleetSkinFontFamily): FleetSkinFontResourceId {
  return `font:${family}`
}

function canonicalRequiredResources(manifest: ReadonlyFleetSkinManifest): readonly FleetSkinResourceId[] {
  const assets = [
    manifest.scene.backdrop,
    ...manifest.captain.layers,
    manifest.captain.staticFallback,
    manifest.identity.crest,
  ]
  const fonts = [
    manifest.typography.heading.family,
    manifest.typography.body.family,
    manifest.typography.numeric.family,
    manifest.typography.label.family,
  ].map(localFontResourceId)
  return [...new Set<FleetSkinResourceId>([...assets, ...fonts])]
}

function canonicalOptionalResources(manifest: ReadonlyFleetSkinManifest): readonly FleetSkinAssetId[] {
  return [manifest.scene.foreground]
}

function hasExactUniqueMembers<T extends string>(actual: readonly T[], expected: readonly T[]): boolean {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length) return false
  const expectedSet = new Set<string>(expected)
  return actual.every((value) => expectedSet.has(value))
}

function frozenArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values])
}

function isFrozenPending(pending: FleetSkinSwitchPending): boolean {
  return (
    Object.isFrozen(pending) &&
    Object.isFrozen(pending.required) &&
    Object.isFrozen(pending.optional) &&
    Object.isFrozen(pending.ready) &&
    Object.isFrozen(pending.failedOptional)
  )
}

function freezePending(pending: FleetSkinSwitchPending): FleetSkinSwitchPending {
  if (isFrozenPending(pending)) return pending
  return Object.freeze({
    ...pending,
    required: frozenArray(pending.required),
    optional: frozenArray(pending.optional),
    ready: frozenArray(pending.ready),
    failedOptional: frozenArray(pending.failedOptional),
  })
}

function freezeEffect(effect: FleetSkinSwitchEffect): FleetSkinSwitchEffect {
  if (effect.type !== "preload-resources") return Object.isFrozen(effect) ? effect : Object.freeze({ ...effect })
  if (Object.isFrozen(effect) && Object.isFrozen(effect.required) && Object.isFrozen(effect.optional)) return effect
  return Object.freeze({
    ...effect,
    required: frozenArray(effect.required),
    optional: frozenArray(effect.optional),
  })
}

function freezeState(state: FleetSkinSwitchState): FleetSkinSwitchState {
  if (
    Object.isFrozen(state) &&
    (state.pending === null || isFrozenPending(state.pending)) &&
    (state.effect === null ||
      (Object.isFrozen(state.effect) &&
        (state.effect.type !== "preload-resources" ||
          (Object.isFrozen(state.effect.required) && Object.isFrozen(state.effect.optional))))) &&
    Object.isFrozen(state.degradedOptional)
  ) {
    return state
  }
  return Object.freeze({
    ...state,
    pending: state.pending === null ? null : freezePending(state.pending),
    effect: state.effect === null ? null : freezeEffect(state.effect),
    degradedOptional: frozenArray(state.degradedOptional),
  })
}

function withEffect(state: FleetSkinSwitchState, effect: FleetSkinSwitchEffect): FleetSkinSwitchState {
  return freezeState({
    ...state,
    effect: freezeEffect(effect),
    effectVersion: state.effectVersion + 1,
  })
}

function hasUnconsumedPersistence(state: FleetSkinSwitchState): boolean {
  return state.effect?.type === "persist-crew"
}

function preservePersistenceOrEmit(
  state: FleetSkinSwitchState,
  nextState: FleetSkinSwitchState,
  effect: FleetSkinSwitchEffect,
): FleetSkinSwitchState {
  return hasUnconsumedPersistence(state) ? freezeState(nextState) : withEffect(nextState, effect)
}

function reportRequestError(
  state: FleetSkinSwitchState,
  generation: number,
  error: Exclude<FleetSkinSwitchError, "required-asset-failed">,
): FleetSkinSwitchState {
  const nextState = {
    ...state,
    pending: null,
    phase: "error" as const,
    error,
    generation,
  }
  return preservePersistenceOrEmit(state, nextState, { type: "report-error", code: error })
}

function commitIfSettled(state: FleetSkinSwitchState): FleetSkinSwitchState {
  const pending = state.pending
  if (pending === null) return state

  const ready = new Set<string>(pending.ready)
  if (!pending.required.every((resourceId) => ready.has(resourceId))) return state

  const degradedOptional = pending.optional.filter((resourceId) => !ready.has(resourceId))

  return withEffect(
    {
      ...state,
      committedCrewId: pending.crewId,
      committedManifest: pending.manifest,
      pending: null,
      phase: "committed",
      error: null,
      degradedOptional,
    },
    { type: "persist-crew", crewId: pending.crewId },
  )
}

function requestSwitch(state: FleetSkinSwitchState, event: FleetSkinSwitchRequestEvent): FleetSkinSwitchState {
  if (!Number.isSafeInteger(event.generation) || event.generation <= state.generation) return state

  const manifest = resolveFleetSkin(event.crewId)
  if (manifest === null) return reportRequestError(state, event.generation, "unknown-crew")

  const required = canonicalRequiredResources(manifest)
  const optional = canonicalOptionalResources(manifest)
  if (
    !hasExactUniqueMembers(event.required, required) ||
    (event.optional !== undefined && !hasExactUniqueMembers(event.optional, optional))
  ) {
    return reportRequestError(state, event.generation, "invalid-resource-set")
  }

  const pending: FleetSkinSwitchPending = {
    crewId: manifest.identity.crewId,
    manifest,
    generation: event.generation,
    required,
    optional,
    ready: [],
    failedOptional: [],
    preloadIssued: !hasUnconsumedPersistence(state),
  }
  const nextState = {
    ...state,
    pending,
    phase: "loading" as const,
    error: null,
    generation: event.generation,
  }
  return preservePersistenceOrEmit(state, nextState, {
    type: "preload-resources",
    generation: event.generation,
    required,
    optional,
  })
}

function resourceEvent(
  state: FleetSkinSwitchState,
  event: Extract<FleetSkinSwitchEvent, { type: "asset.ready" | "asset.failed" }>,
): FleetSkinSwitchState {
  const pending = state.pending
  if (pending === null || event.generation !== pending.generation) return state

  const required = new Set<string>(pending.required)
  const optional = new Set<string>(pending.optional)
  const inRequired = required.has(event.assetId)
  const inOptional = optional.has(event.assetId)
  if ((!inRequired && !inOptional) || event.required !== inRequired) return state

  const ready = new Set<string>(pending.ready)
  const failedOptional = new Set<string>(pending.failedOptional)
  if (ready.has(event.assetId) || failedOptional.has(event.assetId)) return state

  if (event.type === "asset.failed" && inRequired) {
    const nextState = {
      ...state,
      pending: null,
      phase: "error" as const,
      error: "required-asset-failed" as const,
    }
    return preservePersistenceOrEmit(state, nextState, { type: "report-error", code: "required-asset-failed" })
  }

  const nextPending: FleetSkinSwitchPending =
    event.type === "asset.ready"
      ? { ...pending, ready: [...pending.ready, event.assetId as FleetSkinResourceId] }
      : { ...pending, failedOptional: [...pending.failedOptional, event.assetId as FleetSkinAssetId] }

  return commitIfSettled(freezeState({ ...state, pending: nextPending }))
}

export function committedCrewId(storedValue: unknown): BuiltinCrewId {
  return typeof storedValue === "string" && isBuiltinFleetSkinId(storedValue) ? storedValue : "watchtide"
}

export function createFleetSkinSwitchState(storedValue?: unknown): FleetSkinSwitchState {
  const crewId = committedCrewId(storedValue)
  const manifest = resolveFleetSkin(crewId)
  if (manifest === null) throw new Error("Built-in watchtide fleet skin is unavailable")
  return freezeState({
    committedCrewId: crewId,
    committedManifest: manifest,
    pending: null,
    phase: "idle",
    error: null,
    effect: null,
    effectVersion: 0,
    generation: 0,
    degradedOptional: [],
  })
}

export function beginFleetSkinSwitch(crewId: CrewId, generation: number): PreparedFleetSkinSwitchRequestEvent {
  const manifest = resolveFleetSkin(crewId)
  return Object.freeze({
    type: "request",
    crewId,
    generation,
    required: frozenArray(manifest === null ? [] : canonicalRequiredResources(manifest)),
    optional: frozenArray(manifest === null ? [] : canonicalOptionalResources(manifest)),
  })
}

export function fleetSkinSwitchReducer(state: FleetSkinSwitchState, event: FleetSkinSwitchEvent): FleetSkinSwitchState {
  switch (event.type) {
    case "request":
      return requestSwitch(state, event)
    case "asset.ready":
    case "asset.failed":
      return resourceEvent(state, event)
    case "effect.consumed":
      if (event.version !== state.effectVersion || state.effect === null) return state
      if (state.effect.type === "persist-crew" && state.pending !== null && !state.pending.preloadIssued) {
        const pending = freezePending({ ...state.pending, preloadIssued: true })
        return withEffect(
          { ...state, pending },
          {
            type: "preload-resources",
            generation: pending.generation,
            required: pending.required,
            optional: pending.optional,
          },
        )
      }
      if (state.effect.type === "persist-crew" && state.error !== null) {
        return withEffect(state, { type: "report-error", code: state.error })
      }
      return freezeState({ ...state, effect: null })
  }
}
