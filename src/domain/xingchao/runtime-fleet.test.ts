import type { ContentPackManifest } from "./types.ts"

import { describe, expect, it } from "vitest"
import { originalFleetPack } from "./content-pack.ts"
import { buildRuntimeContentCatalog, type RuntimeContentCatalog } from "./runtime-catalog.ts"
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
  it("projects a JSON-safe whitelist with namespaced provenance", () => {
    const catalog = buildRuntimeContentCatalog(originalFleetPack, [installedPack("aurora-pack")])
    const snapshot = projectRuntimeFleetCatalog(catalog)
    const encoded = JSON.parse(JSON.stringify(snapshot))

    expect(encoded.crews.some((crew: { id: string }) => crew.id === "aurora-pack--watchtide")).toBe(true)
    expect(encoded.sources.crews["aurora-pack--watchtide"]).toEqual({
      kind: "installed",
      packId: "aurora-pack",
      packVersion: "1.0.0",
    })
    expect(JSON.stringify(encoded)).not.toMatch(
      /checksums|allowedTools|evaluations|persona|voice|relationships|installedPath/i,
    )
  })

  it("rejects unresolved snapshot references", () => {
    const snapshot = structuredClone(builtinRuntimeFleetSnapshot)
    snapshot.crews[0]!.captainId = "missing-agent"
    expect(() => indexRuntimeFleet(snapshot)).toThrow(/captain.*missing-agent/i)
  })

  it("rejects duplicate IDs and unresolved crew, member, theme, and agent references", () => {
    const duplicateCrew = structuredClone(builtinRuntimeFleetSnapshot)
    duplicateCrew.crews[1]!.id = duplicateCrew.crews[0]!.id
    expect(() => indexRuntimeFleet(duplicateCrew)).toThrow(/duplicate.*crew/i)

    const missingCrew = structuredClone(builtinRuntimeFleetSnapshot)
    missingCrew.agents[0]!.crewId = "missing-crew"
    expect(() => indexRuntimeFleet(missingCrew)).toThrow(/crew.*missing-crew/i)

    const missingMember = structuredClone(builtinRuntimeFleetSnapshot)
    missingMember.crews[0]!.memberIds[0] = "missing-member"
    expect(() => indexRuntimeFleet(missingMember)).toThrow(/member.*missing-member/i)

    const missingTheme = structuredClone(builtinRuntimeFleetSnapshot)
    missingTheme.crews[0]!.themeId = "missing-theme"
    expect(() => indexRuntimeFleet(missingTheme)).toThrow(/theme.*missing-theme/i)
  })

  it.each([
    [{ crews: 101, agents: 600, themes: 100 }, /100 crews/i],
    [{ crews: 100, agents: 601, themes: 100 }, /600 agents/i],
    [{ crews: 100, agents: 600, themes: 101 }, /100 themes/i],
  ] as const)("rejects a combined catalog above its published cap", (counts, message) => {
    expect(() => projectRuntimeFleetCatalog(oversizedCatalog(counts))).toThrow(message)
  })
})
