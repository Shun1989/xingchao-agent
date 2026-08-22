import type { RuntimeContentCatalog } from "./runtime-catalog.ts"
import type { ContentPackManifest } from "./types.ts"

import { describe, expect, it } from "vitest"
import { originalFleetPack } from "./content-pack.ts"
import { buildRuntimeContentCatalog } from "./runtime-catalog.ts"
import { builtinRuntimeFleetSnapshot, indexRuntimeFleet, projectRuntimeFleetCatalog } from "./runtime-fleet.ts"

function installedPack(id: string, signal = "极光信号"): ContentPackManifest {
  const pack = structuredClone({ ...originalFleetPack, id, visibility: "private-local" as const })
  pack.crews[0]!.routingSignals = [signal, ...pack.crews[0]!.routingSignals]
  return pack
}

function oversizedCatalog(counts: { crews: number; agents: number; themes: number }): RuntimeContentCatalog {
  const catalog = buildRuntimeContentCatalog(originalFleetPack, [])
  return {
    ...catalog,
    crews: Array.from({ length: counts.crews }, (_, index) => ({
      ...structuredClone(catalog.crews[0]!),
      id: `crew-${index}`,
    })),
    agents: Array.from({ length: counts.agents }, (_, index) => ({
      ...structuredClone(catalog.agents[0]!),
      id: `agent-${index}`,
    })),
    themes: Array.from({ length: counts.themes }, (_, index) => ({
      ...structuredClone(catalog.themes[0]!),
      id: `theme-${index}`,
    })),
  }
}

describe("runtime fleet snapshot", () => {
  it("projects the exact renderer-safe whitelist with namespaced provenance", () => {
    const catalog = buildRuntimeContentCatalog(originalFleetPack, [installedPack("aurora-pack")])
    const encoded = JSON.parse(JSON.stringify(projectRuntimeFleetCatalog(catalog)))
    const crew = encoded.crews.find((candidate: { id: string }) => candidate.id === "aurora-pack--watchtide")
    const agent = encoded.agents.find((candidate: { id: string }) => candidate.id === "aurora-pack--wt-lingyue")
    const theme = encoded.themes.find((candidate: { id: string }) => candidate.id === "aurora-pack--watchtide")
    const source = encoded.sources.crews["aurora-pack--watchtide"]

    expect(Object.keys(encoded).sort()).toEqual(["agents", "crews", "revision", "sources", "themes"])
    expect(Object.keys(crew).sort()).toEqual([
      "captainId",
      "description",
      "domain",
      "id",
      "memberIds",
      "motto",
      "name",
      "routingSignals",
      "standardWorkflow",
      "supportSignals",
      "themeId",
    ])
    expect(Object.keys(agent).sort()).toEqual([
      "biography",
      "capabilities",
      "crewId",
      "deliverables",
      "id",
      "name",
      "role",
      "title",
      "visual",
    ])
    expect(Object.keys(agent.visual).sort()).toEqual(["accent", "silhouette"])
    expect(Object.keys(agent.capabilities[0]).sort()).toEqual(["id", "label", "level"])
    expect(Object.keys(theme).sort()).toEqual([
      "accent",
      "foreground",
      "highContrast",
      "id",
      "live2dOverlay",
      "motion",
      "name",
      "primary",
      "secondary",
      "soundCue",
      "surface",
      "texture",
    ])
    expect(Object.keys(theme.highContrast).sort()).toEqual(["background", "foreground", "primary"])
    expect(Object.keys(encoded.sources).sort()).toEqual(["agents", "crews", "themes"])
    expect(Object.keys(source).sort()).toEqual(["kind", "packId", "packVersion"])
    expect(source).toEqual({ kind: "installed", packId: "aurora-pack", packVersion: "1.0.0" })

    for (const field of [
      "allowedTools",
      "checksums",
      "delegatesTo",
      "evaluations",
      "installedPath",
      "localId",
      "persona",
      "prohibitedActions",
      "relationships",
      "voice",
    ]) {
      expect(JSON.stringify(encoded)).not.toContain(`"${field}"`)
    }
  })

  it("sorts the contributing pack revision", () => {
    const snapshot = projectRuntimeFleetCatalog(
      buildRuntimeContentCatalog(originalFleetPack, [installedPack("zulu-pack"), installedPack("alpha-pack")]),
    )

    expect(snapshot.revision).toBe("alpha-pack@1.0.0|xingchao-original-fleet@1.0.0|zulu-pack@1.0.0")
  })

  it("indexes snapshot entities and isolates agentsForCrew result arrays", () => {
    const index = indexRuntimeFleet(builtinRuntimeFleetSnapshot)
    const firstMembers = index.agentsForCrew("watchtide")

    expect(index.snapshot).toBe(builtinRuntimeFleetSnapshot)
    expect(index.crewById.get("watchtide")).toBe(builtinRuntimeFleetSnapshot.crews[0])
    expect(index.agentById.get("wt-lingyue")).toBe(builtinRuntimeFleetSnapshot.agents[0])
    expect(index.themeById.get("watchtide")).toBe(builtinRuntimeFleetSnapshot.themes[0])
    expect(firstMembers).toHaveLength(6)
    expect(index.agentsForCrew("watchtide")).not.toBe(firstMembers)

    firstMembers.pop()
    expect(index.agentsForCrew("watchtide")).toHaveLength(6)
  })

  it("rejects duplicate crew IDs", () => {
    const snapshot = structuredClone(builtinRuntimeFleetSnapshot)
    snapshot.crews[1]!.id = snapshot.crews[0]!.id
    expect(() => indexRuntimeFleet(snapshot)).toThrow(/duplicate.*crew/i)
  })

  it("rejects duplicate agent IDs", () => {
    const snapshot = structuredClone(builtinRuntimeFleetSnapshot)
    snapshot.agents[1]!.id = snapshot.agents[0]!.id
    expect(() => indexRuntimeFleet(snapshot)).toThrow(/duplicate.*agent/i)
  })

  it("rejects duplicate theme IDs", () => {
    const snapshot = structuredClone(builtinRuntimeFleetSnapshot)
    snapshot.themes[1]!.id = snapshot.themes[0]!.id
    expect(() => indexRuntimeFleet(snapshot)).toThrow(/duplicate.*theme/i)
  })

  it("rejects an agent that references a missing crew", () => {
    const snapshot = structuredClone(builtinRuntimeFleetSnapshot)
    snapshot.agents[0]!.crewId = "missing-crew"
    expect(() => indexRuntimeFleet(snapshot)).toThrow(/crew.*missing-crew/i)
  })

  it("rejects a crew with a missing captain", () => {
    const snapshot = structuredClone(builtinRuntimeFleetSnapshot)
    snapshot.crews[0]!.captainId = "missing-agent"
    expect(() => indexRuntimeFleet(snapshot)).toThrow(/captain.*missing-agent/i)
  })

  it("rejects a crew with a missing member", () => {
    const snapshot = structuredClone(builtinRuntimeFleetSnapshot)
    snapshot.crews[0]!.memberIds[0] = "missing-member"
    expect(() => indexRuntimeFleet(snapshot)).toThrow(/member.*missing-member/i)
  })

  it("rejects a crew roster with fewer than six members", () => {
    const snapshot = structuredClone(builtinRuntimeFleetSnapshot)
    snapshot.crews[0]!.memberIds.pop()

    expect(() => indexRuntimeFleet(snapshot)).toThrow(/six.*different|6.*different/i)
  })

  it("rejects six roster entries that do not identify six different agents", () => {
    const snapshot = structuredClone(builtinRuntimeFleetSnapshot)
    snapshot.crews[0]!.memberIds[1] = snapshot.crews[0]!.memberIds[0]!

    expect(() => indexRuntimeFleet(snapshot)).toThrow(/six.*different|6.*different/i)
  })

  it("rejects a same-crew captain who is absent from the authoritative roster", () => {
    const snapshot = structuredClone(builtinRuntimeFleetSnapshot)
    const crew = snapshot.crews[0]!
    const replacement = structuredClone(
      snapshot.agents.find((agent) => agent.crewId === crew.id && agent.role === "crew")!,
    )
    replacement.id = "extra-roster-member"
    snapshot.agents.push(replacement)
    crew.memberIds = crew.memberIds.map((memberId) => (memberId === crew.captainId ? replacement.id : memberId))

    expect(() => indexRuntimeFleet(snapshot)).toThrow(/captain.*roster|captain.*member/i)
  })

  it("rejects a captain assigned to another crew", () => {
    const snapshot = structuredClone(builtinRuntimeFleetSnapshot)
    const crew = snapshot.crews[0]!
    snapshot.agents.find((agent) => agent.id === crew.captainId)!.crewId = "ink-sail"

    expect(() => indexRuntimeFleet(snapshot)).toThrow(/captain.*belong|captain.*crew/i)
  })

  it("rejects a roster captain whose Agent role is not captain", () => {
    const snapshot = structuredClone(builtinRuntimeFleetSnapshot)
    const crew = snapshot.crews[0]!
    snapshot.agents.find((agent) => agent.id === crew.captainId)!.role = "crew"

    expect(() => indexRuntimeFleet(snapshot)).toThrow(/captain.*role/i)
  })

  it("rejects a roster member assigned to another crew", () => {
    const snapshot = structuredClone(builtinRuntimeFleetSnapshot)
    const crew = snapshot.crews[0]!
    const memberId = crew.memberIds.find((candidate) => candidate !== crew.captainId)!
    snapshot.agents.find((agent) => agent.id === memberId)!.crewId = "ink-sail"

    expect(() => indexRuntimeFleet(snapshot)).toThrow(/member.*belong|member.*crew/i)
  })

  it("returns only roster members in the crew's authoritative order", () => {
    const snapshot = structuredClone(builtinRuntimeFleetSnapshot)
    const crew = snapshot.crews[0]!
    crew.memberIds.reverse()
    const expectedMemberIds = [...crew.memberIds]
    const extraAgent = structuredClone(
      snapshot.agents.find((agent) => agent.crewId === crew.id && agent.role === "crew")!,
    )
    extraAgent.id = "extra-unlisted-agent"
    snapshot.agents.push(extraAgent)

    const index = indexRuntimeFleet(snapshot)

    expect(index.agentsForCrew(crew.id).map((agent) => agent.id)).toEqual(expectedMemberIds)
    expect(index.agentsForCrew(crew.id).map((agent) => agent.id)).not.toContain(extraAgent.id)
  })

  it("rejects a crew with a missing theme", () => {
    const snapshot = structuredClone(builtinRuntimeFleetSnapshot)
    snapshot.crews[0]!.themeId = "missing-theme"
    expect(() => indexRuntimeFleet(snapshot)).toThrow(/theme.*missing-theme/i)
  })

  it.each([
    [{ crews: 101, agents: 600, themes: 100 }, /100 crews/i],
    [{ crews: 100, agents: 601, themes: 100 }, /600 agents/i],
    [{ crews: 100, agents: 600, themes: 101 }, /100 themes/i],
  ] as const)("rejects a combined catalog above its published cap", (counts, message) => {
    expect(() => projectRuntimeFleetCatalog(oversizedCatalog(counts))).toThrow(message)
  })
})
