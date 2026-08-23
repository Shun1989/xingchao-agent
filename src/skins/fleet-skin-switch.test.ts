import type { FleetSkinSwitchEvent, FleetSkinSwitchState } from "./fleet-skin-switch.ts"

import { describe, expect, it } from "vitest"
import {
  beginFleetSkinSwitch,
  committedCrewId,
  createFleetSkinSwitchState,
  fleetSkinSwitchReducer,
} from "./fleet-skin-switch.ts"

type RequestEvent = ReturnType<typeof beginFleetSkinSwitch>

function request(crewId: string, generation: number): RequestEvent {
  return beginFleetSkinSwitch(crewId, generation)
}

function reduce(state: FleetSkinSwitchState, ...events: FleetSkinSwitchEvent[]): FleetSkinSwitchState {
  return events.reduce(fleetSkinSwitchReducer, state)
}

function settleOptional(state: FleetSkinSwitchState, event: RequestEvent): FleetSkinSwitchState {
  return event.optional.reduce(
    (current, resourceId) =>
      fleetSkinSwitchReducer(current, {
        type: "asset.ready",
        generation: event.generation,
        assetId: resourceId,
        required: false,
      }),
    state,
  )
}

function settleRequired(state: FleetSkinSwitchState, event: RequestEvent): FleetSkinSwitchState {
  return event.required.reduce(
    (current, resourceId) =>
      fleetSkinSwitchReducer(current, {
        type: "asset.ready",
        generation: event.generation,
        assetId: resourceId,
        required: true,
      }),
    state,
  )
}

describe("fleet skin atomic switch reducer", () => {
  it("commits the complete manifest exactly once after every required resource settles", () => {
    const event = request("ink-sail", 1)
    let state = reduce(createFleetSkinSwitchState("watchtide"), event)

    for (const resourceId of event.required.slice(0, -1)) {
      state = reduce(state, {
        type: "asset.ready",
        generation: event.generation,
        assetId: resourceId,
        required: true,
      })
      expect(state.committedCrewId).toBe("watchtide")
      expect(state.effect?.type).not.toBe("persist-crew")
    }

    state = reduce(state, {
      type: "asset.ready",
      generation: event.generation,
      assetId: event.required.at(-1)!,
      required: true,
    })
    expect(state.committedCrewId).toBe("ink-sail")
    expect(state.committedManifest.identity.crewId).toBe("ink-sail")
    expect(state.pending).toBeNull()
    expect(state.phase).toBe("committed")
    expect(state.degradedOptional).toEqual(["ink-sail.scene.foreground"])
    expect(state.effect).toEqual({ type: "persist-crew", crewId: "ink-sail" })

    const committed = state
    state = reduce(state, {
      type: "asset.ready",
      generation: event.generation,
      assetId: event.required.at(-1)!,
      required: true,
    })
    expect(state).toBe(committed)
  })

  it("rolls back the complete transaction when one required asset fails", () => {
    const event = request("ink-sail", 2)
    const loading = reduce(createFleetSkinSwitchState("watchtide"), event)
    const failed = reduce(loading, {
      type: "asset.failed",
      generation: 2,
      assetId: "ink-sail.captain.base",
      required: true,
    })

    expect(failed.committedCrewId).toBe("watchtide")
    expect(failed.committedManifest.identity.crewId).toBe("watchtide")
    expect(failed.pending).toBeNull()
    expect(failed.phase).toBe("error")
    expect(failed.effect).toEqual({ type: "report-error", code: "required-asset-failed" })
  })

  it("ignores every event from a stale generation, including failures", () => {
    const older = request("ink-sail", 3)
    const current = request("brocade-harbor", 4)
    const loading = reduce(createFleetSkinSwitchState("watchtide"), older, current)
    const beforeStaleEvents = loading

    const afterStaleEvents = reduce(
      loading,
      ...older.required.map(
        (assetId): FleetSkinSwitchEvent => ({
          type: "asset.ready",
          generation: older.generation,
          assetId,
          required: true,
        }),
      ),
      {
        type: "asset.failed",
        generation: older.generation,
        assetId: older.optional[0],
        required: false,
      },
    )

    expect(afterStaleEvents).toBe(beforeStaleEvents)
    expect(afterStaleEvents.pending?.crewId).toBe("brocade-harbor")
    expect(afterStaleEvents.committedCrewId).toBe("watchtide")
  })

  it("commits when the optional foreground fails and records the degradation", () => {
    const event = request("ink-sail", 5)
    let state = reduce(createFleetSkinSwitchState("watchtide"), event)
    state = reduce(state, {
      type: "asset.failed",
      generation: event.generation,
      assetId: event.optional[0],
      required: false,
    })
    state = settleRequired(state, event)

    expect(state.committedCrewId).toBe("ink-sail")
    expect(state.phase).toBe("committed")
    expect(state.degradedOptional).toEqual(["ink-sail.scene.foreground"])
    expect(state.effect).toEqual({ type: "persist-crew", crewId: "ink-sail" })
  })

  it("emits persistence only after commit, never while loading or after rollback", () => {
    const event = request("ink-sail", 6)
    let state = reduce(createFleetSkinSwitchState("watchtide"), event)
    expect(state.effect?.type).toBe("preload-resources")

    state = settleOptional(state, event)
    state = reduce(state, {
      type: "asset.ready",
      generation: event.generation,
      assetId: event.required[0],
      required: true,
    })
    expect(state.effect?.type).not.toBe("persist-crew")

    state = reduce(state, {
      type: "asset.failed",
      generation: event.generation,
      assetId: event.required[1],
      required: true,
    })
    expect(state.committedCrewId).toBe("watchtide")
    expect(state.effect?.type).toBe("report-error")
  })

  it.each([undefined, null, "", "watchtide-copy", "aurora-pack--watchtide", 42, {}])(
    "recovers an invalid stored crew ID to watchtide: %o",
    (storedValue) => {
      expect(committedCrewId(storedValue)).toBe("watchtide")
      expect(createFleetSkinSwitchState(storedValue).committedManifest.identity.crewId).toBe("watchtide")
    },
  )

  it("retains an exact valid stored built-in crew ID", () => {
    expect(committedCrewId("phantom-wave")).toBe("phantom-wave")
    expect(createFleetSkinSwitchState("phantom-wave").committedCrewId).toBe("phantom-wave")
  })

  it("models each distinct manifest font as a required local readiness checkpoint", () => {
    const event = request("forge-vessel", 7)
    const fontResources = event.required.filter((resourceId) => resourceId.startsWith("font:"))

    expect(fontResources.length).toBeGreaterThan(0)
    expect(new Set(event.required).size).toBe(event.required.length)
    expect(event.required).toContain("forge-vessel.scene.backdrop")
    expect(event.required).toContain("forge-vessel.captain.base")
    expect(event.required).toContain("forge-vessel.captain.uniform")
    expect(event.required).toContain("forge-vessel.captain.static")
    expect(event.required).toContain("forge-vessel.crest")
    expect(event.optional).toEqual(["forge-vessel.scene.foreground"])
  })

  it("treats repeated resource events as idempotent and rejects unknown or misclassified events", () => {
    const event = request("ink-sail", 8)
    let state = reduce(createFleetSkinSwitchState("watchtide"), event)
    const ready = {
      type: "asset.ready",
      generation: event.generation,
      assetId: event.required[0],
      required: true,
    } as const satisfies FleetSkinSwitchEvent

    state = reduce(state, ready)
    const afterFirst = state
    expect(reduce(state, ready)).toBe(afterFirst)
    expect(
      reduce(state, {
        type: "asset.ready",
        generation: event.generation,
        assetId: "watchtide.scene.backdrop",
        required: true,
      }),
    ).toBe(afterFirst)
    expect(
      reduce(state, {
        type: "asset.failed",
        generation: event.generation,
        assetId: event.optional[0],
        required: true,
      }),
    ).toBe(afterFirst)
  })

  it("clears only the currently emitted effect so a stale acknowledgement cannot erase a newer command", () => {
    const first = request("ink-sail", 9)
    const initial = createFleetSkinSwitchState("watchtide")
    const firstLoading = reduce(initial, first)
    const staleEffectVersion = firstLoading.effectVersion
    const secondLoading = reduce(firstLoading, request("brocade-harbor", 10))

    expect(secondLoading.effectVersion).toBeGreaterThan(staleEffectVersion)
    expect(
      reduce(secondLoading, {
        type: "effect.consumed",
        version: staleEffectVersion,
      }),
    ).toBe(secondLoading)

    const consumed = reduce(secondLoading, {
      type: "effect.consumed",
      version: secondLoading.effectVersion,
    })
    expect(consumed.effect).toBeNull()
    expect(consumed.effectVersion).toBe(secondLoading.effectVersion)
  })

  it("preserves an unconsumed commit persistence command across a newer request and its failure", () => {
    const first = request("ink-sail", 20)
    let state = settleRequired(reduce(createFleetSkinSwitchState("watchtide"), first), first)
    const persistVersion = state.effectVersion
    expect(state.effect).toEqual({ type: "persist-crew", crewId: "ink-sail" })

    const second = request("brocade-harbor", 21)
    state = reduce(state, second)
    expect(state.pending?.crewId).toBe("brocade-harbor")
    expect(state.pending?.preloadIssued).toBe(false)
    expect(state.effect).toEqual({ type: "persist-crew", crewId: "ink-sail" })
    expect(state.effectVersion).toBe(persistVersion)

    state = reduce(state, {
      type: "asset.failed",
      generation: second.generation,
      assetId: second.required[0],
      required: true,
    })
    expect(state.committedCrewId).toBe("ink-sail")
    expect(state.pending).toBeNull()
    expect(state.error).toBe("required-asset-failed")
    expect(state.effect).toEqual({ type: "persist-crew", crewId: "ink-sail" })

    state = reduce(state, { type: "effect.consumed", version: persistVersion })
    expect(state.effect).toEqual({ type: "report-error", code: "required-asset-failed" })
    expect(state.effectVersion).toBeGreaterThan(persistVersion)
  })

  it("delays the latest pending preload until an older persistence command is consumed", () => {
    const first = request("ink-sail", 22)
    let state = settleRequired(reduce(createFleetSkinSwitchState("watchtide"), first), first)
    const persistVersion = state.effectVersion

    state = reduce(state, request("brocade-harbor", 23), request("forge-vessel", 24))
    expect(state.pending?.crewId).toBe("forge-vessel")
    expect(state.pending?.preloadIssued).toBe(false)
    expect(state.effect).toEqual({ type: "persist-crew", crewId: "ink-sail" })
    expect(reduce(state, request("forge-vessel", 24))).toBe(state)

    state = reduce(state, { type: "effect.consumed", version: persistVersion })
    expect(state.pending?.crewId).toBe("forge-vessel")
    expect(state.pending?.preloadIssued).toBe(true)
    expect(state.effect).toMatchObject({ type: "preload-resources", generation: 24 })
  })

  it("replaces an older unconsumed persistence command with the latest committed crew", () => {
    const first = request("ink-sail", 25)
    let state = settleRequired(reduce(createFleetSkinSwitchState("watchtide"), first), first)
    const second = request("brocade-harbor", 26)

    state = reduce(state, second)
    state = settleRequired(state, second)

    expect(state.committedCrewId).toBe("brocade-harbor")
    expect(state.effect).toEqual({ type: "persist-crew", crewId: "brocade-harbor" })
  })

  it("freezes public transaction state and keeps pending/effect resource arrays independent", () => {
    const event = request("ink-sail", 27)
    const loading = reduce(createFleetSkinSwitchState("watchtide"), event)
    const preload = loading.effect

    expect(Object.isFrozen(event)).toBe(true)
    expect(Object.isFrozen(event.required)).toBe(true)
    expect(Object.isFrozen(event.optional)).toBe(true)
    expect(Object.isFrozen(loading)).toBe(true)
    expect(Object.isFrozen(loading.pending)).toBe(true)
    expect(Object.isFrozen(loading.pending?.required)).toBe(true)
    expect(Object.isFrozen(loading.pending?.optional)).toBe(true)
    expect(Object.isFrozen(loading.pending?.ready)).toBe(true)
    expect(Object.isFrozen(loading.pending?.failedOptional)).toBe(true)
    expect(Object.isFrozen(preload)).toBe(true)
    expect(Object.isFrozen(loading.degradedOptional)).toBe(true)
    expect(preload?.type).toBe("preload-resources")
    if (preload?.type !== "preload-resources" || loading.pending === null) throw new Error("Expected preload state")
    expect(Object.isFrozen(preload.required)).toBe(true)
    expect(Object.isFrozen(preload.optional)).toBe(true)
    expect(preload.required).not.toBe(loading.pending.required)
    expect(preload.optional).not.toBe(loading.pending.optional)

    expect(() => (loading.pending!.required as unknown as string[]).pop()).toThrow(TypeError)
    expect(() => (preload.required as unknown as string[]).pop()).toThrow(TypeError)
    expect(() => (loading.pending!.ready as unknown as string[]).pop()).toThrow(TypeError)
    expect(() => (loading.pending!.failedOptional as unknown as string[]).pop()).toThrow(TypeError)
    expect(loading.pending.required).toHaveLength(event.required.length)
    expect(preload.required).toHaveLength(event.required.length)
  })

  it("freezes every new resource snapshot without mutating prior snapshots", () => {
    const event = request("ink-sail", 28)
    const loading = reduce(createFleetSkinSwitchState("watchtide"), event)
    const firstReady = reduce(loading, {
      type: "asset.ready",
      generation: event.generation,
      assetId: event.required[0],
      required: true,
    })
    const optionalFailed = reduce(firstReady, {
      type: "asset.failed",
      generation: event.generation,
      assetId: event.optional[0],
      required: false,
    })

    expect(loading.pending?.ready).toEqual([])
    expect(firstReady.pending?.ready).toEqual([event.required[0]])
    expect(Object.isFrozen(firstReady)).toBe(true)
    expect(Object.isFrozen(firstReady.pending)).toBe(true)
    expect(Object.isFrozen(firstReady.pending?.ready)).toBe(true)
    expect(Object.isFrozen(optionalFailed)).toBe(true)
    expect(Object.isFrozen(optionalFailed.pending?.failedOptional)).toBe(true)
    expect(() => (optionalFailed.pending!.failedOptional as unknown as string[]).pop()).toThrow(TypeError)
  })

  it("rejects duplicate, regressive, non-integer, and unknown crew requests", () => {
    const state = reduce(createFleetSkinSwitchState("watchtide"), request("ink-sail", 11))
    expect(reduce(state, request("brocade-harbor", 11))).toBe(state)
    expect(reduce(state, request("brocade-harbor", 10))).toBe(state)

    const invalidGeneration = {
      ...request("brocade-harbor", 12),
      generation: 12.5,
    } satisfies RequestEvent
    expect(reduce(state, invalidGeneration)).toBe(state)

    const unknown = beginFleetSkinSwitch("not-a-built-in-crew", 12)
    const rejected = reduce(state, unknown)
    expect(rejected.committedCrewId).toBe("watchtide")
    expect(rejected.pending).toBeNull()
    expect(rejected.error).toBe("unknown-crew")
    expect(rejected.effect).toEqual({ type: "report-error", code: "unknown-crew" })
  })
})
