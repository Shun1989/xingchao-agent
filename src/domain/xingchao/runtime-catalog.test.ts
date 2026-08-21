import type { ContentPackManifest, CrewId } from "./types.ts"

import { describe, expect, it } from "vitest"
import { originalFleetPack } from "./content-pack.ts"
import { buildRuntimeContentCatalog } from "./runtime-catalog.ts"

function installedPack(id: string, version = "1.0.0"): ContentPackManifest {
  return structuredClone({
    ...originalFleetPack,
    id,
    version,
    visibility: "private-local" as const,
  })
}

describe("runtime content catalog", () => {
  it("namespaces every imported entity and internal reference", () => {
    const catalog = buildRuntimeContentCatalog(originalFleetPack, [installedPack("aurora-pack")])
    const crew = catalog.crews.find((candidate) => candidate.id === "aurora-pack--watchtide")
    const captain = catalog.agents.find((candidate) => candidate.id === "aurora-pack--wt-lingyue")

    expect(crew).toMatchObject({
      captainId: "aurora-pack--wt-lingyue",
      id: "aurora-pack--watchtide",
      memberIds: [
        "aurora-pack--wt-lingyue",
        "aurora-pack--wt-shenyan",
        "aurora-pack--wt-jilan",
        "aurora-pack--wt-wenxian",
        "aurora-pack--wt-baisu",
        "aurora-pack--wt-xuxingheng",
      ],
      theme: { id: "aurora-pack--watchtide" },
    })
    expect(captain).toMatchObject({
      crewId: "aurora-pack--watchtide",
      delegatesTo: [
        "aurora-pack--wt-shenyan",
        "aurora-pack--wt-jilan",
        "aurora-pack--wt-wenxian",
        "aurora-pack--wt-baisu",
        "aurora-pack--wt-xuxingheng",
      ],
      relationships: [{ agentId: "aurora-pack--wt-shenyan" }, { agentId: "aurora-pack--wt-jilan" }],
    })
    expect(catalog.themes.some((theme) => theme.id === "aurora-pack--watchtide")).toBe(true)
  })

  it("keeps built-in IDs stable and records entity provenance", () => {
    const catalog = buildRuntimeContentCatalog(originalFleetPack, [installedPack("aurora-pack")])

    expect(catalog.crews.some((crew) => crew.id === "watchtide")).toBe(true)
    expect(catalog.agents.some((agent) => agent.id === "wt-lingyue")).toBe(true)
    expect(catalog.sources.crews.get("watchtide")).toEqual({
      kind: "builtin",
      localId: "watchtide",
      packId: "xingchao-original-fleet",
      packVersion: "1.0.0",
    })
    expect(catalog.sources.agents.get("aurora-pack--wt-lingyue")).toEqual({
      kind: "installed",
      localId: "wt-lingyue",
      packId: "aurora-pack",
      packVersion: "1.0.0",
    })
  })

  it("does not mutate source manifests while building the catalog", () => {
    const imported = installedPack("aurora-pack")
    const before = structuredClone(imported)

    buildRuntimeContentCatalog(originalFleetPack, [imported])

    expect(imported).toEqual(before)
  })

  it("rejects selecting multiple versions of the same installed pack", () => {
    expect(() =>
      buildRuntimeContentCatalog(originalFleetPack, [
        installedPack("aurora-pack", "1.0.0"),
        installedPack("aurora-pack", "2.0.0"),
      ]),
    ).toThrow(/multiple versions.*aurora-pack/i)
  })

  it("isolates identical local IDs across different installed packs", () => {
    const catalog = buildRuntimeContentCatalog(originalFleetPack, [
      installedPack("aurora-pack"),
      installedPack("harbor-pack"),
    ])

    expect(catalog.crews.some((crew) => crew.id === "aurora-pack--watchtide")).toBe(true)
    expect(catalog.crews.some((crew) => crew.id === "harbor-pack--watchtide")).toBe(true)
  })

  it("rejects ambiguous namespace combinations instead of overwriting provenance", () => {
    const first = installedPack("aurora-pack")
    const originalCrewId = first.crews[0]!.id
    const ambiguousCrewId = "harbor--watchtide" as CrewId
    first.crews[0]!.id = ambiguousCrewId
    first.crews[0]!.theme.id = ambiguousCrewId
    first.agents.filter((agent) => agent.crewId === originalCrewId).forEach((agent) => (agent.crewId = ambiguousCrewId))

    expect(() => buildRuntimeContentCatalog(originalFleetPack, [first, installedPack("aurora-pack--harbor")])).toThrow(
      /runtime crew ID collision.*aurora-pack--harbor--watchtide/i,
    )
  })
})
